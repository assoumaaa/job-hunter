"""Extract structured job info from a posting URL.

Strategy
--------
1.  LinkedIn `/jobs/view/<id>` URLs:
    use LinkedIn's public guest endpoint
    `/jobs-guest/jobs/api/jobPosting/<id>` which serves the posting as a
    standalone HTML fragment without auth.
2.  Anything else: fetched directly with a browser-like User-Agent.

In every case the HTML is stripped of scripts/styles and shipped to Claude
Haiku to produce a structured `{title, company, location, description}`
payload.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx

from . import llm

logger = logging.getLogger(__name__)

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0 Safari/537.36"
)

MAX_HTML_CHARS = 60_000  # cap what we ship to Claude


@dataclass
class ExtractedJob:
    title: str
    company: str
    description: str
    location: str | None = None
    source: str = "manual"
    url: str | None = None


# ---------------------------------------------------------------------------
# URL handling
# ---------------------------------------------------------------------------

_LINKEDIN_JOB_ID = re.compile(r"/jobs(?:/view)?/(?:[^/]*-)?(\d{6,})")


def _linkedin_job_id(url: str) -> str | None:
    """Pull the numeric job id out of any LinkedIn job URL variant."""
    parsed = urlparse(url)
    if "linkedin.com" not in parsed.netloc:
        return None
    m = _LINKEDIN_JOB_ID.search(parsed.path)
    if m:
        return m.group(1)
    # Older /jobs-guest URLs put the id directly in the path
    parts = [p for p in parsed.path.split("/") if p.isdigit() and len(p) >= 6]
    return parts[0] if parts else None


def normalize_job_url(url: str) -> str:
    """Strip query params and trailing slash, collapse linkedin subdomains.

    The canonical form used for dedup across fetched / manually-added jobs.
    """
    u = (url or "").split("?")[0].rstrip("/")
    parsed = urlparse(u)
    if "linkedin.com" in parsed.netloc:
        u = f"https://linkedin.com{parsed.path}"
    return u


def _detect_source(url: str) -> str:
    host = urlparse(url).netloc.lower()
    if "linkedin.com" in host:
        return "linkedin"
    if "indeed." in host:
        return "indeed"
    if "wellfound.com" in host or "angel.co" in host:
        return "wellfound"
    return "other"


# ---------------------------------------------------------------------------
# Page fetching
# ---------------------------------------------------------------------------


def _fetch(url: str) -> str:
    headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    with httpx.Client(timeout=20.0, follow_redirects=True, headers=headers) as client:
        resp = client.get(url)
        resp.raise_for_status()
        return resp.text


def _fetch_linkedin_posting(job_id: str) -> str:
    return _fetch(f"https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{job_id}")


# ---------------------------------------------------------------------------
# HTML cleanup
# ---------------------------------------------------------------------------

_SCRIPT_STYLE = re.compile(
    r"<(script|style|noscript|svg)\b[^>]*>.*?</\1>", re.DOTALL | re.IGNORECASE
)
_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"[ \t]+")
_BLANK_LINES = re.compile(r"\n{3,}")


def _clean_html(html: str) -> str:
    text = _SCRIPT_STYLE.sub(" ", html)
    # Drop common boilerplate sections that confuse Claude — head, footer, nav
    text = re.sub(r"<head\b.*?</head>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<footer\b.*?</footer>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<nav\b.*?</nav>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    # Replace block tags with newlines for readability
    text = re.sub(r"</(p|div|li|h[1-6]|br|tr)>", "\n", text, flags=re.IGNORECASE)
    text = _TAG.sub(" ", text)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&").replace("&#39;", "'")
    text = text.replace("&quot;", '"').replace("&lt;", "<").replace("&gt;", ">")
    text = _WS.sub(" ", text)
    text = "\n".join(line.strip() for line in text.splitlines())
    text = _BLANK_LINES.sub("\n\n", text).strip()
    return text[:MAX_HTML_CHARS]


# ---------------------------------------------------------------------------
# Claude extraction
# ---------------------------------------------------------------------------

EXTRACT_PROMPT = """You are extracting a job posting from raw page text.

Return ONLY a JSON object with this exact shape:
{
  "title": "string — the job title",
  "company": "string — the hiring company name",
  "location": "string — primary location, or empty string",
  "description": "string — the full job description preserving paragraphs and bullets"
}

Rules:
- If a field is genuinely missing, use an empty string.
- The description must be the substantive role description (responsibilities,
  requirements, benefits). Strip cookie banners, marketing footers, login
  prompts, related-job lists, and apply-tracking text.
- Preserve line breaks in description (\\n).
- No commentary, no markdown fences, no extra fields.

RAW TEXT:
"""


def _extract_with_claude(text: str) -> dict:
    return llm.complete_json(
        model=llm.screening_model(),
        max_tokens=2048,
        messages=[{"role": "user", "content": EXTRACT_PROMPT + text}],
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def extract_from_url(url: str) -> ExtractedJob:
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    source = _detect_source(url)
    canonical = url

    if source == "linkedin":
        job_id = _linkedin_job_id(url)
        if job_id:
            html = _fetch_linkedin_posting(job_id)
            canonical = f"https://www.linkedin.com/jobs/view/{job_id}"
        else:
            html = _fetch(url)
    else:
        html = _fetch(url)

    text = _clean_html(html)
    if not text:
        raise ValueError("Could not extract any text from the page.")

    data = _extract_with_claude(text)
    if not data.get("title") or not data.get("company") or not data.get("description"):
        raise ValueError(
            "Could not extract a complete job posting from this URL. "
            "Try pasting the description manually."
        )

    return ExtractedJob(
        title=data["title"].strip(),
        company=data["company"].strip(),
        location=(data.get("location") or "").strip() or None,
        description=data["description"].strip(),
        source=source,
        url=canonical,
    )

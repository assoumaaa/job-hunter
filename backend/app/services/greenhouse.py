"""
Greenhouse job board API fetcher.

Greenhouse exposes a free, public, no-auth JSON API for any company that uses it:
  https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true

Returns structured job data including title, location, and full description HTML.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List, Optional

import httpx

# Default list of popular Greenhouse companies.
# Users can add/remove via the tracked_companies setting.
DEFAULT_COMPANIES = [
    {"name": "Anthropic", "slug": "anthropic"},
    {"name": "Vercel", "slug": "vercel"},
    {"name": "Airtable", "slug": "airtable"},
    {"name": "Temporal", "slug": "temporal"},
    {"name": "Arize AI", "slug": "arizeai"},
    {"name": "Glean", "slug": "gleanwork"},
    {"name": "RunPod", "slug": "runpod"},
    {"name": "PolyAI", "slug": "polyai"},
    {"name": "Parloa", "slug": "parloa"},
    {"name": "Intercom", "slug": "intercom"},
    {"name": "Hume AI", "slug": "humeai"},
    {"name": "Speechmatics", "slug": "speechmatics"},
    {"name": "Celonis", "slug": "celonis"},
    {"name": "Contentful", "slug": "contentful"},
    {"name": "N26", "slug": "n26"},
    {"name": "Trade Republic", "slug": "traderepublicbank"},
    {"name": "SumUp", "slug": "sumup"},
    {"name": "Stability AI", "slug": "stabilityai"},
    {"name": "Wayve", "slug": "wayve"},
    {"name": "Helsing", "slug": "helsing"},
    {"name": "Black Forest Labs", "slug": "blackforestlabs"},
    {"name": "Factorial", "slug": "factorial"},
    {"name": "Amplemarket", "slug": "amplemarket"},
    {"name": "GetYourGuide", "slug": "getyourguide"},
    {"name": "HelloFresh", "slug": "hellofresh"},
    {"name": "Isomorphic Labs", "slug": "isomorphiclabs"},
    {"name": "PhysicsX", "slug": "physicsx"},
    {"name": "Scandit", "slug": "scandit"},
]

API_BASE = "https://boards-api.greenhouse.io/v1/boards"

# Country code → location keywords that appear in Greenhouse location strings
# "Remote" is always accepted if the user has any preferred locations
COUNTRY_LOCATION_KEYWORDS = {
    "AE": ["united arab emirates", "uae", "dubai", "abu dhabi"],
    "AU": ["australia", "sydney", "melbourne"],
    "CA": ["canada", "toronto", "vancouver", "montreal"],
    "DE": ["germany", "berlin", "munich", "hamburg", "frankfurt", "düsseldorf", "cologne"],
    "FR": ["france", "paris", "lyon"],
    "GB": ["united kingdom", "uk", "london", "manchester", "cambridge", "edinburgh"],
    "NL": ["netherlands", "amsterdam", "rotterdam"],
    "SG": ["singapore"],
    "US": ["united states", "usa", "new york", "san francisco", "seattle", "austin", "chicago", "boston", "los angeles", "remote"],
    "MA": ["morocco", "casablanca", "rabat"],
    "TN": ["tunisia", "tunis"],
    "DZ": ["algeria", "algiers"],
    "EG": ["egypt", "cairo"],
    "IE": ["ireland", "dublin"],
    "ES": ["spain", "barcelona", "madrid"],
    "IT": ["italy", "milan", "rome"],
    "SE": ["sweden", "stockholm"],
    "CH": ["switzerland", "zurich", "geneva", "lausanne"],
    "AT": ["austria", "vienna"],
    "PT": ["portugal", "lisbon"],
    "PL": ["poland", "warsaw", "krakow"],
    "TR": ["turkey", "istanbul", "ankara"],
}


@dataclass
class GreenhouseJob:
    title: str
    company: str
    location: str
    description: str
    url: str
    job_type: Optional[str] = None


def _strip_html(html_str: str) -> str:
    """Strip HTML tags to get plain text description."""
    if not html_str:
        return ""
    text = re.sub(r"<br\s*/?>", "\n", html_str)
    text = re.sub(r"<li>", "\n- ", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&#\d+;", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _matches_title_filter(
    title: str,
    positive_keywords: List[str],
    negative_keywords: List[str],
) -> bool:
    """Check if a job title matches the user's keyword filters."""
    title_lower = title.lower()

    # If no positive keywords, accept everything
    if positive_keywords:
        has_positive = any(kw.lower() in title_lower for kw in positive_keywords)
        if not has_positive:
            return False

    # Reject if any negative keyword matches
    if negative_keywords:
        has_negative = any(kw.lower() in title_lower for kw in negative_keywords)
        if has_negative:
            return False

    return True


def _matches_location(
    location: str,
    preferred_country_codes: List[str],
) -> bool:
    """Check if a job location matches any of the user's preferred countries.

    Always accepts "Remote" jobs. If no preferred locations, accepts everything.
    """
    if not preferred_country_codes:
        return True

    loc_lower = location.lower()

    # Always accept remote jobs
    if "remote" in loc_lower:
        return True

    # Check each preferred country's keywords
    for code in preferred_country_codes:
        keywords = COUNTRY_LOCATION_KEYWORDS.get(code.upper(), [])
        if any(kw in loc_lower for kw in keywords):
            return True

    return False


def fetch_greenhouse_jobs(
    companies: List[dict] = None,
    positive_keywords: List[str] = None,
    negative_keywords: List[str] = None,
    preferred_locations: List[str] = None,
) -> List[GreenhouseJob]:
    """Fetch jobs from Greenhouse API for given companies.

    Args:
        companies: List of {"name": "...", "slug": "..."} dicts.
                   Defaults to DEFAULT_COMPANIES if not provided.
        positive_keywords: Job title must contain at least one (from user's positions).
        negative_keywords: Job title must not contain any of these.
        preferred_locations: Country codes (e.g. ["AE", "DE", "GB"]) to filter by location.

    Returns:
        List of GreenhouseJob objects.
    """
    if companies is None:
        companies = DEFAULT_COMPANIES

    positive = positive_keywords or []
    negative = negative_keywords or []
    locations = preferred_locations or []

    all_jobs: List[GreenhouseJob] = []

    with httpx.Client(timeout=15.0) as client:
        for company in companies:
            slug = company.get("slug", "")
            name = company.get("name", slug)
            if not slug:
                continue

            try:
                resp = client.get(
                    f"{API_BASE}/{slug}/jobs",
                    params={"content": "true"},
                )
                if resp.status_code != 200:
                    continue

                data = resp.json()
                jobs = data.get("jobs", [])

                for job in jobs:
                    title = job.get("title", "")

                    # Apply title filter
                    if not _matches_title_filter(title, positive, negative):
                        continue

                    # Extract location
                    location = job.get("location", {}).get("name", "")

                    # Apply location filter
                    if not _matches_location(location, locations):
                        continue

                    # Extract description (HTML -> plain text)
                    content = job.get("content", "")
                    description = _strip_html(content)

                    # Build the apply URL
                    job_id = job.get("id", "")
                    absolute_url = job.get("absolute_url", "")
                    url = absolute_url or f"https://boards.greenhouse.io/{slug}/jobs/{job_id}"

                    all_jobs.append(
                        GreenhouseJob(
                            title=title,
                            company=name,
                            location=location,
                            description=description,
                            url=url,
                        )
                    )

            except (httpx.RequestError, Exception):
                continue

    return all_jobs

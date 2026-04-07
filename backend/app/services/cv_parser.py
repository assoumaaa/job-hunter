"""
CV parser: extracts structured data from PDF uploads or raw text.

Uses pymupdf to extract text from PDF, then Claude to parse into structured JSON.
"""

from __future__ import annotations

import json
import re
from typing import Optional

import anthropic
import pymupdf

from ..core.config import settings

client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

# Same model as generation — quality matters for one-shot parsing
PARSER_MODEL = "claude-haiku-4-5-20251001"

CV_SCHEMA = """{
  "header": {
    "name": "string",
    "email": "string",
    "phone": "string or null",
    "location": "string or null",
    "linkedin": "string or null (full URL)",
    "github": "string or null (full URL)",
    "portfolio": "string or null (full URL)"
  },
  "summary": "string (professional summary paragraph, or empty string if none)",
  "competencies": ["string (keyword phrases)"],
  "experience": [
    {
      "company": "string",
      "title": "string (job title)",
      "location": "string or null",
      "period": "string (e.g. 'Jan 2022 - Present')",
      "bullets": ["string (achievement/responsibility)"]
    }
  ],
  "projects": [
    {
      "name": "string",
      "badge": "string or null (e.g. 'Open Source', 'SaaS')",
      "description": "string",
      "tech": "string or null (tech stack)"
    }
  ],
  "education": [
    {
      "degree": "string",
      "institution": "string",
      "year": "string",
      "description": "string or null"
    }
  ],
  "certifications": [
    {
      "title": "string",
      "org": "string",
      "year": "string or null"
    }
  ],
  "skills": [
    {
      "category": "string (e.g. 'Languages', 'Frameworks', 'Tools')",
      "items": ["string"]
    }
  ],
  "languages": [
    {
      "name": "string (e.g. 'English')",
      "level": "string or null (e.g. 'Fluent', 'Native', 'Conversational')"
    }
  ]
}"""

PARSE_PROMPT = f"""Parse the following CV/resume text into structured JSON.

RULES:
- Extract ALL information present in the text. Do not invent anything.
- If a section is not present (e.g. no certifications), use an empty array.
- Preserve the original wording of bullet points — do not rephrase.
- For experience, list jobs in the order they appear (usually reverse chronological).
- For skills, group into logical categories (Languages, Frameworks, Tools, Cloud, etc.).
- If the CV has a professional summary at the top, extract it. Otherwise leave summary as empty string.
- Competencies should be key skill phrases — extract from a "Core Competencies" section if present, otherwise leave as empty array.
- LinkedIn/GitHub/portfolio URLs: extract the full URL if present.

OUTPUT: Return ONLY valid JSON matching this schema (no markdown fences, no explanation):
{CV_SCHEMA}"""


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text from a PDF file using pymupdf."""
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    pages = []
    for page in doc:
        pages.append(page.get_text())
    doc.close()
    return "\n\n".join(pages)


def parse_cv_text(text: str) -> dict:
    """Use Claude to parse raw CV text into structured JSON."""
    response = client.messages.create(
        model=PARSER_MODEL,
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": f"{PARSE_PROMPT}\n\n---\n\nCV TEXT:\n{text}",
            }
        ],
    )

    raw = response.content[0].text.strip() if response.content[0].type == "text" else "{}"

    # Strip markdown fences if present
    raw = re.sub(r"^```(?:json)?\n?", "", raw, flags=re.IGNORECASE)
    raw = raw.rstrip("`").strip()

    # Try to extract JSON object if there's extra text
    if not raw.startswith("{"):
        match = re.search(r"\{[\s\S]*\}", raw)
        if match:
            raw = match.group(0)

    return json.loads(raw)


def parse_pdf(pdf_bytes: bytes) -> dict:
    """Extract text from PDF and parse into structured CV data."""
    text = extract_text_from_pdf(pdf_bytes)
    return parse_cv_text(text)

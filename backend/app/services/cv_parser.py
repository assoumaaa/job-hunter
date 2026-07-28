"""
CV parser: extracts structured data from PDF uploads or raw text.

Uses pymupdf to extract text from PDF, then Claude to parse into structured JSON.
"""

from __future__ import annotations

import json
import re

import pymupdf

from . import llm, resume

# The résumé shape is owned by the `resume` module — one definition for parse,
# generate, and render.
CV_SCHEMA = resume.SCHEMA_JSON

PARSE_PROMPT = f"""Parse the following CV/resume text into structured JSON.

RULES:
- Extract ALL information present in the text. Do not invent anything.
- If a section is not present (e.g. no certifications), use an empty array.
- Preserve the original wording of bullet points — do not rephrase.
- For experience, list jobs in the order they appear (usually reverse chronological).
- For skills, group into logical categories (Languages, Frameworks, Tools, Cloud, etc.).
- If the CV has a professional summary at the top, extract it. Otherwise leave summary as empty string.
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
    """Use the model to parse raw CV text into structured JSON."""
    raw = llm.complete_text(
        model=llm.SCREENING_MODEL,
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": f"{PARSE_PROMPT}\n\n---\n\nCV TEXT:\n{text}",
            }
        ],
    )

    raw = llm.strip_fences(raw) or "{}"
    # Try to extract JSON object if there's extra text
    if not raw.startswith("{"):
        match = re.search(r"\{[\s\S]*\}", raw)
        if match:
            raw = match.group(0)

    # Normalize into the canonical résumé shape so parse output can't drift
    # from what generation and rendering expect.
    return resume.normalize(json.loads(raw))


def parse_pdf(pdf_bytes: bytes) -> dict:
    """Extract text from PDF and parse into structured CV data."""
    text = extract_text_from_pdf(pdf_bytes)
    return parse_cv_text(text)

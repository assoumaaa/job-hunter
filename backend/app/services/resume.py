"""The Résumé document — the one shape every stage agrees on.

Parsing (PDF -> structured), generation (tailored sections), and rendering
(structured -> PDF) used to each carry their own idea of a CV's shape. They now
cross this single definition instead, so they cannot drift:

- `SCHEMA_JSON` is the shape shown to the model in the parse prompt.
- `Resume` is the typed, tolerant in-process value.
- `normalize()` returns a complete canonical dict (every section present) —
  what renderers and scorers read instead of guessing with `.get()`.
- `merge_identity()` is the one home for grafting factual identity (header +
  languages) from the base CV onto freshly generated sections.

The model is deliberately tolerant (`extra="allow"`, every field optional): it
normalizes and completes data, it does not reject a CV for having an extra key.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, ValidationError

# The canonical résumé schema — the single string both the parse prompt and any
# schema-aware caller reference. Keep this and `Resume` in step.
SCHEMA_JSON = """{
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


class Header(BaseModel):
    model_config = ConfigDict(extra="allow")

    name: str = ""
    email: str = ""
    phone: str | None = None
    location: str | None = None
    linkedin: str | None = None
    github: str | None = None
    portfolio: str | None = None


class Resume(BaseModel):
    model_config = ConfigDict(extra="allow")

    header: Header = Field(default_factory=Header)
    summary: str = ""
    experience: list[dict] = Field(default_factory=list)
    projects: list[dict] = Field(default_factory=list)
    education: list[dict] = Field(default_factory=list)
    certifications: list[dict] = Field(default_factory=list)
    skills: list[dict] = Field(default_factory=list)
    languages: list[dict] = Field(default_factory=list)


def parse(raw: dict | None) -> Resume:
    """Validate `raw` into a Resume, filling missing sections with defaults."""
    return Resume.model_validate(raw or {})


def normalize(raw: dict | None) -> dict:
    """Return a complete, canonical CV dict — every section present, unknown
    keys preserved. Falls back to the input unchanged if it can't be validated,
    so no stage ever breaks on a surprising shape.
    """
    try:
        return parse(raw).model_dump()
    except ValidationError:
        return dict(raw or {})


def merge_identity(generated: dict, base: dict) -> dict:
    """Graft factual identity (header + languages) from the base CV onto freshly
    generated sections.

    Generation tailors the prose; identity is copied, never invented — so the
    generation schema omits these two sections and this is where they rejoin the
    document. Previously inline in the generate route.
    """
    merged = dict(generated or {})
    base = base or {}
    merged["header"] = base.get("header", {})
    merged["languages"] = base.get("languages", [])
    return merged

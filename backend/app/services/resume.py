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
    """Graft the factual half of the CV from the base document onto freshly
    generated prose.

    Generation writes judgement — the summary, the skills grouping, and each
    role's bullets (plus its title, which the archetype rule may rewrite).
    Everything else is fact: copied verbatim here and omitted from the
    generation schema, so a model slip can't abbreviate a degree, reword a
    date range, drop a job, or reorder the history.
    """
    merged = dict(generated or {})
    base = base or {}

    merged["header"] = base.get("header", {})
    merged["languages"] = base.get("languages", [])
    merged["education"] = base.get("education", [])
    merged["certifications"] = base.get("certifications", [])

    # The base CV fixes the job list, its order, and each role's facts;
    # generation only supplies the bullets and the (possibly retitled) role.
    generated_roles = generated.get("experience") or []
    merged["experience"] = [
        {
            **base_role,
            "title": generated_role.get("title") or base_role.get("title", ""),
            "bullets": generated_role.get("bullets")
            or base_role.get("bullets", []),
        }
        for base_role, generated_role in (
            (role, generated_roles[i] if i < len(generated_roles) else {})
            for i, role in enumerate(base.get("experience") or [])
        )
    ]
    return merged

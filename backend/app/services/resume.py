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

import datetime as _dt
import re

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from . import vocabulary

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
      "alternateTitles": ["string (other titles equally true of this role, e.g. a consultant title for an engineer who also did pre-sales; usually empty)"],
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


def _without_spoken_languages(skills: list, languages: list) -> list:
    """Drop skill items that merely repeat a spoken language.

    Languages are rendered in their own section, with the level the base CV
    states. A model that also lists "Arabic (Native)" under Skills makes the
    page contradict itself the moment the two levels differ. Only items whose
    text (minus a parenthesised level) is one of the CV's languages go; a
    programming-"Languages" row of Python and SQL is untouched.
    """
    names = {
        str(lang.get("name") or "").strip().lower()
        for lang in languages
        if isinstance(lang, dict)
    }
    names.discard("")
    if not names:
        return skills

    def _is_language(item) -> bool:
        text = re.sub(r"\s*\(.*?\)\s*$", "", str(item)).strip().lower()
        return text in names

    kept = []
    for row in skills:
        if not isinstance(row, dict):
            kept.append(row)
            continue
        items = [i for i in (row.get("items") or []) if not _is_language(i)]
        if items:
            kept.append({**row, "items": items})
    return kept


def _strings(obj):
    """Every string leaf in a nested CV structure."""
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for value in obj.values():
            yield from _strings(value)
    elif isinstance(obj, list):
        for value in obj:
            yield from _strings(value)


def _stem(token: str) -> str:
    plural = token.endswith("s") and len(token) > 3 and not token.endswith("ss")
    return token[:-1] if plural else token


def _claimed_tokens(base: dict) -> set[str]:
    """The significant words the base CV contains anywhere, synonyms folded —
    the vocabulary a generated skill must be drawn from."""
    text = "\n".join(_strings(base))
    return set(vocabulary.tokens(vocabulary.canonicalize(text)))


def _token_claimed(token: str, claimed: set[str]) -> bool:
    if token in claimed:
        return True
    stem = _stem(token)
    for other in claimed:
        other_stem = _stem(other)
        if stem == other_stem:
            return True
        # "agent" ~ "agentic", "engineer" ~ "engineered": a shared prefix of
        # five or more letters is the same skill in a different form.
        if (
            len(stem) >= 5
            and len(other_stem) >= 5
            and (other_stem.startswith(stem) or stem.startswith(other_stem))
        ):
            return True
    return False


def _skill_claimed(item, claimed: set[str]) -> bool:
    tokens = vocabulary.tokens(vocabulary.canonicalize(str(item)))
    return all(_token_claimed(t, claimed) for t in tokens)


def _only_claimed_skills(skills: list, base: dict) -> list:
    """Drop generated skill items the base CV never claims.

    Generation may regroup and rephrase the candidate's skills in the JD's
    words; it may not add one. The prompt has said so for a while and the
    August CVs still grew MySQL, disaster recovery and MLOps. Every word of a
    kept item must appear somewhere in the base CV (after synonym folding), so
    "RESTful APIs" survives on a CV that says "REST APIs" and "GCP" survives on
    one that says "Google Cloud Platform", while an invented tool cannot.
    """
    claimed = _claimed_tokens(base)
    kept = []
    for row in skills:
        if not isinstance(row, dict):
            kept.append(row)
            continue
        items = [i for i in (row.get("items") or []) if _skill_claimed(i, claimed)]
        if items:
            kept.append({**row, "items": items})
    return kept


# --- bullet detail floor ---------------------------------------------------
# A tailored bullet is the base bullet re-angled, never a summary of it. The
# generator may reorder bullets and reword them in the JD's vocabulary; it may
# not lose a number, drop the tools and systems the bullet names, cut it short,
# or write a bullet with no source in the candidate's history. Measured on 865
# generated bullets before this floor: 36% had dropped a named tool, 10% a
# number, 10% had no recognisable source at all.
FAITHFUL_MIN_OVERLAP = 0.25   # token Jaccard below which a bullet has no source
FAITHFUL_MIN_LENGTH = 0.8     # of the source bullet's word count
FAITHFUL_MAX_LOST_NAMES = 1   # named tools/systems a rewrite may leave out

_NUMBER = re.compile(r"\d[\d,.]*")
_NAMED = re.compile(r"^[A-Z][A-Za-z0-9+#.\-]*$|^[A-Z0-9]{2,}$")


def _bullet_text(bullet) -> str:
    """A bullet is a plain string or {text, condition}."""
    return bullet.get("text", "") if isinstance(bullet, dict) else str(bullet or "")


def _tokens(text: str) -> set[str]:
    return set(vocabulary.tokens(vocabulary.canonicalize(text)))


def _named_terms(text: str) -> list[set[str]]:
    """The proper nouns, tools and acronyms a bullet names after its verb, each
    as the canonical tokens it must reappear as ("GCP" ~ "Google Cloud Platform")."""
    terms = []
    for word in text.split()[1:]:
        word = word.strip("(),.;:")
        if word and _NAMED.match(word):
            tokens = _tokens(word)
            if tokens:
                terms.append(tokens)
    return terms


def _is_faithful(candidate: str, source: str) -> bool:
    if set(_NUMBER.findall(source)) - set(_NUMBER.findall(candidate)):
        return False
    have = _tokens(candidate)
    lost = sum(1 for term in _named_terms(source) if not term <= have)
    if lost > FAITHFUL_MAX_LOST_NAMES:
        return False
    return len(candidate.split()) >= FAITHFUL_MIN_LENGTH * len(source.split())


def _jaccard(a: set, b: set) -> float:
    return len(a & b) / len(a | b) if a | b else 0.0


def _faithful_bullets(generated: list, base: list) -> list[str]:
    """The generated bullets, in their order, each proven against the base
    bullet it rewrites — or replaced by that bullet's own text when it lost a
    number, its named tools, or most of its length. A generated bullet with
    no source takes the text of a base bullet nothing else claimed, so the
    role's history stays whole and real."""
    base_texts = [t for t in map(_bullet_text, base) if t.strip()]
    gen_texts = [t for t in map(_bullet_text, generated) if t.strip()]
    if not base_texts:
        return gen_texts
    if not gen_texts:
        return base_texts

    base_tokens = [_tokens(t) for t in base_texts]
    pairs = sorted(
        (
            (_jaccard(_tokens(g), b), i, j)
            for i, g in enumerate(gen_texts)
            for j, b in enumerate(base_tokens)
        ),
        reverse=True,
    )
    source: dict[int, int] = {}
    claimed: set[int] = set()
    for sim, i, j in pairs:
        if sim < FAITHFUL_MIN_OVERLAP:
            break
        if i in source or j in claimed:
            continue
        source[i] = j
        claimed.add(j)

    spare = [j for j in range(len(base_texts)) if j not in claimed]
    out: list[str] = []
    for i, text in enumerate(gen_texts):
        if i in source:
            original = base_texts[source[i]]
            out.append(text if _is_faithful(text, original) else original)
        elif spare:
            out.append(base_texts[spare.pop(0)])
        # An extra bullet with no source and no slot left is dropped.
    out.extend(base_texts[j] for j in spare)  # bullets the generator forgot
    return out


def _allowed_title(generated_title, base_role: dict) -> str:
    """The generated title if the candidate declared it true of this role,
    else the role's real title. `alternateTitles` on a base role is the one
    place a retitle is authorised — no employer-specific rule in a prompt."""
    real = base_role.get("title", "") or ""
    allowed = {real.strip().lower()} | {
        str(t).strip().lower() for t in (base_role.get("alternateTitles") or [])
    }
    candidate = str(generated_title or "").strip()
    return candidate if candidate and candidate.lower() in allowed else real


_MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1
)}
_DATE = re.compile(r"(?:\b([a-z]{3})[a-z]*\.?\s*)?\b(\d{4})\b", re.IGNORECASE)
_PRESENT = re.compile(r"\b(present|current|now|today|ongoing)\b", re.IGNORECASE)
_RANGE_SEP = re.compile(r"\s*(?:-|–|—|\bto\b|\buntil\b)\s*")


def _month_index(text: str, today: tuple[int, int]) -> int | None:
    """Months since year 0 for a date like 'Mar 2024', '2020' or 'Present'.
    A bare year is read as mid-year, which is unbiased for '2020-2024'."""
    if _PRESENT.search(text):
        return today[0] * 12 + (today[1] - 1)
    match = _DATE.search(text)
    if not match:
        return None
    month = _MONTHS.get((match.group(1) or "").lower(), 7)
    return int(match.group(2)) * 12 + (month - 1)


def experience_years(cv: dict, today: tuple[int, int] | None = None) -> float | None:
    """Years of experience computed from the experience date ranges, with
    overlapping roles counted once — the way an ATS derives it, instead of a
    self-reported number. None when no range can be read."""
    if today is None:
        now = _dt.date.today()
        today = (now.year, now.month)
    intervals = []
    for role in (cv or {}).get("experience") or []:
        parts = _RANGE_SEP.split(str(role.get("period") or ""), maxsplit=1)
        if len(parts) != 2:
            continue
        start, end = _month_index(parts[0], today), _month_index(parts[1], today)
        if start is None or end is None or end < start:
            continue
        intervals.append((start, end))
    if not intervals:
        return None
    total = 0
    ordered = sorted(intervals)
    current_start, current_end = ordered[0]
    for start, end in ordered[1:]:
        if start <= current_end:
            current_end = max(current_end, end)
        else:
            total += current_end - current_start
            current_start, current_end = start, end
    total += current_end - current_start
    return round(total / 12, 1)


def merge_identity(
    generated: dict,
    base: dict,
    *,
    links: dict | None = None,
    languages: list | None = None,
) -> dict:
    """Graft the factual half of the CV from the base document onto freshly
    generated prose.

    Generation writes judgement — the summary, the skills grouping, and each
    role's bullets (plus its title, which the archetype rule may rewrite).
    Everything else is fact: copied verbatim here and omitted from the
    generation schema, so a model slip can't abbreviate a degree, reword a
    date range, drop a job, or reorder the history.

    `links` ({"linkedin": url, "github": url, ...}) and `languages` are the
    Profile's copies of the same identity. They fill only what the base CV
    leaves blank — the CV is the document the candidate edits, so it wins
    wherever it says something.
    """
    merged = dict(generated or {})
    base = base or {}

    header = dict(base.get("header") or {})
    for key, url in (links or {}).items():
        if url and not (header.get(key) or "").strip():
            header[key] = url
    merged["header"] = header
    merged["languages"] = base.get("languages") or list(languages or [])
    merged["education"] = base.get("education", [])
    merged["certifications"] = base.get("certifications", [])

    # Skills: only what the base CV claims, and spoken languages have exactly
    # one home (above). Both are enforced here, not asked of the prompt.
    if "skills" in merged:
        merged["skills"] = _without_spoken_languages(
            _only_claimed_skills(merged.get("skills") or [], base),
            merged["languages"],
        )

    # The base CV fixes the job list, its order, and each role's facts;
    # generation only supplies the bullets and the (possibly retitled) role.
    generated_roles = generated.get("experience") or []
    merged["experience"] = [
        {
            **base_role,
            "title": _allowed_title(generated_role.get("title"), base_role),
            "bullets": _faithful_bullets(
                generated_role.get("bullets") or [], base_role.get("bullets") or []
            ),
        }
        for base_role, generated_role in (
            (role, generated_roles[i] if i < len(generated_roles) else {})
            for i, role in enumerate(base.get("experience") or [])
        )
    ]
    return merged

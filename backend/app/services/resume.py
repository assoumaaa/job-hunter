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


# --- bullets from notes ----------------------------------------------------
# A role's `notes` are the candidate's private, unpolished record of the work:
# never printed, only mined. Generation may write bullets from them, in place
# of a base bullet this job cares less about or on top of the role's bullets,
# and each is proven against the notes the way a rewrite is proven against its
# base bullet.
NOTES_MAX_PER_ROLE = 3
NOTES_MIN_SHARE = 0.5    # of a bullet's words (after its verb) the notes must contain
NOTES_MAX_OVERLAP = 0.5  # token Jaccard with a base bullet: a restatement, not new work


def _numbers(text: str) -> set[str]:
    """The numbers a text states, without the sentence's trailing punctuation."""
    return {n.rstrip(",.") for n in _NUMBER.findall(text)}


def _share_from(text: str, claimed: set[str]) -> float:
    words = _tokens(" ".join(text.split()[1:]))
    if not words:
        return 0.0
    return sum(1 for w in words if _token_claimed(w, claimed)) / len(words)


def _proven_by_notes(base_role: dict):
    """A check that a bullet comes from the role's notes: every number and
    named tool appears in the notes or the role's own facts, at least half of
    its words come from the notes, and it restates no base bullet. None for a
    role without notes."""
    notes = str(base_role.get("notes") or "")
    if not notes.strip():
        return None
    base_texts = [t for t in map(_bullet_text, base_role.get("bullets") or []) if t.strip()]
    role_facts = "\n".join(
        [notes, str(base_role.get("company") or ""), str(base_role.get("title") or ""), *base_texts]
    )
    from_notes, from_role, stated = _tokens(notes), _tokens(role_facts), _numbers(role_facts)
    base_tokens = [_tokens(t) for t in base_texts]

    def proven(text: str) -> bool:
        if _numbers(text) - stated:
            return False
        if any(not all(_token_claimed(t, from_role) for t in term) for term in _named_terms(text)):
            return False
        if _share_from(text, from_notes) < NOTES_MIN_SHARE:
            return False
        words = _tokens(text)
        return all(_jaccard(words, b) < NOTES_MAX_OVERLAP for b in base_tokens)

    return proven


def _role_bullets(generated: list, base_role: dict) -> list[str]:
    """The role's bullets for this job, in the generator's order (most relevant
    first), each one proven.

    A bullet that rewrites a base bullet must keep its numbers, its named tools
    and most of its length. One that doesn't may instead stand as a bullet from
    the role's notes (`_proven_by_notes`), at most NOTES_MAX_PER_ROLE of them:
    that is how a note replaces a base bullet the job cares less about. A
    rewrite proven neither way reverts to its base bullet's text, and a bullet
    with no source at all takes the slot of a base bullet nothing claimed. Base
    bullets the generator left out then come back, in base order, until the
    role has as many bullets as the base CV, so only a proven note can take the
    place of one the candidate wrote."""
    base_texts = [t for t in map(_bullet_text, base_role.get("bullets") or []) if t.strip()]
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
    matched: set[int] = set()
    for sim, i, j in pairs:
        if sim < FAITHFUL_MIN_OVERLAP:
            break
        if i in source or j in matched:
            continue
        source[i] = j
        matched.add(j)

    from_notes = _proven_by_notes(base_role)
    noted = 0
    claimed: set[int] = set()
    slots: list[str | None] = []  # None holds the place of a base bullet nothing claimed
    for i, text in enumerate(gen_texts):
        j = source.get(i)
        if j is not None and _is_faithful(text, base_texts[j]):
            slots.append(text)
            claimed.add(j)
        elif from_notes and noted < NOTES_MAX_PER_ROLE and from_notes(text):
            slots.append(text)
            noted += 1
        elif j is not None:
            slots.append(base_texts[j])
            claimed.add(j)
        else:
            slots.append(None)

    spare = [j for j in range(len(base_texts)) if j not in claimed]
    out: list[str] = []
    for text in slots:
        if text is not None:
            out.append(text)
        elif spare:
            out.append(base_texts[spare.pop(0)])
        # An unproven bullet with no base bullet left to stand in is dropped.
    while spare and len(out) < len(base_texts):
        out.append(base_texts[spare.pop(0)])  # bullets the generator forgot
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
    date range, drop a job, or reorder the history. Bullets may come from a
    role's private `notes` (see `_role_bullets`); the notes themselves never
    reach the tailored CV, and a role that grew past its base count carries
    `baseBulletCount` so the page-fit step gives the surplus back first.

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
    # generation only supplies the (possibly retitled) role and its bullets,
    # each proven against the base bullets or the role's notes.
    generated_roles = generated.get("experience") or []
    merged["experience"] = []
    for i, base_role in enumerate(base.get("experience") or []):
        generated_role = generated_roles[i] if i < len(generated_roles) else {}
        bullets = _role_bullets(generated_role.get("bullets") or [], base_role)
        base_count = sum(1 for b in base_role.get("bullets") or [] if _bullet_text(b).strip())
        role = {key: value for key, value in base_role.items() if key != "notes"}
        role["title"] = _allowed_title(generated_role.get("title"), base_role)
        role["bullets"] = bullets
        if len(bullets) > base_count:
            role["baseBulletCount"] = base_count
        merged["experience"].append(role)
    return merged

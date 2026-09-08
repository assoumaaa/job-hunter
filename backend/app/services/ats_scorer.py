"""ATS scoring rebuilt around how real ATS systems actually work.

Why a separate module
---------------------
The previous design asked the same model that wrote the CV to also score it,
which is a textbook conflict of interest — the model has every incentive to
inflate its own work. Real ATS systems (Workday, Greenhouse, Lever, Taleo)
are mechanical: they count keyword hits, check parseability, look at exact
title/skill matches. Modern AI-augmented platforms (Eightfold, hireEZ) add
embedding similarity on top.

So the score here is composed of two clearly-separated layers:

1.  **Deterministic (60 pts)** — pure Python, reproducible, transparent.
    - Must-have keyword coverage (24, full marks at 80% — stuffing the last
      few terms buys nothing) and nice-to-have coverage (6, full at 60%)
    - Most-recent title vs the req title (10) — the strongest single signal
      in Workday/LinkedIn-style ranking, and the one a keyword count misses
    - Requirements (10): years computed from date ranges (5) plus the
      knockout half (5) — any hard requirement the candidate does not meet
      zeroes it and caps the decision below APPROVED
    - Structural completeness / hygiene (10), less a point per bullet the
      summary restates

2.  **Independent LLM evaluator (40 pts)** — a separate Claude call wearing
    a "skeptical recruiter" hat. It has no knowledge that an AI wrote the CV.
    - Semantic responsibility match (15)
    - Bullet impact and specificity (15)
    - Recruiter confidence (10)

The JD is analyzed exactly once per job (Haiku) to extract the must-haves /
nice-to-haves / required years. That analysis is reusable across all
iteration passes so we don't re-pay for it.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field

from . import llm, vocabulary

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class JDAnalysis:
    must_have_keywords: list[str] = field(default_factory=list)
    nice_to_have_keywords: list[str] = field(default_factory=list)
    required_years: int | None = None
    seniority: str | None = None  # junior | mid | senior | lead | principal
    hard_requirements: list[str] = field(default_factory=list)
    role_summary: str = ""


@dataclass
class AtsScore:
    total: int
    keyword: int  # 0-30
    requirements: int  # 0-10 (years 0-5 + knockout 0/5)
    format: int  # 0-10
    semantic: int  # 0-15
    impact: int  # 0-15
    recruiter: int  # 0-10
    decision: str  # APPROVED | NEEDS_REVISION | REJECTED
    title: int = 0  # 0-10
    unmet_requirements: list[str] = field(default_factory=list)
    missing_must_have: list[str] = field(default_factory=list)
    missing_nice_to_have: list[str] = field(default_factory=list)
    gaps: list[str] = field(default_factory=list)  # plain-language gaps for UI
    notes: str = ""  # short evaluator note


# Thresholds
APPROVE_THRESHOLD = 85
REJECT_THRESHOLD = 60


def to_api_dict(score: AtsScore) -> dict:
    """Project a score onto the JSON shape the jobs API exposes.

    The one place a score is flattened for storage/transport — it stays a whole
    `AtsScore` everywhere upstream. Field names match the score's own
    (`requirements`, `semantic`): no rename dance.
    """
    return {
        "keyword": score.keyword,
        "title": score.title,
        "requirements": score.requirements,
        "unmet_requirements": score.unmet_requirements,
        "format": score.format,
        "semantic": score.semantic,
        "impact": score.impact,
        "recruiter": score.recruiter,
        "decision": score.decision,
        "gaps": score.gaps,
        "missing_must_have": score.missing_must_have,
        "missing_nice_to_have": score.missing_nice_to_have,
        "notes": score.notes,
    }


# ---------------------------------------------------------------------------
# JD analysis (one Haiku call per job, reused across iteration passes)
# ---------------------------------------------------------------------------

_JD_ANALYZER_PROMPT = """You are a technical recruiter analyzing a job posting.

Return ONLY a JSON object with this exact shape:
{
  "must_have_keywords": [...],
  "nice_to_have_keywords": [...],
  "required_years": <integer or null>,
  "seniority": "junior" | "mid" | "senior" | "lead" | "principal" | null,
  "hard_requirements": [...],
  "role_summary": "one sentence describing what this role actually does"
}

Rules:
- must_have_keywords: 8-12 EXACT terms an ATS will scan for. Use the JD's own
  wording (e.g. "Kubernetes", "RESTful APIs", "PostgreSQL", "agile delivery").
  Include tools, technologies, methodologies, and core responsibility nouns.
  Do NOT include filler words like "team", "experience", "ability".
- nice_to_have_keywords: 5-10 secondary terms (bonus skills, frameworks).
- required_years: minimum years of experience demanded (null if unspecified).
- seniority: infer from title and language ("Senior", "Staff", "Lead", etc.).
- hard_requirements: 2-5 short phrases for non-negotiables ("US work auth",
  "5+ years Python", "on-site in Berlin"). Empty list if none.
- role_summary: a single neutral sentence.

No markdown fences, no commentary."""


def analyze_jd(job_description: str) -> JDAnalysis:
    if not job_description or not job_description.strip():
        return JDAnalysis()

    try:
        data = llm.complete_json(
            model=llm.screening_model(),
            max_tokens=1024,
            messages=[
                {
                    "role": "user",
                    "content": _JD_ANALYZER_PROMPT + "\n\nJD:\n" + job_description,
                },
            ],
        )
    except Exception as e:
        logger.warning("JD analysis failed, falling back to empty: %s", e)
        return JDAnalysis()

    def _strlist(v):
        if not isinstance(v, list):
            return []
        return [str(x).strip() for x in v if str(x).strip()]

    return JDAnalysis(
        must_have_keywords=_strlist(data.get("must_have_keywords"))[:12],
        nice_to_have_keywords=_strlist(data.get("nice_to_have_keywords"))[:10],
        required_years=(
            data.get("required_years")
            if isinstance(data.get("required_years"), int)
            else None
        ),
        seniority=(
            (data.get("seniority") or None)
            if isinstance(data.get("seniority"), str)
            else None
        ),
        hard_requirements=_strlist(data.get("hard_requirements"))[:5],
        role_summary=str(data.get("role_summary") or "").strip(),
    )


# ---------------------------------------------------------------------------
# Deterministic scoring helpers
# ---------------------------------------------------------------------------


def _resume_text(resume: dict) -> str:
    """Flatten the structured resume into a single searchable string."""
    parts: list[str] = []
    parts.append(str(resume.get("summary") or ""))
    for exp in resume.get("experience") or []:
        parts.append(str(exp.get("title") or ""))
        parts.append(str(exp.get("company") or ""))
        parts.extend(str(b) for b in (exp.get("bullets") or []))
    for proj in resume.get("projects") or []:
        parts.append(str(proj.get("name") or ""))
        parts.append(str(proj.get("description") or ""))
        parts.append(str(proj.get("tech") or ""))
    for skill in resume.get("skills") or []:
        parts.append(str(skill.get("category") or ""))
        parts.extend(str(s) for s in (skill.get("items") or []))
    for cert in resume.get("certifications") or []:
        parts.append(str(cert.get("title") or ""))
        parts.append(str(cert.get("org") or ""))
    for edu in resume.get("education") or []:
        parts.append(str(edu.get("degree") or ""))
        parts.append(str(edu.get("institution") or ""))
    return "\n".join(p for p in parts if p)


def _normalize(s: str) -> str:
    """Lowercase + collapse whitespace + strip punctuation that breaks matching."""
    s = s.lower()
    s = re.sub(r"[^\w\s+#.\-/]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _haystack(text: str) -> str:
    """Text as the matcher sees it: synonyms folded, then normalized."""
    return _normalize(vocabulary.canonicalize(text))


def _keyword_pattern(keyword: str) -> re.Pattern | None:
    """A regex matching `keyword` and its everyday variants: every word may
    gain or lose a plural 's', and words may be joined by a space, a hyphen,
    or nothing ("CI/CD pipelines", "ci-cd pipeline", "nodejs").

    Pluralising only the last word made "APIs integration" (the JD's typo)
    match nothing but that exact typo — and the generator, chasing the
    keyword score, copied the typo onto the CV. Tolerance here removes the
    incentive; the writing prompt can then insist on grammatical phrasing.
    """
    words = [w for w in re.split(r"[\s\-]+", _haystack(keyword)) if w]
    if not words:
        return None
    pieces = []
    for w in words:
        # Only treat a trailing 's' as a plural when a real stem remains:
        # "apis" -> "api", but "ios", "aws", "dns" stay whole ("io" would
        # otherwise match socket.io).
        plural = w.endswith("s") and len(w) > 3 and not w.endswith("ss")
        pieces.append(re.escape(w[:-1] if plural else w) + "s?")
    # word-boundary regex (allow . and + inside words like c++, node.js, c#)
    return re.compile(r"(?<![\w])" + r"[\s\-]?".join(pieces) + r"(?![\w])")


def _keyword_hit(keyword: str, haystack: str) -> bool:
    """Match a keyword inside normalized text, tolerant of plural and
    hyphenation differences (see `_keyword_pattern`)."""
    pattern = _keyword_pattern(keyword)
    return bool(pattern and pattern.search(haystack))


def _keyword_coverage(keywords: list[str], haystack: str) -> tuple[int, list[str]]:
    hits = sum(1 for k in keywords if _keyword_hit(k, haystack))
    missing = [k for k in keywords if not _keyword_hit(k, haystack)]
    return hits, missing


def _keyword_points(keywords: list[str], haystack: str, max_points: int, ceiling: float) -> int:
    """Points for keyword coverage, saturating at `ceiling` coverage.

    Full marks at 80% of the must-haves is how a recruiter reads a CV — the
    last two obscure terms do not change the verdict — and it removes the
    reward for stuffing them in. No keywords at all earns most of the marks,
    as before, so a JD the analyzer could not read is not a penalty."""
    if not keywords:
        return int(round(max_points * 0.85))
    coverage = sum(1 for k in keywords if _keyword_hit(k, haystack)) / len(keywords)
    return int(round(max_points * min(1.0, coverage / ceiling)))


# Words that describe seniority or format, not the job — dropped before two
# titles are compared.
_TITLE_NOISE = frozenset(
    "senior junior lead staff principal sr jr i ii iii iv v mid level intern "
    "associate remote hybrid onsite on-site contract fulltime full-time "
    "parttime part-time".split()
)


def _title_tokens(title) -> set[str]:
    """The meaningful words of a title: the trailing location or bracket is
    cut ("... - UAE", "... (Remote)"), synonyms folded ("Developer" is
    "Engineer"), seniority words dropped."""
    head = re.split(r"\s+[-–—|/]\s+|\s*\(", str(title or ""), maxsplit=1)[0]
    return {
        t for t in vocabulary.tokens(vocabulary.canonicalize(head)) if t not in _TITLE_NOISE
    }


def _title_score(resume: dict, job_title: str | None) -> int:
    """0-10 for how much of the req title the candidate's titles cover. The
    most recent title counts in full; any earlier title at a discount, the way
    ranking systems weigh 'current title' above 'has held title'."""
    wanted = _title_tokens(job_title)
    if not wanted:
        return 0
    titles = [exp.get("title") for exp in resume.get("experience") or []]
    overlaps = [len(wanted & _title_tokens(t)) / len(wanted) for t in titles if t]
    if not overlaps:
        return 0
    best = max([overlaps[0]] + [0.6 * o for o in overlaps[1:]])
    return int(round(10 * best))


# A metric worth protecting from repetition: two or more digits, or a unit
# ("12%", "500+", "2M+", "3x"). A bare "5+" is too common to be a signature.
_METRIC_TOKEN = re.compile(r"(?<![\w])(\d[\d,.]*)\s?(%|\+|k|m|b|x)\+?(?![\w])", re.IGNORECASE)


def _metric_signatures(text: str) -> set[str]:
    out = set()
    for digits, unit in _METRIC_TOKEN.findall(text or ""):
        if len(re.sub(r"\D", "", digits)) >= 2 or unit.lower() in "%kmbx":
            out.add(f"{digits}{unit}".lower())
    return out


def _word_ngrams(text: str, n: int = 5) -> set[str]:
    words = _normalize(text).split()
    return {" ".join(words[i : i + n]) for i in range(len(words) - n + 1)}


def _summary_repeats(resume: dict) -> list[str]:
    """Bullets whose metric or wording the summary restates. The summary is
    meant to position, the bullets to prove; the same '500+ modules for 100+
    clients' twice on one page reads as padding to a recruiter."""
    summary = str(resume.get("summary") or "")
    if not summary.strip():
        return []
    summary_metrics = _metric_signatures(summary)
    summary_ngrams = _word_ngrams(summary)
    issues = []
    for i, exp in enumerate(resume.get("experience") or []):
        for j, bullet in enumerate(exp.get("bullets") or []):
            text = str(bullet)
            shared_metric = summary_metrics & _metric_signatures(text)
            shared_phrase = summary_ngrams & _word_ngrams(text)
            if shared_metric or shared_phrase:
                what = sorted(shared_metric)[0] if shared_metric else f'"{sorted(shared_phrase)[0]}"'
                issues.append(f"Summary restates experience[{i}].bullets[{j}] ({what})")
    return issues


def _bullet_count(resume: dict) -> int:
    return sum(len(exp.get("bullets") or []) for exp in resume.get("experience") or [])


_METRIC_PATTERN = re.compile(
    r"\b(\d+%|\$\d|\d+\s?(k|m|b|x|×)|\d{2,}|\d+\.\d+|p\d{2,3})\b", re.IGNORECASE
)


def _metric_bullet_ratio(resume: dict) -> float:
    bullets: list[str] = []
    for exp in resume.get("experience") or []:
        bullets.extend(str(b) for b in (exp.get("bullets") or []))
    if not bullets:
        return 0.0
    with_metric = sum(1 for b in bullets if _METRIC_PATTERN.search(b))
    return with_metric / len(bullets)


def _format_score(resume: dict) -> tuple[int, list[str]]:
    """0-10 pts for parseability — what real ATS parsers check."""
    issues: list[str] = []
    score = 10

    header = resume.get("header") or {}
    if not header.get("email"):
        score -= 2
        issues.append("Missing email in header")
    if not header.get("phone"):
        score -= 1
        issues.append("Missing phone in header")
    if not header.get("name"):
        score -= 2
        issues.append("Missing name in header")

    if not resume.get("summary"):
        score -= 1
        issues.append("Missing professional summary")
    if not resume.get("experience"):
        score -= 3
        issues.append("Missing experience section")
    if not resume.get("skills"):
        score -= 1
        issues.append("Missing skills section")

    if _bullet_count(resume) < 4:
        score -= 1
        issues.append("Too few bullets in experience")

    return max(0, score), issues


def _years_score(jd: JDAnalysis, candidate_years: float | None) -> int:
    """0-5 pts for years/seniority alignment."""
    if jd.required_years is None or candidate_years is None:
        return 4  # benefit of the doubt
    if candidate_years >= jd.required_years:
        return 5
    gap = jd.required_years - candidate_years
    if gap <= 1:
        return 4
    if gap <= 2:
        return 2
    return 0


# ---------------------------------------------------------------------------
# Hard requirements — the knockout step. A real ATS rejects on the form
# ("authorised to work in the UAE?", "5+ years Python?") before anyone reads a
# bullet. `analyze_jd` already extracts these; this checks them once per job
# against the candidate's facts, not against the tailored wording.
# ---------------------------------------------------------------------------

_REQUIREMENTS_SYSTEM = (
    "You check a candidate against a job's non-negotiable requirements. Judge "
    "each requirement from the CANDIDATE FACTS only. Use \"unmet\" only when "
    "the facts clearly contradict the requirement; when the facts are silent, "
    "answer \"unknown\", never guess. Output a JSON array only."
)


def check_hard_requirements(hard_requirements: list[str], candidate_facts: str) -> list[str]:
    """The requirements the candidate clearly does not meet. Empty when there
    are none to check, when everything is met or unknown, or when the check
    itself fails — a knockout must never come from a broken call."""
    requirements = [str(r).strip() for r in hard_requirements or [] if str(r).strip()]
    if not requirements:
        return []
    numbered = "\n".join(f"{i + 1}. {r}" for i, r in enumerate(requirements))
    user = (
        f"REQUIREMENTS:\n{numbered}\n\n"
        f"CANDIDATE FACTS:\n{(candidate_facts or '')[:6000]}\n\n"
        f"Return ONLY a JSON array with one object per requirement, in order: "
        f'[{{"requirement": "...", "status": "met" | "unmet" | "unknown", "evidence": "short"}}]'
    )
    try:
        rows = llm.complete_json_array(
            model=llm.screening_model(),
            max_tokens=1024,
            system=_REQUIREMENTS_SYSTEM,
            messages=[{"role": "user", "content": user}],
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("hard-requirement check failed (%s); treating as unknown.", e)
        return []
    unmet = []
    for i, row in enumerate(rows):
        if not isinstance(row, dict) or str(row.get("status", "")).lower() != "unmet":
            continue
        # Prefer our own wording when the reply lines up one-to-one.
        name = requirements[i] if len(rows) == len(requirements) else str(row.get("requirement") or "")
        if name.strip():
            unmet.append(name.strip())
    return unmet


# ---------------------------------------------------------------------------
# Independent LLM evaluator (Haiku, skeptical-recruiter persona)
# ---------------------------------------------------------------------------

_EVALUATOR_PROMPT = """You are a skeptical, time-pressed technical recruiter
evaluating a tailored CV against a job description. You do NOT know who wrote
the CV. Your job is to score it honestly and tersely.

Return ONLY a JSON object:
{
  "semantic": 0-15,
  "impact": 0-15,
  "recruiter": 0-10,
  "notes": "one short sentence — the single biggest gap"
}

Rubric (be strict — most CVs are not great):
- semantic (0-15): How well do the candidate's bullets describe responsibilities
  the JD actually asks for? 15 = direct overlap on most responsibilities.
  10 = partial overlap. 5 = adjacent experience. 0 = unrelated.
- impact (0-15): Specificity and quantified outcomes. 15 = most bullets carry
  concrete metrics or named systems. 10 = mixed. 5 = mostly generic verbs.
  0 = no specifics anywhere.
- recruiter (0-10): Would you advance this candidate to a phone screen?
  10 = clear yes. 7 = probably. 5 = unsure. 0 = no.

No commentary outside the JSON. No fences."""


def _llm_evaluate(
    resume: dict, jd_analysis: JDAnalysis, job_description: str
) -> tuple[int, int, int, str]:
    payload = (
        "JOB DESCRIPTION:\n"
        + (job_description or "")[:3500]
        + "\n\nROLE SUMMARY: "
        + jd_analysis.role_summary
        + "\n\nMUST-HAVE KEYWORDS: "
        + ", ".join(jd_analysis.must_have_keywords)
        + "\n\nCANDIDATE RESUME (JSON):\n"
        + json.dumps(resume, indent=2)[:6000]
    )
    try:
        data = llm.complete_json(
            model=llm.screening_model(),
            max_tokens=512,
            messages=[
                {"role": "user", "content": _EVALUATOR_PROMPT + "\n\n" + payload},
            ],
        )
    except Exception as e:
        logger.warning("LLM evaluator failed, defaulting to mid scores: %s", e)
        return 8, 8, 5, "Evaluator unavailable; defaults applied."

    def _clamp(v, lo, hi):
        try:
            n = int(v)
        except (TypeError, ValueError):
            n = (lo + hi) // 2
        return max(lo, min(hi, n))

    return (
        _clamp(data.get("semantic"), 0, 15),
        _clamp(data.get("impact"), 0, 15),
        _clamp(data.get("recruiter"), 0, 10),
        str(data.get("notes") or "").strip()[:200],
    )


# ---------------------------------------------------------------------------
# Top-level scoring
# ---------------------------------------------------------------------------


def score_resume(
    resume: dict,
    jd_analysis: JDAnalysis,
    job_description: str,
    candidate_years: float | None = None,
    job_title: str | None = None,
    unmet_requirements: list[str] | None = None,
) -> AtsScore:
    haystack = _haystack(_resume_text(resume))

    _, missing_must = _keyword_coverage(jd_analysis.must_have_keywords, haystack)
    _, missing_nice = _keyword_coverage(jd_analysis.nice_to_have_keywords, haystack)
    keyword_score = _keyword_points(
        jd_analysis.must_have_keywords, haystack, 24, 0.8
    ) + _keyword_points(jd_analysis.nice_to_have_keywords, haystack, 6, 0.6)  # 0-30

    title_score = _title_score(resume, job_title)

    unmet = [u for u in (unmet_requirements or []) if u]
    req_score = _years_score(jd_analysis, candidate_years) + (0 if unmet else 5)

    fmt_score, fmt_issues = _format_score(resume)
    repeats = _summary_repeats(resume)
    fmt_score = max(0, fmt_score - min(2, len(repeats)))

    semantic, impact, recruiter, notes = _llm_evaluate(
        resume, jd_analysis, job_description
    )

    total = (
        keyword_score + title_score + req_score + fmt_score
        + semantic + impact + recruiter
    )

    if total >= APPROVE_THRESHOLD:
        decision = "APPROVED"
    elif total < REJECT_THRESHOLD:
        decision = "REJECTED"
    else:
        decision = "NEEDS_REVISION"
    if unmet and decision == "APPROVED":
        # A knockout is a knockout however good the wording is.
        decision = "NEEDS_REVISION"

    gaps: list[str] = [f"Hard requirement not met: {u}" for u in unmet]
    if missing_must:
        gaps.append(f"Missing must-have keywords: {', '.join(missing_must[:6])}")
    if _metric_bullet_ratio(resume) < 0.4:
        gaps.append("Few bullets carry concrete metrics or outcomes")
    if fmt_issues:
        gaps.extend(fmt_issues[:2])
    gaps.extend(repeats[:2])
    if notes:
        gaps.append(notes)

    return AtsScore(
        total=max(0, min(100, total)),
        keyword=keyword_score,
        title=title_score,
        requirements=req_score,
        unmet_requirements=unmet,
        format=fmt_score,
        semantic=semantic,
        impact=impact,
        recruiter=recruiter,
        decision=decision,
        missing_must_have=missing_must,
        missing_nice_to_have=missing_nice,
        gaps=gaps,
        notes=notes,
    )


# ---------------------------------------------------------------------------
# Reviewer — actionable critique (Sonnet, used only when score < threshold)
# ---------------------------------------------------------------------------

_REVIEWER_PROMPT = """You are a CV editor reviewing a tailored CV against a JD.
Your goal is NOT to praise. Produce a tight punch-list of specific edits the
author should apply to improve ATS score and recruiter signal.

Hard constraints the author must respect:
- The number of bullets per role is fixed — NEVER add or remove bullets.
- Never invent skills, employers, or metrics that don't exist in the original.
- Keywords may only be woven into existing experience (rephrased), never
  fabricated.

Return ONLY a JSON object:
{
  "edits": [
    {
      "where": "summary" | "experience[0].bullets[2]" | "skills" | ...,
      "change": "concrete instruction (e.g. 'Replace \\"built APIs\\" with \\"designed RESTful APIs handling 12k req/s\\" to surface the RESTful APIs keyword')",
      "why": "short rationale (keyword/impact/clarity)"
    }
  ],
  "priority_keywords_to_weave": ["..."]
}

Rules:
- 3-7 edits. Pick the highest-leverage changes only.
- Each `change` must be specific enough to execute without re-reading the JD.
- Use bullet/section indices the way they appear in the provided JSON.
- No commentary outside the JSON."""


@dataclass
class ReviewFeedback:
    edits: list[dict] = field(default_factory=list)
    priority_keywords: list[str] = field(default_factory=list)

    def is_empty(self) -> bool:
        return not self.edits and not self.priority_keywords

    def to_prompt(self) -> str:
        if self.is_empty():
            return ""
        lines = ["REVIEWER FEEDBACK (apply ALL of these, respect bullet count):"]
        for i, e in enumerate(self.edits, 1):
            lines.append(
                f"{i}. [{e.get('where', '?')}] {e.get('change', '').strip()}"
                + (f"  (why: {e.get('why', '').strip()})" if e.get("why") else "")
            )
        if self.priority_keywords:
            lines.append(
                "PRIORITY KEYWORDS to weave naturally into existing bullets: "
                + ", ".join(self.priority_keywords)
            )
        return "\n".join(lines)


def critique(
    resume: dict,
    jd_analysis: JDAnalysis,
    job_description: str,
    score: AtsScore,
) -> ReviewFeedback:
    payload = (
        "JOB DESCRIPTION:\n"
        + (job_description or "")[:3000]
        + "\n\nMUST-HAVE KEYWORDS (priority): "
        + ", ".join(jd_analysis.must_have_keywords)
        + "\n\nMISSING MUST-HAVE KEYWORDS: "
        + (", ".join(score.missing_must_have) or "none")
        + "\n\nCURRENT SCORE: "
        + str(score.total)
        + "/100"
        + "\nGAPS: "
        + "; ".join(score.gaps)
        + "\n\nCURRENT RESUME (JSON):\n"
        + json.dumps(resume, indent=2)[:6000]
    )
    try:
        data = llm.complete_json(
            model=llm.generation_model(),
            max_tokens=1500,
            messages=[{"role": "user", "content": _REVIEWER_PROMPT + "\n\n" + payload}],
        )
    except Exception as e:
        logger.warning("Reviewer failed, returning empty feedback: %s", e)
        return ReviewFeedback()

    edits = data.get("edits") or []
    if not isinstance(edits, list):
        edits = []
    pk = data.get("priority_keywords_to_weave") or []
    if not isinstance(pk, list):
        pk = []

    return ReviewFeedback(
        edits=[e for e in edits if isinstance(e, dict)][:7],
        priority_keywords=[str(x).strip() for x in pk if str(x).strip()][:8],
    )

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import List, Optional

import logging

import anthropic

from ..core.config import settings

logger = logging.getLogger(__name__)

client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

# ---------------------------------------------------------------------------
# Model selection: Haiku for cheap bulk screening, Sonnet for quality generation
# ---------------------------------------------------------------------------
SCREENING_MODEL = "claude-haiku-4-5-20251001"
GENERATION_MODEL = "claude-sonnet-4-6"

# ---------------------------------------------------------------------------
# Forbidden words/phrases for generated text
# ---------------------------------------------------------------------------
FORBIDDEN_WORDS = [
    "delve", "synergy", "spearhead", "passionate", "cutting-edge",
    "robust", "innovative", "holistic", "empower", "foster",
    "tapestry", "unlock", "game-changer", "leverage", "utilize",
    "facilitate", "seamless",
]

FORBIDDEN_PHRASES = [
    "I am excited to apply",
    "results-driven",
    "proven track record",
    "dynamic team player",
    "Responsible for",
    "in today's fast-paced world",
    "demonstrated ability to",
    "I would love the opportunity",
]

# ---------------------------------------------------------------------------
# Archetype definitions (used by both screening and generation)
# ---------------------------------------------------------------------------
ARCHETYPES = {
    "backend": "Backend / Systems / Infrastructure — distributed systems, APIs, databases, performance, reliability",
    "frontend": "Frontend / UI — React, component architecture, accessibility, user-facing performance",
    "fullstack": "Full-Stack — end-to-end feature delivery, both client and server",
    "devops": "DevOps / SRE / Platform — CI/CD, infrastructure-as-code, monitoring, cloud platforms",
    "data": "Data / ML / AI — data pipelines, ML models, analytics, LLMs, vector databases",
    "pm": "Product Manager / Technical PM — roadmaps, discovery, stakeholder management, metrics",
    "solutions": "Solutions / Consulting / Pre-Sales — client-facing, integrations, enterprise, demos",
    "mobile": "Mobile — iOS, Android, React Native, Flutter",
    "security": "Security — AppSec, penetration testing, compliance, identity",
    "other": "Other — does not clearly fit the above categories",
}

ARCHETYPE_GENERATION_HINTS = {
    "backend": "Prioritize: system design, scalability, API design, database optimization, performance metrics. Lead with infrastructure and reliability achievements.",
    "frontend": "Prioritize: UI/UX delivery, component architecture, performance optimization, accessibility. Lead with user-facing impact metrics.",
    "fullstack": "Prioritize: end-to-end feature delivery, spanning both frontend and backend. Show breadth across the stack.",
    "devops": "Prioritize: CI/CD pipelines, infrastructure automation, monitoring/observability, cloud architecture. Lead with uptime/deployment frequency metrics.",
    "data": "Prioritize: data pipelines, ML model deployment, analytics impact, LLM/AI systems. Lead with data scale and model performance metrics.",
    "pm": "Prioritize: product discovery, roadmap ownership, stakeholder management, business metrics. Frame engineering experience as product impact.",
    "solutions": "Prioritize: client-facing delivery, technical consulting, integration architecture, demo/POC delivery. Lead with customer success metrics.",
    "mobile": "Prioritize: mobile-specific patterns, app performance, platform APIs, cross-platform strategies. Lead with user engagement metrics.",
    "security": "Prioritize: security architecture, vulnerability management, compliance frameworks, identity systems. Lead with risk reduction metrics.",
    "other": "Adapt framing to the specific role requirements.",
}

# ---------------------------------------------------------------------------
# Generation system prompt
# ---------------------------------------------------------------------------
AGENT_SYSTEM_PROMPT = f"""You are a professional CV writer and ATS optimization expert.

## STEP 1: EXTRACT KEYWORDS
Extract 15-20 keywords/phrases from the JD. These are the exact terms the ATS will scan for.

## STEP 2: DETECT ARCHETYPE
Classify the role into one (or hybrid of two):

| Archetype | Signals in JD |
|-----------|---------------|
| Backend / Systems | "distributed systems", "APIs", "databases", "performance", "reliability" |
| Frontend / UI | "React", "component", "accessibility", "user-facing" |
| Full-Stack | "end-to-end", "both client and server", "full-stack" |
| DevOps / Platform | "CI/CD", "infrastructure", "monitoring", "cloud", "SRE" |
| Data / ML / AI | "data pipelines", "ML", "LLM", "analytics", "vector" |
| Solutions / Consulting | "client-facing", "integrations", "enterprise", "demos", "pre-sales" |
| Forward Deployed | "deploy", "prototype", "field", "fast delivery", "client site" |
| Product Manager | "PRD", "roadmap", "discovery", "stakeholder" |

## STEP 3: TAILOR CV

### 1-PAGE CONSTRAINT (CRITICAL)
The output CV MUST fit on exactly 1 page. This overrides everything else:
- Summary: max 2-3 lines (~200 characters)
- Bullets can wrap to 2 lines — that's fine. But avoid wrapping where just 1-2 words spill to line 2. Either make it fit 1 line or fill out 2 full lines with more useful detail.
- If the base CV has projects, select ONLY the top 3 most relevant to this JD. Drop the rest.
- Keep education and certifications concise (1 line each)
- Skills: 3 categories max (do NOT put Languages in skills — languages are handled separately). Each category should fit on 1 line.

### Structure rules
- PRESERVE the same jobs in the same reverse-chronological order
- BULLET COUNT IS FIXED: keep the exact same number of bullets per role as the base CV -- never add or remove bullets
- NEVER invent projects, metrics, or experience not in the base CV

### Dynamic title rule (Odoo ONLY)
If target job is Software Engineer / Full-Stack / Frontend / Backend / Developer -> use "Software Engineer"
Otherwise (Solutions, Consulting, Pre-Sales, Implementation, etc.) -> use "Technical Solutions Consultant"
All other job titles NEVER change.

### Keyword injection strategy (ethical, truth-based)
Distribute the extracted keywords deliberately:
- Summary: inject top 5 keywords naturally
- First bullet of each role: inject 1-2 keywords
- Skills section: mirror JD terminology exactly
- Reformulate existing experience with JD vocabulary. Examples:
  - JD says "CI/CD pipelines", CV says "automated deployment" -> "CI/CD pipeline automation"
  - JD says "stakeholder management", CV says "collaborated with teams" -> "stakeholder management across engineering, product, and operations"
  - JD says "RESTful APIs", CV says "built web services" -> "designed and shipped RESTful APIs"
  - JD says "RAG pipelines", CV says "LLM workflows with retrieval" -> "RAG pipeline design and LLM orchestration"
NEVER add skills the candidate does not have. Only reformulate what exists.

### Archetype-based framing
Reorder bullets within each role so the most relevant to the detected archetype come first.
Frame the summary to position the candidate for this specific archetype.

### Summary rules (CRITICAL)
- NEVER copy the target job title as if it is the candidate's current role (e.g. don't say "Forward Deployed Engineer with 4 years...")
- Choose the summary descriptor that honestly reflects the candidate's experience while aligning with the role:
  - Role requires building/deploying production software -> "Software Engineer"
  - Role is solutions/consulting/client-facing/integration-focused -> "Solutions Engineer"
  - Role is pre-sales/implementation/consulting with no production code -> "Technical Solutions Consultant"
- Read the JD requirements carefully and use your judgment. The candidate has experience as both a Software Engineer and a client-facing consultant, so either descriptor is truthful — pick the one that best fits the target role.

### Writing quality
- Prefer specifics: "Cut p95 latency from 2.1s to 380ms" beats "improved performance"
- Name tools, projects, metrics when possible
- Vary sentence structure: don't start every bullet the same way
- Mix sentence lengths: short. Then longer with context. Short again.
- No passive voice. Action verbs, direct language.

## STEP 4: COVER LETTER
- Max 300 words. P1 hook, P2 2-3 metrics, P3 close.
- Bold key metrics and company/role names using **bold**.
- TONE: "I'm choosing you" -- candidate has options and is selecting this company for specific reasons.
- Lead with proof: "I built X that does Y" not "I'm great at X"
- Reference something SPECIFIC from the JD and map it to something SPECIFIC from the CV.
- Use the candidate's LinkedIn/GitHub URLs if provided. Never invent URLs.
- No generic "I would love the opportunity" -- name the actual reason.

## FORBIDDEN
Words: {', '.join(FORBIDDEN_WORDS)}
Phrases: {' | '.join(FORBIDDEN_PHRASES)}
Style: No em dashes, semicolons, exclamation marks. No hedging. No corporate-speak.

## OUTPUT FORMAT (strict)

## KEYWORDS
[comma-separated list of 15-20 extracted JD keywords]

## ARCHETYPE
[detected archetype name]

## RESUME
{{
  "summary": "...",
  "experience": [
    {{"company": "...", "title": "...", "location": "...", "period": "...", "bullets": ["..."]}}
  ],
  "projects": [
    {{"name": "...", "badge": "...", "description": "...", "tech": "..."}}
  ],
  "education": [
    {{"degree": "...", "institution": "...", "year": "...", "description": "..."}}
  ],
  "certifications": [
    {{"title": "...", "org": "...", "year": "..."}}
  ],
  "skills": [
    {{"category": "...", "items": ["..."]}}
  ]
}}

## COVER LETTER
[plain text, sign off with candidate's real name]

Terse. No explanations, no chatter. Do NOT self-score — scoring happens externally.
"""


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------
@dataclass
class AtsBreakdown:
    keyword: int = 0
    experience: int = 0
    skills: int = 0
    format: int = 0
    impact: int = 0
    decision: str = "NEEDS_REVISION"
    gaps: List[str] = field(default_factory=list)


@dataclass
class GenerationResult:
    resume: dict  # structured CV JSON (experience, summary, competencies, etc.)
    cover_letter: str
    ats_score: int
    ats_breakdown: AtsBreakdown
    pass_num: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _strip_fences(s: str) -> str:
    return (
        re.sub(r"^```[a-z]*\n?", "", s.strip(), flags=re.IGNORECASE).rstrip("`").strip()
    )


def _extract_json(text: str) -> dict:
    """Extract the first valid JSON object from text, handling code fences."""
    stripped = _strip_fences(text)
    try:
        return json.loads(stripped)
    except (json.JSONDecodeError, ValueError):
        pass
    # Find the outermost { ... } with balanced braces
    depth = 0
    start = None
    for i, c in enumerate(stripped):
        if c == '{':
            if depth == 0:
                start = i
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0 and start is not None:
                try:
                    return json.loads(stripped[start:i + 1])
                except json.JSONDecodeError:
                    start = None
    return {}


def _parse_agent_output(text: str, pass_num: int) -> GenerationResult:
    resume_match = re.search(
        r"##\s*RESUME\s*\n([\s\S]*?)(?=##\s*COVER LETTER)", text, re.IGNORECASE
    )
    # Cover letter goes to end of text (no trailing ATS section anymore)
    cl_match = re.search(
        r"##\s*COVER LETTER\s*\n([\s\S]*?)$", text, re.IGNORECASE
    )

    # Extract keywords and archetype (informational, stored for logging)
    kw_match = re.search(r"##\s*KEYWORDS\s*\n(.*?)(?=##)", text, re.IGNORECASE | re.DOTALL)
    arch_match = re.search(r"##\s*ARCHETYPE\s*\n(.*?)(?=##)", text, re.IGNORECASE | re.DOTALL)
    if kw_match:
        logger.info("Extracted keywords: %s", kw_match.group(1).strip()[:200])
    if arch_match:
        logger.info("Detected archetype: %s", arch_match.group(1).strip())

    # If section headers are missing, try to extract JSON directly from the full text
    if not resume_match:
        resume_data = _extract_json(text)
    else:
        resume_data = _extract_json(resume_match.group(1))

    if not resume_data.get("experience"):
        logger.warning("Resume data missing experience. Keys: %s", list(resume_data.keys()))

    # Cover letter: if no section header, find text after the JSON block
    if cl_match:
        cover_letter = _strip_fences(cl_match.group(1))
    elif not resume_match:
        depth = 0
        json_end = 0
        for i, c in enumerate(text):
            if c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0:
                    json_end = i + 1
                    break
        if json_end:
            remainder = text[json_end:]
            remainder = re.sub(r"^```\s*", "", remainder.strip(), flags=re.MULTILINE)
            cl_text = re.sub(r"^##\s*COVER LETTER\s*\n?", "", remainder, flags=re.IGNORECASE).strip()
        else:
            cl_text = ""
        cover_letter = cl_text
    else:
        cover_letter = ""

    # Score is not parsed from the generator anymore — see ats_scorer
    return GenerationResult(
        resume=resume_data,
        cover_letter=cover_letter,
        ats_score=0,
        ats_breakdown=AtsBreakdown(),
        pass_num=pass_num,
    )


# ---------------------------------------------------------------------------
# CV/CL generation (Sonnet — quality matters here)
# ---------------------------------------------------------------------------
def generate_cv_and_cl(
    base_cv: dict,
    job_description: str,
    job_title: str,
    company: str,
    pass_num: int = 1,
    previous_resume: Optional[dict] = None,
    previous_score: Optional[int] = None,
    profile_context: Optional[str] = None,
    candidate_name: Optional[str] = None,
    linkedin_url: Optional[str] = None,
    github_url: Optional[str] = None,
    archetype: Optional[str] = None,
    narrative: Optional[str] = None,
    reviewer_feedback: Optional[str] = None,
) -> GenerationResult:
    profile = profile_context or ""
    name = candidate_name or "Candidate"

    url_lines = [
        f"CANDIDATE LINKEDIN: {linkedin_url}" if linkedin_url else "",
        f"CANDIDATE GITHUB: {github_url}" if github_url else "",
    ]
    url_block = "\n".join(l for l in url_lines if l)
    url_instruction = (
        f"\n\n{url_block}\nIMPORTANT: The cover letter sign-off MUST include these URLs exactly as provided above. Do not omit, alter, or invent URLs."
        if url_block
        else ""
    )

    # Build archetype-specific hint (per-job — stays in user message)
    archetype_hint = ""
    if archetype and archetype in ARCHETYPE_GENERATION_HINTS:
        archetype_hint = (
            f"\n\nROLE ARCHETYPE: {archetype.upper()}\n"
            f"{ARCHETYPE_GENERATION_HINTS[archetype]}\n"
            f"Adapt the Professional Summary, bullet reordering, and cover letter framing to this archetype."
        )

    # Build narrative context (user-level — goes in cached system block)
    narrative_block = ""
    if narrative:
        narrative_block = (
            f"\n\nCANDIDATE NARRATIVE (use this to frame the summary and cover letter):\n{narrative}"
        )

    base_cv_str = json.dumps(base_cv, indent=2)

    # User-stable context: name, URLs, profile, narrative, base CV.
    # Identical across all jobs for this user → second cache breakpoint.
    candidate_context = (
        f"CANDIDATE NAME: {name}"
        f"{url_instruction}"
        f"\n\n{profile}"
        f"{narrative_block}"
        f"\n\nMY BASE CV (structured JSON):\n{base_cv_str}"
    )

    if pass_num == 1:
        user_message = (
            f"JOB: {job_title} at {company}\n\n"
            f"JOB DESCRIPTION:\n{job_description}{archetype_hint}\n\n"
            f"Generate tailored resume JSON + cover letter. IMPORTANT: Keep the same jobs, same bullet counts. Only rephrase wording and reorder bullets within each job."
        )
    else:
        prev_str = json.dumps(previous_resume, indent=2) if isinstance(previous_resume, dict) else str(previous_resume)
        feedback_block = (
            f"\n\n{reviewer_feedback}\n" if reviewer_feedback else ""
        )
        user_message = (
            f"JOB: {job_title} at {company}\n\n"
            f"JOB DESCRIPTION:\n{job_description}{archetype_hint}\n\n"
            f"PREVIOUS RESUME (Pass {pass_num - 1}, Score: {previous_score}/100):\n{prev_str}"
            f"{feedback_block}\n"
            f"Apply the reviewer feedback verbatim where possible. Do NOT add or remove bullets — only rephrase."
        )

    # Two cache breakpoints: system prompt (global) + candidate context (per-user).
    # Both stay warm across passes and across all jobs for the same user.
    response = client.messages.create(
        model=GENERATION_MODEL,
        max_tokens=4096,
        system=[
            {
                "type": "text",
                "text": AGENT_SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            },
            {
                "type": "text",
                "text": candidate_context,
                "cache_control": {"type": "ephemeral"},
            },
        ],
        messages=[{"role": "user", "content": user_message}],
    )

    text = response.content[0].text if response.content[0].type == "text" else ""
    return _parse_agent_output(text, pass_num)


# ---------------------------------------------------------------------------
# Page-fit trim: shorten bullets when even tightest CSS can't squeeze to 1 page.
# Uses Haiku — this is mechanical shortening, doesn't need Sonnet judgment.
# ---------------------------------------------------------------------------
def trim_resume_for_fit(resume: dict, overflow_words: int) -> dict:
    """Return `resume` with bullet wording shortened by ~`overflow_words` total.

    Structural invariants: same sections, same job count, same bullet count
    per job. Only wording changes. Falls back to original on parse failure.
    """
    resume_json = json.dumps(resume, indent=2)

    system = (
        "You shorten resumes to fit one page. Output a JSON object only — "
        "no markdown fences, no commentary."
    )
    user = (
        f"This resume overflows page 1 of the rendered PDF. Shorten its bullet "
        f"wording to cut roughly {overflow_words} words across the whole resume.\n\n"
        f"HARD RULES:\n"
        f"- Return the EXACT same JSON structure (same keys, same nesting).\n"
        f"- Keep the SAME number of experience entries, education entries, projects, skills.\n"
        f"- Keep the SAME number of bullets in every job — do NOT delete bullets.\n"
        f"- Only shorten wording. Cut filler, redundancy, weak qualifiers.\n"
        f"- Preserve specific metrics, numbers, tool/tech names, project names, company names.\n"
        f"- Prefer cutting from the LONGEST bullets first.\n\n"
        f"RESUME JSON:\n{resume_json}\n\n"
        f"Output the shortened JSON object now:"
    )

    response = client.messages.create(
        model=SCREENING_MODEL,
        max_tokens=4096,
        system=system,
        messages=[{"role": "user", "content": user}],
    )

    text = response.content[0].text if response.content[0].type == "text" else ""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        logger.warning("trim_resume_for_fit: JSON parse failed (%s); returning original.", e)
        return resume


# ---------------------------------------------------------------------------
# User-driven tweaks: plain-English edits to an already-generated CV or CL.
# Uses Haiku (mechanical edits, doesn't need Sonnet judgment).
# ---------------------------------------------------------------------------
_TWEAK_CV_SYSTEM = (
    "You apply targeted edits to a tailored resume JSON based on a user's "
    "plain-English instruction.\n\n"
    "RULES:\n"
    "- Output ONLY the modified JSON object. No markdown fences, no commentary.\n"
    "- Preserve the EXACT same top-level keys and overall JSON shape.\n"
    "- Honor structural edits the user explicitly requests (add/remove bullets, "
    "reorder, drop sections, etc.). The user's request is the source of truth "
    "for what they want.\n"
    "- NEVER invent experience, employers, projects, metrics, certifications, "
    "or skills not present in the BASE CV. If the user asks for something the "
    "base CV does not support, ignore that part of the request.\n"
    "- Keep the writing style consistent with the rest of the resume: action "
    "verbs, specific metrics, no filler words, no em dashes/semicolons/"
    "exclamation marks."
)

_TWEAK_CL_SYSTEM = (
    "You apply targeted edits to a cover letter based on a user's plain-English "
    "instruction.\n\n"
    "RULES:\n"
    "- Output ONLY the modified cover letter text. No commentary, no preamble, "
    "no markdown fences.\n"
    "- Honor what the user asks for: rewriting paragraphs, shortening, "
    "changing tone, etc.\n"
    "- NEVER invent experience, employers, projects, or metrics not present "
    "in the BASE CV.\n"
    "- Preserve any URLs already in the sign-off unless the user asks to "
    "change them.\n"
    "- No em dashes, semicolons, or exclamation marks."
)


def _strip_json_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text


def apply_cv_tweak(current_cv: dict, base_cv: dict, user_prompt: str) -> dict:
    """Return `current_cv` modified per `user_prompt`. Falls back to the
    original on JSON parse failure so the UI never crashes on a bad model
    response."""
    base_cv_json = json.dumps(base_cv, indent=2)
    current_cv_json = json.dumps(current_cv, indent=2)

    user_message = (
        f"USER INSTRUCTION:\n{user_prompt}\n\n"
        f"CURRENT TAILORED RESUME (this is what to edit):\n{current_cv_json}\n\n"
        f"Output the edited JSON object now."
    )

    response = client.messages.create(
        model=SCREENING_MODEL,
        max_tokens=4096,
        system=[
            {
                "type": "text",
                "text": _TWEAK_CV_SYSTEM,
                "cache_control": {"type": "ephemeral"},
            },
            {
                "type": "text",
                "text": f"BASE CV (source of truth — never invent beyond this):\n{base_cv_json}",
                "cache_control": {"type": "ephemeral"},
            },
        ],
        messages=[{"role": "user", "content": user_message}],
    )

    text = response.content[0].text if response.content[0].type == "text" else ""
    text = _strip_json_fences(text)
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        logger.warning("apply_cv_tweak: JSON parse failed (%s); returning original.", e)
        return current_cv


def apply_cl_tweak(current_cl: str, base_cv: dict, user_prompt: str) -> str:
    """Return `current_cl` modified per `user_prompt`."""
    base_cv_json = json.dumps(base_cv, indent=2)

    user_message = (
        f"USER INSTRUCTION:\n{user_prompt}\n\n"
        f"CURRENT COVER LETTER (this is what to edit):\n{current_cl}\n\n"
        f"Output the edited cover letter text now."
    )

    response = client.messages.create(
        model=SCREENING_MODEL,
        max_tokens=2048,
        system=[
            {
                "type": "text",
                "text": _TWEAK_CL_SYSTEM,
                "cache_control": {"type": "ephemeral"},
            },
            {
                "type": "text",
                "text": f"BASE CV (source of truth — never invent beyond this):\n{base_cv_json}",
                "cache_control": {"type": "ephemeral"},
            },
        ],
        messages=[{"role": "user", "content": user_message}],
    )

    text = response.content[0].text if response.content[0].type == "text" else ""
    return text.strip()


# ---------------------------------------------------------------------------
# Multi-agent orchestration: generate → score → critique → polish → re-score
# ---------------------------------------------------------------------------
def tailor_cv_iterative(
    base_cv: dict,
    job_description: str,
    job_title: str,
    company: str,
    profile_context: Optional[str] = None,
    candidate_name: Optional[str] = None,
    linkedin_url: Optional[str] = None,
    github_url: Optional[str] = None,
    archetype: Optional[str] = None,
    narrative: Optional[str] = None,
    candidate_years: Optional[int] = None,
    max_passes: int = 3,
    target_score: int = 80,
    on_pass: Optional[callable] = None,
) -> GenerationResult:
    """Generate a tailored CV, score it with an independent ATS scorer,
    then iteratively review-and-polish until the target score is reached or
    we stop improving.

    `on_pass` (optional) is a callback invoked after each pass with
    (pass_num: int, score: ats_scorer.AtsScore) so callers can update UI
    state without coupling.
    """
    # Lazy import to avoid circular reference at module load time
    from . import ats_scorer  # noqa: WPS433

    # Phase 1: analyze JD once
    jd_analysis = ats_scorer.analyze_jd(job_description)
    logger.info(
        "JD analysis: %d must-have, %d nice-to-have, role=%s",
        len(jd_analysis.must_have_keywords),
        len(jd_analysis.nice_to_have_keywords),
        jd_analysis.role_summary[:80],
    )

    # Phase 2: initial generation
    result = generate_cv_and_cl(
        base_cv=base_cv,
        job_description=job_description,
        job_title=job_title,
        company=company,
        pass_num=1,
        profile_context=profile_context,
        candidate_name=candidate_name,
        linkedin_url=linkedin_url,
        github_url=github_url,
        archetype=archetype,
        narrative=narrative,
    )

    # Phase 3: score v1
    score = ats_scorer.score_resume(result.resume, jd_analysis, job_description, candidate_years)
    logger.info("Pass 1 score: %d/100 (decision=%s)", score.total, score.decision)
    if on_pass:
        try:
            on_pass(1, score)
        except Exception:
            pass

    best_result, best_score = result, score

    # Phase 4: iterate
    for pass_num in range(2, max_passes + 1):
        if best_score.total >= target_score:
            break

        feedback = ats_scorer.critique(best_result.resume, jd_analysis, job_description, best_score)
        if feedback.is_empty():
            logger.info("Reviewer produced no feedback; stopping iteration.")
            break

        polished = generate_cv_and_cl(
            base_cv=base_cv,
            job_description=job_description,
            job_title=job_title,
            company=company,
            pass_num=pass_num,
            previous_resume=best_result.resume,
            previous_score=best_score.total,
            profile_context=profile_context,
            candidate_name=candidate_name,
            linkedin_url=linkedin_url,
            github_url=github_url,
            archetype=archetype,
            narrative=narrative,
            reviewer_feedback=feedback.to_prompt(),
        )

        polished_score = ats_scorer.score_resume(
            polished.resume, jd_analysis, job_description, candidate_years
        )
        logger.info(
            "Pass %d score: %d/100 (delta=%+d, decision=%s)",
            pass_num,
            polished_score.total,
            polished_score.total - best_score.total,
            polished_score.decision,
        )
        if on_pass:
            try:
                on_pass(pass_num, polished_score)
            except Exception:
                pass

        # Only accept polish if it actually improved the score
        if polished_score.total > best_score.total:
            best_result, best_score = polished, polished_score
        else:
            logger.info(
                "Pass %d did not improve (%d <= %d); keeping previous.",
                pass_num,
                polished_score.total,
                best_score.total,
            )
            break

    # Marshal score back into GenerationResult shape
    best_result.ats_score = best_score.total
    best_result.ats_breakdown = AtsBreakdown(
        keyword=best_score.keyword,
        experience=best_score.requirements,
        skills=best_score.semantic,
        format=best_score.format,
        impact=best_score.impact,
        decision=best_score.decision,
        gaps=best_score.gaps,
    )
    best_result.pass_num = best_score and best_result.pass_num
    return best_result


# ---------------------------------------------------------------------------
# Smart snippet extraction for screening (compress long JDs)
# ---------------------------------------------------------------------------
def smart_snippet(text: str, keywords: List[str] = None, positions: List[str] = None) -> str:
    if not text or len(text) <= 1200:
        return text

    stack_terms = list({
        *[re.escape(k) for k in (keywords or [])],
        *[re.escape(p) for p in (positions or [])],
    })
    stack_pattern = "|".join(stack_terms) if stack_terms else None

    patterns = [
        r"\d+\+?\s*(years|yrs|year)",
        r"(Requirements|Qualifications|What you.ll need|Experience in|Must.have|Nice.to.have)",
        r"(Remote|On-site|Hybrid|Visa|Sponsorship)",
    ]
    if stack_pattern:
        patterns.append(stack_pattern)

    hot_zones = []
    for pattern in patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            start = max(0, match.start() - 80)
            end = min(len(text), match.end() + 120)
            snippet = text[start:end].strip()
            if not any(snippet in existing for existing in hot_zones):
                hot_zones.append(f"...{snippet}...")
            if len(" ".join(hot_zones)) > 700:
                break

    if not hot_zones:
        return text[:300] + "\n[...]\n" + text[-900:]

    return text[:200] + "\n\n[KEY SECTIONS]\n" + "\n".join(hot_zones)


# ---------------------------------------------------------------------------
# Job screening (Haiku — fast, cheap, bulk)
#
# Uses Anthropic prompt caching: the system prompt (instructions + profile +
# full CV) is marked with cache_control so it's cached for 5 minutes.
# Batch 1 pays the cache-write premium (~25% more on that block), but
# batches 2-N hit the cache at 90% discount ($0.10/MTok vs $1/MTok).
#
# This means we can send the FULL CV instead of a lossy 600-char summary,
# and screening 200 jobs in 10 batches is actually cheaper than before.
# ---------------------------------------------------------------------------
def screen_jobs(
    jobs: List[dict],
    positions: List[str],
    profile: dict,
    base_cv: str = "",
) -> List[dict]:
    """Screen a list of jobs for relevance.

    Returns list of {id, fit, score, reason, archetype}.
    """
    position_labels = ", ".join(positions)
    seniority = profile.get("seniority", "")
    years_exp = profile.get("totalYearsExperience")
    keywords = profile.get("keywords_list", [])
    languages = profile.get("languages_list", [])
    narrative = profile.get("narrative", "")
    deal_breakers = profile.get("deal_breakers", [])
    preferred_locations = profile.get("preferred_locations", [])

    archetype_list = ", ".join(ARCHETYPES.keys())

    # --- Build the stable system block (cached across batches) ---
    profile_lines = f"Target roles: {position_labels}\nSeniority: {seniority or 'not specified'}"
    if years_exp is not None:
        profile_lines += f"\nYears of experience: {years_exp}"
    if keywords:
        profile_lines += "\nKey skills: " + ", ".join(keywords)
    if languages:
        lang_str = ", ".join(f"{l['name']} ({l['level']})" for l in languages)
        profile_lines += f"\nLanguages: {lang_str}"
    if preferred_locations:
        profile_lines += f"\nPreferred locations: {', '.join(preferred_locations)}"
    if narrative:
        profile_lines += f"\nCareer narrative: {narrative}"

    cv_block = ""
    if base_cv:
        cv_block = f"\n\n### CANDIDATE CV (full) ###\n{base_cv}"

    deal_breaker_rules = ""
    if deal_breakers:
        db_lines = "\n".join(f"- {db}" for db in deal_breakers)
        deal_breaker_rules = f"\n\nCANDIDATE DEAL-BREAKERS (auto-irrelevant if the job matches any of these):\n{db_lines}"

    instructions = (
        "For each job, provide:\n"
        "1. **fit**: \"good_fit\", \"maybe\", or \"irrelevant\"\n"
        "2. **score**: 1-5 relevance score (5=perfect match, 4=strong, 3=decent, 2=weak, 1=no fit)\n"
        "3. **reason**: one sentence explaining why (max 20 words)\n"
        f"4. **archetype**: classify the role into one of: {archetype_list}\n\n"
        "SCORING RULES:\n"
        "- 4.5-5.0: Role, seniority, and tech stack all align perfectly. Recommend applying.\n"
        "- 3.5-4.4: Good match with minor gaps. Worth considering.\n"
        "- 2.5-3.4: Partial match -- different specialization or slightly off seniority.\n"
        "- 1.0-2.4: Poor match -- wrong domain, wrong seniority, or missing critical skills.\n\n"
        "HARD RULES:\n"
        "- If the job requires a mandatory technology/domain NOT in the candidate's skills or CV -> score <=2, fit=irrelevant\n"
        "- If seniority is way off (e.g. candidate is mid-level, job needs 8+ years) -> score <=2, fit=irrelevant\n"
        "- If a deal-breaker matches -> score=1, fit=irrelevant, mention the deal-breaker in reason\n"
        "- score >= 4.0 -> fit=good_fit\n"
        "- score 2.5-3.9 -> fit=maybe\n"
        "- score < 2.5 -> fit=irrelevant\n\n"
        'Output ONLY a JSON array: [{"id":"...","fit":"good_fit","score":4.2,"reason":"Strong Python/React match, seniority aligns","archetype":"backend"}, ...]'
    )

    # This block is stable across all batches for the same user — prime for caching
    cached_system_text = (
        "You are a job relevance screener. You evaluate how well each job matches the candidate.\n\n"
        "### CANDIDATE PROFILE ###\n"
        + profile_lines
        + cv_block
        + deal_breaker_rules
        + "\n\n### INSTRUCTIONS ###\n"
        + instructions
    )

    # Use system message with cache_control so Anthropic caches it
    system_messages = [
        {
            "type": "text",
            "text": cached_system_text,
            "cache_control": {"type": "ephemeral"},
        }
    ]

    BATCH = 20
    results = []

    for i in range(0, len(jobs), BATCH):
        batch = jobs[i : i + BATCH]
        job_list = "\n\n---\n\n".join(
            f"ID:{j['id']} | \"{j['title']}\" at {j['company']}"
            + (f" | {j.get('location', '')}" if j.get('location') else "")
            + f"\n{smart_snippet(j.get('description') or '', keywords=keywords, positions=positions)}"
            for j in batch
        )

        # Only the job list changes per batch — the system block is cached
        user_message = f"### JOBS TO SCREEN ###\n{job_list}"

        response = client.messages.create(
            model=SCREENING_MODEL,
            max_tokens=4096,
            system=system_messages,
            messages=[{"role": "user", "content": user_message}],
        )

        raw = (
            response.content[0].text.strip()
            if response.content[0].type == "text"
            else "[]"
        )
        stripped = _strip_fences(raw)
        try:
            batch_results = json.loads(stripped)
        except json.JSONDecodeError:
            # Claude sometimes returns multiple JSON objects instead of an array
            # Try wrapping in array brackets or parsing line by line
            try:
                batch_results = json.loads(f"[{stripped}]")
            except json.JSONDecodeError:
                # Parse individual JSON objects separated by newlines
                batch_results = []
                for match in re.finditer(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', stripped):
                    try:
                        batch_results.append(json.loads(match.group()))
                    except json.JSONDecodeError:
                        continue
        if isinstance(batch_results, dict):
            batch_results = [batch_results]
        results.extend(batch_results)

    return results

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import List, Optional

import anthropic

from ..core.config import settings

client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

# ---------------------------------------------------------------------------
# Model selection: Haiku for cheap bulk screening, Sonnet for quality generation
# ---------------------------------------------------------------------------
SCREENING_MODEL = "claude-haiku-4-5-20251001"
GENERATION_MODEL = "claude-haiku-4-5-20251001"

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
AGENT_SYSTEM_PROMPT = f"""You are a professional CV writer and ATS optimization expert. You generate tailored resumes and cover letters.

CANDIDATE WORK HISTORY (NEVER reorder jobs -- strict reverse chronological):
1. Odoo -- client-facing, enterprise implementations, technical escalations
  Dynamic title rule for Odoo ONLY: if target job is Software Engineer / Full-Stack / Frontend / Backend / Developer -> use "Software Engineer"; otherwise (Solutions, Consulting, Pre-Sales, Implementation, etc.) -> use "Technical Solutions Consultant"
2. Meikosoft -- pure backend, high-volume transactions, IoT (title NEVER changes)
3. Edenred (title NEVER changes)
NEVER change any other job title, company name, or employment date.

WRITER MODE RULES:
- PRESERVE the base CV structure exactly -- same sections, same roles, same order
- BULLET COUNT IS FIXED: keep the exact same number of bullets per role as the base CV -- never add or remove bullets
- SPATIAL CONSTRAINT: Experience section must not exceed 25 lines total. If Odoo has 6 bullets, at least 4 must be single-line bullets. Prioritize conciseness over detail.
- BULLET LENGTH: max 1 line per bullet unless it was already 2 lines in the base CV -- never expand
- Allowed changes: rephrase bullet wording to match JD keywords, reorder bullets within a role (most relevant first), update Summary (max 2 lines), adjust Skill keywords
- Never invent projects, metrics, or experience not in the base CV
- The base CV fits exactly 1 page -- any addition will overflow. Do not add anything.

KEYWORD INJECTION (ethical, truth-based reformulation):
When the JD uses specific terminology, reformulate EXISTING experience to match. Examples:
- JD says "CI/CD pipelines" and CV says "automated deployment" -> "CI/CD pipeline automation"
- JD says "stakeholder management" and CV says "collaborated with teams" -> "stakeholder management across engineering, product, and operations"
- JD says "RESTful APIs" and CV says "built web services" -> "designed and shipped RESTful APIs"
- JD says "observability" and CV says "monitoring and logging" -> "observability (monitoring, logging, alerting)"
NEVER add skills or experience the candidate does not have. Only reformulate what exists.

VARY SENTENCE STRUCTURE:
- Don't start every bullet with the same verb pattern
- Mix sentence lengths: short. Then longer with context. Short again.
- Don't always use "X, Y, and Z" -- sometimes two items, sometimes four

COVER LETTER RULES:
- Max 300 words. P1 hook, P2 2-3 metrics, P3 close.
- Bold key metrics and company/role names using **bold**.
- Use the candidate's LinkedIn/GitHub URLs from the profile if provided -- never guess or invent URLs.
- TONE: Position as "I'm choosing you" -- the candidate has options and is selecting this company for specific reasons.
- Lead with proof, not claims: "I built X that does Y" not "I'm great at X"
- Reference something SPECIFIC from the JD and map it to something SPECIFIC from the CV.
- No generic "I would love the opportunity" -- name the actual reason.

ATS SCORING (total 100):
- Keyword match: 40pts
- Experience alignment: 25pts
- Skills coverage: 15pts
- Format: 10pts
- Impact: 10pts

DECISION LOGIC:
- >=85 -> APPROVED
- 70-84 -> NEEDS_REVISION
- <70 -> REJECTED

FORBIDDEN WORDS: {', '.join(FORBIDDEN_WORDS)}
FORBIDDEN PHRASES: {' | '.join(FORBIDDEN_PHRASES)}
FORBIDDEN STYLE: No em dashes, semicolons, exclamation marks. No generic openings. No hedging.

OUTPUT FORMAT (strict):
## RESUME
A JSON object with these fields (no markdown fences, just raw JSON):
{{
  "summary": "tailored professional summary (max 2 lines)",
  "competencies": ["keyword phrase 1", "keyword phrase 2", ... (6-8 from JD matching candidate skills)],
  "experience": [
    {{"company": "...", "title": "...", "location": "...", "period": "...", "bullets": ["...", "..."]}}
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
    {{"category": "...", "items": ["...", "..."]}}
  ]
}}

IMPORTANT: The experience array must have the SAME jobs in the SAME order as the base CV. Each job must have the SAME number of bullets. Only rephrase wording and reorder bullets within each job.

## COVER LETTER
[cover letter text, plain -- sign off with the candidate's real name, never use placeholders like [Candidate Name] or [Your Name]]

## ATS SCORE
Score: [number]/100
Keyword: [n]/40 | Experience: [n]/25 | Skills: [n]/15 | Format: [n]/10 | Impact: [n]/10
Decision: APPROVED | NEEDS_REVISION | REJECTED
Gaps: [comma separated missing keywords or requirements]

Terse. No explanations, no chatter.
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


def _parse_agent_output(text: str, pass_num: int) -> GenerationResult:
    resume_match = re.search(
        r"##\s*RESUME\s*\n([\s\S]*?)(?=##\s*COVER LETTER)", text, re.IGNORECASE
    )
    cl_match = re.search(
        r"##\s*COVER LETTER\s*\n([\s\S]*?)(?=##\s*ATS SCORE)", text, re.IGNORECASE
    )
    ats_match = re.search(r"##\s*ATS SCORE\s*\n([\s\S]*?)$", text, re.IGNORECASE)

    # Parse resume as JSON
    resume_raw = _strip_fences(resume_match.group(1) if resume_match else "{}")
    try:
        resume_data = json.loads(resume_raw)
    except json.JSONDecodeError:
        # Try to extract JSON object from within the text
        json_match = re.search(r"\{[\s\S]*\}", resume_raw)
        if json_match:
            resume_data = json.loads(json_match.group(0))
        else:
            resume_data = {}

    cover_letter = _strip_fences(cl_match.group(1) if cl_match else "")
    ats_block = ats_match.group(1).strip() if ats_match else ""

    score_m = re.search(r"Score:\s*(\d+)", ats_block)
    keyword_m = re.search(r"Keyword:\s*(\d+)", ats_block)
    experience_m = re.search(r"Experience:\s*(\d+)", ats_block)
    skills_m = re.search(r"Skills:\s*(\d+)", ats_block)
    format_m = re.search(r"Format:\s*(\d+)", ats_block)
    impact_m = re.search(r"Impact:\s*(\d+)", ats_block)
    decision_m = re.search(r"Decision:\s*(APPROVED|NEEDS_REVISION|REJECTED)", ats_block)
    gaps_m = re.search(r"Gaps:\s*(.+)", ats_block)

    gaps = (
        [g.strip() for g in gaps_m.group(1).split(",") if g.strip()] if gaps_m else []
    )

    return GenerationResult(
        resume=resume_data,
        cover_letter=cover_letter,
        ats_score=int(score_m.group(1)) if score_m else 0,
        ats_breakdown=AtsBreakdown(
            keyword=int(keyword_m.group(1)) if keyword_m else 0,
            experience=int(experience_m.group(1)) if experience_m else 0,
            skills=int(skills_m.group(1)) if skills_m else 0,
            format=int(format_m.group(1)) if format_m else 0,
            impact=int(impact_m.group(1)) if impact_m else 0,
            decision=decision_m.group(1) if decision_m else "NEEDS_REVISION",
            gaps=gaps,
        ),
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

    # Build archetype-specific hint
    archetype_hint = ""
    if archetype and archetype in ARCHETYPE_GENERATION_HINTS:
        archetype_hint = (
            f"\n\nROLE ARCHETYPE: {archetype.upper()}\n"
            f"{ARCHETYPE_GENERATION_HINTS[archetype]}\n"
            f"Adapt the Professional Summary, bullet reordering, and cover letter framing to this archetype."
        )

    # Build narrative context
    narrative_block = ""
    if narrative:
        narrative_block = (
            f"\n\nCANDIDATE NARRATIVE (use this to frame the summary and cover letter):\n{narrative}"
        )

    base_cv_str = json.dumps(base_cv, indent=2)

    if pass_num == 1:
        user_message = (
            f"CANDIDATE NAME: {name}\nJOB: {job_title} at {company}\n\n"
            f"JOB DESCRIPTION:\n{job_description}\n{profile}{archetype_hint}{narrative_block}{url_instruction}\n"
            f"MY BASE CV (structured JSON):\n{base_cv_str}\n\n"
            f"Generate tailored resume JSON + cover letter + ATS score. IMPORTANT: Keep the same jobs, same bullet counts. Only rephrase wording and reorder bullets within each job."
        )
    else:
        prev_str = json.dumps(previous_resume, indent=2) if isinstance(previous_resume, dict) else str(previous_resume)
        user_message = (
            f"CANDIDATE NAME: {name}\nJOB: {job_title} at {company}\n\n"
            f"JOB DESCRIPTION:\n{job_description}\n{profile}{archetype_hint}{narrative_block}{url_instruction}\n"
            f"PREVIOUS RESUME (Pass {pass_num - 1}, Score: {previous_score}/100):\n{prev_str}\n\n"
            f"Revise to improve ATS score. Focus on gaps. Do NOT add or remove bullets -- only rephrase."
        )

    # Cache the system prompt — same across all jobs for this user
    response = client.messages.create(
        model=GENERATION_MODEL,
        max_tokens=4096,
        system=[
            {
                "type": "text",
                "text": AGENT_SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user_message}],
    )

    text = response.content[0].text if response.content[0].type == "text" else ""
    return _parse_agent_output(text, pass_num)


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
        batch_results = json.loads(_strip_fences(raw))
        results.extend(batch_results)

    return results

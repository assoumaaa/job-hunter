from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import List, Optional

import anthropic

from ..core.config import settings

client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

FORBIDDEN_WORDS = [
    "delve",
    "synergy",
    "spearhead",
    "passionate",
    "cutting-edge",
    "robust",
    "innovative",
    "holistic",
    "empower",
    "foster",
    "tapestry",
    "unlock",
    "game-changer",
]

FORBIDDEN_PHRASES = [
    "I am excited to apply",
    "results-driven",
    "proven track record",
    "dynamic team player",
    "Responsible for",
]

AGENT_SYSTEM_PROMPT = f"""
You are a professional CV writer and ATS expert. You generate tailored resumes and cover letters.

CANDIDATE WORK HISTORY (NEVER reorder jobs — strict reverse chronological):
1. Odoo — client-facing, enterprise implementations, technical escalations
  Dynamic title rule for Odoo ONLY: if target job is Software Engineer / Full-Stack / Frontend / Backend / Developer → use "Software Engineer"; otherwise (Solutions, Consulting, Pre-Sales, Implementation, etc.) → use "Technical Solutions Consultant"
2. Meikosoft — pure backend, high-volume transactions, IoT (title NEVER changes)
3. Edenred (title NEVER changes)
NEVER change any other job title, company name, or employment date.

WRITER MODE RULES:
- PRESERVE the base CV structure exactly — same sections, same roles, same order
- BULLET COUNT IS FIXED: keep the exact same number of bullets per role as the base CV — never add or remove bullets
- SPATIAL CONSTRAINT: Experience section must not exceed 25 lines total. If Odoo has 6 bullets, at least 4 must be single-line bullets. Prioritize conciseness over detail.
- BULLET LENGTH: max 1 line per bullet unless it was already 2 lines in the base CV — never expand
- Allowed changes: rephrase bullet wording to match JD keywords, reorder bullets within a role (most relevant first), update Summary (max 2 lines), adjust Skill keywords
- Never invent projects, metrics, or experience not in the base CV
- The base CV fits exactly 1 page — any addition will overflow. Do not add anything.
- Cover letter: max 300 words. P1 hook, P2 2-3 metrics, P3 close. Match tone. Bold key metrics and company/role names using **bold**. Use the candidate's LinkedIn/GitHub URLs from the profile if provided — never guess or invent URLs.

ATS SCORING (total 100):
- Keyword match: 40pts
- Experience alignment: 25pts
- Skills coverage: 15pts
- Format: 10pts
- Impact: 10pts

DECISION LOGIC:
- ≥85 → APPROVED
- 70-84 → NEEDS_REVISION
- <70 → REJECTED

FORBIDDEN WORDS: {', '.join(FORBIDDEN_WORDS)}
FORBIDDEN PHRASES: {' | '.join(FORBIDDEN_PHRASES)}
FORBIDDEN STYLE: No em dashes, semicolons, exclamation marks. No generic openings. No hedging.

OUTPUT FORMAT (strict):
## RESUME
[tailored LaTeX body sections ONLY — no preamble, no document commands, no header/contact block — start directly from the first section command]

## COVER LETTER
[cover letter text, plain — sign off with the candidate's real name, never use placeholders like [Candidate Name] or [Your Name]]

## ATS SCORE
Score: [number]/100
Keyword: [n]/40 | Experience: [n]/25 | Skills: [n]/15 | Format: [n]/10 | Impact: [n]/10
Decision: APPROVED | NEEDS_REVISION | REJECTED
Gaps: [comma separated missing keywords or requirements]

Terse. No explanations, no chatter.
"""


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
    resume: str
    cover_letter: str
    ats_score: int
    ats_breakdown: AtsBreakdown
    pass_num: int


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

    resume = _strip_fences(resume_match.group(1) if resume_match else "")
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
        resume=resume,
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


def generate_cv_and_cl(
    base_cv: str,
    job_description: str,
    job_title: str,
    company: str,
    pass_num: int = 1,
    previous_resume: Optional[str] = None,
    previous_score: Optional[int] = None,
    profile_context: Optional[str] = None,
    candidate_name: Optional[str] = None,
    linkedin_url: Optional[str] = None,
    github_url: Optional[str] = None,
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

    if pass_num == 1:
        user_message = (
            f"CANDIDATE NAME: {name}\nJOB: {job_title} at {company}\n\n"
            f"JOB DESCRIPTION:\n{job_description}\n{profile}{url_instruction}\n"
            f"MY BASE CV:\n{base_cv}\n\n"
            f"Generate tailored resume + cover letter + ATS score. IMPORTANT: The base CV fits exactly 1 page. Keep bullet counts and lengths identical — only rephrase wording."
        )
    else:
        user_message = (
            f"CANDIDATE NAME: {name}\nJOB: {job_title} at {company}\n\n"
            f"JOB DESCRIPTION:\n{job_description}\n{profile}{url_instruction}\n"
            f"PREVIOUS RESUME (Pass {pass_num - 1}, Score: {previous_score}/100):\n{previous_resume}\n\n"
            f"Revise to improve ATS score. Focus on gaps. Do NOT add bullets or expand bullet length — only rephrase."
        )

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4000,
        system=AGENT_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    text = response.content[0].text if response.content[0].type == "text" else ""
    return _parse_agent_output(text, pass_num)


def smart_snippet(text: str, keywords: List[str] = None, positions: List[str] = None) -> str:
    if not text or len(text) <= 1200:
        return text

    # Build tech stack pattern from profile keywords + position labels
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


def screen_jobs(jobs: List[dict], positions: List[str], profile: dict) -> List[dict]:
    """Screen a list of jobs for relevance. Returns list of {id, fit}."""
    position_labels = ", ".join(positions)
    seniority = profile.get("seniority", "")
    years_exp = profile.get("totalYearsExperience")
    keywords = profile.get("keywords_list", [])
    languages = profile.get("languages_list", [])

    BATCH = 20
    results = []

    for i in range(0, len(jobs), BATCH):
        batch = jobs[i : i + BATCH]
        job_list = "\n\n---\n\n".join(
            f"ID:{j['id']} | \"{j['title']}\" at {j['company']}\n{smart_snippet(j.get('description') or '', keywords=keywords, positions=positions)}"
            for j in batch
        )

        profile_lines = f"Target roles: {position_labels}\nSeniority: {seniority or 'not specified'}"
        if years_exp is not None:
            profile_lines += f"\nYears of experience: {years_exp}"
        if keywords:
            profile_lines += "\nKey skills: " + ", ".join(keywords)
        if languages:
            lang_str = ", ".join(f"{l['name']} ({l['level']})" for l in languages)
            profile_lines += f"\nLanguages: {lang_str}"

        prompt = (
            "You are a job relevance screener.\n\n"
            "### CANDIDATE PROFILE ###\n"
            + profile_lines
            + "\n\n### JOBS TO SCREEN ###\n"
            + job_list
            + '\n\n### INSTRUCTIONS ###\n'
            'Classify each job as "good_fit", "maybe", or "irrelevant".\n'
            "Hard rules:\n"
            "- If the job requires a mandatory technology or domain NOT in the candidate's skills, classify as \"irrelevant\".\n"
            "- If seniority is way off (e.g. candidate is mid-level, job requires 8+ years), classify as \"irrelevant\".\n"
            "- \"maybe\" = related field but partial mismatch (different specialization, slightly off seniority).\n"
            "- \"good_fit\" = role, seniority, and tech stack all align with candidate profile.\n"
            'Output ONLY a JSON array: [{"id":"...","fit":"good_fit"}, ...]'
        )

        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )

        raw = (
            response.content[0].text.strip()
            if response.content[0].type == "text"
            else "[]"
        )
        batch_results = json.loads(_strip_fences(raw))
        results.extend(batch_results)

    return results

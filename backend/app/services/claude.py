from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass

from . import ats_scorer, llm
from .llm import extract_json as _extract_json
from .llm import strip_fences as _strip_fences

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Model selection: Haiku for cheap bulk screening, Sonnet for quality generation.
# The two tiers are owned by the llm module and resolved per request (per-user
# choice → config default); call `llm.screening_model()` / `llm.generation_model()`
# at each call site so a user's Settings choice takes effect.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Forbidden words/phrases for generated text
# ---------------------------------------------------------------------------
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
    "leverage",
    "utilize",
    "facilitate",
    "seamless",
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
    "fde": "Forward Deployed / Field Engineering — customer-embedded engineers shipping production (often AI) systems in real operational environments; hybrid of engineering and delivery",
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
    "fde": "Prioritize: shipped production systems, full-cycle delivery from requirements to deployment, hands-on AI/LLM engineering, cross-layer debugging. Client-facing and pre-sales bullets come AFTER engineering proof — FDE hiring managers screen for engineers first.",
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
The output CV MUST FILL exactly 1 page — no more, and no less. Target 90-100%
of the page. A half-empty page reads as a thin resume and is just as wrong as
an overflow, so do NOT shorten to be safe: when the space is there, prefer the
base CV's fuller wording over a shorter paraphrase.
- Summary: 2-3 lines (~200 characters)
- Bullets can wrap to 2 lines — that's fine. But avoid wrapping where just 1-2 words spill to line 2. Either make it fit 1 line or fill out 2 full lines with more useful detail.
- If the base CV has projects, select ONLY the top 3 most relevant to this JD. Drop the rest.
- Education and certifications: 1 line each, but keep the base CV's full degree name and full date range — never abbreviate them.
- Skills: 3-4 categories (do NOT put Languages in skills — languages are handled separately). Each category should fill its line.

### Structure rules
- PRESERVE the same jobs in the same reverse-chronological order
- BULLET COUNT IS FIXED: keep the exact same number of bullets per role as the base CV -- never add or remove bullets
- NEVER invent projects, metrics, or experience not in the base CV

### Role-type decision (make it ONCE, apply it EVERYWHERE)
Classify the target role into exactly one type:
- ENGINEERING: the role centers on building/deploying production software (Software Engineer, Full-Stack, Frontend, Backend, Developer)
- SOLUTIONS: the role is solutions/consulting/pre-sales/implementation/client-facing
This single decision drives BOTH the dynamic title rule and the summary descriptor below. They must never disagree.

### Dynamic title rule (Odoo ONLY)
ENGINEERING -> the Odoo job title becomes "Software Engineer"
SOLUTIONS -> the Odoo job title becomes "Technical Solutions Consultant"
All other job titles NEVER change.

### Keyword injection strategy (ethical, truth-based)
Distribute the extracted keywords deliberately:
- Summary: inject top 5 keywords naturally
- First bullet of each role: inject 1-2 keywords
- Skills section: mirror JD terminology ONLY for skills the base CV already claims. NEVER add a tool, framework, cloud provider, or practice the base CV does not list — not even if the JD stresses it. Rephrasing a real skill in the JD's words is fine; adding an unclaimed one is a fabrication and disqualifies the candidate.
- Reformulate existing experience with JD vocabulary. Examples:
  - JD says "CI/CD pipelines", CV says "automated deployment" -> "CI/CD pipeline automation"
  - JD says "stakeholder management", CV says "collaborated with teams" -> "stakeholder management across engineering, product, and operations"
  - JD says "RESTful APIs", CV says "built web services" -> "designed and shipped RESTful APIs"
  - JD says "RAG pipelines", CV says "LLM workflows with retrieval" -> "RAG pipeline design and LLM orchestration"
NEVER add skills the candidate does not have. Only reformulate what exists.

### Archetype-based framing
Reorder bullets within each role so the most relevant to the detected archetype come first.
Frame the summary to position the candidate for this specific archetype.
For hybrid roles (Forward Deployed, Solutions Engineer) where the JD's Required Qualifications are engineering-heavy: bullets proving shipped production software come FIRST in every role; pre-sales/consulting bullets come last. Hiring managers for these roles screen for engineers first.

### Employer-domain emphasis
Identify the employer's industry/domain from the JD (cybersecurity, fintech, healthcare, logistics, ...). Surface every truthful base-CV item related to that domain — e.g. for a cybersecurity employer: authentication, access control, secure deployment, audit — and pull it forward in the summary and early bullets. NEVER invent domain experience the base CV does not contain.

### Summary rules (CRITICAL)
- The summary MUST open with a role descriptor that is EXACTLY the title of the FIRST (most recent) experience entry in your output. First job says "Software Engineer" -> summary starts "Software Engineer with...". First job says "Technical Solutions Consultant" -> summary starts "Technical Solutions Consultant with...". The summary descriptor and the first job title must NEVER disagree.
- NEVER copy the target job title as if it is the candidate's current role (e.g. don't say "Forward Deployed Engineer with 4 years...") — the descriptor comes from the first job title, nothing else.
- Both descriptors are truthful for this candidate; the role-type decision above picks which one fits the target role.

### Writing quality
- Every bullet starts with a single, correctly conjugated action verb (Led, Built, Shipped, Engineered) — never a noun phrase or headless verb like "Tech led"
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
class GenerationResult:
    resume: dict  # structured CV JSON (experience, summary, competencies, etc.)
    cover_letter: str
    pass_num: int
    ats: ats_scorer.AtsScore | None = None  # the one score value, whole

    @property
    def ats_score(self) -> int:
        """Total score, or 0 before the resume has been scored."""
        return self.ats.total if self.ats else 0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _parse_agent_output(text: str, pass_num: int) -> GenerationResult:
    resume_match = re.search(
        r"##\s*RESUME\s*\n([\s\S]*?)(?=##\s*COVER LETTER)", text, re.IGNORECASE
    )
    # Cover letter goes to end of text (no trailing ATS section anymore)
    cl_match = re.search(r"##\s*COVER LETTER\s*\n([\s\S]*?)$", text, re.IGNORECASE)

    # Extract keywords and archetype (informational, stored for logging)
    kw_match = re.search(
        r"##\s*KEYWORDS\s*\n(.*?)(?=##)", text, re.IGNORECASE | re.DOTALL
    )
    arch_match = re.search(
        r"##\s*ARCHETYPE\s*\n(.*?)(?=##)", text, re.IGNORECASE | re.DOTALL
    )
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
        logger.warning(
            "Resume data missing experience. Keys: %s", list(resume_data.keys())
        )

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
            cl_text = re.sub(
                r"^##\s*COVER LETTER\s*\n?", "", remainder, flags=re.IGNORECASE
            ).strip()
        else:
            cl_text = ""
        cover_letter = cl_text
    else:
        cover_letter = ""

    # Score is not parsed from the generator anymore — see ats_scorer
    return GenerationResult(
        resume=resume_data,
        cover_letter=cover_letter,
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
    previous_resume: dict | None = None,
    previous_score: int | None = None,
    profile_context: str | None = None,
    candidate_name: str | None = None,
    linkedin_url: str | None = None,
    github_url: str | None = None,
    archetype: str | None = None,
    narrative: str | None = None,
    reviewer_feedback: str | None = None,
) -> GenerationResult:
    profile = profile_context or ""
    name = candidate_name or "Candidate"

    url_lines = [
        f"CANDIDATE LINKEDIN: {linkedin_url}" if linkedin_url else "",
        f"CANDIDATE GITHUB: {github_url}" if github_url else "",
    ]
    url_block = "\n".join(line for line in url_lines if line)
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
        narrative_block = f"\n\nCANDIDATE NARRATIVE (use this to frame the summary and cover letter):\n{narrative}"

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
        prev_str = (
            json.dumps(previous_resume, indent=2)
            if isinstance(previous_resume, dict)
            else str(previous_resume)
        )
        feedback_block = f"\n\n{reviewer_feedback}\n" if reviewer_feedback else ""
        user_message = (
            f"JOB: {job_title} at {company}\n\n"
            f"JOB DESCRIPTION:\n{job_description}{archetype_hint}\n\n"
            f"PREVIOUS RESUME (Pass {pass_num - 1}, Score: {previous_score}/100):\n{prev_str}"
            f"{feedback_block}\n"
            f"Apply the reviewer feedback verbatim where possible. Do NOT add or remove bullets — only rephrase."
        )

    # Two cache breakpoints: system prompt (global) + candidate context (per-user).
    # Both stay warm across passes and across all jobs for the same user.
    text = llm.complete_text(
        model=llm.generation_model(),
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
        f"- Do NOT change job titles or the summary's opening role descriptor.\n"
        f"- Preserve specific metrics, numbers, tool/tech names, project names, company names.\n"
        f"- Prefer cutting from the LONGEST bullets first.\n\n"
        f"RESUME JSON:\n{resume_json}\n\n"
        f"Output the shortened JSON object now:"
    )

    text = llm.complete_text(
        model=llm.screening_model(),
        max_tokens=4096,
        system=system,
        messages=[{"role": "user", "content": user}],
    ).strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        logger.warning(
            "trim_resume_for_fit: JSON parse failed (%s); returning original.", e
        )
        return resume


def select_conditional_bullets(job_description: str, conditions: list[str]) -> list[bool]:
    """For each plain-English inclusion condition, decide whether the job matches
    (i.e. the bullet should be included). Defaults to include-all on any failure —
    better to keep a bullet than silently drop it."""
    if not conditions:
        return []
    numbered = "\n".join(f"{i + 1}. {c}" for i, c in enumerate(conditions))
    system = (
        "You decide which of a candidate's resume bullets to include for a job. "
        "Each bullet has a plain-English condition describing when it is relevant. "
        "Return true if the job matches the condition (include the bullet), else false."
    )
    user = (
        f"JOB DESCRIPTION:\n{job_description.strip() or '(none provided)'}\n\n"
        f"CONDITIONS:\n{numbered}\n\n"
        f"Return ONLY a JSON array of {len(conditions)} booleans, one per condition in order."
    )
    try:
        text = llm.complete_text(
            model=llm.screening_model(),
            max_tokens=512,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        data = json.loads(_strip_fences(text))
        if isinstance(data, list) and len(data) == len(conditions):
            return [bool(x) for x in data]
    except Exception as e:  # noqa: BLE001
        logger.warning("select_conditional_bullets failed (%s); including all.", e)
    return [True] * len(conditions)


# ---------------------------------------------------------------------------
# Edit-a-CV chat: a real back-and-forth over an already-generated CV or CL.
#
# Uses Sonnet (GENERATION_MODEL) — this needs judgment, not mechanical
# find-and-replace. The assistant answers with a forced `respond` tool call so
# we get a clean split between what it SAYS to the candidate (`message` — which
# may be a clarifying question) and the edited document (`updated_cv` /
# `updated_cl`, present only when it actually changes something). Conversation
# history + the job description are both in context, so the assistant can ask
# before inventing and align edits to the JD.
# ---------------------------------------------------------------------------
_CHAT_CV_SYSTEM = (
    "You help a candidate refine ONE tailored resume for ONE specific job, in a "
    "back-and-forth chat. You always reply by calling the `respond` tool.\n\n"
    "Each turn, choose what to do:\n"
    "- ASK when the request depends on facts only the candidate knows — a title "
    "they actually held, whether they had formal authority over people, whether "
    "they worked with a given function, a concrete example to cite. Put the "
    "question in `message` and DO NOT include `updated_cv`.\n"
    "- EDIT when you have what you need. Put a short plain-English summary of the "
    "changes in `message` AND the FULL edited resume JSON in `updated_cv`.\n"
    "- You may do BOTH across a request: apply the parts you can honestly do now "
    "and ask about the parts you cannot. A big multi-part request is normal — "
    "work through it, edit what is supported, and ask about the rest instead of "
    "silently dropping it.\n\n"
    "HARD RULES:\n"
    "- When you include `updated_cv`, it MUST be the COMPLETE resume JSON with the "
    "EXACT same top-level keys and overall shape as the current resume — never a "
    "fragment or a diff.\n"
    "- NEVER invent employers, titles the candidate did not hold, projects, "
    "metrics, certifications, or skills. The BASE CV is the source of truth for "
    "what is real. If a request needs a fact you cannot confirm from the base CV "
    "or from what the candidate has told you in this chat, ASK — do not write it.\n"
    "- Distinguish 'managed' (formal authority: direct reports, performance "
    "reviews, hiring input) from 'led'/'mentored' (technical or project "
    "leadership without reports). Use the candidate's own answer; if you do not "
    "know which it was, ask before writing either.\n"
    "- Honor explicit structural edits (add/remove/reorder bullets, drop or add "
    "sections, retitle) within the honesty rule above.\n"
    "- The summary's opening role descriptor must stay identical to the title of "
    "the first (most recent) experience entry. If one changes, change the other.\n"
    "- Use the JOB DESCRIPTION to guide relevance and wording, but only surface "
    "experience the candidate truly has.\n"
    "- Keep it to one page and ATS-plain: no tables or graphics, lead bullets "
    "with action verbs, prefer specific metrics, cut filler, and use no em "
    "dashes, semicolons, or exclamation marks."
)

_CHAT_CL_SYSTEM = (
    "You help a candidate refine ONE cover letter for ONE specific job, in a "
    "back-and-forth chat. You always reply by calling the `respond` tool.\n\n"
    "Each turn, choose what to do:\n"
    "- ASK when the request depends on facts only the candidate knows. Put the "
    "question in `message` and DO NOT include `updated_cl`.\n"
    "- EDIT when you have what you need. Put a short summary in `message` AND the "
    "full rewritten cover letter text in `updated_cl`.\n\n"
    "HARD RULES:\n"
    "- NEVER invent experience, employers, projects, or metrics not supported by "
    "the BASE CV or by what the candidate tells you in this chat. Ask instead.\n"
    "- Preserve any URLs already in the sign-off unless asked to change them.\n"
    "- Use the JOB DESCRIPTION to ground the letter in this specific role.\n"
    "- No em dashes, semicolons, or exclamation marks."
)

_CHAT_CV_TOOL = {
    "name": "respond",
    "description": (
        "Reply to the candidate. Always provide `message`. Include `updated_cv` "
        "only when you are actually editing the resume this turn."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "message": {
                "type": "string",
                "description": (
                    "Your plain-English reply: a clarifying question, or a short "
                    "summary of what you changed and why."
                ),
            },
            "updated_cv": {
                "type": "object",
                "description": (
                    "The COMPLETE edited resume JSON, same top-level keys and "
                    "shape as the current resume. Omit entirely when you are only "
                    "asking a question or no change is warranted this turn."
                ),
            },
        },
        "required": ["message"],
    },
}

_CHAT_CL_TOOL = {
    "name": "respond",
    "description": (
        "Reply to the candidate. Always provide `message`. Include `updated_cl` "
        "only when you are actually rewriting the cover letter this turn."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "message": {
                "type": "string",
                "description": "A clarifying question, or a short summary of the changes.",
            },
            "updated_cl": {
                "type": "string",
                "description": (
                    "The COMPLETE rewritten cover letter text. Omit entirely when "
                    "only asking a question or no change is warranted this turn."
                ),
            },
        },
        "required": ["message"],
    },
}


def _history_messages(history: list[dict] | None) -> list[dict]:
    """Turn stored {role, content} turns into Anthropic messages, dropping
    empties and anything with an unexpected role."""
    messages = []
    for turn in history or []:
        role = turn.get("role")
        content = (turn.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    return messages


def chat_edit_cv(
    history: list[dict] | None,
    current_cv: dict,
    base_cv: dict,
    user_prompt: str,
    *,
    job_title: str,
    company: str,
    job_description: str = "",
) -> dict:
    """Run one chat turn over the tailored resume.

    Returns {"message": str, "updated_cv": dict | None}. `updated_cv` is None
    when the assistant only asked a question or made no change.
    """
    base_cv_json = json.dumps(base_cv, indent=2)
    current_cv_json = json.dumps(current_cv, indent=2)
    jd = (job_description or "").strip() or "(no job description on file)"

    job_context = (
        f"TARGET JOB: {job_title} at {company}\n\n"
        f"JOB DESCRIPTION:\n{jd}\n\n"
        f"BASE CV (source of truth — never invent beyond this):\n{base_cv_json}"
    )

    messages = _history_messages(history)
    messages.append(
        {
            "role": "user",
            "content": (
                f"CURRENT RESUME (the live document to edit):\n{current_cv_json}\n\n"
                f"MY REQUEST:\n{user_prompt}"
            ),
        }
    )

    data = llm.complete_tool(
        model=llm.generation_model(),
        max_tokens=8192,
        system=[
            {"type": "text", "text": _CHAT_CV_SYSTEM, "cache_control": {"type": "ephemeral"}},
            {"type": "text", "text": job_context, "cache_control": {"type": "ephemeral"}},
        ],
        tool=_CHAT_CV_TOOL,
        messages=messages,
    )
    message = (data.get("message") or "").strip()
    updated = data.get("updated_cv")
    updated_cv = updated if isinstance(updated, dict) and updated else None
    if not message:
        message = (
            "I applied that." if updated_cv is not None
            else "I couldn't work out what to change there — try rephrasing it."
        )
    return {"message": message, "updated_cv": updated_cv}


def chat_edit_cl(
    history: list[dict] | None,
    current_cl: str,
    base_cv: dict,
    user_prompt: str,
    *,
    job_title: str,
    company: str,
    job_description: str = "",
) -> dict:
    """Run one chat turn over the cover letter.

    Returns {"message": str, "updated_cl": str | None}.
    """
    base_cv_json = json.dumps(base_cv, indent=2)
    jd = (job_description or "").strip() or "(no job description on file)"

    job_context = (
        f"TARGET JOB: {job_title} at {company}\n\n"
        f"JOB DESCRIPTION:\n{jd}\n\n"
        f"BASE CV (source of truth — never invent beyond this):\n{base_cv_json}"
    )

    messages = _history_messages(history)
    messages.append(
        {
            "role": "user",
            "content": (
                f"CURRENT COVER LETTER (the live document to edit):\n{current_cl}\n\n"
                f"MY REQUEST:\n{user_prompt}"
            ),
        }
    )

    data = llm.complete_tool(
        model=llm.generation_model(),
        max_tokens=4096,
        system=[
            {"type": "text", "text": _CHAT_CL_SYSTEM, "cache_control": {"type": "ephemeral"}},
            {"type": "text", "text": job_context, "cache_control": {"type": "ephemeral"}},
        ],
        tool=_CHAT_CL_TOOL,
        messages=messages,
    )
    message = (data.get("message") or "").strip()
    updated = data.get("updated_cl")
    updated_cl = updated.strip() if isinstance(updated, str) and updated.strip() else None
    if not message:
        message = (
            "I applied that." if updated_cl is not None
            else "I couldn't work out what to change there — try rephrasing it."
        )
    return {"message": message, "updated_cl": updated_cl}


# ---------------------------------------------------------------------------
# Multi-agent orchestration: generate → score → critique → polish → re-score
# ---------------------------------------------------------------------------
def tailor_cv_iterative(
    base_cv: dict,
    job_description: str,
    job_title: str,
    company: str,
    profile_context: str | None = None,
    candidate_name: str | None = None,
    linkedin_url: str | None = None,
    github_url: str | None = None,
    archetype: str | None = None,
    narrative: str | None = None,
    candidate_years: int | None = None,
    max_passes: int = 3,
    target_score: int = 80,
    on_pass: callable | None = None,
) -> GenerationResult:
    """Generate a tailored CV, score it with an independent ATS scorer,
    then iteratively review-and-polish until the target score is reached or
    we stop improving.

    `on_pass` (optional) is a callback invoked after each pass with
    (pass_num: int, score: ats_scorer.AtsScore) so callers can update UI
    state without coupling.
    """
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
    score = ats_scorer.score_resume(
        result.resume, jd_analysis, job_description, candidate_years
    )
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

        feedback = ats_scorer.critique(
            best_result.resume, jd_analysis, job_description, best_score
        )
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

    # Attach the winning score whole — no renaming, no dropped fields.
    best_result.ats = best_score
    return best_result


# ---------------------------------------------------------------------------
# Smart snippet extraction for screening (compress long JDs)
# ---------------------------------------------------------------------------
def smart_snippet(
    text: str, keywords: list[str] = None, positions: list[str] = None
) -> str:
    if not text or len(text) <= 1200:
        return text

    stack_terms = list(
        {
            *[re.escape(k) for k in (keywords or [])],
            *[re.escape(p) for p in (positions or [])],
        }
    )
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
    jobs: list[dict],
    positions: list[str],
    profile: dict,
    base_cv: str = "",
) -> list[dict]:
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
    profile_lines = (
        f"Target roles: {position_labels}\nSeniority: {seniority or 'not specified'}"
    )
    if years_exp is not None:
        profile_lines += f"\nYears of experience: {years_exp}"
    if keywords:
        profile_lines += "\nKey skills: " + ", ".join(keywords)
    if languages:
        lang_str = ", ".join(f"{lg['name']} ({lg['level']})" for lg in languages)
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

        raw = (
            llm.complete_text(
                model=llm.screening_model(),
                max_tokens=4096,
                system=system_messages,
                messages=[{"role": "user", "content": user_message}],
            )
            or "[]"
        ).strip()
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

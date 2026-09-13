"""Job intake and scoring pipeline — one seam over fetch, screen, and generate.

The three route handlers cross this interface and do nothing else: validate the
request, call one function here, serialize the result. Everything in between —
loading the base CV, building the model's profile context, sequencing
tailor -> fit -> persist, mapping fetched postings onto Job rows, bucketing
screen results — lives behind this seam.

Domain preconditions raise `IntakeError`, which carries the HTTP status the
route should surface; the route is the only place that knows about HTTP.
"""

from __future__ import annotations

import functools
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy.orm import Session

from ..models import CV, Job, Position, Profile, User
from . import (
    apify,
    ats_scorer,
    claude,
    credentials,
    job_extractor,
    pdf_generator,
    resume,
)
from .errors import IntakeError

__all__ = ["IntakeError", "fetch", "screen", "generate_for_jobs", "load_base_cv"]

logger = logging.getLogger(__name__)


def _with_credentials(fn):
    """Install the user's resolved credential bundle (per-user keys/models →
    `.env` fallback) for the duration of an entry point. Every route-facing
    pipeline function takes `(db, user, ...)`, so the bundle resolves the same
    way for all of them and the LLM/Apify seams read it back downstream."""

    @functools.wraps(fn)
    def wrapper(db: Session, user: User, *args, **kwargs):
        with credentials.active(credentials.resolve(db, user)):
            return fn(db, user, *args, **kwargs)

    return wrapper


@dataclass
class ScreenOutcome:
    screened: int
    good_fit: int
    maybe: int
    irrelevant: int
    details: list[dict] = field(default_factory=list)


@dataclass
class FetchOutcome:
    inserted: int
    skipped: int


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------
def _profile_list(profile, attr, default=None):
    """Decode a JSON-list column off the profile, guarding None/empty."""
    raw = getattr(profile, attr, None) if profile else None
    return json.loads(raw) if raw else (default or [])


def load_base_cv(db: Session, user: User) -> dict | None:
    """Return the user's structured base CV, or None if none is on file."""
    cv = db.query(CV).filter(CV.userId == user.id).first()
    if not cv or not cv.structuredData:
        return None
    return json.loads(cv.structuredData)


def _language_line(languages: list) -> str:
    return ", ".join(
        f"{lg.get('name')} ({lg['level']})" if lg.get("level") else str(lg.get("name"))
        for lg in languages
        if isinstance(lg, dict) and lg.get("name")
    )


def _build_profile_context(
    profile: Profile | None, languages: list | None = None, years: float | None = None
) -> str:
    """The candidate-profile block injected into the generation prompt.

    `languages` is the list the finished CV will actually print (base CV first,
    profile as fallback — see `generate_for_jobs`). Reading the profile's copy
    here while rendering the CV's put "Native" in the summary and "Fluent" in
    the Languages section of the same page. `years` is likewise the tenure
    computed from the CV's date ranges, the profile's number being the fallback.
    """
    if not profile:
        return ""
    if languages is None:
        languages = _profile_list(profile, "languages")
    if years is None:
        years = profile.totalYearsExperience
    years_str = f"{years:g}" if isinstance(years, (int, float)) else "unknown"
    keywords = _profile_list(profile, "keywords")
    lang_str = _language_line(languages)
    kw_str = ", ".join(keywords) if keywords else ""
    return (
        f"\nCANDIDATE PROFILE:\n"
        f"- Years of experience: {years_str}\n"
        f"- Seniority: {profile.seniority or 'unknown'}\n"
        f"- Current location: {profile.currentLocation or 'unknown'}\n"
        f"- Preferred locations: {profile.preferredLocations or 'any'}\n"
        f"- Notice period: {profile.noticePeriod or 'unknown'}"
        + (
            f"\n- Languages: {lang_str} (printed in their own Languages section; "
            f"never list them under Skills)"
            if lang_str
            else ""
        )
        + (f"\n- Key skills/keywords to emphasize: {kw_str}" if kw_str else "")
    )


# ---------------------------------------------------------------------------
# Fetch: pull postings from LinkedIn and store the new ones.
# ---------------------------------------------------------------------------
@_with_credentials
def fetch(db: Session, user: User, date_posted: str) -> FetchOutcome:
    positions = db.query(Position).filter(Position.userId == user.id).all()
    if not positions:
        raise IntakeError(
            "No positions configured. Add some in the Positions tab first.", 400
        )

    profile = db.query(Profile).filter(Profile.userId == user.id).first()
    country_codes = _profile_list(profile, "preferredLocations")
    job_types = _profile_list(profile, "jobTypes", ["fulltime"])
    position_labels = [p.label for p in positions]

    normalize = job_extractor.normalize_job_url
    existing_rows = db.query(Job.url).filter(Job.userId == user.id).all()
    existing_urls = {normalize(r.url or "") for r in existing_rows}

    fetched = apify.fetch_linkedin_jobs(
        position_labels, country_codes, date_posted, job_types
    )
    new_jobs = [j for j in fetched if normalize(j.url or "") not in existing_urls]
    for j in new_jobs:
        norm = normalize(j.url or "")
        existing_urls.add(norm)
        db.add(
            Job(
                userId=user.id,
                title=j.title,
                company=j.company,
                location=j.location,
                description=j.description,
                url=norm,
                salary=j.salary,
                jobType=j.job_type or j.seniority_level,
                source="linkedin",
                agentStatus="pending",
                applicationStatus="new",
                fetchedAt=datetime.utcnow(),
            )
        )

    db.commit()
    return FetchOutcome(inserted=len(new_jobs), skipped=len(fetched) - len(new_jobs))


# ---------------------------------------------------------------------------
# Screen: score fetched jobs for relevance and persist the verdict.
# ---------------------------------------------------------------------------
@_with_credentials
def screen(db: Session, user: User, ids: list[str] | None = None) -> ScreenOutcome:
    query = db.query(Job).filter(Job.userId == user.id)
    if ids:
        query = query.filter(Job.id.in_(ids))
    else:
        query = query.filter(Job.relevanceStatus == "unscreened")

    unscreened = query.with_entities(
        Job.id, Job.title, Job.company, Job.description, Job.location
    ).all()
    positions = db.query(Position).filter(Position.userId == user.id).all()
    profile = db.query(Profile).filter(Profile.userId == user.id).first()

    if not unscreened:
        return ScreenOutcome(0, 0, 0, 0)
    if not positions:
        raise IntakeError("No positions configured.", 400)

    keywords = _profile_list(profile, "keywords")
    languages = _profile_list(profile, "languages")
    deal_breakers = _profile_list(profile, "dealBreakers")
    preferred_locations = _profile_list(profile, "preferredLocations")

    # Send full CV — cached via Anthropic prompt caching (90% cheaper on batches 2+)
    user_cv = db.query(CV).filter(CV.userId == user.id).first()
    base_cv = user_cv.structuredData if user_cv and user_cv.structuredData else ""

    jobs_payload = [
        {
            "id": j.id,
            "title": j.title,
            "company": j.company,
            "description": j.description,
            "location": j.location,
        }
        for j in unscreened
    ]
    profile_payload = {
        "seniority": profile.seniority if profile else "",
        "totalYearsExperience": profile.totalYearsExperience if profile else None,
        "keywords_list": keywords,
        "languages_list": languages,
        "narrative": profile.narrative if profile else "",
        "deal_breakers": deal_breakers,
        "preferred_locations": preferred_locations,
    }

    results = claude.screen_jobs(
        jobs_payload, [p.label for p in positions], profile_payload, base_cv
    )

    by_fit: dict[str, list[str]] = {"good_fit": [], "maybe": [], "irrelevant": []}
    for r in results:
        fit = r.get("fit", "maybe")
        by_fit.setdefault(fit, []).append(r["id"])

        job_id = r.get("id")
        if job_id:
            update_fields = {"relevanceStatus": fit}
            if "score" in r:
                update_fields["screeningScore"] = str(r["score"])
            if "reason" in r:
                update_fields["screeningReason"] = r["reason"]
            if "archetype" in r:
                update_fields["archetype"] = r["archetype"]
            db.query(Job).filter(Job.id == job_id, Job.userId == user.id).update(
                update_fields, synchronize_session=False
            )

    db.commit()

    return ScreenOutcome(
        screened=len(results),
        good_fit=len(by_fit["good_fit"]),
        maybe=len(by_fit["maybe"]),
        irrelevant=len(by_fit["irrelevant"]),
        details=results,
    )


def _resolve_conditional_bullets(base_cv: dict, job_description: str) -> dict:
    """Copy of base_cv with every experience bullet flattened to a plain string,
    dropping conditional bullets whose condition the job doesn't match. A bullet is
    either a plain string (always) or {"text", "condition"}. Costs one cheap LLM
    call, and only when conditional bullets actually exist."""
    import copy

    cv = copy.deepcopy(base_cv)
    experience = cv.get("experience") or []

    conditions: list[str] = []
    for exp in experience:
        for b in exp.get("bullets") or []:
            if isinstance(b, dict) and (b.get("condition") or "").strip():
                cond = b["condition"].strip()
                if cond not in conditions:
                    conditions.append(cond)

    matched: set[str] = set()
    if conditions:
        flags = claude.select_conditional_bullets(job_description, conditions)
        matched = {c for c, keep in zip(conditions, flags) if keep}

    for exp in experience:
        flat: list[str] = []
        for b in exp.get("bullets") or []:
            if isinstance(b, dict):
                cond = (b.get("condition") or "").strip()
                text = (b.get("text") or "").strip()
                if text and (not cond or cond in matched):
                    flat.append(text)
            elif b:
                flat.append(str(b))
        exp["bullets"] = flat
    return cv


# ---------------------------------------------------------------------------
# Generate: tailor + score + fit + persist a CV/CL for each selected job.
# ---------------------------------------------------------------------------
@_with_credentials
def generate_for_jobs(db: Session, user: User, job_ids: list[str]) -> list[Job]:
    base_cv_data = load_base_cv(db, user)
    if base_cv_data is None:
        raise IntakeError("No CV found. Please upload your CV first.", 400)

    profile = db.query(Profile).filter(Profile.userId == user.id).first()
    # Identity has two homes (Profile columns and the CV header — see
    # CONTEXT.md). The CV wins; the profile fills its gaps. Resolve that once
    # here so the prompt describes the same languages the page will print.
    profile_languages = _profile_list(profile, "languages")
    identity_languages = base_cv_data.get("languages") or profile_languages
    # Tenure the way a parser derives it — from the date ranges — with the
    # profile's self-reported number only when no range can be read.
    computed_years = resume.experience_years(base_cv_data)
    candidate_years = (
        computed_years
        if computed_years is not None
        else (profile.totalYearsExperience if profile else None)
    )
    profile_context = _build_profile_context(profile, identity_languages, candidate_years)
    candidate_name = (profile.fullName if profile else None) or user.name or "Candidate"
    linkedin_url = profile.linkedinUrl if profile else None
    github_url = profile.githubUrl if profile else None
    narrative = profile.narrative if profile else None

    results: list[Job] = []
    for job_id in job_ids:
        job = db.query(Job).filter(Job.id == job_id, Job.userId == user.id).first()
        if not job:
            continue

        job.agentStatus = "generating"
        db.commit()

        def _on_pass(pass_num, _score, _job=job):
            if pass_num >= 2:
                _job.agentStatus = "reviewing"
                db.commit()

        effective_cv = _resolve_conditional_bullets(base_cv_data, job.description or "")
        result = claude.tailor_cv_iterative(
            base_cv=effective_cv,
            job_description=job.description or "",
            job_title=job.title,
            company=job.company,
            profile_context=profile_context,
            candidate_name=candidate_name,
            linkedin_url=linkedin_url,
            github_url=github_url,
            archetype=job.archetype,
            narrative=narrative,
            candidate_years=candidate_years,
            on_pass=_on_pass,
        )

        # Assemble final CV: generated sections + factual identity from the base
        # CV (header + languages are copied, never tailored), with the profile
        # filling any link or language the base CV left blank.
        # The condition-resolved CV is the base here: a bullet voted out for
        # this job must not come back as a "forgotten" one.
        assembled = resume.merge_identity(
            result.resume,
            effective_cv,
            links={"linkedin": linkedin_url, "github": github_url},
            languages=profile_languages,
        )

        # Fit to one page NOW and store the fitted version. Views render the
        # stored JSON verbatim, so any content trim must happen here. The trim
        # drops whole items (recorded in fitNotes) and never rewrites a bullet:
        # the Haiku trimmer, asked for ~30 words, cut 88 across every bullet,
        # and nothing after merge_identity re-checked its output. Each trim takes
        # one small item and is re-measured by a render, so the budget counts
        # items (up to three bullets a role from notes, a summary sentence,
        # skill items), not model calls.
        pdf_bytes, assembled = pdf_generator.fit_and_render(
            assembled, trim_callback=pdf_generator.trim_content, max_trims=12
        )
        # `baseBulletCount` only tells the trim what to give back first; the
        # stored CV is exactly what the page shows.
        for role in assembled.get("experience") or []:
            role.pop("baseBulletCount", None)

        score = result.ats
        # Read the finished PDF back the way a parser would; anything it lost
        # is reported next to the score rather than discovered by a recruiter.
        parse_issues = pdf_generator.parse_back_issues(pdf_bytes, assembled)
        if parse_issues:
            logger.warning(
                "job %s: %d fact(s) unreadable in the rendered PDF: %s",
                job.id, len(parse_issues), parse_issues[:3],
            )
            if score:
                score.gaps = [*score.gaps, *parse_issues[:3]]
        # The scorer already decided; read that decision instead of re-deriving
        # accept/reject from a threshold of the route's own.
        job.agentStatus = (
            "rejected" if score and score.decision == "REJECTED" else "done"
        )
        job.atsScore = result.ats_score
        job.atsBreakdown = json.dumps(ats_scorer.to_api_dict(score)) if score else None
        job.generatedCv = json.dumps(assembled)
        job.generatedCl = result.cover_letter
        job.generatedAt = datetime.utcnow()
        db.commit()
        db.refresh(job)
        results.append(job)

    return results

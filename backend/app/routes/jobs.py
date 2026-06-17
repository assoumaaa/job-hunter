from __future__ import annotations

import json
from datetime import datetime
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core.auth import get_current_user
from ..core.db import get_db
from ..models.job import Job
from ..models.cv import CV
from ..models.profile import Profile
from ..models.position import Position
from ..models.user import User
from ..schemas.job import (
    ExtractedJobResponse,
    ExtractUrlRequest,
    GenerateRequest,
    JobDeleteRequest,
    JobOut,
    JobUpdateRequest,
    ManualJobRequest,
    ScreenRequest,
    ScreenResult,
    SyncRequest,
    SyncResult,
    TweakRequest,
    TweakResponse,
)
from ..services import claude, apify, job_extractor

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("", response_model=list[JobOut])
def get_jobs(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    # Fix jobs stuck in generating/reviewing that already have a CV
    db.query(Job).filter(
        Job.userId == current_user.id,
        Job.agentStatus.in_(["generating", "reviewing"]),
        Job.generatedCv.isnot(None),
    ).update({"agentStatus": "done"}, synchronize_session=False)
    db.commit()

    jobs = (
        db.query(Job)
        .filter(Job.userId == current_user.id)
        .order_by(Job.fetchedAt.desc())
        .all()
    )
    return jobs


@router.patch("", response_model=JobOut)
def update_job(
    body: JobUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = db.query(Job).filter(Job.id == body.id, Job.userId == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    update_data = body.model_dump(exclude={"id"}, exclude_none=True)
    for key, value in update_data.items():
        setattr(job, key, value)
    job.updatedAt = datetime.utcnow()
    db.commit()
    db.refresh(job)
    return job


@router.post("/delete")
def delete_jobs(
    body: JobDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not body.ids:
        raise HTTPException(status_code=400, detail="No ids provided")

    db.query(Job).filter(Job.id.in_(body.ids), Job.userId == current_user.id).delete(
        synchronize_session=False
    )
    db.commit()
    return {"deleted": len(body.ids)}


@router.post("/extract-url", response_model=ExtractedJobResponse)
def extract_url(
    body: ExtractUrlRequest,
    current_user: User = Depends(get_current_user),
):
    url = (body.url or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    try:
        extracted = job_extractor.extract_from_url(url)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch the page: {e.__class__.__name__}",
        )
    return ExtractedJobResponse(
        title=extracted.title,
        company=extracted.company,
        description=extracted.description,
        location=extracted.location,
        url=extracted.url,
        source=extracted.source,
    )


@router.post("/manual", response_model=JobOut)
def add_manual_job(
    body: ManualJobRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Deduplicate by URL if provided
    if body.url:
        parsed = urlparse(body.url.split("?")[0].rstrip("/"))
        norm = (
            f"https://linkedin.com{parsed.path}"
            if "linkedin.com" in parsed.netloc
            else parsed.geturl()
        )
        existing = (
            db.query(Job).filter(Job.userId == current_user.id, Job.url == norm).first()
        )
        if existing:
            raise HTTPException(
                status_code=409, detail="A job with this URL already exists."
            )
    else:
        norm = None

    job = Job(
        userId=current_user.id,
        title=body.title,
        company=body.company,
        location=body.location,
        description=body.description,
        url=norm,
        source=body.source or "manual",
        agentStatus="pending",
        applicationStatus="new",
        fetchedAt=datetime.utcnow(),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.post("/generate", response_model=list[JobOut])
def generate_cv(
    body: GenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not body.jobIds:
        raise HTTPException(status_code=400, detail="No job IDs provided")

    user_cv = db.query(CV).filter(CV.userId == current_user.id).first()
    if not user_cv or not user_cv.structuredData:
        raise HTTPException(
            status_code=400, detail="No CV found. Please upload your CV first."
        )

    base_cv_data = json.loads(user_cv.structuredData)
    profile = db.query(Profile).filter(Profile.userId == current_user.id).first()

    languages = json.loads(profile.languages) if profile and profile.languages else []
    keywords = json.loads(profile.keywords) if profile and profile.keywords else []

    profile_context = ""
    if profile:
        lang_str = (
            ", ".join(f"{l['name']} ({l['level']})" for l in languages)
            if languages
            else ""
        )
        kw_str = ", ".join(keywords) if keywords else ""
        profile_context = (
            f"\nCANDIDATE PROFILE:\n"
            f"- Years of experience: {profile.totalYearsExperience or 'unknown'}\n"
            f"- Seniority: {profile.seniority or 'unknown'}\n"
            f"- Current location: {profile.currentLocation or 'unknown'}\n"
            f"- Preferred locations: {profile.preferredLocations or 'any'}\n"
            f"- Notice period: {profile.noticePeriod or 'unknown'}"
            + (f"\n- Languages: {lang_str}" if lang_str else "")
            + (f"\n- Key skills/keywords to emphasize: {kw_str}" if kw_str else "")
        )

    candidate_name = (
        (profile.fullName if profile else None) or current_user.name or "Candidate"
    )
    linkedin_url = profile.linkedinUrl if profile else None
    github_url = profile.githubUrl if profile else None
    narrative = profile.narrative if profile else None

    results = []
    for job_id in body.jobIds:
        job = (
            db.query(Job)
            .filter(Job.id == job_id, Job.userId == current_user.id)
            .first()
        )
        if not job:
            continue

        job.agentStatus = "generating"
        db.commit()

        archetype = job.archetype
        candidate_years = profile.totalYearsExperience if profile else None

        # Status callback flips the job to "reviewing" once we start iterating
        def _on_pass(pass_num, _score, _job=job):
            if pass_num >= 2:
                _job.agentStatus = "reviewing"
                db.commit()

        result = claude.tailor_cv_iterative(
            base_cv=base_cv_data,
            job_description=job.description or "",
            job_title=job.title,
            company=job.company,
            profile_context=profile_context,
            candidate_name=candidate_name,
            linkedin_url=linkedin_url,
            github_url=github_url,
            archetype=archetype,
            narrative=narrative,
            candidate_years=candidate_years,
            on_pass=_on_pass,
        )

        # Assemble final CV: generated sections + base header + base languages
        # (Claude's output schema doesn't include languages — they're factual, not tailored)
        assembled = {**result.resume}
        assembled["header"] = base_cv_data.get("header", {})
        assembled["languages"] = base_cv_data.get("languages", [])

        job.agentStatus = "rejected" if result.ats_score < 60 else "done"
        job.atsScore = result.ats_score
        job.atsBreakdown = json.dumps(
            {
                "keyword": result.ats_breakdown.keyword,
                "requirements": result.ats_breakdown.experience,
                "format": result.ats_breakdown.format,
                "semantic": result.ats_breakdown.skills,
                "impact": result.ats_breakdown.impact,
                "decision": result.ats_breakdown.decision,
                "gaps": result.ats_breakdown.gaps,
            }
        )
        job.generatedCv = json.dumps(assembled)
        job.generatedCl = result.cover_letter
        job.generatedAt = datetime.utcnow()
        job.updatedAt = datetime.utcnow()
        db.commit()
        db.refresh(job)
        results.append(job)

    return results


@router.post("/screen", response_model=ScreenResult)
def screen_jobs(
    body: ScreenRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    selected_ids = body.ids if body.ids else None

    query = db.query(Job).filter(Job.userId == current_user.id)
    if selected_ids:
        query = query.filter(Job.id.in_(selected_ids))
    else:
        query = query.filter(Job.relevanceStatus == "unscreened")

    unscreened = query.with_entities(
        Job.id, Job.title, Job.company, Job.description, Job.location
    ).all()
    positions = db.query(Position).filter(Position.userId == current_user.id).all()
    profile = db.query(Profile).filter(Profile.userId == current_user.id).first()

    if not unscreened:
        return ScreenResult(screened=0, good_fit=0, maybe=0, irrelevant=0)
    if not positions:
        raise HTTPException(status_code=400, detail="No positions configured.")

    keywords = json.loads(profile.keywords) if profile and profile.keywords else []
    languages = json.loads(profile.languages) if profile and profile.languages else []
    deal_breakers = (
        json.loads(profile.dealBreakers) if profile and profile.dealBreakers else []
    )
    preferred_locations = (
        json.loads(profile.preferredLocations)
        if profile and profile.preferredLocations
        else []
    )

    # Send full CV — cached via Anthropic prompt caching (90% cheaper on batches 2+)
    user_cv = db.query(CV).filter(CV.userId == current_user.id).first()
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

        # Store per-job screening details
        job_id = r.get("id")
        if job_id:
            update_fields = {"relevanceStatus": fit}
            if "score" in r:
                update_fields["screeningScore"] = str(r["score"])
            if "reason" in r:
                update_fields["screeningReason"] = r["reason"]
            if "archetype" in r:
                update_fields["archetype"] = r["archetype"]
            db.query(Job).filter(
                Job.id == job_id, Job.userId == current_user.id
            ).update(update_fields, synchronize_session=False)

    db.commit()

    return ScreenResult(
        screened=len(results),
        good_fit=len(by_fit["good_fit"]),
        maybe=len(by_fit["maybe"]),
        irrelevant=len(by_fit["irrelevant"]),
        details=results,
    )


@router.post("/fetch", response_model=SyncResult)
def fetch_jobs(
    body: SyncRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    positions = db.query(Position).filter(Position.userId == current_user.id).all()
    if not positions:
        raise HTTPException(
            status_code=400,
            detail="No positions configured. Add some in the Positions tab first.",
        )

    profile = db.query(Profile).filter(Profile.userId == current_user.id).first()
    country_codes = (
        json.loads(profile.preferredLocations)
        if profile and profile.preferredLocations
        else []
    )
    job_types = (
        json.loads(profile.jobTypes) if profile and profile.jobTypes else ["fulltime"]
    )
    position_labels = [p.label for p in positions]

    def _norm_url(url: str) -> str:
        """Strip query params and normalize linkedin subdomains."""
        u = (url or "").split("?")[0].rstrip("/")
        parsed = urlparse(u)
        if "linkedin.com" in parsed.netloc:
            u = f"https://linkedin.com{parsed.path}"
        return u

    existing_rows = db.query(Job.url).filter(Job.userId == current_user.id).all()
    existing_urls = {_norm_url(r.url or "") for r in existing_rows}

    fetched = apify.fetch_linkedin_jobs(
        position_labels,
        country_codes,
        body.datePosted,
        job_types,
    )
    new_jobs = [j for j in fetched if _norm_url(j.url or "") not in existing_urls]
    for j in new_jobs:
        norm = _norm_url(j.url or "")
        existing_urls.add(norm)
        db.add(
            Job(
                userId=current_user.id,
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
    return SyncResult(
        inserted=len(new_jobs),
        skipped=len(fetched) - len(new_jobs),
    )


def _load_user_base_cv(db: Session, current_user: User) -> dict:
    user_cv = db.query(CV).filter(CV.userId == current_user.id).first()
    if not user_cv or not user_cv.structuredData:
        raise HTTPException(status_code=400, detail="No base CV on file.")
    return json.loads(user_cv.structuredData)


@router.post("/{job_id}/tweak", response_model=TweakResponse)
def tweak_job_doc(
    job_id: str,
    body: TweakRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Apply a plain-English tweak to the generated CV or cover letter.

    Snapshots the original on first invocation so the user can reset later.
    Uses Haiku — cheap, mechanical edit. Does NOT re-run the ATS scoring loop.
    """
    if body.target not in ("cv", "cl"):
        raise HTTPException(status_code=400, detail="target must be 'cv' or 'cl'")
    prompt = (body.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is empty")

    job = db.query(Job).filter(Job.id == job_id, Job.userId == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    base_cv = _load_user_base_cv(db, current_user)

    if body.target == "cv":
        if not job.generatedCv:
            raise HTTPException(status_code=400, detail="Job has no generated CV yet")
        current_cv = json.loads(job.generatedCv)
        # Snapshot original on first tweak
        if not job.originalCv:
            job.originalCv = job.generatedCv
        updated = claude.apply_cv_tweak(current_cv, base_cv, prompt)
        job.generatedCv = json.dumps(updated)
    else:  # cl
        if not job.generatedCl:
            raise HTTPException(
                status_code=400, detail="Job has no generated cover letter yet"
            )
        if not job.originalCl:
            job.originalCl = job.generatedCl
        updated_text = claude.apply_cl_tweak(job.generatedCl, base_cv, prompt)
        job.generatedCl = updated_text

    job.updatedAt = datetime.utcnow()
    db.commit()
    db.refresh(job)

    return TweakResponse(
        target=body.target,
        generatedCv=job.generatedCv,
        generatedCl=job.generatedCl,
        hasOriginal=bool(job.originalCv or job.originalCl),
    )


@router.post("/{job_id}/reset-tweaks", response_model=TweakResponse)
def reset_job_tweaks(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Restore generatedCv / generatedCl from their pre-tweak snapshots."""
    job = db.query(Job).filter(Job.id == job_id, Job.userId == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if not (job.originalCv or job.originalCl):
        raise HTTPException(
            status_code=400, detail="Nothing to reset — this job has not been tweaked."
        )

    if job.originalCv:
        job.generatedCv = job.originalCv
    if job.originalCl:
        job.generatedCl = job.originalCl
    job.updatedAt = datetime.utcnow()
    db.commit()
    db.refresh(job)

    return TweakResponse(
        target="both",
        generatedCv=job.generatedCv,
        generatedCl=job.generatedCl,
        hasOriginal=True,
    )

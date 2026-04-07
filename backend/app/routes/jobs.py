from __future__ import annotations

import json
import re
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
    GenerateRequest,
    JobDeleteRequest,
    JobOut,
    JobUpdateRequest,
    ScreenRequest,
    ScreenResult,
    SyncRequest,
    SyncResult,
)
from ..services import claude, apify

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


@router.post("/generate", response_model=list[JobOut])
def generate_cv(
    body: GenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not body.jobIds:
        raise HTTPException(status_code=400, detail="No job IDs provided")

    user_cv = db.query(CV).filter(CV.userId == current_user.id).first()
    if not user_cv:
        raise HTTPException(status_code=400, detail="No CV found. Please add your CV first.")

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

    candidate_name = (profile.fullName if profile else None) or current_user.name or "Candidate"
    linkedin_url = profile.linkedinUrl if profile else None
    github_url = profile.githubUrl if profile else None

    results = []
    for job_id in body.jobIds:
        job = db.query(Job).filter(Job.id == job_id, Job.userId == current_user.id).first()
        if not job:
            continue

        job.agentStatus = "generating"
        db.commit()

        result = claude.generate_cv_and_cl(
            user_cv.latexSource,
            job.description or "",
            job.title,
            job.company,
            1,
            None,
            None,
            profile_context,
            candidate_name,
            linkedin_url,
            github_url,
        )

        if result.ats_breakdown.decision == "NEEDS_REVISION" and result.ats_score >= 70:
            job.agentStatus = "reviewing"
            db.commit()
            result = claude.generate_cv_and_cl(
                user_cv.latexSource,
                job.description or "",
                job.title,
                job.company,
                2,
                result.resume,
                result.ats_score,
                profile_context,
                candidate_name,
                linkedin_url,
                github_url,
            )

        if result.ats_breakdown.decision == "NEEDS_REVISION" and result.ats_score >= 70:
            result = claude.generate_cv_and_cl(
                user_cv.latexSource,
                job.description or "",
                job.title,
                job.company,
                3,
                result.resume,
                result.ats_score,
                profile_context,
                candidate_name,
                linkedin_url,
                github_url,
            )

        job.agentStatus = "rejected" if result.ats_score < 70 else "done"
        job.atsScore = result.ats_score
        job.atsBreakdown = json.dumps(
            {
                "keyword": result.ats_breakdown.keyword,
                "experience": result.ats_breakdown.experience,
                "skills": result.ats_breakdown.skills,
                "format": result.ats_breakdown.format,
                "impact": result.ats_breakdown.impact,
                "decision": result.ats_breakdown.decision,
                "gaps": result.ats_breakdown.gaps,
            }
        )
        job.generatedCv = _assemble_cv(user_cv.latexSource, result.resume)
        job.generatedCl = result.cover_letter
        job.generatedAt = datetime.utcnow()
        job.updatedAt = datetime.utcnow()
        db.commit()
        db.refresh(job)
        results.append(job)

    return results


def _assemble_cv(base_latex: str, generated_body: str) -> str:
    begin_idx = base_latex.find("\\begin{document}")
    end_idx = base_latex.rfind("\\end{document}")
    preamble = base_latex[:begin_idx] if begin_idx != -1 else ""

    body_start = begin_idx + len("\\begin{document}") if begin_idx != -1 else 0
    body_content = (
        base_latex[body_start:end_idx] if end_idx != -1 else base_latex[body_start:]
    )
    first_section = re.search(r"\\section|\\begin\{section\}", body_content)
    header = body_content[: first_section.start()].strip() if first_section else ""
    header = re.sub(r".*linkedin\.com[^\n\\]*", "", header, flags=re.IGNORECASE)
    header = re.sub(r"\n{3,}", "\n\n", header).strip()

    clean_body = generated_body
    end_doc_match = clean_body.find("\\end{document}")
    if end_doc_match != -1:
        clean_body = clean_body[:end_doc_match]
    clean_body = re.sub(r"\\documentclass[^\n]*", "", clean_body)
    clean_body = re.sub(r"\\usepackage[^\n]*", "", clean_body)
    clean_body = re.sub(r"\\begin\{document\}", "", clean_body)
    clean_body = re.sub(r"^```[a-z]*\n?", "", clean_body.strip(), flags=re.IGNORECASE)
    clean_body = clean_body.rstrip("`").strip()

    first_section_in_body = re.search(r"\\section", clean_body)
    if first_section_in_body and first_section_in_body.start() > 50:
        clean_body = clean_body[first_section_in_body.start() :]

    is_empty = len(clean_body) < 100
    if is_empty:
        clean_body = body_content.strip()

    if not preamble:
        return generated_body
    if is_empty:
        return f"{preamble}\\begin{{document}}\n{clean_body}\n\\end{{document}}"
    return f"{preamble}\\begin{{document}}\n{header}\n{clean_body}\n\\end{{document}}"


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
        Job.id, Job.title, Job.company, Job.description
    ).all()
    positions = db.query(Position).filter(Position.userId == current_user.id).all()
    profile = db.query(Profile).filter(Profile.userId == current_user.id).first()

    if not unscreened:
        return ScreenResult(screened=0, good_fit=0, maybe=0, irrelevant=0)
    if not positions:
        raise HTTPException(status_code=400, detail="No positions configured.")

    keywords = json.loads(profile.keywords) if profile and profile.keywords else []
    languages = json.loads(profile.languages) if profile and profile.languages else []

    jobs_payload = [
        {
            "id": j.id,
            "title": j.title,
            "company": j.company,
            "description": j.description,
        }
        for j in unscreened
    ]
    profile_payload = {
        "seniority": profile.seniority if profile else "",
        "totalYearsExperience": profile.totalYearsExperience if profile else None,
        "keywords_list": keywords,
        "languages_list": languages,
    }

    results = claude.screen_jobs(
        jobs_payload, [p.label for p in positions], profile_payload
    )

    by_fit: dict[str, list[str]] = {"good_fit": [], "maybe": [], "irrelevant": []}
    for r in results:
        fit = r.get("fit", "maybe")
        by_fit.setdefault(fit, []).append(r["id"])

    for fit, ids in by_fit.items():
        if ids:
            db.query(Job).filter(Job.id.in_(ids), Job.userId == current_user.id).update(
                {"relevanceStatus": fit}, synchronize_session=False
            )
    db.commit()

    return ScreenResult(
        screened=len(results),
        good_fit=len(by_fit["good_fit"]),
        maybe=len(by_fit["maybe"]),
        irrelevant=len(by_fit["irrelevant"]),
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

    fetched = apify.fetch_linkedin_jobs(
        [p.label for p in positions],
        country_codes,
        body.datePosted,
        job_types,
    )

    def _norm_url(url: str) -> str:
        """Strip query params and normalize linkedin subdomains to linkedin.com."""
        u = (url or "").split("?")[0].rstrip("/")
        parsed = urlparse(u)
        # ae.linkedin.com / www.linkedin.com / linkedin.com → linkedin.com
        if "linkedin.com" in parsed.netloc:
            u = f"https://linkedin.com{parsed.path}"
        return u

    existing_rows = db.query(Job.url).filter(Job.userId == current_user.id).all()
    existing_urls = {_norm_url(r.url or "") for r in existing_rows}

    new_jobs = [j for j in fetched if _norm_url(j.url or "") not in existing_urls]

    for j in new_jobs:
        db.add(
            Job(
                userId=current_user.id,
                title=j.title,
                company=j.company,
                location=j.location,
                description=j.description,
                url=_norm_url(j.url or ""),
                salary=j.salary,
                jobType=j.job_type or j.seniority_level,
                agentStatus="pending",
                applicationStatus="new",
                fetchedAt=datetime.utcnow(),
            )
        )

    db.commit()
    return SyncResult(inserted=len(new_jobs), skipped=len(fetched) - len(new_jobs))

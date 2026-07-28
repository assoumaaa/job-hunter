from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core.auth import get_current_user
from ..core.db import get_db
from ..models import Job, User
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
from ..services import claude, intake, job_extractor, pdf_generator

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _get_job_or_404(db: Session, job_id: str, current_user: User) -> Job:
    job = db.query(Job).filter(Job.id == job_id, Job.userId == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


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
    job = _get_job_or_404(db, body.id, current_user)

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
        raise HTTPException(status_code=422, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch the page: {e.__class__.__name__}",
        ) from e
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
        norm = job_extractor.normalize_job_url(body.url)
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
    try:
        return intake.generate_for_jobs(db, current_user, body.jobIds)
    except intake.IntakeError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e


@router.post("/screen", response_model=ScreenResult)
def screen_jobs(
    body: ScreenRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        outcome = intake.screen(db, current_user, body.ids)
    except intake.IntakeError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e
    return ScreenResult(
        screened=outcome.screened,
        good_fit=outcome.good_fit,
        maybe=outcome.maybe,
        irrelevant=outcome.irrelevant,
        details=outcome.details,
    )


@router.post("/fetch", response_model=SyncResult)
def fetch_jobs(
    body: SyncRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        outcome = intake.fetch(db, current_user, body.datePosted)
    except intake.IntakeError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e
    return SyncResult(inserted=outcome.inserted, skipped=outcome.skipped)


@router.post("/{job_id}/tweak", response_model=TweakResponse)
def tweak_job_doc(
    job_id: str,
    body: TweakRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run one turn of the edit-a-CV chat over the generated CV or cover letter.

    The assistant may ask a clarifying question instead of editing — in that
    case `message` carries the question and the document is left unchanged.
    Snapshots the original on the first edit so the user can reset later. Uses
    Sonnet (judgment); does NOT re-run the ATS scoring loop.
    """
    if body.target not in ("cv", "cl"):
        raise HTTPException(status_code=400, detail="target must be 'cv' or 'cl'")
    prompt = (body.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is empty")

    job = _get_job_or_404(db, job_id, current_user)

    base_cv = intake.load_base_cv(db, current_user)
    if base_cv is None:
        raise HTTPException(status_code=400, detail="No base CV on file.")

    if body.target == "cv":
        if not job.generatedCv:
            raise HTTPException(status_code=400, detail="Job has no generated CV yet")
        current_cv = json.loads(job.generatedCv)
        history = json.loads(job.chatCv) if job.chatCv else []
        result = claude.chat_edit_cv(
            history,
            current_cv,
            base_cv,
            prompt,
            job_title=job.title,
            company=job.company,
            job_description=job.description or "",
        )
        message = result["message"]
        if result["updated_cv"] is not None:
            # Snapshot original on the first actual edit
            if not job.originalCv:
                job.originalCv = job.generatedCv
            # Re-fit after the edit so the stored CV stays one page. The trimmed
            # JSON is what we persist, so the preview matches exactly.
            _, updated = pdf_generator.fit_and_render(
                result["updated_cv"], trim_callback=claude.trim_resume_for_fit
            )
            job.generatedCv = json.dumps(updated)
        history = history + [
            {"role": "user", "content": prompt},
            {"role": "assistant", "content": message},
        ]
        job.chatCv = json.dumps(history)
    else:  # cl
        if not job.generatedCl:
            raise HTTPException(
                status_code=400, detail="Job has no generated cover letter yet"
            )
        history = json.loads(job.chatCl) if job.chatCl else []
        result = claude.chat_edit_cl(
            history,
            job.generatedCl,
            base_cv,
            prompt,
            job_title=job.title,
            company=job.company,
            job_description=job.description or "",
        )
        message = result["message"]
        if result["updated_cl"] is not None:
            if not job.originalCl:
                job.originalCl = job.generatedCl
            job.generatedCl = result["updated_cl"]
        history = history + [
            {"role": "user", "content": prompt},
            {"role": "assistant", "content": message},
        ]
        job.chatCl = json.dumps(history)

    db.commit()
    db.refresh(job)

    return TweakResponse(
        target=body.target,
        message=message,
        generatedCv=job.generatedCv,
        generatedCl=job.generatedCl,
        hasOriginal=bool(job.originalCv or job.originalCl),
        history=history,
    )


@router.post("/{job_id}/reset-tweaks", response_model=TweakResponse)
def reset_job_tweaks(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Restore generatedCv / generatedCl from their pre-tweak snapshots."""
    job = _get_job_or_404(db, job_id, current_user)

    if not (job.originalCv or job.originalCl):
        raise HTTPException(
            status_code=400, detail="Nothing to reset — this job has not been tweaked."
        )

    if job.originalCv:
        job.generatedCv = job.originalCv
    if job.originalCl:
        job.generatedCl = job.originalCl
    db.commit()
    db.refresh(job)

    return TweakResponse(
        target="both",
        generatedCv=job.generatedCv,
        generatedCl=job.generatedCl,
        hasOriginal=True,
    )

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..core.auth import get_current_user
from ..core.db import get_db
from ..core.deps import active_credentials
from ..models import User
from ..schemas.job import (
    ExtractedJobResponse,
    ExtractUrlRequest,
    GenerateRequest,
    JobDeleteRequest,
    JobOut,
    JobPage,
    JobStats,
    JobUpdateRequest,
    ManualJobRequest,
    ScreenRequest,
    ScreenResult,
    SyncRequest,
    SyncResult,
    TweakRequest,
    TweakResponse,
)
from ..services import intake, job_extractor, job_query, tweak
from ..services.errors import IntakeError

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("", response_model=JobPage)
def get_jobs(
    company: str = Query(""),
    title: str = Query(""),
    view: str = Query("all"),
    sort: str = Query("fetchedAt"),
    direction: str = Query("desc"),
    page: int = Query(1, ge=1),
    pageSize: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job_query.repair_stuck_generating(db, current_user)
    return job_query.page(
        db,
        current_user,
        company=company,
        title=title,
        view=view,
        sort=sort,
        direction=direction,
        page=page,
        page_size=pageSize,
    )


@router.get("/stats", response_model=JobStats)
def get_job_stats(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Aggregate counts across all of the user's jobs — the list is paginated, so
    the toolbar/dashboard totals come from here, not the page."""
    return job_query.stats(db, current_user)


@router.get("/{job_id}", response_model=JobOut)
def get_job(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Full job incl. the heavy text columns — loaded when a single job is opened."""
    return job_query.get(db, current_user, job_id)


@router.patch("", response_model=JobOut)
def update_job(
    body: JobUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return job_query.update(
        db,
        current_user,
        body.id,
        body.model_dump(exclude={"id"}, exclude_none=True),
    )


@router.post("/delete")
def delete_jobs(
    body: JobDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not body.ids:
        raise HTTPException(status_code=400, detail="No ids provided")
    return {"deleted": job_query.delete(db, current_user, body.ids)}


@router.post(
    "/extract-url",
    response_model=ExtractedJobResponse,
    dependencies=[Depends(active_credentials)],
)
def extract_url(body: ExtractUrlRequest):
    url = (body.url or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    try:
        return job_extractor.extract_from_url(url)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except IntakeError:
        # Carries its own status; the app-level handler maps it. Must be caught
        # ahead of the blanket 502 below, or "add your API key" would read as a
        # failure to fetch the page.
        raise
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch the page: {e.__class__.__name__}",
        ) from e


@router.post("/manual", response_model=JobOut)
def add_manual_job(
    body: ManualJobRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    norm = job_extractor.normalize_job_url(body.url) if body.url else None
    if norm and job_query.find_by_url(db, current_user, norm):
        raise HTTPException(status_code=409, detail="A job with this URL already exists.")

    return job_query.create(
        db,
        current_user,
        title=body.title,
        company=body.company,
        location=body.location,
        description=body.description,
        url=norm,
        source=body.source or "manual",
    )


@router.post("/generate", response_model=list[JobOut])
def generate_cv(
    body: GenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not body.jobIds:
        raise HTTPException(status_code=400, detail="No job IDs provided")
    return intake.generate_for_jobs(db, current_user, body.jobIds)


@router.post("/screen", response_model=ScreenResult)
def screen_jobs(
    body: ScreenRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return intake.screen(db, current_user, body.ids)


@router.post("/fetch", response_model=SyncResult)
def fetch_jobs(
    body: SyncRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return intake.fetch(db, current_user, body.datePosted)


@router.post(
    "/{job_id}/tweak",
    response_model=TweakResponse,
    dependencies=[Depends(active_credentials)],
)
def tweak_job_doc(
    job_id: str,
    body: TweakRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run one turn of the edit-a-CV chat over the generated CV or cover letter."""
    return tweak.apply(db, current_user, job_id, body.target, body.prompt)


@router.post("/{job_id}/reset-tweaks", response_model=TweakResponse)
def reset_job_tweaks(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Restore generatedCv / generatedCl from their pre-tweak snapshots."""
    return tweak.reset(db, current_user, job_id)

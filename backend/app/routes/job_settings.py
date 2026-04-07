from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..core.auth import get_current_user
from ..core.db import get_db
from ..models.profile import Profile
from ..models.user import User
from ..schemas.profile import JobSettingsOut, JobSettingsUpdateRequest

router = APIRouter(prefix="/job-settings", tags=["job-settings"])


@router.get("", response_model=JobSettingsOut)
def get_job_settings(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    profile = db.query(Profile).filter(Profile.userId == current_user.id).first()
    return JobSettingsOut(
        preferredLocations=profile.preferredLocations if profile else None,
        jobTypes=profile.jobTypes if profile else None,
        keywords=profile.keywords if profile else None,
    )


@router.post("", response_model=JobSettingsOut)
def upsert_job_settings(
    body: JobSettingsUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = db.query(Profile).filter(Profile.userId == current_user.id).first()

    if profile:
        profile.preferredLocations = body.preferredLocations
        profile.jobTypes = body.jobTypes
        profile.keywords = body.keywords
    else:
        profile = Profile(
            userId=current_user.id,
            preferredLocations=body.preferredLocations,
            jobTypes=body.jobTypes,
            keywords=body.keywords,
        )
        db.add(profile)

    db.commit()
    db.refresh(profile)
    return JobSettingsOut(
        preferredLocations=profile.preferredLocations,
        jobTypes=profile.jobTypes,
        keywords=profile.keywords,
    )

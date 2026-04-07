from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..core.auth import get_current_user
from ..core.db import get_db
from ..models.profile import Profile
from ..models.user import User
from ..schemas.profile import ProfileOut, ProfileUpdateRequest

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=ProfileOut)
def get_profile(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    profile = db.query(Profile).filter(Profile.userId == current_user.id).first()
    if not profile:
        return ProfileOut(fullName=current_user.name or "")
    # Seed fullName from account if not set
    if not profile.fullName and current_user.name:
        profile.fullName = current_user.name
    return profile


@router.post("", response_model=ProfileOut)
def upsert_profile(
    body: ProfileUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = db.query(Profile).filter(Profile.userId == current_user.id).first()
    data = body.model_dump(exclude_none=False)

    if profile:
        for key, value in data.items():
            setattr(profile, key, value or None)
    else:
        profile = Profile(
            userId=current_user.id, **{k: v or None for k, v in data.items()}
        )
        db.add(profile)

    db.commit()
    db.refresh(profile)
    return profile

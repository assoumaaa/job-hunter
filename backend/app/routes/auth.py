from fastapi import APIRouter, Depends

from ..core.auth import get_current_user
from ..models.user import User
from ..schemas.user import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user

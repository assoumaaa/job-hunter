from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..core.auth import get_current_user
from ..core.config import settings
from ..core.db import get_db
from ..models.cv import CV
from ..models.user import User
from ..schemas.cv import CVCompileRequest, CVOut, CVUpdateRequest

router = APIRouter(prefix="/cv", tags=["cv"])


@router.get("", response_model=CVOut)
def get_cv(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    cv = db.query(CV).filter(CV.userId == current_user.id).first()
    return cv or CVOut(latexSource="")


@router.post("", response_model=CVOut)
def upsert_cv(
    body: CVUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cv = db.query(CV).filter(CV.userId == current_user.id).first()
    if cv:
        cv.latexSource = body.latexSource
        cv.updatedAt = datetime.utcnow()
    else:
        cv = CV(userId=current_user.id, latexSource=body.latexSource)
        db.add(cv)
    db.commit()
    db.refresh(cv)
    return cv


@router.post("/compile")
def compile_cv(body: CVCompileRequest, current_user: User = Depends(get_current_user)):
    try:
        response = httpx.post(
            f"{settings.LATEX_SERVICE_URL}/compile",
            json={"latex": body.latex},
            timeout=60.0,
        )
        if not response.is_success:
            raise HTTPException(status_code=500, detail=response.text)
        return Response(
            content=response.content,
            media_type="application/pdf",
            headers={"Content-Disposition": "inline; filename=cv.pdf"},
        )
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=str(e))

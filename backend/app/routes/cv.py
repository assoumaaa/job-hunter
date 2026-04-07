from datetime import datetime
import json

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..core.auth import get_current_user
from ..core.db import get_db
from ..models.cv import CV
from ..models.user import User
from ..schemas.cv import CVCompileRequest, CVOut, CVParseTextRequest, CVUpdateRequest
from ..services import cv_parser, pdf_generator

router = APIRouter(prefix="/cv", tags=["cv"])


@router.get("", response_model=CVOut)
def get_cv(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    cv = db.query(CV).filter(CV.userId == current_user.id).first()
    return cv or CVOut()


@router.post("", response_model=CVOut)
def upsert_cv(
    body: CVUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cv = db.query(CV).filter(CV.userId == current_user.id).first()
    data_str = json.dumps(body.structuredData)
    if cv:
        cv.structuredData = data_str
        cv.updatedAt = datetime.utcnow()
    else:
        cv = CV(userId=current_user.id, structuredData=data_str)
        db.add(cv)
    db.commit()
    db.refresh(cv)
    return cv


@router.post("/upload")
def upload_cv(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload a PDF resume and parse it into structured JSON.

    Returns the parsed data for the user to review/edit before saving.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    pdf_bytes = file.file.read()
    if len(pdf_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")

    parsed = cv_parser.parse_pdf(pdf_bytes)
    return {"structuredData": parsed}


@router.post("/parse-text")
def parse_cv_text(
    body: CVParseTextRequest,
    current_user: User = Depends(get_current_user),
):
    """Parse raw CV text into structured JSON."""
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="No text provided")

    parsed = cv_parser.parse_cv_text(body.text)
    return {"structuredData": parsed}


@router.post("/compile")
def compile_cv(
    body: CVCompileRequest,
    current_user: User = Depends(get_current_user),
):
    """Render structured CV data to PDF via Playwright."""
    try:
        pdf_bytes = pdf_generator.generate_pdf(
            body.structuredData,
            lang=body.lang,
            page_format=body.pageFormat,
        )
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": "inline; filename=cv.pdf"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

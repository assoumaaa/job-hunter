import json
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..core.auth import get_current_user
from ..core.db import get_db
from ..models.cv import CV
from ..models.user import User
from ..schemas.cv import (
    CLCompileRequest,
    CVCompileRequest,
    CVOut,
    CVParseTextRequest,
    CVUpdateRequest,
)
from ..services import claude, credentials, cv_parser, pdf_generator
from ..services.errors import IntakeError

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
    db: Session = Depends(get_db),
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

    try:
        with credentials.active(credentials.resolve(db, current_user)):
            parsed = cv_parser.parse_pdf(pdf_bytes)
    except IntakeError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e
    return {"structuredData": parsed}


@router.post("/parse-text")
def parse_cv_text(
    body: CVParseTextRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Parse raw CV text into structured JSON."""
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="No text provided")

    try:
        with credentials.active(credentials.resolve(db, current_user)):
            parsed = cv_parser.parse_cv_text(body.text)
    except IntakeError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e
    return {"structuredData": parsed}


@router.post("/compile")
def compile_cv(
    body: CVCompileRequest,
    trim: bool = False,
    current_user: User = Depends(get_current_user),
):
    """Render structured CV data to PDF via WeasyPrint.

    WYSIWYG by default: renders the submitted data verbatim with CSS auto-fit
    only. Content trimming happens once at generation/tweak time and is
    persisted there, so every view of a stored CV shows identical content.
    `?trim=true` (explicit opt-in) lets Haiku shorten wording at render time
    without saving — the result won't match the stored data.
    """
    try:
        pdf_bytes, _ = pdf_generator.fit_and_render(
            body.structuredData,
            lang=body.lang,
            page_format=body.pageFormat,
            trim_callback=claude.trim_resume_for_fit if trim else None,
        )
        name = body.structuredData.get("header", {}).get("name", "CV")
        filename = name.replace(" ", "_") + "_CV.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"inline; filename={filename}"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/compile-cl")
def compile_cover_letter(
    body: CLCompileRequest,
    current_user: User = Depends(get_current_user),
):
    """Render cover letter text to PDF."""
    try:
        pdf_bytes = pdf_generator.generate_cover_letter_pdf(
            body.text,
            contact=body.contact,
            page_format=body.pageFormat,
        )
        name = (body.contact or {}).get("name", "Cover_Letter")
        filename = name.replace(" ", "_") + "_CL.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"inline; filename={filename}"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

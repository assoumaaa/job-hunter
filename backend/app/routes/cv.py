from datetime import datetime
import json

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..core.auth import get_current_user
from ..core.db import get_db
from ..models.cv import CV
from ..models.user import User
from ..schemas.cv import CLCompileRequest, CVCompileRequest, CVOut, CVParseTextRequest, CVUpdateRequest
from ..services import claude, cv_parser, pdf_generator

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


@router.post("/estimate")
def estimate_cv(
    body: CVCompileRequest,
    current_user: User = Depends(get_current_user),
):
    """Estimate page count for a CV without rendering."""
    return pdf_generator.estimate_cv_pages(body.structuredData)


@router.post("/compile")
def compile_cv(
    body: CVCompileRequest,
    trim: bool = True,
    current_user: User = Depends(get_current_user),
):
    """Render structured CV data to PDF via WeasyPrint.

    `trim=true` (default) lets Haiku shorten bullets if CSS auto-fit can't squeeze
    the CV to one page. Disable with `?trim=false` for fast preview renders
    (e.g. the tweak page) where extra latency hurts UX and content distortion
    would confuse the user.
    """
    try:
        pdf_bytes = pdf_generator.generate_pdf(
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
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=500, detail=str(e))

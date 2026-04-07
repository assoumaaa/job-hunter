from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class CVOut(BaseModel):
    id: Optional[str] = None
    userId: Optional[str] = None
    latexSource: Optional[str] = None  # legacy
    structuredData: Optional[str] = None  # JSON string
    updatedAt: Optional[datetime] = None

    model_config = {"from_attributes": True}


class CVUpdateRequest(BaseModel):
    structuredData: dict  # structured CV JSON


class CVCompileRequest(BaseModel):
    structuredData: dict  # structured CV JSON
    lang: str = "en"
    pageFormat: str = "a4"


class CVParseTextRequest(BaseModel):
    text: str

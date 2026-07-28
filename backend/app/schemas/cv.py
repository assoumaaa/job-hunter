from datetime import datetime
from typing import Any

from pydantic import BaseModel


class CVOut(BaseModel):
    id: str | None = None
    userId: str | None = None
    latexSource: str | None = None  # legacy
    structuredData: str | None = None  # JSON string
    updatedAt: datetime | None = None

    model_config = {"from_attributes": True}


class CVUpdateRequest(BaseModel):
    structuredData: dict  # structured CV JSON


class CVCompileRequest(BaseModel):
    structuredData: dict  # structured CV JSON
    lang: str = "en"
    pageFormat: str = "a4"


class CLCompileRequest(BaseModel):
    text: str
    contact: dict[str, Any] | None = None
    pageFormat: str = "a4"


class CVParseTextRequest(BaseModel):
    text: str

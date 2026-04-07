from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class CVOut(BaseModel):
    id: Optional[str] = None
    userId: Optional[str] = None
    latexSource: str = ""
    updatedAt: Optional[datetime] = None

    model_config = {"from_attributes": True}


class CVUpdateRequest(BaseModel):
    latexSource: str


class CVCompileRequest(BaseModel):
    latex: str

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class JobOut(BaseModel):
    id: str
    userId: str
    title: str
    company: str
    location: Optional[str] = None
    description: Optional[str] = None
    url: Optional[str] = None
    salary: Optional[str] = None
    jobType: Optional[str] = None
    source: Optional[str] = None
    fetchedAt: Optional[datetime] = None
    relevanceStatus: str
    archetype: Optional[str] = None
    screeningScore: Optional[str] = None
    screeningReason: Optional[str] = None
    agentStatus: str
    atsScore: Optional[int] = None
    atsBreakdown: Optional[str] = None
    applicationStatus: str
    applicationDate: Optional[datetime] = None
    generatedCv: Optional[str] = None
    generatedCl: Optional[str] = None
    generatedAt: Optional[datetime] = None
    originalCv: Optional[str] = None
    originalCl: Optional[str] = None
    createdAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None

    model_config = {"from_attributes": True}


class TweakRequest(BaseModel):
    target: str  # "cv" | "cl"
    prompt: str


class TweakResponse(BaseModel):
    target: str
    generatedCv: Optional[str] = None
    generatedCl: Optional[str] = None
    hasOriginal: bool = True


class JobUpdateRequest(BaseModel):
    id: str
    relevanceStatus: Optional[str] = None
    agentStatus: Optional[str] = None
    applicationStatus: Optional[str] = None
    applicationDate: Optional[datetime] = None
    atsScore: Optional[int] = None
    atsBreakdown: Optional[str] = None
    generatedCv: Optional[str] = None
    generatedCl: Optional[str] = None
    generatedAt: Optional[datetime] = None


class JobDeleteRequest(BaseModel):
    ids: List[str]


class GenerateRequest(BaseModel):
    jobIds: List[str]


class ScreenRequest(BaseModel):
    ids: Optional[List[str]] = None


class ScreenResult(BaseModel):
    screened: int
    good_fit: int
    maybe: int
    irrelevant: int
    details: Optional[List[Dict[str, Any]]] = None  # per-job score/reason/archetype


class ManualJobRequest(BaseModel):
    title: str
    company: str
    description: str
    url: Optional[str] = None
    location: Optional[str] = None
    source: Optional[str] = "manual"


class ExtractUrlRequest(BaseModel):
    url: str


class ExtractedJobResponse(BaseModel):
    title: str
    company: str
    description: str
    location: Optional[str] = None
    url: Optional[str] = None
    source: Optional[str] = None


class SyncRequest(BaseModel):
    datePosted: str = "week"
    sources: List[str] = ["linkedin", "greenhouse"]  # which sources to fetch from


class SyncResult(BaseModel):
    inserted: int
    skipped: int
    bySource: Optional[Dict[str, Any]] = None  # e.g. {"linkedin": 5, "greenhouse": 12}

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class JobOut(BaseModel):
    id: str
    userId: str
    title: str
    company: str
    location: str | None = None
    description: str | None = None
    url: str | None = None
    salary: str | None = None
    jobType: str | None = None
    source: str | None = None
    fetchedAt: datetime | None = None
    relevanceStatus: str
    archetype: str | None = None
    screeningScore: str | None = None
    screeningReason: str | None = None
    agentStatus: str
    atsScore: int | None = None
    atsBreakdown: str | None = None
    applicationStatus: str
    applicationDate: datetime | None = None
    generatedCv: str | None = None
    generatedCl: str | None = None
    generatedAt: datetime | None = None
    originalCv: str | None = None
    originalCl: str | None = None
    chatCv: str | None = None
    chatCl: str | None = None
    createdAt: datetime | None = None
    updatedAt: datetime | None = None

    model_config = {"from_attributes": True}


class JobListItem(BaseModel):
    """Jobs-table row: light fields + has-doc flags, no heavy text. Full content
    loads per-job from GET /jobs/{id}."""

    id: str
    userId: str
    title: str
    company: str
    location: str | None = None
    url: str | None = None
    salary: str | None = None
    jobType: str | None = None
    source: str | None = None
    fetchedAt: datetime | None = None
    relevanceStatus: str
    archetype: str | None = None
    screeningScore: str | None = None
    screeningReason: str | None = None
    agentStatus: str
    atsScore: int | None = None
    atsBreakdown: str | None = None
    applicationStatus: str
    applicationDate: datetime | None = None
    generatedAt: datetime | None = None
    createdAt: datetime | None = None
    updatedAt: datetime | None = None
    hasGeneratedCv: bool = False
    hasGeneratedCl: bool = False

    model_config = {"from_attributes": True}


class JobPage(BaseModel):
    """One page of the jobs list — the server does the filtering/sorting/paging."""

    items: list[JobListItem]
    total: int


class JobStats(BaseModel):
    """Aggregate counts across ALL of a user's jobs (the list is paginated, so
    these can't be derived client-side)."""

    total: int
    toApply: int
    applied: int
    interviews: int
    unscreened: int
    avgAts: int | None = None


class TweakRequest(BaseModel):
    target: str  # "cv" | "cl"
    prompt: str


class ChatTurn(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class TweakResponse(BaseModel):
    target: str
    message: str | None = None  # assistant's plain-English reply for this turn
    generatedCv: str | None = None
    generatedCl: str | None = None
    hasOriginal: bool = True
    history: list[ChatTurn] | None = None  # full transcript for the target


class JobUpdateRequest(BaseModel):
    id: str
    relevanceStatus: str | None = None
    agentStatus: str | None = None
    applicationStatus: str | None = None
    applicationDate: datetime | None = None
    atsScore: int | None = None
    atsBreakdown: str | None = None
    generatedCv: str | None = None
    generatedCl: str | None = None
    generatedAt: datetime | None = None


class JobDeleteRequest(BaseModel):
    ids: list[str]


class GenerateRequest(BaseModel):
    jobIds: list[str]


class ScreenRequest(BaseModel):
    ids: list[str] | None = None


class ScreenResult(BaseModel):
    screened: int
    good_fit: int
    maybe: int
    irrelevant: int
    details: list[dict[str, Any]] | None = None


class ManualJobRequest(BaseModel):
    title: str
    company: str
    description: str
    url: str | None = None
    location: str | None = None
    source: str | None = "manual"


class ExtractUrlRequest(BaseModel):
    url: str


class ExtractedJobResponse(BaseModel):
    title: str
    company: str
    description: str
    location: str | None = None
    url: str | None = None
    source: str | None = None


class SyncRequest(BaseModel):
    datePosted: str = "week"


class SyncResult(BaseModel):
    inserted: int
    skipped: int

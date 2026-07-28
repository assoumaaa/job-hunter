
from pydantic import BaseModel


class ProfileOut(BaseModel):
    id: str | None = None
    userId: str | None = None
    totalYearsExperience: int | None = None
    seniority: str | None = None
    currentLocation: str | None = None
    preferredLocations: str | None = None
    noticePeriod: str | None = None
    fullName: str | None = None
    linkedinUrl: str | None = None
    githubUrl: str | None = None
    languages: str | None = None
    keywords: str | None = None
    jobTypes: str | None = None
    narrative: str | None = None
    dealBreakers: str | None = None

    model_config = {"from_attributes": True}


class ProfileUpdateRequest(BaseModel):
    fullName: str | None = None
    linkedinUrl: str | None = None
    githubUrl: str | None = None
    totalYearsExperience: int | None = None
    seniority: str | None = None
    currentLocation: str | None = None
    noticePeriod: str | None = None
    languages: str | None = None
    narrative: str | None = None
    dealBreakers: str | None = None


class JobSettingsUpdateRequest(BaseModel):
    preferredLocations: str | None = None
    jobTypes: str | None = None
    keywords: str | None = None


class JobSettingsOut(BaseModel):
    preferredLocations: str | None = None
    jobTypes: str | None = None
    keywords: str | None = None

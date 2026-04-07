from typing import Optional

from pydantic import BaseModel


class ProfileOut(BaseModel):
    id: Optional[str] = None
    userId: Optional[str] = None
    totalYearsExperience: Optional[int] = None
    seniority: Optional[str] = None
    currentLocation: Optional[str] = None
    preferredLocations: Optional[str] = None
    noticePeriod: Optional[str] = None
    fullName: Optional[str] = None
    linkedinUrl: Optional[str] = None
    githubUrl: Optional[str] = None
    languages: Optional[str] = None
    keywords: Optional[str] = None
    jobTypes: Optional[str] = None

    model_config = {"from_attributes": True}


class ProfileUpdateRequest(BaseModel):
    fullName: Optional[str] = None
    linkedinUrl: Optional[str] = None
    githubUrl: Optional[str] = None
    totalYearsExperience: Optional[int] = None
    seniority: Optional[str] = None
    currentLocation: Optional[str] = None
    noticePeriod: Optional[str] = None
    languages: Optional[str] = None


class JobSettingsUpdateRequest(BaseModel):
    preferredLocations: Optional[str] = None
    jobTypes: Optional[str] = None
    keywords: Optional[str] = None


class JobSettingsOut(BaseModel):
    preferredLocations: Optional[str] = None
    jobTypes: Optional[str] = None
    keywords: Optional[str] = None

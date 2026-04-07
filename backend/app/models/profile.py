import uuid

from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from ..core.db import Base


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    userId = Column(
        String, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    totalYearsExperience = Column(Integer, nullable=True)
    seniority = Column(String, nullable=True)
    currentLocation = Column(String, nullable=True)
    preferredLocations = Column(String, nullable=True)  # JSON string
    noticePeriod = Column(String, nullable=True)
    fullName = Column(String, nullable=True)
    linkedinUrl = Column(String, nullable=True)
    githubUrl = Column(String, nullable=True)
    languages = Column(String, nullable=True)  # JSON string
    keywords = Column(String, nullable=True)  # JSON string
    jobTypes = Column(String, nullable=True)  # JSON string
    narrative = Column(String, nullable=True)  # free-text career story
    dealBreakers = Column(String, nullable=True)  # JSON string list

    user = relationship("User", back_populates="profile")

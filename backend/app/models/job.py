import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from ..core.db import Base


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    userId = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=False)
    company = Column(String, nullable=False)
    location = Column(String, nullable=True)
    description = Column(String, nullable=True)
    url = Column(String, nullable=True)
    salary = Column(String, nullable=True)
    jobType = Column(String, nullable=True)
    source = Column(String, default="apify")
    fetchedAt = Column(DateTime, default=datetime.utcnow)

    relevanceStatus = Column(String, default="unscreened")
    archetype = Column(String, nullable=True)  # e.g. "backend", "frontend", "devops"
    screeningScore = Column(String, nullable=True)  # 1-5 score from screening
    screeningReason = Column(String, nullable=True)  # one-line explanation
    agentStatus = Column(String, default="pending")
    atsScore = Column(Integer, nullable=True)
    atsBreakdown = Column(String, nullable=True)  # JSON string

    applicationStatus = Column(String, default="new")
    applicationDate = Column(DateTime, nullable=True)

    generatedCv = Column(String, nullable=True)
    generatedCl = Column(String, nullable=True)
    generatedAt = Column(DateTime, nullable=True)

    # Snapshot of the originally generated CV/CL, set lazily on the first user
    # tweak so the user can "Reset to original" after a chain of edits.
    originalCv = Column(String, nullable=True)
    originalCl = Column(String, nullable=True)

    createdAt = Column(DateTime, default=datetime.utcnow)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="jobs")

    __table_args__ = (UniqueConstraint("userId", "url", name="uq_job_user_url"),)

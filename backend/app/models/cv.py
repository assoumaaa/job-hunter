import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.orm import relationship

from ..core.db import Base


class CV(Base):
    __tablename__ = "cvs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    userId = Column(
        String, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    latexSource = Column(String, nullable=False)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="cv")

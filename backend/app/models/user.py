import uuid

from sqlalchemy import Column, String
from sqlalchemy.orm import relationship

from ..core.db import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    clerk_user_id = Column(String, unique=True, nullable=True)
    name = Column(String, nullable=True)
    email = Column(String, unique=True, nullable=False)
    password = Column(String, nullable=True)

    jobs = relationship("Job", back_populates="user", cascade="all, delete-orphan")
    positions = relationship(
        "Position", back_populates="user", cascade="all, delete-orphan"
    )
    cv = relationship(
        "CV", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    profile = relationship(
        "Profile", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )

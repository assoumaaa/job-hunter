import uuid

from sqlalchemy import Column, ForeignKey, String
from sqlalchemy.orm import relationship

from ..core.db import Base


class Position(Base):
    __tablename__ = "positions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    userId = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    label = Column(String, nullable=False)

    user = relationship("User", back_populates="positions")

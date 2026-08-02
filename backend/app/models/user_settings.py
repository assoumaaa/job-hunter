import uuid

from sqlalchemy import Column, ForeignKey, String
from sqlalchemy.orm import relationship

from ..core.db import Base


class UserSettings(Base):
    """Per-user API keys and model choices, editable from the Settings page.

    Secret keys are stored Fernet-encrypted (see core/crypto.py); the frontend
    never receives the plaintext back. Model columns are null when the user
    hasn't chosen one — resolution then falls back to the config defaults.
    """

    __tablename__ = "user_settings"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    userId = Column(
        String, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    anthropicApiKeyEnc = Column(String, nullable=True)  # Fernet blob
    apifyTokenEnc = Column(String, nullable=True)  # Fernet blob
    screeningModel = Column(String, nullable=True)  # null -> config default
    generationModel = Column(String, nullable=True)  # null -> config default

    user = relationship("User", back_populates="settings")

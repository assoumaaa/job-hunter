"""The crypto seam: encrypt/decrypt round-trips, and a clear failure when the
encryption key isn't configured."""

import pytest
from cryptography.fernet import Fernet

from app.core import crypto
from app.core.config import settings


def test_encrypt_decrypt_round_trip(monkeypatch):
    monkeypatch.setattr(settings, "APP_ENCRYPTION_KEY", Fernet.generate_key().decode())
    token = crypto.encrypt("sk-ant-secret-value")
    assert token != "sk-ant-secret-value"  # actually encrypted
    assert crypto.decrypt(token) == "sk-ant-secret-value"


def test_encrypt_raises_when_key_unset(monkeypatch):
    monkeypatch.setattr(settings, "APP_ENCRYPTION_KEY", "")
    with pytest.raises(RuntimeError):
        crypto.encrypt("anything")

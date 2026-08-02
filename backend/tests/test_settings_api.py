"""The /settings endpoints: masking on read, clear/unchanged write semantics,
and rejecting an unknown model id. Uses dependency overrides so the router runs
against the in-memory `db` and a fixed user."""

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.core.auth import get_current_user
from app.core.config import settings
from app.core.db import get_db
from app.main import app
from app.models import User


@pytest.fixture
def client(db, monkeypatch):
    monkeypatch.setattr(settings, "APP_ENCRYPTION_KEY", Fernet.generate_key().decode())
    user = User(id="u1", email="u1@example.com", name="Test")
    db.add(user)
    db.commit()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def test_get_masks_and_shows_defaults(client):
    data = client.get("/api/settings").json()
    assert data["anthropicKeySet"] is False
    assert data["anthropicKeyMasked"] is None
    assert data["screeningModel"] == settings.LLM_SCREENING_MODEL
    assert any(o["id"] == "claude-opus-4-8" for o in data["modelOptions"])


def test_put_stores_key_never_leaks_and_get_reflects(client):
    r = client.put(
        "/api/settings",
        json={"anthropicKey": "sk-ant-abcd1234", "screeningModel": "claude-opus-4-8"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["anthropicKeySet"] is True
    assert data["anthropicKeyMasked"] == "…1234"
    assert "sk-ant-abcd1234" not in r.text  # full key never returned
    assert data["screeningModel"] == "claude-opus-4-8"

    reread = client.get("/api/settings").json()
    assert reread["anthropicKeySet"] is True
    assert reread["anthropicKeyMasked"] == "…1234"


def test_put_empty_string_clears_key(client):
    client.put("/api/settings", json={"anthropicKey": "sk-ant-abcd1234"})
    data = client.put("/api/settings", json={"anthropicKey": ""}).json()
    assert data["anthropicKeySet"] is False
    assert data["anthropicKeyMasked"] is None


def test_put_omitted_key_leaves_it_unchanged(client):
    client.put("/api/settings", json={"anthropicKey": "sk-ant-abcd1234"})
    # a write that omits the key must not wipe it
    data = client.put(
        "/api/settings", json={"screeningModel": "claude-sonnet-5"}
    ).json()
    assert data["anthropicKeySet"] is True
    assert data["anthropicKeyMasked"] == "…1234"
    assert data["screeningModel"] == "claude-sonnet-5"


def test_put_rejects_unknown_model(client):
    r = client.put("/api/settings", json={"screeningModel": "gpt-4"})
    assert r.status_code == 422

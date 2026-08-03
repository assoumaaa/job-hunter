"""/jobs/extract-url must surface the real credential error (not mask it as a
generic 502) and must resolve the signed-in user's saved Anthropic key.

Regression guard: a genuine fetch failure still maps to 502 — the new
IntakeError branch must not swallow it.
"""

import json

import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.core import crypto
from app.core.auth import get_current_user
from app.core.config import settings
from app.core.db import get_db
from app.main import app
from app.models import User, UserSettings
from app.services import credentials, job_extractor, llm

LINKEDIN_URL = "https://www.linkedin.com/jobs/view/4443841339/"


@pytest.fixture
def user(db):
    u = User(id="u1", email="u1@example.com", name="Test")
    db.add(u)
    db.commit()
    return u


@pytest.fixture
def client(db, user, monkeypatch):
    # A real encryption key so a saved per-user key round-trips, and NO
    # instance-wide key so resolution must come from the user (or fail).
    monkeypatch.setattr(settings, "APP_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _stub_fetch(monkeypatch, html="<html><body>A real job posting body.</body></html>"):
    """Make the page fetch succeed so the flow reaches the Claude step."""
    monkeypatch.setattr(job_extractor, "_fetch", lambda url: html)


def test_missing_anthropic_key_returns_actionable_422_not_502(client, monkeypatch):
    """The page fetches fine, but the Claude step raises IntakeError(422) because
    no key resolves. The route must surface that message + status — not the
    masked 502 'Failed to fetch the page: IntakeError'."""
    _stub_fetch(monkeypatch)
    # No FakeLLM installed: the real adapter runs and hits require_anthropic().
    r = client.post("/api/jobs/extract-url", json={"url": LINKEDIN_URL})
    assert r.status_code == 422
    assert r.json()["detail"] == "Add your Anthropic API key in Settings."


def test_uses_the_signed_in_users_saved_key(client, db, user, monkeypatch):
    """With no instance key but a saved per-user key, the request succeeds and
    the user's decrypted key is the one active during the LLM call."""
    db.add(
        UserSettings(userId=user.id, anthropicApiKeyEnc=crypto.encrypt("sk-ant-user"))
    )
    db.commit()
    _stub_fetch(monkeypatch)

    seen = {}
    reply = {
        "title": "Staff Engineer",
        "company": "Acme",
        "location": "Remote",
        "description": "Build things.",
    }

    class _KeySpyLLM:
        """Records the Anthropic key active at call time, returns a canned job."""

        def run(self, **kwargs):
            seen["key"] = credentials.current().anthropic_key
            return llm.LLMResult(text=json.dumps(reply))

    llm.use(_KeySpyLLM())
    r = client.post("/api/jobs/extract-url", json={"url": LINKEDIN_URL})
    assert r.status_code == 200
    assert seen["key"] == "sk-ant-user"  # the user's key was active, not the .env one
    assert r.json()["title"] == "Staff Engineer"


def test_genuine_fetch_failure_still_maps_to_502(client, monkeypatch):
    """A real network/HTTP failure is not an IntakeError, so it must still surface
    as 502 — the new IntakeError branch must not catch it."""

    def _boom(url):
        raise httpx.ConnectError("blocked by LinkedIn")

    monkeypatch.setattr(job_extractor, "_fetch", _boom)
    r = client.post("/api/jobs/extract-url", json={"url": LINKEDIN_URL})
    assert r.status_code == 502
    assert "ConnectError" in r.json()["detail"]

"""/jobs/{id}/tweak must run under the signed-in user's credentials.

Every other LLM route installs the user's bundle and maps IntakeError to its
real status; tweak did neither, so on an instance with no .env key the Claude
step raised IntakeError(422), escaped unhandled, and reached the browser as a
bare 500 — with no hint that the fix was to add a key in Settings.

Regression guard: a genuine failure inside the chat step must still surface,
not be swallowed by the new IntakeError branch.
"""

import json

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.core import crypto
from app.core.auth import get_current_user
from app.core.config import settings
from app.core.db import get_db
from app.main import app
from app.models import CV, Job, User, UserSettings
from app.services import credentials, llm

BASE_CV = {
    "header": {"name": "Omar"},
    "summary": "Engineer.",
    "experience": [{"company": "Odoo", "title": "Software Engineer", "bullets": ["x"]}],
}


@pytest.fixture
def user(db):
    u = User(id="u1", email="u1@example.com", name="Test")
    db.add(u)
    db.add(CV(userId=u.id, structuredData=json.dumps(BASE_CV)))
    db.commit()
    return u


@pytest.fixture
def job(db, user):
    j = Job(
        id="j1",
        userId=user.id,
        title="AI Engineer",
        company="SAP",
        generatedCv=json.dumps(BASE_CV),
        generatedCl="Dear team,",
    )
    db.add(j)
    db.commit()
    return j


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


def _tweak(client, job, target="cv", prompt="shorten the first bullet"):
    return client.post(
        f"/api/jobs/{job.id}/tweak", json={"target": target, "prompt": prompt}
    )


def test_missing_anthropic_key_returns_actionable_422_not_500(client, job):
    """No key resolves, so the chat step raises IntakeError(422). The route must
    surface that message and status instead of letting it escape as a bare 500."""
    # No FakeLLM installed: the real adapter runs and hits require_anthropic().
    r = _tweak(client, job)
    assert r.status_code == 422
    assert r.json()["detail"] == "Add your Anthropic API key in Settings."


def test_cover_letter_tweak_also_surfaces_the_missing_key(client, job):
    """The `cl` branch calls the model too, so it needs the same treatment."""
    r = _tweak(client, job, target="cl")
    assert r.status_code == 422
    assert r.json()["detail"] == "Add your Anthropic API key in Settings."


def test_uses_the_signed_in_users_saved_key(client, db, user, job):
    """With no instance key but a saved per-user key, the tweak succeeds and the
    user's decrypted key is the one active during the LLM call."""
    db.add(
        UserSettings(userId=user.id, anthropicApiKeyEnc=crypto.encrypt("sk-ant-user"))
    )
    db.commit()

    seen = {}

    class _KeySpyLLM:
        """Records the key active at call time; asks a question, edits nothing."""

        def run(self, **kwargs):
            seen["key"] = credentials.current().anthropic_key
            reply = {"message": "Which bullet did you mean?"}
            return llm.LLMResult(text=json.dumps(reply), tool_input=reply)

    llm.use(_KeySpyLLM())
    r = _tweak(client, job)

    assert r.status_code == 200
    assert seen["key"] == "sk-ant-user"  # the user's key, not the .env one
    assert r.json()["message"] == "Which bullet did you mean?"


def test_unexpected_chat_failure_still_surfaces(client, db, user, job):
    """A non-IntakeError blowing up inside the chat step must not be quietly
    turned into a 422 by the new branch."""
    db.add(
        UserSettings(userId=user.id, anthropicApiKeyEnc=crypto.encrypt("sk-ant-user"))
    )
    db.commit()

    class _BoomLLM:
        def run(self, **kwargs):
            raise RuntimeError("anthropic exploded")

    llm.use(_BoomLLM())
    with pytest.raises(RuntimeError, match="anthropic exploded"):
        _tweak(client, job)

"""POST /api/cv/compile — the render route, and its one LLM-touching option.

`?trim=true` asks the model to shorten wording at render time. That crosses the
LLM seam, so the route has to run under the signed-in user's credentials. It
didn't: the handler took no `db`, so it could not resolve a bundle, and the
trim silently ran on the instance-wide `.env` key — or, on a per-user
deployment where there is no `.env` key, silently didn't run at all and returned
an untrimmed PDF with no indication anything had gone wrong.
"""

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.core.auth import get_current_user
from app.core.config import settings
from app.core.db import get_db
from app.main import app
from app.models import User, UserSettings
from app.services import llm, pdf_generator
from tests.test_pdf_renderer import FakeRenderer

_CV = {
    "header": {"name": "Omar Assouma", "email": "o@x.com", "location": "Berlin"},
    "summary": "Backend engineer.",
    "experience": [
        {
            "company": "Acme",
            "title": "SWE",
            "location": "Berlin",
            "period": "2020-2024",
            "bullets": ["Built Python FastAPI services", "Shipped Docker deploys"],
        }
    ],
    "skills": [{"category": "Languages", "items": ["Python"]}],
}


@pytest.fixture
def user(db):
    user = User(id="u1", email="o@x.com", name="Omar")
    db.add(user)
    db.commit()
    return user


@pytest.fixture
def client(db, user, monkeypatch):
    # A real encryption key so a saved per-user key round-trips, and NO
    # instance-wide key, so resolution must come from the user (or fail).
    monkeypatch.setattr(settings, "APP_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def test_compile_without_trim_never_touches_the_llm(client):
    """The default path is WYSIWYG: no key needed, no model call."""
    pdf_generator.use_renderer(FakeRenderer([1]))
    fake = llm.FakeLLM()
    llm.use(fake)

    resp = client.post("/api/cv/compile", json={"structuredData": _CV})

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert fake.calls == []


def test_trim_without_a_key_tells_the_user_to_add_one(client):
    """Was: a silently untrimmed PDF, status 200. Now: the real precondition."""
    # Two pages at every CSS step, so the fit loop reaches the trim callback.
    pdf_generator.use_renderer(FakeRenderer([2] * 20))

    resp = client.post("/api/cv/compile?trim=true", json={"structuredData": _CV})

    assert resp.status_code == 422
    assert resp.json()["detail"] == "Add your Anthropic API key in Settings."


def test_trim_runs_under_the_signed_in_users_key(client, db, user):
    """The bundle reaches the seam, and it is the user's key — not the .env one."""
    from app.core import crypto

    db.add(UserSettings(userId="u1", anthropicApiKeyEnc=crypto.encrypt("sk-user-key")))
    db.commit()

    seen = {}

    class _KeySpyLLM:
        def run(self, **kwargs):
            from app.services import credentials

            seen["key"] = credentials.require_anthropic()
            # One page after the trim, so the loop converges.
            pdf_generator.use_renderer(FakeRenderer([1]))
            return llm.LLMResult(text="{}")

    llm.use(_KeySpyLLM())
    # Two pages at every CSS step, so the fit loop reaches the trim callback;
    # the spy then swaps in a one-page renderer so the retry converges.
    pdf_generator.use_renderer(FakeRenderer([2] * 20))

    resp = client.post("/api/cv/compile?trim=true", json={"structuredData": _CV})

    assert resp.status_code == 200
    assert seen["key"] == "sk-user-key"

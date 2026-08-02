"""The credentials seam: resolution order (user key → .env → none), the
request-scoped context, and that a user's model choice threads all the way into
the LLM call."""

import pytest
from cryptography.fernet import Fernet

from app.core import crypto
from app.core.config import settings
from app.models import Job, Position, User, UserSettings
from app.services import credentials, intake
from app.services.errors import IntakeError


def _user(db, uid="u1"):
    user = User(id=uid, email=f"{uid}@example.com", name="Test")
    db.add(user)
    db.commit()
    return user


def test_resolve_falls_back_to_env(db, monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "env-anthropic")
    monkeypatch.setattr(settings, "APIFY_TOKEN", "env-apify")
    bundle = credentials.resolve(db, _user(db))
    assert bundle.anthropic_key == "env-anthropic"
    assert bundle.apify_token == "env-apify"
    assert bundle.screening_model == settings.LLM_SCREENING_MODEL
    assert bundle.generation_model == settings.LLM_GENERATION_MODEL


def test_resolve_prefers_user_key_and_model(db, monkeypatch):
    monkeypatch.setattr(settings, "APP_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "env-anthropic")
    user = _user(db, "u2")
    db.add(
        UserSettings(
            userId=user.id,
            anthropicApiKeyEnc=crypto.encrypt("user-anthropic"),
            screeningModel="claude-opus-4-8",
        )
    )
    db.commit()

    bundle = credentials.resolve(db, user)
    assert bundle.anthropic_key == "user-anthropic"  # user key wins
    assert bundle.screening_model == "claude-opus-4-8"  # user model wins
    # apify not set by the user → falls back to .env
    assert bundle.apify_token == (settings.APIFY_TOKEN or None)
    # generation model not set by the user → config default
    assert bundle.generation_model == settings.LLM_GENERATION_MODEL


def test_require_raises_422_when_unresolved(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    monkeypatch.setattr(settings, "APIFY_TOKEN", "")
    with pytest.raises(IntakeError) as excinfo:
        credentials.require_anthropic()
    assert excinfo.value.status_code == 422
    with pytest.raises(IntakeError):
        credentials.require_apify()


def test_active_context_sets_and_resets(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "env-key")
    bundle = credentials.Bundle(
        anthropic_key="ctx-key",
        apify_token=None,
        screening_model="claude-opus-4-8",
        generation_model="claude-sonnet-5",
    )
    with credentials.active(bundle):
        assert credentials.require_anthropic() == "ctx-key"
        assert credentials.current().screening_model == "claude-opus-4-8"
    # after the block, resolution falls back to the .env default bundle
    assert credentials.current().anthropic_key == "env-key"


def test_user_model_choice_flows_into_llm_call(db, fake_llm, monkeypatch):
    """A user's screening-model choice reaches the FakeLLM call through the
    credential context installed by the intake entry point."""
    monkeypatch.setattr(settings, "APP_ENCRYPTION_KEY", Fernet.generate_key().decode())
    user = _user(db, "u3")
    db.add(Position(userId=user.id, label="Backend Engineer"))
    db.add(UserSettings(userId=user.id, screeningModel="claude-opus-4-8"))
    db.add(
        Job(id="jx", userId=user.id, title="BE", company="Acme",
            description="Python", relevanceStatus="unscreened")
    )
    db.commit()

    fake = fake_llm(
        ['[{"id":"jx","fit":"good_fit","score":4.0,"reason":"ok","archetype":"backend"}]']
    )
    intake.screen(db, user)

    assert fake.calls[0]["model"] == "claude-opus-4-8"

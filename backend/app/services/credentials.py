"""The one seam for per-request API credentials and model choices.

Resolution order (locked in the design): the signed-in user's saved value →
the instance-wide `.env` value → nothing. Route-facing service entry points
resolve a `Bundle` from the current user and install it for the duration of
their work via `active(...)`; the LLM and Apify seams read it back through
`current()` / `require_*()`.

Set and read happen on the same thread — FastAPI runs a sync endpoint and the
LLM calls it makes in one threadpool worker — so the ContextVar carries cleanly
without any cross-thread propagation concern. Code paths that never install a
bundle (tests, scripts) fall back to an all-`.env` bundle, so nothing breaks;
`require_*` still raises when neither a user key nor a `.env` key resolves.
"""

from __future__ import annotations

import contextlib
import contextvars
from dataclasses import dataclass

from sqlalchemy.orm import Session

from ..core import crypto
from ..core.config import settings
from ..models import User, UserSettings
from .errors import IntakeError


@dataclass(frozen=True)
class Bundle:
    """The resolved credentials + model choices for one request."""

    anthropic_key: str | None
    apify_token: str | None
    screening_model: str
    generation_model: str


_active: contextvars.ContextVar[Bundle | None] = contextvars.ContextVar(
    "credentials_bundle", default=None
)


def _decrypt_or_none(token_enc: str | None) -> str | None:
    """Decrypt a stored key, or return None if unset or undecryptable (e.g. the
    encryption key was rotated) — the caller then falls back to `.env`."""
    if not token_enc:
        return None
    try:
        return crypto.decrypt(token_enc)
    except Exception:
        return None


def _default_bundle() -> Bundle:
    """Instance-wide bundle sourced entirely from config/`.env`."""
    return Bundle(
        anthropic_key=settings.ANTHROPIC_API_KEY or None,
        apify_token=settings.APIFY_TOKEN or None,
        screening_model=settings.LLM_SCREENING_MODEL,
        generation_model=settings.LLM_GENERATION_MODEL,
    )


def resolve(db: Session, user: User) -> Bundle:
    """Resolve `user`'s effective bundle: user value → `.env` → None (keys) /
    config default (models)."""
    row = db.query(UserSettings).filter(UserSettings.userId == user.id).first()
    default = _default_bundle()
    if not row:
        return default
    return Bundle(
        anthropic_key=_decrypt_or_none(row.anthropicApiKeyEnc) or default.anthropic_key,
        apify_token=_decrypt_or_none(row.apifyTokenEnc) or default.apify_token,
        screening_model=row.screeningModel or default.screening_model,
        generation_model=row.generationModel or default.generation_model,
    )


@contextlib.contextmanager
def active(bundle: Bundle):
    """Install `bundle` as the active credentials for the enclosed work."""
    token = _active.set(bundle)
    try:
        yield bundle
    finally:
        _active.reset(token)


def current() -> Bundle:
    """The active bundle, or an all-`.env` bundle when none is installed."""
    return _active.get() or _default_bundle()


def require_anthropic() -> str:
    """The active Anthropic key, or an `IntakeError(422)` the route surfaces."""
    key = current().anthropic_key
    if not key:
        raise IntakeError("Add your Anthropic API key in Settings.", 422)
    return key


def require_apify() -> str:
    """The active Apify token, or an `IntakeError(422)` the route surfaces."""
    token = current().apify_token
    if not token:
        raise IntakeError("Add your Apify token in Settings.", 422)
    return token

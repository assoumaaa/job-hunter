"""The one place per-user secrets are encrypted at rest.

A thin wrapper over Fernet, keyed by `settings.APP_ENCRYPTION_KEY`. Callers cross
this seam via `encrypt` / `decrypt` and never touch the cipher directly.

If `APP_ENCRYPTION_KEY` is unset, `encrypt`/`decrypt` raise `RuntimeError` — the
app still runs on the `.env` fallback keys, but storing a per-user key in
Settings is blocked until the deploy sets one. Generate one with:

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""

from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken

from .config import settings

__all__ = ["encrypt", "decrypt", "InvalidToken"]

_KEY_UNSET_MSG = (
    "APP_ENCRYPTION_KEY is not set — set it to store API keys in Settings. "
    'Generate one with: python -c "from cryptography.fernet import Fernet; '
    'print(Fernet.generate_key().decode())"'
)


def _cipher() -> Fernet:
    """Build a Fernet from the configured key. Not cached, so a rotated key (or a
    test that patches settings) takes effect immediately."""
    key = settings.APP_ENCRYPTION_KEY
    if not key:
        raise RuntimeError(_KEY_UNSET_MSG)
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt(plaintext: str) -> str:
    """Encrypt `plaintext`, returning a urlsafe token string."""
    return _cipher().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    """Decrypt a token from `encrypt`. Raises `InvalidToken` if the key changed or
    the token is corrupt."""
    return _cipher().decrypt(token.encode()).decode()

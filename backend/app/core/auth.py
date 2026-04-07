from __future__ import annotations

import base64
import uuid
from typing import Optional

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db

bearer_scheme = HTTPBearer(auto_error=False)

_jwks_cache: Optional[dict] = None


def _get_clerk_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache:
        return _jwks_cache
    # Derive JWKS URL from publishable key: pk_<env>_<base64(frontend_api_url$)>
    raw = settings.CLERK_PUBLISHABLE_KEY.split('_', 2)[-1]
    padded = raw + '=' * (-len(raw) % 4)
    frontend_api = base64.b64decode(padded).decode().rstrip('$')
    jwks_url = f'https://{frontend_api}/.well-known/jwks.json'
    resp = httpx.get(jwks_url, timeout=10)
    resp.raise_for_status()
    _jwks_cache = resp.json()
    return _jwks_cache


def _verify_clerk_token(token: str) -> dict:
    jwks = _get_clerk_jwks()
    try:
        payload = jwt.decode(
            token,
            jwks,
            algorithms=['RS256'],
            options={'verify_aud': False},
        )
        return payload
    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid token') from e


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    from ..models.user import User

    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Not authenticated')

    payload = _verify_clerk_token(credentials.credentials)
    clerk_user_id: str = payload.get('sub')
    if not clerk_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid token')

    # Look up or auto-create the local user record
    user = db.query(User).filter(User.clerk_user_id == clerk_user_id).first()
    if not user:
        email = (payload.get('email_addresses') or [{}])[0].get('email_address') or f'{clerk_user_id}@clerk.local'
        name = f"{payload.get('first_name') or ''} {payload.get('last_name') or ''}".strip() or None
        user = User(
            id=str(uuid.uuid4()),
            clerk_user_id=clerk_user_id,
            email=email,
            name=name,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    return user

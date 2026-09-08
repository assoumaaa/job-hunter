"""Request-scoped dependencies for the route layer.

`active_credentials` is the one way a handler says "this request can reach the
LLM or Apify seams". It resolves the signed-in user's bundle and installs it for
the duration of the request, so no handler has to remember the `with` block —
and so a handler that forgets to ask for `db` can no longer silently fall back
to the instance-wide `.env` key.

It must be an *async* dependency. FastAPI runs sync dependencies and sync
endpoints in a threadpool, each under its own copy of the request context, so a
ContextVar set inside a sync `yield` dependency never reaches the endpoint —
worse, resetting its token on teardown raises `ValueError: <Token ...> was
created in a different Context`. An async dependency runs in the request's own
task context, which the threadpool copies when it calls the endpoint, so the
bundle propagates and unwinds cleanly.
"""

from __future__ import annotations

from fastapi import Depends
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from ..models import User
from ..services import credentials
from .auth import get_current_user
from .db import get_db


async def active_credentials(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Install the signed-in user's credentials for this request."""
    # resolve() queries UserSettings; keep the blocking call off the event loop.
    bundle = await run_in_threadpool(credentials.resolve, db, current_user)
    with credentials.active(bundle):
        yield bundle

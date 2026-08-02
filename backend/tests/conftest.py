"""Shared test fixtures.

The whole app reaches the language model through the `llm` seam, so a test can
swap in a `FakeLLM` and run any pipeline offline. `restore_llm` guarantees the
real adapter is back after every test, so one test's fake can't leak into the
next.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 — registers every model on Base
from app.core.db import Base
from app.services import llm, pdf_generator


@pytest.fixture(autouse=True)
def restore_llm():
    yield
    llm.reset()


@pytest.fixture(autouse=True)
def restore_renderer():
    yield
    pdf_generator.reset_renderer()


@pytest.fixture
def db():
    """A throwaway in-memory SQLite session with every table created."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        # One shared connection so the schema is visible across threads too (the
        # TestClient runs sync endpoints in a worker thread).
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def fake_llm():
    """Return a factory: `fake_llm([...])` installs a FakeLLM and hands it back."""

    def _install(replies=None, default=""):
        fake = llm.FakeLLM(replies=replies, default=default)
        llm.use(fake)
        return fake

    return _install

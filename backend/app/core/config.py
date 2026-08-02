from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ENV_FILE))

    # Postgres is the only supported database. The default points at the local
    # dev Postgres from the repo-root docker-compose.yml (`docker compose up -d db`);
    # override in production with a managed Postgres URL.
    DATABASE_URL: str = (
        "postgresql+psycopg://jobhunter:jobhunter@localhost:5432/jobhunter"
    )

    # Absolute path to the built Vite SPA (`build/`) that FastAPI serves in the
    # single-container deploy. Unset in dev, where the Vite dev server serves it.
    FRONTEND_DIST: str = ""

    # Token verification derives the Clerk JWKS URL from the publishable key, so
    # only CLERK_PUBLISHABLE_KEY is required at runtime (see core/auth.py).
    # CLERK_SECRET_KEY is currently unused but kept for future Backend-API calls.
    CLERK_SECRET_KEY: str = ""
    CLERK_PUBLISHABLE_KEY: str = ""

    # Instance-wide fallback keys. Per-user keys set in Settings override these;
    # these are used when a user hasn't configured their own (see
    # services/credentials.py).
    ANTHROPIC_API_KEY: str = ""
    APIFY_TOKEN: str = ""

    # Fernet key for encrypting per-user API keys at rest. Generate with:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # Unset is fine — the app still runs on the .env fallback keys above; only
    # *storing* per-user keys in Settings requires it.
    APP_ENCRYPTION_KEY: str = ""

    # Model tiers: Haiku for cheap bulk work, Sonnet for quality generation.
    # Instance defaults; per-user choices in Settings override these.
    LLM_SCREENING_MODEL: str = "claude-haiku-4-5"
    LLM_GENERATION_MODEL: str = "claude-sonnet-4-6"


settings = Settings()

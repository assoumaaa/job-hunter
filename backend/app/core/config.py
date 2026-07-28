from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ENV_FILE))

    DATABASE_URL: str = "sqlite:///./job_hunter.db"

    CLERK_SECRET_KEY: str = ""
    CLERK_PUBLISHABLE_KEY: str = ""

    ANTHROPIC_API_KEY: str = ""
    APIFY_TOKEN: str = ""
    LATEX_SERVICE_URL: str = "http://localhost:3001"

    # Model tiers: Haiku for cheap bulk work, Sonnet for quality generation.
    LLM_SCREENING_MODEL: str = "claude-haiku-4-5-20251001"
    LLM_GENERATION_MODEL: str = "claude-sonnet-4-6"


settings = Settings()

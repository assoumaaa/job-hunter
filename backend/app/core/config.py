from pathlib import Path

from pydantic_settings import BaseSettings

_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./job_hunter.db"

    CLERK_SECRET_KEY: str = ""
    CLERK_PUBLISHABLE_KEY: str = ""

    ANTHROPIC_API_KEY: str = ""
    APIFY_TOKEN: str = ""
    LATEX_SERVICE_URL: str = "http://localhost:3001"

    class Config:
        env_file = str(_ENV_FILE)


settings = Settings()

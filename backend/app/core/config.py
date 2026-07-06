"""
core/config.py
-----------------------------------------------------------------------
Single source of truth for environment configuration. Everything else in
the backend imports `settings` from here instead of reading os.environ
directly, so there is exactly one place that knows how config is wired.
-----------------------------------------------------------------------
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Postgres connection string (Supabase provisions this database, but we
    # talk to it directly over SQLAlchemy - no Supabase REST/PostgREST layer).
    DATABASE_URL: str

    # Supabase project URL, e.g. https://<ref>.supabase.co - used by the
    # extension for the Google OAuth redirect; the backend itself only
    # needs SUPABASE_JWT_SECRET to verify tokens locally.
    SUPABASE_URL: str
    SUPABASE_JWT_SECRET: str

    # Comma-separated list of allowed CORS origins (extension + dashboard).
    CORS_ORIGINS: str = "http://localhost:5173,https://codeplus-1.onrender.com,chrome-extension://mnghbggkdbmhpmmdpncgkodelekghgcf"

    ENVIRONMENT: str = "development"

    # Minimum number of prior Accepted solves required before a topic or
    # difficulty average is trusted for the personalized timer.
    MIN_SOLVED_FOR_TOPIC_AVERAGE: int = 3
    MIN_SOLVED_FOR_DIFFICULTY_AVERAGE: int = 3

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

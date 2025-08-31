from pydantic_settings import BaseSettings
from pydantic import Field, AnyUrl

class Settings(BaseSettings):
    app_name: str = "MarkBudget API"
    app_env: str = Field("development", alias="APP_ENV")
    app_url: AnyUrl | str = Field("http://localhost:3000", alias="APP_URL")
    api_url: AnyUrl | str = Field("http://localhost:8000", alias="API_URL")

    postgres_url: str = Field(..., alias="POSTGRES_URL")
    redis_url: str = Field("redis://redis:6379/0", alias="REDIS_URL")

    jwt_secret: str = Field("change-me", alias="JWT_SECRET")
    jwt_refresh_secret: str = Field("change-me-too", alias="JWT_REFRESH_SECRET")

    sentry_dsn: str | None = Field(None, alias="SENTRY_DSN")

    class Config:
        env_file = ".env"
        case_sensitive = False

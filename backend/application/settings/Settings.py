import os
from pathlib import Path
from typing import Literal, Optional, List, Any
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

APPLICATION_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = APPLICATION_DIR.parent
ROOT_DIR = BACKEND_DIR.parent


class CORSSettings(BaseModel):
    allow_origins: List[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:8000",
        "http://localhost:8000",
    ]
    allow_origin_regex: str = r".*"


class StorageSettings(BaseModel):
    database_url: Optional[str] = Field(
        default=os.getenv("DATABASE_URL", "postgresql://caesar:caesar_ops_password@localhost:5432/caesar_ops")
    )
    sqlite_db_path: str = Field(
        default=os.getenv("SQLITE_DB_PATH", str(ROOT_DIR / "data" / "caesar.db"))
    )
    supabase_url: Optional[str] = Field(
        default=os.getenv("SUPABASE_URL", "")
    )
    supabase_service_role_key: Optional[str] = Field(
        default=os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    )

    @property
    def effective_database_url(self) -> str:
        """Returns PostgreSQL URL (normalized for SQLAlchemy psycopg2 driver) or SQLite local URL."""
        if self.database_url:
            url = self.database_url
            if url.startswith("postgres://"):
                url = url.replace("postgres://", "postgresql+psycopg2://", 1)
            elif url.startswith("postgresql://") and not url.startswith("postgresql+"):
                url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
            return url
        return f"sqlite:///{self.sqlite_db_path}"


class AppSettings(BaseSettings):
    app_name: str = "CaesarAICareerOps"
    environment: str = Field(default=os.getenv("ENVIRONMENT", "local"))
    cors: CORSSettings = Field(default_factory=CORSSettings)
    storage: StorageSettings = Field(default_factory=StorageSettings)
    port: int = Field(default=int(os.getenv("PORT", "8000")))
    career_ops_dir: str = Field(
        default=os.getenv("CAREER_OPS_DIR", str(BACKEND_DIR / "career-ops"))
    )
    data_dir: str = Field(
        default=os.getenv("DATA_DIR", str(ROOT_DIR / "data"))
    )

    def model_post_init(self, __context: Any = None) -> None:
        p_career = Path(self.career_ops_dir)
        if not p_career.is_absolute():
            self.career_ops_dir = str((ROOT_DIR / p_career).resolve())
        p_data = Path(self.data_dir)
        if not p_data.is_absolute():
            self.data_dir = str((ROOT_DIR / p_data).resolve())

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = AppSettings()

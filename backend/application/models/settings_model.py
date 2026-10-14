from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field


class Profile(SQLModel, table=True):
    __tablename__ = "profiles"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(default="default", unique=True, index=True)
    content: str = Field(..., description="YAML profile configuration")
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SaveProfileRequest(SQLModel):
    content: str = Field(..., description="YAML content for profile.yml")


class ScanRequest(SQLModel):
    verify: bool = Field(default=False, description="Whether to run Playwright liveness verification")


class DashboardStats(SQLModel):
    total_applications: int = 0
    high_score_roles: int = 0
    applied: int = 0
    interviews: int = 0
    offers: int = 0
    pipeline_inbox_count: int = 0
    total_reports: int = 0
    total_pdfs: int = 0

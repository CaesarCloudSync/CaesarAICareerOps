from datetime import datetime, date, timezone
from typing import Optional
from sqlmodel import SQLModel, Field


class ApplicationBase(SQLModel):
    company: str = Field(..., description="Target company name")
    role: str = Field(..., description="Role title")
    score: float = Field(default=0.0, description="Match score out of 5")
    status: str = Field(default="Evaluated", description="Current status: Evaluated, Applied, Interview, Offer, Rejected")
    date_applied: Optional[str] = Field(default=None, description="ISO date string")
    url: Optional[str] = Field(default="", description="Job posting URL")
    report_path: Optional[str] = Field(default="", description="Relative path to generated markdown report")
    notes: Optional[str] = Field(default="", description="Notes or action items")
    answers: Optional[str] = Field(default=None, description="JSON string of persisted tailored answers")


class Application(ApplicationBase, table=True):
    __tablename__ = "applications"

    id: Optional[int] = Field(default=None, primary_key=True)
    num: Optional[str] = Field(default="001", description="Formatted sequence number, e.g. 001")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ApplicationCreate(ApplicationBase):
    pass


class ApplicationUpdate(SQLModel):
    company: Optional[str] = None
    role: Optional[str] = None
    score: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    report_path: Optional[str] = None
    answers: Optional[str] = None


class StatusUpdateRequest(SQLModel):
    company: str
    role: str
    status: str


class ScoreUpdateRequest(SQLModel):
    app_id: Optional[int] = None
    company: Optional[str] = None
    role: Optional[str] = None
    score: float

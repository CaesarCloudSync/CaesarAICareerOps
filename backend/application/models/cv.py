from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field


class ResumeBase(SQLModel):
    title: str = Field(default="Master CV", description="Descriptive title of CV")
    content: str = Field(..., description="Markdown content of the CV")
    is_default: bool = Field(default=True, description="Whether this is the default active CV")


class Resume(ResumeBase, table=True):
    __tablename__ = "resumes"

    id: Optional[int] = Field(default=None, primary_key=True)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ResumeCreate(ResumeBase):
    pass


class ResumeSaveRequest(SQLModel):
    content: str

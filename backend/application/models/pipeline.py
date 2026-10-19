from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field


class PipelineItem(SQLModel, table=True):
    __tablename__ = "pipeline_inbox"

    id: Optional[int] = Field(default=None, primary_key=True)
    raw_text: str = Field(..., description="Raw line text from inbox")
    status: str = Field(default="pending", description="Status: pending, evaluated, discarded")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PipelineAddRequest(SQLModel):
    input_data: str = Field(..., description="URL or job line to add to the inbox")


class PipelineDeleteBatchRequest(SQLModel):
    urls: list[str] = Field(..., description="List of URLs or raw lines to delete across all occurrences")


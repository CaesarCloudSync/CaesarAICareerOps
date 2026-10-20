from datetime import datetime, timezone
from typing import Optional, Dict, Any
from sqlmodel import SQLModel, Field
from pydantic import BaseModel


class ScheduleBase(SQLModel):
    name: str = Field(index=True)
    target_area: str = Field(default="new_jobs")  # "new_jobs" | "backlog"

    # Granular Stage Toggles
    enable_scan: bool = Field(default=True)
    enable_liveness: bool = Field(default=True)
    enable_evaluation: bool = Field(default=False)

    # Stage 1 (Scan) Configuration
    prompt: Optional[str] = Field(default=None)

    # Stage 2 (Liveness) Configuration
    liveness_purge_dead: bool = Field(default=True)

    # Stage 3 (Evaluation) Configuration
    eval_min_score: int = Field(default=70)
    eval_batch_size: int = Field(default=10)
    eval_scope: str = Field(default="unevaluated")  # "unevaluated" | "re_evaluate_all"
    eval_order: str = Field(default="highest_match")  # "highest_match" | "oldest_first" | "newest_first"

    # Timing & Frequency
    frequency_type: str = Field(default="daily")  # "daily", "hourly", "every_hours", "weekdays"
    interval_hours: Optional[int] = Field(default=12)
    time_of_day: Optional[str] = Field(default="09:00")  # HH:MM
    days_of_week: Optional[str] = Field(default="1,2,3,4,5")  # 1=Mon, 7=Sun

    # State & Execution Tracking
    is_active: bool = Field(default=True)
    last_run_at: Optional[datetime] = Field(default=None)
    next_run_at: Optional[datetime] = Field(default=None)
    last_status: str = Field(default="idle")  # "idle" | "running" | "success" | "failed"
    last_result_summary: Optional[str] = Field(default=None)


class ScheduleTask(ScheduleBase, table=True):
    __tablename__ = "scheduletask"

    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ScheduleCreateRequest(BaseModel):
    name: str
    target_area: str = "new_jobs"
    enable_scan: bool = True
    enable_liveness: bool = True
    enable_evaluation: bool = False
    prompt: Optional[str] = None
    liveness_purge_dead: bool = True
    eval_min_score: int = 70
    eval_batch_size: int = 10
    eval_scope: str = "unevaluated"
    eval_order: str = "highest_match"
    frequency_type: str = "daily"
    interval_hours: Optional[int] = 12
    time_of_day: Optional[str] = "09:00"
    days_of_week: Optional[str] = "1,2,3,4,5"
    is_active: bool = True


class ScheduleUpdateRequest(BaseModel):
    name: Optional[str] = None
    target_area: Optional[str] = None
    enable_scan: Optional[bool] = None
    enable_liveness: Optional[bool] = None
    enable_evaluation: Optional[bool] = None
    prompt: Optional[str] = None
    liveness_purge_dead: Optional[bool] = None
    eval_min_score: Optional[int] = None
    eval_batch_size: Optional[int] = None
    eval_scope: Optional[str] = None
    eval_order: Optional[str] = None
    frequency_type: Optional[str] = None
    interval_hours: Optional[int] = None
    time_of_day: Optional[str] = None
    days_of_week: Optional[str] = None
    is_active: Optional[bool] = None


class ScheduleResponse(ScheduleBase):
    id: Optional[int] = None
    created_at: Optional[datetime] = None
    progress: Optional[Dict[str, Any]] = None

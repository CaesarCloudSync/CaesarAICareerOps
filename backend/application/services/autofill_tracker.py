import time
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List


class AutofillBatchJob:
    def __init__(self, job_id: str, app_ids: List[int]):
        self.job_id = job_id
        self.app_ids = app_ids
        self.total = len(app_ids)
        self.current_index = 0
        self.current_target = ""
        self.status = "running"  # "running", "completed", "failed", "cancelled"
        self.completed_count = 0
        self.failed_count = 0
        self.cancelled = False
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.updated_at = self.started_at
        self.completed_at: Optional[str] = None
        self.start_timestamp = time.time()
        self.elapsed_seconds: float = 0.0
        self.results: List[Dict[str, Any]] = []
        self.error: Optional[str] = None
        self.detail: str = f"Starting AI form inspection for {self.total} application(s)..."

    def update_progress(self, current_index: int, current_target: str, detail: Optional[str] = None):
        self.current_index = current_index
        self.current_target = current_target
        if detail:
            self.detail = detail
        else:
            self.detail = f"Processing application {current_index} of {self.total}..."
        self.elapsed_seconds = round(time.time() - self.start_timestamp, 1)
        self.updated_at = datetime.now(timezone.utc).isoformat()

    def record_result(self, app_id: int, target: str, success: bool, questions_count: int = 0, has_cover_letter: bool = False, error: Optional[str] = None):
        if success:
            self.completed_count += 1
        else:
            self.failed_count += 1
        self.results.append({
            "app_id": app_id,
            "target": target,
            "success": success,
            "questions_count": questions_count,
            "has_cover_letter": has_cover_letter,
            "error": error,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        self.elapsed_seconds = round(time.time() - self.start_timestamp, 1)
        self.updated_at = datetime.now(timezone.utc).isoformat()

    def complete(self):
        self.status = "completed"
        self.detail = f"Batch autofill complete: {self.completed_count} processed, {self.failed_count} failed."
        self.elapsed_seconds = round(time.time() - self.start_timestamp, 1)
        self.completed_at = datetime.now(timezone.utc).isoformat()
        self.updated_at = self.completed_at

    def cancel(self):
        self.cancelled = True
        self.status = "cancelled"
        self.detail = f"Batch autofill stopped by user ({self.completed_count} completed)."
        self.elapsed_seconds = round(time.time() - self.start_timestamp, 1)
        self.completed_at = datetime.now(timezone.utc).isoformat()
        self.updated_at = self.completed_at

    def fail(self, error: str):
        self.status = "failed"
        self.error = error
        self.detail = f"Batch autofill failed: {error}"
        self.elapsed_seconds = round(time.time() - self.start_timestamp, 1)
        self.completed_at = datetime.now(timezone.utc).isoformat()
        self.updated_at = self.completed_at

    def to_dict(self) -> Dict[str, Any]:
        elapsed = (
            self.elapsed_seconds
            if self.status != "running"
            else round(time.time() - self.start_timestamp, 1)
        )
        return {
            "job_id": self.job_id,
            "status": self.status,
            "total": self.total,
            "current_index": self.current_index,
            "current_target": self.current_target,
            "completed_count": self.completed_count,
            "failed_count": self.failed_count,
            "elapsed_seconds": elapsed,
            "detail": self.detail,
            "started_at": self.started_at,
            "updated_at": self.updated_at,
            "completed_at": self.completed_at,
            "results": self.results,
            "error": self.error,
        }


class AutofillBatchTracker:
    def __init__(self):
        self._jobs: Dict[str, AutofillBatchJob] = {}
        self._active_job_id: Optional[str] = None

    def create_job(self, app_ids: List[int]) -> AutofillBatchJob:
        job_id = f"autofill-{uuid.uuid4().hex[:8]}"
        job = AutofillBatchJob(job_id=job_id, app_ids=app_ids)
        self._jobs[job_id] = job
        self._active_job_id = job_id
        return job

    def get_job(self, job_id: str) -> Optional[AutofillBatchJob]:
        return self._jobs.get(job_id)

    def get_active_job(self) -> Optional[AutofillBatchJob]:
        if not self._active_job_id:
            return None
        job = self._jobs.get(self._active_job_id)
        if job and job.status == "running":
            return job
        return None

    def cancel_job(self, job_id: str) -> bool:
        job = self._jobs.get(job_id)
        if job and job.status == "running":
            job.cancel()
            return True
        return False


autofill_tracker = AutofillBatchTracker()

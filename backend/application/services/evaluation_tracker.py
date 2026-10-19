import time
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List


class EvaluationJob:
    def __init__(self, job_id: str, targets: List[str], mode: str = "batch"):
        self.job_id = job_id
        self.targets = targets
        self.mode = mode  # "single", "selected", "all"
        self.total = len(targets)
        self.current_index = 0
        self.current_target = targets[0] if targets else ""
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
        self.detail: str = f"Starting evaluation for {self.total} role(s)..."

    def update_progress(self, current_index: int, current_target: str, detail: Optional[str] = None):
        self.current_index = current_index
        self.current_target = current_target
        if detail:
            self.detail = detail
        else:
            self.detail = f"Evaluating role {current_index} of {self.total}..."
        self.elapsed_seconds = round(time.time() - self.start_timestamp, 1)
        self.updated_at = datetime.now(timezone.utc).isoformat()

    def record_result(self, target: str, success: bool, report_filename: Optional[str] = None, error: Optional[str] = None):
        if success:
            self.completed_count += 1
        else:
            self.failed_count += 1
        self.results.append({
            "target": target,
            "success": success,
            "report_filename": report_filename,
            "error": error,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        self.elapsed_seconds = round(time.time() - self.start_timestamp, 1)
        self.updated_at = datetime.now(timezone.utc).isoformat()

    def complete(self):
        self.status = "completed"
        self.detail = f"Evaluation complete: {self.completed_count} evaluated, {self.failed_count} failed."
        self.elapsed_seconds = round(time.time() - self.start_timestamp, 1)
        self.completed_at = datetime.now(timezone.utc).isoformat()
        self.updated_at = self.completed_at

    def cancel(self):
        self.cancelled = True
        self.status = "cancelled"
        self.detail = f"Evaluation stopped by user ({self.completed_count} completed)."
        self.elapsed_seconds = round(time.time() - self.start_timestamp, 1)
        self.completed_at = datetime.now(timezone.utc).isoformat()
        self.updated_at = self.completed_at

    def fail(self, error: str):
        self.status = "failed"
        self.error = error
        self.detail = f"Evaluation failed: {error}"
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
            "mode": self.mode,
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


class EvaluationTracker:
    def __init__(self):
        self._jobs: Dict[str, EvaluationJob] = {}
        self._active_job_id: Optional[str] = None

    def create_job(self, targets: List[str], mode: str = "batch") -> EvaluationJob:
        job_id = f"eval_{uuid.uuid4().hex[:8]}"
        job = EvaluationJob(job_id=job_id, targets=targets, mode=mode)
        self._jobs[job_id] = job
        self._active_job_id = job_id
        return job

    def get_job(self, job_id: str) -> Optional[EvaluationJob]:
        return self._jobs.get(job_id)

    def cancel_job(self, job_id: str) -> Optional[EvaluationJob]:
        job = self._jobs.get(job_id)
        if job and job.status == "running":
            job.cancel()
        return job

    def get_active_job(self) -> Optional[EvaluationJob]:
        if not self._active_job_id:
            return None
        job = self._jobs.get(self._active_job_id)
        if not job:
            return None
        # Keep completed or failed or cancelled job accessible for 60 seconds
        if job.status in ("completed", "failed", "cancelled") and job.completed_at:
            try:
                completed_time = datetime.fromisoformat(job.completed_at).timestamp()
                if time.time() - completed_time > 60:
                    self._active_job_id = None
                    return None
            except Exception:
                pass
        return job


evaluation_tracker = EvaluationTracker()

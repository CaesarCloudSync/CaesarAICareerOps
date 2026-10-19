import time
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any


class DiscoveryJob:
    def __init__(self, job_id: str, query: Optional[str] = None):
        self.job_id = job_id
        self.query = query
        self.status = "running"  # "running", "completed", "failed"
        self.step = 1
        self.total_steps = 4
        self.step_name = "Parsing ATS Criteria"
        self.detail = "AI is analyzing query into structured ATS criteria..."
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.updated_at = self.started_at
        self.completed_at: Optional[str] = None
        self.start_timestamp = time.time()
        self.elapsed_seconds: float = 0.0
        self.result: Optional[Dict[str, Any]] = None
        self.error: Optional[str] = None

    def update(self, step: int, step_name: str, detail: str):
        self.step = step
        self.step_name = step_name
        self.detail = detail
        self.elapsed_seconds = round(time.time() - self.start_timestamp, 1)
        self.updated_at = datetime.now(timezone.utc).isoformat()

    def complete(self, result: Dict[str, Any]):
        self.status = "completed"
        self.step = self.total_steps
        self.step_name = "Discovery Complete"
        self.detail = result.get("message", "Discovery complete!")
        self.elapsed_seconds = round(time.time() - self.start_timestamp, 1)
        self.completed_at = datetime.now(timezone.utc).isoformat()
        self.result = result

    def fail(self, error: str):
        self.status = "failed"
        self.error = error
        self.step_name = "Discovery Failed"
        self.detail = f"Failed: {error}"
        self.elapsed_seconds = round(time.time() - self.start_timestamp, 1)
        self.completed_at = datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> Dict[str, Any]:
        elapsed = (
            self.elapsed_seconds
            if self.status != "running"
            else round(time.time() - self.start_timestamp, 1)
        )
        return {
            "job_id": self.job_id,
            "query": self.query,
            "status": self.status,
            "step": self.step,
            "total_steps": self.total_steps,
            "step_name": self.step_name,
            "detail": self.detail,
            "elapsed_seconds": elapsed,
            "started_at": self.started_at,
            "updated_at": self.updated_at,
            "completed_at": self.completed_at,
            "error": self.error,
            "result": self.result,
        }


class DiscoveryTracker:
    def __init__(self):
        self._jobs: Dict[str, DiscoveryJob] = {}
        self._active_job_id: Optional[str] = None

    def create_job(self, query: Optional[str] = None) -> DiscoveryJob:
        job_id = f"disc_{uuid.uuid4().hex[:8]}"
        job = DiscoveryJob(job_id=job_id, query=query)
        self._jobs[job_id] = job
        self._active_job_id = job_id
        return job

    def get_job(self, job_id: str) -> Optional[DiscoveryJob]:
        return self._jobs.get(job_id)

    def get_active_job(self) -> Optional[DiscoveryJob]:
        if not self._active_job_id:
            return None
        job = self._jobs.get(self._active_job_id)
        if not job:
            return None
        # Keep completed or failed job accessible as active for 60 seconds so user can see completion
        if job.status in ("completed", "failed") and job.completed_at:
            try:
                completed_time = datetime.fromisoformat(job.completed_at).timestamp()
                if time.time() - completed_time > 60:
                    self._active_job_id = None
                    return None
            except Exception:
                pass
        return job


discovery_tracker = DiscoveryTracker()

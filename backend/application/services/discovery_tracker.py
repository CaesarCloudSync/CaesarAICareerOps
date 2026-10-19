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
        self.substep = "1.1"
        self.substep_name = "Prompt Intent & Criteria Extraction"
        self.detail = "AI is analyzing query into structured ATS criteria..."
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.updated_at = self.started_at
        self.completed_at: Optional[str] = None
        self.start_timestamp = time.time()
        self.elapsed_seconds: float = 0.0
        self.result: Optional[Dict[str, Any]] = None
        self.error: Optional[str] = None
        self.cancelled: bool = False
        self._process = None
        self.live_feed: list = []

    def cancel(self):
        self.cancelled = True
        self.status = "cancelled"
        self.step_name = "Discovery Cancelled"
        self.detail = "Discovery stopped by user."
        self.elapsed_seconds = round(time.time() - self.start_timestamp, 1)
        self.completed_at = datetime.now(timezone.utc).isoformat()
        if self._process:
            try:
                self._process.terminate()
            except Exception:
                pass

    def add_feed_line(self, line: str):
        if line and line.strip():
            cleaned = line.strip()
            self.live_feed.append(cleaned)
            if len(self.live_feed) > 25:
                self.live_feed.pop(0)
            self.detail = cleaned
            self.elapsed_seconds = round(time.time() - self.start_timestamp, 1)
            self.updated_at = datetime.now(timezone.utc).isoformat()

    def update(
        self,
        step: int,
        step_name: str,
        detail: str,
        substep: Optional[str] = None,
        substep_name: Optional[str] = None,
    ):
        self.step = step
        self.step_name = step_name
        self.detail = detail
        if substep is not None:
            self.substep = substep
        if substep_name is not None:
            self.substep_name = substep_name
        self.elapsed_seconds = round(time.time() - self.start_timestamp, 1)
        self.updated_at = datetime.now(timezone.utc).isoformat()

    def complete(self, result: Dict[str, Any]):
        self.status = "completed"
        self.step = self.total_steps
        self.substep = "4.3"
        self.substep_name = "Queue Synchronized"
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
            "substep": self.substep,
            "substep_name": self.substep_name,
            "detail": self.detail,
            "live_feed": self.live_feed[-12:],
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
        self._latest_discovered: Dict[str, Any] = {
            "roles": [],
            "count": 0,
            "query": "",
            "mode": "",
            "timestamp": None,
        }

    def create_job(self, query: Optional[str] = None) -> DiscoveryJob:
        job_id = f"disc_{uuid.uuid4().hex[:8]}"
        job = DiscoveryJob(job_id=job_id, query=query)
        self._jobs[job_id] = job
        self._active_job_id = job_id
        return job

    def get_job(self, job_id: str) -> Optional[DiscoveryJob]:
        return self._jobs.get(job_id)

    def cancel_job(self, job_id: str) -> Optional[DiscoveryJob]:
        job = self._jobs.get(job_id)
        if job and job.status == "running":
            job.cancel()
        return job

    def get_active_job(self) -> Optional[DiscoveryJob]:
        if not self._active_job_id:
            return None
        job = self._jobs.get(self._active_job_id)
        if not job:
            return None
        # Keep completed, failed, or cancelled job accessible as active for 60 seconds
        if job.status in ("completed", "failed", "cancelled") and job.completed_at:
            try:
                completed_time = datetime.fromisoformat(job.completed_at).timestamp()
                if time.time() - completed_time > 60:
                    self._active_job_id = None
                    return None
            except Exception:
                pass
        return job

    def record_discovered_roles(
        self, roles: list, query: str = "", mode: str = ""
    ):
        self._latest_discovered = {
            "roles": roles,
            "count": len(roles),
            "query": query,
            "mode": mode,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def get_latest_discovered(self) -> Dict[str, Any]:
        return self._latest_discovered

    def remove_roles(self, urls: set):
        if self._latest_discovered.get("roles"):
            clean_targets = {u.rstrip("/") for u in urls if u}
            filtered_roles = []
            for r in self._latest_discovered["roles"]:
                r_url = (r.get("url") or "").rstrip("/")
                r_base = r_url.split("?")[0] if r_url else ""
                r_raw = r.get("raw_line") or ""
                if (
                    r_url in clean_targets
                    or r_base in clean_targets
                    or any(u in r_url or u in r_raw for u in clean_targets if len(u) > 10)
                ):
                    continue
                filtered_roles.append(r)
            self._latest_discovered["roles"] = filtered_roles
            self._latest_discovered["count"] = len(filtered_roles)



discovery_tracker = DiscoveryTracker()

import time
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List


class AutofillBatchJob:
    def __init__(
        self,
        job_id: str,
        app_ids: Optional[List[int]] = None,
        job_type: str = "batch",
        tag: str = "AI Autofill (agy)",
        target: str = "",
    ):
        self.job_id = job_id
        self.app_ids = app_ids or []
        self.total = len(self.app_ids) if self.app_ids else 1
        self.current_index = 0
        self.current_target = target
        self.status = "running"  # "queued", "running", "completed", "failed", "cancelled"
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
        self.job_type = job_type  # "batch" or "compile_html"
        self.tag = tag
        self.payload: Dict[str, Any] = {}

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
        if self.job_type == "compile_html":
            self.detail = "AI form compilation complete! Script ready on clipboard."
        else:
            self.detail = f"Batch autofill complete: {self.completed_count} processed, {self.failed_count} failed."
        self.elapsed_seconds = round(time.time() - self.start_timestamp, 1)
        self.completed_at = datetime.now(timezone.utc).isoformat()
        self.updated_at = self.completed_at

    def cancel(self):
        self.cancelled = True
        self.status = "cancelled"
        self.detail = f"Autofill job stopped by user."
        self.elapsed_seconds = round(time.time() - self.start_timestamp, 1)
        self.completed_at = datetime.now(timezone.utc).isoformat()
        self.updated_at = self.completed_at

    def fail(self, error: str):
        self.status = "failed"
        self.error = error
        self.detail = f"AI compilation failed: {error}"
        self.elapsed_seconds = round(time.time() - self.start_timestamp, 1)
        self.completed_at = datetime.now(timezone.utc).isoformat()
        self.updated_at = self.completed_at

    def to_dict(self) -> Dict[str, Any]:
        elapsed = (
            self.elapsed_seconds
            if self.status not in ("running", "queued")
            else (0.0 if self.status == "queued" else round(time.time() - self.start_timestamp, 1))
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
            "job_type": self.job_type,
            "tag": self.tag,
        }


class AutofillBatchTracker:
    def __init__(self):
        self._jobs: Dict[str, AutofillBatchJob] = {}
        self._active_job_id: Optional[str] = None

    def create_job(self, app_ids: List[int]) -> AutofillBatchJob:
        job_id = f"autofill-{uuid.uuid4().hex[:8]}"
        job = AutofillBatchJob(job_id=job_id, app_ids=app_ids, job_type="batch", tag="AI Autofill (agy)")
        self._jobs[job_id] = job
        self._active_job_id = job_id
        return job

    def create_compilation_job(
        self,
        company: str,
        role: str,
        url: str = "",
        html: str = "",
        app_id: Optional[int] = None,
    ) -> AutofillBatchJob:
        job_id = f"compile-{uuid.uuid4().hex[:8]}"
        target_name = f"{company or 'Target Company'} — {role or 'Job Application'}"
        job = AutofillBatchJob(
            job_id=job_id,
            app_ids=[app_id] if app_id else [],
            job_type="compile_html",
            tag="AI HTML Compilation (agy)",
            target=target_name,
        )
        job.payload = {
            "company": company,
            "role": role,
            "url": url,
            "html": html,
            "app_id": app_id,
        }
        self._jobs[job_id] = job
        self._active_job_id = job_id
        return job

    def get_job(self, job_id: str) -> Optional[AutofillBatchJob]:
        return self._jobs.get(job_id)

    def get_active_job(self) -> Optional[AutofillBatchJob]:
        if self._active_job_id:
            job = self._jobs.get(self._active_job_id)
            if job and job.status in ("running", "queued"):
                return job
        for job in reversed(list(self._jobs.values())):
            if job.status in ("running", "queued"):
                return job
        return None

    def get_active_compilation_job(self) -> Optional[AutofillBatchJob]:
        for job in reversed(list(self._jobs.values())):
            if job.job_type == "compile_html" and job.status == "running":
                return job
        return None

    def get_running_jobs(self) -> List[AutofillBatchJob]:
        return [job for job in self._jobs.values() if job.status in ("running", "queued")]

    def get_active_jobs(self) -> List[AutofillBatchJob]:
        now = time.time()
        active = []
        for job in self._jobs.values():
            if job.status in ("running", "queued"):
                active.append(job)
            else:
                finished_recently = (now - (job.start_timestamp + (job.elapsed_seconds or 0))) < 10.0
                if finished_recently:
                    active.append(job)
        return active

    def cancel_job(self, job_id: str) -> bool:
        job = self._jobs.get(job_id)
        if job and job.status in ("running", "queued"):
            job.cancel()
            proc = getattr(job, "proc", None)
            if proc:
                try:
                    import os, signal
                    os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
                except Exception:
                    try:
                        proc.kill()
                    except Exception:
                        pass
            return True
        return False


autofill_tracker = AutofillBatchTracker()

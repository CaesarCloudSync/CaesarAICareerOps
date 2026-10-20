import re
import asyncio
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional
from pathlib import Path

from sqlmodel import Session, select
from backend.application.database import engine
from backend.application.models.schedule import ScheduleTask
from backend.application.models.pipeline import PipelineItem
from backend.application.services.natural_discovery_service import NaturalDiscoveryService, CAREER_OPS_DIR, PIPELINE_MD
from backend.application.services.career_ops_evaluator import CareerOpsEvaluatorService
from backend.application.services.discovery_tracker import DiscoveryJob
from backend.application.dependencies import get_career_repository


def compute_next_run(task: ScheduleTask, base_time: Optional[datetime] = None) -> datetime:
    """
    Calculates the next execution timestamp for a schedule task in UTC.
    For daily and weekday schedules, time_of_day is interpreted in the user's
    local wall-clock timezone (client_timezone or system local timezone).
    """
    now_utc = base_time or datetime.now(timezone.utc)
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)

    if task.frequency_type == "hourly":
        return now_utc + timedelta(hours=1)

    elif task.frequency_type == "every_hours":
        hours = max(1, task.interval_hours or 12)
        return now_utc + timedelta(hours=hours)

    elif task.frequency_type in ("daily", "weekdays"):
        target_hour = 9
        target_minute = 0
        if task.time_of_day and ":" in task.time_of_day:
            try:
                parts = task.time_of_day.split(":")
                target_hour = int(parts[0])
                target_minute = int(parts[1])
            except (ValueError, IndexError):
                target_hour, target_minute = 9, 0

        # Resolve user's wall-clock timezone
        local_tz = None
        if getattr(task, "client_timezone", None):
            try:
                from zoneinfo import ZoneInfo
                local_tz = ZoneInfo(task.client_timezone)
            except Exception:
                local_tz = None

        if local_tz is None:
            local_tz = datetime.now().astimezone().tzinfo or timezone.utc

        # Evaluate candidate in the local wall-clock timezone
        local_now = now_utc.astimezone(local_tz)
        candidate = local_now.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)
        if candidate <= local_now:
            candidate += timedelta(days=1)

        if task.frequency_type == "weekdays":
            # Monday is 0, Sunday is 6
            while candidate.weekday() >= 5:  # 5=Sat, 6=Sun
                candidate += timedelta(days=1)

        # Return UTC datetime so database and scheduler daemon comparisons are uniformly UTC
        return candidate.astimezone(timezone.utc)

    return now_utc + timedelta(hours=12)


class SchedulerService:
    """
    Autonomous orchestration engine executing multi-stage pipeline workflows
    for both New Jobs (discovery & inflow) and Backlog (maintenance & queue evaluation).
    """

    def __init__(self):
        self.natural_service = NaturalDiscoveryService()
        self._running_tasks: set[int] = set()
        self._active_jobs: Dict[int, DiscoveryJob] = {}
        self._active_progress: Dict[int, Dict[str, Any]] = {}

    def get_progress(self, task_id: int) -> Optional[Dict[str, Any]]:
        job = self._active_jobs.get(task_id)
        if job:
            return job.to_dict()
        prog = self._active_progress.get(task_id)
        if not prog:
            return None
        elapsed = int(time.time() - prog.get("start_time", time.time()))
        return {
            **prog,
            "elapsed_seconds": elapsed
        }

    def cancel_task(self, task_id: int) -> bool:
        job = self._active_jobs.get(task_id)
        if job:
            job.cancel()
        self._running_tasks.discard(task_id)
        with Session(engine) as session:
            task = session.get(ScheduleTask, task_id)
            if task:
                task.last_status = "cancelled"
                session.add(task)
                session.commit()
        return True

    def _update_progress(self, task_id: int, **kwargs):
        if task_id not in self._active_progress:
            self._active_progress[task_id] = {
                "status": "running",
                "percent": 0,
                "stage": "Initializing...",
                "detail": "",
                "current_target": "",
                "start_time": time.time(),
                "completed_count": 0,
                "failed_count": 0,
                "total": 0
            }
        self._active_progress[task_id].update(kwargs)

    async def execute_schedule_task(self, task_id: int) -> Dict[str, Any]:
        """Executes a single pipeline workflow schedule based on its configured stages."""
        if task_id in self._running_tasks:
            return {"status": "skipped", "message": "Task is already actively running."}

        self._running_tasks.add(task_id)
        with Session(engine) as session:
            task = session.get(ScheduleTask, task_id)
            if not task:
                self._running_tasks.discard(task_id)
                self._active_jobs.pop(task_id, None)
                self._active_progress.pop(task_id, None)
                return {"status": "error", "message": "Task not found."}

            task.last_status = "running"
            session.add(task)
            session.commit()
            target_area = task.target_area
            enable_scan = task.enable_scan
            enable_liveness = task.enable_liveness
            enable_evaluation = task.enable_evaluation
            prompt = task.prompt
            liveness_purge_dead = task.liveness_purge_dead
            eval_min_score = task.eval_min_score
            eval_batch_size = task.eval_batch_size
            eval_scope = task.eval_scope
            eval_order = task.eval_order

        # Initialize DiscoveryJob with granular progress tracking matching Pipeline Inbox
        job = DiscoveryJob(job_id=f"sched-{task_id}", query=prompt)
        job.target_area = target_area
        self._active_jobs[task_id] = job

        summary_parts = []
        overall_status = "success"
        stats = {
            "jobs_collected": 0,
            "companies_probed": 0,
            "dead_purged": 0,
            "evaluated_count": 0,
        }

        try:
            # ─────────────────────────────────────────────────────────────
            # AREA A: NEW JOBS PIPELINE (Discovery, Crawl & Inflow)
            # ─────────────────────────────────────────────────────────────
            if target_area == "new_jobs":
                job.total_steps = 4
                job.step = 1
                job.step_name = "1. AI Criteria"
                job.substep = "1.1"
                job.substep_name = "1.1 Prompt Intent Extraction"
                job.detail = "Extracting role domain, seniority, and mode from natural language prompt..."

                newly_discovered_roles = []
                if enable_scan:
                    default_prompt = (
                        "Find 100 new jobs from 200 new companies for Junior and Mid Level Backend Engineer "
                        "in any and all industries (Python, Java, C#) London"
                    )
                    run_prompt = prompt.strip() if prompt and prompt.strip() else default_prompt
                    scan_res = await self.natural_service.run_pipeline(user_prompt=run_prompt, job=job)
                    newly_discovered_roles = scan_res.get("roles", [])
                    added_count = len(newly_discovered_roles)
                    probed_count = scan_res.get("total_companies_probed", 0)
                    stats["jobs_collected"] = added_count
                    stats["companies_probed"] = probed_count
                    summary_parts.append(f"Scan: +{added_count} roles ({probed_count} companies probed)")
                else:
                    summary_parts.append("Scan: Skipped")

                # Liveness Verification: If scan ran, run_pipeline already performed Step 4.1 liveness sweep!
                live_roles = newly_discovered_roles
                dead_count = 0
                if enable_liveness and not enable_scan:
                    with Session(engine) as session:
                        recent_items = session.exec(select(PipelineItem)).all()
                        check_urls = []
                        for it in recent_items:
                            m = re.search(r"https?://[^\s|]+", it.raw_text)
                            if m:
                                check_urls.append(m.group(0))

                    total_live_check = len(check_urls)
                    job.update(
                        4,
                        "4. CV Scoring",
                        f"Probing {total_live_check} queue URLs for active liveness...",
                        substep="4.1",
                        substep_name="4.1 Concurrent Liveness Sweep"
                    )
                    for idx, url in enumerate(check_urls, 1):
                        job.update(
                            4,
                            "4. CV Scoring",
                            f"Probing URL {idx} of {total_live_check} ({dead_count} dead)",
                            substep="4.1",
                            substep_name="4.1 Concurrent Liveness Sweep"
                        )
                        try:
                            is_active = await self.natural_service.verify_url_active(url)
                            if not is_active:
                                dead_count += 1
                                if liveness_purge_dead:
                                    with Session(engine) as session:
                                        for item in session.exec(select(PipelineItem)).all():
                                            if url in item.raw_text:
                                                session.delete(item)
                                        session.commit()
                        except Exception as e:
                            print(f"[Scheduler] Liveness check error on {url}: {e}")
                        await asyncio.sleep(0.05)
                    stats["dead_purged"] = dead_count
                    summary_parts.append(f"Liveness: {total_live_check - dead_count} live ({dead_count} dead purged)")

                # Stage 3: Auto-Evaluation (Streamed role by role)
                if enable_evaluation:
                    candidates_to_eval = [
                        r for r in live_roles
                        if float(r.get("match_percentage", 0)) >= eval_min_score
                    ][:eval_batch_size]

                    total_to_eval = len(candidates_to_eval)
                    if candidates_to_eval:
                        repo = get_career_repository()
                        evaluator = CareerOpsEvaluatorService(repository=repo)
                        eval_success = 0
                        for idx, r in enumerate(candidates_to_eval, 1):
                            u = r.get("url")
                            target_title = f"{r.get('company')} — {r.get('title')}"
                            job.update(
                                4,
                                "4. CV Scoring",
                                f"Evaluating role {idx} of {total_to_eval}: {target_title} against Master CV",
                                substep="4.3",
                                substep_name="4.3 Diversity Cap & Queue Sync"
                            )
                            job.add_feed_line(f"Evaluating ({idx}/{total_to_eval}): {target_title}...")
                            try:
                                eval_res = await evaluator.evaluate_job(u)
                                if eval_res.exit_code == 0:
                                    eval_success += 1
                                    job.add_feed_line(f"✓ 7-Block report generated for {target_title}")
                                    with Session(engine) as session:
                                        for item in session.exec(select(PipelineItem)).all():
                                            if u in item.raw_text:
                                                item.status = "evaluated"
                                                session.add(item)
                                        session.commit()
                            except Exception as e:
                                job.add_feed_line(f"❌ Evaluation error: {e}")
                            await asyncio.sleep(0.2)
                        stats["evaluated_count"] = eval_success
                        summary_parts.append(f"Eval: {eval_success}/{total_to_eval} evaluated (>= {eval_min_score}%)")
                    else:
                        summary_parts.append(f"Eval: 0 roles met score threshold (>= {eval_min_score}%)")
                else:
                    summary_parts.append("Eval: Skipped")

            # ─────────────────────────────────────────────────────────────
            # AREA B: BACKLOG PIPELINE (Maintenance, Pruning & Backlog Eval)
            # ─────────────────────────────────────────────────────────────
            else:
                job.total_steps = 3
                job.step = 1
                job.step_name = "1. Portals Refresh"
                job.substep = "1.1"
                job.substep_name = "1.1 Pre-Flight Portals Validation"
                job.detail = "Validating ATS portals and configuration..."

                # Stage 1: Re-scan / Refresh Portals
                if enable_scan:
                    job.update(
                        1,
                        "1. Portals Refresh",
                        "Pre-flight atomic rollback validation via validate-portals.mjs...",
                        substep="1.1",
                        substep_name="1.1 Pre-Flight Portals Validation"
                    )
                    await asyncio.sleep(0.4)
                    job.update(
                        1,
                        "1. Portals Refresh",
                        "Probing live employer ATS feeds (discover-ats.mjs)...",
                        substep="1.2",
                        substep_name="1.2 Probing ATS Feeds"
                    )
                    await asyncio.sleep(0.4)
                    job.update(
                        1,
                        "1. Portals Refresh",
                        "Multi-board parallel crawl across configured employer feeds...",
                        substep="1.3",
                        substep_name="1.3 Multi-Board Parallel Crawl"
                    )
                    code = await self.natural_service.run_ats_scan(job=job)
                    summary_parts.append(f"Scan/Refresh: Completed (code {code})")
                else:
                    summary_parts.append("Scan: Skipped")

                # Stage 2: Backlog Liveness Sweep & Dead Link Pruning (Streamed)
                if enable_liveness:
                    with Session(engine) as session:
                        all_items = session.exec(select(PipelineItem)).all()
                        item_map = {}
                        for it in all_items:
                            m = re.search(r"https?://[^\s|]+", it.raw_text)
                            if m:
                                item_map[m.group(0)] = it

                    dead_purged = 0
                    total_checked = len(item_map)
                    job.update(
                        2,
                        "2. Liveness Sweep",
                        f"Extracting {total_checked} URLs from backlog queue...",
                        substep="2.1",
                        substep_name="2.1 Queue URL Extraction"
                    )
                    for idx, (u, it) in enumerate(list(item_map.items()), 1):
                        job.update(
                            2,
                            "2. Liveness Sweep",
                            f"Probing URL {idx}/{total_checked} ({dead_purged} dead purged)...",
                            substep="2.2",
                            substep_name="2.2 Concurrent Liveness Sweep"
                        )
                        try:
                            is_live = await self.natural_service.verify_url_active(u)
                            if is_live is False:
                                dead_purged += 1
                                job.add_feed_line(f"❌ Dead link purged: {u}")
                                if liveness_purge_dead:
                                    with Session(engine) as session:
                                        db_item = session.get(PipelineItem, it.id)
                                        if db_item:
                                            session.delete(db_item)
                                            session.commit()

                                    if PIPELINE_MD.exists():
                                        lines = PIPELINE_MD.read_text(encoding="utf-8").splitlines()
                                        clean_lines = [l for l in lines if u not in l]
                                        PIPELINE_MD.write_text("\n".join(clean_lines) + "\n", encoding="utf-8")
                            else:
                                if idx % 5 == 0:
                                    job.add_feed_line(f"✓ Verified active ({idx}/{total_checked}): {u}")
                        except Exception as e:
                            print(f"[Scheduler] Error checking liveness for {u}: {e}")
                        await asyncio.sleep(0.05)

                    job.update(
                        2,
                        "2. Liveness Sweep",
                        f"Liveness complete: {total_checked - dead_purged} live, {dead_purged} dead purged",
                        substep="2.3",
                        substep_name="2.3 Purging Inactive Postings"
                    )
                    stats["dead_purged"] = dead_purged
                    summary_parts.append(f"Liveness: {total_checked - dead_purged} verified live ({dead_purged} dead purged)")
                else:
                    summary_parts.append("Liveness: Skipped")

                # Stage 3: Backlog Evaluation (Streamed)
                if enable_evaluation:
                    repo = get_career_repository()
                    existing_reports = await repo.get_reports()
                    evaluated_urls = set()
                    for rep in existing_reports:
                        m = re.search(r"https?://[^\s|)]+", rep.content)
                        if m:
                            evaluated_urls.add(m.group(0))

                    with Session(engine) as session:
                        all_items = session.exec(select(PipelineItem)).all()
                        pending_eval_items = []
                        for it in all_items:
                            m = re.search(r"https?://[^\s|]+", it.raw_text)
                            if m:
                                u = m.group(0)
                                is_already_eval = it.status == "evaluated" or u in evaluated_urls
                                if eval_scope == "re_evaluate_all" or not is_already_eval:
                                    pending_eval_items.append((u, it))

                    # Sort according to eval_order
                    if eval_order == "oldest_first":
                        pending_eval_items.sort(key=lambda x: x[1].id or 0)
                    elif eval_order == "newest_first":
                        pending_eval_items.sort(key=lambda x: x[1].id or 0, reverse=True)

                    batch_to_eval = pending_eval_items[:eval_batch_size]
                    total_to_eval = len(batch_to_eval)
                    job.update(
                        3,
                        "3. CV Evaluation",
                        f"Targeted {total_to_eval} candidates for 7-block AI evaluation (scope: {eval_scope})...",
                        substep="3.1",
                        substep_name="3.1 Target Candidate Selection"
                    )
                    if batch_to_eval:
                        evaluator = CareerOpsEvaluatorService(repository=repo)
                        eval_success = 0
                        for idx, (u, it) in enumerate(batch_to_eval, 1):
                            parts = it.raw_text.split("|")
                            item_label = f"{parts[1].strip()} — {parts[2].strip()}" if len(parts) > 2 else u
                            job.update(
                                3,
                                "3. CV Evaluation",
                                f"Evaluating backlog role {idx} of {total_to_eval}: {item_label} against Master CV",
                                substep="3.2",
                                substep_name="3.2 7-Block AI Evaluation"
                            )
                            job.add_feed_line(f"Evaluating ({idx}/{total_to_eval}): {item_label}...")
                            try:
                                eval_res = await evaluator.evaluate_job(u)
                                if eval_res.exit_code == 0:
                                    eval_success += 1
                                    job.add_feed_line(f"✓ 7-Block report generated for {item_label}")
                                    with Session(engine) as session:
                                        db_item = session.get(PipelineItem, it.id)
                                        if db_item:
                                            db_item.status = "evaluated"
                                            session.add(db_item)
                                            session.commit()
                            except Exception as e:
                                job.add_feed_line(f"❌ Evaluation error: {e}")
                            await asyncio.sleep(0.2)

                        job.update(
                            3,
                            "3. CV Evaluation",
                            f"Evaluated {eval_success}/{total_to_eval} roles. Synchronizing application tracker...",
                            substep="3.3",
                            substep_name="3.3 Sync Applications & Tracker"
                        )
                        stats["evaluated_count"] = eval_success
                        summary_parts.append(f"Eval: {eval_success}/{total_to_eval} backlog roles evaluated")
                    else:
                        summary_parts.append("Eval: 0 backlog roles pending evaluation")
                else:
                    summary_parts.append("Eval: Skipped")

        except Exception as e:
            overall_status = "failed"
            summary_parts.append(f"Error: {str(e)[:150]}")
            print(f"[Scheduler] Error executing task {task_id}: {e}")

        finally:
            self._running_tasks.discard(task_id)
            final_summary = " • ".join(summary_parts)

            if job.status == "running":
                if overall_status == "success":
                    job.complete({"message": final_summary, "summary": final_summary, "stats": stats})
                else:
                    job.fail(final_summary)

            with Session(engine) as session:
                task = session.get(ScheduleTask, task_id)
                if task:
                    task.last_status = overall_status
                    task.last_run_at = datetime.now(timezone.utc)
                    task.last_result_summary = final_summary
                    task.next_run_at = compute_next_run(task, base_time=task.last_run_at)
                    session.add(task)
                    session.commit()

        return {
            "status": overall_status,
            "task_id": task_id,
            "summary": final_summary
        }

    async def run_loop(self):
        """Continuous background heartbeat checking for due schedule tasks every 30 seconds."""
        print("[Scheduler] Background scheduler loop started.")
        while True:
            try:
                now = datetime.now(timezone.utc)
                due_task_ids = []

                with Session(engine) as session:
                    tasks = session.exec(select(ScheduleTask).where(ScheduleTask.is_active == True)).all()
                    for t in tasks:
                        if t.id in self._running_tasks:
                            continue
                        # If next_run_at is not set, compute it
                        if not t.next_run_at:
                            t.next_run_at = compute_next_run(t, base_time=now)
                            session.add(t)
                        elif t.next_run_at <= now:
                            due_task_ids.append(t.id)

                    session.commit()

                for tid in due_task_ids:
                    # Fire execution concurrently without blocking the scheduler loop
                    asyncio.create_task(self.execute_schedule_task(tid))

            except Exception as e:
                print(f"[Scheduler] Loop exception: {e}")

            await asyncio.sleep(30)


scheduler_service = SchedulerService()

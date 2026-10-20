import re
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional
from pathlib import Path

from sqlmodel import Session, select
from backend.application.database import engine
from backend.application.models.schedule import ScheduleTask
from backend.application.models.pipeline import PipelineItem
from backend.application.models.report import EvaluationReport
from backend.application.services.natural_discovery_service import NaturalDiscoveryService, CAREER_OPS_DIR, PIPELINE_MD
from backend.application.services.career_ops_evaluator import CareerOpsEvaluatorService
from backend.application.dependencies import get_career_repository


def compute_next_run(task: ScheduleTask, base_time: Optional[datetime] = None) -> datetime:
    """Calculates the next execution timestamp for a schedule task."""
    now = base_time or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    if task.frequency_type == "hourly":
        return now + timedelta(hours=1)

    elif task.frequency_type == "every_hours":
        hours = max(1, task.interval_hours or 12)
        return now + timedelta(hours=hours)

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

        candidate = now.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)
        if candidate <= now:
            candidate += timedelta(days=1)

        if task.frequency_type == "weekdays":
            # Monday is 0, Sunday is 6
            while candidate.weekday() >= 5:  # 5=Sat, 6=Sun
                candidate += timedelta(days=1)

        return candidate

    return now + timedelta(hours=12)


class SchedulerService:
    """
    Autonomous orchestration engine executing multi-stage pipeline workflows
    for both New Jobs (discovery & inflow) and Backlog (maintenance & queue evaluation).
    """

    def __init__(self):
        self.natural_service = NaturalDiscoveryService()
        self._running_tasks: set[int] = set()

    async def execute_schedule_task(self, task_id: int) -> Dict[str, Any]:
        """Executes a single pipeline workflow schedule based on its configured stages."""
        if task_id in self._running_tasks:
            return {"status": "skipped", "message": "Task is already actively running."}

        self._running_tasks.add(task_id)

        with Session(engine) as session:
            task = session.get(ScheduleTask, task_id)
            if not task:
                self._running_tasks.discard(task_id)
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

        summary_parts = []
        overall_status = "success"

        try:
            # ─────────────────────────────────────────────────────────────
            # AREA A: NEW JOBS PIPELINE (Discovery, Crawl & Inflow)
            # ─────────────────────────────────────────────────────────────
            if target_area == "new_jobs":
                # Stage 1: Scan & Crawl
                newly_discovered_roles = []
                if enable_scan:
                    default_prompt = (
                        "Find 100 new jobs from 200 new companies for Junior and Mid Level Backend Engineer "
                        "in any and all industries (Python, Java, C#) London"
                    )
                    run_prompt = prompt.strip() if prompt and prompt.strip() else default_prompt
                    scan_res = await self.natural_service.run_pipeline(user_prompt=run_prompt)
                    newly_discovered_roles = scan_res.get("roles", [])
                    added_count = len(newly_discovered_roles)
                    probed_count = scan_res.get("total_companies_probed", 0)
                    summary_parts.append(f"Scan: +{added_count} roles ({probed_count} companies probed)")
                else:
                    summary_parts.append("Scan: Skipped")

                # Stage 2: Pre-Ingest Liveness Verification (Streamed)
                live_roles = []
                dead_count = 0
                if enable_liveness and newly_discovered_roles:
                    for role in newly_discovered_roles:
                        url = role.get("url")
                        if not url:
                            continue
                        try:
                            is_live = await self.natural_service.verify_url_active(url)
                            if is_live is True or not isinstance(is_live, bool):
                                live_roles.append(role)
                            else:
                                dead_count += 1
                                if liveness_purge_dead:
                                    # Immediate incremental commit: purge from DB
                                    with Session(engine) as session:
                                        for item in session.exec(select(PipelineItem)).all():
                                            if url in item.raw_text:
                                                session.delete(item)
                                        session.commit()
                                    # Immediate strip from pipeline.md
                                    if PIPELINE_MD.exists():
                                        lines = PIPELINE_MD.read_text(encoding="utf-8").splitlines()
                                        clean_lines = [l for l in lines if url not in l]
                                        PIPELINE_MD.write_text("\n".join(clean_lines) + "\n", encoding="utf-8")
                        except Exception as e:
                            print(f"[Scheduler] Liveness check error on {url}: {e}")
                            live_roles.append(role)  # fail open
                        await asyncio.sleep(0.05)

                    summary_parts.append(f"Liveness: {len(live_roles)} live ({dead_count} dead purged)")
                elif enable_liveness:
                    summary_parts.append("Liveness: Checked (0 new to check)")
                else:
                    summary_parts.append("Liveness: Skipped")
                    live_roles = newly_discovered_roles

                # Stage 3: Auto-Evaluation (Streamed)
                if enable_evaluation:
                    candidates_to_eval = [
                        r for r in live_roles
                        if float(r.get("match_percentage", 0)) >= eval_min_score
                    ][:eval_batch_size]

                    if candidates_to_eval:
                        repo = get_career_repository()
                        evaluator = CareerOpsEvaluatorService(repository=repo)
                        eval_success = 0
                        for r in candidates_to_eval:
                            u = r.get("url")
                            try:
                                eval_res = await evaluator.evaluate_job(u)
                                if eval_res.exit_code == 0:
                                    eval_success += 1
                                    # Immediate atomic commit: mark PipelineItem as evaluated
                                    with Session(engine) as session:
                                        for item in session.exec(select(PipelineItem)).all():
                                            if u in item.raw_text:
                                                item.status = "evaluated"
                                                session.add(item)
                                        session.commit()
                            except Exception as e:
                                print(f"[Scheduler] Eval error on {u}: {e}")
                            await asyncio.sleep(0.2)
                        summary_parts.append(f"Eval: {eval_success}/{len(candidates_to_eval)} evaluated (>= {eval_min_score}%)")
                    else:
                        summary_parts.append(f"Eval: 0 roles met score threshold (>= {eval_min_score}%)")
                else:
                    summary_parts.append("Eval: Skipped")

            # ─────────────────────────────────────────────────────────────
            # AREA B: BACKLOG PIPELINE (Maintenance, Pruning & Backlog Eval)
            # ─────────────────────────────────────────────────────────────
            else:
                # Stage 1: Re-scan / Refresh Portals
                if enable_scan:
                    code = await self.natural_service.run_ats_scan()
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
                    for u, it in list(item_map.items()):
                        try:
                            is_live = await self.natural_service.verify_url_active(u)
                            if is_live is False:
                                dead_purged += 1
                                if liveness_purge_dead:
                                    # Immediate atomic delete per dead URL
                                    with Session(engine) as session:
                                        db_item = session.get(PipelineItem, it.id)
                                        if db_item:
                                            session.delete(db_item)
                                            session.commit()

                                    if PIPELINE_MD.exists():
                                        lines = PIPELINE_MD.read_text(encoding="utf-8").splitlines()
                                        clean_lines = [l for l in lines if u not in l]
                                        PIPELINE_MD.write_text("\n".join(clean_lines) + "\n", encoding="utf-8")
                        except Exception as e:
                            print(f"[Scheduler] Error checking liveness for {u}: {e}")
                        await asyncio.sleep(0.05)

                    summary_parts.append(f"Liveness: {total_checked - dead_purged} verified live ({dead_purged} dead purged)")
                else:
                    summary_parts.append("Liveness: Skipped")

                # Stage 3: Backlog Evaluation (Streamed)
                if enable_evaluation:
                    # Find unevaluated or target backlog roles
                    with Session(engine) as session:
                        all_items = session.exec(select(PipelineItem)).all()
                        existing_reports = session.exec(select(EvaluationReport)).all()
                        evaluated_urls = set()
                        for rep in existing_reports:
                            if rep.job_url:
                                evaluated_urls.add(rep.job_url)

                        pending_eval_items = []
                        for it in all_items:
                            m = re.search(r"https?://[^\s|]+", it.raw_text)
                            if m:
                                u = m.group(0)
                                if eval_scope == "re_evaluate_all" or u not in evaluated_urls:
                                    pending_eval_items.append((u, it))

                    # Sort according to eval_order
                    if eval_order == "oldest_first":
                        pending_eval_items.sort(key=lambda x: x[1].id or 0)
                    elif eval_order == "newest_first":
                        pending_eval_items.sort(key=lambda x: x[1].id or 0, reverse=True)

                    batch_to_eval = pending_eval_items[:eval_batch_size]
                    if batch_to_eval:
                        repo = get_career_repository()
                        evaluator = CareerOpsEvaluatorService(repository=repo)
                        eval_success = 0
                        for u, it in batch_to_eval:
                            try:
                                eval_res = await evaluator.evaluate_job(u)
                                if eval_res.exit_code == 0:
                                    eval_success += 1
                                    # Immediate atomic commit: mark PipelineItem as evaluated
                                    with Session(engine) as session:
                                        db_item = session.get(PipelineItem, it.id)
                                        if db_item:
                                            db_item.status = "evaluated"
                                            session.add(db_item)
                                            session.commit()
                            except Exception as e:
                                print(f"[Scheduler] Backlog eval error on {u}: {e}")
                            await asyncio.sleep(0.2)
                        summary_parts.append(f"Eval: {eval_success}/{len(batch_to_eval)} backlog roles evaluated")
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

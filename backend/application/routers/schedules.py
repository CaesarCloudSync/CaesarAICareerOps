from datetime import datetime
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, BackgroundTasks
from sqlmodel import Session, select

from backend.application.database import engine
from backend.application.models.schedule import (
    ScheduleTask,
    ScheduleCreateRequest,
    ScheduleUpdateRequest,
    ScheduleResponse,
)
from backend.application.services.scheduler_service import (
    scheduler_service,
    compute_next_run,
)

router = APIRouter(prefix="/api/schedules", tags=["Schedules"])


@router.get("", response_model=List[ScheduleResponse])
def list_schedules():
    """Returns all configured pipeline workflow schedules with real-time live progress."""
    with Session(engine) as session:
        tasks = session.exec(select(ScheduleTask).order_by(ScheduleTask.id.desc())).all()
        results = []
        for t in tasks:
            res = ScheduleResponse.model_validate(t)
            res.progress = scheduler_service.get_progress(t.id)
            results.append(res)
        return results


@router.post("", response_model=ScheduleTask)
def create_schedule(req: ScheduleCreateRequest):
    """Creates a new pipeline workflow schedule."""
    with Session(engine) as session:
        task = ScheduleTask(**req.model_dump())
        # Safe normalization: in New Jobs, Liveness cannot be active without Scan
        if task.target_area == "new_jobs" and not task.enable_scan:
            task.enable_liveness = False
        task.next_run_at = compute_next_run(task)
        task.last_status = "idle"
        session.add(task)
        session.commit()
        session.refresh(task)
        return task


@router.get("/{schedule_id}", response_model=ScheduleResponse)
def get_schedule(schedule_id: int):
    """Retrieves a single schedule by ID with real-time progress."""
    with Session(engine) as session:
        task = session.get(ScheduleTask, schedule_id)
        if not task:
            raise HTTPException(status_code=404, detail="Schedule not found")
        res = ScheduleResponse.model_validate(task)
        res.progress = scheduler_service.get_progress(task.id)
        return res


@router.put("/{schedule_id}", response_model=ScheduleTask)
def update_schedule(schedule_id: int, req: ScheduleUpdateRequest):
    """Updates an existing pipeline workflow schedule."""
    with Session(engine) as session:
        task = session.get(ScheduleTask, schedule_id)
        if not task:
            raise HTTPException(status_code=404, detail="Schedule not found")

        update_data = req.model_dump(exclude_unset=True)
        for k, v in update_data.items():
            setattr(task, k, v)

        # Safe normalization: in New Jobs, Liveness cannot be active without Scan
        if task.target_area == "new_jobs" and not task.enable_scan:
            task.enable_liveness = False

        # Recompute next_run_at if timing or frequency was modified
        task.next_run_at = compute_next_run(task)
        session.add(task)
        session.commit()
        session.refresh(task)
        return task


@router.delete("/{schedule_id}")
def delete_schedule(schedule_id: int):
    """Deletes a schedule."""
    with Session(engine) as session:
        task = session.get(ScheduleTask, schedule_id)
        if not task:
            raise HTTPException(status_code=404, detail="Schedule not found")
        session.delete(task)
        session.commit()
        return {"status": "success", "message": f"Schedule {schedule_id} deleted."}


@router.post("/{schedule_id}/toggle", response_model=ScheduleTask)
def toggle_schedule(schedule_id: int):
    """Toggles active state of a schedule."""
    with Session(engine) as session:
        task = session.get(ScheduleTask, schedule_id)
        if not task:
            raise HTTPException(status_code=404, detail="Schedule not found")

        task.is_active = not task.is_active
        if task.is_active:
            task.next_run_at = compute_next_run(task)
        else:
            task.next_run_at = None

        session.add(task)
        session.commit()
        session.refresh(task)
        return task


@router.post("/{schedule_id}/run")
async def run_schedule_now(schedule_id: int, background_tasks: BackgroundTasks):
    """Manually triggers an immediate execution of the schedule's pipeline workflow."""
    with Session(engine) as session:
        task = session.get(ScheduleTask, schedule_id)
        if not task:
            raise HTTPException(status_code=404, detail="Schedule not found")

    # Launch asynchronously in background
    background_tasks.add_task(scheduler_service.execute_schedule_task, schedule_id)
    return {"status": "started", "message": f"Execution started for schedule {schedule_id}."}

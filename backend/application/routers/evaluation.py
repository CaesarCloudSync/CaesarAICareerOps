import asyncio
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from backend.application.models import (
    JobEvalRequest,
    JobEvalResponse,
    BatchEvalRequest,
)
from backend.application.services.career_ops_evaluator import CareerOpsEvaluatorService
from backend.application.services.evaluation_tracker import evaluation_tracker, EvaluationJob
from backend.application.dependencies import get_evaluator_service

router = APIRouter(prefix="/api", tags=["Evaluation"])


async def _execute_eval_job(
    job: EvaluationJob,
    engine: str,
    evaluator: CareerOpsEvaluatorService,
):
    try:
        for idx, target in enumerate(job.targets):
            if job.cancelled:
                break

            clean_target = target.strip()
            # If line is pipe-delimited, format display title
            parts = clean_target.split("|")
            display_title = (
                f"{parts[1].strip()} — {parts[2].strip()}"
                if len(parts) > 2
                else clean_target
            )

            job.update_progress(
                current_index=idx + 1,
                current_target=display_title,
                detail=f"Evaluating role {idx + 1} of {job.total}: {display_title}",
            )

            try:
                res = await evaluator.evaluate_job(clean_target, engine=engine)
                success = res.exit_code == 0
                job.record_result(
                    target=clean_target,
                    success=success,
                    report_filename=res.report_filename,
                    error=res.stderr if not success else None,
                )
            except Exception as e:
                job.record_result(
                    target=clean_target,
                    success=False,
                    error=str(e),
                )

            await asyncio.sleep(0.1)

        if not job.cancelled:
            job.complete()
    except Exception as e:
        job.fail(str(e))


@router.post("/evaluate", response_model=JobEvalResponse)
async def evaluate_job(
    payload: JobEvalRequest,
    evaluator: CareerOpsEvaluatorService = Depends(get_evaluator_service),
) -> JobEvalResponse:
    """Run full 7-block CareerOps evaluation synchronously."""
    return await evaluator.evaluate_job(payload.jd_input, engine=payload.engine)


@router.post("/evaluate/stream")
async def evaluate_job_stream(
    payload: JobEvalRequest,
    evaluator: CareerOpsEvaluatorService = Depends(get_evaluator_service),
):
    """Stream 7-block evaluation tokens & progress in real time via Server-Sent Events."""
    return StreamingResponse(
        evaluator.evaluate_job_stream(payload.jd_input, engine=payload.engine),
        media_type="text/event-stream",
    )


@router.post("/evaluate/batch-async")
async def evaluate_batch_async(
    payload: BatchEvalRequest,
    evaluator: CareerOpsEvaluatorService = Depends(get_evaluator_service),
):
    """
    Launch asynchronous evaluation job for selected, all, or single roles.
    Returns job_id and initial status immediately. Survives page refreshes.
    """
    if not payload.targets:
        raise HTTPException(
            status_code=400, detail="No targets provided for evaluation."
        )

    # Check if an evaluation job is already running
    active = evaluation_tracker.get_active_job()
    if active and active.status == "running":
        return {
            "job_id": active.job_id,
            "status": "running",
            "total": active.total,
            "message": "An evaluation job is already actively running.",
            "job": active.to_dict(),
        }

    job = evaluation_tracker.create_job(payload.targets, mode=payload.mode)
    asyncio.create_task(_execute_eval_job(job, payload.engine, evaluator))

    return {
        "job_id": job.job_id,
        "status": job.status,
        "total": job.total,
        "message": f"Evaluation job {job.job_id} started for {job.total} role(s).",
        "job": job.to_dict(),
    }


@router.get("/evaluate/job/active")
async def get_active_evaluation_job():
    """Returns currently running or recently completed evaluation job for refresh resilience."""
    active_job = evaluation_tracker.get_active_job()
    return {
        "active": active_job is not None and active_job.status == "running",
        "job": active_job.to_dict() if active_job else None,
    }


@router.get("/evaluate/job/{job_id}")
async def get_evaluation_job_status(job_id: str):
    """Poll live progress, current item, completed/failed counts, and elapsed time."""
    job = evaluation_tracker.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=404, detail=f"Evaluation job '{job_id}' not found."
        )
    return {"job": job.to_dict()}


@router.post("/evaluate/job/{job_id}/cancel")
async def cancel_evaluation_job(job_id: str):
    """Gracefully cancel a running evaluation job."""
    job = evaluation_tracker.cancel_job(job_id)
    if not job:
        raise HTTPException(
            status_code=404, detail=f"Evaluation job '{job_id}' not found."
        )
    return {
        "job_id": job.job_id,
        "status": job.status,
        "message": "Evaluation job cancelled.",
        "job": job.to_dict(),
    }

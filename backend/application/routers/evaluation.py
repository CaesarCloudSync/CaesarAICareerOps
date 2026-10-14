from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from backend.application.models import JobEvalRequest, JobEvalResponse
from backend.application.services.career_ops_evaluator import CareerOpsEvaluatorService
from backend.application.dependencies import get_evaluator_service

router = APIRouter(prefix="/api", tags=["Evaluation"])


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

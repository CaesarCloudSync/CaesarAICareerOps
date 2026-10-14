from typing import List
from fastapi import APIRouter, Depends
from backend.application.models import EvaluationReport
from backend.application.repository.base import BaseRepository
from backend.application.dependencies import get_career_repository

router = APIRouter(prefix="/api/reports", tags=["Reports"])


@router.get("", response_model=List[EvaluationReport])
async def list_reports(
    repo: BaseRepository = Depends(get_career_repository),
) -> List[EvaluationReport]:
    """List all generated 7-block markdown evaluation reports."""
    return await repo.get_reports()

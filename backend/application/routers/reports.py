from typing import List
from fastapi import APIRouter, Depends, HTTPException
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


@router.delete("/{filename}")
async def delete_single_report(
    filename: str,
    repo: BaseRepository = Depends(get_career_repository),
):
    """Delete a specific evaluation report and its corresponding application/PDF."""
    success = await repo.delete_report(filename)
    if not success:
        raise HTTPException(status_code=404, detail=f"Report '{filename}' not found.")
    return {
        "status": "success",
        "message": f"Evaluation report '{filename}' deleted.",
        "filename": filename,
    }


@router.delete("")
async def delete_all_reports(
    repo: BaseRepository = Depends(get_career_repository),
):
    """Delete all evaluation reports and corresponding applications/PDFs."""
    deleted_count = await repo.delete_all_reports()
    return {
        "status": "success",
        "deleted_count": deleted_count,
        "message": f"Successfully deleted {deleted_count} evaluation report(s).",
    }

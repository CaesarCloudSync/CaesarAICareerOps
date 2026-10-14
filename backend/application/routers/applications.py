from typing import List
from fastapi import APIRouter, Depends, HTTPException

from backend.application.models import (
    Application,
    StatusUpdateRequest,
    DashboardStats,
)
from backend.application.repository.base import BaseRepository
from backend.application.dependencies import get_career_repository

router = APIRouter(prefix="/api", tags=["Applications"])


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    repo: BaseRepository = Depends(get_career_repository),
) -> DashboardStats:
    """Retrieve aggregate career operations metrics."""
    return await repo.get_stats()


@router.get("/applications", response_model=List[Application])
async def list_applications(
    repo: BaseRepository = Depends(get_career_repository),
) -> List[Application]:
    """Retrieve all tracked job applications."""
    return await repo.get_applications()


@router.post("/applications/status")
async def update_application_status(
    payload: StatusUpdateRequest,
    repo: BaseRepository = Depends(get_career_repository),
):
    """Update status of a tracked job application."""
    success = await repo.update_application_status(
        company=payload.company,
        role=payload.role,
        new_status=payload.status,
    )
    if not success:
        raise HTTPException(status_code=404, detail="Application record not found")
    return {
        "message": "Status updated successfully",
        "company": payload.company,
        "status": payload.status,
    }

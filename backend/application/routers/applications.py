from typing import List
from fastapi import APIRouter, Depends, HTTPException

from backend.application.models import (
    Application,
    ApplicationCreate,
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


@router.post("/applications", response_model=Application)
async def create_application(
    payload: ApplicationCreate,
    repo: BaseRepository = Depends(get_career_repository),
) -> Application:
    """Create or track a new job application."""
    return await repo.create_application(payload)


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


@router.delete("/applications/{app_id}")
async def delete_application(
    app_id: int,
    repo: BaseRepository = Depends(get_career_repository),
):
    """Delete a single tracked application by ID."""
    success = await repo.delete_application(app_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Application record {app_id} not found.")
    return {
        "status": "success",
        "message": f"Application {app_id} deleted successfully.",
        "id": app_id,
    }


@router.delete("/applications")
async def delete_all_applications(
    repo: BaseRepository = Depends(get_career_repository),
):
    """Delete all tracked applications and purge corresponding reports."""
    deleted_count = await repo.delete_all_applications()
    return {
        "status": "success",
        "deleted_count": deleted_count,
        "message": f"Successfully deleted {deleted_count} application(s).",
    }

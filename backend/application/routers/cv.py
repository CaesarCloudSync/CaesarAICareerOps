from fastapi import APIRouter, Depends
from backend.application.models import ResumeSaveRequest, SaveProfileRequest
from backend.application.repository.base import BaseRepository
from backend.application.dependencies import get_career_repository

router = APIRouter(prefix="/api", tags=["CV & Profile"])


@router.get("/cv")
async def get_cv(
    repo: BaseRepository = Depends(get_career_repository),
):
    """Retrieve Master CV in markdown."""
    content = await repo.get_cv()
    return {"content": content}


@router.post("/cv")
async def save_cv(
    payload: ResumeSaveRequest,
    repo: BaseRepository = Depends(get_career_repository),
):
    """Save Master CV markdown."""
    await repo.save_cv(payload.content)
    return {"message": "CV saved successfully"}


@router.get("/profile")
async def get_profile(
    repo: BaseRepository = Depends(get_career_repository),
):
    """Retrieve candidate profile YAML."""
    content = await repo.get_profile()
    return {"content": content}


@router.post("/profile")
async def save_profile(
    payload: SaveProfileRequest,
    repo: BaseRepository = Depends(get_career_repository),
):
    """Save candidate profile YAML."""
    await repo.save_profile(payload.content)
    return {"message": "Profile updated successfully"}

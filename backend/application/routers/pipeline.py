from typing import List
from fastapi import APIRouter, Depends

from backend.application.models import PipelineAddRequest
from backend.application.repository.base import BaseRepository
from backend.application.dependencies import get_career_repository

router = APIRouter(prefix="/api/pipeline", tags=["Pipeline"])


@router.get("", response_model=List[str])
async def get_pipeline_inbox(
    repo: BaseRepository = Depends(get_career_repository),
) -> List[str]:
    """Retrieve pending job listings from the pipeline inbox."""
    return await repo.get_pipeline()


@router.post("/add")
async def add_to_pipeline(
    payload: PipelineAddRequest,
    repo: BaseRepository = Depends(get_career_repository),
):
    """Add a job posting URL or snippet to the pipeline inbox."""
    await repo.add_to_pipeline(payload.input_data)
    return {"message": "Item added to pipeline inbox"}

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.application.repository.base import BaseRepository
from backend.application.dependencies import get_career_repository
from backend.application.services.autofill_service import autofill_service

router = APIRouter(prefix="/api/autofill", tags=["Autofill"])


class AutofillGenerateRequest(BaseModel):
    url: Optional[str] = ""
    company: Optional[str] = ""
    role: Optional[str] = ""
    questions: Optional[List[str]] = None


class ApplyFromPipelineRequest(BaseModel):
    url: Optional[str] = ""
    company: Optional[str] = ""
    role: Optional[str] = ""
    raw_line: Optional[str] = ""


@router.get("/candidate")
async def get_candidate():
    """Retrieve raw candidate profile and contact details."""
    return autofill_service.get_candidate_data()


@router.post("/generate")
async def generate_answers(payload: AutofillGenerateRequest):
    """
    Generate tailored application form answers and candidate fields using `agy` CLI
    grounded in the candidate's CV and profile.
    """
    return await autofill_service.generate_autofill_answers(
        url=payload.url or "",
        company=payload.company or "",
        role=payload.role or "",
        questions=payload.questions,
    )


@router.post("/apply-from-pipeline")
async def apply_from_pipeline(
    payload: ApplyFromPipelineRequest,
    repo: BaseRepository = Depends(get_career_repository),
):
    """
    Apply directly from the pipeline inbox: creates an application in the tracker
    with status 'Application in progress' and removes it from the pipeline inbox.
    No prior evaluation required!
    """
    return await autofill_service.apply_from_pipeline(
        url=payload.url or "",
        company=payload.company or "",
        role=payload.role or "",
        raw_line=payload.raw_line or "",
        repo=repo,
    )

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


@router.get("/cv.pdf")
async def get_cv_pdf():
    """Returns the candidate's Master or tailored CV PDF for automatic form attachment."""
    from fastapi.responses import FileResponse
    import yaml
    from backend.application.settings import BACKEND_DIR

    # Extract candidate name from profile.yml
    profile_path = BACKEND_DIR / "career-ops" / "config" / "profile.yml"
    cand_name = "Candidate"
    if profile_path.exists():
        try:
            p_data = yaml.safe_load(profile_path.read_text(encoding="utf-8")) or {}
            c_name = p_data.get("candidate", {}).get("full_name") or ""
            if c_name:
                cand_name = c_name.strip().replace(" ", "_")
        except Exception:
            pass

    cv_filename = f"{cand_name}_CV.pdf"

    output_dir = BACKEND_DIR / "career-ops" / "output"
    master_pdf = output_dir / "master_cv.pdf"
    if master_pdf.exists():
        return FileResponse(
            master_pdf,
            media_type="application/pdf",
            filename=cv_filename,
            headers={"Access-Control-Allow-Origin": "*"}
        )

    # Search for any PDF in output/
    pdfs = list(output_dir.glob("*.pdf")) + list((output_dir / "archive_legacy").glob("*.pdf"))
    if pdfs:
        return FileResponse(
            pdfs[0],
            media_type="application/pdf",
            filename=cv_filename,
            headers={"Access-Control-Allow-Origin": "*"}
        )

    raise HTTPException(status_code=404, detail="No CV PDF file found in output directory.")


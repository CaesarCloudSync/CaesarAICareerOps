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
    result = await autofill_service.generate_autofill_answers(
        url=payload.url or "",
        company=payload.company or "",
        role=payload.role or "",
        questions=payload.questions,
    )

    # Persist answers if generated
    if result.get("answers"):
        try:
            import json
            from sqlmodel import Session, select
            from backend.application.database import engine
            from backend.application.models import Application

            answers_json = json.dumps(result["answers"])
            norm_comp = (payload.company or "").strip().lower()
            norm_url = (payload.url or "").strip().lower()

            with Session(engine) as session:
                for a in session.exec(select(Application)).all():
                    matches_url = norm_url and norm_url.startswith("http") and (a.url or "").strip().lower() == norm_url
                    matches_comp = norm_comp and (a.company or "").strip().lower() == norm_comp
                    if matches_url or matches_comp:
                        a.answers = answers_json
                        session.add(a)
                        session.commit()
                        break
        except Exception:
            pass

    return result


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


@router.get("/cv-base64")
async def get_cv_base64():
    """Returns candidate's CV as base64 string for zero-CSP client-side form attachment."""
    import base64
    from backend.application.settings import BACKEND_DIR
    import yaml

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
    target_pdf = None
    if master_pdf.exists():
        target_pdf = master_pdf
    else:
        pdfs = list(output_dir.glob("*.pdf")) + list((output_dir / "archive_legacy").glob("*.pdf"))
        if pdfs:
            target_pdf = pdfs[0]

    if not target_pdf or not target_pdf.exists():
        return {"filename": cv_filename, "base64": ""}

    pdf_bytes = target_pdf.read_bytes()
    b64 = base64.b64encode(pdf_bytes).decode("utf-8")
    return {"filename": cv_filename, "base64": b64}


class SaveAnswersPayload(BaseModel):
    company: Optional[str] = ""
    role: Optional[str] = ""
    url: Optional[str] = ""
    answers: List[Dict[str, Any]] = []


@router.post("/save-answers")
async def save_answers(
    payload: SaveAnswersPayload,
    repo: BaseRepository = Depends(get_career_repository),
):
    """Save or update tailored answers for an application."""
    import json
    from sqlmodel import Session, select
    from backend.application.database import engine
    from backend.application.models import Application, ApplicationCreate

    answers_json = json.dumps(payload.answers)
    norm_comp = (payload.company or "").strip().lower()
    norm_url = (payload.url or "").strip().lower()

    with Session(engine) as session:
        all_apps = session.exec(select(Application)).all()
        target_app = None
        for a in all_apps:
            if norm_url and norm_url.startswith("http") and (a.url or "").strip().lower() == norm_url:
                target_app = a
                break
            if norm_comp and (a.company or "").strip().lower() == norm_comp:
                target_app = a
                break

        if target_app:
            target_app.answers = answers_json
            session.add(target_app)
            session.commit()
            session.refresh(target_app)
            return {"status": "updated", "id": target_app.id, "answers": payload.answers}

    # If no existing application, create one with status 'Application in progress'
    new_app = await repo.create_application(ApplicationCreate(
        company=payload.company or "Target Company",
        role=payload.role or "Target Role",
        status="Application in progress",
        url=payload.url or "",
        answers=answers_json,
    ))
    return {"status": "created", "id": new_app.id, "answers": payload.answers}


@router.get("/saved-answers")
async def get_saved_answers(
    company: Optional[str] = "",
    role: Optional[str] = "",
    url: Optional[str] = "",
):
    """Retrieve previously saved tailored answers for a job application."""
    import json
    from sqlmodel import Session, select
    from backend.application.database import engine
    from backend.application.models import Application

    norm_comp = (company or "").strip().lower()
    norm_url = (url or "").strip().lower()

    with Session(engine) as session:
        all_apps = session.exec(select(Application)).all()
        for a in all_apps:
            matches_url = norm_url and norm_url.startswith("http") and (a.url or "").strip().lower() == norm_url
            matches_comp = norm_comp and (a.company or "").strip().lower() == norm_comp
            if (matches_url or matches_comp) and a.answers:
                try:
                    data = json.loads(a.answers)
                    return {"found": True, "answers": data}
                except Exception:
                    pass

    return {"found": False, "answers": []}


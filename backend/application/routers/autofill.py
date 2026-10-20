import re
import json
import asyncio
from datetime import date
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from backend.application.repository.base import BaseRepository
from backend.application.dependencies import get_career_repository
from backend.application.database import engine
from backend.application.models import Application, ApplicationCreate
from backend.application.services.autofill_service import autofill_service
from backend.application.services.autofill_tracker import autofill_tracker

router = APIRouter(prefix="/api/autofill", tags=["Autofill"])


class AutofillGenerateRequest(BaseModel):
    app_id: Optional[int] = None
    url: Optional[str] = ""
    company: Optional[str] = ""
    role: Optional[str] = ""
    questions: Optional[List[str]] = None


class ApplyFromPipelineRequest(BaseModel):
    url: Optional[str] = ""
    company: Optional[str] = ""
    role: Optional[str] = ""
    raw_line: Optional[str] = ""


class BatchAutofillRequest(BaseModel):
    app_ids: Optional[List[int]] = None
    all: Optional[bool] = False


class ResolveLiveRequest(BaseModel):
    url: Optional[str] = ""
    company: Optional[str] = ""
    role: Optional[str] = ""
    page_title: Optional[str] = ""
    fields: List[Dict[str, Any]] = []


@router.post("/resolve-live")
async def resolve_live(payload: ResolveLiveRequest):
    """
    Live In-Browser DOM Autofill:
    Receives live-scraped form fields directly from the candidate's active browser session,
    uses `agy` + candidate profile/CV to generate exact DOM actions, screening answers,
    and tailored cover letter, automatically persists into SQLite ('Application in progress'),
    and returns actions and Base64 Master CV.
    """
    return await autofill_service.resolve_live_dom(
        fields=payload.fields,
        url=payload.url or "",
        company=payload.company or "",
        role=payload.role or "",
        page_title=payload.page_title or "",
    )


@router.post("/resolve-live-async")
async def resolve_live_async(payload: ResolveLiveRequest):
    """
    Asynchronous Live DOM Form Generation:
    Receives scraped form fields from browser, creates a real job_id in AutofillBatchTracker,
    spawns background agy reasoning task, and sets status to 'Application Generated' when complete.
    """
    import re
    detected_company = payload.company or ""
    detected_role = payload.role or ""
    url = payload.url or ""
    page_title = payload.page_title or ""

    if not detected_company or not detected_role:
        clean_title = re.sub(r"\s*-\s*Careers.*$", "", page_title, flags=re.IGNORECASE)
        for sep in [" — ", " - ", " | ", " at "]:
            if sep in clean_title:
                parts = clean_title.split(sep, 1)
                if not detected_company:
                    detected_company = parts[0].strip()
                if not detected_role:
                    detected_role = parts[1].strip()
                break
        detected_company = detected_company or "Target Company"
        detected_role = detected_role or "Software Engineer"

    # Find or create application with status 'Application in progress'
    norm_url = url.strip().lower()
    norm_comp = detected_company.strip().lower()
    target_app_id = 0

    with Session(engine) as session:
        for a in session.exec(select(Application)).all():
            matches_url = norm_url and norm_url.startswith("http") and (a.url or "").strip().lower() == norm_url
            matches_comp = norm_comp and (a.company or "").strip().lower() == norm_comp
            if matches_url or matches_comp:
                target_app_id = a.id
                a.status = "Application in progress"
                session.add(a)
                session.commit()
                break

        if not target_app_id:
            new_app = Application(
                company=detected_company,
                role=detected_role,
                url=url,
                status="Application in progress",
                date_applied=date.today().isoformat(),
            )
            session.add(new_app)
            session.commit()
            session.refresh(new_app)
            target_app_id = new_app.id

    job = autofill_tracker.create_job(app_ids=[target_app_id])
    target_name = f"{detected_company} — {detected_role}"
    job.current_target = target_name
    job.detail = f"Queued AI contextual reasoning on {len(payload.fields)} live fields with agy..."

    payload_dict = {
        "app_id": target_app_id,
        "fields": payload.fields,
        "url": url,
        "company": detected_company,
        "role": detected_role,
        "page_title": page_title,
    }
    asyncio.create_task(autofill_service.run_async_live_resolution(job.job_id, payload_dict))

    return {
        "status": "queued",
        "job_id": job.job_id,
        "job": job.to_dict(),
        "app_id": target_app_id,
        "company": detected_company,
        "role": detected_role,
    }


def _clean_job_url(u: str) -> str:
    if not u:
        return ""
    clean = u.strip().lower().rstrip("/")
    return clean.split("?")[0].split("#")[0]


def _is_url_match(u1: str, u2: str) -> bool:
    c1 = _clean_job_url(u1)
    c2 = _clean_job_url(u2)
    if not c1 or not c2:
        return False
    return c1 == c2 or (len(c1) > 15 and c1 in c2) or (len(c2) > 15 and c2 in c1)


@router.get("/check-status")
async def check_autofill_status(
    url: Optional[str] = "",
    company: Optional[str] = "",
    title: Optional[str] = "",
):
    """
    Checks if an application exists for the active tab URL/company,
    and whether AI answers and DOM actions are already generated and ready for instant autofill.
    """
    norm_comp = (company or "").strip().lower()

    if not norm_comp and title:
        clean_title = re.sub(r"\s*-\s*Careers.*$", "", title, flags=re.IGNORECASE)
        for sep in [" — ", " - ", " | ", " at "]:
            if sep in clean_title:
                parts = clean_title.split(sep, 1)
                norm_comp = parts[0].strip().lower()
                break

    with Session(engine) as session:
        for a in session.exec(select(Application)).all():
            matches_url = _is_url_match(url, a.url or "")
            matches_comp = norm_comp and (
                norm_comp == (a.company or "").strip().lower()
                or norm_comp in (a.company or "").strip().lower()
                or (a.company or "").strip().lower() in norm_comp
            )
            if matches_url or matches_comp:
                has_answers = False
                actions_count = 0
                answers_count = 0
                if a.answers:
                    try:
                        d = json.loads(a.answers)
                        if isinstance(d, dict):
                            actions_count = len(d.get("actions", [])) or d.get("actions_count", 0)
                            answers_count = len(d.get("answers", []))
                            has_answers = bool(actions_count or answers_count or d.get("cover_letter"))
                        elif isinstance(d, list):
                            answers_count = len(d)
                            has_answers = len(d) > 0
                    except Exception:
                        pass

                return {
                    "exists": True,
                    "app_id": a.id,
                    "company": a.company,
                    "role": a.role,
                    "status": a.status,
                    "has_generated": has_answers or (a.status == "Application Generated"),
                    "actions_count": actions_count,
                    "answers_count": answers_count,
                }

    return {
        "exists": False,
        "status": None,
        "has_generated": False,
        "actions_count": 0,
        "answers_count": 0,
    }


class ApplySavedRequest(BaseModel):
    url: Optional[str] = ""
    company: Optional[str] = ""
    role: Optional[str] = ""
    title: Optional[str] = ""


@router.post("/apply-saved")
async def apply_saved(payload: ApplySavedRequest):
    """
    Instant In-Browser Autofill:
    Retrieves pre-generated actions and answers from SQLite,
    attaches candidate Master CV PDF Base64, and returns immediately (<200ms) with zero AI latency.
    """
    norm_comp = (payload.company or "").strip().lower()
    if not norm_comp and payload.title:
        clean_title = re.sub(r"\s*-\s*Careers.*$", "", payload.title, flags=re.IGNORECASE)
        for sep in [" — ", " - ", " | ", " at "]:
            if sep in clean_title:
                parts = clean_title.split(sep, 1)
                norm_comp = parts[0].strip().lower()
                break

    cv_payload = autofill_service.get_cv_base64_payload()

    with Session(engine) as session:
        for a in session.exec(select(Application)).all():
            matches_url = _is_url_match(payload.url or "", a.url or "")
            matches_comp = norm_comp and (
                norm_comp == (a.company or "").strip().lower()
                or norm_comp in (a.company or "").strip().lower()
                or (a.company or "").strip().lower() in norm_comp
            )
            if matches_url or matches_comp:
                actions = []
                answers = []
                cover_letter = None
                if a.answers:
                    try:
                        d = json.loads(a.answers)
                        if isinstance(d, dict):
                            actions = d.get("actions", [])
                            answers = d.get("answers", [])
                            cover_letter = d.get("cover_letter")
                        elif isinstance(d, list):
                            answers = d
                    except Exception:
                        pass

                return {
                    "status": "success",
                    "found": True,
                    "company": a.company,
                    "role": a.role,
                    "actions": actions,
                    "answers": answers,
                    "cover_letter": cover_letter,
                    "has_cover_letter": bool(cover_letter),
                    "cvBase64": cv_payload.get("base64", ""),
                    "cvFilename": cv_payload.get("filename", "Bob_Hillus_CV.pdf"),
                }

    return {
        "status": "not_found",
        "found": False,
        "actions": [],
        "answers": [],
        "cvBase64": cv_payload.get("base64", ""),
        "cvFilename": cv_payload.get("filename", "Bob_Hillus_CV.pdf"),
    }


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
    if result.get("answers") or result.get("cover_letter"):
        try:
            payload_to_store = {
                "answers": result.get("answers", []),
                "cover_letter": result.get("cover_letter"),
                "has_cover_letter": result.get("has_cover_letter", False),
            }
            answers_json = json.dumps(payload_to_store)
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
        except Exception as e:
            print(f"[AutofillRouter] Error persisting answers: {e}")

    return result


@router.post("/generate-async")
async def generate_async(payload: AutofillGenerateRequest):
    """
    Starts an asynchronous background autofill job for a single application,
    tracked via a unique job_id in AutofillBatchTracker (identical to evaluation tracking).
    """
    target_app_id = payload.app_id

    # If no app_id provided, look up or create the application in SQLite
    if not target_app_id:
        norm_url = (payload.url or "").strip().lower()
        norm_comp = (payload.company or "").strip().lower()
        with Session(engine) as session:
            for a in session.exec(select(Application)).all():
                matches_url = norm_url and norm_url.startswith("http") and (a.url or "").strip().lower() == norm_url
                matches_comp = norm_comp and (a.company or "").strip().lower() == norm_comp
                if matches_url or matches_comp:
                    target_app_id = a.id
                    break

            if not target_app_id:
                new_app = Application(
                    company=payload.company or "Target Company",
                    role=payload.role or "Software Engineer",
                    url=payload.url or "",
                    status="Application in progress",
                    date_applied=date.today().isoformat(),
                )
                session.add(new_app)
                session.commit()
                session.refresh(new_app)
                target_app_id = new_app.id

    job = autofill_tracker.create_job(app_ids=[target_app_id])
    target_name = f"{payload.company or 'Target Company'} — {payload.role or 'Software Engineer'}"
    job.current_target = target_name
    job.detail = f"Inspecting application form & drafting tailored answers for {target_name} with agy..."

    asyncio.create_task(autofill_service.run_batch_autofill(job.job_id))

    return {
        "status": "started",
        "job_id": job.job_id,
        "job": job.to_dict(),
    }


@router.post("/batch")
async def start_batch_autofill(payload: BatchAutofillRequest):
    """
    Starts an asynchronous batch autofill job:
    Iterates over target applications, inspects form HTML, prompts `agy`,
    and stores answers INCREMENTALLY to SQLite.
    """
    target_ids = []
    with Session(engine) as session:
        if payload.all or not payload.app_ids:
            all_apps = session.exec(select(Application)).all()
            target_ids = [a.id for a in all_apps if a.id is not None]
        else:
            target_ids = [i for i in payload.app_ids if i is not None]

    if not target_ids:
        raise HTTPException(status_code=400, detail="No applications selected for batch autofill")

    job = autofill_tracker.create_job(app_ids=target_ids)
    asyncio.create_task(autofill_service.run_batch_autofill(job.job_id))

    return {
        "status": "started",
        "job_id": job.job_id,
        "total": job.total,
        "detail": job.detail,
    }


@router.get("/job/active")
async def get_active_batch_job():
    """Check if a batch autofill job is currently in flight."""
    job = autofill_tracker.get_active_job()
    if not job:
        return {"active": False, "job": None}
    return {"active": True, "job": job.to_dict()}


@router.get("/job/{job_id}")
async def get_batch_job_status(job_id: str):
    """Get the live progress and status of a batch autofill job."""
    job = autofill_tracker.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return job.to_dict()


@router.post("/job/{job_id}/cancel")
async def cancel_batch_job(job_id: str):
    """Cancel a running batch autofill job."""
    ok = autofill_tracker.cancel_job(job_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Job cannot be cancelled or is not running")
    return {"status": "cancelled", "job_id": job_id}


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
    cover_letter: Optional[str] = None


@router.post("/save-answers")
async def save_answers(
    payload: SaveAnswersPayload,
    repo: BaseRepository = Depends(get_career_repository),
):
    """Save or update tailored answers and cover letter for an application."""
    data_to_store = {
        "answers": payload.answers,
        "cover_letter": payload.cover_letter,
        "has_cover_letter": bool(payload.cover_letter),
    }
    answers_json = json.dumps(data_to_store)
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
            return {
                "status": "updated",
                "id": target_app.id,
                "answers": payload.answers,
                "cover_letter": payload.cover_letter
            }

    # If no existing application, create one with status 'Application in progress'
    new_app = await repo.create_application(ApplicationCreate(
        company=payload.company or "Target Company",
        role=payload.role or "Target Role",
        status="Application in progress",
        url=payload.url or "",
        answers=answers_json,
    ))
    return {
        "status": "created",
        "id": new_app.id,
        "answers": payload.answers,
        "cover_letter": payload.cover_letter
    }


class ClearAnswersPayload(BaseModel):
    company: Optional[str] = ""
    role: Optional[str] = ""
    url: Optional[str] = ""


@router.post("/clear-answers")
async def clear_answers(payload: ClearAnswersPayload):
    """
    Clears all AI-generated answers and cover letter for a specific job application from SQLite.
    """
    norm_comp = (payload.company or "").strip().lower()
    norm_url = (payload.url or "").strip().lower()

    with Session(engine) as session:
        all_apps = session.exec(select(Application)).all()
        for a in all_apps:
            matches_url = norm_url and norm_url.startswith("http") and (a.url or "").strip().lower() == norm_url
            matches_comp = norm_comp and (a.company or "").strip().lower() == norm_comp
            if matches_url or matches_comp:
                a.answers = None
                session.add(a)
                session.commit()
                return {"status": "cleared", "id": a.id}

    return {"status": "not_found"}


@router.get("/saved-answers")
async def get_saved_answers(
    company: Optional[str] = "",
    role: Optional[str] = "",
    url: Optional[str] = "",
):
    """Retrieve previously saved tailored answers and cover letter for a job application."""
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
                    # Check if dict with answers/cover_letter or legacy array
                    if isinstance(data, dict):
                        return {
                            "found": True,
                            "answers": data.get("answers", []),
                            "cover_letter": data.get("cover_letter"),
                            "has_cover_letter": data.get("has_cover_letter", False),
                        }
                    elif isinstance(data, list):
                        return {
                            "found": True,
                            "answers": data,
                            "cover_letter": None,
                            "has_cover_letter": False,
                        }
                except Exception:
                    pass

    return {"found": False, "answers": [], "cover_letter": None, "has_cover_letter": False}


@router.get("/extension-info")
async def get_extension_info():
    """Returns absolute path to the local extension folder for direct loading in Chrome."""
    from backend.application.settings import ROOT_DIR
    ext_dir = ROOT_DIR / "extension"
    return {
        "path": str(ext_dir),
        "exists": ext_dir.exists(),
        "files": [f.name for f in ext_dir.iterdir() if f.is_file()] if ext_dir.exists() else [],
    }


@router.get("/extension.zip")
async def download_extension_zip():
    """Packages the extension/ folder on the fly and streams a downloadable zip file."""
    import io
    import zipfile
    from fastapi.responses import Response
    from backend.application.settings import ROOT_DIR

    ext_dir = ROOT_DIR / "extension"
    if not ext_dir.exists():
        raise HTTPException(status_code=404, detail="Extension directory not found")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for file_path in ext_dir.rglob("*"):
            if file_path.is_file():
                arcname = file_path.relative_to(ext_dir)
                zip_file.write(file_path, arcname)

    buffer.seek(0)
    return Response(
        content=buffer.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="caesarai-autofill-extension.zip"',
        },
    )

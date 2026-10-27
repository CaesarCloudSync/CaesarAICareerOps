import re
import json
import asyncio
from datetime import date
from urllib.parse import urlparse
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from backend.application.repository.base import BaseRepository
from backend.application.dependencies import get_career_repository
from backend.application.database import engine
from backend.application.models import Application, ApplicationCreate
from backend.application.services.autofill_service import (
    autofill_service,
    normalize_job_url,
    _is_url_match,
    find_matching_application,
)
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


class CompileHtmlRequest(BaseModel):
    html: str
    url: Optional[str] = ""
    company: Optional[str] = ""
    role: Optional[str] = ""
    page_title: Optional[str] = ""
    app_id: Optional[int] = None


@router.post("/compile-html-script")
async def compile_html_script(payload: CompileHtmlRequest):
    """
    AI HTML-to-Script Compiler for Universal Bookmarklet:
    Takes raw form HTML snapshot from the dumb bridge bookmarklet,
    uses `agy` (Gemini 2.0) to understand the DOM and write a surgical, self-contained
    JavaScript execution snippet that directly populates the live form and attaches CV.
    Zero CSP restrictions.
    """
    if not payload.html or not payload.html.strip():
        raise HTTPException(status_code=400, detail="HTML snapshot is required.")
    return await autofill_service.compile_html_to_autofill_script(
        html=payload.html,
        url=payload.url or "",
        company=payload.company or "",
        role=payload.role or "",
        page_title=payload.page_title or "",
        app_id=payload.app_id,
    )


@router.post("/compile-html-async")
async def compile_html_async(payload: CompileHtmlRequest):
    """
    Asynchronous Queue for HTML Script Compilation:
    Enqueues the HTML snapshot into the FIFO background worker queue.
    If another compilation is running, marks this job as 'queued' and starts automatically
    once the previous job completes. Tracks progress via autofill_tracker so the user can navigate anywhere.
    """
    if not payload.html or not payload.html.strip():
        raise HTTPException(status_code=400, detail="HTML snapshot is required.")
    return await autofill_service.queue_compile_html_job(payload.dict())


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


def extract_company_and_role_from_context(url: str, title: str) -> tuple[str, str]:
    """Clean company and role extraction using URL domain, ATS structure, and page title."""
    company = ""
    role = ""

    p = urlparse(url) if url else None

    # Check for Greenhouse embed query param: for=company (e.g. job-boards.greenhouse.io/embed/job_app?for=elastic&token=8173419)
    if p and p.query:
        from urllib.parse import parse_qs
        qs = parse_qs(p.query)
        if "for" in qs and qs["for"][0]:
            company = qs["for"][0].replace("-", " ").title()

    # 1. SmartRecruiters specialized extraction
    if url and "smartrecruiters.com" in url.lower() and p:
        path_parts = [part for part in p.path.strip("/").split("/") if part]
        # Format 1: /oneclick-ui/company/<Company>/publication/<id>
        if "oneclick-ui" in path_parts and "company" in path_parts:
            try:
                comp_idx = path_parts.index("company") + 1
                if comp_idx < len(path_parts):
                    company = path_parts[comp_idx].replace("-", " ").title()
            except Exception:
                pass
            if "publication" in path_parts:
                try:
                    pub_idx = path_parts.index("publication") + 1
                    if pub_idx < len(path_parts):
                        pub_id = path_parts[pub_idx]
                        import urllib.request
                        api_url = f"https://api.smartrecruiters.com/v1/companies/{company}/postings/{pub_id}"
                        req = urllib.request.Request(api_url, headers={"User-Agent": "CaesarAI/1.0"})
                        with urllib.request.urlopen(req, timeout=1.8) as resp:
                            data = json.loads(resp.read().decode())
                            if data.get("name"):
                                role = data["name"]
                            if data.get("company", {}).get("name"):
                                company = data["company"]["name"]
                except Exception:
                    pass
        # Format 2: /<Company>/<job-id>-<role-slug>
        elif path_parts:
            company = path_parts[0].replace("-", " ").title()
            if len(path_parts) > 1 and "-" in path_parts[1]:
                slug = "-".join(path_parts[1].split("-")[1:])
                if slug:
                    role = slug.replace("-", " ").title()

    # 2. Greenhouse specialized extraction: job-boards.greenhouse.io/<company>/jobs/<id>
    elif url and "greenhouse.io" in url.lower() and p:
        path_parts = [part for part in p.path.strip("/").split("/") if part]
        if path_parts and path_parts[0].lower() not in ("embed", "job-boards"):
            company = path_parts[0].replace("-", " ").title()

    # 3. Ashby specialized extraction: jobs.ashbyhq.com/<company>/<id>
    elif url and "ashbyhq.com" in url.lower() and p:
        path_parts = [part for part in p.path.strip("/").split("/") if part]
        if path_parts:
            company = path_parts[0].replace("-", " ").title()

    # 4. Lever specialized extraction: jobs.lever.co/<company>/<id>
    elif url and "lever.co" in url.lower() and p:
        path_parts = [part for part in p.path.strip("/").split("/") if part]
        if path_parts:
            company = path_parts[0].replace("-", " ").title()

    # Parse and clean title
    if title:
        clean = title.strip()
        # Clean common generic title suffixes
        clean = re.sub(r"\s*\|\s*(?:SmartRecruiters|Greenhouse|Lever|Ashby|Workday)\s*$", "", clean, flags=re.IGNORECASE)

        # Clean common generic title prefixes (e.g. "Easy apply - ", "Job Application for ")
        clean = re.sub(r"^(?:Easy apply|Job Application for|Job Application|Application for|Apply for)\s*[-:–—]?\s*", "", clean, flags=re.IGNORECASE).strip()

        # Handle pipe separator in title: e.g. "Staff Software Engineer - Search | Elastic"
        if " | " in clean:
            pipe_parts = clean.split(" | ")
            if not company and len(pipe_parts) > 1 and pipe_parts[-1].strip().lower() not in ("careers", "jobs", "apply"):
                company = pipe_parts[-1].strip()
            clean = " | ".join(pipe_parts[:-1]).strip()

        if " @ " in clean:
            parts = clean.split(" @ ")
            if not role:
                role = parts[0].strip()
            if not company:
                company = parts[1].strip()
        elif " at " in clean:
            parts = clean.split(" at ")
            if not role:
                role = parts[0].strip()
            if not company:
                company = parts[1].strip()
        elif " - " in clean:
            parts = clean.split(" - ")
            cand_role = parts[0].strip()
            if cand_role.lower() in ("easy apply", "apply", "job application", "application", "careers") and len(parts) > 1:
                cand_role = parts[1].strip()
            if not role:
                role = cand_role
            if not company and len(parts) > 1:
                company = parts[-1].strip()
        elif not role and clean.lower() not in ("smartrecruiters", "smartrecruiters.com", "oneclick-ui", "job application", "application", "easy apply"):
            role = clean

    # Domain fallback if company is still empty (e.g. jobs.elastic.co -> Elastic)
    if not company and p and p.hostname:
        host_parts = p.hostname.split(".")
        tlds = {"com", "co", "org", "net", "io", "ai", "uk", "us", "de", "fr", "ca", "app", "dev"}
        subdomains = {"jobs", "careers", "boards", "board", "job-boards", "app", "www", "work", "hire"}
        cand = [part for part in host_parts if part.lower() not in tlds and part.lower() not in subdomains]
        if cand:
            company = cand[0].replace("-", " ").title()

    # Path fallback if still empty
    if not company and p:
        parts = [part for part in p.path.strip("/").split("/") if part and part.lower() not in ("oneclick-ui", "jobs", "company", "publication", "application", "apply", "form", "search", "view", "embed")]
        if parts:
            company = parts[0].replace("-", " ").title()

    return company or "Target Company", role or "Software Engineer"


@router.post("/resolve-live-async")
async def resolve_live_async(payload: ResolveLiveRequest):
    """
    Decoupled Async Live Autofill:
    Receives scraped form fields from browser, creates a real job_id in AutofillBatchTracker,
    spawns background agy reasoning task, and sets status to 'Application in progress'.
    Only upon 100% completion does the worker commit all actions in one go and transition to 'Application Generated'.
    """
    url = payload.url or ""
    page_title = payload.page_title or ""

    inferred_comp, inferred_role = extract_company_and_role_from_context(url, page_title)
    detected_company = payload.company or inferred_comp
    detected_role = payload.role or inferred_role

    target_app_id = 0

    with Session(engine) as session:
        target_app = find_matching_application(session, url=url, company=detected_company, role=detected_role)
        if target_app:
            target_app_id = target_app.id
            target_app.status = "Generating Application with agy"
            target_app.answers = None  # Clear any previous answers so user never receives half-created state
            if not target_app.url and url:
                target_app.url = url
            session.add(target_app)
            session.commit()
        else:
            new_app = Application(
                company=detected_company,
                role=detected_role,
                url=url,
                status="Generating Application with agy",
                date_applied=date.today().isoformat(),
                answers=None,
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
    inferred_comp, inferred_role = extract_company_and_role_from_context(url or "", title or "")
    comp = company or inferred_comp

    with Session(engine) as session:
        target_app = find_matching_application(session, url=url or "", company=comp, role=inferred_role)
        if target_app:
            actions_count = 0
            answers_count = 0
            has_answers = False

            # Consider ready when status is 'Application Generated'
            if target_app.status == "Application Generated":
                if target_app.answers:
                    try:
                        d = json.loads(target_app.answers)
                        if isinstance(d, dict):
                            actions_count = len(d.get("actions", [])) or d.get("actions_count", 0)
                            answers_count = len(d.get("answers", []))
                            has_answers = bool(actions_count or answers_count or d.get("cover_letter"))
                        elif isinstance(d, list):
                            answers_count = len(d)
                            has_answers = len(d) > 0
                    except Exception:
                        pass
                is_ready = True
            else:
                is_ready = False

            return {
                "exists": True,
                "app_id": target_app.id,
                "company": target_app.company,
                "role": target_app.role,
                "status": target_app.status,
                "has_generated": is_ready,
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
    Guarantees user cannot apply a half-created application while generation is in progress.
    """
    inferred_comp, inferred_role = extract_company_and_role_from_context(payload.url or "", payload.title or "")
    comp = payload.company or inferred_comp
    role = payload.role or inferred_role

    cv_payload = autofill_service.get_cv_base64_payload()
    cand_data = autofill_service.get_candidate_data()

    with Session(engine) as session:
        target_app = find_matching_application(session, url=payload.url or "", company=comp, role=role)
        if target_app:
            # If still generating, refuse to return half-baked answers
            if target_app.status in ("Generating Application with agy", "Application in progress"):
                return {
                    "status": "in_progress",
                    "found": False,
                    "message": "Autofill generation is still running in background with agy. Please wait until all fields are created.",
                    "actions": [],
                    "answers": [],
                    "cvBase64": cv_payload.get("base64", ""),
                    "cvFilename": cv_payload.get("filename", "Bob_Hillus_CV.pdf"),
                }

            actions = []
            answers = []
            cover_letter = None
            if target_app.status == "Application Generated":
                if target_app.answers:
                    try:
                        d = json.loads(target_app.answers)
                        if isinstance(d, dict):
                            actions = d.get("actions", [])
                            answers = d.get("answers", [])
                            cover_letter = d.get("cover_letter")
                        elif isinstance(d, list):
                            answers = d
                    except Exception:
                        pass
            else:
                return {
                    "status": "not_ready",
                    "found": False,
                    "message": "Application does not have generated actions yet. Please run AI generation first.",
                    "actions": [],
                    "answers": [],
                    "cvBase64": cv_payload.get("base64", ""),
                    "cvFilename": cv_payload.get("filename", "Bob_Hillus_CV.pdf"),
                }

            # Generate Cover Letter PDF Base64 if cover letter text was created
            cover_letter_b64 = ""
            cover_letter_fn = "Bob_Hillus_Cover_Letter.pdf"
            if cover_letter:
                cover_letter_b64 = autofill_service.generate_cover_letter_pdf_base64(
                    cover_letter_text=cover_letter,
                    company=target_app.company or comp,
                    role=target_app.role or role,
                )
                safe_comp = re.sub(r"[^\w\-]", "_", target_app.company or comp).strip("_")
                if safe_comp:
                    cover_letter_fn = f"Bob_Hillus_Cover_Letter_{safe_comp}.pdf"

            return {
                "status": "success",
                "found": True,
                "company": target_app.company,
                "role": target_app.role,
                "actions": actions,
                "answers": answers,
                "cover_letter": cover_letter,
                "has_cover_letter": bool(cover_letter),
                "coverLetterBase64": cover_letter_b64,
                "coverLetterFilename": cover_letter_fn,
                "profile": cand_data.get("profile", {}),
                "screening": cand_data.get("screening", {}),
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

            with Session(engine) as session:
                target_app = find_matching_application(
                    session,
                    url=payload.url or "",
                    company=payload.company or "",
                    role=payload.role or "",
                )
                if target_app:
                    target_app.answers = answers_json
                    session.add(target_app)
                    session.commit()
        except Exception as e:
            print(f"[AutofillRouter] Error persisting answers: {e}")

    return result


@router.post("/generate-async")
async def generate_async(payload: AutofillGenerateRequest):
    """
    Starts an asynchronous background autofill job for a single application,
    tracked via a unique job_id in AutofillBatchTracker (identical to evaluation tracking).
    Sets status immediately to 'Generating Application with agy'.
    """
    target_app_id = payload.app_id

    with Session(engine) as session:
        target_app = None
        if target_app_id:
            target_app = session.get(Application, target_app_id)
        if not target_app:
            target_app = find_matching_application(
                session,
                url=payload.url or "",
                company=payload.company or "",
                role=payload.role or "",
            )
        if target_app:
            target_app_id = target_app.id
            target_app.status = "Generating Application with agy"
            session.add(target_app)
            session.commit()
        else:
            new_app = Application(
                company=payload.company or "Target Company",
                role=payload.role or "Software Engineer",
                url=payload.url or "",
                status="Generating Application with agy",
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
    and sets status to 'Generating Application with agy' during execution.
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

    with Session(engine) as session:
        for tid in target_ids:
            a = session.get(Application, tid)
            if a:
                a.status = "Generating Application with agy"
                session.add(a)
        session.commit()

    job = autofill_tracker.create_job(app_ids=target_ids)
    asyncio.create_task(autofill_service.run_batch_autofill(job.job_id))

    return {
        "status": "started",
        "job_id": job.job_id,
        "total": job.total,
        "detail": job.detail,
    }


@router.get("/job/active")
@router.get("/jobs/active")
async def get_active_batch_job():
    """Check running and active autofill jobs in flight, returning all simultaneous jobs."""
    all_active = autofill_tracker.get_active_jobs()
    running_only = [j for j in all_active if j.status == "running"]
    primary = running_only[0] if running_only else (all_active[0] if all_active else None)
    return {
        "active": len(running_only) > 0,
        "count": len(running_only),
        "total_active": len(all_active),
        "job": primary.to_dict() if primary else None,
        "jobs": [j.to_dict() for j in all_active],
    }


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
        target_app = find_matching_application(
            session,
            url=payload.url or "",
            company=payload.company or "",
            role=payload.role or "",
        )

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

    # If no existing application, create one with status 'Application Generated'
    new_app = await repo.create_application(ApplicationCreate(
        company=payload.company or "Target Company",
        role=payload.role or "Target Role",
        status="Application Generated",
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
    with Session(engine) as session:
        target_app = find_matching_application(
            session,
            url=payload.url or "",
            company=payload.company or "",
            role=payload.role or "",
        )
        if target_app:
            target_app.answers = None
            session.add(target_app)
            session.commit()
            return {"status": "cleared", "id": target_app.id}

    return {"status": "not_found"}


@router.get("/saved-answers")
async def get_saved_answers(
    company: Optional[str] = "",
    role: Optional[str] = "",
    url: Optional[str] = "",
):
    """Retrieve previously saved tailored answers and cover letter for a job application."""
    with Session(engine) as session:
        target_app = find_matching_application(
            session,
            url=url or "",
            company=company or "",
            role=role or "",
        )
        if target_app and target_app.answers:
            try:
                data = json.loads(target_app.answers)
                # Check if dict with answers/cover_letter or legacy array
                if isinstance(data, dict):
                    return {
                        "found": True,
                        "actions": data.get("actions", []) or data.get("fields", []),
                        "answers": data.get("answers", []),
                        "cover_letter": data.get("cover_letter"),
                        "has_cover_letter": data.get("has_cover_letter", False),
                        "script": data.get("script"),
                        "raw_html": data.get("raw_html"),
                        "is_compiled": bool(data.get("is_compiled") or data.get("script") or data.get("actions")),
                        "compiled_at": data.get("compiled_at"),
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

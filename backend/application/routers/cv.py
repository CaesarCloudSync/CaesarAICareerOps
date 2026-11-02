import os
from pathlib import Path
from datetime import datetime, timezone
import yaml
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import FileResponse

from backend.application.models import ResumeSaveRequest, SaveProfileRequest
from backend.application.repository.base import BaseRepository
from backend.application.dependencies import get_career_repository
from backend.application.settings import BACKEND_DIR

router = APIRouter(prefix="/api", tags=["CV & Profile"])


def _get_candidate_filename() -> str:
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
    return f"{cand_name}_CV.pdf"


def _format_size(size_bytes: int) -> str:
    size = float(size_bytes)
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size < 1024.0:
            return f"{size:.1f} {unit}"
        size /= 1024.0
    return f"{size:.1f} TB"


def _get_master_pdf_path() -> Path:
    output_dir = BACKEND_DIR / "career-ops" / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir / "master_cv.pdf"


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


@router.get("/cv/pdf/status")
async def get_cv_pdf_status():
    """Returns metadata about the uploaded Master PDF CV."""
    target = _get_master_pdf_path()
    # Check fallback in output or data if master_cv.pdf doesn't exist
    if not target.exists():
        output_dir = BACKEND_DIR / "career-ops" / "output"
        pdfs = list(output_dir.glob("*.pdf"))
        if pdfs:
            target = pdfs[0]

    if not target.exists():
        return {
            "exists": False,
            "filename": None,
            "size_bytes": 0,
            "size_formatted": "0 B",
            "updated_at": None,
        }

    stat = target.stat()
    dt = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    return {
        "exists": True,
        "filename": target.name,
        "size_bytes": stat.st_size,
        "size_formatted": _format_size(stat.st_size),
        "updated_at": dt,
    }


@router.post("/cv/pdf/upload")
async def upload_cv_pdf(file: UploadFile = File(...)):
    """Uploads and saves a candidate's master PDF CV."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files (.pdf) are supported.")

    contents = await file.read()
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # Validate PDF magic header %PDF-
    if not contents.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Invalid PDF file content. File must be a valid PDF document.")

    target = _get_master_pdf_path()
    target.write_bytes(contents)

    # Also keep a copy in data/ if career-ops/data exists
    data_dir = BACKEND_DIR / "career-ops" / "data"
    if data_dir.exists():
        try:
            (data_dir / "master_cv.pdf").write_bytes(contents)
        except Exception:
            pass

    stat = target.stat()
    dt = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    return {
        "status": "success",
        "message": "Master PDF CV uploaded successfully.",
        "filename": target.name,
        "size_bytes": stat.st_size,
        "size_formatted": _format_size(stat.st_size),
        "updated_at": dt,
    }


@router.get("/cv/pdf/download")
async def download_cv_pdf():
    """Download the candidate's master PDF CV."""
    target = _get_master_pdf_path()
    if not target.exists():
        output_dir = BACKEND_DIR / "career-ops" / "output"
        pdfs = list(output_dir.glob("*.pdf"))
        if pdfs:
            target = pdfs[0]

    if not target.exists():
        raise HTTPException(status_code=404, detail="No Master PDF CV found. Please upload one first.")

    download_name = _get_candidate_filename()
    return FileResponse(
        path=target,
        media_type="application/pdf",
        filename=download_name,
        headers={"Content-Disposition": f'inline; filename="{download_name}"'}
    )


@router.delete("/cv/pdf")
async def delete_cv_pdf():
    """Deletes the current Master PDF CV."""
    target = _get_master_pdf_path()
    deleted = False
    if target.exists():
        target.unlink()
        deleted = True

    # Also check data/
    data_target = BACKEND_DIR / "career-ops" / "data" / "master_cv.pdf"
    if data_target.exists():
        data_target.unlink()
        deleted = True

    if not deleted:
        raise HTTPException(status_code=404, detail="No Master PDF CV found to delete.")

    return {"status": "success", "message": "Master PDF CV removed successfully."}

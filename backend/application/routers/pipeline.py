import re
from typing import List, Dict, Any
from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from backend.application.models import PipelineAddRequest, PipelineDeleteBatchRequest, PipelineItem
from backend.application.database import engine
from backend.application.repository.base import BaseRepository
from backend.application.dependencies import get_career_repository
from backend.application.services.discovery_tracker import discovery_tracker

router = APIRouter(prefix="/api/pipeline", tags=["Pipeline"])


@router.get("", response_model=List[str])
async def get_pipeline_inbox(
    repo: BaseRepository = Depends(get_career_repository),
) -> List[str]:
    """Retrieve pending job listings from the pipeline inbox."""
    return await repo.get_pipeline()


@router.get("/latest-discovered")
async def get_latest_discovered_jobs() -> Dict[str, Any]:
    """Retrieve roles added during the latest discovery run or recent pipeline additions."""
    latest = discovery_tracker.get_latest_discovered()
    if latest.get("roles"):
        return latest

    # Fallback to the most recent items from the inbox table
    fallback_roles = []
    with Session(engine) as session:
        recent_items = session.exec(
            select(PipelineItem).order_by(PipelineItem.id.desc()).limit(20)
        ).all()
        for it in recent_items:
            parts = it.raw_text.split("|")
            if len(parts) >= 3:
                url_m = re.search(r"https?://[^\s|]+", parts[0])
                company = parts[1].strip()
                title = parts[2].strip()
                location = parts[3].strip() if len(parts) > 3 else "London, UK"
                fallback_roles.append({
                    "company": company,
                    "title": title,
                    "location": location,
                    "url": url_m.group(0) if url_m else "",
                    "raw_line": it.raw_text,
                    "match_percentage": 92.0,
                    "ats_keywords": ["BACKEND", "API", "CLOUD"]
                })

    return {
        "roles": fallback_roles,
        "count": len(fallback_roles),
        "query": "Recent Pipeline Additions",
        "mode": "recent",
        "timestamp": None,
    }


@router.post("/add")
async def add_to_pipeline(
    payload: PipelineAddRequest,
    repo: BaseRepository = Depends(get_career_repository),
):
    """Add a job posting URL or snippet to the pipeline inbox."""
    await repo.add_to_pipeline(payload.input_data)
    return {"message": "Item added to pipeline inbox"}


@router.post("/delete-batch")
async def delete_pipeline_items_batch(
    payload: PipelineDeleteBatchRequest,
    repo: BaseRepository = Depends(get_career_repository),
) -> Dict[str, Any]:
    """Delete selected pipeline items across all occurrences (DB, pipeline.md, scan-history.tsv, applications, reports, PDFs)."""
    return await repo.delete_pipeline_items(payload.urls)


from typing import List
from fastapi import APIRouter, Depends
from backend.application.models import PdfItem, GeneratePdfRequest, ScanRequest
from backend.application.repository.base import BaseRepository
from backend.application.dependencies import get_career_repository, get_pdf_service, get_scanner_service
from backend.application.services.pdf_service import PdfGeneratorService
from backend.application.services.scanner_service import ScannerService

router = APIRouter(prefix="/api", tags=["PDFs & Scanner"])


@router.get("/pdfs", response_model=List[PdfItem])
async def list_pdfs(
    repo: BaseRepository = Depends(get_career_repository),
) -> List[PdfItem]:
    """List all generated PDF applications."""
    return await repo.get_pdfs()


@router.post("/pdf/generate")
async def generate_pdf(
    payload: GeneratePdfRequest,
    pdf_service: PdfGeneratorService = Depends(get_pdf_service),
):
    """Generate a tailored PDF resume from an evaluation report."""
    result = await pdf_service.generate_pdf(payload.report_filename)
    return result


@router.post("/scan")
async def run_portal_scanner(
    payload: ScanRequest,
    scanner: ScannerService = Depends(get_scanner_service),
):
    """Run portal scanner across configured company ATS feeds."""
    result = await scanner.run_scan(verify=payload.verify)
    return result

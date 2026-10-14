from fastapi import Depends
from backend.application.repository.base import BaseRepository
from backend.application.dependencies.repositories import get_career_repository
from backend.application.services.career_ops_evaluator import CareerOpsEvaluatorService
from backend.application.services.pdf_service import PdfGeneratorService
from backend.application.services.scanner_service import ScannerService


def get_evaluator_service(
    repo: BaseRepository = Depends(get_career_repository),
) -> CareerOpsEvaluatorService:
    return CareerOpsEvaluatorService(repository=repo)


def get_pdf_service() -> PdfGeneratorService:
    return PdfGeneratorService()


def get_scanner_service() -> ScannerService:
    return ScannerService()

from backend.application.routers.applications import router as applications_router
from backend.application.routers.evaluation import router as evaluation_router
from backend.application.routers.pipeline import router as pipeline_router
from backend.application.routers.cv import router as cv_router
from backend.application.routers.reports import router as reports_router
from backend.application.routers.pdfs import router as pdfs_router
from backend.application.routers.auth import router as auth_router
from backend.application.routers.settings import router as settings_router
from backend.application.routers.schedules import router as schedules_router

__all__ = [
    "applications_router",
    "evaluation_router",
    "pipeline_router",
    "cv_router",
    "reports_router",
    "pdfs_router",
    "auth_router",
    "settings_router",
    "schedules_router",
]

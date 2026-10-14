from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse

from backend.application.settings import settings, ROOT_DIR, BACKEND_DIR
from backend.application.database import init_database
from backend.application.routers import (
    applications_router,
    evaluation_router,
    pipeline_router,
    cv_router,
    reports_router,
    pdfs_router,
    auth_router,
)



@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLModel database on startup (works for SQLite, Supabase, Cloud SQL)
    init_database()
    yield


app = FastAPI(
    title="CaesarAICareerOps API",
    description="Decoupled 3-Tier Career Operations Co-Pilot API",
    version="2.0.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors.allow_origins,
    allow_origin_regex=settings.cors.allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(applications_router)
app.include_router(evaluation_router)
app.include_router(pipeline_router)
app.include_router(cv_router)
app.include_router(reports_router)
app.include_router(pdfs_router)
app.include_router(auth_router)

# Mount generated PDF output directory
career_ops_output = BACKEND_DIR / "career-ops" / "output"
career_ops_output.mkdir(parents=True, exist_ok=True)
app.mount("/static/output", StaticFiles(directory=str(career_ops_output)), name="output_pdfs")


@app.get("/api/health")
async def health_check():
    db_raw = settings.storage.effective_database_url.split("://")[0]
    provider_name = "PostgreSQL" if "postgres" in db_raw else ("SQLite" if "sqlite" in db_raw else db_raw)
    return {
        "status": "healthy",
        "service": settings.app_name,
        "environment": settings.environment,
        "database": db_raw,
        "provider": provider_name,
    }


# Mount compiled React frontend if built
frontend_dist = ROOT_DIR / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")
else:
    @app.get("/")
    async def index_placeholder():
        return JSONResponse({
            "message": "CaesarAICareerOps API is running. Frontend build in progress or not yet generated.",
            "docs_url": "/docs",
            "health_url": "/api/health"
        })

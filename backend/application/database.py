from pathlib import Path
from sqlmodel import SQLModel, create_engine, Session
from backend.application.settings import settings

DATABASE_URL = settings.storage.effective_database_url

# SQLite requires check_same_thread=False when used with multithreaded FastAPI
connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_URL else {}

engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args=connect_args,
)


def init_database() -> None:
    """
    Create all tables in whichever database is configured.
    Works identically for SQLite, Supabase Postgres, and GCP Cloud SQL!
    """
    # Ensure SQLite parent directory exists if using local file
    if "sqlite" in DATABASE_URL:
        db_path = Path(settings.storage.sqlite_db_path)
        db_path.parent.mkdir(parents=True, exist_ok=True)

    SQLModel.metadata.create_all(engine)
    try:
        with engine.begin() as conn:
            from sqlalchemy import text
            conn.execute(text("ALTER TABLE scheduletask ADD COLUMN IF NOT EXISTS client_timezone VARCHAR(64) NULL;"))
    except Exception:
        pass


def get_db_session():
    """Dependency provider yielding an active SQLModel Session."""
    with Session(engine) as session:
        yield session

from backend.application.repository.base import BaseRepository
from backend.application.repository.sqlmodel_provider import SQLModelRepository

_repo_instance: BaseRepository | None = None


def get_repository() -> BaseRepository:
    """
    Factory that returns the universal SQLModelRepository.
    Seamlessly supports:
      - Local SQLite (default: sqlite:///data/caesar.db)
      - Supabase PostgreSQL (via DATABASE_URL)
      - GCP Cloud SQL PostgreSQL (via DATABASE_URL)
    """
    global _repo_instance
    if _repo_instance is None:
        _repo_instance = SQLModelRepository()
    return _repo_instance


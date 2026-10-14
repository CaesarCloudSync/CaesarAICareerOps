from fastapi import Depends
from backend.application.repository.base import BaseRepository
from backend.application.repository.factory import get_repository


def get_career_repository() -> BaseRepository:
    """Dependency injection provider for the active data repository."""
    return get_repository()

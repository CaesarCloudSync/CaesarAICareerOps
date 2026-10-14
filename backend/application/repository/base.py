from abc import ABC, abstractmethod
from typing import List, Optional
from backend.application.models import (
    Application,
    ApplicationCreate,
    EvaluationReport,
    PdfItem,
    DashboardStats,
)


class BaseRepository(ABC):
    """
    Abstract interface for CareerOps storage providers.
    Supports interchangeable backends: SQLite, Supabase, etc.
    """

    @abstractmethod
    async def get_applications(self) -> List[Application]:
        """Retrieve all tracked applications."""
        pass

    @abstractmethod
    async def get_application_by_id(self, app_id: int) -> Optional[Application]:
        """Retrieve a single application by ID."""
        pass

    @abstractmethod
    async def create_application(self, app_data: ApplicationCreate) -> Application:
        """Create a new application entry in the tracker."""
        pass

    @abstractmethod
    async def update_application_status(self, company: str, role: str, new_status: str) -> bool:
        """Update status of a specific job application."""
        pass

    @abstractmethod
    async def get_pipeline(self) -> List[str]:
        """Get list of pending pipeline inbox items."""
        pass

    @abstractmethod
    async def add_to_pipeline(self, item_text: str) -> bool:
        """Add a job listing / URL to the pipeline inbox."""
        pass

    @abstractmethod
    async def get_cv(self) -> str:
        """Retrieve candidate Master CV in markdown."""
        pass

    @abstractmethod
    async def save_cv(self, content: str) -> None:
        """Save candidate Master CV markdown."""
        pass

    @abstractmethod
    async def get_profile(self) -> str:
        """Get profile configuration YAML."""
        pass

    @abstractmethod
    async def save_profile(self, yaml_content: str) -> None:
        """Save profile configuration YAML."""
        pass

    @abstractmethod
    async def get_reports(self) -> List[EvaluationReport]:
        """Get all generated evaluation markdown reports."""
        pass

    @abstractmethod
    async def save_report(self, filename: str, content: str) -> None:
        """Save an evaluation markdown report."""
        pass

    @abstractmethod
    async def get_pdfs(self) -> List[PdfItem]:
        """Get all generated PDF resumes."""
        pass

    @abstractmethod
    async def get_stats(self) -> DashboardStats:
        """Calculate high-level dashboard metrics."""
        pass

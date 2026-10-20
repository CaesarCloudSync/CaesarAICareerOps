from backend.application.models.application import (
    Application,
    ApplicationCreate,
    ApplicationUpdate,
    StatusUpdateRequest,
    ScoreUpdateRequest,
)
from backend.application.models.cv import (
    Resume,
    ResumeCreate,
    ResumeSaveRequest,
)
from backend.application.models.pipeline import (
    PipelineItem,
    PipelineAddRequest,
    PipelineDeleteBatchRequest,
)
from backend.application.models.report import (
    EvaluationReport,
    JobEvalRequest,
    JobEvalResponse,
    PdfItem,
    GeneratePdfRequest,
    BatchEvalRequest,
)
from backend.application.models.settings_model import (
    Profile,
    SaveProfileRequest,
    ScanRequest,
    DashboardStats,
    DiscoverySettings,
    CandidateProfileData,
    DiscoverJobsRequest,
    ExpandCompaniesRequest,
)

from backend.application.models.schedule import (
    ScheduleTask,
    ScheduleCreateRequest,
    ScheduleUpdateRequest,
)

__all__ = [
    "Application",
    "ApplicationCreate",
    "ApplicationUpdate",
    "StatusUpdateRequest",
    "ScoreUpdateRequest",
    "Resume",
    "ResumeCreate",
    "ResumeSaveRequest",
    "PipelineItem",
    "PipelineAddRequest",
    "PipelineDeleteBatchRequest",
    "EvaluationReport",
    "JobEvalRequest",
    "JobEvalResponse",
    "PdfItem",
    "GeneratePdfRequest",
    "BatchEvalRequest",
    "Profile",
    "SaveProfileRequest",
    "ScanRequest",
    "DashboardStats",
    "DiscoverySettings",
    "CandidateProfileData",
    "DiscoverJobsRequest",
    "ExpandCompaniesRequest",
    "ScheduleTask",
    "ScheduleCreateRequest",
    "ScheduleUpdateRequest",
]

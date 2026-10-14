from typing import Optional
from sqlmodel import SQLModel, Field


class EvaluationReport(SQLModel):
    filename: str = Field(..., description="Report filename, e.g. 001-vapi-2026-10-10.md")
    title: str = Field(..., description="Title extracted from first line of report")
    path: str = Field(..., description="Full path to the report file")
    content: str = Field(..., description="Full markdown content")


class JobEvalRequest(SQLModel):
    jd_input: str = Field(..., description="Job description text or public posting URL")
    engine: str = Field(default="agy", description="Execution engine: agy, claude, codex, gemini-api")


class JobEvalResponse(SQLModel):
    exit_code: int
    stdout: str
    stderr: str
    report_filename: Optional[str] = None


class PdfItem(SQLModel):
    filename: str
    path: str
    size_kb: float


class GeneratePdfRequest(SQLModel):
    report_filename: str

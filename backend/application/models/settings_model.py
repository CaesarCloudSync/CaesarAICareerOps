from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field


class Profile(SQLModel, table=True):
    __tablename__ = "profiles"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(default="default", unique=True, index=True)
    content: str = Field(..., description="YAML profile configuration")
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SaveProfileRequest(SQLModel):
    content: str = Field(..., description="YAML content for profile.yml")


class ScanRequest(SQLModel):
    verify: bool = Field(default=False, description="Whether to run Playwright liveness verification")


class DashboardStats(SQLModel):
    total_applications: int = 0
    high_score_roles: int = 0
    applied: int = 0
    interviews: int = 0
    offers: int = 0
    pipeline_inbox_count: int = 0
    total_reports: int = 0
    total_pdfs: int = 0


class DiscoverySettings(SQLModel):
    uk_only: bool = True
    country: str = "United Kingdom"
    always_allow_locations: list[str] = [
        "London", "Greater London", "United Kingdom", "UK", "Great Britain", "England"
    ]
    allowed_locations: list[str] = [
        "London", "Greater London", "United Kingdom", "UK", "England", "Remote - UK", "UK - Remote", "UK Remote", "Remote UK"
    ]
    blocked_locations: list[str] = [
        "China", "Beijing", "Shanghai", "Shenzhen", "Hangzhou", "Guangzhou",
        "Chengdu", "Hong Kong", "Taiwan", "India", "Bengaluru", "Singapore",
        "United States", "USA", "Japan", "Australia", "Brazil"
    ]
    target_roles: list[str] = [
        "Project Manager", "Delivery Specialist", "Project and Delivery",
        "Project Coordinator", "Technical Project Manager", "Programme Manager",
        "Delivery Manager", "Implementation Manager", "Engineering Delivery"
    ]
    negative_keywords: list[str] = ["Intern", "Graduate", "Student", "Junior", "Crypto"]
    reject_cjk: bool = True
    min_salary: Optional[str] = "£35K"
    max_salary: Optional[str] = "£65K"


class CandidateProfileData(SQLModel):
    full_name: str = "Bob Hillus"
    title: str = "Project and Delivery Specialist"
    email: str = "bob.hillus@gmail.com"
    phone: str = "07718 256800"
    location: str = "Enfield, Greater London, EN1 1XW"
    country: str = "United Kingdom"
    city: str = "Enfield, Greater London"
    headline: str = "Project & Delivery Specialist with corporate, engineering, and healthcare experience"
    exit_story: str = "Proven track record delivering engineering workstreams for fusion energy programmes and managing cross-functional operations."
    superpowers: list[str] = [
        "Research and planning",
        "Customer service & stakeholder management",
        "Effective communication & organizational skills",
        "Time management & budgeting"
    ]
    target_roles: list[str] = ["Project Manager", "Delivery Specialist", "Project Coordinator"]
    salary_target: str = "£40K-£60K"
    salary_min: str = "£35K"
    visa_status: str = "No sponsorship needed"


class DiscoverJobsRequest(SQLModel):
    natural_language_query: Optional[str] = None
    use_cv: bool = True
    uk_only: bool = True
    verify: bool = False


class ExpandCompaniesRequest(SQLModel):
    query_or_sector: str
    companies: Optional[list[str]] = None


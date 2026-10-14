import re
from pathlib import Path
from datetime import datetime, date, timezone
from typing import List, Optional
from sqlmodel import Session, select, desc, func

from backend.application.settings import settings
from backend.application.database import engine, init_database
from backend.application.repository.base import BaseRepository
from backend.application.models import (
    Application,
    ApplicationCreate,
    Resume,
    PipelineItem,
    Profile,
    EvaluationReport,
    PdfItem,
    DashboardStats,
)


class SQLModelRepository(BaseRepository):
    """
    Universal SQLModel repository.
    Works identically across SQLite, Supabase PostgreSQL, and GCP Cloud SQL.
    Switching databases is achieved purely by changing DATABASE_URL.
    """

    def __init__(self):
        self.career_ops_dir = Path(settings.career_ops_dir)
        init_database()
        self._seed_if_empty()

    def _seed_if_empty(self):
        with Session(engine) as session:
            count = session.exec(select(func.count(Application.id))).one()
            if count == 0:
                # Seed applications from markdown tracker
                apps_md = self.career_ops_dir / "data" / "applications.md"
                if apps_md.exists():
                    lines = [l.strip() for l in apps_md.read_text(encoding="utf-8").splitlines() if l.strip().startswith("|")]
                    if len(lines) >= 3:
                        for row in lines[2:]:
                            if "---" in row:
                                continue
                            cells = [c.strip() for c in row.split("|")[1:-1]]
                            if len(cells) >= 6:
                                num = cells[0]
                                date_applied = cells[1]
                                company = cells[2]
                                role = cells[4]
                                score_str = cells[5].replace("/5", "").strip()
                                try:
                                    score = float(score_str)
                                except ValueError:
                                    score = 0.0
                                status = cells[6] if len(cells) > 6 else "Evaluated"
                                report_path = cells[8] if len(cells) > 8 else ""
                                notes = cells[9] if len(cells) > 9 else ""

                                app = Application(
                                    num=num,
                                    company=company,
                                    role=role,
                                    score=score,
                                    status=status,
                                    date_applied=date_applied,
                                    report_path=report_path,
                                    notes=notes,
                                )
                                session.add(app)

            # Seed CV if resumes empty
            cv_count = session.exec(select(func.count(Resume.id))).one()
            if cv_count == 0:
                cv_file = self.career_ops_dir / "cv.md"
                if cv_file.exists():
                    session.add(Resume(title="Master CV", content=cv_file.read_text(encoding="utf-8"), is_default=True))

            # Seed pipeline inbox if empty
            pipe_count = session.exec(select(func.count(PipelineItem.id))).one()
            if pipe_count == 0:
                pipeline_file = self.career_ops_dir / "data" / "pipeline.md"
                if pipeline_file.exists():
                    for line in pipeline_file.read_text(encoding="utf-8").splitlines():
                        line_clean = line.strip()
                        if line_clean and not line_clean.startswith("#") and not line_clean.lower().startswith("paste job urls"):
                            session.add(PipelineItem(raw_text=line_clean, status="pending"))

            session.commit()

    async def get_applications(self) -> List[Application]:
        with Session(engine) as session:
            statement = select(Application).order_by(desc(Application.id))
            return session.exec(statement).all()

    async def get_application_by_id(self, app_id: int) -> Optional[Application]:
        with Session(engine) as session:
            return session.get(Application, app_id)

    async def create_application(self, app_data: ApplicationCreate) -> Application:
        with Session(engine) as session:
            count = session.exec(select(func.count(Application.id))).one()
            num_str = f"{count + 1:03d}"
            today_str = app_data.date_applied or date.today().isoformat()

            app = Application(
                num=num_str,
                company=app_data.company,
                role=app_data.role,
                score=app_data.score,
                status=app_data.status,
                date_applied=today_str,
                url=app_data.url,
                report_path=app_data.report_path,
                notes=app_data.notes,
            )
            session.add(app)
            session.commit()
            session.refresh(app)
            return app

    async def update_application_status(self, company: str, role: str, new_status: str) -> bool:
        with Session(engine) as session:
            statement = select(Application).where(
                func.lower(Application.company).contains(company.lower()),
                func.lower(Application.role).contains(role.lower())
            )
            apps = session.exec(statement).all()
            if not apps:
                return False
            for a in apps:
                a.status = new_status
                session.add(a)
            session.commit()
            return True

    async def get_pipeline(self) -> List[str]:
        with Session(engine) as session:
            statement = select(PipelineItem).where(PipelineItem.status == "pending").order_by(desc(PipelineItem.id)).limit(200)
            items = session.exec(statement).all()
            return [i.raw_text for i in items]

    async def add_to_pipeline(self, item_text: str) -> bool:
        with Session(engine) as session:
            item = PipelineItem(raw_text=item_text, status="pending")
            session.add(item)
            session.commit()
            return True

    async def get_cv(self) -> str:
        with Session(engine) as session:
            statement = select(Resume).where(Resume.is_default == True).order_by(desc(Resume.id)).limit(1)
            resume = session.exec(statement).first()
            if resume:
                return resume.content

        cv_file = self.career_ops_dir / "cv.md"
        if cv_file.exists():
            return cv_file.read_text(encoding="utf-8")
        return "# Master CV\n\nAdd your experience here."

    async def save_cv(self, content: str) -> None:
        with Session(engine) as session:
            statement = select(Resume).where(Resume.is_default == True).order_by(desc(Resume.id)).limit(1)
            resume = session.exec(statement).first()
            if resume:
                resume.content = content
                resume.updated_at = datetime.now(timezone.utc)
                session.add(resume)
            else:
                session.add(Resume(title="Master CV", content=content, is_default=True))
            session.commit()

        cv_file = self.career_ops_dir / "cv.md"
        cv_file.write_text(content, encoding="utf-8")

    async def get_profile(self) -> str:
        with Session(engine) as session:
            statement = select(Profile).where(Profile.name == "default").limit(1)
            profile = session.exec(statement).first()
            if profile:
                return profile.content

        profile_file = self.career_ops_dir / "config" / "profile.yml"
        if profile_file.exists():
            return profile_file.read_text(encoding="utf-8")
        return "identity:\n  name: Candidate\n"

    async def save_profile(self, yaml_content: str) -> None:
        with Session(engine) as session:
            statement = select(Profile).where(Profile.name == "default").limit(1)
            profile = session.exec(statement).first()
            if profile:
                profile.content = yaml_content
                profile.updated_at = datetime.now(timezone.utc)
                session.add(profile)
            else:
                session.add(Profile(name="default", content=yaml_content))
            session.commit()

        profile_file = self.career_ops_dir / "config" / "profile.yml"
        profile_file.write_text(yaml_content, encoding="utf-8")

    async def get_reports(self) -> List[EvaluationReport]:
        reports_dir = self.career_ops_dir / "reports"
        reports = []
        if reports_dir.exists():
            for file in sorted(reports_dir.glob("*.md"), reverse=True):
                content = file.read_text(encoding="utf-8", errors="replace")
                first_line = content.splitlines()[0] if content.splitlines() else file.name
                reports.append(EvaluationReport(
                    filename=file.name,
                    title=first_line.lstrip("#").strip(),
                    path=str(file),
                    content=content
                ))
        return reports

    async def save_report(self, filename: str, content: str) -> None:
        reports_dir = self.career_ops_dir / "reports"
        reports_dir.mkdir(parents=True, exist_ok=True)
        report_path = reports_dir / filename
        report_path.write_text(content, encoding="utf-8")

    async def get_pdfs(self) -> List[PdfItem]:
        output_dir = self.career_ops_dir / "output"
        pdfs = []
        if output_dir.exists():
            for file in sorted(output_dir.glob("*.pdf"), reverse=True):
                pdfs.append(PdfItem(
                    filename=file.name,
                    path=f"/static/output/{file.name}",
                    size_kb=round(file.stat().st_size / 1024, 1)
                ))
        return pdfs

    async def get_stats(self) -> DashboardStats:
        with Session(engine) as session:
            total_apps = session.exec(select(func.count(Application.id))).one()
            high_score = session.exec(select(func.count(Application.id)).where(Application.score >= 4.0)).one()
            applied = session.exec(select(func.count(Application.id)).where(func.lower(Application.status) == "applied")).one()
            interviews = session.exec(select(func.count(Application.id)).where(func.lower(Application.status).contains("interview"))).one()
            offers = session.exec(select(func.count(Application.id)).where(func.lower(Application.status).contains("offer"))).one()
            pipeline_count = session.exec(select(func.count(PipelineItem.id)).where(PipelineItem.status == "pending")).one()

        reports = await self.get_reports()
        pdfs = await self.get_pdfs()

        return DashboardStats(
            total_applications=total_apps,
            high_score_roles=high_score,
            applied=applied,
            interviews=interviews,
            offers=offers,
            pipeline_inbox_count=pipeline_count,
            total_reports=len(reports),
            total_pdfs=len(pdfs)
        )

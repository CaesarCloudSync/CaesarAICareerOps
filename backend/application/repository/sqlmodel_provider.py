import re
from pathlib import Path
from datetime import datetime, date, timezone
from typing import List, Optional, Dict, Any
from sqlmodel import Session, select, desc, func

from backend.application.settings import settings
from backend.application.database import engine, init_database
from backend.application.repository.base import BaseRepository
from backend.application.services.discovery_tracker import discovery_tracker
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

    def _sync_applications_md(self, session: Session):
        """Synchronizes data/applications.md tracker file with all current database Application records."""
        try:
            apps_md = self.career_ops_dir / "data" / "applications.md"
            if not apps_md.parent.exists():
                return
            all_apps = session.exec(select(Application).order_by(Application.id)).all()
            header = (
                "# Applications Tracker\n\n"
                "| # | Date | Company | Via | Role | Score | Status | PDF | Report | Notes |\n"
                "|---|------|---------|-----|------|-------|--------|-----|--------|-------|\n"
            )
            rows = []
            for a in all_apps:
                rep_path = a.report_path or ""
                rep_name = Path(rep_path).name if rep_path else ""
                rep_link = f"[Report]({rep_path})" if rep_path else ""
                pdf_name = rep_name.replace(".md", ".pdf") if rep_name else ""
                pdf_link = f"[PDF](output/{pdf_name})" if pdf_name else ""
                notes = a.notes or ""
                rows.append(
                    f"| {a.num} | {a.date_applied} | {a.company} | direct | {a.role} | {a.score:.1f}/5.0 | {a.status} | {pdf_link} | {rep_link} | {notes} |\n"
                )
            apps_md.write_text(header + "".join(rows), encoding="utf-8")
        except Exception as e:
            print(f"[SQLModelRepository] Failed to sync applications.md: {e}")

    async def create_application(self, app_data: ApplicationCreate) -> Application:
        with Session(engine) as session:
            norm_company = (app_data.company or "").strip().lower()
            norm_role = (app_data.role or "").strip().lower()
            norm_role_clean = re.sub(r"\s+evaluation$", "", norm_role, flags=re.IGNORECASE).strip()
            norm_url = (app_data.url or "").strip().lower()

            existing_app = None
            all_apps = session.exec(select(Application)).all()
            for existing in all_apps:
                e_comp = (existing.company or "").strip().lower()
                e_role = (existing.role or "").strip().lower()
                e_role_clean = re.sub(r"\s+evaluation$", "", e_role, flags=re.IGNORECASE).strip()
                e_url = (existing.url or "").strip().lower()

                # Match by URL if valid http link
                if norm_url and norm_url.startswith("http") and e_url == norm_url:
                    existing_app = existing
                    break

                # Match by Company and Role
                if e_comp and norm_company and (e_comp == norm_company or e_comp in norm_company or norm_company in e_comp):
                    if norm_role_clean and (e_role_clean == norm_role_clean or norm_role_clean in e_role_clean or e_role_clean in norm_role_clean):
                        existing_app = existing
                        break

            today_str = app_data.date_applied or date.today().isoformat()

            if existing_app:
                # Update existing application record in place rather than creating a duplicate
                existing_app.score = app_data.score
                if app_data.report_path:
                    existing_app.report_path = app_data.report_path
                if app_data.url and not existing_app.url:
                    existing_app.url = app_data.url
                if app_data.status:
                    existing_app.status = app_data.status
                elif not existing_app.status:
                    existing_app.status = "Evaluated"
                existing_app.date_applied = today_str
                if app_data.notes:
                    existing_app.notes = app_data.notes
                if app_data.answers is not None:
                    existing_app.answers = app_data.answers

                session.add(existing_app)
                session.commit()
                session.refresh(existing_app)
                self._sync_applications_md(session)
                return existing_app

            count = session.exec(select(func.count(Application.id))).one()
            num_str = f"{count + 1:03d}"

            app = Application(
                num=num_str,
                company=app_data.company,
                role=re.sub(r"\s+evaluation(?:\s+report)?$", "", app_data.role or "", flags=re.IGNORECASE).strip(),
                score=app_data.score,
                status=app_data.status,
                date_applied=today_str,
                url=app_data.url,
                report_path=app_data.report_path,
                notes=app_data.notes,
                answers=app_data.answers,
            )
            session.add(app)
            session.commit()
            session.refresh(app)

            self._sync_applications_md(session)
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
            self._sync_applications_md(session)
            return True

    async def update_application_score(
        self,
        score: float,
        app_id: Optional[int] = None,
        company: Optional[str] = None,
        role: Optional[str] = None,
    ) -> bool:
        with Session(engine) as session:
            target = None
            if app_id:
                target = session.get(Application, app_id)
            if not target and company and role:
                statement = select(Application).where(
                    func.lower(Application.company).contains(company.lower()),
                    func.lower(Application.role).contains(role.lower())
                )
                target = session.exec(statement).first()
            elif not target and company:
                statement = select(Application).where(
                    func.lower(Application.company).contains(company.lower())
                )
                target = session.exec(statement).first()

            if not target:
                return False

            target.score = round(float(score), 1)
            session.add(target)
            session.commit()
            session.refresh(target)
            self._sync_applications_md(session)
            return True

    async def delete_application(self, app_id: int) -> bool:
        with Session(engine) as session:
            app = session.get(Application, app_id)
            if not app:
                return False

            # Delete matching report and PDF files if they exist
            if app.report_path:
                rep_name = Path(app.report_path).name
                rep_file = self.career_ops_dir / "reports" / rep_name
                if rep_file.exists() and rep_file.is_file():
                    try:
                        rep_file.unlink()
                    except Exception:
                        pass

                pdf_name = rep_name.replace(".md", ".pdf")
                pdf_file = self.career_ops_dir / "output" / pdf_name
                if pdf_file.exists() and pdf_file.is_file():
                    try:
                        pdf_file.unlink()
                    except Exception:
                        pass

            session.delete(app)
            session.commit()
            self._sync_applications_md(session)
            return True

    async def delete_all_applications(self) -> int:
        with Session(engine) as session:
            apps = session.exec(select(Application)).all()
            count = len(apps)
            for app in apps:
                if app.report_path:
                    rep_name = Path(app.report_path).name
                    rep_file = self.career_ops_dir / "reports" / rep_name
                    if rep_file.exists() and rep_file.is_file():
                        try:
                            rep_file.unlink()
                        except Exception:
                            pass
                    pdf_name = rep_name.replace(".md", ".pdf")
                    pdf_file = self.career_ops_dir / "output" / pdf_name
                    if pdf_file.exists() and pdf_file.is_file():
                        try:
                            pdf_file.unlink()
                        except Exception:
                            pass
                session.delete(app)
            session.commit()

        # Clean applications.md tracker table if exists
        apps_md = self.career_ops_dir / "data" / "applications.md"
        if apps_md.exists():
            clean_header = (
                "# Applications Tracker\n\n"
                "| # | Date | Company | Via | Role | Score | Status | PDF | Report | Notes |\n"
                "|---|------|---------|-----|------|-------|--------|-----|--------|-------|\n"
            )
            apps_md.write_text(clean_header, encoding="utf-8")

        return count

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

    async def delete_pipeline_items(self, target_items: List[str]) -> Dict[str, Any]:
        """
        Delete selected pipeline items across all occurrences:
        1. PipelineItem database table
        2. data/pipeline.md
        3. data/scan-history.tsv (removes from seen/dedup history completely)
        4. Application database table (if evaluated)
        5. data/applications.md tracker table (if tracked)
        6. reports/*.md evaluation report files
        7. output/*.pdf generated PDF files
        8. in-memory discovery_tracker cache
        """
        if not target_items:
            return {
                "status": "success",
                "deleted_pipeline": 0,
                "deleted_tsv": 0,
                "deleted_apps": 0,
                "deleted_reports": 0,
                "message": "No items provided for deletion.",
            }

        # 1. Normalize targets into a set of clean URLs and tokens
        clean_urls = set()
        raw_targets = set()
        for item in target_items:
            if not item or not str(item).strip():
                continue
            item_str = str(item).strip()
            raw_targets.add(item_str)
            url_match = re.search(r"https?://[^\s|]+", item_str)
            if url_match:
                u = url_match.group(0).rstrip("/")
                clean_urls.add(u)
                base_u = u.split("?")[0].rstrip("/")
                clean_urls.add(base_u)
            else:
                if len(item_str) > 5:
                    clean_urls.add(item_str)

        # Filter out anything too short to prevent unintended broad matches
        clean_urls = {u for u in clean_urls if len(u) > 10}

        deleted_pipeline_count = 0
        deleted_apps_count = 0
        reports_to_delete = set()

        # 2. Database cleanup: PipelineItem and Application
        with Session(engine) as session:
            all_pipeline_items = session.exec(select(PipelineItem)).all()
            for p_item in all_pipeline_items:
                p_text = p_item.raw_text.strip()
                matched = False
                if any(u in p_text for u in clean_urls):
                    matched = True
                elif p_text in raw_targets:
                    matched = True
                if matched:
                    session.delete(p_item)
                    deleted_pipeline_count += 1

            all_apps = session.exec(select(Application)).all()
            for app in all_apps:
                app_matched = False
                if app.url:
                    norm_app_url = app.url.rstrip("/")
                    norm_base_url = norm_app_url.split("?")[0]
                    if any(u in norm_app_url or u in norm_base_url for u in clean_urls):
                        app_matched = True
                if app_matched:
                    if app.report_path:
                        reports_to_delete.add(Path(app.report_path).name)
                    session.delete(app)
                    deleted_apps_count += 1

            session.commit()

        # 3. Update data/pipeline.md
        pipeline_md = self.career_ops_dir / "data" / "pipeline.md"
        if pipeline_md.exists():
            lines = pipeline_md.read_text(encoding="utf-8", errors="replace").splitlines()
            new_lines = []
            for line in lines:
                line_matched = False
                for u in clean_urls:
                    if u in line:
                        line_matched = True
                        break
                if not line_matched and line.strip() in raw_targets:
                    line_matched = True
                if not line_matched:
                    new_lines.append(line)
            pipeline_md.write_text("\n".join(new_lines) + "\n", encoding="utf-8")

        # 4. Update data/scan-history.tsv (Removes matching rows so history is purged)
        deleted_tsv_count = 0
        scan_tsv = self.career_ops_dir / "data" / "scan-history.tsv"
        if scan_tsv.exists():
            tsv_lines = scan_tsv.read_text(encoding="utf-8", errors="replace").splitlines()
            new_tsv_lines = []
            for idx, line in enumerate(tsv_lines):
                if idx == 0:  # preserve header row
                    new_tsv_lines.append(line)
                    continue
                cols = line.split("\t")
                row_url = cols[0].strip().rstrip("/")
                row_base_url = row_url.split("?")[0]
                if (
                    row_url in clean_urls
                    or row_base_url in clean_urls
                    or any(u in row_url for u in clean_urls)
                ):
                    deleted_tsv_count += 1
                    continue
                new_tsv_lines.append(line)
            scan_tsv.write_text("\n".join(new_tsv_lines) + "\n", encoding="utf-8")

        # 5. Update data/applications.md
        apps_md = self.career_ops_dir / "data" / "applications.md"
        if apps_md.exists():
            apps_lines = apps_md.read_text(encoding="utf-8", errors="replace").splitlines()
            new_apps_lines = []
            for line in apps_lines:
                if line.startswith("#") or line.startswith("| #") or line.startswith("|---"):
                    new_apps_lines.append(line)
                    continue
                line_matched = False
                for u in clean_urls:
                    if u in line:
                        line_matched = True
                        break
                for rep in reports_to_delete:
                    if rep and rep in line:
                        line_matched = True
                        break
                if not line_matched:
                    new_apps_lines.append(line)
            apps_md.write_text("\n".join(new_apps_lines) + "\n", encoding="utf-8")

        # 6. Delete reports and PDFs
        reports_dir = self.career_ops_dir / "reports"
        output_dir = self.career_ops_dir / "output"
        deleted_reports_count = 0

        # Delete known report filenames from Application records
        for rep_name in reports_to_delete:
            rep_file = reports_dir / rep_name
            if rep_file.exists() and rep_file.is_file():
                try:
                    rep_file.unlink()
                    deleted_reports_count += 1
                except Exception:
                    pass
            pdf_file = output_dir / rep_name.replace(".md", ".pdf")
            if pdf_file.exists() and pdf_file.is_file():
                try:
                    pdf_file.unlink()
                except Exception:
                    pass

        # Also scan reports_dir to see if any report content references target URLs
        if reports_dir.exists():
            for r_file in reports_dir.glob("*.md"):
                try:
                    content = r_file.read_text(encoding="utf-8", errors="replace")
                    if any(u in content for u in clean_urls):
                        r_file.unlink()
                        pdf_file = output_dir / r_file.name.replace(".md", ".pdf")
                        if pdf_file.exists() and pdf_file.is_file():
                            pdf_file.unlink()
                        deleted_reports_count += 1
                except Exception:
                    pass

        # 7. Update in-memory discovery tracker cache
        discovery_tracker.remove_roles(clean_urls)

        return {
            "status": "success",
            "deleted_pipeline": deleted_pipeline_count,
            "deleted_tsv": deleted_tsv_count,
            "deleted_apps": deleted_apps_count,
            "deleted_reports": deleted_reports_count,
            "message": f"Deleted {deleted_pipeline_count} inbox role(s), purged {deleted_tsv_count} from TSV history, and cleaned related records.",
        }

    async def mark_pipeline_item_evaluated(self, url_or_target: str) -> bool:
        """Mark a pipeline item as evaluated in SQLite and update pipeline.md."""
        clean_target = url_or_target.strip()
        url_match = re.search(r"https?://[^\s|]+", clean_target)
        target_url = url_match.group(0).rstrip("/") if url_match else clean_target

        updated = False
        with Session(engine) as session:
            items = session.exec(select(PipelineItem).where(PipelineItem.status == "pending")).all()
            for it in items:
                if (target_url and target_url in it.raw_text) or it.raw_text.strip() == clean_target:
                    it.status = "evaluated"
                    session.add(it)
                    updated = True
            session.commit()

        # Update data/pipeline.md (change - [ ] to - [x] for this item)
        pipeline_md = self.career_ops_dir / "data" / "pipeline.md"
        if pipeline_md.exists():
            lines = pipeline_md.read_text(encoding="utf-8", errors="replace").splitlines()
            new_lines = []
            for line in lines:
                if target_url and target_url in line and line.strip().startswith("- [ ]"):
                    new_lines.append(line.replace("- [ ]", "- [x]", 1))
                else:
                    new_lines.append(line)
            pipeline_md.write_text("\n".join(new_lines) + "\n", encoding="utf-8")

        return updated



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

    async def delete_report(self, filename: str) -> bool:
        reports_dir = self.career_ops_dir / "reports"
        target_file = reports_dir / filename
        deleted = False
        if target_file.exists() and target_file.is_file():
            target_file.unlink()
            deleted = True

        # Remove corresponding PDF if it exists
        pdf_name = filename.replace(".md", ".pdf")
        pdf_file = self.career_ops_dir / "output" / pdf_name
        if pdf_file.exists() and pdf_file.is_file():
            pdf_file.unlink()

        # Remove corresponding Application record from database
        with Session(engine) as session:
            apps = session.exec(
                select(Application).where(Application.report_path.contains(filename))
            ).all()
            for app in apps:
                session.delete(app)
            session.commit()

        return deleted

    async def delete_all_reports(self) -> int:
        reports_dir = self.career_ops_dir / "reports"
        count = 0
        if reports_dir.exists():
            for file in reports_dir.glob("*.md"):
                if file.is_file():
                    file.unlink()
                    count += 1

        output_dir = self.career_ops_dir / "output"
        if output_dir.exists():
            for file in output_dir.glob("*.pdf"):
                if file.is_file():
                    file.unlink()

        # Remove evaluated applications from database
        with Session(engine) as session:
            apps = session.exec(select(Application)).all()
            for app in apps:
                if app.status == "Evaluated" or (app.report_path and "reports/" in app.report_path):
                    session.delete(app)
            session.commit()

        # Clean applications.md tracker table if exists
        apps_md = self.career_ops_dir / "data" / "applications.md"
        if apps_md.exists():
            clean_header = (
                "# Applications Tracker\n\n"
                "| # | Date | Company | Via | Role | Score | Status | PDF | Report | Notes |\n"
                "|---|------|---------|-----|------|-------|--------|-----|--------|-------|\n"
            )
            apps_md.write_text(clean_header, encoding="utf-8")

        return count

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
            applying = session.exec(
                select(func.count(Application.id)).where(
                    func.lower(Application.status).in_([
                        "application in progress",
                        "applying",
                        "in progress",
                        "in-progress",
                        "drafting",
                    ])
                )
            ).one()
            high_score = session.exec(select(func.count(Application.id)).where(Application.score >= 4.0)).one()
            applied = session.exec(select(func.count(Application.id)).where(func.lower(Application.status) == "applied")).one()
            interviews = session.exec(select(func.count(Application.id)).where(func.lower(Application.status).contains("interview"))).one()
            offers = session.exec(select(func.count(Application.id)).where(func.lower(Application.status).contains("offer"))).one()
            pipeline_count = session.exec(select(func.count(PipelineItem.id)).where(PipelineItem.status == "pending")).one()

        reports = await self.get_reports()
        pdfs = await self.get_pdfs()

        return DashboardStats(
            total_applications=total_apps,
            applying=applying,
            high_score_roles=high_score,
            applied=applied,
            interviews=interviews,
            offers=offers,
            pipeline_inbox_count=pipeline_count,
            total_reports=len(reports),
            total_pdfs=len(pdfs)
        )

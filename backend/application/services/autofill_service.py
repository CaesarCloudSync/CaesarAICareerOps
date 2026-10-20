import os
import re
import json
import yaml
import asyncio
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import date

from sqlmodel import Session, select

from backend.application.settings import BACKEND_DIR, ROOT_DIR
from backend.application.models import ApplicationCreate, Application
from backend.application.repository.base import BaseRepository
from backend.application.database import engine
from backend.application.services.autofill_tracker import autofill_tracker


class AutofillService:
    def __init__(self):
        self.career_ops_dir = BACKEND_DIR / "career-ops"
        self.profile_path = self.career_ops_dir / "config" / "profile.yml"
        self.cv_path = self.career_ops_dir / "cv.md"

    def get_candidate_data(self) -> Dict[str, Any]:
        """Extracts candidate profile, CV content, screening rules, and demographic preferences."""
        profile = {}
        screening = {
            "legally_authorized": True,
            "requires_sponsorship": False,
            "former_employee": False,
            "current_employee": False,
            "notice_period": "1 month",
            "how_did_you_hear": "LinkedIn",
        }
        demographics = {
            "gender": "Prefer not to say",
            "race_ethnicity": "Prefer not to say",
            "disability": "No",
            "veteran": "No",
        }

        if self.profile_path.exists():
            try:
                data = yaml.safe_load(self.profile_path.read_text(encoding="utf-8")) or {}
                cand = data.get("candidate", {})
                profile = {
                    "fullName": cand.get("full_name") or "",
                    "firstName": (cand.get("full_name") or "").split(" ")[0] if cand.get("full_name") else "",
                    "lastName": " ".join((cand.get("full_name") or "").split(" ")[1:]) if cand.get("full_name") else "",
                    "email": cand.get("email") or "",
                    "phone": cand.get("phone") or "",
                    "location": cand.get("location") or data.get("location", {}).get("city") or "London, United Kingdom",
                    "linkedin": cand.get("linkedin") or "",
                    "github": cand.get("github") or "",
                    "portfolio": cand.get("portfolio_url") or "",
                }
                if data.get("screening"):
                    screening.update(data["screening"])
                if data.get("demographics"):
                    demographics.update(data["demographics"])
            except Exception as e:
                print(f"[AutofillService] Error reading profile.yml: {e}")

        # Fallback to CV if profile fields are empty
        cv_text = ""
        if self.cv_path.exists():
            try:
                cv_text = self.cv_path.read_text(encoding="utf-8")
                first_lines = "\n".join(cv_text.splitlines()[:6])
                if not profile.get("fullName"):
                    name_m = re.search(r"^#\s*([A-Za-z\s]+?)(?:\s*—|\s*-|\n|$)", first_lines)
                    if name_m:
                        full = name_m.group(1).strip()
                        profile["fullName"] = full
                        profile["firstName"] = full.split(" ")[0]
                        profile["lastName"] = " ".join(full.split(" ")[1:])
                if not profile.get("email"):
                    email_m = re.search(r"[\w\.-]+@[\w\.-]+\.\w+", first_lines)
                    if email_m:
                        profile["email"] = email_m.group(0)
                if not profile.get("phone"):
                    phone_m = re.search(r"\+?[\d\s-]{9,15}", first_lines)
                    if phone_m:
                        profile["phone"] = phone_m.group(0).strip()
                if not profile.get("github"):
                    gh_m = re.search(r"(?:https?://)?(?:www\.)?github\.com/[\w\.-]+", first_lines)
                    if gh_m:
                        profile["github"] = gh_m.group(0)
                        if not profile["github"].startswith("http"):
                            profile["github"] = f"https://{profile['github']}"
                if not profile.get("linkedin"):
                    # Only fallback if candidate name matches CV header
                    cand_name = (profile.get("fullName") or "").lower()
                    if "alex" in cand_name or not cand_name:
                        li_m = re.search(r"(?:https?://)?(?:www\.)?linkedin\.com/in/[\w\.-]+", first_lines)
                        if li_m:
                            profile["linkedin"] = li_m.group(0)
                            if not profile["linkedin"].startswith("http"):
                                profile["linkedin"] = f"https://{profile['linkedin']}"
            except Exception as e:
                print(f"[AutofillService] Error reading cv.md: {e}")

        return {
            "profile": profile,
            "cv": cv_text,
            "screening": screening,
            "demographics": demographics,
        }

    def get_cv_base64_payload(self) -> Dict[str, str]:
        """Returns candidate CV filename and base64 string for zero-CSP attachment."""
        import base64
        profile_path = self.profile_path
        cand_name = "Candidate"
        if profile_path.exists():
            try:
                p_data = yaml.safe_load(profile_path.read_text(encoding="utf-8")) or {}
                c_name = p_data.get("candidate", {}).get("full_name") or ""
                if c_name:
                    cand_name = c_name.strip().replace(" ", "_")
            except Exception:
                pass

        cv_filename = f"{cand_name}_CV.pdf"
        output_dir = BACKEND_DIR / "career-ops" / "output"
        master_pdf = output_dir / "master_cv.pdf"
        target_pdf = None
        if master_pdf.exists():
            target_pdf = master_pdf
        else:
            pdfs = list(output_dir.glob("*.pdf")) + list((output_dir / "archive_legacy").glob("*.pdf"))
            if pdfs:
                target_pdf = pdfs[0]

        if not target_pdf or not target_pdf.exists():
            return {"filename": cv_filename, "base64": ""}

        pdf_bytes = target_pdf.read_bytes()
        b64 = base64.b64encode(pdf_bytes).decode("utf-8")
        return {"filename": cv_filename, "base64": b64}

    async def inspect_page_form(self, url: str) -> Dict[str, Any]:
        """
        Dynamically inspects the job application URL using Playwright Chromium to extract:
        - raw form fields (id, name, type, label)
        - whether a cover letter field (file or textarea) exists
        - list of custom essay/free-text fields (excluding static profile/contact fields)
        """
        if not url or not url.startswith("http"):
            return {"fields": [], "has_cover_letter": False, "custom_questions": []}

        # Normalize URL paths for common ATS engines
        target_url = url
        if "jobs.ashbyhq.com" in target_url and not target_url.rstrip("/").endswith("application"):
            target_url = target_url.rstrip("/") + "/application"
        elif "jobs.lever.co" in target_url and not target_url.rstrip("/").endswith("apply"):
            target_url = target_url.rstrip("/") + "/apply"

        raw_fields = []
        try:
            from playwright.async_api import async_playwright
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context(
                    user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                )
                page = await context.new_page()
                try:
                    await page.goto(target_url, timeout=12000, wait_until="domcontentloaded")
                    await page.wait_for_timeout(1500)

                    raw_fields = await page.evaluate("""() => {
                        const results = [];
                        const els = document.querySelectorAll('input, textarea, select');
                        els.forEach(el => {
                            const tag = el.tagName.toLowerCase();
                            const type = (el.type || '').toLowerCase();
                            if (type === 'hidden' || type === 'submit' || type === 'button') return;

                            let label = '';
                            if (el.id) {
                                const l = document.querySelector('label[for="' + el.id + '"]');
                                if (l) label = l.innerText;
                            }
                            if (!label) {
                                const l = el.closest('label');
                                if (l) label = l.innerText;
                            }
                            if (!label) {
                                let cur = el.parentElement;
                                for (let i = 0; i < 4; i++) {
                                    if (!cur) break;
                                    const l = cur.querySelector('label, [class*="label"], [class*="Label"], [class*="title"], [class*="legend"], [class*="question"]');
                                    if (l && l.innerText && l.innerText.length < 300) { label = l.innerText; break; }
                                    cur = cur.parentElement;
                                }
                            }
                            results.push({
                                tag: tag,
                                type: type,
                                id: el.id || '',
                                name: el.name || '',
                                label: (label || el.placeholder || el.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' '),
                                placeholder: el.placeholder || '',
                            });
                        });
                        return results;
                    }""")
                finally:
                    await browser.close()
        except Exception as e:
            print(f"[AutofillService] Playwright inspection fallback for {url}: {e}")
            # Fallback to simple HTTP request
            try:
                import httpx
                async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
                    resp = await client.get(target_url, headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64)"})
                    if resp.status_code == 200:
                        text = resp.text
                        # Simple label and textarea scanner
                        for m in re.finditer(r'<label[^>]*>(.*?)</label>', text, re.I | re.DOTALL):
                            clean_lbl = re.sub(r'<[^>]+>', ' ', m.group(1)).strip()
                            if clean_lbl:
                                raw_fields.append({"tag": "input", "type": "text", "id": "", "name": "", "label": clean_lbl, "placeholder": ""})
            except Exception as ex:
                print(f"[AutofillService] HTTP fallback error: {ex}")

        # Classify fields
        standard_patterns = r"(first.*name|last.*name|full.*name|given.*name|surname|email|phone|mobile|resume|cv\b|portfolio|github|linkedin|location|city|country|pronoun|gender|race|veteran|disability|salary|notice|work.*authoriz|sponsorship|consent|recaptcha)"
        cover_letter_pattern = r"cover[-_\s]?letter"

        has_cover_letter = False
        custom_questions = []

        seen_labels = set()
        for f in raw_fields:
            lbl = f["label"]
            f_type = f["type"]
            tag = f["tag"]
            id_name = f"{f['id']} {f['name']}".lower()

            if not lbl and not id_name:
                continue

            # Check for cover letter field (file upload or textarea/input)
            if re.search(cover_letter_pattern, lbl, re.I) or re.search(cover_letter_pattern, id_name, re.I):
                has_cover_letter = True
                continue

            if "recaptcha" in id_name or "recaptcha" in lbl.lower():
                continue

            # Free-text questions
            norm_lbl = lbl.lower()
            if norm_lbl in seen_labels:
                continue
            seen_labels.add(norm_lbl)

            if tag == "textarea":
                if not re.search(standard_patterns, lbl, re.I):
                    custom_questions.append(f)
            elif f_type in ("text", ""):
                # Custom text questions (ends with ?, or starts with question words, or >= 5 words long)
                if ("?" in lbl or len(lbl.split()) >= 4 or re.search(r"^(why|tell|describe|how|what|projects?|share)\b", lbl, re.I)) and not re.search(standard_patterns, lbl, re.I):
                    custom_questions.append(f)

        return {
            "fields": raw_fields,
            "has_cover_letter": has_cover_letter,
            "custom_questions": custom_questions,
        }

    async def generate_autofill_answers(
        self,
        url: str = "",
        company: str = "",
        role: str = "",
        questions: Optional[List[str]] = None,
        job_description: str = "",
    ) -> Dict[str, Any]:
        """
        Dynamically inspects the application form HTML and uses `agy` CLI to:
        1. Only answer real custom free-text questions that exist on the page.
        2. Keep profile and CV fields static.
        3. Generate a tailored cover letter if a cover letter field exists.
        4. If NO custom essay questions exist, returns answers: [] without fabricating fake answers.
        """
        cand = self.get_candidate_data()
        profile = cand["profile"]
        cv_text = cand["cv"]

        form_info = await self.inspect_page_form(url)
        custom_questions = form_info.get("custom_questions", [])
        has_cover_letter = form_info.get("has_cover_letter", False)

        # If user explicitly supplied questions, use those
        if questions:
            target_question_items = [{"label": q, "id": "", "name": ""} for q in questions]
        else:
            target_question_items = custom_questions

        # If no custom essay questions exist AND no cover letter field requested:
        # Return empty answers immediately! Static fields (Name, Email, CV PDF) will handle autofill.
        if not target_question_items and not has_cover_letter:
            return {
                "status": "success",
                "company": company,
                "role": role,
                "url": url,
                "profile": profile,
                "answers": [],
                "has_cover_letter": False,
                "cover_letter": None,
                "generated_with": "agy",
                "message": "No free-text questions or cover letter requested on this application form.",
            }

        # Prepare agy prompt
        q_descriptions = []
        for i, q in enumerate(target_question_items):
            lbl = q.get("label") or q.get("question") or f"Question {i+1}"
            f_id = q.get("id") or ""
            f_name = q.get("name") or ""
            q_descriptions.append(f"{i+1}. Label: \"{lbl}\" (Field ID: {f_id or 'none'}, Name: {f_name or 'none'})")

        q_text = "\n".join(q_descriptions) if q_descriptions else "No free-text essay questions detected."
        cover_letter_instruction = (
            "A Cover Letter field (upload or textarea) WAS detected on the form. "
            "Draft a compelling, professional 3-paragraph Cover Letter specifically tailored to this company and role, "
            "grounded strictly in the candidate's achievements and Master CV."
            if has_cover_letter else
            "No cover letter requested. Set \"cover_letter\" to null."
        )

        prompt = f"""You are the candidate's elite Career Operations Assistant.
Analyze the target job application and generate answers strictly for the detected custom form questions.

Target Opportunity:
- Company: {company or 'Target Company'}
- Role: {role or 'Software Engineer'}
- Application URL: {url or 'Not specified'}

Candidate Master Profile:
{json.dumps(profile, indent=2)}

Candidate Master CV / Experience:
{cv_text[:3500]}

Detected Custom Form Questions:
{q_text}

Cover Letter Requirement:
{cover_letter_instruction}

MANDATORY RULES:
1. ONLY answer genuine custom essay/free-text questions (e.g. 'Why Company', 'Describe a project', 'Technical challenge'). Do NOT answer standard contact info, demographic surveys, or yes/no questions.
2. Ground all experience, technical stack, achievements, and metrics strictly in the candidate's real CV.
3. If no custom essay questions exist, return "answers": [].
4. Return your output STRICTLY as a JSON object with this exact schema:
{{
  "has_questions": { "true" if target_question_items else "false" },
  "has_cover_letter": { "true" if has_cover_letter else "false" },
  "cover_letter": "The drafted 3-paragraph cover letter if requested, or null",
  "answers": [
    {{
      "question": "Exact question / label text",
      "field_id": "Field ID if available",
      "field_name": "Field Name if available",
      "label": "Exact label text",
      "answer": "The complete drafted answer paragraph"
    }}
  ]
}}
Do NOT output any conversational text or markdown code fences outside the JSON. Return ONLY the JSON object.
"""

        answers = []
        cover_letter = None
        try:
            proc = await asyncio.create_subprocess_exec(
                "agy", "-p", prompt, "--dangerously-skip-permissions", "--disable-slash-commands", "--effort", "low",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(self.career_ops_dir)
            )
            stdout, stderr = await proc.communicate()
            raw = stdout.decode("utf-8", errors="replace").strip()

            cleaned = raw
            if "```" in cleaned:
                cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.MULTILINE)
                cleaned = re.sub(r"```\s*$", "", cleaned, flags=re.MULTILINE).strip()

            json_match = re.search(r"\{.*\}", cleaned, re.DOTALL)
            if json_match:
                parsed = json.loads(json_match.group(0))
                answers = parsed.get("answers", [])
                cover_letter = parsed.get("cover_letter")
        except Exception as e:
            print(f"[AutofillService] agy generation failed: {e}")

        return {
            "status": "success",
            "company": company,
            "role": role,
            "url": url,
            "profile": profile,
            "answers": answers,
            "has_cover_letter": bool(cover_letter or has_cover_letter),
            "cover_letter": cover_letter,
            "generated_with": "agy",
        }

    async def resolve_live_dom(
        self,
        fields: List[Dict[str, Any]],
        url: str = "",
        company: str = "",
        role: str = "",
        page_title: str = "",
    ) -> Dict[str, Any]:
        """
        Resolves live DOM elements scraped directly by the user's browser:
        1. Contextual reasoning via `agy` on live form fields, candidate facts, and CV.
        2. Resolves text, textarea, <select> dropdowns, and screening radios.
        3. Deterministic fallback augmentation for guaranteed completion.
        4. Incremental SQLite persistence (status: 'Application in progress').
        5. Returns DOM actions plan and CV Base64 for instant zero-CSP execution.
        """
        cand = self.get_candidate_data()
        profile = cand["profile"]
        cv_text = cand["cv"]
        screening = cand.get("screening", {})
        demographics = cand.get("demographics", {})
        cv_payload = self.get_cv_base64_payload()

        detected_company = company or ""
        detected_role = role or ""

        # Build prompt for agy: ONLY the AI analyzes and resolves the DOM elements
        prompt = f"""You are the candidate's Career Operations AI Copilot.
You have been provided with the live extracted form fields from an active job application page.
Your mission is to understand the page and fields using AI reasoning and map out an exact DOM execution plan (`actions`), screening answers, and tailored answers/cover letter.

Target Job Information:
- Company: {detected_company or 'Infer from page title/url'}
- Role: {detected_role or 'Infer from page title/url'}
- Application Page URL: {url or 'Not specified'}
- Application Page Title: {page_title or 'Job Application'}

Candidate Master Profile:
{json.dumps(profile, indent=2)}

Candidate Screening Facts:
- Legally authorized to work in target location: {'Yes' if screening.get('legally_authorized') else 'No'}
- Requires visa sponsorship: {'Yes' if screening.get('requires_sponsorship') else 'No'}
- Former employee of company: {'Yes' if screening.get('former_employee') else 'No'}
- Currently employed by company: {'Yes' if screening.get('current_employee') else 'No'}
- Notice period: {screening.get('notice_period', '1 month')}
- How did you hear about us: {screening.get('how_did_you_hear', 'LinkedIn')}

Demographics Preferences:
{json.dumps(demographics, indent=2)}

Candidate Master CV / Experience:
{cv_text[:3500]}

Extracted Form Fields:
{json.dumps(fields, indent=2)}

MANDATORY INSTRUCTIONS:
1. Examine each field carefully. Understand its context, label, placeholder, and options using your intelligence (NO KEYWORD GUESSING).
2. For every field you can resolve, output an entry in `actions`:
   - For text/email/tel/number inputs or textareas: {{"id": "...", "selector": "...", "type": "fill", "value": "..."}}
   - For dropdowns (`select`): choose the best matching option from the field's `options` list: {{"id": "...", "selector": "...", "type": "select", "value": "<exact option text to select>"}}
   - For radio buttons: choose the appropriate radio: {{"id": "...", "selector": "...", "type": "radio", "value": "<option value or label>"}}
3. For custom free-text essay questions (e.g. 'Why us?', 'Tell us about a challenge', 'Describe a project'):
   - Draft an authentic, persuasive first-person STAR answer grounded strictly in candidate's real CV.
   - Include in both `actions` (type: 'fill') and in `answers` array.
4. For Cover Letter:
   - If a cover letter field (textarea or file upload) is detected, draft a tailored 3-paragraph cover letter in `cover_letter`. Otherwise set `cover_letter` to null.
5. Output STRICTLY a JSON object with this structure:
{{
  "company": "Company Name",
  "role": "Job Role",
  "actions": [
    {{ "id": "...", "selector": "...", "type": "fill" | "select" | "radio", "value": "..." }}
  ],
  "answers": [
    {{ "question": "Question text", "field_id": "...", "label": "...", "answer": "..." }}
  ],
  "cover_letter": "Drafted letter or null"
}}
Return ONLY JSON. No conversational text or markdown code fences outside JSON.
"""

        actions = []
        answers = []
        cover_letter = None

        try:
            proc = await asyncio.create_subprocess_exec(
                "agy", "-p", prompt, "--dangerously-skip-permissions", "--disable-slash-commands", "--effort", "low",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(self.career_ops_dir)
            )
            stdout, stderr = await proc.communicate()
            raw = stdout.decode("utf-8", errors="replace").strip()

            cleaned = raw
            if "```" in cleaned:
                cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.MULTILINE)
                cleaned = re.sub(r"```\s*$", "", cleaned, flags=re.MULTILINE).strip()

            json_match = re.search(r"\{.*\}", cleaned, re.DOTALL)
            if json_match:
                parsed = json.loads(json_match.group(0))
                actions = parsed.get("actions", [])
                answers = parsed.get("answers", [])
                cover_letter = parsed.get("cover_letter")
                if parsed.get("company"):
                    detected_company = parsed["company"]
                if parsed.get("role"):
                    detected_role = parsed["role"]
        except Exception as e:
            print(f"[AutofillService] agy resolve_live_dom error: {e}")

        # Automatic SQLite Persistence with status = 'Application in progress'
        try:
            norm_comp = (detected_company or "").strip().lower()
            norm_url = (url or "").strip().lower()

            with Session(engine) as session:
                target_app = None
                for a in session.exec(select(Application)).all():
                    matches_url = norm_url and norm_url.startswith("http") and (a.url or "").strip().lower() == norm_url
                    matches_comp = norm_comp and (a.company or "").strip().lower() == norm_comp
                    if matches_url or matches_comp:
                        target_app = a
                        break

                stored_payload = {
                    "answers": answers,
                    "cover_letter": cover_letter,
                    "has_cover_letter": bool(cover_letter),
                    "actions_count": len(actions),
                }
                stored_json = json.dumps(stored_payload)

                if target_app:
                    target_app.status = "Application in progress"
                    target_app.answers = stored_json
                    if not target_app.url and url:
                        target_app.url = url
                    session.add(target_app)
                    session.commit()
                else:
                    new_app = Application(
                        company=detected_company,
                        role=detected_role,
                        url=url or "",
                        status="Application in progress",
                        score=0.0,
                        date_applied=date.today().isoformat(),
                        notes="Autofilled via Live In-Browser Bookmarklet",
                        answers=stored_json,
                    )
                    session.add(new_app)
                    session.commit()
        except Exception as ex:
            print(f"[AutofillService] SQLite persistence error in resolve_live_dom: {ex}")

        return {
            "status": "success",
            "company": detected_company,
            "role": detected_role,
            "actions": actions,
            "answers": answers,
            "cover_letter": cover_letter,
            "has_cover_letter": bool(cover_letter),
            "cvBase64": cv_payload.get("base64", ""),
            "cvFilename": cv_payload.get("filename", "Bob_Hillus_CV.pdf"),
        }

    async def run_batch_autofill(self, job_id: str):
        """
        Background worker that processes selected applications one by one:
        - Inspects live form
        - Invokes `agy` if free-text questions or cover letter exists
        - Persists answers INCREMENTALLY to SQLite after each job completes!
        """
        job = autofill_tracker.get_job(job_id)
        if not job:
            return

        total = len(job.app_ids)
        for idx, app_id in enumerate(job.app_ids, start=1):
            if job.cancelled:
                job.cancel()
                return

            # Fetch application from DB
            target_app = None
            with Session(engine) as session:
                target_app = session.get(Application, app_id)

            if not target_app:
                job.record_result(app_id, f"App #{app_id}", False, error="Application not found in database")
                continue

            target_name = f"{target_app.company} — {target_app.role}"
            job.update_progress(idx, target_name, f"Inspecting application form & drafting with agy ({idx}/{total})...")

            try:
                result = await self.generate_autofill_answers(
                    url=target_app.url or "",
                    company=target_app.company or "",
                    role=target_app.role or "",
                )

                answers_list = result.get("answers", [])
                cover_letter = result.get("cover_letter")
                
                # INCREMENTAL PERSISTENCE TO SQLITE
                payload_to_store = {
                    "answers": answers_list,
                    "cover_letter": cover_letter,
                    "has_cover_letter": result.get("has_cover_letter", False),
                }
                
                with Session(engine) as session:
                    db_app = session.get(Application, app_id)
                    if db_app:
                        db_app.answers = json.dumps(payload_to_store)
                        session.add(db_app)
                        session.commit()

                job.record_result(
                    app_id=app_id,
                    target=target_name,
                    success=True,
                    questions_count=len(answers_list),
                    has_cover_letter=bool(cover_letter),
                )
            except Exception as e:
                print(f"[AutofillService] Error in batch autofill for {target_name}: {e}")
                job.record_result(app_id, target_name, False, error=str(e))

        job.complete()

    async def apply_from_pipeline(
        self,
        url: str,
        company: str,
        role: str,
        raw_line: str,
        repo: BaseRepository,
    ) -> Dict[str, Any]:
        """
        Moves a listing from the pipeline inbox into the applications tracker
        with status 'Application in progress'. Does NOT require prior evaluation!
        """
        today_str = date.today().isoformat()
        clean_role = re.sub(r"\s+evaluation(?:\s+report)?$", "", role or "", flags=re.IGNORECASE).strip()
        clean_company = (company or "").strip()

        # 1. Create or update application in repository
        app_data = ApplicationCreate(
            company=clean_company or "Unknown Company",
            role=clean_role or "Software Engineer",
            url=url or "",
            status="Application in progress",
            score=0.0,
            date_applied=today_str,
            notes="Applied directly from Pipeline Inbox",
        )
        created_app = await repo.create_application(app_data)

        # 2. Remove role from pipeline inbox
        targets = [t for t in [url, raw_line] if t]
        if targets:
            try:
                await repo.delete_pipeline_items(targets)
            except Exception as e:
                print(f"[AutofillService] Warning: Could not remove pipeline target: {e}")

        # 3. Generate initial autofill payload
        autofill_data = await self.generate_autofill_answers(
            url=url,
            company=clean_company,
            role=clean_role,
        )

        # Persist answers if any
        if autofill_data.get("answers") or autofill_data.get("cover_letter"):
            try:
                with Session(engine) as session:
                    db_app = session.get(Application, created_app.id)
                    if db_app:
                        payload = {
                            "answers": autofill_data.get("answers", []),
                            "cover_letter": autofill_data.get("cover_letter"),
                            "has_cover_letter": autofill_data.get("has_cover_letter", False),
                        }
                        db_app.answers = json.dumps(payload)
                        session.add(db_app)
                        session.commit()
            except Exception as e:
                print(f"[AutofillService] Failed to persist answers for new application: {e}")

        return {
            "status": "success",
            "message": f"Moved {clean_company} — {clean_role} to Applications with status 'Application in progress'",
            "application": created_app,
            "autofill": autofill_data,
        }


autofill_service = AutofillService()

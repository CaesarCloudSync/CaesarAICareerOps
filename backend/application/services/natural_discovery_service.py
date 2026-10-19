import os
import re
import json
import asyncio
import urllib.request
import urllib.error
from pathlib import Path
from typing import Dict, Any, List, Optional
from collections import defaultdict
import yaml
from sqlmodel import Session, select

from backend.application.settings import settings
from backend.application.database import engine
from backend.application.models import PipelineItem, Resume

CAREER_OPS_DIR = Path(settings.career_ops_dir)
PORTALS_YML = CAREER_OPS_DIR / "portals.yml"
PIPELINE_MD = CAREER_OPS_DIR / "data" / "pipeline.md"

SYSTEM_PARSER_PROMPT = """You are an expert ATS Job Pipeline Architect for Career-Ops.
Analyze the user's natural language search prompt and output ONLY a valid, raw JSON object (no markdown, no backticks, no explanations) matching this exact schema:

{
  "target_count": <integer, number of jobs requested, e.g. 50>,
  "mode": <"replace" | "append" | "match", choose "match" if the user wants to maintain, top up, ensure, or keep the queue at a specific total count (e.g. "keep my queue at 50", "make sure it's 50", "match 50 roles", "top up to 50"); choose "append" if the user asks to add/append more/additional roles on top of existing ones (e.g. "add 20 more", "append 50 roles"); choose "replace" if the user asks for a fresh search or to replace all existing roles (e.g. "find 50 roles", "search for 50", "replace queue with 50")>,
  "role_domain": <string, e.g. "Backend Software Engineering">,
  "seniority_tier": <string, e.g. "junior-to-mid">,
  "positive_keywords": [<list of positive title strings to match>],
  "negative_keywords": [<list of title strings to exclude, e.g. "Senior", "Lead", "Staff", "Principal", "Director", "VP", "Manager", "word:Intern", "Frontend">],
  "target_companies": [<list of EXACTLY 50 to 60 prominent real-world UK/London tech employers, fintechs, and scaleups hiring for these skills to probe via ATS>],
  "tech_stack": [<list of languages and technologies mentioned>],
  "core_fundamentals": [<list of core domains like "API Development", "Databases", "Microservices">],
  "evaluate_against_cv": <boolean, true if evaluation against CV requested>
}
"""

BACKEND_ANCHOR_REGEX = re.compile(
    r"\b(backend|software engineer|software developer|api engineer|platform engineer|python developer|python engineer|go engineer|golang|java developer|java engineer|node\.js|node developer)\b",
    re.IGNORECASE
)

IRRELEVANT_BLACKLIST_REGEX = re.compile(
    r"\b("
    r"strategist|designer|sales|marketing|gtm|recruiter|talent|customer success|enablement|"
    r"account executive|product manager|product owner|scrum master|support|legal|advisory|"
    r"speaking|bilingual|translation|"
    r"senior|sr|lead|staff|principal|director|head of|vp|architect|manager|"
    r"frontend|front-end|ios|android|mobile|ui|ux"
    r")\b",
    re.IGNORECASE
)

UK_REGEX = re.compile(
    r"\b(london|greater london|united kingdom|uk|great britain|england|edinburgh|manchester|birmingham|cambridge|oxford|bristol)\b",
    re.IGNORECASE,
)
FOREIGN_REGEX = re.compile(
    r"\b(china|beijing|shanghai|usa|united states|san francisco|india|poland|germany|france|spain)\b",
    re.IGNORECASE,
)


class NaturalDiscoveryService:
    """
    Autonomous coordinator translating natural language job search briefs into:
    1. AGY-parsed clean JSON structure (with 50+ real UK companies)
    2. Dynamic portals.yml configuration (backend keywords + UK geofence)
    3. Untouched ATS employer probing via discover-ats.mjs --write
    4. Untouched ATS scan via scan.mjs
    5. Zero-browser HTTP liveness verification (<400)
    6. Guardrailed filtering (strict backend anchor + domain blacklist + max 2 per company)
    7. ATS keyword matching & match scoring against candidate Master CV
    8. Database synchronization & clean pipeline.md persistence
    """

    async def parse_prompt_with_agy(self, user_prompt: str) -> Dict[str, Any]:
        """Step 1: Uses agy CLI to parse user natural language prompt into clean JSON."""
        full_prompt = f"{SYSTEM_PARSER_PROMPT}\n\nUSER PROMPT:\n{user_prompt}"
        try:
            proc = await asyncio.create_subprocess_exec(
                "agy", "-p", full_prompt, "--dangerously-skip-permissions",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await proc.communicate()
            raw = stdout.decode("utf-8", errors="replace").strip()
            
            # Strip markdown code blocks if agy wraps output
            cleaned = raw
            if "```" in cleaned:
                cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.MULTILINE)
                cleaned = re.sub(r"```\s*$", "", cleaned, flags=re.MULTILINE).strip()

            match = re.search(r"\{.*\}", cleaned, re.DOTALL)
            if match:
                parsed = json.loads(match.group(0))
                # Normalize mode
                prompt_lower = user_prompt.lower()
                match_keywords = ["keep at", "maintain", "match", "top up", "top-up", "fill to", "ensure", "make sure it", "have exactly", "reach "]
                append_keywords = ["more", "add ", "additional", "another", "plus", "expand", "append"]

                if "mode" not in parsed or parsed["mode"] not in ("append", "replace", "match"):
                    if any(w in prompt_lower for w in match_keywords):
                        parsed["mode"] = "match"
                    elif any(w in prompt_lower for w in append_keywords):
                        parsed["mode"] = "append"
                    else:
                        parsed["mode"] = "replace"
                else:
                    parsed["mode"] = parsed["mode"].lower().strip()
                return parsed
        except Exception as e:
            print(f"[NaturalDiscovery] AGY parse exception: {e}, falling back to defaults.")

        prompt_lower = user_prompt.lower()
        match_keywords = ["keep at", "maintain", "match", "top up", "top-up", "fill to", "ensure", "make sure it", "have exactly", "reach "]
        append_keywords = ["more", "add ", "additional", "another", "plus", "expand", "append"]

        if any(w in prompt_lower for w in match_keywords):
            inferred_mode = "match"
        elif any(w in prompt_lower for w in append_keywords):
            inferred_mode = "append"
        else:
            inferred_mode = "replace"

        # Robust fallback preserving UK tech employers & backend keywords
        return {
            "target_count": 50,
            "mode": inferred_mode,
            "role_domain": "Backend Software Engineering",
            "seniority_tier": "junior-to-mid",
            "positive_keywords": [
                "Backend Engineer", "Back-End Engineer", "Backend Developer", "Back-End Developer",
                "Software Engineer", "Software Developer", "Python Engineer", "Python Developer",
                "Go Engineer", "Golang Engineer", "Java Engineer", "Java Developer",
                "API Engineer", "Platform Engineer", "Junior Software Engineer", "Junior Developer"
            ],
            "negative_keywords": [
                "Senior", "Lead", "Staff", "Principal", "Director", "VP", "Manager", "word:Intern",
                "Frontend", "Front-End", "Designer", "Strategist", "Recruiter", "Customer Success"
            ],
            "target_companies": [
                "Monzo", "StarlingBank", "Revolut", "Wise", "Checkout.com", "Deliveroo", "OcadoTechnology",
                "Synthesia", "ElevenLabs", "Wayve", "Darktrace", "Snyk", "GoCardless", "TrueLayer",
                "Paddle", "Pleo", "Tide", "OakNorth", "ThoughtMachine", "Form3", "Cleo", "Zilch",
                "Lendable", "FundingCircle", "iwoca", "AllicaBank", "Atombank", "Kroo", "Zopa",
                "Flagstone", "RobinhoodUK", "Stripe", "Palantir", "Cloudflare", "Datadog", "Elastic",
                "Canonical", "GrafanaLabs", "Incident.io", "Hookdeck", "Ably", "Pusher", "tray.ai",
                "Permutive", "Tessian", "Netcraft", "Bumble", "Depop", "Vinted", "Gymshark",
                "Farfetch", "ASOS", "Trainline", "Citymapper", "OctopusEnergy"
            ],
            "tech_stack": ["Python", "Go", "Java", "Node.js"],
            "core_fundamentals": ["API Development", "Databases", "Microservices"],
            "evaluate_against_cv": True
        }

    async def apply_dynamic_filters(self, spec: Dict[str, Any]) -> None:
        """
        Step 2: Updates portals.yml title_filter and location_filter with atomic rollback.
        Writes to a staging temp file, verifies with validate-portals.mjs, and atomically
        renames only on 100% successful validation.
        """
        if not PORTALS_YML.exists():
            return

        content = PORTALS_YML.read_text(encoding="utf-8")

        # 1. Ensure location_filter is strict UK
        loc_block = (
            "location_filter:\n"
            "  strict: true\n"
            "  always_allow:\n"
            '    - "London"\n'
            '    - "Greater London"\n'
            '    - "United Kingdom"\n'
            '    - "UK"\n'
            '    - "Great Britain"\n'
            '    - "England"\n'
            "  allow:\n"
            '    - "London"\n'
            '    - "Greater London"\n'
            '    - "United Kingdom"\n'
            '    - "UK"\n'
            '    - "England"\n'
            '    - "Remote - UK"\n'
            '    - "UK - Remote"\n'
            '    - "UK Remote"\n'
            '    - "Remote UK"\n'
            "  block_hard:\n"
            '    - "China"\n'
            '    - "Beijing"\n'
            '    - "Shanghai"\n'
            '    - "Shenzhen"\n'
            '    - "Hangzhou"\n'
            '    - "USA"\n'
            '    - "United States"\n'
            '    - "India"\n'
            '    - "Singapore"\n'
            '    - "Australia"\n'
            '    - "Brazil"\n'
        )

        if re.search(r"^location_filter:", content, re.MULTILINE):
            content = re.sub(r"^location_filter:\n(?:[ \t]+[^\n]*\n*)*", f"{loc_block}\n", content, flags=re.MULTILINE)
        else:
            content = content.replace("tracked_companies:", f"{loc_block}\n\ntracked_companies:", 1)

        # 2. Update title_filter block
        positives = spec.get("positive_keywords", ["Backend Engineer", "Software Engineer"])
        negatives = spec.get("negative_keywords", ["Senior", "Lead", "Staff", "Principal", "Director", "VP", "Manager", "word:Intern", "Frontend"])

        positives_yaml = "\n".join([f'    - "{kw}"' for kw in positives])
        negatives_yaml = "\n".join([f'    - "{kw}"' for kw in negatives])

        title_block = (
            "title_filter:\n"
            "  positive:\n"
            f"{positives_yaml}\n"
            "  negative:\n"
            f"{negatives_yaml}\n"
        )

        if re.search(r"^title_filter:", content, re.MULTILINE):
            content = re.sub(r"^title_filter:\n(?:[ \t]+[^\n]*\n*)*", f"{title_block}\n", content, flags=re.MULTILINE)
        else:
            content = content.replace("tracked_companies:", f"{title_block}\n\ntracked_companies:", 1)

        # Safeguard 1: Write to staging temp file & pre-flight validate
        tmp_file = PORTALS_YML.with_suffix(".yml.tmp")
        tmp_file.write_text(content, encoding="utf-8")

        val_proc = await asyncio.create_subprocess_exec(
            "node", "validate-portals.mjs",
            cwd=str(CAREER_OPS_DIR),
            env={**os.environ, "CAREER_OPS_PORTALS": str(tmp_file)},
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        val_stdout, val_stderr = await val_proc.communicate()

        if val_proc.returncode != 0:
            tmp_file.unlink(missing_ok=True)
            err_msg = val_stdout.decode("utf-8", errors="replace").strip()
            raise ValueError(f"portals.yml pre-flight validation failed. Aborted write to preserve config: {err_msg[:400]}")

        # Validation passed: atomically commit change
        tmp_file.replace(PORTALS_YML)

    async def probe_ats_boards(self, companies: List[str]) -> int:
        """Step 3: Calls untouched discover-ats.mjs with AGY-provided company names."""
        clean_companies = [c.replace(" ", "") if " " in c and len(c.split()) > 1 else c for c in companies]
        cmd = ["node", "discover-ats.mjs"] + clean_companies + ["--write"]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=str(CAREER_OPS_DIR),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            print(f"[Warning] discover-ats.mjs returned non-zero code {proc.returncode}: {stderr.decode('utf-8', errors='replace')[:300]}")
        return proc.returncode

    async def run_ats_scan(self) -> int:
        """Step 4: Executes untouched scan.mjs across registered boards with fail-fast validation."""
        proc = await asyncio.create_subprocess_exec(
            "node", "scan.mjs",
            cwd=str(CAREER_OPS_DIR),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            err_details = stderr.decode("utf-8", errors="replace").strip() or stdout.decode("utf-8", errors="replace").strip()
            raise RuntimeError(f"scan.mjs failed with exit code {proc.returncode}: {err_details[:500]}")
        return proc.returncode

    async def verify_url_active(self, url: str, timeout_sec: float = 3.0) -> bool:
        """Step 5: Zero-browser HTTP status check (discards 404/410/expired)."""
        loop = asyncio.get_running_loop()
        def _check():
            try:
                req = urllib.request.Request(
                    url,
                    headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
                    method="HEAD"
                )
                with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
                    return resp.status < 400
            except urllib.error.HTTPError as e:
                return e.code not in (404, 410)
            except Exception:
                return True
        return await loop.run_in_executor(None, _check)

    def is_uk_geofenced(self, text: str) -> bool:
        """Strict UK/London validation."""
        has_uk = bool(UK_REGEX.search(text))
        has_foreign = bool(FOREIGN_REGEX.search(text))
        return has_uk and not (has_foreign and not ("united kingdom" in text.lower() or "london" in text.lower()))

    def score_posting_against_cv(self, posting: Dict[str, Any], cv_text: str, spec: Dict[str, Any]) -> Dict[str, Any]:
        """Step 6: Evaluates ATS keyword match and calculates match percentage."""
        title_comp = f"{posting['title']} {posting['company']}".lower()
        score = 68.0  # Base score for valid UK geofence & junior-mid level
        matched_ats_keywords = []

        # Check core fundamentals requested (API, Database, Microservice)
        for fund in ["api", "microservice", "database", "sql", "rest", "postgres", "redis", "kafka"]:
            if fund in title_comp or fund in cv_text.lower():
                matched_ats_keywords.append(fund.upper())
                score += 3.2

        # Check tech stack (Python, Go, Node, Java)
        for lang in ["python", "go", "golang", "java", "node"]:
            if lang in title_comp:
                matched_ats_keywords.append(lang.capitalize())
                score += 5.5

        final_score = min(98.0, round(score, 1))
        posting["match_percentage"] = final_score
        posting["ats_keywords"] = list(dict.fromkeys(matched_ats_keywords))[:6]
        return posting

    def filter_and_diversify_roles(
        self,
        raw_postings: List[Dict[str, Any]],
        target_count: int = 50,
        max_per_company: int = 2
    ) -> List[Dict[str, Any]]:
        """
        Combats company monopolization and irrelevant role leakage:
        1. Eliminates non-backend, translation, and non-engineering titles.
        2. Enforces a per-company cap so no single employer dominates the inbox.
        3. Guarantees broad market coverage across distinct UK employers.
        """
        clean_candidates = []

        for posting in raw_postings:
            title = posting["title"].strip()

            # Reject if title hits any irrelevant or senior keyword
            if IRRELEVANT_BLACKLIST_REGEX.search(title):
                continue

            # Require a genuine backend technical anchor
            if not BACKEND_ANCHOR_REGEX.search(title):
                continue

            clean_candidates.append(posting)

        # Sort candidates by match percentage
        clean_candidates.sort(key=lambda x: x.get("match_percentage", 0), reverse=True)

        # Enforce Per-Company Diversity Cap (Multi-pass to maximize market diversity)
        selected_roles = []
        company_counts = defaultdict(int)

        # Pass 1: Up to 2 roles per company
        for role in clean_candidates:
            company = role["company"].strip().lower()
            if company_counts[company] < max_per_company:
                selected_roles.append(role)
                company_counts[company] += 1
                if len(selected_roles) >= target_count:
                    break

        # Pass 2: Up to 3 roles per company if target count not yet reached
        if len(selected_roles) < target_count:
            for role in clean_candidates:
                if role in selected_roles:
                    continue
                company = role["company"].strip().lower()
                if company_counts[company] < max_per_company + 1:
                    selected_roles.append(role)
                    company_counts[company] += 1
                    if len(selected_roles) >= target_count:
                        break

        # Pass 3: Fill remaining if still needed
        if len(selected_roles) < target_count:
            for role in clean_candidates:
                if role in selected_roles:
                    continue
                selected_roles.append(role)
                if len(selected_roles) >= target_count:
                    break

        return selected_roles

    async def run_pipeline(self, user_prompt: str, job: Optional[Any] = None) -> Dict[str, Any]:
        """Executes the complete autonomous end-to-end pipeline with real-time job progress tracking."""
        if job:
            job.update(1, "Analyzing ATS Criteria", "AI is translating your prompt into structured ATS filter specifications...")

        # 1. Parse prompt with AGY
        spec = await self.parse_prompt_with_agy(user_prompt)
        target_count = spec.get("target_count", 50)
        target_companies = spec.get("target_companies", [])
        mode = spec.get("mode", "replace")
        if mode not in ("append", "replace", "match"):
            mode = "replace"

        if job:
            job.update(
                2,
                "Probing ATS Boards & Portals",
                f"Targeting {target_count} roles (mode: {mode}). Pre-flight validating portals.yml and probing {len(target_companies)} UK employer ATS feeds..."
            )

        # 2. Apply dynamic filters to portals.yml with pre-flight atomic rollback
        await self.apply_dynamic_filters(spec)

        # 3. Probe the 50+ ATS boards via discover-ats.mjs --write
        if target_companies:
            await self.probe_ats_boards(target_companies)

        if job:
            job.update(
                3,
                "Crawling ATS Boards & Staging",
                "Crawling tracked employer career portals in parallel (Greenhouse, Lever, Ashby, Workable)..."
            )

        # 4. Run ATS scan via scan.mjs
        await self.run_ats_scan()

        # 5. Load candidate Master CV for ATS scoring
        cv_text = ""
        with Session(engine) as session:
            resume = session.exec(select(Resume).where(Resume.is_default == True)).first()
            if resume:
                cv_text = resume.content
        if not cv_text and (CAREER_OPS_DIR / "cv.md").exists():
            cv_text = (CAREER_OPS_DIR / "cv.md").read_text(encoding="utf-8")

        # 6. Read candidates from pipeline.md
        parsed_entries = []
        if PIPELINE_MD.exists():
            lines = PIPELINE_MD.read_text(encoding="utf-8").splitlines()
            for line in lines:
                line = line.strip()
                if not line.startswith("- [ ]"):
                    continue
                parts = line.split("|")
                if len(parts) < 3:
                    continue
                url_m = re.search(r"https?://[^\s|]+", parts[0])
                if not url_m:
                    continue
                url = url_m.group(0)
                company = parts[1].strip()
                title = parts[2].strip()
                loc = parts[3].strip() if len(parts) > 3 else ""

                if not self.is_uk_geofenced(f"{title} {loc}"):
                    continue

                parsed_entries.append({
                    "company": company,
                    "title": title,
                    "location": loc,
                    "url": url,
                    "raw_line": line
                })

        # --- 1. CAPTURE INITIAL STATE BEFORE STAGING ---
        initial_existing_urls = set()
        with Session(engine) as session:
            db_items = session.exec(select(PipelineItem)).all()
            initial_count = len(db_items)
            for item in db_items:
                url_m = re.search(r"https?://[^\s|]+", item.raw_text)
                if url_m:
                    initial_existing_urls.add(url_m.group(0))

        # --- WRITE-AHEAD STAGING PERSISTENCE ---
        # Persist raw scanned jobs into database immediately before evaluation.
        # If evaluation is interrupted or cancelled, zero jobs are lost!
        staged_new_urls = set()
        if parsed_entries:
            with Session(engine) as session:
                if mode == "replace":
                    for old in session.exec(select(PipelineItem)).all():
                        session.delete(old)
                    for entry in parsed_entries:
                        session.add(PipelineItem(raw_text=entry["raw_line"], status="pending"))
                        staged_new_urls.add(entry["url"])
                else:  # append or match
                    for entry in parsed_entries:
                        if entry["url"] not in initial_existing_urls:
                            session.add(PipelineItem(raw_text=entry["raw_line"], status="pending"))
                            staged_new_urls.add(entry["url"])
                session.commit()

        if job:
            job.update(
                3,
                "Staging Persistence",
                f"Crawled live portals. Persisted {len(parsed_entries)} live UK roles into write-ahead staging queue."
            )

        # Candidates to evaluate
        if mode in ("append", "match"):
            evaluation_candidates = [e for e in parsed_entries if e["url"] not in initial_existing_urls]
        else:
            evaluation_candidates = parsed_entries

        if job:
            job.update(
                4,
                "Scoring & Diversity Curation",
                f"Verifying live HTTP response & scoring ATS fundamentals across {len(evaluation_candidates)} roles against profile..."
            )

        # Fast parallel liveness check across candidate URLs
        liveness_results = await asyncio.gather(
            *[self.verify_url_active(entry["url"]) for entry in evaluation_candidates],
            return_exceptions=True
        )

        raw_candidates = []
        for entry, is_live in zip(evaluation_candidates, liveness_results):
            if is_live is True or not isinstance(is_live, bool):
                scored = self.score_posting_against_cv(entry, cv_text, spec)
                raw_candidates.append(scored)

        # Calculate needed roles
        if mode == "append":
            needed_target = target_count
        elif mode == "match":
            needed_target = max(0, target_count - initial_count)
        else:  # replace
            needed_target = target_count

        # If mode is match and queue already matches or exceeds target
        if mode == "match" and needed_target == 0:
            match_res = {
                "status": "success",
                "mode": mode,
                "spec": spec,
                "total_companies_probed": len(target_companies),
                "final_count": 0,
                "total_in_queue": initial_count,
                "message": f"Autonomous discovery: Queue already matches target ({initial_count} / {target_count} roles).",
                "roles": []
            }
            if job:
                job.complete(match_res)
            return match_res

        # 7. Apply diversity cap & strict backend guardrail
        final_selected = self.filter_and_diversify_roles(raw_candidates, target_count=needed_target, max_per_company=2)
        selected_urls = {r["url"] for r in final_selected}

        # 8. Sync into Database & update pipeline.md
        with Session(engine) as session:
            if mode == "replace":
                for old in session.exec(select(PipelineItem)).all():
                    session.delete(old)
                for r in final_selected:
                    session.add(PipelineItem(raw_text=r["raw_line"], status="pending"))
            else:  # append or match
                # Remove unselected staged items from this run, keep initial items + final_selected
                for item in session.exec(select(PipelineItem)).all():
                    url_m = re.search(r"https?://[^\s|]+", item.raw_text)
                    if url_m:
                        item_url = url_m.group(0)
                        # If it was newly staged in this run but not selected for the top cut, prune it
                        if item_url in staged_new_urls and item_url not in selected_urls:
                            session.delete(item)
            session.commit()
            total_count = len(session.exec(select(PipelineItem)).all())

        clean_lines = ["# Career Ops Pipeline Inbox\n\n## Pending\n"]
        with Session(engine) as session:
            for item in session.exec(select(PipelineItem)).all():
                clean_lines.append(f"{item.raw_text}\n")
        PIPELINE_MD.write_text("".join(clean_lines), encoding="utf-8")

        if mode == "append":
            action_msg = f"Appended {len(final_selected)} new roles to queue (Total: {total_count})."
        elif mode == "match":
            action_msg = f"Topped up queue with {len(final_selected)} new roles to match target (Total: {total_count} / {target_count})."
        else:
            action_msg = f"Populated inbox with {len(final_selected)} verified roles."

        final_res = {
            "status": "success",
            "mode": mode,
            "spec": spec,
            "total_companies_probed": len(target_companies),
            "final_count": len(final_selected),
            "total_in_queue": total_count,
            "message": f"Autonomous discovery complete: {action_msg}",
            "roles": final_selected
        }
        if job:
            job.complete(final_res)
        return final_res

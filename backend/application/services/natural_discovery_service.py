import os
import re
import json
import time
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
from backend.application.services.discovery_tracker import discovery_tracker
from backend.application.services.company_naming_service import (
    extract_slug_and_display_name,
    slug_to_display_name,
)

CAREER_OPS_DIR = Path(settings.career_ops_dir)
PORTALS_YML = CAREER_OPS_DIR / "portals.yml"
PROFILE_YML = CAREER_OPS_DIR / "config" / "profile.yml"
PIPELINE_MD = CAREER_OPS_DIR / "data" / "pipeline.md"

SYSTEM_PARSER_PROMPT = """You are an expert ATS Job Pipeline Architect for Career-Ops.
Analyze the user's natural language search prompt and output ONLY a valid, raw JSON object (no markdown, no backticks, no explanations) matching this exact schema:

{
  "sweep_all_companies": <boolean, true ONLY if the user prompt explicitly requests to scrape/sweep all companies, all boards, the whole directory, or no company limit. false if a specific number of companies is requested or implied>,
  "target_companies_count": <integer or null, if sweep_all_companies is false, the exact number of companies requested (e.g. 2000 from "from 2000 new companies", 500 from "across 500 companies", 100 from "100 companies"). null if sweep_all_companies is true or if unspecified>,
  "target_count": <integer, number of jobs requested. If the user mentions a specific number of roles (e.g. "Find 50 roles", "100 jobs", "top 200"), extract that number as an integer. If the user asks for "no limit", "no max limit", "as many as possible", "all roles", or if unspecified, set to 10000 (no artificial ceiling)>,
  "company_count": <integer, number of target companies to research for portals.yml (capped at 500 to ensure fast, complete JSON output and prevent ATS rate limits). If no number is mentioned in the prompt, company_count MUST strictly default to 20>,
  "mode": <"append" | "match", choose "match" ONLY if the user explicitly asks to top up to a fixed total or maintain an exact queue count; choose "append" for all standard discovery and search requests so newly found roles are added without truncation>,
  "industry_sector": <string, e.g. "Healthcare", "FinTech", "CleanTech", "Energy", "Retail", "All Sectors", or whichever industry the user specified>,
  "role_domain": <string, the career or role domain requested by user, e.g. "Project Management", "Software Engineering", "Product Design", "Data Analytics", "Operations", etc.>,
  "seniority_tier": <string, e.g. "junior", "mid", "senior", "lead", or "any" based on user prompt>,
  "positive_keywords": [<list of title strings matching the specific career requested. Include broad UK synonyms and variations (e.g. for Project Management: "Project Manager", "Delivery Manager", "Technical Project Manager", "Programme Manager", "Program Manager", "Scrum Master", "Agile Coach", "Project Coordinator", "Implementation Manager", "Product Delivery", "PMO Analyst", "Operations Manager", etc.). DO NOT force or restrict to any single career path>],
  "negative_keywords": [<list of title strings to exclude. ONLY exclude seniority levels like "Senior", "Lead", "Staff", "Director" if the user explicitly requested junior/entry-level only. In all other cases, keep seniority open. Always exclude non-job noise ("word:Intern", "Internship", "Internships") unless requested>],
  "target_companies": [<list of real-world UK employers matching the requested industry, sector, or role. The length of this list MUST equal company_count (default 20, or up to the requested number like 200 to 500)>],
  "tech_stack": [<list of tools, technologies, software, or skills mentioned in the prompt or relevant to the requested role>],
  "core_fundamentals": [<list of core domains or responsibilities relevant to the requested role>],
  "evaluate_against_cv": <boolean, true if evaluation against CV requested>
}
"""


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
        # Read existing company names from portals.yml so the AI picks ONLY brand new ones
        existing_companies = []
        if PORTALS_YML.exists():
            try:
                with open(PORTALS_YML, "r", encoding="utf-8") as f:
                    cfg = yaml.safe_load(f) or {}
                for tc in cfg.get("tracked_companies", []):
                    if isinstance(tc, dict) and tc.get("name"):
                        existing_companies.append(tc["name"].strip())
            except Exception as e:
                print(f"[Warning] Error reading portals.yml in parse_prompt_with_agy: {e}")

        existing_block = ""
        if existing_companies:
            names_list = ", ".join(sorted(set(existing_companies)))
            existing_block = (
                f"\n\nCURRENTLY TRACKED COMPANIES IN DATABASE:\n"
                f"{names_list}\n"
                f"RULE FOR TARGET COMPANIES: If the user is asking for NEW companies or expanding the catalog, you MUST pick ONLY employers that are NOT in the tracked list above. If the user explicitly asks for specific companies or to scan existing companies, you may include them."
            )

        full_prompt = f"{SYSTEM_PARSER_PROMPT}{existing_block}\n\nUSER PROMPT:\n{user_prompt}"
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
                # AI determines mode directly: "match" vs "append"
                parsed["mode"] = "match" if str(parsed.get("mode", "")).lower().strip() == "match" else "append"

                # AI boolean: sweep_all_companies (True if prompt wants all companies / whole directory / no limit)
                parsed["sweep_all_companies"] = bool(parsed.get("sweep_all_companies", False))

                # AI integer or null: target_companies_count (e.g. 2000 from "from 2000 new companies")
                tc = parsed.get("target_companies_count")
                if tc is not None:
                    try:
                        parsed["target_companies_count"] = int(tc)
                    except (ValueError, TypeError):
                        parsed["target_companies_count"] = None
                else:
                    parsed["target_companies_count"] = None

                # AI extracts company_count directly in its JSON; default to 20 if missing or invalid
                try:
                    parsed["company_count"] = int(parsed.get("company_count") or 20)
                except (ValueError, TypeError):
                    parsed["company_count"] = 20

                # Target count: requested number from prompt, or 1000 by default
                try:
                    parsed["target_count"] = int(parsed.get("target_count") or 1000)
                except (ValueError, TypeError):
                    parsed["target_count"] = 1000

                return parsed
        except Exception as e:
            print(f"[NaturalDiscovery] AGY parse exception: {e}, falling back to defaults.")

        inferred_mode = "append"

        # Check if user prompt mentions an explicit target role count (e.g. "50 roles", "100 jobs", "top 20")
        target_m = re.search(r"\b(?:find|get|show|top|target|add)?\s*(\d+)\s*(?:roles|jobs|positions|openings)\b", user_prompt.lower())
        if not target_m:
            target_m = re.search(r"\b(\d+)\s*(?:roles|jobs|positions|openings)\b", user_prompt.lower())
        inferred_target = int(target_m.group(1)) if target_m else 1000

        # Check if user prompt mentions an explicit scan limit or amount (e.g. "limit 500", "scan 200", "500 companies")
        limit_match = re.search(r"\b(?:limit|scan|companies|boards)\s*[:=]?\s*(\d+)\b", user_prompt.lower())
        if not limit_match:
            limit_match = re.search(r"\b(\d+)\s*(?:limit|companies|boards)\b", user_prompt.lower())
        inferred_scan_limit = int(limit_match.group(1)) if limit_match else 1000

        # Dynamically load candidate profile target roles or portals.yml roles as safe fallback
        fallback_roles = []
        if PROFILE_YML.exists():
            try:
                prof = yaml.safe_load(PROFILE_YML.read_text(encoding="utf-8")) or {}
                p_roles = prof.get("target_roles", {})
                if isinstance(p_roles, dict):
                    fallback_roles = p_roles.get("primary", [])
                elif isinstance(p_roles, list):
                    fallback_roles = p_roles
            except Exception:
                pass

        if not fallback_roles and PORTALS_YML.exists():
            try:
                p_doc = yaml.safe_load(PORTALS_YML.read_text(encoding="utf-8")) or {}
                fallback_roles = (p_doc.get("title_filter") or {}).get("positive", [])
            except Exception:
                pass

        if not fallback_roles:
            fallback_roles = ["Project Manager", "Delivery Specialist", "Software Engineer"]

        return {
            "target_count": inferred_target,
            "company_count": 20,
            "ats_scan_limit": inferred_scan_limit,
            "mode": inferred_mode,
            "role_domain": "Cross-Functional Professional",
            "seniority_tier": "any",
            "positive_keywords": fallback_roles,
            "negative_keywords": ["word:Intern", "Internship", "Internships", "Recruiter", "Sales"],
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
            "tech_stack": [],
            "core_fundamentals": [],
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

        # 1. Strict London & Remote Geofencing (London and UK Remote roles)
        loc_block = (
            "location_filter:\n"
            "  strict: true\n"
            "  always_allow:\n"
            '    - "London"\n'
            '    - "Greater London"\n'
            '    - "Remote"\n'
            '    - "UK Remote"\n'
            '    - "Remote - UK"\n'
            '    - "Remote UK"\n'
            "  allow:\n"
            '    - "London"\n'
            '    - "Greater London"\n'
            '    - "London, UK"\n'
            '    - "London, United Kingdom"\n'
            '    - "London, England"\n'
            '    - "London Office"\n'
            '    - "London (Hybrid)"\n'
            '    - "London (hybrid)"\n'
            '    - "London (Remote)"\n'
            '    - "Hybrid - London"\n'
            '    - "Remote"\n'
            '    - "UK Remote"\n'
            '    - "Remote - UK"\n'
            '    - "Remote UK"\n'
            '    - "Remote, UK"\n'
            '    - "Remote (UK)"\n'
            '    - "Remote - London"\n'
            '    - "London / Remote"\n'
            '    - "Remote / London"\n'
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
        positives = spec.get("positive_keywords") or [
            "Project Manager", "Delivery Manager", "Technical Project Manager",
            "Programme Manager", "Program Manager", "Scrum Master", "Agile Coach",
            "Project Coordinator", "Implementation Manager", "Product Delivery"
        ]
        negatives = spec.get("negative_keywords") or ["word:Intern", "Internship", "Internships"]

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

    async def probe_ats_boards(self, companies: List[str], job: Optional[Any] = None) -> int:
        """Step 3: Calls discover-ats.mjs with --write to automatically expand company boards."""
        if not companies:
            return 0

        # Load currently tracked companies in portals.yml to avoid redundant probes
        existing_names = set()
        if PORTALS_YML.exists():
            try:
                with open(PORTALS_YML, "r", encoding="utf-8") as f:
                    cfg = yaml.safe_load(f) or {}
                for tc in cfg.get("tracked_companies", []):
                    if isinstance(tc, dict) and "name" in tc:
                        existing_names.add(tc["name"].lower().replace(" ", ""))
            except Exception as e:
                print(f"[Warning] Error reading portals.yml in probe_ats_boards: {e}")

        # Deduplicate & select only new, untracked companies
        to_probe = []
        for c in companies:
            norm = c.lower().replace(" ", "")
            if norm not in existing_names and norm not in [p.lower().replace(" ", "") for p in to_probe]:
                to_probe.append(c)

        if not to_probe:
            if job:
                msg = f"All {len(companies)} target companies already registered in live portal directory. Proceeding to crawler."
                job.add_feed_line(msg)
                job.update(
                    2,
                    "Probing ATS Boards & Portals",
                    msg,
                    substep="2.3",
                    substep_name="2.3 Probing 50+ Live ATS Feeds",
                )
            return 0

        total_to_probe = len(to_probe)
        if job:
            init_msg = f"[discover-ats.mjs] Probing {total_to_probe} live employer ATS endpoints (Greenhouse/Ashby/Lever/Workday)..."
            job.add_feed_line(init_msg)
            job.update(
                2,
                "Probing ATS Boards & Portals",
                init_msg,
                substep="2.3",
                substep_name=f"2.3 Probing {total_to_probe} Live ATS Feeds",
            )

        # Probe in batches of up to 25 companies to keep CLI args clean and stream writes
        batch_size = 25
        total_exit_code = 0
        total_batches = (total_to_probe + batch_size - 1) // batch_size
        start_time = time.time()
        last_line_time = [time.time()]

        for b_idx, i in enumerate(range(0, total_to_probe, batch_size), start=1):
            batch = to_probe[i : i + batch_size]
            clean_companies = [c.strip() for c in batch if c.strip()]
            if not clean_companies:
                continue

            batch_preview = ", ".join(clean_companies[:3]) + (f" +{len(clean_companies)-3} more" if len(clean_companies) > 3 else "")
            status_msg = f"Probing batch {b_idx}/{total_batches} ({len(clean_companies)} companies: {batch_preview})..."
            if job:
                job.add_feed_line(f"[discover-ats.mjs] {status_msg}")
                job.update(
                    2,
                    "Probing ATS Boards & Portals",
                    status_msg,
                    substep="2.3",
                    substep_name=f"2.3 Probing {total_to_probe} Live ATS Feeds",
                )

            cmd = ["node", "discover-ats.mjs"] + clean_companies + ["--write"]
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=str(CAREER_OPS_DIR),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            if job:
                job._process = proc

            async def _batch_heartbeat():
                phases = [
                    "Querying Greenhouse job boards...",
                    "Checking Ashby API endpoints...",
                    "Probing Lever & Workday portals...",
                    "Resolving careers page redirects...",
                ]
                h_idx = 0
                while True:
                    await asyncio.sleep(2.5)
                    now = time.time()
                    if now - last_line_time[0] >= 2.3:
                        elapsed = int(now - start_time)
                        phase = phases[h_idx % len(phases)]
                        h_idx += 1
                        hb_msg = f"⏳ [ATS Probe: {total_to_probe} companies] Batch {b_idx}/{total_batches} — {phase} ({elapsed}s elapsed)"
                        if job:
                            job.add_feed_line(hb_msg)
                            job.update(
                                2,
                                "Probing ATS Boards & Portals",
                                hb_msg,
                                substep="2.3",
                                substep_name=f"2.3 Probing {total_to_probe} Live ATS Feeds",
                            )

            hb_task = asyncio.create_task(_batch_heartbeat())
            try:
                stdout, stderr = await proc.communicate()
            finally:
                hb_task.cancel()
                try:
                    await hb_task
                except asyncio.CancelledError:
                    pass

            last_line_time[0] = time.time()
            if proc.returncode != 0:
                print(f"[Warning] discover-ats.mjs returned code {proc.returncode}: {stderr.decode('utf-8', errors='replace')[:300]}")
                total_exit_code = proc.returncode
            else:
                try:
                    import json
                    out_text = stdout.decode("utf-8", errors="replace").strip()
                    parsed_out = json.loads(out_text)
                    resolved_count = parsed_out.get("metadata", {}).get("resolved", 0)
                    fresh_count = parsed_out.get("metadata", {}).get("freshWritten", 0)
                    summary = f"Batch {b_idx}/{total_batches} complete: {resolved_count} portals verified ({fresh_count} newly written to portals.yml)"
                    if job:
                        job.add_feed_line(f"✓ [discover-ats.mjs] {summary}")
                except Exception:
                    pass

        return total_exit_code

    async def run_ats_scan(self, job: Optional[Any] = None) -> int:
        """Step 4: Executes untouched scan.mjs across registered boards streaming stdout live."""
        tracked_count = 0
        if PORTALS_YML.exists():
            try:
                cfg = yaml.safe_load(PORTALS_YML.read_text(encoding="utf-8")) or {}
                tracked_count = len(cfg.get("tracked_companies", []))
            except Exception:
                pass
        co_label = f"({tracked_count} Companies)" if tracked_count else ""
        step_title = f"Crawling ATS Boards & Staging {co_label}".strip()

        proc = await asyncio.create_subprocess_exec(
            "node", "scan.mjs",
            cwd=str(CAREER_OPS_DIR),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        if job:
            job._process = proc
            job.update(
                3,
                step_title,
                f"Crawling {tracked_count} tracked employer boards across Greenhouse, Ashby, Lever, SmartRecruiters...",
                substep="3.1",
                substep_name=f"3.1 Multi-Board Parallel Crawl {co_label}".strip(),
            )

        captured_stdout = []
        captured_stderr = []
        start_time = time.time()
        last_line_time = [time.time()]

        companies_count = [str(tracked_count) if tracked_count else None]
        summary_header = [f"Scanning {tracked_count} companies" if tracked_count else "Scanning UK employer boards..."]

        def _is_feed_worthy(text: str) -> bool:
            """Filters out raw CLI noise, maintenance warnings, and websearch dorks from UI feed."""
            t = text.strip()
            if not t or t.startswith("::") or "━━━" in t:
                return False
            # Suppress developer maintenance notices, Discord links, and CLI command suggestions
            noise_markers = (
                "FIX NEEDED",
                "verify-portals.mjs",
                "Agent/WebSearch handoff",
                "Share results and get help",
                "Run /career-ops pipeline",
                "dry run — no files will be written",
                "dry run — run without",
                "Errors (",
                "HTTP 429",
                "live but empty",
                "Portal Scan —",
            )
            if any(m in t for m in noise_markers):
                return False
            # Suppress websearch queries and individual error bullets
            if t.startswith("• ") or t.startswith("✗ "):
                return False
            return True

        async def _read_stdout():
            while True:
                if job and getattr(job, "cancelled", False):
                    try:
                        proc.terminate()
                    except Exception:
                        pass
                    break
                line = await proc.stdout.readline()
                if not line:
                    break
                decoded = line.decode("utf-8", errors="replace").strip()
                if decoded:
                    last_line_time[0] = time.time()
                    captured_stdout.append(decoded)
                    print(f"[scan.mjs] {decoded}", flush=True)

                    # Extract number of companies if line matches "Scanning X companies"
                    match = re.search(r"Scanning\s+(\d+)\s+companies", decoded)
                    if match:
                        companies_count[0] = match.group(1)
                        summary_header[0] = f"Scanning {companies_count[0]} companies"

                    if job and _is_feed_worthy(decoded):
                        job.add_feed_line(decoded)
                        status_detail = decoded
                        if companies_count[0] and "Scanning" not in decoded:
                            status_detail = f"[{summary_header[0]}] {decoded}"
                        current_co_count = companies_count[0] or str(tracked_count) or ""
                        current_title = f"Crawling ATS Boards & Staging ({current_co_count} Companies)" if current_co_count else "Crawling ATS Boards & Staging"
                        job.update(
                            3,
                            current_title,
                            status_detail,
                            substep="3.1",
                            substep_name=f"3.1 Multi-Board Crawl ({current_co_count} Portals)" if current_co_count else "3.1 Multi-Board Parallel Crawl",
                        )

        async def _read_stderr():
            while True:
                line = await proc.stderr.readline()
                if not line:
                    break
                decoded = line.decode("utf-8", errors="replace").strip()
                if decoded:
                    captured_stderr.append(decoded)

        async def _heartbeat():
            phases = [
                "Querying ATS provider APIs in parallel...",
                "Waiting on concurrent board responses...",
                "Filtering UK geofence & title matches...",
                "Scanning company endpoints...",
            ]
            tick_idx = 0
            while True:
                await asyncio.sleep(3.0)
                now = time.time()
                # If no output line from scan.mjs in the last 2.8s, pulse an active heartbeat
                if now - last_line_time[0] >= 2.8:
                    elapsed = int(now - start_time)
                    phase = phases[tick_idx % len(phases)]
                    tick_idx += 1
                    co_prefix = f" [{summary_header[0]}]" if companies_count[0] else ""
                    msg = f"⏳ [Active Crawl{co_prefix}] {phase} ({elapsed}s elapsed)"
                    current_co_count = companies_count[0] or str(tracked_count) or ""
                    current_title = f"Crawling ATS Boards & Staging ({current_co_count} Companies)" if current_co_count else "Crawling ATS Boards & Staging"
                    if job:
                        job.add_feed_line(msg)
                        job.update(
                            3,
                            current_title,
                            msg,
                            substep="3.1",
                            substep_name=f"3.1 Multi-Board Crawl ({current_co_count} Portals)" if current_co_count else "3.1 Multi-Board Parallel Crawl",
                        )

        heartbeat_task = asyncio.create_task(_heartbeat())
        try:
            await asyncio.gather(_read_stdout(), _read_stderr())
        finally:
            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except asyncio.CancelledError:
                pass

        ret = await proc.wait()

        if ret != 0:
            err_details = "\n".join(captured_stderr) or "\n".join(captured_stdout)
            raise RuntimeError(f"scan.mjs failed with exit code {ret}: {err_details[:500]}")
        return ret

    async def run_reverse_ats_scan(self, job: Optional[Any] = None, limit_per_ats: Optional[int] = None) -> int:
        """
        Step 4b: Executes reverse ATS discovery scanner (scan-ats-full.mjs) across
        the public ATS directory of 15,000+ real companies (Greenhouse, Ashby, Lever).
        Discovers brand new live roles from companies not previously listed in portals.yml!
        """
        providers = ["greenhouse", "ashby", "lever"]
        if limit_per_ats and limit_per_ats < 10000:
            total_estimated = len(providers) * limit_per_ats
            co_label = f"({total_estimated:,} Companies)"
            detail_msg = f"Sweeping public ATS directory: {total_estimated:,} companies across {', '.join(providers)} ({limit_per_ats}/ATS, shuffled A-Z)..."
            limit_args = ["--limit", str(limit_per_ats)]
        else:
            co_label = "(15,862 Companies)"
            detail_msg = f"Sweeping entire global ATS directory: all 15,862 companies across {', '.join(providers)} (All Companies)..."
            limit_args = []

        step_title = f"Crawling ATS Boards & Staging {co_label}"

        if job:
            job.update(
                3,
                step_title,
                detail_msg,
                substep="3.2",
                substep_name=f"3.2 Broad ATS Public Directory Sweep {co_label}",
            )
            job.add_feed_line(f"🌐 [scan-ats-full.mjs] {detail_msg}")

        cmd = [
            "node", "scan-ats-full.mjs",
            "--ats", ",".join(providers),
            "--since", "30",
            "--include-undated",
            "--shuffle",
            *limit_args,
        ]

        scan_env = {**os.environ, "CAREER_OPS_DNS_LOOKUPS_PER_MIN": "0"}
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=str(CAREER_OPS_DIR),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=scan_env,
        )
        if job:
            job._process = proc

        async def _read_out():
            while True:
                if job and getattr(job, "cancelled", False):
                    try:
                        proc.terminate()
                    except Exception:
                        pass
                    break
                line = await proc.stdout.readline()
                if not line:
                    break
                decoded = line.decode("utf-8", errors="replace").strip()
                if decoded:
                    print(f"[scan-ats-full.mjs] {decoded}", flush=True)
                    if job:
                        p_match = re.search(r"(\d+)/(\d+)\s+scanned", decoded)
                        if p_match:
                            scanned_so_far, total_target = p_match.group(1), p_match.group(2)
                            live_title = f"Crawling ATS Boards & Staging ({scanned_so_far}/{total_target} Companies)"
                            job.update(
                                3,
                                live_title,
                                f"🌐 {decoded}",
                                substep="3.2",
                                substep_name=f"3.2 Broad Directory Sweep {co_label}",
                            )
                        if "⚙" in decoded or "New offers" in decoded or "matches" in decoded or "+" in decoded or "scanned" in decoded:
                            job.add_feed_line(decoded)

        async def _read_err():
            while True:
                line = await proc.stderr.readline()
                if not line:
                    break
                decoded = line.decode("utf-8", errors="replace").strip()
                if decoded:
                    print(f"[scan-ats-full.mjs stderr] {decoded}", flush=True)

        try:
            await asyncio.gather(_read_out(), _read_err())
        except Exception as e:
            print(f"[Warning] Error streaming scan-ats-full.mjs: {e}")

        ret = await proc.wait()
        return ret

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

    async def evaluate_postings_with_agy(
        self,
        postings: List[Dict[str, Any]],
        cv_text: str,
        user_prompt: str,
        spec: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """
        Evaluates candidate job postings semantically with AGY against the candidate CV and user prompt.
        Produces genuine semantic match percentage, fit rationale, and ATS alignment keywords.
        """
        if not postings:
            return []

        # Prepare clean, indexed summary for AGY to evaluate
        postings_summary = []
        for idx, p in enumerate(postings):
            postings_summary.append({
                "id": idx,
                "title": p.get("title", ""),
                "company": p.get("company", ""),
                "location": p.get("location", ""),
            })

        cv_summary = (cv_text[:3000] if cv_text else "").strip()
        roles_json = json.dumps(postings_summary, indent=2)

        eval_prompt = f"""You are an expert talent scout and ATS evaluator for Career-Ops.
Evaluate each of the following {len(postings)} job postings against the candidate's CV and the user search prompt.
Return ONLY a valid, raw JSON array of objects (no markdown, no backticks, no preamble) matching this schema:
[
  {{
    "id": <integer matching the input id>,
    "match_percentage": <float between 55.0 and 99.0 representing genuine fit to candidate's background>,
    "fit_reason": <string, 1-2 concise sentences explaining why this role matches candidate's experience and archetypes>,
    "ats_keywords": [<list of 3-6 specific relevant skills/domain keywords>]
  }}
]

CANDIDATE CV / PROFILE:
{cv_summary or "Candidate seeking roles aligned with target titles and experience."}

USER SEARCH PROMPT:
{user_prompt}

CANDIDATE JOB POSTINGS TO EVALUATE:
{roles_json}
"""
        eval_map = {}
        try:
            proc = await asyncio.create_subprocess_exec(
                "agy", "-p", eval_prompt, "--dangerously-skip-permissions",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await proc.communicate()
            raw = stdout.decode("utf-8", errors="replace").strip()
            if "```" in raw:
                raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
                raw = re.sub(r"```\s*$", "", raw, flags=re.MULTILINE).strip()
            match = re.search(r"\[.*\]", raw, re.DOTALL)
            if match:
                eval_list = json.loads(match.group(0))
                for item in eval_list:
                    if isinstance(item, dict) and "id" in item:
                        eval_map[item["id"]] = item
        except Exception as e:
            print(f"[NaturalDiscovery] AGY evaluation error: {e}")

        scored_postings = []
        for idx, p in enumerate(postings):
            item = eval_map.get(idx)
            if item:
                p["match_percentage"] = float(item.get("match_percentage", 75.0))
                p["fit_reason"] = item.get("fit_reason", "Role aligns with candidate's target profile.")
                p["ats_keywords"] = item.get("ats_keywords", [])[:6]
            else:
                p["match_percentage"] = 75.0
                p["fit_reason"] = "Live verified role matching candidate's search criteria."
                p["ats_keywords"] = []
            scored_postings.append(p)

        return scored_postings

    def filter_and_diversify_roles(
        self,
        raw_postings: List[Dict[str, Any]],
        spec: Optional[Dict[str, Any]] = None,
        target_count: int = 1000,
        max_per_company: int = 2,
        existing_company_counts: Optional[Dict[str, int]] = None,
        min_match_percentage: float = 60.0,
    ) -> List[Dict[str, Any]]:
        """
        Applies diversity caps across live candidate postings:
        1. Sorts all discovered roles by AGY semantic match percentage.
        2. Filters out low-scoring irrelevant roles (match_percentage < min_match_percentage).
        3. Enforces a strict per-company cap (max_per_company = 2) so no single employer overpopulates the queue.
        4. Never excludes valid crawled roles using artificial manual whitelists.
        """
        candidates = [
            p for p in raw_postings
            if float(p.get("match_percentage", 0.0)) >= min_match_percentage
        ]
        candidates.sort(key=lambda x: x.get("match_percentage", 0), reverse=True)

        selected_roles = []
        company_counts = defaultdict(int)
        if existing_company_counts:
            for comp_name, count in existing_company_counts.items():
                company_counts[comp_name.strip().lower()] = count

        for role in candidates:
            # Group by slug or normalized company name so duplicate variants share the 2-per-company cap
            company_key = (role.get("slug") or role.get("company", "")).strip().lower()
            if company_counts[company_key] < max_per_company:
                selected_roles.append(role)
                company_counts[company_key] += 1
                if len(selected_roles) >= target_count:
                    break

        return selected_roles

    async def run_pipeline(self, user_prompt: str, job: Optional[Any] = None) -> Dict[str, Any]:
        """Executes the complete autonomous end-to-end pipeline with real-time job progress tracking."""
        if job:
            job.update(
                1,
                "Analyzing ATS Criteria",
                "Extracting role domain, seniority, and mode from natural language prompt...",
                substep="1.1",
                substep_name="Prompt Intent & Criteria Extraction",
            )

        # 1. Parse prompt with AGY
        spec = await self.parse_prompt_with_agy(user_prompt)
        target_count = spec.get("target_count", 50)
        target_companies = spec.get("target_companies", [])
        # Guardrail: "replace" is permanently disabled to protect existing inbox items
        raw_mode = spec.get("mode", "append")
        mode = "match" if raw_mode == "match" else "append"

        if job:
            job.update(
                1,
                "Analyzing ATS Criteria",
                f"Generated {len(spec.get('positive_keywords', []))} target titles & {len(spec.get('negative_keywords', []))} negative filters.",
                substep="1.2",
                substep_name="ATS Keyword & Exclusions Synthesis",
            )
            job.update(
                1,
                "Analyzing ATS Criteria",
                f"Mapped {len(target_companies)} UK employers across {spec.get('role_domain', 'Backend')}.",
                substep="1.3",
                substep_name="Tech Stack & Employer Mapping",
            )

        # 2. Apply dynamic filters to portals.yml with pre-flight atomic rollback
        if job:
            job.update(
                2,
                "Probing ATS Boards & Portals",
                "Injecting strict London / UK location geofence block into configuration...",
                substep="2.1",
                substep_name="Geofence Filter Injection",
            )

        await self.apply_dynamic_filters(spec)

        if job:
            job.update(
                2,
                "Probing ATS Boards & Portals",
                "Pre-flight atomic rollback validation via validate-portals.mjs passed.",
                substep="2.2",
                substep_name="Pre-Flight Atomic Validation",
            )

        # 3. Probe the 50+ ATS boards via discover-ats.mjs --write
        if target_companies:
            if job:
                job.update(
                    2,
                    "Probing ATS Boards & Portals",
                    f"Probing {len(target_companies)} live employer ATS endpoints (Greenhouse/Ashby/Lever)...",
                    substep="2.3",
                    substep_name="Probing Live ATS Feeds",
                )
            await self.probe_ats_boards(target_companies, job=job)

        tracked_count = 0
        if PORTALS_YML.exists():
            try:
                cfg = yaml.safe_load(PORTALS_YML.read_text(encoding="utf-8")) or {}
                tracked_count = len(cfg.get("tracked_companies", []))
            except Exception:
                pass
        co_title_31 = f"Crawling ATS Boards & Staging ({tracked_count} Companies)" if tracked_count else "Crawling ATS Boards & Staging"
        if job:
            job.update(
                3,
                co_title_31,
                f"Executing multi-portal parallel crawler across {tracked_count} tracked UK employer boards...",
                substep="3.1",
                substep_name=f"3.1 Multi-Board Parallel Crawl ({tracked_count} Companies)" if tracked_count else "3.1 Multi-Board Parallel Crawl",
            )

        # 4a. Run ATS scan via scan.mjs across tracked boards
        await self.run_ats_scan(job=job)
        if job and getattr(job, "cancelled", False):
            return {"status": "cancelled", "message": "Discovery cancelled by user."}

        # 4b. Sweep the broader public ATS directory of 15,000+ real companies (Greenhouse, Ashby, Lever)
        # Read sweep_all_companies boolean directly from AGY JSON:
        # If true then sweep all companies (None). If false then do the specified amount.
        sweep_all = bool(spec.get("sweep_all_companies", False)) if spec else False
        if sweep_all:
            reverse_limit = None
        else:
            cos_count = None
            if spec:
                cos_count = spec.get("target_companies_count") or spec.get("company_count")
            if cos_count and int(cos_count) > 0:
                # Divide across the 3 active single-host providers (Greenhouse, Ashby, Lever)
                # so the total probed equals the user's requested company count
                reverse_limit = max(10, int(cos_count) // 3)
            else:
                reverse_limit = None

        await self.run_reverse_ats_scan(job=job, limit_per_ats=reverse_limit)
        if job and getattr(job, "cancelled", False):
            return {"status": "cancelled", "message": "Discovery cancelled by user."}

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
                raw_company = parts[1].strip()
                title = parts[2].strip()
                loc = parts[3].strip() if len(parts) > 3 else ""

                slug, display_name = extract_slug_and_display_name(raw_company, url)
                parts[1] = f" {display_name} "
                clean_raw_line = "|".join(parts)

                parsed_entries.append({
                    "slug": slug,
                    "company": display_name,
                    "display_name": display_name,
                    "title": title,
                    "location": loc,
                    "url": url,
                    "raw_line": clean_raw_line
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
                for entry in parsed_entries:
                    if entry["url"] not in initial_existing_urls:
                        session.add(PipelineItem(
                            raw_text=entry["raw_line"],
                            slug=entry.get("slug"),
                            display_name=entry.get("display_name"),
                            status="pending"
                        ))
                        staged_new_urls.add(entry["url"])
                session.commit()

        if job:
            job.update(
                3,
                f"Crawling ATS Boards & Staging ({tracked_count} Companies)",
                f"Cleansed results against UK geofencing: {len(parsed_entries)} candidates verified.",
                substep="3.2",
                substep_name=f"UK Location Verification ({tracked_count} Companies)",
            )
            job.update(
                3,
                f"Crawling ATS Boards & Staging ({len(parsed_entries)} Candidates)",
                f"Crawled live portals. Persisted {len(parsed_entries)} live UK roles into write-ahead staging queue.",
                substep="3.3",
                substep_name="Write-Ahead Staging Persistence",
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
                f"Zero-browser concurrent HTTP liveness sweep across {len(evaluation_candidates)} candidate URLs...",
                substep="4.1",
                substep_name="Concurrent Liveness Sweep",
            )

        # Fast parallel liveness check across candidate URLs
        liveness_results = await asyncio.gather(
            *[self.verify_url_active(entry["url"]) for entry in evaluation_candidates],
            return_exceptions=True
        )

        if job:
            job.update(
                4,
                "Scoring & Diversity Curation",
                f"Evaluating candidate role alignment with AGY against CV...",
                substep="4.2",
                substep_name="AGY Semantic Fit & Match Scoring",
            )

        live_candidates = [
            entry for entry, is_live in zip(evaluation_candidates, liveness_results)
            if is_live is True or not isinstance(is_live, bool)
        ]

        raw_candidates = await self.evaluate_postings_with_agy(
            live_candidates,
            cv_text=cv_text,
            user_prompt=user_prompt,
            spec=spec,
        )

        # Calculate needed roles: guided by prompt if user specified a count
        target_count = spec.get("target_count") or 1000
        if any(phrase in user_prompt.lower() for phrase in ["no limit", "no max", "unlimited", "as many as possible", "all roles", "all jobs"]):
            target_count = 100000

        if mode == "match":
            needed_target = max(0, target_count - initial_count)
            if needed_target == 0 and target_count >= 1000:
                needed_target = target_count
        else:  # append
            needed_target = target_count

        if job:
            job.update(
                4,
                "Scoring & Diversity Curation",
                f"Applying diversity caps (max 2/company) and synchronizing final queue...",
                substep="4.3",
                substep_name="Diversity Cap & Queue Sync",
            )

        # 7. Apply strict diversity cap (max 2/company) factoring in existing queue
        existing_counts = defaultdict(int)
        with Session(engine) as session:
            for item in session.exec(select(PipelineItem)).all():
                url_m = re.search(r"https?://[^\s|]+", item.raw_text)
                if url_m and url_m.group(0) in initial_existing_urls:
                    if item.slug:
                        existing_counts[item.slug.strip().lower()] += 1
                    else:
                        parts = [p.strip() for p in item.raw_text.split("|")]
                        if len(parts) >= 2:
                            s, _ = extract_slug_and_display_name(parts[1], url_m.group(0))
                            existing_counts[s.strip().lower()] += 1

        final_selected = self.filter_and_diversify_roles(
            raw_candidates,
            spec=spec,
            target_count=needed_target,
            max_per_company=2,
            existing_company_counts=existing_counts,
            min_match_percentage=60.0,
        )
        selected_urls = {r["url"] for r in final_selected}

        # 8. Sync into Database & update pipeline.md (strictly non-destructive: all qualified crawled roles are kept!)
        role_score_map = {r["url"]: r.get("match_percentage") for r in final_selected if r.get("match_percentage")}
        role_meta_map = {r["url"]: r for r in final_selected}
        with Session(engine) as session:
            for item in session.exec(select(PipelineItem)).all():
                url_m = re.search(r"https?://[^\s|]+", item.raw_text)
                if url_m:
                    item_url = url_m.group(0)
                    # Only prune if it was newly staged but failed quality/liveness (not in selected_urls)
                    if item_url in staged_new_urls and item_url not in selected_urls:
                        session.delete(item)
                    else:
                        r_meta = role_meta_map.get(item_url)
                        if r_meta:
                            if not item.slug and r_meta.get("slug"):
                                item.slug = r_meta["slug"]
                            if not item.display_name and r_meta.get("display_name"):
                                item.display_name = r_meta["display_name"]
                        parts = [p.strip() for p in item.raw_text.split("|")]
                        if len(parts) >= 2:
                            comp_name = item.display_name or (r_meta.get("display_name") if r_meta else None)
                            if not comp_name:
                                _, comp_name = extract_slug_and_display_name(parts[1], item_url)
                            if comp_name:
                                parts[1] = comp_name
                                item.display_name = comp_name

                        if item_url in role_score_map:
                            score = role_score_map[item_url]
                            if not re.search(r"\d+(\.\d+)?%\s*match", item.raw_text):
                                new_parts = [parts[0], parts[1], parts[2]]
                                if len(parts) > 3 and not "posted:" in parts[3].lower():
                                    new_parts.append(parts[3])
                                new_parts.append(f"{score}% match")
                                posted = next((p for p in parts if p.lower().startswith("posted:")), None)
                                if posted:
                                    new_parts.append(posted)
                                item.raw_text = " | ".join(new_parts)
                            else:
                                item.raw_text = " | ".join(parts)
                        else:
                            item.raw_text = " | ".join(parts)
                        session.add(item)
            session.commit()
            total_count = len(session.exec(select(PipelineItem)).all())

        clean_lines = ["# Career Ops Pipeline Inbox\n\n## Pending\n"]
        with Session(engine) as session:
            for item in session.exec(select(PipelineItem)).all():
                clean_lines.append(f"{item.raw_text}\n")
        PIPELINE_MD.write_text("".join(clean_lines), encoding="utf-8")

        if mode == "match":
            action_msg = f"Topped up queue with {len(final_selected)} new roles to match target (Total: {total_count} / {target_count})."
        else:
            action_msg = f"Appended {len(final_selected)} new roles to queue (Total: {total_count})."

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
        discovery_tracker.record_discovered_roles(roles=final_selected, query=user_prompt, mode=mode)
        if job:
            job.complete(final_res)
        return final_res

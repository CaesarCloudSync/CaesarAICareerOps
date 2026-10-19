import re
import asyncio
from pathlib import Path
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
import yaml
from sqlmodel import Session, select

from backend.application.settings import settings
from backend.application.database import engine
from backend.application.models import (
    DiscoverySettings,
    CandidateProfileData,
    DiscoverJobsRequest,
    ExpandCompaniesRequest,
    PipelineItem,
    Profile,
)
from backend.application.services.scanner_service import ScannerService
from backend.application.services.natural_discovery_service import NaturalDiscoveryService
from backend.application.services.discovery_tracker import discovery_tracker, DiscoveryJob
from backend.application.dependencies import get_scanner_service

router = APIRouter(prefix="/api/settings", tags=["Settings & Discovery"])

CAREER_OPS_DIR = Path(settings.career_ops_dir)
PORTALS_YML = CAREER_OPS_DIR / "portals.yml"
PROFILE_YML = CAREER_OPS_DIR / "config" / "profile.yml"
PIPELINE_MD = CAREER_OPS_DIR / "data" / "pipeline.md"
SCAN_HISTORY_TSV = CAREER_OPS_DIR / "data" / "scan-history.tsv"

CJK_OR_FOREIGN_REGEX = re.compile(
    r"[\u4e00-\u9fa5]|[\u3040-\u30ff]|[\uac00-\ud7af]|mokahr|bytedance|deepseek|tencent|meituan",
    re.IGNORECASE,
)


@router.get("/discovery", response_model=DiscoverySettings)
async def get_discovery_settings() -> DiscoverySettings:
    """Retrieve structured discovery settings (UK geo-fence, target roles, location lists)."""
    current = DiscoverySettings()

    if PORTALS_YML.exists():
        try:
            with open(PORTALS_YML, "r", encoding="utf-8") as f:
                doc = yaml.safe_load(f) or {}

            loc_filter = doc.get("location_filter") or {}
            current.uk_only = loc_filter.get("strict", True)
            if "always_allow" in loc_filter and isinstance(loc_filter["always_allow"], list):
                current.always_allow_locations = loc_filter["always_allow"]
            if "allow" in loc_filter and isinstance(loc_filter["allow"], list):
                current.allowed_locations = loc_filter["allow"]
            if "block_hard" in loc_filter and isinstance(loc_filter["block_hard"], list):
                current.blocked_locations = loc_filter["block_hard"]

            title_filter = doc.get("title_filter") or {}
            pos = title_filter.get("positive")
            if pos and isinstance(pos, list):
                # prioritize candidate relevant roles
                roles = [p for p in pos if isinstance(p, str) and not p.startswith("KI") and not p.startswith("Dozent")]
                if roles:
                    current.target_roles = roles[:15]
            neg = title_filter.get("negative")
            if neg and isinstance(neg, list):
                current.negative_keywords = [n for n in neg if isinstance(n, str)][:10]
        except Exception as e:
            print("Error parsing portals.yml for discovery settings:", e)

    return current


@router.post("/discovery")
async def save_discovery_settings(payload: DiscoverySettings):
    """Safely update discovery settings without manual YAML editing or risk of corruption."""
    if not PORTALS_YML.exists():
        raise HTTPException(status_code=404, detail="portals.yml not found")

    try:
        content = PORTALS_YML.read_text(encoding="utf-8")

        # Construct clean location_filter block
        always_allow_yaml = "\n".join([f'    - "{loc}"' for loc in payload.always_allow_locations])
        allow_yaml = "\n".join([f'    - "{loc}"' for loc in payload.allowed_locations])
        block_hard_yaml = "\n".join([f'    - "{loc}"' for loc in payload.blocked_locations])

        new_loc_block = (
            "location_filter:\n"
            f"  strict: {str(payload.uk_only).lower()}\n"
            "  always_allow:\n"
            f"{always_allow_yaml}\n"
            "  allow:\n"
            f"{allow_yaml}\n"
            "  block_hard:\n"
            f"{block_hard_yaml}"
        )

        # Regex replace location_filter block safely
        loc_pattern = re.compile(r"location_filter:\s*\n(?:[ \t]+[^\n]+\n)+", re.MULTILINE)
        if loc_pattern.search(content):
            content = loc_pattern.sub(new_loc_block + "\n", content, count=1)

        # Update target roles in positive title filter
        pos_roles_yaml = "\n".join([f'    - "{role}"' for role in payload.target_roles])
        target_marker = re.compile(
            r"(# -- Project & Delivery Management \(Candidate CV Target Roles\) --\n)(?:[ \t]+- [^\n]+\n)+",
            re.MULTILINE,
        )
        if target_marker.search(content):
            content = target_marker.sub(r"\1" + pos_roles_yaml + "\n", content, count=1)

        PORTALS_YML.write_text(content, encoding="utf-8")
        return {"status": "success", "message": "Discovery settings updated cleanly!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update discovery settings: {str(e)}")


@router.get("/profile", response_model=CandidateProfileData)
async def get_candidate_profile() -> CandidateProfileData:
    """Retrieve candidate profile as structured data for frontend visual form."""
    data = CandidateProfileData()

    if PROFILE_YML.exists():
        try:
            with open(PROFILE_YML, "r", encoding="utf-8") as f:
                p = yaml.safe_load(f) or {}

            cand = p.get("candidate") or {}
            if "full_name" in cand: data.full_name = cand["full_name"]
            if "title" in cand: data.title = cand["title"]
            if "email" in cand: data.email = cand["email"]
            if "phone" in cand: data.phone = cand["phone"]
            if "location" in cand: data.location = cand["location"]

            loc = p.get("location") or {}
            if "country" in loc: data.country = loc["country"]
            if "city" in loc: data.city = loc["city"]
            if "visa_status" in loc: data.visa_status = loc["visa_status"]

            narrative = p.get("narrative") or {}
            if "headline" in narrative: data.headline = narrative["headline"]
            if "exit_story" in narrative: data.exit_story = narrative["exit_story"]
            if "superpowers" in narrative and isinstance(narrative["superpowers"], list):
                data.superpowers = narrative["superpowers"]

            target_roles = p.get("target_roles") or {}
            primary = target_roles.get("primary")
            if primary and isinstance(primary, list):
                data.target_roles = primary

            comp = p.get("compensation") or {}
            if "target_range" in comp: data.salary_target = comp["target_range"]
            if "minimum" in comp: data.salary_min = comp["minimum"]

        except Exception as e:
            print("Error loading profile.yml:", e)

    return data


@router.post("/profile")
async def save_candidate_profile(payload: CandidateProfileData):
    """Save candidate profile from frontend visual form into structured format."""
    structured = {
        "candidate": {
            "full_name": payload.full_name,
            "title": payload.title,
            "email": payload.email,
            "phone": payload.phone,
            "location": payload.location,
            "linkedin": "",
            "portfolio_url": "",
            "github": "",
            "twitter": "",
            "photo": "",
            "photo_style": "rounded",
        },
        "target_roles": {
            "primary": payload.target_roles,
            "archetypes": [{"name": r, "level": "Mid-Senior", "fit": "primary"} for r in payload.target_roles],
        },
        "narrative": {
            "headline": payload.headline,
            "exit_story": payload.exit_story,
            "superpowers": payload.superpowers,
            "proof_points": [],
        },
        "compensation": {
            "target_range": payload.salary_target,
            "currency": "GBP",
            "minimum": payload.salary_min,
            "location_flexibility": "Hybrid / On-site / Remote as applicable",
        },
        "location": {
            "country": payload.country,
            "city": payload.city,
            "timezone": "GMT/BST",
            "visa_status": payload.visa_status,
            "authorized_in": ["United Kingdom"],
            "needs_sponsorship": False,
        },
        "language": {"output": "en"},
        "spend_tier": "standard",
        "cv": {"output_format": "html"},
    }

    yaml_str = yaml.dump(structured, sort_keys=False, allow_unicode=True)

    # Save to database
    with Session(engine) as session:
        statement = select(Profile).where(Profile.name == "default").limit(1)
        db_prof = session.exec(statement).first()
        if db_prof:
            db_prof.content = yaml_str
            session.add(db_prof)
        else:
            session.add(Profile(name="default", content=yaml_str))
        session.commit()

    # Save to file cleanly
    PROFILE_YML.parent.mkdir(parents=True, exist_ok=True)
    PROFILE_YML.write_text(yaml_str, encoding="utf-8")

    return {"status": "success", "message": "Candidate profile saved cleanly!"}


UK_POSITIVE_REGEX = re.compile(
    r"\b(london|greater london|united kingdom|uk|great britain|england|scotland|wales|enfield|manchester|birmingham|leeds|bristol|cambridge|oxford|edinburgh|glasgow)\b",
    re.IGNORECASE,
)
FOREIGN_NEGATIVE_REGEX = re.compile(
    r"\b(poland|polska|kraków|warszawa|wrocław|poznan|spain|españa|madrid|barcelona|france|paris|germany|deutschland|berlin|münchen|usa|united states|san francisco|california|new york|australia|melbourne|sydney|canada|toronto|greece|argentina|brazil|india|singapore|japan|china|beijing|shanghai)\b",
    re.IGNORECASE,
)

CLOSURE_PATTERNS = [
    re.compile(r"no longer available", re.I),
    re.compile(r"position has been filled", re.I),
    re.compile(r"this job has expired", re.I),
    re.compile(r"no longer accepting applications", re.I),
    re.compile(r"this (?:job|role|position) is closed", re.I),
    re.compile(r"job not found", re.I),
    re.compile(r"applications? (?:have |are |is )?closed", re.I),
]

UK_PRESET_COMPANIES = {
    "engineering": ["Arup", "Mott MacDonald", "Babcock", "Dyson", "Rolls-Royce", "Balfour Beatty", "WSP", "AtkinsRéalis"],
    "energy": ["Octopus Energy", "OVO Energy", "Centrica", "National Grid", "EDF Energy", "SSE", "Tokamak Energy"],
    "clean energy": ["Octopus Energy", "OVO Energy", "Tokamak Energy", "First Light Fusion", "Zenobe Energy"],
    "fusion": ["Tokamak Energy", "First Light Fusion", "UKAEA"],
    "healthcare": ["Bupa", "HCA Healthcare", "HealthHero", "Doctor Care Anywhere", "Babylon Health"],
    "fintech": ["Monzo", "Revolut", "Deliveroo", "Wise", "Starling Bank", "OakNorth", "Checkout.com", "GoCardless"],
    "consulting": ["PA Consulting", "Capgemini", "KPMG UK", "PwC UK", "Deloitte UK", "Turner & Townsend"],
    "aerospace": ["Rolls-Royce", "Airbus UK", "BAE Systems", "Reaction Engines"],
    "defence": ["BAE Systems", "QinetiQ", "Babcock International", "Thales UK"],
    "ai": ["DeepMind", "Stability AI", "Synthesia", "Faculty AI", "Wayve"],
    "construction": ["Mace", "Balfour Beatty", "Laing O'Rourke", "Kier Group"],
}


def is_valid_uk_job(text: str) -> bool:
    has_uk = bool(UK_POSITIVE_REGEX.search(text))
    has_foreign = bool(FOREIGN_NEGATIVE_REGEX.search(text))
    has_cjk = bool(CJK_OR_FOREIGN_REGEX.search(text))
    if has_cjk:
        return False
    if not has_uk:
        return False
    if has_foreign and not ("united kingdom" in text.lower() or "london" in text.lower()):
        return False
    return True


async def check_url_active_fast(url: str, timeout_sec: float = 5.0) -> bool:
    """
    Zero-browser, high-speed HTTP liveness test.
    Checks employer ATS endpoints and response status directly without Playwright.
    """
    if not url or not url.startswith("http"):
        return False

    loop = asyncio.get_running_loop()

    # Tier 1: Specialized ATS direct endpoint check
    gh_match = re.search(r"greenhouse\.io/([^/]+)/jobs/(\d+)", url)
    if gh_match:
        board, job_id = gh_match.group(1), gh_match.group(2)
        api_url = f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{job_id}"
        def _check_gh():
            try:
                import urllib.request
                import urllib.error
                req = urllib.request.Request(api_url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
                with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
                    return resp.status == 200
            except urllib.error.HTTPError as e:
                return e.code not in (404, 410)
            except Exception:
                return True
        return await loop.run_in_executor(None, _check_gh)

    lever_match = re.search(r"jobs\.lever\.co/([^/]+)/([a-f0-9-]+)", url)
    if lever_match:
        company, job_id = lever_match.group(1), lever_match.group(2)
        api_url = f"https://api.lever.co/v0/postings/{company}/{job_id}"
        def _check_lever():
            try:
                import urllib.request
                import urllib.error
                req = urllib.request.Request(api_url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
                with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
                    return resp.status == 200
            except urllib.error.HTTPError as e:
                return e.code not in (404, 410)
            except Exception:
                return True
        return await loop.run_in_executor(None, _check_lever)

    # Tier 2: Universal HTTP fallback check
    def _check_universal():
        try:
            import urllib.request
            import urllib.error
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
            )
            with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
                if resp.status in (404, 410):
                    return False
                final_url = resp.geturl().lower()
                if "error=true" in final_url or "job-not-found" in final_url or "expired" in final_url:
                    return False
                body_chunk = resp.read(40000).decode("utf-8", errors="ignore")
                for pat in CLOSURE_PATTERNS:
                    if pat.search(body_chunk):
                        return False
                return True
        except urllib.error.HTTPError as e:
            if e.code in (404, 410):
                return False
            return True
        except Exception:
            return True

    return await loop.run_in_executor(None, _check_universal)


@router.post("/purge-foreign")
async def purge_foreign_and_chinese_postings():
    """Immediately remove all non-UK postings from the inbox."""
    deleted_count = 0
    with Session(engine) as session:
        items = session.exec(select(PipelineItem)).all()
        for item in items:
            if not is_valid_uk_job(item.raw_text):
                session.delete(item)
                deleted_count += 1
        session.commit()

    if PIPELINE_MD.exists():
        lines = PIPELINE_MD.read_text(encoding="utf-8").splitlines()
        clean_lines = []
        for l in lines:
            if not l.strip() or l.startswith("#") or l.lower().startswith("paste job"):
                clean_lines.append(l)
                continue
            if is_valid_uk_job(l):
                clean_lines.append(l)
        PIPELINE_MD.write_text("\n".join(clean_lines) + "\n", encoding="utf-8")

    return {
        "status": "success",
        "purged_count": deleted_count,
        "message": f"Successfully removed {deleted_count} non-UK postings.",
    }


@router.post("/verify-inbox-liveness")
async def verify_inbox_liveness():
    """
    Zero-browser API liveness sweep across the current pipeline inbox.
    Checks ATS endpoints and discards expired/404 postings without Playwright.
    """
    expired_count = 0
    with Session(engine) as session:
        items = session.exec(select(PipelineItem)).all()
        for item in items:
            url_match = re.search(r"https?://[^\s|]+", item.raw_text)
            if url_match:
                url = url_match.group(0)
                is_live = await check_url_active_fast(url)
                if not is_live:
                    session.delete(item)
                    expired_count += 1
        session.commit()

    return {
        "status": "success",
        "expired_purged": expired_count,
        "message": f"Liveness check complete: Discarded {expired_count} closed/expired postings.",
    }


@router.post("/reset-pipeline")
async def reset_pipeline_inbox():
    """Clear all items in the pipeline inbox so you can start fresh."""
    deleted_count = 0
    with Session(engine) as session:
        items = session.exec(select(PipelineItem)).all()
        deleted_count = len(items)
        for item in items:
            session.delete(item)
        session.commit()

    if PIPELINE_MD.exists():
        PIPELINE_MD.write_text("# Career Ops Pipeline Inbox\n\n", encoding="utf-8")

    if SCAN_HISTORY_TSV.exists():
        header = "url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation\tfingerprint\tposted_at\ttrust_score\ttrust_flags\tnormalized_company\trequisition_id\tlanguage\n"
        SCAN_HISTORY_TSV.write_text(header, encoding="utf-8")

    return {
        "status": "success",
        "deleted_count": deleted_count,
        "message": f"Pipeline inbox reset. Cleared {deleted_count} items and purged scan history.",
    }


@router.post("/expand-companies")
async def expand_companies_and_scan(
    payload: ExpandCompaniesRequest,
    scanner: ScannerService = Depends(get_scanner_service),
):
    """
    Uses Natural Language to select real UK companies, calls Career-Ops discover-ats.mjs
    to resolve their official ATS feeds into portals.yml, then runs a UK scan.
    """
    # 1. Gather target company names based on query
    target_companies = []
    q_lower = payload.query_or_sector.lower()

    if payload.companies:
        target_companies.extend(payload.companies)
    else:
        # Check if the query has comma-separated company names (e.g. "Octopus Energy, Revolut, Dyson")
        if "," in payload.query_or_sector:
            for part in payload.query_or_sector.split(","):
                part_clean = part.strip()
                if part_clean:
                    target_companies.append(part_clean)

        # Match sector keywords against known UK industry presets
        for sector, names in UK_PRESET_COMPANIES.items():
            if sector in q_lower:
                target_companies.extend(names)

        # If still empty, check if input itself is a specific company name (e.g. "Tokamak Energy" or "Monzo")
        if not target_companies:
            cleaned = payload.query_or_sector.strip()
            if len(cleaned.split()) <= 4:
                target_companies.append(cleaned)
            else:
                target_companies = ["Arup", "Mott MacDonald", "Octopus Energy", "Dyson", "Monzo", "Deliveroo", "Bupa"]

    # Deduplicate while preserving order
    target_companies = list(dict.fromkeys(target_companies))[:15]

    # 2. Invoke Career-Ops's built-in discover-ats.mjs as an untouched CLI tool
    cmd = ["node", "discover-ats.mjs"] + target_companies + ["--write"]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=str(CAREER_OPS_DIR),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    resolve_out = stdout.decode("utf-8", errors="replace")

    # 3. Run the scan across all configured company ATS feeds
    await scanner.run_scan(verify=False)

    # 4. Cleanse to UK only and run fast liveness check
    await purge_foreign_and_chinese_postings()

    # 5. Sync to database
    added_count = 0
    with Session(engine) as session:
        existing_texts = set(session.exec(select(PipelineItem.raw_text)).all())
        if PIPELINE_MD.exists():
            for line in PIPELINE_MD.read_text(encoding="utf-8").splitlines():
                cl = line.strip()
                if (
                    cl
                    and not cl.startswith("#")
                    and not cl.lower().startswith("paste job")
                    and cl not in existing_texts
                    and is_valid_uk_job(cl)
                ):
                    session.add(PipelineItem(raw_text=cl, status="pending"))
                    existing_texts.add(cl)
                    added_count += 1
            session.commit()

    return {
        "status": "success",
        "companies_probed": target_companies,
        "new_postings_added": added_count,
        "message": f"Probed {len(target_companies)} UK employers. Discovered & added {added_count} live London postings.",
    }


async def _execute_discovery_job(job: DiscoveryJob, payload: DiscoverJobsRequest):
    try:
        query = (payload.natural_language_query or "").strip()
        if not query:
            # Construct broad query using Target Role Titles & Candidate Archetypes (pigeonholes)
            target_roles = []
            archetypes = []
            if PORTALS_YML.exists():
                try:
                    with open(PORTALS_YML, "r", encoding="utf-8") as f:
                        cfg = yaml.safe_load(f) or {}
                    target_roles = (cfg.get("title_filter") or {}).get("positive") or []
                except Exception:
                    pass

            profile_path = CAREER_OPS_DIR / "config" / "profile.yml"
            if profile_path.exists():
                try:
                    with open(profile_path, "r", encoding="utf-8") as f:
                        prof = yaml.safe_load(f) or {}
                    p_roles = prof.get("target_roles") or {}
                    if isinstance(p_roles, dict):
                        primary = p_roles.get("primary") or []
                        target_roles.extend([r for r in primary if r not in target_roles])
                        arch_list = p_roles.get("archetypes") or []
                        for a in arch_list:
                            if isinstance(a, dict) and a.get("name"):
                                archetypes.append(a.get("name"))
                except Exception:
                    pass

            roles_str = ", ".join(target_roles[:12]) if target_roles else "Software Engineer, Backend Engineer, Platform Engineer, API Engineer"
            arch_str = f" Target archetypes and pigeonholes: {', '.join(archetypes[:6])}." if archetypes else ""
            query = f"Find 50 live roles in London and UK matching candidate CV and target role titles: {roles_str}.{arch_str} Strictly UK only."

        service = NaturalDiscoveryService()
        await service.run_pipeline(query, job=job)
    except Exception as e:
        job.fail(str(e))


@router.get("/discover/active")
async def get_active_discovery_job():
    """Returns currently running or recently completed discovery job for refresh resilience."""
    active_job = discovery_tracker.get_active_job()
    if active_job:
        return {"active": True, "job": active_job.to_dict()}
    return {"active": False, "job": None}


@router.get("/discover/status/{job_id}")
async def get_discovery_job_status(job_id: str):
    """Poll live progress, step name, and elapsed seconds for a specific discovery job."""
    job = discovery_tracker.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Discovery job not found")
    return {"status": "success", "job": job.to_dict()}


@router.post("/discover/cancel/{job_id}")
async def cancel_discovery_job(job_id: str):
    """Gracefully cancel a running discovery job."""
    job = discovery_tracker.cancel_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Discovery job '{job_id}' not found.")
    return {
        "status": "success",
        "job_id": job.job_id,
        "message": "Discovery job cancelled.",
        "job": job.to_dict(),
    }


@router.post("/discover")
async def discover_jobs(
    payload: DiscoverJobsRequest,
    sync: bool = False,
):
    """
    Run targeted job discovery using user's CV or natural language query,
    enforcing strict UK / London pigeonhole.
    Runs asynchronously with persistent job tracking by default.
    """
    job = discovery_tracker.create_job(query=payload.natural_language_query)

    if sync:
        await _execute_discovery_job(job, payload)
        if job.status == "failed":
            return JSONResponse(
                status_code=500,
                content={"status": "error", "message": job.error, "job": job.to_dict()}
            )
        return {
            "status": "success",
            "message": job.detail,
            "job": job.to_dict(),
            **(job.result or {})
        }

    # Run in background task decoupled from HTTP connection
    asyncio.create_task(_execute_discovery_job(job, payload))

    return {
        "status": "started",
        "job_id": job.job_id,
        "message": "Autonomous discovery started in background.",
        "job": job.to_dict()
    }

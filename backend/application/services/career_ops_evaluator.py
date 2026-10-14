import re
import json
import asyncio
from datetime import date
from pathlib import Path
from typing import Dict, Any, Optional

from backend.application.settings import settings
from backend.application.repository.base import BaseRepository
from backend.application.models import ApplicationCreate, JobEvalResponse


class CareerOpsEvaluatorService:
    """
    Evaluator service orchestrating CLI and API LLM engines.
    Integrates with BaseRepository for clean data decoupling.
    """

    def __init__(self, repository: BaseRepository):
        self.repo = repository
        self.career_ops_dir = Path(settings.career_ops_dir)

    async def run_command_async(self, command: str) -> Dict[str, Any]:
        process = await asyncio.create_subprocess_shell(
            command,
            cwd=str(self.career_ops_dir),
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()
        return {
            "exit_code": process.returncode,
            "stdout": stdout.decode("utf-8", errors="replace"),
            "stderr": stderr.decode("utf-8", errors="replace")
        }

    async def evaluate_job(self, jd_input: str, engine: str = "agy") -> JobEvalResponse:
        # Step 1: Pre-fetch if URL
        is_url = bool(re.match(r"^https?://", jd_input.strip()))
        jd_text = jd_input.strip()

        if is_url:
            fetch_cmd = f'node fetch-jd.mjs "{jd_input.strip()}"'
            fetch_res = await self.run_command_async(fetch_cmd)
            if fetch_res["exit_code"] == 0 and fetch_res["stdout"].strip():
                jd_text = fetch_res["stdout"].strip()

        # Step 2: Load CV from repository
        cv_text = await self.repo.get_cv()

        # Step 3: Targeted prompt
        if engine == "gemini-api":
            escaped_input = jd_input.replace('"', '\\"')
            cmd = f'node gemini-eval.mjs "{escaped_input}"'
        else:
            prompt = self._build_prompt(cv_text, jd_text)
            eval_prompt_file = self.career_ops_dir / ".current_eval_prompt.txt"
            eval_prompt_file.write_text(prompt, encoding="utf-8")

            if engine == "claude":
                cmd = 'claude -p "$(cat .current_eval_prompt.txt)"'
            elif engine == "codex":
                cmd = 'codex exec "$(cat .current_eval_prompt.txt)"'
            else:
                cmd = 'agy -p "$(cat .current_eval_prompt.txt)" --dangerously-skip-permissions'

        res = await self.run_command_async(cmd)

        eval_prompt_file = self.career_ops_dir / ".current_eval_prompt.txt"
        if eval_prompt_file.exists():
            eval_prompt_file.unlink()

        report_filename = None
        if res["exit_code"] == 0 and res["stdout"].strip():
            report_filename = await self._save_results(res["stdout"], jd_input)

        return JobEvalResponse(
            exit_code=res["exit_code"],
            stdout=res["stdout"],
            stderr=res["stderr"],
            report_filename=report_filename
        )

    async def evaluate_job_stream(self, jd_input: str, engine: str = "agy"):
        is_url = bool(re.match(r"^https?://", jd_input.strip()))
        jd_text = jd_input.strip()

        if is_url:
            yield f"data: {json.dumps({'type': 'status', 'message': '🔍 Step 1/4: Scraping job posting via ATS fetcher...'})}\n\n"
            fetch_cmd = f'node fetch-jd.mjs "{jd_input.strip()}"'
            fetch_res = await self.run_command_async(fetch_cmd)
            if fetch_res["exit_code"] == 0 and fetch_res["stdout"].strip():
                jd_text = fetch_res["stdout"].strip()
                yield f"data: {json.dumps({'type': 'status', 'message': '✅ Step 2/4: Job description extracted successfully.'})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'status', 'message': '⚠️ Direct scrape failed, evaluating with raw input...'})}\n\n"
        else:
            yield f"data: {json.dumps({'type': 'status', 'message': '📝 Step 1/4: Analyzing input job description text...'})}\n\n"

        yield f"data: {json.dumps({'type': 'status', 'message': '📄 Step 3/4: Loading candidate Master CV from repository...'})}\n\n"
        cv_text = await self.repo.get_cv()

        if engine == "gemini-api":
            escaped_input = jd_input.replace('"', '\\"')
            cmd = f'node gemini-eval.mjs "{escaped_input}"'
        else:
            prompt = self._build_prompt(cv_text, jd_text)
            eval_prompt_file = self.career_ops_dir / ".current_eval_prompt.txt"
            eval_prompt_file.write_text(prompt, encoding="utf-8")

            if engine == "claude":
                cmd = 'claude -p "$(cat .current_eval_prompt.txt)"'
            elif engine == "codex":
                cmd = 'codex exec "$(cat .current_eval_prompt.txt)"'
            else:
                cmd = 'agy -p "$(cat .current_eval_prompt.txt)" --dangerously-skip-permissions'

        yield f"data: {json.dumps({'type': 'status', 'message': f'🚀 Step 4/4: Streaming {engine.upper()} 7-Block generation in real time...'})}\n\n"

        proc = await asyncio.create_subprocess_shell(
            cmd,
            cwd=str(self.career_ops_dir),
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        full_stdout = []
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            text_chunk = line.decode("utf-8", errors="replace")
            full_stdout.append(text_chunk)
            yield f"data: {json.dumps({'type': 'chunk', 'text': text_chunk})}\n\n"

        await proc.wait()
        stderr = (await proc.stderr.read()).decode("utf-8", errors="replace")
        complete_output = "".join(full_stdout)

        eval_prompt_file = self.career_ops_dir / ".current_eval_prompt.txt"
        if eval_prompt_file.exists():
            eval_prompt_file.unlink()

        saved_filename = None
        if proc.returncode == 0 and complete_output.strip():
            saved_filename = await self._save_results(complete_output, jd_input)

        yield f"data: {json.dumps({'type': 'done', 'exit_code': proc.returncode, 'report_filename': saved_filename, 'stderr': stderr})}\n\n"

    def _build_prompt(self, cv_text: str, jd_text: str) -> str:
        return (
            "You are Career-Ops Job Evaluator. Evaluate this Job Description against the Candidate CV.\n\n"
            "=== CANDIDATE CV ===\n"
            f"{cv_text[:3500]}\n\n"
            "=== JOB DESCRIPTION ===\n"
            f"{jd_text[:4000]}\n\n"
            "INSTRUCTIONS:\n"
            "Output the full 7-Block CareerOps Markdown Report directly:\n"
            "# [Company] - [Role Title] Evaluation\n"
            "**Fit Score**: [Score]/5.0\n"
            "**Verdict**: [Strong Match / Good Match / Stretch / Skip]\n\n"
            "## Block A: Role Overview & Company Mission\n"
            "## Block B: Candidate Fit Analysis & Skill Alignment\n"
            "## Block C: Skill & Experience Gaps\n"
            "## Block D: Tailored Application Strategy\n"
            "## Block E: Tailored Resume Bullet Points (Action-Metric-Impact)\n"
            "## Block F: Compelling Cover Letter Draft\n"
            "## Block G: Interview Questions & Suggested Preparation\n\n"
            "Do not inspect repo files or run terminal tools. Output the markdown evaluation directly."
        )

    async def _save_results(self, output_text: str, jd_input: str) -> Optional[str]:
        try:
            lines = [l.strip() for l in output_text.splitlines() if l.strip()]
            if not lines:
                return None

            first_heading = next((l for l in lines if l.startswith("#")), "Company - Role")
            heading_clean = first_heading.lstrip("#").replace("Evaluation Report:", "").replace("Evaluation:", "").strip()
            parts = re.split(r"[-—–:]", heading_clean, maxsplit=1)
            company = parts[0].strip() if len(parts) > 0 else "Unknown"
            role = parts[1].strip() if len(parts) > 1 else heading_clean

            score_match = re.search(r"(\d+(?:\.\d+)?)\s*/\s*5", output_text)
            score = float(score_match.group(1)) if score_match else 4.0

            reports = await self.repo.get_reports()
            nums = []
            for r in reports:
                m = re.match(r"^(\d+)-", r.filename)
                if m:
                    nums.append(int(m.group(1)))
            next_num = max(nums) + 1 if nums else 1
            num_str = f"{next_num:03d}"

            today_str = date.today().isoformat()
            safe_company = re.sub(r"[^a-zA-Z0-9]+", "-", company).strip("-").lower() or "job"
            filename = f"{num_str}-{safe_company}-{today_str}.md"

            # Save report
            await self.repo.save_report(filename, output_text)

            # Create tracker entry
            await self.repo.create_application(ApplicationCreate(
                company=company,
                role=role,
                score=score,
                status="Evaluated",
                date_applied=today_str,
                url=jd_input if jd_input.startswith("http") else "",
                report_path=f"reports/{filename}",
                notes="Auto-evaluated via CaesarAICareerOps"
            ))

            return filename
        except Exception:
            return None

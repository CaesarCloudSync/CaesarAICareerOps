import asyncio
from pathlib import Path
from typing import Dict, Any, Optional
from backend.application.settings import settings


class PdfGeneratorService:
    def __init__(self):
        self.career_ops_dir = Path(settings.career_ops_dir)

    async def generate_pdf(self, report_filename: str) -> Dict[str, Any]:
        cmd = f'node generate-pdf.mjs --report "reports/{report_filename}"'
        proc = await asyncio.create_subprocess_shell(
            cmd,
            cwd=str(self.career_ops_dir),
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        return {
            "exit_code": proc.returncode,
            "stdout": stdout.decode("utf-8", errors="replace"),
            "stderr": stderr.decode("utf-8", errors="replace")
        }

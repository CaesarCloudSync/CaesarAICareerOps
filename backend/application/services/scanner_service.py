import asyncio
from pathlib import Path
from typing import Dict, Any, Optional
from backend.application.settings import settings


class ScannerService:
    def __init__(self):
        self.career_ops_dir = Path(settings.career_ops_dir)

    async def run_scan(self, verify: bool = False) -> Dict[str, Any]:
        cmd = "node scan.mjs --verify" if verify else "node scan.mjs"
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

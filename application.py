#!/usr/bin/env python3
"""
CaesarAICareerOps — Launcher
Runs the local Web Co-Pilot on http://127.0.0.1:8000
"""

import os
import sys
import uvicorn
from pathlib import Path

# Add project root to sys.path and ensure current working directory is project root
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))
os.chdir(BASE_DIR)


def ensure_frontend_built():
    """Checks if frontend/src is newer than frontend/dist and triggers a build automatically."""
    frontend_dir = BASE_DIR / "frontend"
    dist_index = frontend_dir / "dist" / "index.html"
    src_dir = frontend_dir / "src"

    needs_build = False
    if not dist_index.exists():
        needs_build = True
    elif src_dir.exists():
        dist_mtime = dist_index.stat().st_mtime
        for p in src_dir.rglob("*"):
            if p.is_file() and p.stat().st_mtime > dist_mtime:
                needs_build = True
                break

    if needs_build:
        print("⚡ Changes detected in frontend/src. Compiling frontend bundle...")
        import subprocess
        try:
            subprocess.run(["npm", "run", "build"], cwd=str(frontend_dir), check=True)
            print("✓ Frontend compiled cleanly into frontend/dist.")
        except Exception as e:
            print(f"⚠️ Frontend auto-build warning: {e}")


def main():
    ensure_frontend_built()
    host = os.getenv("HOST", "0.0.0.0" if os.getenv("ENVIRONMENT") == "docker" or os.getenv("DOCKER") else "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    reload = os.getenv("RELOAD", "true").lower() in ("true", "1", "yes")

    print("==========================================================")
    print("🚀 Launching CaesarAICareerOps (FastAPI + React)")
    print("==========================================================")
    print(f"Dashboard available at: http://{host}:{port}")
    print(f"API documentation at:   http://{host}:{port}/docs")
    print(f"Health check at:        http://{host}:{port}/api/health")
    print("Press Ctrl+C to stop the server.")
    print("==========================================================")

    reload_dirs = [str(BASE_DIR / "backend" / "application")] if reload else None
    uvicorn.run("backend.application.main:app", host=host, port=port, reload=reload, reload_dirs=reload_dirs)


if __name__ == "__main__":
    main()

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


def main():
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

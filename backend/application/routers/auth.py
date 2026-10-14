import os
import re
import asyncio
import subprocess
from typing import Optional, Dict
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# Active OAuth login process reference
_active_oauth_proc: Optional[asyncio.subprocess.Process] = None
_active_oauth_url: Optional[str] = None


class SubmitCodeRequest(BaseModel):
    code: str


@router.get("/agy/status")
async def get_agy_status():
    """Check if agy CLI is installed and currently authenticated."""
    # Check if agy binary exists
    which_cmd = "which agy"
    proc = await asyncio.create_subprocess_shell(
        which_cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, _ = await proc.communicate()
    if proc.returncode != 0:
        return {
            "installed": False,
            "authenticated": False,
            "version": None,
            "message": "agy CLI not found in PATH"
        }

    agy_path = stdout.decode().strip()

    # Check authentication with a fast test prompt
    test_cmd = "agy -p 'status check' --dangerously-skip-permissions --print-timeout 5s"
    test_proc = await asyncio.create_subprocess_shell(
        test_cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    t_out, t_err = await test_proc.communicate()
    output_str = (t_out + t_err).decode(errors="replace")

    is_authenticated = test_proc.returncode == 0 and "authentication required" not in output_str.lower()

    # Get version
    v_proc = await asyncio.create_subprocess_shell("agy --version", stdout=asyncio.subprocess.PIPE)
    v_out, _ = await v_proc.communicate()
    version = v_out.decode().strip() or "unknown"

    return {
        "installed": True,
        "authenticated": is_authenticated,
        "path": agy_path,
        "version": version,
        "message": "Authenticated and ready" if is_authenticated else "Authentication required"
    }


@router.post("/agy/login-terminal")
async def launch_terminal_login():
    """Launch an interactive terminal on the desktop running `agy` OAuth login."""
    terminal_cmds = [
        ["gnome-terminal", "--", "bash", "-c", "echo '🔑 Antigravity CLI Login'; agy; echo 'Press Enter to close'; read"],
        ["x-terminal-emulator", "-e", "bash -c 'echo 🔑 Antigravity CLI Login; agy; read'"],
        ["xterm", "-e", "bash -c 'agy; read'"]
    ]

    launched = False
    for cmd in terminal_cmds:
        try:
            subprocess.Popen(cmd, start_new_session=True)
            launched = True
            break
        except FileNotFoundError:
            continue
        except Exception:
            continue

    if not launched:
        raise HTTPException(
            status_code=500,
            detail="Could not launch terminal emulator automatically. Run 'agy' directly in your terminal."
        )

    return {
        "status": "launched",
        "message": "Terminal opened. Follow the on-screen OAuth instructions in the terminal."
    }


@router.post("/agy/start-oauth")
async def start_oauth_flow():
    """Start agy in OAuth mode and return the Google OAuth authorization URL."""
    global _active_oauth_proc, _active_oauth_url

    # Check first if agy is already authenticated
    current_status = await get_agy_status()
    if current_status.get("authenticated"):
        return {
            "already_authenticated": True,
            "message": "AGY is already authenticated and ready!"
        }

    # Terminate previous if running
    if _active_oauth_proc and _active_oauth_proc.returncode is None:
        try:
            _active_oauth_proc.terminate()
        except Exception:
            pass

    _active_oauth_url = None

    # Start agy in a session that triggers auth prompt
    cmd = "agy -p 'login' --dangerously-skip-permissions"
    _active_oauth_proc = await asyncio.create_subprocess_shell(
        cmd,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT
    )

    auth_url = None
    start_time = asyncio.get_event_loop().time()

    # Read output until URL is found or timeout (10 seconds)
    while asyncio.get_event_loop().time() - start_time < 10:
        try:
            line_bytes = await asyncio.wait_for(_active_oauth_proc.stdout.readline(), timeout=1.5)
            if not line_bytes:
                break
            line = line_bytes.decode(errors="replace")
            # Match Google OAuth URL
            url_match = re.search(r"(https://accounts\.google\.com/o/oauth2/auth[^\s]+)", line)
            if url_match:
                auth_url = url_match.group(1).strip()
                _active_oauth_url = auth_url
                break
            if "hello" in line.lower() or _active_oauth_proc.returncode == 0:
                # Already authenticated!
                return {
                    "already_authenticated": True,
                    "message": "AGY is already authenticated!"
                }
        except asyncio.TimeoutError:
            continue

    if not auth_url:
        # Fallback check if it was already authenticated
        if _active_oauth_proc.returncode == 0:
            return {"already_authenticated": True, "message": "AGY is already authenticated!"}
        return {
            "already_authenticated": False,
            "auth_url": None,
            "message": "AGY is ready. Use 'Launch Terminal' to complete login interactively."
        }

    # Automatically try opening the browser on host if desktop is active
    try:
        subprocess.Popen(["xdg-open", auth_url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass

    return {
        "already_authenticated": False,
        "auth_url": auth_url,
        "message": "OAuth URL generated. Visit the link to authorize."
    }


@router.post("/agy/submit-code")
async def submit_oauth_code(payload: SubmitCodeRequest):
    """Submit Google authorization code to the waiting agy process."""
    global _active_oauth_proc

    if not _active_oauth_proc or _active_oauth_proc.returncode is not None:
        raise HTTPException(
            status_code=400,
            detail="No active authentication process waiting for code. Please start login again."
        )

    code = payload.code.strip()
    try:
        _active_oauth_proc.stdin.write(f"{code}\n".encode())
        await _active_oauth_proc.stdin.drain()

        # Wait for completion
        stdout, _ = await asyncio.wait_for(_active_oauth_proc.communicate(), timeout=15)
        output = stdout.decode(errors="replace")

        if "fail" in output.lower() or "error" in output.lower():
            return {
                "success": False,
                "output": output,
                "message": "Authentication failed. Please verify the code and try again."
            }

        return {
            "success": True,
            "output": output,
            "message": "Successfully authenticated with Google Antigravity!"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to submit authorization code: {str(e)}")

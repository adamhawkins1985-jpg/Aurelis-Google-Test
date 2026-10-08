"""Opt-in OneKey CLI *status-only* reader for isolated staging.

No pairing, login, export, signing, key material, or transaction commands.
Staging defaults to disconnected. Do not point this at production credentials.
"""
import json
import os
import subprocess
from pathlib import Path


def read_onekey_status(cli_path=None, *, runner=None):
    unavailable = {"authenticated": False, "authStatus": "unauthenticated"}
    if not cli_path:
        return unavailable
    path = Path(cli_path)
    # Explicit per-deploy staging-only allowlist, never /opt/aurelis.
    permitted = Path("/home/aurelisdeploy/aurelis-staging/onekey-cli")
    if path != permitted or not path.is_file():
        return unavailable
    run = runner or subprocess.run
    try:
        completed = run([str(path), "--json", "auth", "status"],
                        capture_output=True, text=True, timeout=5, check=False)
        if completed.returncode != 0 or len(completed.stdout) > 32768:
            return unavailable
        payload = json.loads(completed.stdout)
        if not isinstance(payload, dict) or not isinstance(payload.get("data"), dict):
            return unavailable
        data = payload["data"]
        # Never propagate raw CLI output, CLI errors, session tokens or key data.
        return {"authenticated": data.get("authStatus") == "authenticated",
                "authStatus": data.get("authStatus"),
                "displayAddress": data.get("displayAddress"),
                "walletKind": data.get("walletKind")}
    except (OSError, ValueError, TypeError, subprocess.TimeoutExpired):
        return unavailable


def staging_status():
    return read_onekey_status(os.environ.get("AURELIS_STAGING_ONEKEY_CLI"))

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any, Dict

ONEKEY = Path("/opt/aurelis/arbitrage/onekey-cli/node_modules/@onekeyfe/cli/bin/onekey")

def onekey_status() -> Dict[str, Any]:
    base = {
        "available": ONEKEY.exists(),
        "authenticated": False,
        "authStatus": "unavailable",
        "loginMethod": None,
        "walletKind": None,
        "displayAddress": None,
        "storageBackend": None,
        "hasSecrets": False,
    }
    if not ONEKEY.exists():
        return base
    try:
        proc = subprocess.run(
            [str(ONEKEY), "--json", "auth", "status"],
            capture_output=True,
            text=True,
            timeout=8,
            check=False,
        )
        if proc.returncode != 0:
            base["authStatus"] = "error"
            base["error"] = "onekey_auth_status_failed"
            return base
        payload = json.loads(proc.stdout.strip())
        data = payload.get("data") or {}
        base.update({
            "authStatus": data.get("authStatus") or "unknown",
            "authenticated": data.get("authStatus") == "authenticated",
            "loginMethod": data.get("loginMethod"),
            "walletKind": data.get("walletKind"),
            "displayAddress": data.get("displayAddress"),
            "storageBackend": data.get("storageBackend"),
            "hasSecrets": bool(data.get("hasSecrets")),
        })
        return base
    except Exception as exc:
        base["authStatus"] = "error"
        base["error"] = type(exc).__name__
        return base

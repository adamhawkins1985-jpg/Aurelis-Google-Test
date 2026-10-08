from pathlib import Path
import base64, json, time, tomllib
import requests, ccxt
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

ROOT = Path("/opt/aurelis/arbitrage")
LEGACY_ENV = Path("/home/ubuntu/_archive/aurelis-web-app-legacy-20260929/.env")
TOOBIT_CFG = Path("/home/ubuntu/.toobit/config.toml")

def read_env(path):
    out = {}
    if not path.exists():
        return out
    for line in path.read_text(errors="ignore").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out

new = read_env(ROOT / ".env")
legacy = read_env(LEGACY_ENV)

def result(name, ok, detail=""):
    print(f"{name}: {'READY' if ok else 'NOT READY'}" + (f" | {detail}" if detail else ""))

# Kraken
try:
    ex = ccxt.kraken({
        "apiKey": legacy.get("KRAKEN_API_KEY", ""),
        "secret": legacy.get("KRAKEN_API_SECRET", ""),
        "enableRateLimit": True,
        "timeout": 15000,
    })
    ex.fetch_balance()
    result("Kraken", True, "authenticated")
except Exception as e:
    result("Kraken", False, type(e).__name__)

# Toobit
try:
    raw = tomllib.loads(TOOBIT_CFG.read_text())
    profile_name = raw.get("default_profile", "default")
    profile = (raw.get("profiles") or {}).get(profile_name) or {}
    ex = ccxt.toobit({
        "apiKey": profile.get("api_key", ""),
        "secret": profile.get("secret_key", ""),
        "enableRateLimit": True,
        "timeout": 15000,
    })
    ex.fetch_balance()
    result("Toobit", True, "authenticated")
except Exception as e:
    result("Toobit", False, type(e).__name__)

# OKX US
try:
    ex = ccxt.okx({
        "apiKey": new.get("OKX_API_KEY", ""),
        "secret": new.get("OKX_API_SECRET", ""),
        "password": new.get("OKX_API_PASSPHRASE", ""),
        "hostname": "us.okx.com",
        "enableRateLimit": True,
        "timeout": 15000,
    })
    ex.fetch_balance()
    result("OKX US", True, "authenticated")
except Exception as e:
    result("OKX US", False, type(e).__name__)

# Kalshi Perps
try:
    key_id = legacy.get("AURELIS_KALSHI_API_KEY_ID", "")
    key_path = Path(legacy.get("AURELIS_KALSHI_PRIVATE_KEY_PATH", ""))
    private_key = serialization.load_pem_private_key(key_path.read_bytes(), password=None)
    method = "GET"
    path = "/trade-api/v2/margin/enabled"
    ts = str(int(time.time() * 1000))
    presign = (ts + method + path).encode()
    signature = private_key.sign(
        presign,
        padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.DIGEST_LENGTH),
        hashes.SHA256(),
    )
    headers = {
        "KALSHI-ACCESS-KEY": key_id,
        "KALSHI-ACCESS-SIGNATURE": base64.b64encode(signature).decode(),
        "KALSHI-ACCESS-TIMESTAMP": ts,
    }
    r = requests.get("https://external-api.kalshi.com" + path, headers=headers, timeout=15)
    if r.status_code == 200:
        enabled = bool((r.json() or {}).get("enabled"))
        result("Kalshi Perps", enabled, "margin enabled" if enabled else "authenticated but margin disabled")
    else:
        result("Kalshi Perps", False, f"HTTP {r.status_code}")
except Exception as e:
    result("Kalshi Perps", False, type(e).__name__)

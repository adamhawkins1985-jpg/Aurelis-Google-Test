from pathlib import Path
import time, hashlib, hmac, requests

vals = {}
for line in Path("/opt/aurelis/arbitrage/.env").read_text().splitlines():
    if "=" in line and not line.lstrip().startswith("#"):
        k, v = line.split("=", 1)
        vals[k.strip()] = v.strip()

key = vals.get("GATE_API_KEY", "")
secret = vals.get("GATE_API_SECRET", "")
host = "https://api.gate.us"
prefix = "/api/v4"
url = "/spot/accounts"
query = ""
body = ""
ts = str(int(time.time()))
body_hash = hashlib.sha512(body.encode()).hexdigest()
sign_string = "\n".join(["GET", prefix + url, query, body_hash, ts])
sign = hmac.new(secret.encode(), sign_string.encode(), hashlib.sha512).hexdigest()
headers = {"Accept": "application/json", "Content-Type": "application/json", "KEY": key, "Timestamp": ts, "SIGN": sign}

try:
    r = requests.get(host + prefix + url, headers=headers, timeout=15)
    if r.status_code == 200:
        print("Gate US: AUTH OK")
    else:
        label = ""
        try:
            j = r.json()
            label = j.get("label") or j.get("message") or ""
        except Exception:
            label = "HTTP " + str(r.status_code)
        print(f"Gate US: FAIL | {r.status_code} {label}")
except Exception as e:
    print(f"Gate US: FAIL | {type(e).__name__}")

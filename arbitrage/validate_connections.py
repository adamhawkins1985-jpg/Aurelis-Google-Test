from pathlib import Path
import ccxt

vals = {}
for line in Path("/opt/aurelis/arbitrage/.env").read_text().splitlines():
    if "=" in line and not line.lstrip().startswith("#"):
        k, v = line.split("=", 1)
        vals[k.strip()] = v.strip()

def safe_message(exc):
    msg = str(exc)
    for v in vals.values():
        if v:
            msg = msg.replace(v, "[REDACTED]")
    return msg[:350]

def test_okx():
    ex = ccxt.okx({
        "apiKey": vals.get("OKX_API_KEY", ""),
        "secret": vals.get("OKX_API_SECRET", ""),
        "password": vals.get("OKX_API_PASSPHRASE", ""),
        "hostname": "us.okx.com",
        "enableRateLimit": True,
        "timeout": 15000,
    })
    ex.fetch_balance()

def test_coinbase():
    ex = ccxt.coinbase({
        "apiKey": vals.get("COINBASE_API_KEY", ""),
        "secret": vals.get("COINBASE_API_SECRET", "").replace("\\n", "\n"),
        "enableRateLimit": True,
        "timeout": 15000,
    })
    ex.fetch_balance()

def test_gate():
    ex = ccxt.gate({
        "apiKey": vals.get("GATE_API_KEY", ""),
        "secret": vals.get("GATE_API_SECRET", ""),
        "enableRateLimit": True,
        "timeout": 15000,
    })
    us = "https://api.gate.us/api/v4"
    for side in ("public", "private"):
        if isinstance(ex.urls["api"].get(side), dict):
            for key in list(ex.urls["api"][side]):
                ex.urls["api"][side][key] = us
    ex.fetch_balance({"type": "spot"})

def test_binance_us():
    ex = ccxt.binanceus({
        "apiKey": vals.get("BINANCE_API_KEY", ""),
        "secret": vals.get("BINANCE_API_SECRET", ""),
        "enableRateLimit": True,
        "timeout": 15000,
    })
    ex.fetch_balance()

checks = [
    ("OKX US", test_okx),
    ("Coinbase", test_coinbase),
    ("Gate US", test_gate),
    ("Binance.US", test_binance_us),
]

for name, fn in checks:
    try:
        fn()
        print(f"{name}: AUTH OK")
    except Exception as e:
        print(f"{name}: FAIL | {type(e).__name__}: {safe_message(e)}")

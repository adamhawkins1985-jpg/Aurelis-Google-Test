from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from itertools import permutations
from pathlib import Path
import json
import time

from dex_adapters import ASSETS, DEXES
from wallet_agent import onekey_status

ROOT = Path("/opt/aurelis/arbitrage")
TREASURY = json.loads((ROOT / "treasury.json").read_text())

PLANNED = [
    "jupiter", "paradex", "aevo", "edgex", "grvt", "variational", "aster"
]

def scan_dex(target_usd: float = 25.0):
    started = time.time()
    target_usd = max(5.0, float(target_usd))
    wallet = onekey_status()
    wallet_ready = bool(wallet.get("authenticated"))
    raw = {}
    with ThreadPoolExecutor(max_workers=len(DEXES)) as pool:
        futures = {pool.submit(adapter.quotes, target_usd): name for name, adapter in DEXES.items()}
        for future in as_completed(futures):
            name = futures[future]
            try:
                raw[name] = future.result()
            except Exception as e:
                raw[name] = {"_error": type(e).__name__}

    venue_status = {}
    quotes = {asset: {} for asset in ASSETS}
    for venue, adapter in DEXES.items():
        rows = raw.get(venue) or {}
        good = 0
        for asset in ASSETS:
            q = rows.get(asset)
            if not q:
                continue
            qj = q.json()
            quotes[asset][venue] = qj
            if q.bid and q.ask:
                good += 1
        venue_status[venue] = {
            "dataReady": good > 0,
            "marketsReady": good,
            "dataOnly": bool(adapter.data_only),
            "walletRequired": not adapter.data_only,
            "walletReady": wallet_ready,
            "executionReady": bool(
                good > 0
                and not adapter.data_only
                and wallet_ready
                and TREASURY.get("live_trading_enabled")
            ),
            "source": next((rows[a].source for a in ASSETS if rows.get(a)), ""),
        }

    for venue in PLANNED:
        venue_status[venue] = {
            "dataReady": False,
            "marketsReady": 0,
            "dataOnly": False,
            "walletRequired": True,
            "walletReady": wallet_ready,
            "executionReady": False,
            "status": "planned",
        }

    comparable = [name for name, adapter in DEXES.items() if not adapter.data_only]
    opportunities = []
    for asset in ASSETS:
        for long_v, short_v in permutations(comparable, 2):
            long_q = quotes[asset].get(long_v) or {}
            short_q = quotes[asset].get(short_v) or {}
            ask = long_q.get("ask")
            bid = short_q.get("bid")
            if not ask or not bid:
                continue
            gross = (float(bid) - float(ask)) / float(ask) * 100
            entry_fees = (float(long_q.get("taker_fee") or 0) + float(short_q.get("taker_fee") or 0)) * 100
            round_trip_fees = entry_fees * 2
            net_before_funding = gross - round_trip_fees
            opportunities.append({
                "asset": asset,
                "longVenue": long_v,
                "shortVenue": short_v,
                "longAskUsd": round(float(ask), 8),
                "shortBidUsd": round(float(bid), 8),
                "grossSpreadPct": round(gross, 5),
                "roundTripFeePct": round(round_trip_fees, 5),
                "netSpreadBeforeFundingPct": round(net_before_funding, 5),
                "targetNotionalPerLegUsd": target_usd,
                "walletReady": wallet_ready,
                "executionReady": False,
            })
    opportunities.sort(key=lambda x: x["netSpreadBeforeFundingPct"], reverse=True)

    return {
        "mode": "paper",
        "architecture": "DEX_FIRST_AGENT_WALLET",
        "treasury": {
            "signerProvider": TREASURY.get("signer_provider"),
            "walletSessionConfigured": wallet_ready,
            "authStatus": wallet.get("authStatus"),
            "loginMethod": wallet.get("loginMethod"),
            "walletKind": wallet.get("walletKind"),
            "displayAddress": wallet.get("displayAddress"),
            "storageBackend": wallet.get("storageBackend"),
            "liveTransfersEnabled": bool(TREASURY.get("live_transfers_enabled")),
            "liveTradingEnabled": bool(TREASURY.get("live_trading_enabled")),
            "defaultCollateral": TREASURY.get("default_collateral"),
        },
        "targetNotionalPerLegUsd": target_usd,
        "venues": venue_status,
        "quotes": quotes,
        "opportunities": opportunities,
        "scanMs": round((time.time() - started) * 1000),
        "warning": "Paper/data mode only. GMX is data-only until executable SDK quoting is wired. DEX order submission remains disabled until the OneKey Agent Wallet signer/session and two-leg fill protection are connected."
    }

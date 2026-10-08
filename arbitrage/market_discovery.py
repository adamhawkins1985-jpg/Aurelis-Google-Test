"""Read-only dynamic perpetual-market discovery; no credentials or orders."""
import time
from public_quotes import _json

_CACHE = {"at": 0.0, "data": None}
TTL = 120
MAX_ASSETS = 200


def _symbol(value):
    if not isinstance(value, str):
        return None
    text = value.strip().upper()
    if not (2 <= len(text) <= 20 and all(c.isalnum() or c in "-_" for c in text)):
        return None
    return text


def discover(force=False):
    if not force and _CACHE["data"] is not None and time.time() - _CACHE["at"] < TTL:
        return _CACHE["data"]
    venues = {}
    # Hyperliquid meta is public and reports currently listed perpetual coins.
    try:
        meta = _json("https://api.hyperliquid.xyz/info", {"type": "meta"})
        symbols = {_symbol(row.get("name")) for row in meta.get("universe", []) if isinstance(row, dict)}
        venues["hyperliquid"] = {"assets": sorted(symbols - {None}), "ok": True}
    except Exception as exc:
        venues["hyperliquid"] = {"assets": [], "ok": False, "error": type(exc).__name__}
    # dYdX v4 Indexer returns a map keyed by instrument, e.g. BTC-USD.
    try:
        data = _json("https://indexer.dydx.trade/v4/perpetualMarkets")
        markets = data.get("markets") or {}
        symbols = set()
        if isinstance(markets, dict):
            for market, details in markets.items():
                if isinstance(details, dict) and details.get("status") not in (None, "ACTIVE"):
                    continue
                if market.endswith("-USD"):
                    value = _symbol(market[:-4])
                    if value:
                        symbols.add(value)
        venues["dydx"] = {"assets": sorted(symbols), "ok": True}
    except Exception as exc:
        venues["dydx"] = {"assets": [], "ok": False, "error": type(exc).__name__}
    all_assets = set().union(*(set(x["assets"]) for x in venues.values()))
    # Overlap is what matters for cross-venue arbitrage.
    overlap = set(venues["hyperliquid"]["assets"]) & set(venues["dydx"]["assets"])
    result = {"mode": "paper", "dataSource": "public_read_only",
              "venues": venues, "assetCount": len(all_assets),
              "assets": sorted(all_assets)[:MAX_ASSETS],
              "overlapCount": len(overlap), "overlappingAssets": sorted(overlap)[:MAX_ASSETS],
              "limit": MAX_ASSETS, "executionReady": False,
              "warning": "Catalog only. Quote depth, fees, funding, and freshness still required."}
    # Avoid caching a total upstream outage as successful market coverage.
    if any(v["ok"] for v in venues.values()):
        _CACHE.update(at=time.time(), data=result)
    return result

"""Unauthenticated funding observations, for display only.

Funding is time-varying, signed and venue-specific. These observations are NOT
attestations of transaction costs, and cannot authorize executable estimates.
"""
import math
import time
from public_quotes import _json


def _rate(value):
    try:
        if isinstance(value, bool):
            return None
        rate = float(value)
        return rate if math.isfinite(rate) and abs(rate) <= 0.1 else None
    except (ValueError, TypeError, OverflowError):
        return None


def observed_funding(asset):
    result = {"asset": asset, "mode": "paper", "executionReady": False,
              "dataSource": "public_read_only", "venues": {}}
    try:
        data = _json("https://api.hyperliquid.xyz/info", {"type": "metaAndAssetCtxs"})
        meta, contexts = data
        universe = meta["universe"]
        index = next(i for i, item in enumerate(universe) if item.get("name") == asset)
        rate = _rate(contexts[index].get("funding"))
        result["venues"]["hyperliquid"] = {
            "hourlyFundingRate": rate,
            "observedAt": time.time(), "quoteSource": "metaAndAssetCtxs",
            "costsVerified": False,
        }
    except Exception as error:
        result["venues"]["hyperliquid"] = {"hourlyFundingRate": None, "error": type(error).__name__, "costsVerified": False}
    try:
        data = _json("https://indexer.dydx.trade/v4/perpetualMarkets")
        market = data["markets"][f"{asset}-USD"]
        rate = _rate(market.get("nextFundingRate"))
        result["venues"]["dydx"] = {
            "nextFundingRate": rate, "observedAt": time.time(),
            "quoteSource": "perpetualMarkets", "costsVerified": False,
        }
    except Exception as error:
        result["venues"]["dydx"] = {"nextFundingRate": None, "error": type(error).__name__, "costsVerified": False}
    return result

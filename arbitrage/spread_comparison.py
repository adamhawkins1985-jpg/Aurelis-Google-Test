"""Read-only cross-venue paper spread review with explicit cost uncertainty."""
import math
import time
from quote_assessment import assess


def compare(asset, notional_usd, quotes, now=None):
    """Compare asks against bids across distinct venues, never authorize execution."""
    current = time.time() if now is None else now
    reviewed = {}
    for venue, book in quotes.items():
        if venue not in ("hyperliquid", "dydx", "lighter", "paradex"):
            continue
        if not isinstance(book, dict):
            continue
        snapshot = dict(book, venue=venue, asset=asset)
        reviewed[venue] = {
            "buy": assess("arbitrage", venue, asset, "buy", notional_usd, snapshot, current),
            "sell": assess("arbitrage", venue, asset, "sell", notional_usd, snapshot, current),
        }
    candidates = []
    for buy_venue, entry in reviewed.items():
        for sell_venue, exit_ in reviewed.items():
            if buy_venue == sell_venue:
                continue
            buy, sell = entry["buy"], exit_["sell"]
            a, b = buy["depthAdjustedVwapUsd"], sell["depthAdjustedVwapUsd"]
            if not (buy["liquidityVerified"] and sell["liquidityVerified"]):
                continue
            if not a or not b or not (math.isfinite(a) and math.isfinite(b)):
                continue
            gross = (b - a) / a * 100
            costs_verified = all(x["feesVerified"] and x["fundingVerified"] for x in (buy, sell))
            costs = None
            net = None
            if costs_verified:
                costs = buy["estimatedCosts"]["estimatedTotalCostsUsd"] + sell["estimatedCosts"]["estimatedTotalCostsUsd"]
                net = gross - costs / float(notional_usd) * 100
            candidates.append({
                "asset": asset, "buyVenue": buy_venue, "sellVenue": sell_venue,
                "buyVwapUsd": round(a, 8), "sellVwapUsd": round(b, 8),
                "grossSpreadPct": round(gross, 5), "costsVerified": costs_verified,
                "estimatedCostsUsd": round(costs, 8) if costs is not None else None,
                "estimatedNetSpreadPct": round(net, 5) if net is not None else None,
                "tradeReady": False, "orderSubmitted": False,
                "warning": "Indicative paper comparison; no fill guarantees or executable route",
            })
    candidates.sort(key=lambda x: x["grossSpreadPct"], reverse=True)
    return {"mode": "paper", "asset": asset, "executionReady": False,
            "dataSource": "read_only_orderbooks", "candidates": candidates,
            "warning": "Funding and venue fees must be verified before net return can be estimated."}

"""Fail-closed read-only quote assessment for paper proposals.

Top-of-book prices are indicative. Without verified depth, fees, funding and
server-side freshness, a quote must not be labeled executable or profitable.
"""
import math
import time
from paper_router import prepare
from depth_pricing import depth_fill, estimate_costs
from cost_attestation import verify_costs

MAX_AGE_SECONDS = 15


def assess(bot, venue, asset, side, notional_usd, snapshot=None, now=None):
    result = prepare(bot, venue, asset, side, notional_usd)
    result["quoteSource"] = "unavailable"
    result["indicativePriceUsd"] = None
    result["quoteAgeSeconds"] = None
    result["quoteVerified"] = False
    result["liquidityVerified"] = False
    result["feesVerified"] = False
    result["fundingVerified"] = False
    result["estimatedNetSpreadPct"] = None
    result["depthAdjustedVwapUsd"] = None
    result["estimatedCosts"] = None
    result["warnings"] = ["Review only; execution prohibited"]
    if not isinstance(snapshot, dict) or snapshot.get("venue") != venue or snapshot.get("asset") != asset:
        result["warnings"].append("Missing matching market snapshot")
        return result
    timestamp = snapshot.get("receivedAt")
    if isinstance(timestamp, bool) or not isinstance(timestamp, (int, float)) or not math.isfinite(timestamp):
        result["warnings"].append("Missing trusted snapshot timestamp")
        return result
    current = time.time() if now is None else now
    age = current - timestamp
    if not 0 <= age <= MAX_AGE_SECONDS:
        result["warnings"].append("Quote stale or clock mismatch")
        return result
    result["quoteAgeSeconds"] = round(age, 3)
    field = "ask" if side in ("buy", "long") else "bid"
    value = snapshot.get(field)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
        result["warnings"].append("Invalid top-of-book price")
        return result
    result["indicativePriceUsd"] = value
    result["quoteSource"] = "public_l2_indicative"
    result["quoteVerified"] = True
    depth = depth_fill(snapshot.get("asks" if side in ("buy", "long") else "bids"), notional_usd)
    result["depthAdjustedVwapUsd"] = depth["vwapUsd"] if depth else None
    result["liquidityVerified"] = bool(depth)
    # Market data cannot self-certify fee/funding fields or verification flags.
    attested = verify_costs(venue)
    costs = estimate_costs(notional_usd, attested.taker_fee_bps, attested.funding_bps) if attested else None
    result["estimatedCosts"] = costs
    result["feesVerified"] = bool(attested and costs)
    result["fundingVerified"] = bool(attested and costs)
    if not depth:
        result["warnings"].append("Insufficient or unavailable order-book depth")
    if not (result["feesVerified"] and result["fundingVerified"]):
        result["warnings"].append("Venue-specific fees or funding not verified")
    result["warnings"].append("Indicative paper quote only; not executable")
    result["warnings"].append("Fees, funding and order-book depth unverified")
    return result

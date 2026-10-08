"""Independent validation of public DEX order books before paper analysis.

The caller must provide a trusted ingestion timestamp. Exchange-provided flags
cannot override invalid or crossed books. No signing or executable route.
"""
import math
import time

MAX_AGE_SECONDS = 15
MAX_RELATIVE_SPREAD = 0.20


def validate_book(venue, asset, quote, received_at, now=None):
    current = time.time() if now is None else now
    result = {"venue": venue, "asset": asset, "receivedAt": received_at,
              "quoteUsable": False, "executionReady": False, "reason": None}
    if not isinstance(quote, dict):
        result["reason"] = "missing_quote"
        return result
    if isinstance(received_at, bool) or not isinstance(received_at, (int, float)) or not math.isfinite(received_at) or not 0 <= current - received_at <= MAX_AGE_SECONDS:
        result["reason"] = "stale_quote"
        return result
    sides = {}
    for side, descending in (("bids", True), ("asks", False)):
        rows = quote.get(side)
        if not isinstance(rows, list) or not rows:
            result["reason"] = "missing_depth"
            return result
        parsed = []
        for row in rows[:50]:
            if not isinstance(row, (list, tuple)) or len(row) < 2:
                result["reason"] = "invalid_depth"
                return result
            p, q = row[:2]
            if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or v <= 0 for v in (p, q)):
                result["reason"] = "invalid_depth"
                return result
            parsed.append((p, q))
        prices = [p for p, _ in parsed]
        if prices != sorted(prices, reverse=descending):
            result["reason"] = "unordered_depth"
            return result
        sides[side] = parsed
    bid = sides["bids"][0][0]
    ask = sides["asks"][0][0]
    if bid >= ask:
        result["reason"] = "crossed_book"
        return result
    if (ask - bid) / ask > MAX_RELATIVE_SPREAD:
        result["reason"] = "abnormal_spread"
        return result
    result.update(quoteUsable=True, reason=None, bid=bid, ask=ask,
                  bids=[list(row) for row in sides["bids"]],
                  asks=[list(row) for row in sides["asks"]])
    return result

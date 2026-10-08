"""Public, unauthenticated order-book snapshots for staging only.

No wallet access, API keys, private endpoints or order submission.
"""
import json
import re
import time
from urllib.request import Request, urlopen

ASSETS = ("BTC", "ETH", "SOL")  # Initial smoke-test assets; dynamic symbols also accepted.


def _json(url, data=None):
    headers = {"User-Agent": "AURELIS-Staging-Public-Quotes/1.0"}
    if data is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(data).encode()
    with urlopen(Request(url, data=data, headers=headers), timeout=6) as response:
        return json.load(response)


def _top(levels, price_field="price", size_field="size"):
    for row in levels:
        try:
            if isinstance(row, dict):
                price = float(row[price_field])
                size = float(row[size_field])
            else:
                price, size = float(row[0]), float(row[1])
            if price > 0 and size > 0:
                return price
        except (KeyError, ValueError, TypeError, IndexError):
            continue
    return None


def _levels(rows, price_field="price", size_field="size"):
    out = []
    for row in rows[:50]:
        try:
            p = float(row[price_field] if isinstance(row, dict) else row[0])
            a = float(row[size_field] if isinstance(row, dict) else row[1])
            if not (0 < p < float("inf") and 0 < a < float("inf")):
                continue
            out.append([p, a])
        except (KeyError, ValueError, TypeError, IndexError):
            continue
    return out


def public_quotes(asset):
    if not isinstance(asset, str) or not re.fullmatch(r"[A-Z0-9_-]{2,20}", asset):
        raise ValueError("Invalid asset symbol")
    sources = {}
    try:
        book = _json("https://api.hyperliquid.xyz/info", {"type": "l2Book", "coin": asset})
        fetched_at = time.time()
        levels = book["levels"]
        sources["hyperliquid"] = {"bid": _top(levels[0], "px", "sz"),
                                   "ask": _top(levels[1], "px", "sz"),
                                   "receivedAt": fetched_at,
                                   "bids": _levels(levels[0], "px", "sz"),
                                   "asks": _levels(levels[1], "px", "sz"),
                            "source": "public_l2", "executionReady": False}
    except Exception as error:
        sources["hyperliquid"] = {"bid": None, "ask": None, "error": type(error).__name__,
                                   "executionReady": False}
    try:
        book = _json(f"https://indexer.dydx.trade/v4/orderbooks/perpetualMarket/{asset}-USD")
        fetched_at = time.time()
        sources["dydx"] = {"receivedAt": fetched_at, "bid": _top(book["bids"]), "ask": _top(book["asks"]),
                            "bids": _levels(book["bids"]), "asks": _levels(book["asks"]),
                            "source": "public_l2", "executionReady": False}
    except Exception as error:
        sources["dydx"] = {"bid": None, "ask": None, "error": type(error).__name__,
                            "executionReady": False}
    return {"mode": "paper", "asset": asset, "dataSource": "public_read_only",
            "executionReady": False, "quotes": sources}

"""Public, unauthenticated order-book snapshots for staging only.

No wallet access, API keys, private endpoints or order submission.
"""
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
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


def _fetch_hyperliquid(asset):
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
    return sources["hyperliquid"]


def _fetch_dydx(asset):
    sources = {}
    try:
        book = _json(f"https://indexer.dydx.trade/v4/orderbooks/perpetualMarket/{asset}-USD")
        fetched_at = time.time()
        sources["dydx"] = {"receivedAt": fetched_at, "bid": _top(book["bids"]), "ask": _top(book["asks"]),
                            "bids": _levels(book["bids"]), "asks": _levels(book["asks"]),
                            "source": "public_l2", "executionReady": False}
    except Exception as error:
        sources["dydx"] = {"bid": None, "ask": None, "error": type(error).__name__,
                            "executionReady": False}
    return sources["dydx"]


def _fetch_paradex(asset):
    sources = {}
    try:
        # Paradex public orderbook uses BTC-USD-PERP-style symbols.
        market = f"{asset}-USD-PERP"
        book = _json(f"https://api.prod.paradex.trade/v1/orderbook/{market}?depth=20")
        fetched_at = time.time()
        if book.get("market") != market:
            raise ValueError("market_mismatch")
        bids, asks = _levels(book["bids"]), _levels(book["asks"])
        sources["paradex"] = {"bid": _top(bids), "ask": _top(asks),
                              "bids": bids, "asks": asks, "receivedAt": fetched_at,
                              "source": "public_l2", "executionReady": False}
    except Exception as error:
        sources["paradex"] = {"bid": None, "ask": None,
                              "error": type(error).__name__, "executionReady": False}
    return sources["paradex"]


def _fetch_lighter(asset):
    sources = {}
    try:
        # Lighter markets are keyed by numeric market_id, not ticker symbols.
        catalog = _json("https://mainnet.zklighter.elliot.ai/api/v1/orderBooks")
        rows = catalog.get("order_books") or []
        match = next(row for row in rows if isinstance(row, dict)
                     and row.get("symbol") == asset
                     and row.get("market_type") == "perp"
                     and row.get("status") == "active")
        market_id = int(match["market_id"])
        if market_id < 0 or market_id > 2047:
            raise ValueError("invalid_market_id")
        book = _json(f"https://mainnet.zklighter.elliot.ai/api/v1/orderBookOrders?market_id={market_id}&limit=50")
        fetched_at = time.time()
        if book.get("code") != 200:
            raise ValueError("upstream_error")
        def convert(rows):
            return _levels([{"price": row["price"], "size": row["remaining_base_amount"]}
                            for row in rows if isinstance(row, dict)])
        bids = sorted(convert(book["bids"]), key=lambda row: row[0], reverse=True)
        asks = sorted(convert(book["asks"]), key=lambda row: row[0])
        sources["lighter"] = {"bid": _top(bids), "ask": _top(asks),
                              "bids": bids, "asks": asks, "receivedAt": fetched_at,
                              "source": "public_l2", "executionReady": False}
    except Exception as error:
        sources["lighter"] = {"bid": None, "ask": None,
                              "error": type(error).__name__, "executionReady": False}
    return sources["lighter"]


def public_quotes(asset):
    if not isinstance(asset, str) or not re.fullmatch(r"[A-Z0-9_-]{2,20}", asset):
        raise ValueError("Invalid asset symbol")
    workers = {
        "hyperliquid": _fetch_hyperliquid,
        "dydx": _fetch_dydx,
        "paradex": _fetch_paradex,
        "lighter": _fetch_lighter,
    }
    # Each call has its own network timeout; wait for all to finish, never reuse
    # a prior snapshot or claim a failed venue is available.
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {name: executor.submit(fn, asset) for name, fn in workers.items()}
        sources = {}
        for name, future in futures.items():
            try:
                sources[name] = future.result()
            except Exception as error:
                sources[name] = {"bid": None, "ask": None,
                                 "error": type(error).__name__, "executionReady": False}
    return {"mode": "paper", "asset": asset, "dataSource": "public_read_only",
            "executionReady": False, "quotes": sources}

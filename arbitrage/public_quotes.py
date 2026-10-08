"""Public, unauthenticated order-book snapshots for staging only.

No wallet access, API keys, private endpoints or order submission.
"""
import json
from urllib.request import Request, urlopen

ASSETS = ("BTC", "ETH", "SOL")


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


def public_quotes(asset):
    if asset not in ASSETS:
        raise ValueError("Unsupported asset")
    sources = {}
    try:
        book = _json("https://api.hyperliquid.xyz/info", {"type": "l2Book", "coin": asset})
        levels = book["levels"]
        sources["hyperliquid"] = {"bid": _top(levels[0], "px", "sz"),
                                   "ask": _top(levels[1], "px", "sz"),
                                   "source": "public_l2", "executionReady": False}
    except Exception as error:
        sources["hyperliquid"] = {"bid": None, "ask": None, "error": type(error).__name__,
                                   "executionReady": False}
    try:
        book = _json(f"https://indexer.dydx.trade/v4/orderbooks/perpetualMarket/{asset}-USD")
        sources["dydx"] = {"bid": _top(book["bids"]), "ask": _top(book["asks"]),
                            "source": "public_l2", "executionReady": False}
    except Exception as error:
        sources["dydx"] = {"bid": None, "ask": None, "error": type(error).__name__,
                            "executionReady": False}
    return {"mode": "paper", "asset": asset, "dataSource": "public_read_only",
            "executionReady": False, "quotes": sources}

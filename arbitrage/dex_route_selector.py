"""OneKey-first, Kraken-independent DEX paper-route selector for all seven bots.

Public book analysis only. Selecting a DEX does not establish wallet or margin
compatibility, gas funding, collateral availability, or execution readiness.
"""
from book_validation import validate_book
from depth_pricing import depth_fill
from paper_router import prepare


def select_paper_route(bot, asset, side, notional_usd, quotes):
    # Validate all user inputs before processing externally supplied orderbooks.
    draft = prepare(bot, "hyperliquid", asset, side, notional_usd)
    choices = []
    rejected = {}
    for venue, quote in sorted(quotes.items()):
        try:
            prepare(bot, venue, asset, side, notional_usd)
        except ValueError:
            rejected[venue] = "unsupported_venue"
            continue
        checked = validate_book(venue, asset, quote, quote.get("receivedAt") if isinstance(quote, dict) else None)
        if not checked["quoteUsable"]:
            rejected[venue] = checked["reason"]
            continue
        buying = side in ("buy", "long")
        depth = depth_fill(checked["asks" if buying else "bids"], notional_usd)
        if not depth:
            rejected[venue] = "insufficient_depth"
            continue
        choices.append({"venue": venue, "indicativeVwapUsd": depth["vwapUsd"],
                        "source": "public_l2", "executionReady": False,
                        "walletCompatibilityVerified": False, "collateralVerified": False})
    choices.sort(key=lambda r: (r["indicativeVwapUsd"] if side in ("buy", "long") else -r["indicativeVwapUsd"], r["venue"]))
    return {"mode": "paper", "bot": bot, "asset": asset, "side": side,
            "notionalUsd": draft["notionalUsd"], "preferredVenue": choices[0]["venue"] if choices else None,
            "candidates": choices, "rejected": rejected, "executionReady": False,
            "wallet": "onekey", "requiresPhoneApproval": True, "ordersSubmitted": 0,
            "warning": "Indicative book ranking only; fees, gas, collateral, margin, funding and wallet chain compatibility are not verified."}

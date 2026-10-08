"""Shared non-executable paper-trade preparation for all AURELIS bots.

Produces review-only proposals. Does not connect to a signer, reserve funds,
send transactions, place orders, or imply availability of a market.
"""
from decimal import Decimal, InvalidOperation
from agent_wallet_service import BOT_IDS

MAX_PAPER_NOTIONAL_USD = Decimal("100")
ALLOWED_SIDES = frozenset({"buy", "sell", "long", "short"})


def _money(value):
    if isinstance(value, bool):
        raise ValueError("invalid_notional")
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise ValueError("invalid_notional") from None
    if not number.is_finite() or number <= 0 or number > MAX_PAPER_NOTIONAL_USD:
        raise ValueError("notional_out_of_bounds")
    return number


def prepare(bot, venue, asset, side, notional_usd):
    if bot not in BOT_IDS:
        raise ValueError("unknown_bot")
    if not isinstance(venue, str) or venue not in {"hyperliquid", "dydx", "lighter", "paradex", "extended"}:
        raise ValueError("unsupported_venue")
    if not isinstance(asset, str) or not (2 <= len(asset) <= 20) or not all(c.isalnum() or c in "-_" for c in asset) or asset != asset.upper():
        raise ValueError("invalid_asset")
    if side not in ALLOWED_SIDES:
        raise ValueError("invalid_side")
    amount = _money(notional_usd)
    return {
        "mode": "paper",
        "type": "review_only",
        "bot": bot,
        "venue": venue,
        "asset": asset,
        "side": side,
        "notionalUsd": str(amount),
        "marketVerified": False,
        "quoteVerified": False,
        "liquidityVerified": False,
        "feesVerified": False,
        "walletAuthenticated": False,
        "executionReady": False,
        "signingAllowed": False,
        "transferAllowed": False,
        "orderSubmitted": False,
        "warnings": ["No live execution", "Market and quote verification required"],
    }

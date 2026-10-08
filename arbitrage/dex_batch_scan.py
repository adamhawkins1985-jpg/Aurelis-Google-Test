"""Bounded multi-asset DEX venue comparisons for all AURELIS bots.

Read-only paper observations. No orders, wallet signing, auth, or execution.
"""
from concurrent.futures import ThreadPoolExecutor
from agent_wallet_service import BOT_IDS
from dex_route_selector import select_paper_route
from public_quotes import public_quotes
from paper_router import prepare

MAX_SYMBOLS = 8


def scan(bot, assets, side="long", notional_usd="25", quote_reader=public_quotes):
    if bot not in BOT_IDS:
        raise ValueError("unknown_bot")
    if not isinstance(assets, (list, tuple)) or not 1 <= len(assets) <= MAX_SYMBOLS:
        raise ValueError("invalid_asset_count")
    if len(set(assets)) != len(assets):
        raise ValueError("duplicate_assets")
    for asset in assets:
        prepare(bot, "hyperliquid", asset, side, notional_usd)

    def inspect(asset):
        try:
            snapshot = quote_reader(asset)
            quotes = snapshot.get("quotes") if isinstance(snapshot, dict) else None
            if not isinstance(quotes, dict):
                raise ValueError("missing_quotes")
            return {"asset": asset, "route": select_paper_route(bot, asset, side, notional_usd, quotes)}
        except Exception:
            return {"asset": asset, "route": None, "error": "market_data_unavailable"}

    with ThreadPoolExecutor(max_workers=min(4, len(assets))) as executor:
        outcomes = list(executor.map(inspect, assets))
    return {"mode": "paper", "bot": bot, "side": side,
            "assetsRequested": len(assets), "markets": outcomes,
            "routesFound": sum(bool(x.get("route", {}).get("preferredVenue")) for x in outcomes if isinstance(x.get("route"), dict)),
            "executionReady": False, "ordersSubmitted": 0, "wallet": "onekey",
            "warning": "Indicative market observations only; no verified costs, funding, collateral, execution, or trade signal."}

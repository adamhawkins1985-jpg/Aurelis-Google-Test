"""Conservative DEX signal and risk assessment shared by seven AURELIS bots.

Order-book quality is an observation, NOT evidence for a directional trade.
No trading signals are qualified until independent strategy, fee, funding,
collateral, chain compatibility and risk checks exist.
"""
from decimal import Decimal, InvalidOperation
from dex_route_selector import select_paper_route

MAX_SPREAD_BPS = Decimal("100")
MAX_NOTIONAL = Decimal("100")


def _positive_decimal(value):
    if isinstance(value, bool):
        return None
    try:
        number = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return number if number.is_finite() and number > 0 else None


def analyze(bot, asset, side, notional_usd, quotes):
    route = select_paper_route(bot, asset, side, notional_usd, quotes)
    assessments = []
    for candidate in route["candidates"]:
        venue = candidate["venue"]
        quote = quotes[venue]
        bid, ask = _positive_decimal(quote.get("bid")), _positive_decimal(quote.get("ask"))
        spread_bps = ((ask - bid) / ask * 10000) if bid and ask and ask > bid else None
        passes_spread = spread_bps is not None and spread_bps <= MAX_SPREAD_BPS
        assessments.append({
            "venue": venue,
            "depthQualified": True,
            "spreadBps": float(round(spread_bps, 3)) if spread_bps is not None else None,
            "spreadCheckPassed": passes_spread,
            "directionalSignalVerified": False,
            "feesVerified": False,
            "fundingVerified": False,
            "collateralVerified": False,
            "chainCompatibilityVerified": False,
            "executionReady": False,
            "paperScore": None,
            "status": "insufficient_evidence",
        })
    return {
        "mode": "paper", "bot": bot, "asset": asset, "side": side,
        "notionalUsd": route["notionalUsd"],
        "preferredIndicativeVenue": route["preferredVenue"],
        "venueAssessments": assessments,
        "qualifiedSignals": [],
        "risk": {
            "notionalLimitUsd": str(MAX_NOTIONAL),
            "positionSizeVerified": False,
            "stopLossVerified": False,
            "portfolioExposureVerified": False,
            "liquidationRiskVerified": False,
        },
        "executionReady": False, "ordersSubmitted": 0,
        "warnings": [
            "Order book alone does not establish trade direction or profit.",
            "Fee, funding, margin, chain, wallet, stop-loss and liquidation checks required.",
        ],
    }

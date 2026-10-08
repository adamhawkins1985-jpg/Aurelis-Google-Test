"""Independent, evidence-gated paper strategy assessment.

Directional book imbalance is a weak observation, not a trade signal. No
orders are qualified without external strategy confirmation and venue costs.
"""
from decimal import Decimal, InvalidOperation
from dex_signal_risk import analyze

def _d(value):
    if isinstance(value, bool):
        return None
    try:
        d = Decimal(str(value))
        return d if d.is_finite() and d > 0 else None
    except (ValueError, TypeError, InvalidOperation):
        return None

def inspect(bot, asset, side, notional_usd, quotes, funding=None):
    report = analyze(bot, asset, side, notional_usd, quotes)
    for item in report["venueAssessments"]:
        quote = quotes.get(item["venue"], {})
        bids = quote.get("bids", [])
        asks = quote.get("asks", [])
        def volume(rows):
            if not isinstance(rows, list):
                return None
            total = Decimal(0)
            for row in rows[:20]:
                if not isinstance(row, (list, tuple)) or len(row) < 2:
                    return None
                price, size = _d(row[0]), _d(row[1])
                if price is None or size is None:
                    return None
                total += price * size
            return total if total > 0 else None
        bid_vol, ask_vol = volume(bids), volume(asks)
        imbalance = (bid_vol - ask_vol) / (bid_vol + ask_vol) if bid_vol and ask_vol else None
        item["observedDepthImbalance"] = float(round(imbalance, 5)) if imbalance is not None else None
        item["marketObservation"] = "buy_side_heavier" if imbalance is not None and imbalance > Decimal("0.15") else ("sell_side_heavier" if imbalance is not None and imbalance < Decimal("-0.15") else "inconclusive")
        item["directionalSignalVerified"] = False
        item["paperScore"] = None
        evidence = (funding or {}).get("venues", {}).get(item["venue"], {})
        item["fundingObservation"] = {
            "hourlyRate": evidence.get("hourlyFundingRate"),
            "nextRate": evidence.get("nextFundingRate"),
            "observedAt": evidence.get("observedAt"),
            "source": evidence.get("quoteSource"),
            "costsVerified": False,
        }
    report["fundingEvidence"] = "public_observation_only" if funding else "unavailable"
    report["strategy"] = "depth_imbalance_observation"
    report["strategyQualified"] = False
    report["qualifiedSignals"] = []
    report["executionReady"] = False
    report["ordersSubmitted"] = 0
    return report

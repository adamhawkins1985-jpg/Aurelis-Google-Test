"""Depth-adjusted indicative paper pricing. No execution and no fee assumptions."""
from decimal import Decimal, InvalidOperation


def _positive(value):
    if isinstance(value, bool):
        return None
    try:
        x = Decimal(str(value))
        return x if x.is_finite() and x > 0 else None
    except (InvalidOperation, ValueError, TypeError):
        return None


def depth_fill(levels, notional_usd):
    """Consume price/size levels (size in base coin), returning indicative VWAP.
    Reject partial fills rather than extrapolating top-of-book depth.
    """
    target = _positive(notional_usd)
    if target is None or not isinstance(levels, list):
        return None
    remaining = target
    total_coin = Decimal("0")
    spent = Decimal("0")
    for row in levels:
        if not isinstance(row, (list, tuple)) or len(row) < 2:
            return None
        price, size = _positive(row[0]), _positive(row[1])
        if price is None or size is None:
            return None
        available = price * size
        used = min(remaining, available)
        spent += used
        total_coin += used / price
        remaining -= used
        if remaining <= Decimal("0.00000001"):
            break
    if remaining > Decimal("0.00000001") or total_coin <= 0:
        return None
    return {"vwapUsd": float(spent / total_coin), "filledNotionalUsd": float(spent),
            "baseAmount": float(total_coin), "depthCovered": True}


def estimate_costs(notional_usd, taker_fee_bps=None, funding_bps=None):
    """Only calculate when caller supplies BOTH verified values, never invent rates."""
    amount, fee, funding = map(_positive, (notional_usd, taker_fee_bps, funding_bps))
    # Zero fees/funding are valid, but have to be explicitly given.
    def nonnegative(v):
        if isinstance(v, bool):
            return None
        try:
            d = Decimal(str(v))
            return d if d.is_finite() and d >= 0 else None
        except (InvalidOperation, ValueError, TypeError):
            return None
    fee, funding = nonnegative(taker_fee_bps), nonnegative(funding_bps)
    if amount is None or fee is None or funding is None:
        return None
    if fee > 1000 or funding > 1000:
        return None
    total = amount * (fee + funding) / Decimal(10000)
    return {"estimatedFeesUsd": float(amount * fee / Decimal(10000)),
            "estimatedFundingUsd": float(amount * funding / Decimal(10000)),
            "estimatedTotalCostsUsd": float(total),
            "feeBps": float(fee), "fundingBps": float(funding)}

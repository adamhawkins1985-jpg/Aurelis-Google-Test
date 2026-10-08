"""Fail-closed paper risk calculations, not liquidation-price predictions."""
from decimal import Decimal, InvalidOperation
from paper_router import prepare

def number(value):
    if isinstance(value,bool): raise ValueError("invalid_number")
    try: x=Decimal(str(value))
    except (InvalidOperation,ValueError,TypeError): raise ValueError("invalid_number") from None
    if not x.is_finite() or x<=0: raise ValueError("invalid_number")
    return x

def review(bot,venue,asset,side,notional_usd,entry,stop,leverage):
    draft=prepare(bot,venue,asset,side,notional_usd)
    entry,stop,lev=number(entry),number(stop),number(leverage)
    if lev>Decimal("20"): raise ValueError("excessive_paper_leverage")
    long=side in ("long","buy")
    if (long and stop>=entry) or (not long and stop<=entry):
        raise ValueError("stop_wrong_side")
    notional=Decimal(draft["notionalUsd"])
    move=abs(entry-stop)/entry
    stop_loss=notional*move
    margin=notional/lev
    if move>=1 or stop_loss>=margin:
        raise ValueError("stop_exceeds_estimated_margin")
    return {**draft,
      "entryUsd":str(entry),"stopUsd":str(stop),"leverage":str(lev),
      "estimatedInitialMarginUsd":str(margin.quantize(Decimal("0.0001"))),
      "estimatedLossAtStopUsdBeforeCosts":str(stop_loss.quantize(Decimal("0.0001"))),
      "stopDistancePct":str((move*100).quantize(Decimal("0.0001"))),
      "estimatedLiquidationPriceUsd":None,
      "liquidationRiskVerified":False,"stopOrderPlaced":False,
      "costsVerified":False,"walletCompatibilityVerified":False,
      "warnings":["Illustrative simple leverage math only; not venue margin requirements",
       "Liquidation price cannot be calculated reliably without verified venue tiers, account equity, maintenance margin and fees",
       "Stop may fail to fill and losses may exceed this estimate","No wallet signing or live order execution"] }

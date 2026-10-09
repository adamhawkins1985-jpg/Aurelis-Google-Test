from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional
import requests
import math

ASSETS = ("BTC", "ETH", "SOL")

@dataclass
class DexQuote:
    venue: str
    asset: str
    bid: Optional[float]
    ask: Optional[float]
    taker_fee: float
    funding_rate: Optional[float] = None
    source: str = ""
    data_only: bool = False
    error: Optional[str] = None

    def json(self) -> Dict[str, Any]:
        return asdict(self)

def _vwap(levels: List[Any], target_usd: float, price_key=None, size_key=None) -> Optional[float]:
    remain = float(target_usd)
    if not math.isfinite(remain) or remain <= 0:
        return None
    notional = 0.0
    qty = 0.0
    for row in levels:
        try:
            if isinstance(row, dict):
                p = float(row[price_key] if price_key else row.get("price") or row.get("px"))
                s = float(row[size_key] if size_key else row.get("size") or row.get("sz"))
            else:
                p = float(row[0])
                s = float(row[1])
        except (TypeError, ValueError, KeyError, IndexError, OverflowError):
            return None
        if not math.isfinite(p) or not math.isfinite(s) or p <= 0 or s <= 0:
            return None
        take = min(s, remain / p)
        notional += take * p
        qty += take
        remain -= take * p
        if remain <= 1e-8:
            break
    if qty <= 0 or notional < target_usd * 0.995:
        return None
    return notional / qty

class BaseDex:
    name = "base"
    data_only = False
    taker_fee = 0.001

    def quotes(self, target_usd: float) -> Dict[str, DexQuote]:
        raise NotImplementedError

class HyperliquidDex(BaseDex):
    name = "hyperliquid"
    taker_fee = 0.00045
    info_url = "https://api.hyperliquid.xyz/info"

    def quotes(self, target_usd: float) -> Dict[str, DexQuote]:
        out = {}
        for asset in ASSETS:
            try:
                r = requests.post(self.info_url, json={"type": "l2Book", "coin": asset}, timeout=8)
                r.raise_for_status()
                j = r.json()
                levels = j.get("levels") or [[], []]
                bids = levels[0] if len(levels) > 0 else []
                asks = levels[1] if len(levels) > 1 else []
                out[asset] = DexQuote(
                    self.name, asset,
                    _vwap(bids, target_usd, "px", "sz"),
                    _vwap(asks, target_usd, "px", "sz"),
                    self.taker_fee,
                    source="Hyperliquid L2"
                )
            except Exception as e:
                out[asset] = DexQuote(self.name, asset, None, None, self.taker_fee, source="Hyperliquid L2", error=type(e).__name__)
        return out

class DydxDex(BaseDex):
    name = "dydx"
    taker_fee = 0.0005
    base_url = "https://indexer.dydx.trade/v4/orderbooks/perpetualMarket"

    def quotes(self, target_usd: float) -> Dict[str, DexQuote]:
        out = {}
        for asset in ASSETS:
            try:
                r = requests.get(f"{self.base_url}/{asset}-USD", timeout=8)
                r.raise_for_status()
                j = r.json()
                bids = j.get("bids") or []
                asks = j.get("asks") or []
                out[asset] = DexQuote(
                    self.name, asset,
                    _vwap(bids, target_usd, "price", "size"),
                    _vwap(asks, target_usd, "price", "size"),
                    self.taker_fee,
                    source="dYdX v4 Indexer"
                )
            except Exception as e:
                out[asset] = DexQuote(self.name, asset, None, None, self.taker_fee, source="dYdX v4 Indexer", error=type(e).__name__)
        return out

class LighterDex(BaseDex):
    name = "lighter"
    taker_fee = 0.0
    base_url = "https://mainnet.zklighter.elliot.ai/api/v1"
    market_ids = {"BTC": 1, "ETH": 0, "SOL": 2}

    def quotes(self, target_usd: float) -> Dict[str, DexQuote]:
        out = {}
        for asset, market_id in self.market_ids.items():
            try:
                r = requests.get(f"{self.base_url}/orderBookOrders", params={"market_id": market_id, "limit": 100}, timeout=8)
                r.raise_for_status()
                j = r.json()
                bids = sorted(j.get("bids") or [], key=lambda x: float(x.get("price") or 0), reverse=True)
                asks = sorted(j.get("asks") or [], key=lambda x: float(x.get("price") or 0))
                out[asset] = DexQuote(
                    self.name, asset,
                    _vwap(bids, target_usd, "price", "remaining_base_amount"),
                    _vwap(asks, target_usd, "price", "remaining_base_amount"),
                    self.taker_fee,
                    source="Lighter public book"
                )
            except Exception as e:
                out[asset] = DexQuote(self.name, asset, None, None, self.taker_fee, source="Lighter public book", error=type(e).__name__)
        return out

class GmxDex(BaseDex):
    name = "gmx"
    data_only = True
    taker_fee = 0.0
    prices_url = "https://arbitrum-api.gmxinfra.io/prices/tickers"
    decimals = {"BTC": 8, "ETH": 18, "SOL": 9}

    def quotes(self, target_usd: float) -> Dict[str, DexQuote]:
        out = {}
        try:
            r = requests.get(self.prices_url, timeout=8)
            r.raise_for_status()
            rows = r.json()
            by_symbol = {}
            for row in rows:
                sym = str(row.get("tokenSymbol") or "").upper()
                if sym in ASSETS and sym not in by_symbol:
                    by_symbol[sym] = row
            for asset in ASSETS:
                row = by_symbol.get(asset)
                if not row:
                    out[asset] = DexQuote(self.name, asset, None, None, 0.0, source="GMX Oracle", data_only=True, error="missing_market")
                    continue
                scale = 10 ** (30 - self.decimals[asset])
                try:
                    min_px = float(row["minPrice"]) / scale
                    max_px = float(row["maxPrice"]) / scale
                except (KeyError, TypeError, ValueError, OverflowError):
                    min_px = max_px = float("nan")
                if not (math.isfinite(min_px) and math.isfinite(max_px) and 0 < min_px <= max_px):
                    out[asset] = DexQuote(self.name, asset, None, None, 0.0, source="GMX Oracle", data_only=True, error="invalid_oracle_price")
                    continue
                out[asset] = DexQuote(self.name, asset, min_px, max_px, 0.0, source="GMX Oracle", data_only=True)
        except Exception as e:
            for asset in ASSETS:
                out[asset] = DexQuote(self.name, asset, None, None, 0.0, source="GMX Oracle", data_only=True, error=type(e).__name__)
        return out

DEXES = {
    "hyperliquid": HyperliquidDex(),
    "lighter": LighterDex(),
    "dydx": DydxDex(),
    "gmx": GmxDex(),
}

"""Isolated staging HTTP API. Synthetic fixtures only; no wallets, credentials or orders."""
import argparse
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs
from public_quotes import public_quotes
from market_discovery import discover
from agent_wallet_service import wallet_status
from paper_router import prepare
from quote_assessment import assess
from spread_comparison import compare
from funding_observations import observed_funding
from book_validation import validate_book
from dex_route_selector import select_paper_route
from dex_batch_scan import scan as scan_dex_batch
from dex_signal_risk import analyze as assess_dex_signal
from dex_strategy_observations import inspect as inspect_dex_strategy
from dex_paper_risk import review as review_paper_risk
from dex_trade_intent import prepare_intent
from onekey_session import staging_status

HOST = "127.0.0.1"
DEFAULT_PORT = 8895


def payload(path, query):
    if path == "/funding-observations":
        asset = query.get("asset", ["BTC"])[0].upper()
        try:
            prepare("arbitrage", "hyperliquid", asset, "buy", 25)
            return 200, observed_funding(asset)
        except ValueError:
            return 400, {"ok": False, "error": "invalid_asset"}
    if path == "/paper-dex-intent":
        try:
            return 200, prepare_intent(
                query.get("bot", ["hunter"])[0],
                query.get("venue", ["hyperliquid"])[0],
                query.get("asset", ["BTC"])[0],
                query.get("side", ["long"])[0],
                query.get("notional", ["25"])[0])
        except ValueError:
            return 400, {"ok": False, "error": "invalid_dex_intent"}
    if path == "/paper-risk-review":
        try:
            return 200, review_paper_risk(
                query.get("bot", ["hunter"])[0],
                query.get("venue", ["hyperliquid"])[0],
                query.get("asset", ["BTC"])[0],
                query.get("side", ["long"])[0],
                query.get("notional", ["25"])[0],
                query.get("entry", ["100"])[0],
                query.get("stop", ["98"])[0],
                query.get("leverage", ["2"])[0])
        except ValueError:
            return 400, {"ok": False, "error": "invalid_paper_risk"}
    if path == "/paper-dex-strategy":
        bot = query.get("bot", ["hunter"])[0]
        asset = query.get("asset", ["BTC"])[0]
        side = query.get("side", ["long"])[0]
        notional = query.get("notional", ["25"])[0]
        try:
            prepare(bot, "hyperliquid", asset, side, notional)
            return 200, inspect_dex_strategy(bot, asset, side, notional, public_quotes(asset)["quotes"], observed_funding(asset))
        except ValueError:
            return 400, {"ok": False, "error": "invalid_strategy_review"}
    if path == "/paper-dex-assessment":
        bot = query.get("bot", ["hunter"])[0]
        asset = query.get("asset", ["BTC"])[0]
        side = query.get("side", ["long"])[0]
        notional = query.get("notional", ["25"])[0]
        try:
            prepare(bot, "hyperliquid", asset, side, notional)
            quotes = public_quotes(asset)["quotes"]
            return 200, assess_dex_signal(bot, asset, side, notional, quotes)
        except ValueError:
            return 400, {"ok": False, "error": "invalid_dex_assessment"}
    if path == "/paper-dex-batch":
        bot = query.get("bot", ["hunter"])[0]
        symbols = query.get("assets", ["BTC,ETH,SOL"])[0]
        side = query.get("side", ["long"])[0]
        notional = query.get("notional", ["25"])[0]
        try:
            assets = symbols.split(",")
            return 200, scan_dex_batch(bot, assets, side, notional)
        except ValueError:
            return 400, {"ok": False, "error": "invalid_dex_batch"}
    if path == "/paper-dex-route":
        bot = query.get("bot", ["hunter"])[0]
        asset = query.get("asset", ["BTC"])[0]
        side = query.get("side", ["long"])[0]
        notional = query.get("notional", ["25"])[0]
        try:
            prepare(bot, "hyperliquid", asset, side, notional)
            quotes = public_quotes(asset)["quotes"]
            return 200, select_paper_route(bot, asset, side, notional, quotes)
        except ValueError:
            return 400, {"ok": False, "error": "invalid_dex_route"}
    if path == "/paper-spreads":
        asset = query.get("asset", ["BTC"])[0].upper()
        notional = query.get("notional", ["25"])[0]
        try:
            prepare("arbitrage", "hyperliquid", asset, "buy", notional)
            snapshots = public_quotes(asset)["quotes"]
            accepted = {}
            for venue, book in snapshots.items():
                checked = validate_book(venue, asset, book, book.get("receivedAt"))
                if checked["quoteUsable"]:
                    accepted[venue] = checked
            return 200, compare(asset, notional, accepted)
        except ValueError:
            return 400, {"ok": False, "error": "invalid_comparison"}
    if path == "/paper-quote-review":
        bot = query.get("bot", ["arbitrage"])[0]
        venue = query.get("venue", ["hyperliquid"])[0]
        asset = query.get("asset", ["BTC"])[0]
        side = query.get("side", ["long"])[0]
        notional = query.get("notional", ["25"])[0]
        try:
            draft = prepare(bot, venue, asset, side, notional)
            if venue not in ("hyperliquid", "dydx", "paradex", "lighter", "extended"):
                return 200, assess(bot, venue, asset, side, notional)
            quote = public_quotes(asset)["quotes"].get(venue, {})
            checked = validate_book(venue, asset, quote, quote.get("receivedAt"))
            return 200, assess(bot, venue, asset, side, notional,
                               checked if checked["quoteUsable"] else None)
        except ValueError:
            return 400, {"ok": False, "error": "invalid_trade_proposal"}
    if path == "/paper-prepare":
        try:
            return 200, prepare(
                query.get("bot", ["arbitrage"])[0],
                query.get("venue", ["hyperliquid"])[0],
                query.get("asset", ["BTC"])[0],
                query.get("side", ["long"])[0],
                query.get("notional", ["25"])[0])
        except ValueError:
            return 400, {"ok": False, "error": "invalid_trade_proposal"}
    if path == "/agent-wallet":
        bot = query.get("bot", ["arbitrage"])[0]
        try:
            provider = query.get("provider", ["onekey"])[0]
            return 200, wallet_status(bot, status_provider=staging_status if provider == "onekey" else None, provider=provider)
        except ValueError:
            return 400, {"ok": False, "error": "unknown_bot"}
    if path == "/markets":
        return 200, discover()
    if path == "/public-markets":
        asset = query.get("asset", ["BTC"])[0].upper()
        try:
            return 200, public_quotes(asset)
        except ValueError:
            return 400, {"ok": False, "error": "invalid_asset"}
    if path == "/health":
        return 200, {"ok": True, "service": "aurelis-arbitrage-staging",
                     "paperMode": True, "liveTradingEnabled": False,
                     "liveTransfersEnabled": False, "dataSource": "synthetic"}
    if path == "/treasury":
        return 200, {"mode": "paper", "walletSessionConfigured": False,
                     "liveTradingEnabled": False, "liveTransfersEnabled": False}
    if path == "/status":
        return 200, {"ok": True, "mode": "paper", "readyVenues": [],
                     "readyVenueCount": 0, "topOpportunity": None}
    if path in ("/scan", "/dex-scan"):
        try:
            target = float(query.get("target", ["25"])[0])
        except (ValueError, OverflowError):
            return 400, {"ok": False, "error": "invalid_target"}
        if not 5 <= target <= 10000:
            return 400, {"ok": False, "error": "invalid_target"}
        return 200, {"ok": True, "mode": "paper", "dataSource": "synthetic",
                     "targetNotionalPerLegUsd": target,
                     "balances": {}, "quotes": {}, "opportunities": [],
                     "executionReady": False,
                     "warning": "Staging fixtures only; no external market requests"}
    return 404, {"ok": False, "error": "not_found"}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlsplit(self.path)
        status, data = payload(parsed.path, parse_qs(parsed.query))
        raw = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()
    ThreadingHTTPServer((HOST, args.port), Handler).serve_forever()

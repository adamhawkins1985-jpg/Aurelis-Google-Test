"""Isolated staging HTTP API. Synthetic fixtures only; no wallets, credentials or orders."""
import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs
from public_quotes import ASSETS, public_quotes

HOST = "127.0.0.1"
DEFAULT_PORT = 8895


def payload(path, query):
    if path == "/public-markets":
        asset = query.get("asset", ["BTC"])[0].upper()
        if asset not in ASSETS:
            return 400, {"ok": False, "error": "unsupported_asset"}
        return 200, public_quotes(asset)
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

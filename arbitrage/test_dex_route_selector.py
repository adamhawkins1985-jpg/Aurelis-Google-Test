import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).parent))
from dex_route_selector import select_paper_route
from agent_wallet_service import BOT_IDS


class DexRouteTests(unittest.TestCase):
    @patch("dex_route_selector.validate_book")
    @patch("dex_route_selector.depth_fill")
    def test_all_bots_use_dex_only(self, depth, validate):
        validate.side_effect = lambda venue, asset, quote, received_at: {
            "quoteUsable": True, "asks": [[100, 2]], "bids": [[99, 2]]}
        depth.return_value = {"vwapUsd": 100}
        for bot in BOT_IDS:
            result = select_paper_route(bot, "BTC", "long", "25", {
                "hyperliquid": {"receivedAt": 1}, "extended": {"receivedAt": 1}})
            self.assertIn(result["preferredVenue"], {"extended", "hyperliquid"})
            self.assertEqual(result["wallet"], "onekey")
            self.assertFalse(result["executionReady"])
            self.assertEqual(result["ordersSubmitted"], 0)

    def test_unknown_venue_cannot_be_routed(self):
        result = select_paper_route("hunter", "BTC", "buy", 25, {
            "kraken": {"receivedAt": 1}})
        self.assertIsNone(result["preferredVenue"])
        self.assertEqual(result["rejected"]["kraken"], "unsupported_venue")

    def test_invalid_size_fails_closed(self):
        with self.assertRaises(ValueError):
            select_paper_route("grid", "BTC", "long", 101, {})


if __name__ == "__main__":
    unittest.main()

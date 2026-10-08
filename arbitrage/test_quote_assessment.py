import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from quote_assessment import assess


class AssessmentTests(unittest.TestCase):
    def test_fresh_indicative_not_executable(self):
        item = assess("arbitrage", "hyperliquid", "BTC", "long", 25,
                      {"venue": "hyperliquid", "asset": "BTC", "ask": 100, "bid": 99, "receivedAt": 1000}, now=1001)
        self.assertTrue(item["quoteVerified"])
        self.assertEqual(item["indicativePriceUsd"], 100)
        for field in ("executionReady", "orderSubmitted", "signingAllowed", "feesVerified", "liquidityVerified", "fundingVerified"):
            self.assertFalse(item[field])
        self.assertIsNone(item["estimatedNetSpreadPct"])

    def test_stale_and_bad_quotes_rejected(self):
        base = {"venue": "dydx", "asset": "ETH", "ask": 100, "receivedAt": 1000}
        for change in ({"receivedAt": 900}, {"receivedAt": 1005}, {"ask": -1},
                       {"ask": float("nan")}, {"venue": "other"}, {"receivedAt": "1000"}):
            data = dict(base, **change)
            with self.subTest(change=change):
                result = assess("hunter", "dydx", "ETH", "buy", 10, data, now=1001)
                self.assertFalse(result["quoteVerified"])
                self.assertFalse(result["executionReady"])

    def test_depth_adjusted_review_cannot_trade(self):
        result = assess("arbitrage", "hyperliquid", "BTC", "long", 25,
                        {"venue": "hyperliquid", "asset": "BTC", "ask": 100, "bid": 99,
                         "asks": [[100, 0.1], [110, 1]], "receivedAt": 1000},
                        now=1001)
        self.assertTrue(result["liquidityVerified"])
        self.assertGreater(result["depthAdjustedVwapUsd"], 100)
        self.assertFalse(result["feesVerified"])
        self.assertFalse(result["executionReady"])
        self.assertIsNone(result["estimatedNetSpreadPct"])

    def test_wrong_side_does_not_use_ask(self):
        result = assess("grid", "dydx", "SOL", "sell", 10,
                        {"venue": "dydx", "asset": "SOL", "ask": 110, "receivedAt": 1000}, now=1000)
        self.assertFalse(result["quoteVerified"])
        self.assertIsNone(result["indicativePriceUsd"])


if __name__ == "__main__":
    unittest.main()

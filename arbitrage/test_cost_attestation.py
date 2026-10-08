import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from cost_attestation import VerifiedCosts, verify_costs
from quote_assessment import assess


class CostTrustTests(unittest.TestCase):
    def test_no_adapter_means_unknown_costs(self):
        self.assertIsNone(verify_costs("hyperliquid"))
        review = assess("arbitrage", "hyperliquid", "BTC", "buy", 25, {
            "venue": "hyperliquid", "asset": "BTC", "bid": 99, "ask": 100,
            "asks": [[100, 1]], "receivedAt": 100,
            "takerFeeBps": 0, "fundingBps": 0,
            "feeSourceVerified": True, "fundingSourceVerified": True,
        }, now=100)
        self.assertTrue(review["liquidityVerified"])
        self.assertFalse(review["feesVerified"])
        self.assertFalse(review["fundingVerified"])
        self.assertIsNone(review["estimatedCosts"])

    def test_strict_server_adapter_type(self):
        self.assertIsNone(verify_costs("dydx", trusted_adapter=lambda venue: {
            "venue": venue, "taker_fee_bps": 0, "funding_bps": 0
        }))
        good = VerifiedCosts("dydx", 5, 0, "exchange_public_fee_schedule")
        self.assertEqual(verify_costs("dydx", trusted_adapter=lambda venue: good), good)
        self.assertIsNone(verify_costs("hyperliquid", trusted_adapter=lambda venue: good))

if __name__ == "__main__":
    unittest.main()

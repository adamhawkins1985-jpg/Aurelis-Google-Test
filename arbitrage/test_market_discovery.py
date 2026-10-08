"""Market discovery tests using fixture responses, with no external requests."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import market_discovery


class DiscoveryTests(unittest.TestCase):
    def setUp(self):
        market_discovery._CACHE.update(at=0.0, data=None)

    def test_dynamic_overlap(self):
        def response(url, data=None):
            if "hyperliquid" in url:
                return {"universe": [{"name": "BTC"}, {"name": "ETH"}, {"name": "SOL"}, {"name": "../bad"}]}
            return {"markets": {"BTC-USD": {"status": "ACTIVE"},
                                "SOL-USD": {"status": "ACTIVE"},
                                "DOGE-USD": {"status": "ACTIVE"},
                                "PAUSED-USD": {"status": "OFFLINE"}}}
        with patch.object(market_discovery, "_json", side_effect=response):
            result = market_discovery.discover(force=True)
        self.assertEqual(result["overlappingAssets"], ["BTC", "SOL"])
        self.assertIn("DOGE", result["assets"])
        self.assertEqual(result["overlapCount"], 2)
        self.assertFalse(result["executionReady"])

    def test_outage_does_not_fabricate_assets(self):
        with patch.object(market_discovery, "_json", side_effect=TimeoutError):
            result = market_discovery.discover(force=True)
        self.assertEqual(result["assetCount"], 0)
        self.assertEqual(result["overlapCount"], 0)
        self.assertTrue(all(not v["ok"] for v in result["venues"].values()))


if __name__ == "__main__":
    unittest.main()

import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).parent))
import funding_observations as funding


class FundingTests(unittest.TestCase):
    def test_observations_never_certify_costs(self):
        def fixture(url, data=None):
            if "hyperliquid" in url:
                return [{"universe": [{"name": "BTC"}, {"name": "ETH"}]},
                        [{"funding": "0.00001"}, {"funding": "-0.00002"}]]
            return {"markets": {"ETH-USD": {"nextFundingRate": "0.00003"}}}
        with patch.object(funding, "_json", side_effect=fixture):
            data = funding.observed_funding("ETH")
        self.assertEqual(data["venues"]["hyperliquid"]["hourlyFundingRate"], -0.00002)
        self.assertEqual(data["venues"]["dydx"]["nextFundingRate"], 0.00003)
        self.assertFalse(data["executionReady"])
        self.assertTrue(all(not x["costsVerified"] for x in data["venues"].values()))

    def test_outages_fail_closed(self):
        with patch.object(funding, "_json", side_effect=TimeoutError):
            data = funding.observed_funding("BTC")
        self.assertTrue(all(x.get("hourlyFundingRate", x.get("nextFundingRate")) is None
                            for x in data["venues"].values()))

if __name__ == "__main__":
    unittest.main()

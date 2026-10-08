import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from spread_comparison import compare

def book(bid, ask, at=100, fees=False):
    data = {"bid": bid, "ask": ask, "bids": [[bid, 10]], "asks": [[ask, 10]], "receivedAt": at}
    if fees:
        data.update(takerFeeBps=5, fundingBps=0, feeSourceVerified=True, fundingSourceVerified=True)
    return data

class SpreadTests(unittest.TestCase):
    def test_no_costs_means_no_net_claim(self):
        result = compare("BTC", 25, {"hyperliquid": book(99, 100), "dydx": book(103, 104)}, now=100)
        self.assertEqual(len(result["candidates"]), 2)
        positive = next(x for x in result["candidates"] if x["buyVenue"] == "hyperliquid")
        self.assertGreater(positive["grossSpreadPct"], 0)
        self.assertIsNone(positive["estimatedNetSpreadPct"])
        self.assertFalse(positive["tradeReady"])

    def test_untrusted_cost_flags_cannot_certify_profit(self):
        result = compare("ETH", 25, {"hyperliquid": book(99, 100, fees=True), "dydx": book(103, 104, fees=True)}, now=100)
        positive = next(x for x in result["candidates"] if x["buyVenue"] == "hyperliquid")
        self.assertFalse(positive["costsVerified"])
        self.assertIsNone(positive["estimatedNetSpreadPct"])
        self.assertFalse(positive["orderSubmitted"])

    def test_async_quotes_excluded_even_when_individually_fresh(self):
        result = compare("BTC", 25, {
            "hyperliquid": book(99, 100, at=100),
            "dydx": book(103, 104, at=105),
        }, now=106)
        self.assertEqual(result["candidates"], [])

    def test_stale_or_insufficient_depth_excluded(self):
        result = compare("SOL", 25, {"hyperliquid": book(100, 101, at=10), "dydx": book(103, 104)}, now=100)
        self.assertEqual(result["candidates"], [])
        result = compare("SOL", 25, {"hyperliquid": dict(book(100, 101), bids=[[100, .001]]), "dydx": book(103, 104)}, now=100)
        self.assertTrue(all(x["sellVenue"] != "hyperliquid" for x in result["candidates"]))

if __name__ == "__main__":
    unittest.main()

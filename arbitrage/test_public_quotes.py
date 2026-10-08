"""Public quote safety and parsing tests. Network is fully mocked."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).parent))
import public_quotes


class PublicQuoteTests(unittest.TestCase):
    def test_best_quotes_without_private_access(self):
        def fixture(url, data=None):
            if "hyperliquid" in url:
                self.assertEqual(data, {"type": "l2Book", "coin": "BTC"})
                return {"levels": [[{"px": "100", "sz": "1"}], [{"px": "101", "sz": "2"}]]}
            self.assertIsNone(data)
            if "zklighter" in url:
                if "orderBookOrders" in url:
                    self.assertIn("market_id=1", url)
                    return {"code": 200, "bids": [{"price": "97", "remaining_base_amount": "3"}],
                            "asks": [{"price": "104", "remaining_base_amount": "3"}]}
                return {"order_books": [{"symbol": "BTC", "market_type": "perp",
                                         "status": "active", "market_id": 1}]}
            if "paradex" in url:
                return {"market": "BTC-USD-PERP", "bids": [["98", "2"]], "asks": [["103", "2"]]}
            return {"bids": [{"price": "99", "size": "1"}],
                    "asks": [{"price": "102", "size": "1"}]}
        with patch.object(public_quotes, "_json", side_effect=fixture):
            result = public_quotes.public_quotes("BTC")
        self.assertEqual(result["dataSource"], "public_read_only")
        self.assertFalse(result["executionReady"])
        self.assertEqual(result["quotes"]["hyperliquid"]["bid"], 100)
        self.assertEqual(result["quotes"]["dydx"]["ask"], 102)
        self.assertEqual(result["quotes"]["lighter"]["bid"], 97)
        self.assertEqual(result["quotes"]["lighter"]["asks"], [[104.0, 3.0]])
        self.assertEqual(result["quotes"]["paradex"]["bid"], 98)
        self.assertEqual(result["quotes"]["paradex"]["asks"], [[103.0, 2.0]])
        self.assertTrue(all(not x["executionReady"] for x in result["quotes"].values()))

    def test_network_failure_returns_no_quotes(self):
        with patch.object(public_quotes, "_json", side_effect=TimeoutError):
            result = public_quotes.public_quotes("ETH")
        self.assertIsNone(result["quotes"]["hyperliquid"]["bid"])
        self.assertIsNone(result["quotes"]["dydx"]["ask"])
        self.assertIsNone(result["quotes"]["paradex"]["ask"])
        self.assertIsNone(result["quotes"]["lighter"]["ask"])
        self.assertFalse(result["executionReady"])

    def test_reject_unknown_asset(self):
        with self.assertRaises(ValueError):
            public_quotes.public_quotes("../../etc/passwd")


if __name__ == "__main__":
    unittest.main()

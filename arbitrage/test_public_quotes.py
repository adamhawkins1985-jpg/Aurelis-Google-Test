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
            return {"bids": [{"price": "99", "size": "1"}],
                    "asks": [{"price": "102", "size": "1"}]}
        with patch.object(public_quotes, "_json", side_effect=fixture):
            result = public_quotes.public_quotes("BTC")
        self.assertEqual(result["dataSource"], "public_read_only")
        self.assertFalse(result["executionReady"])
        self.assertEqual(result["quotes"]["hyperliquid"]["bid"], 100)
        self.assertEqual(result["quotes"]["dydx"]["ask"], 102)
        self.assertTrue(all(not x["executionReady"] for x in result["quotes"].values()))

    def test_network_failure_returns_no_quotes(self):
        with patch.object(public_quotes, "_json", side_effect=TimeoutError):
            result = public_quotes.public_quotes("ETH")
        self.assertIsNone(result["quotes"]["hyperliquid"]["bid"])
        self.assertIsNone(result["quotes"]["dydx"]["ask"])
        self.assertFalse(result["executionReady"])

    def test_reject_unknown_asset(self):
        with self.assertRaises(ValueError):
            public_quotes.public_quotes("DOGE")


if __name__ == "__main__":
    unittest.main()

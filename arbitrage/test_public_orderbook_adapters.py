import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
from dex_adapters import ASSETS, DydxDex, HyperliquidDex


class PublicOrderbookAdapterTests(unittest.TestCase):
    @patch("dex_adapters.requests.post")
    def test_hyperliquid_valid_book(self, post):
        post.return_value.json.return_value = {
            "levels": [[{"px": "100", "sz": "1"}], [{"px": "101", "sz": "1"}]]
        }
        result = HyperliquidDex().quotes(25)
        self.assertEqual(set(result), set(ASSETS))
        for quote in result.values():
            self.assertEqual((quote.bid, quote.ask), (100, 101))
            self.assertIsNone(quote.error)

    @patch("dex_adapters.requests.post")
    def test_hyperliquid_malformed_payload_fails_closed(self, post):
        post.return_value.json.return_value = {"levels": "invalid"}
        result = HyperliquidDex().quotes(25)
        for quote in result.values():
            self.assertIsNone(quote.bid)
            self.assertIsNone(quote.ask)

    @patch("dex_adapters.requests.get")
    def test_dydx_valid_book(self, get):
        get.return_value.json.return_value = {
            "bids": [{"price": "100", "size": "1"}],
            "asks": [{"price": "101", "size": "1"}],
        }
        result = DydxDex().quotes(25)
        self.assertEqual(set(result), set(ASSETS))
        for quote in result.values():
            self.assertEqual((quote.bid, quote.ask), (100, 101))
            self.assertIsNone(quote.error)

    @patch("dex_adapters.requests.get")
    def test_dydx_malformed_book_fails_closed(self, get):
        get.return_value.json.return_value = {"bids": [{"price": "NaN", "size": "1"}], "asks": []}
        result = DydxDex().quotes(25)
        for quote in result.values():
            self.assertIsNone(quote.bid)
            self.assertIsNone(quote.ask)


if __name__ == "__main__":
    unittest.main()

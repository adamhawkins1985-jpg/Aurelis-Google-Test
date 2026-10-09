import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
from dex_adapters import GmxDex


class GmxOracleValidationTests(unittest.TestCase):
    @patch("dex_adapters.requests.get")
    def test_invalid_asset_does_not_poison_valid_assets(self, get):
        rows = [
            {"tokenSymbol": "BTC", "minPrice": "NaN", "maxPrice": "100"},
            {"tokenSymbol": "ETH", "minPrice": str(2000 * 10**12), "maxPrice": str(2010 * 10**12)},
            {"tokenSymbol": "SOL", "minPrice": "0", "maxPrice": "100"},
        ]
        get.return_value.json.return_value = rows
        result = GmxDex().quotes(25)
        self.assertEqual(result["BTC"].error, "invalid_oracle_price")
        self.assertIsNone(result["BTC"].bid)
        self.assertEqual(result["SOL"].error, "invalid_oracle_price")
        self.assertEqual(result["ETH"].bid, 2000)
        self.assertEqual(result["ETH"].ask, 2010)
        self.assertTrue(all(q.data_only for q in result.values()))

    @patch("dex_adapters.requests.get")
    def test_reject_reversed_and_infinite_oracle_prices(self, get):
        get.return_value.json.return_value = [
            {"tokenSymbol": "BTC", "minPrice": "200", "maxPrice": "100"},
            {"tokenSymbol": "ETH", "minPrice": "Infinity", "maxPrice": "Infinity"},
        ]
        result = GmxDex().quotes(25)
        self.assertEqual(result["BTC"].error, "invalid_oracle_price")
        self.assertEqual(result["ETH"].error, "invalid_oracle_price")
        self.assertEqual(result["SOL"].error, "missing_market")


if __name__ == "__main__":
    unittest.main()

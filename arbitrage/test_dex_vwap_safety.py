import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from dex_adapters import _vwap


class DexVwapSafetyTests(unittest.TestCase):
    def test_valid_depth(self):
        self.assertEqual(_vwap([[100, 1]], 25), 100)

    def test_insufficient_depth(self):
        self.assertIsNone(_vwap([[100, 0.1]], 25))

    def test_reject_invalid_target(self):
        for target in (0, -1, float("nan"), float("inf")):
            with self.subTest(target=target):
                self.assertIsNone(_vwap([[100, 1]], target))

    def test_reject_malformed_or_nonfinite_levels(self):
        for row in ([float("nan"), 1], [100, float("inf")], [float("inf"), 1],
                    [100, -1], [100], {"price": "invalid", "size": 1},
                    {"price": 100}, None):
            with self.subTest(row=row):
                self.assertIsNone(_vwap([row], 25))


if __name__ == "__main__":
    unittest.main()

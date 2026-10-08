import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from depth_pricing import depth_fill, estimate_costs


class DepthPricingTests(unittest.TestCase):
    def test_multi_level_fill(self):
        result = depth_fill([[100, 0.1], [110, 1]], 21)
        self.assertIsNotNone(result)
        self.assertGreater(result["vwapUsd"], 100)
        self.assertLess(result["vwapUsd"], 110)
        self.assertAlmostEqual(result["filledNotionalUsd"], 21)

    def test_rejects_insufficient_depth(self):
        self.assertIsNone(depth_fill([[100, 0.1]], 21))

    def test_invalid_levels(self):
        for book in ([[0, 1]], [[100, -1]], [[100, float("nan")]], [[100]], ["bad"]):
            with self.subTest(book=book):
                self.assertIsNone(depth_fill(book, 20))

    def test_fee_calculation_requires_verified_inputs(self):
        self.assertIsNone(estimate_costs(25))
        self.assertIsNone(estimate_costs(25, 5, None))
        result = estimate_costs(100, 10, 5)
        self.assertAlmostEqual(result["estimatedTotalCostsUsd"], 0.15)
        self.assertEqual(estimate_costs(100, 0, 0)["estimatedTotalCostsUsd"], 0)


if __name__ == "__main__":
    unittest.main()

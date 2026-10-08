"""Isolated paper calculations; never import engine.py or connect to exchanges."""
import ast
from concurrent.futures import ThreadPoolExecutor
from itertools import permutations
from pathlib import Path
import unittest


def load_functions(*names):
    source = Path(__file__).with_name("engine.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    selected = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names]
    if set(names) != {node.name for node in selected}:
        raise AssertionError("Expected engine functions missing")
    namespace = {
        "ThreadPoolExecutor": ThreadPoolExecutor,
        "permutations": permutations,
        "CFG": {
            "scanner_venues": ["kraken", "okx"],
            "min_net_spread_pct": 0.4,
            "paper_mode": True,
        },
        "ASSETS": ("BTC",),
    }
    exec(compile(ast.Module(body=selected, type_ignores=[]), "<isolated-engine-functions>", "exec"), namespace)
    return namespace


class PaperCalculationTests(unittest.TestCase):
    def setUp(self):
        self.engine = load_functions("vwap_cex", "vwap_kalshi", "scan")

    def test_vwap_single_level(self):
        self.assertAlmostEqual(self.engine["vwap_cex"]([[100, 2]], 50, 1), 100)

    def test_vwap_crosses_depth_levels(self):
        # $50 at $100 and $50 at $200 buys 0.75 base
        self.assertAlmostEqual(self.engine["vwap_cex"]([[100, 0.5], [200, 1]], 100, 1), 100 / 0.75)

    def test_vwap_quote_conversion(self):
        self.assertAlmostEqual(self.engine["vwap_cex"]([[100, 1]], 50, 1.1), 110)

    def test_reject_insufficient_depth(self):
        self.assertIsNone(self.engine["vwap_cex"]([[100, 0.1]], 50, 1))
        self.assertIsNone(self.engine["vwap_kalshi"]([[100, 0.1]], 50, 1))

    def test_skip_invalid_levels(self):
        self.assertAlmostEqual(self.engine["vwap_cex"]([[0, 1], [-1, 1], [100, 1]], 50, 1), 100)

    def test_kalshi_contract_size(self):
        self.assertAlmostEqual(self.engine["vwap_kalshi"]([[100, 2]], 100, 0.01), 10000)

    def run_scan(self, bid, short_ready=True, taker=0.001):
        n = self.engine
        n["collateral_status"] = lambda target: {
            "kraken": {"ready": True},
            "okx": {"ready": short_ready},
        }
        n["collect_quotes"] = lambda target: (
            {"BTC": {"kraken": {"ask": 100, "bid": 99},
                     "okx": {"ask": 102, "bid": bid}}},
            {"kraken": {"BTC": taker}, "okx": {"BTC": taker}},
            {"USD": 1.0},
        )
        return n["scan"](25)

    def test_profitable_funded_paper_opportunity(self):
        data = self.run_scan(101)
        top = data["opportunities"][0]
        self.assertEqual(data["mode"], "paper")
        self.assertEqual(top["longVenue"], "kraken")
        self.assertAlmostEqual(top["grossSpreadPct"], 1.0)
        self.assertAlmostEqual(top["roundTripFeePct"], 0.4)
        self.assertAlmostEqual(top["netSpreadBeforeFundingPct"], 0.6)
        self.assertTrue(top["funded"])
        self.assertTrue(top["executable"])  # scanner's label, not an order

    def test_unfunded_opportunity_not_executable(self):
        top = self.run_scan(101, short_ready=False)["opportunities"][0]
        self.assertFalse(top["funded"])
        self.assertFalse(top["executable"])

    def test_fees_can_eliminate_opportunity(self):
        top = self.run_scan(100.5, taker=0.002)["opportunities"][0]
        self.assertLess(top["netSpreadBeforeFundingPct"], 0.4)
        self.assertFalse(top["executable"])


if __name__ == "__main__":
    unittest.main()

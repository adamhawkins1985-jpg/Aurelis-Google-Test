import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).parent))
from dex_signal_risk import analyze
from agent_wallet_service import BOT_IDS


class RiskTests(unittest.TestCase):
    @patch("dex_signal_risk.select_paper_route")
    def test_all_bots_fail_closed_without_verified_risk(self, selector):
        selector.return_value = {"candidates": [{"venue": "extended"}], "preferredVenue": "extended", "notionalUsd": "25"}
        quotes = {"extended": {"bid": 99, "ask": 100}}
        for bot in BOT_IDS:
            x = analyze(bot, "BTC", "long", 25, quotes)
            self.assertEqual(x["qualifiedSignals"], [])
            self.assertEqual(x["ordersSubmitted"], 0)
            self.assertFalse(x["executionReady"])
            self.assertEqual(x["venueAssessments"][0]["spreadBps"], 100.0)
            self.assertTrue(x["venueAssessments"][0]["spreadCheckPassed"])
            self.assertFalse(x["venueAssessments"][0]["directionalSignalVerified"])

    @patch("dex_signal_risk.select_paper_route")
    def test_bad_books_cannot_pass_spread(self, selector):
        selector.return_value = {"candidates": [{"venue": "extended"}], "preferredVenue": "extended", "notionalUsd": "25"}
        for bid, ask in ((100, 100), (101, 100), (-1, 100), (None, 100)):
            x = analyze("hunter", "BTC", "long", 25, {"extended": {"bid": bid, "ask": ask}})
            self.assertFalse(x["venueAssessments"][0]["spreadCheckPassed"])

if __name__ == "__main__":
    unittest.main()

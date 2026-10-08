import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from agent_wallet_service import BOT_IDS
from paper_router import prepare


class PaperRouterTests(unittest.TestCase):
    def test_each_bot_review_only(self):
        for bot in BOT_IDS:
            trade = prepare(bot, "hyperliquid", "BTC", "long", "25")
            self.assertEqual(trade["bot"], bot)
            self.assertEqual(trade["type"], "review_only")
            self.assertFalse(trade["executionReady"])
            self.assertFalse(trade["signingAllowed"])
            self.assertFalse(trade["transferAllowed"])
            self.assertFalse(trade["orderSubmitted"])

    def test_invalid_notional_and_untrusted_values(self):
        for bad in ("0", "-1", "100.01", "NaN", "Infinity", "hello", True):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                prepare("arbitrage", "dydx", "ETH", "buy", bad)

    def test_unknown_fields_rejected(self):
        for kwargs in ({"bot": "other"}, {"venue": "unknown"},
                       {"asset": "../../BAD"}, {"side": "withdraw"}):
            params = dict(bot="grid", venue="lighter", asset="SOL", side="sell", notional_usd=10)
            params.update(kwargs)
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                prepare(**params)


if __name__ == "__main__":
    unittest.main()

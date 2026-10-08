import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from dex_trade_intent import prepare_intent, VENUE_REQUIREMENTS
from agent_wallet_service import BOT_IDS

class DexTradeIntentTests(unittest.TestCase):
    def test_every_bot_venue_is_nonexecuting(self):
        for bot in BOT_IDS:
            for venue in VENUE_REQUIREMENTS:
                with self.subTest(bot=bot,venue=venue):
                    d=prepare_intent(bot,venue,"BTC","long",25)
                    self.assertEqual(d["walletProvider"],"onekey")
                    self.assertFalse(d["executionReady"])
                    self.assertFalse(d["walletSessionSufficientForTrading"])
                    self.assertFalse(d["venueSignerAdapterImplemented"])
                    self.assertTrue(d["signingRequirements"])
                    self.assertFalse(d["walletApprovalRequested"])
                    self.assertIsNone(d["transactionPayload"])
                    self.assertFalse(d["collateralBalanceVerified"])
                    self.assertEqual(d["ordersSubmitted"],0)
    def test_bad_venue_and_notional_rejected(self):
        for venue,notional in (("kraken",25),("hyperliquid",101)):
            with self.assertRaises(ValueError):
                prepare_intent("hunter",venue,"BTC","long",notional)

if __name__=="__main__":unittest.main()

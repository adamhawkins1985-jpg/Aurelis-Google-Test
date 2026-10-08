import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from dex_paper_risk import review
from agent_wallet_service import BOT_IDS

class PaperRiskTests(unittest.TestCase):
    def test_seven_bots_review_only(self):
        for bot in BOT_IDS:
            r=review(bot,"hyperliquid","BTC","long",25,100,98,2)
            self.assertEqual(r["estimatedInitialMarginUsd"],"12.5000")
            self.assertEqual(r["estimatedLossAtStopUsdBeforeCosts"],"0.5000")
            self.assertFalse(r["executionReady"])
            self.assertIsNone(r["estimatedLiquidationPriceUsd"])
            self.assertFalse(r["stopOrderPlaced"])
    def test_reject_wrong_side_and_unaffordable_risk(self):
        for args in [("long",100,101,2),("short",100,99,2),("long",100,40,2),("long",100,98,21)]:
            with self.subTest(args=args),self.assertRaises(ValueError):
                review("hunter","dydx","BTC",args[0],25,args[1],args[2],args[3])
    def test_reject_invalid_values(self):
        for entry in (float("nan"), True, "garbage", 0):
            with self.assertRaises(ValueError):
                review("hunter","extended","ETH","long",25,entry,90,2)
if __name__=="__main__": unittest.main()

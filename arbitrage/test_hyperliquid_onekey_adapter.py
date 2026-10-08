import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from hyperliquid_onekey_adapter import inspect_hyperliquid
from agent_wallet_service import BOT_IDS

class HyperliquidSignerReadinessTests(unittest.TestCase):
    def test_all_bots_fail_closed(self):
        for bot in BOT_IDS:
            r=inspect_hyperliquid(bot,"BTC","long",25,"0xd2919c82e5fecbb0c4Be7A7C37bFC066579F233e")
            self.assertEqual(r["signatureSchemeRequired"],"hyperliquid_l1_action_eip712_agent")
            self.assertFalse(r["executionReady"])
            self.assertFalse(r["approvalRequested"])
            self.assertFalse(r["authorizedAgentVerified"])
            self.assertIsNone(r["signature"])
            self.assertIsNone(r["orderPayload"])
            self.assertEqual(r["ordersSubmitted"],0)
    def test_bad_public_wallet_rejected(self):
        for address in ("invalid", "0x"+"z"*40, True, "0x123"):
            with self.assertRaises(ValueError):
                inspect_hyperliquid("hunter","BTC","long",25,address)
    def test_reject_invalid_venue_proposal(self):
        with self.assertRaises(ValueError):
            inspect_hyperliquid("hunter","BTC","long",101)
if __name__=="__main__":unittest.main()

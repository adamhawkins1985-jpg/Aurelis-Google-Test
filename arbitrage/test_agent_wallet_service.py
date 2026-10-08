"""Wallet permissions and metadata tests; no OneKey CLI or network calls."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from agent_wallet_service import BOT_IDS, authorize, wallet_status


class WalletBoundaryTests(unittest.TestCase):
    def test_every_bot_is_read_only(self):
        self.assertEqual(len(BOT_IDS), 7)
        for bot in BOT_IDS:
            state = wallet_status(bot)
            self.assertEqual(state["provider"], "onekey")
            self.assertFalse(state["authenticated"])
            self.assertFalse(state["executionReady"])
            self.assertEqual(state["permissions"], {
                "read": True, "prepare": False, "sign": False, "transfer": False
            })
            self.assertEqual(state["maxNotionalUsd"], 0.0)
            for action in ("prepare", "sign", "transfer", "trade", "withdraw", "approve"):
                self.assertFalse(authorize(bot, action))

    def test_no_secrets_returned(self):
        status = wallet_status("arbitrage", lambda: {
            "authenticated": True, "displayAddress": "0xpublic",
            "walletKind": "hd", "hasSecrets": True,
            "privateKey": "never", "mnemonic": "never", "token": "never"
        })
        self.assertEqual(status["address"], "0xpublic")
        self.assertFalse(set(status) & {"privateKey", "mnemonic", "token", "hasSecrets"})
        self.assertFalse(status["executionReady"])

    def test_unknown_bot_denied(self):
        self.assertFalse(authorize("unknown", "read"))
        with self.assertRaises(ValueError):
            wallet_status("unknown")


if __name__ == "__main__":
    unittest.main()

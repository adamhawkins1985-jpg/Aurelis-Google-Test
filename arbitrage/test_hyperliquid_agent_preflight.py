import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from hyperliquid_agent_preflight import preflight
from agent_wallet_service import BOT_IDS

M="0xd2919c82e5fecbb0c4Be7A7C37bFC066579F233e"
A="0x1111111111111111111111111111111111111111"
class AgentPreflightTests(unittest.TestCase):
    def test_all_bots_fail_closed(self):
        for bot in BOT_IDS:
            result=preflight(bot,"BTC","long",25,M,A,"Testnet")
            self.assertFalse(result["signingRequested"])
            self.assertFalse(result["exchangeRequestSent"])
            self.assertFalse(result["executionReady"])
            self.assertFalse(result["authorizationVerified"])
            self.assertEqual(result["ordersSubmitted"],0)
    def test_agent_must_differ(self):
        with self.assertRaises(ValueError): preflight("hunter","BTC","long",25,M,M)
    def test_invalid_network_and_address(self):
        for master,network in (("bad","Testnet"),(M,"wrong")):
            with self.assertRaises(ValueError): preflight("hunter","BTC","long",25,master,A,network)
if __name__=="__main__": unittest.main()

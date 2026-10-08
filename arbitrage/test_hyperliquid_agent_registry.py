import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from hyperliquid_agent_registry import authorized_agents
ADDR="0xd2919c82e5fecbb0c4Be7A7C37bFC066579F233e"
class TestRegistry(unittest.TestCase):
    def test_empty_agent_registry(self):
        result=authorized_agents(ADDR,"Testnet",lambda data:[])
        self.assertEqual(result["agentCount"],0)
        self.assertFalse(result["executionReady"])
        self.assertFalse(result["agentKeyCustodyVerified"])
    def test_existing_agent(self):
        result=authorized_agents(ADDR,"Mainnet",lambda data:[{"address":"0x"+"1"*40,"name":"AURELIS"}])
        self.assertEqual(result["agentCount"],1)
        self.assertFalse(result["walletOwnershipVerified"])
    def test_invalid_response_and_address(self):
        with self.assertRaises(ValueError):authorized_agents("bad","Testnet",lambda data:[])
        with self.assertRaises(ValueError):authorized_agents(ADDR,"Testnet",lambda data:{"error":"fake"})
if __name__=="__main__":unittest.main()

import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from hyperliquid_agent_signing_preview import preview
M="0xd2919c82e5fecbb0c4Be7A7C37bFC066579F233e"
A="0x1111111111111111111111111111111111111111"
class TestUnsignedApproval(unittest.TestCase):
    def test_preview_never_requests_signature(self):
        x=preview(M,A,"AURELIS","Testnet",123456789)
        self.assertEqual(x["action"]["type"],"approveAgent")
        self.assertEqual(x["action"]["signatureChainId"],"0x66eee")
        self.assertEqual(x["eip712PrimaryType"],"HyperliquidTransaction:ApproveAgent")
        self.assertFalse(x["signingRequested"])
        self.assertFalse(x["approvalBroadcast"])
        self.assertEqual(x["ordersSubmitted"],0)
    def test_fails_for_invalid_agent_or_nonce(self):
        for agent,nonce in ((M,123),(A,0),(A,True),("garbage",123)):
            with self.assertRaises(ValueError):
                preview(M,agent,"AURELIS","Testnet",nonce)
if __name__=="__main__":unittest.main()

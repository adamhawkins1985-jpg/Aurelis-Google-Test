import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from hyperliquid_account_observation import inspect_account

ADDR="0xd2919c82e5fecbb0c4Be7A7C37bFC066579F233e"
class AccountObservationTests(unittest.TestCase):
    def test_read_only_and_no_authorization_inference(self):
        def fetch(req):
            if req["type"]=="clearinghouseState":
                return {"marginSummary":{"accountValue":"42"},"withdrawable":"10","assetPositions":[]}
            return {"balances":[{"coin":"USDC"}]}
        result=inspect_account(ADDR,fetch)
        self.assertEqual(result["perpsAccountValueUsd"],"42")
        self.assertFalse(result["walletOwnershipVerified"])
        self.assertFalse(result["oneKeySignerAuthorized"])
        self.assertFalse(result["executionReady"])
        self.assertEqual(result["ordersSubmitted"],0)
    def test_reject_missing_or_invalid_metrics(self):
        for account_value, withdrawable in ((None,"0"),("1",None),("NaN","0"),("Infinity","0"),("-1","0"),("abc","0"),(0,"0")):
            def fetch(req):
                if req["type"]=="clearinghouseState":
                    return {"marginSummary":{"accountValue":account_value},"withdrawable":withdrawable,"assetPositions":[]}
                return {"balances":[]}
            with self.subTest(account_value=account_value,withdrawable=withdrawable):
                with self.assertRaisesRegex(ValueError,"invalid_exchange_response"):
                    inspect_account(ADDR,fetch)
    def test_zero_balances_are_valid_and_read_only(self):
        def fetch(req):
            if req["type"]=="clearinghouseState":
                return {"marginSummary":{"accountValue":"0"},"withdrawable":"0","assetPositions":[]}
            return {"balances":[]}
        result=inspect_account(ADDR,fetch)
        self.assertEqual(result["perpsAccountValueUsd"],"0")
        self.assertEqual(result["perpsWithdrawableUsd"],"0")
        self.assertFalse(result["executionReady"])
    def test_reject_bad_address(self):
        for address in ("bad","0x"+"Z"*40,None):
            with self.assertRaises(ValueError):
                inspect_account(address,lambda _: {})
    def test_reject_invalid_exchange_result(self):
        with self.assertRaises(ValueError):
            inspect_account(ADDR,lambda _: [])
if __name__=="__main__":unittest.main()

import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from subprocess import CompletedProcess, TimeoutExpired
sys.path.insert(0, str(Path(__file__).parent))
from onekey_session import read_onekey_status
from agent_wallet_service import wallet_status

CLI = "/home/aurelisdeploy/aurelis-staging/onekey-cli"
ADDR = "0x1111111111111111111111111111111111111111"


class OneKeyStatusTests(unittest.TestCase):
    def test_not_configured_or_wrong_path(self):
        self.assertFalse(read_onekey_status()["authenticated"])
        self.assertFalse(read_onekey_status("/opt/aurelis/arbitrage/onekey")["authenticated"])

    def test_valid_status_sanitizes_output_and_denies_execution(self):
        raw = '{"data":{"authStatus":"authenticated","displayAddress":"' + ADDR + '","walletKind":"hd","privateKey":"never","token":"never"}}'
        def fake_run(cmd, **kwargs):
            self.assertEqual(cmd, [CLI, "--json", "auth", "status"])
            self.assertEqual(kwargs["timeout"], 5)
            return CompletedProcess(cmd, 0, stdout=raw, stderr="")
        with patch("onekey_session.Path.is_file", return_value=True):
            state = read_onekey_status(CLI, runner=fake_run)
        self.assertNotIn("privateKey", state)
        self.assertNotIn("token", state)
        wallet = wallet_status("arbitrage", status_provider=lambda: state)
        self.assertTrue(wallet["authenticated"])
        self.assertEqual(wallet["address"], ADDR)
        self.assertFalse(wallet["executionReady"])
        self.assertFalse(wallet["permissions"]["sign"])

    def test_failure_is_offline(self):
        with patch("onekey_session.Path.is_file", return_value=True):
            def timeout(*args, **kwargs):
                raise TimeoutExpired(CLI, 5)
            self.assertFalse(read_onekey_status(CLI, runner=timeout)["authenticated"])
            def invalid(*args, **kwargs):
                return CompletedProcess([], 0, stdout='not-json', stderr='')
            self.assertFalse(read_onekey_status(CLI, runner=invalid)["authenticated"])

if __name__ == "__main__":
    unittest.main()

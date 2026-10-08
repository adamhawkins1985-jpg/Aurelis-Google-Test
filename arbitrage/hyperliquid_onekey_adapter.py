"""Hyperliquid read-only signer compatibility gate.

No EIP-712 signing, payload crafting, approvals, secret handling, or exchange
requests. A real implementation must use an audited SDK, account verification,
and user-controlled OneKey authorization.
"""
from dex_trade_intent import prepare_intent

def inspect_hyperliquid(bot, asset, side, notional_usd, wallet_address=None):
    draft = prepare_intent(bot, "hyperliquid", asset, side, notional_usd)
    if wallet_address is not None:
        if not isinstance(wallet_address, str) or len(wallet_address) != 42 or not wallet_address.startswith("0x") or not all(ch in "0123456789abcdefABCDEF" for ch in wallet_address[2:]):
            raise ValueError("invalid_public_address")
    return {
        "mode": "paper",
        "adapter": "hyperliquid_onekey_readiness",
        "bot": bot, "asset": asset, "side": side,
        "venue": "hyperliquid",
        "walletProvider": "onekey",
        "publicWalletAddress": wallet_address.lower() if wallet_address else None,
        "notionalUsd": draft["notionalUsd"],
        "signatureSchemeRequired": "hyperliquid_l1_action_eip712_agent",
        "signatureImplementation": "not_implemented",
        "trustedSdkRequired": True,
        "authorizedAgentVerified": False,
        "masterAccountVerified": False,
        "collateralVerified": False,
        "feeScheduleVerified": False,
        "marketOrderConstraintsVerified": False,
        "approvalRequested": False,
        "signature": None,
        "orderPayload": None,
        "ordersSubmitted": 0,
        "executionReady": False,
        "blockers": [
            "OneKey browser login is not an authorized Hyperliquid order signature",
            "Hyperliquid master account, authorized agent and collateral must be verified",
            "Trusted SDK signer, nonce handling, fees and order constraints have not been integrated",
        ],
    }

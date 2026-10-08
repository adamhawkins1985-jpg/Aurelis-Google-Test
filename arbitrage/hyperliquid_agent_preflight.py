"""Safe Hyperliquid agent authorization preflight, with no signing capability.

The master wallet must separately consent to Hyperliquid approveAgent through
a reviewed wallet client. This service never generates an agent key or signs.
"""
from hyperliquid_onekey_adapter import inspect_hyperliquid

def preflight(bot, asset, side, notional_usd, master_address, agent_address=None, network="Testnet"):
    if network not in ("Mainnet", "Testnet"):
        raise ValueError("invalid_network")
    ready=inspect_hyperliquid(bot,asset,side,notional_usd,master_address)
    if agent_address is not None:
        inspect_hyperliquid(bot,asset,side,notional_usd,agent_address)
        if master_address and agent_address.lower()==master_address.lower():
            raise ValueError("agent_must_differ_from_master")
    prerequisites = [
        {"id":"dedicated_agent_address","met":agent_address is not None,"detail":"Enter the public address of a separately controlled agent wallet"},
        {"id":"agent_key_custody","met":False,"detail":"Agent key custody not independently verified"},
        {"id":"master_wallet_approval","met":False,"detail":"OneKey EIP-712 approval has not been requested"},
        {"id":"venue_authorization","met":False,"detail":"Hyperliquid has not confirmed agent authorization"},
        {"id":"revocation_test","met":False,"detail":"Testnet revocation has not been tested"},
    ]
    return {
        "prerequisites": prerequisites,
        "remainingRequirements": sum(not item["met"] for item in prerequisites),
        "mode":"paper", "action":"agent_authorization_preflight",
        "masterAddress":ready["publicWalletAddress"],
        "agentAddress":agent_address.lower() if agent_address else None,
        "network":network,
        "userSignedActionRequired":"approveAgent",
        "signatureModel":"user_signed_eip712",
        "authorizationMessagePrepared":False,
        "signingRequested":False,
        "exchangeRequestSent":False,
        "agentKeyGenerated":False,
        "agentKeyCustodyVerified":False,
        "agentAddressValid":agent_address is not None,
        "authorizationVerified":False,
        "executionReady":False,
        "ordersSubmitted":0,
        "blockers":[
          "Dedicated agent wallet must be created and controlled securely",
          "Master wallet must independently approve exact agent permissions",
          "Hyperliquid approval EIP-712 signing not connected to OneKey",
          "Testnet authorization and revocation must be tested before production"
        ]
    }

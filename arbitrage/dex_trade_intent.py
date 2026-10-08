"""Non-executable OneKey DEX trade intent, with explicit chain/collateral blockers.

Never accepts transaction calldata, contract addresses, approvals or signing
instructions from market responses. Venue chains are descriptive only.
"""
from paper_router import prepare

VENUE_REQUIREMENTS = {
    "hyperliquid": {"network": "Hyperliquid L1", "accountModel": "venue_account", "walletDirectExecutionVerified": False},
    "dydx": {"network": "dYdX Chain", "accountModel": "venue_account", "walletDirectExecutionVerified": False},
    "lighter": {"network": "Lighter", "accountModel": "venue_account", "walletDirectExecutionVerified": False},
    "paradex": {"network": "Starknet", "accountModel": "venue_account", "walletDirectExecutionVerified": False},
    "extended": {"network": "Starknet", "accountModel": "venue_account", "walletDirectExecutionVerified": False},
}

def prepare_intent(bot, venue, asset, side, notional_usd):
    paper = prepare(bot, venue, asset, side, notional_usd)
    requirements = VENUE_REQUIREMENTS[venue]
    return {
        "mode": "paper",
        "type": "unsigned_venue_intent",
        "bot": bot,
        "walletProvider": "onekey",
        "venue": venue,
        "network": requirements["network"],
        "accountModel": requirements["accountModel"],
        "asset": asset,
        "side": side,
        "notionalUsd": paper["notionalUsd"],
        "walletDirectExecutionVerified": False,
        "walletSessionAuthenticated": False,
        "venueAccountVerified": False,
        "collateralBalanceVerified": False,
        "gasBalanceVerified": False,
        "feeScheduleVerified": False,
        "fundingRateForExecutionVerified": False,
        "marginRequirementsVerified": False,
        "orderConstraintsVerified": False,
        "signerIntegrationVerified": False,
        "walletApprovalRequested": False,
        "transactionPayload": None,
        "transactionHash": None,
        "executionReady": False,
        "ordersSubmitted": 0,
        "blockers": [
            "OneKey website authentication does not authorize venue order signing",
            "Venue-specific account/collateral and chain access not verified",
            "No audited venue transaction builder or signing adapter",
            "Fees, funding, margin and order constraints not verified",
        ],
    }

"""Shared OneKey wallet boundary for all AURELIS bots.

Read-only auth status, deny-by-default. No signing, transfers or secret material.
A OneKey session is not assumed to exist in staging.
"""
from dataclasses import dataclass
from typing import Any, Callable
from wallet_signers import select_provider

BOT_IDS = frozenset({"hunter", "trade_radar", "signal_desk", "live_bet", "arbitrage", "grid", "dca"})


@dataclass(frozen=True)
class BotPolicy:
    can_read: bool = True
    can_prepare: bool = False
    can_sign: bool = False
    can_transfer: bool = False
    max_notional_usd: float = 0.0


POLICIES = {bot: BotPolicy() for bot in BOT_IDS}


def wallet_status(bot: str, status_provider: Callable[[], dict[str, Any]] | None = None,
                  provider: str = "onekey") -> dict[str, Any]:
    """Only return public session metadata, never CLI outputs or secrets."""
    if bot not in BOT_IDS:
        raise ValueError("Unknown bot")
    policy = POLICIES[bot]
    signer = select_provider(provider, status_provider)
    state = signer.status()
    authenticated = state.authenticated
    return {
        "bot": bot,
        "provider": state.provider,
        "authenticated": authenticated,
        "authStatus": "authenticated" if authenticated else "unauthenticated",
        "address": state.address,
        "walletKind": state.wallet_kind,
        "permissions": {
            "read": policy.can_read,
            "prepare": policy.can_prepare,
            "sign": policy.can_sign,
            "transfer": policy.can_transfer,
        },
        "executionReady": False,
        "maxNotionalUsd": policy.max_notional_usd,
    }


def authorize(bot: str, action: str) -> bool:
    if bot not in BOT_IDS:
        return False
    if action == "read":
        return POLICIES[bot].can_read
    # Prevent accidental capability escalation via an unknown action string.
    return False

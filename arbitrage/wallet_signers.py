"""Pluggable read-only wallet provider interface.

AURELIS deliberately has no key loading, signing, session transfer, or trade execution
capabilities in this module. Provider selection is explicit, never auto-elevated.
"""
from dataclasses import dataclass
from typing import Protocol, Callable, Any


@dataclass(frozen=True)
class PublicWalletState:
    provider: str
    authenticated: bool = False
    address: str | None = None
    wallet_kind: str | None = None


class WalletProvider(Protocol):
    name: str

    def status(self) -> PublicWalletState:
        """Return safe metadata only, not secrets or raw session payload."""


class OfflineProvider:
    name = "offline"

    def status(self) -> PublicWalletState:
        return PublicWalletState(provider=self.name)


class OneKeyProvider:
    name = "onekey"

    def __init__(self, status_reader: Callable[[], dict[str, Any]] | None = None):
        self._status_reader = status_reader

    def status(self) -> PublicWalletState:
        if self._status_reader is None:
            return PublicWalletState(provider=self.name)
        try:
            data = self._status_reader()
            authenticated = data.get("authStatus") == "authenticated" and bool(data.get("authenticated"))
            return PublicWalletState(
                provider=self.name,
                authenticated=authenticated,
                address=data.get("displayAddress") if authenticated else None,
                wallet_kind=data.get("walletKind") if authenticated else None,
            )
        except Exception:
            return PublicWalletState(provider=self.name)


class SafeProvider:
    name = "safe"

    def status(self) -> PublicWalletState:
        # Adapter placeholder, NOT an implemented Safe smart-account connection.
        return PublicWalletState(provider=self.name)


def select_provider(name: str, onekey_reader=None) -> WalletProvider:
    if name == "onekey":
        return OneKeyProvider(onekey_reader)
    if name == "safe":
        return SafeProvider()
    if name == "offline":
        return OfflineProvider()
    raise ValueError("Unsupported wallet provider")

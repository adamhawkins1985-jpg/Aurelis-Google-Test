"""Untrusted market snapshots must never certify their own costs.

Only server-side attestations issued by a separately reviewed cost adapter can
support an indicative fee calculation. This module currently has no trusted
live cost adapter, so all live venue costs remain unknown.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class VerifiedCosts:
    venue: str
    taker_fee_bps: float
    funding_bps: float
    source: str


def verify_costs(venue, *, trusted_adapter=None):
    # Caller-provided raw JSON / query strings are never accepted as attestations.
    # An adapter must be explicitly injected by trusted server code, not HTTP users.
    if trusted_adapter is None:
        return None
    report = trusted_adapter(venue)
    if not isinstance(report, VerifiedCosts) or report.venue != venue:
        return None
    if report.source not in ("exchange_public_fee_schedule", "exchange_public_funding"):
        return None
    from depth_pricing import estimate_costs
    if estimate_costs(1, report.taker_fee_bps, report.funding_bps) is None:
        return None
    return report

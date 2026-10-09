import { DEX_VENUES, type DexVenueId } from './dexVenueRegistry';
import type { DexAccountSnapshot } from './dexAccountAdapters';

export interface DexVenueObservation {
  venue: DexVenueId;
  status: 'observed' | 'unavailable';
  checkedAt: string | null;
  accountValueUsd: string | null;
  openPositionCount: number | null;
  activeOrders: number | null;
  fillsObserved: number | null;
  error: string | null;
  ownership: 'unverified';
  accountIndices: readonly number[] | null;
}

/**
 * Conservative cross-venue view. Missing data remains null, never zero.
 * This is monitoring only: it does not control positions or aggregate unlike collateral currencies.
 */
export function reconcileDexObservations(
  snapshots: readonly DexAccountSnapshot[],
  failures: Partial<Record<DexVenueId,string>> = {},
): readonly DexVenueObservation[] {
  const byVenue = new Map<DexVenueId,DexAccountSnapshot>();
  let expectedWallet: string | null = null;
  for (const snapshot of snapshots) {
    if (!DEX_VENUES.some(v => v.id === snapshot.venue) || byVenue.has(snapshot.venue))
      throw new Error('dex_reconciliation_duplicate_or_unknown');
    if (!/^0x[a-fA-F0-9]{40}$/.test(snapshot.wallet) ||
        !Number.isFinite(Date.parse(snapshot.checkedAt)))
      throw new Error('dex_reconciliation_invalid_snapshot');
    if (expectedWallet !== null && snapshot.wallet.toLowerCase() !== expectedWallet)
      throw new Error('dex_reconciliation_wallet_mismatch');
    expectedWallet = snapshot.wallet.toLowerCase();
    byVenue.set(snapshot.venue,snapshot);
  }
  return DEX_VENUES.map(venue => {
    const snap=byVenue.get(venue.id);
    if (!snap) return {
      venue:venue.id,status:'unavailable' as const,checkedAt:null,accountValueUsd:null,
      openPositionCount:null,activeOrders:null,fillsObserved:null,
      error:failures[venue.id] || 'not_observed',ownership:'unverified' as const,
      accountIndices:null,
    };
    const count = snap.openPositionCount;
    const positionCount = typeof count==='number' && Number.isSafeInteger(count) && count>=0
      ? count : snap.verifiedFields?.includes('positions') ? snap.positions.length : null;
    const value = snap.accountValueUsd;
    const accountValueUsd = (typeof value==='number' && Number.isFinite(value) && value>=0)
      || (typeof value==='string' && value.trim()!=='' && Number.isFinite(Number(value)) && Number(value)>=0)
        ? String(value) : null;
    return {
      venue:venue.id,status:'observed' as const,checkedAt:snap.checkedAt,
      accountValueUsd,openPositionCount:positionCount,
      activeOrders:snap.orderMonitoring==='verified'?snap.orders.length:null,
      fillsObserved:snap.fillMonitoring==='verified'?snap.fills.length:null,error:null,
      ownership:'unverified' as const,
      accountIndices: snap.accountIndices && snap.verifiedFields?.includes('accountIndices') ? [...snap.accountIndices] : null,
    };
  });
}

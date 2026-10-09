import { DEX_VENUES, type DexVenueId } from './dexVenueRegistry';

/**
 * Read-only account adapter contract. No signer, secret or wallet session is
 * passed to these adapters. Funding and execution are separate audited layers.
 */
export interface DexAccountSnapshot {
  venue: DexVenueId;
  wallet: string;
  checkedAt: string;
  balances: readonly { symbol: string; available: string; total: string }[];
  positions: readonly { market: string; side: 'long' | 'short'; size: string }[];
  orders: readonly { id: string; market: string; status: string }[];
  fills: readonly { id: string; market: string; size: string }[];
  accountIndices?: readonly number[];
  accountValueUsd?: string | number | null;
  openPositionCount?: number | null;
  /** The existing upstream may expose totals without full order/fill records. */
  verifiedFields?: readonly string[];
}
export interface DexAccountAdapter {
  readonly venue: DexVenueId;
  observe(wallet: string, signal?: AbortSignal): Promise<DexAccountSnapshot>;
}

const adapters = new Map<DexVenueId, DexAccountAdapter>();
const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

/** Reject duplicate implementations, unknown venues and unsupported account access. */
export function registerDexAccountAdapter(adapter: DexAccountAdapter): void {
  const venue = DEX_VENUES.find(v => v.id === adapter.venue);
  if (!venue || !(venue.capabilities.accountBalances || venue.capabilities.accountAggregates)) {
    throw new Error('dex_account_adapter_not_verified');
  }
  if (adapters.has(adapter.venue)) throw new Error('dex_account_adapter_duplicate');
  adapters.set(adapter.venue, adapter);
}

/** Never return mock or empty balances to imply an account was checked. */
export async function observeDexAccount(
  venueId: DexVenueId,
  wallet: string,
  signal?: AbortSignal,
): Promise<DexAccountSnapshot> {
  const adapter = adapters.get(venueId);
  if (!adapter) throw new Error('dex_account_adapter_unavailable');
  if (venueId === 'hyperliquid' && !EVM_ADDRESS.test(wallet)) {
    throw new Error('invalid_bot_wallet_address');
  }
  const snapshot = await adapter.observe(wallet, signal);
  if (snapshot.venue !== venueId || snapshot.wallet.toLowerCase() !== wallet.toLowerCase() ||
      Number.isNaN(Date.parse(snapshot.checkedAt)) ||
      !Array.isArray(snapshot.balances) || !Array.isArray(snapshot.positions) ||
      !Array.isArray(snapshot.orders) || !Array.isArray(snapshot.fills)) {
    throw new Error('dex_account_snapshot_invalid');
  }
  return snapshot;
}

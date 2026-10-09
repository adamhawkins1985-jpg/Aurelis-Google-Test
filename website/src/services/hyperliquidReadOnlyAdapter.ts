import { registerDexAccountAdapter, type DexAccountSnapshot } from './dexAccountAdapters';

const validWallet = /^0x[a-fA-F0-9]{40}$/;

/** Bridges existing AURELIS VPS-backed, read-only Hyperliquid observation endpoint. */
export async function fetchHyperliquidObservation(wallet: string, signal?: AbortSignal): Promise<DexAccountSnapshot> {
  if (!validWallet.test(wallet)) throw new Error('invalid_bot_wallet_address');
  const response = await fetch('/api/bots/hyperliquid-account?' + new URLSearchParams({ wallet }), {
    cache: 'no-store', signal,
  });
  if (!response.ok) throw new Error('hyperliquid_observation_http_' + response.status);
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('hyperliquid_observation_invalid');
  const result = data as Record<string, unknown>;
  if (result.ok === false) throw new Error(String(result.error || 'hyperliquid_observation_unavailable'));
  const verifiedFields: string[] = [];
  const rawValue = result.perpsAccountValueUsd;
  const accountValueUsd = (typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue >= 0)
    || (typeof rawValue === 'string' && rawValue.trim() !== '' && Number.isFinite(Number(rawValue)) && Number(rawValue) >= 0)
      ? rawValue as number | string : null;
  if (accountValueUsd !== null) verifiedFields.push('accountValueUsd');
  const rawPositions = result.openPerpPositions;
  const openPositionCount = typeof rawPositions === 'number' && Number.isInteger(rawPositions) && rawPositions >= 0
    ? rawPositions : null;
  if (openPositionCount !== null) verifiedFields.push('openPositionCount');
  // Do not synthesize balances, orders, or fills from aggregate account values.
  return {
    venue: 'hyperliquid', wallet, checkedAt: new Date().toISOString(),
    balances: [], positions: [], orders: [], fills: [],
    orderMonitoring:'unavailable',fillMonitoring:'unavailable',
    accountValueUsd, openPositionCount, verifiedFields,
  };
}
export function enableHyperliquidReadOnlyAdapter(): void {
  registerDexAccountAdapter({ venue: 'hyperliquid', observe: fetchHyperliquidObservation });
}

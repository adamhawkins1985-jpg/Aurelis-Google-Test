import type { CoinData } from '../types';
import { INITIAL_COINS } from '../data/initialCoins';
import { fetchTopCryptoMarkets } from './marketData';

export interface DexDiscoveryMarket {
  asset: string;
  route?: { preferredVenue: string | null; candidates: { venue: string; indicativeVwapUsd: number }[] };
  error?: string;
}
export type DexSide = 'long' | 'short';

/** Build a deduplicated, dynamic universe from visible markets and refreshed top-market data. */
export async function discoverDexAssets(visibleCoins: CoinData[] = [], selected?: string): Promise<string[]> {
  let refreshed: CoinData[] = [];
  try { refreshed = await fetchTopCryptoMarkets() || []; } catch { /* continue with available markets */ }
  return [...new Set([selected, ...visibleCoins.map(c => c.symbol), ...refreshed.map(c => c.symbol), ...INITIAL_COINS.map(c => c.symbol)]
    .filter((s): s is string => Boolean(s && /^[a-z0-9]{2,15}$/i.test(s.trim())))
    .map(s => s.toUpperCase()))];
}

/** DEX route API accepts an explicit comma-separated asset set. Batch to avoid URL and backend limits. */
export async function scanDexMarketUniverse(
  assets: string[], side: DexSide, bot: 'trade_radar' | 'hunter',
  onProgress?: (rows: DexDiscoveryMarket[], visited: number, total: number) => void,
): Promise<DexDiscoveryMarket[]> {
  const markets: DexDiscoveryMarket[] = [];
  const deduped = [...new Set(assets.map(s => s.trim().toUpperCase()).filter(s => /^[A-Z0-9]{2,15}$/.test(s)))];
  // Sequential batches prevent the old three-coin hardcode without flooding DEX endpoints.
  for (let i = 0; i < deduped.length; i += 10) {
    const batch = deduped.slice(i, i + 10);
    const q = new URLSearchParams({ bot, assets: batch.join(','), side });
    try {
      const response = await fetch('/api/bots/dex-batch?' + q, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || data?.mode !== 'paper' || !Array.isArray(data.markets)) {
        throw new Error(String(data?.error || 'DEX market research unavailable'));
      }
      markets.push(...data.markets);
    } catch (error: any) {
      markets.push(...batch.map(asset => ({ asset, error: error?.message || 'Market unavailable' })));
    }
    onProgress?.([...markets], Math.min(i + 10, deduped.length), deduped.length);
  }
  return markets;
}

import { fetchHyperliquidObservation } from './hyperliquidReadOnlyAdapter';
import { fetchLighterAccountSnapshot } from './lighterReadOnlyAdapter';
import { reconcileDexObservations, type DexVenueObservation } from './dexMonitoringReconciliation';
import type { DexAccountSnapshot } from './dexAccountAdapters';
import type { DexVenueId } from './dexVenueRegistry';

const VALID_WALLET = /^0x[a-fA-F0-9]{40}$/;

/** One bounded, read-only observation cycle; unavailable venues stay unknown. */
export async function observeBotDexVenues(
  wallet: string,
  signal?: AbortSignal,
): Promise<readonly DexVenueObservation[]> {
  if (!VALID_WALLET.test(wallet) || /^0x0{40}$/i.test(wallet)) throw new Error('invalid_bot_wallet_address');
  const readers = [
    { venue: 'hyperliquid' as const, read: fetchHyperliquidObservation },
    { venue: 'lighter' as const, read: fetchLighterAccountSnapshot },
  ];
  const outcomes = await Promise.allSettled(readers.map(({ read }) => read(wallet, signal)));
  const snapshots: DexAccountSnapshot[] = [];
  const failures: Partial<Record<DexVenueId, string>> = {};
  outcomes.forEach((outcome, index) => {
    const venue = readers[index].venue;
    if (outcome.status === 'fulfilled') snapshots.push(outcome.value);
    else failures[venue] = 'observation_failed';
  });
  return reconcileDexObservations(snapshots, failures);
}

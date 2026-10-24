import type { MarketOpportunity } from './botOpportunity';

export type TradeCheckStatus = 'ready' | 'checking' | 'blocked' | 'unverified' | 'research';

export interface PlainTradeGuide {
  headline: string;
  action: string;
  direction: string;
  reason: string;
  caution: string;
  signal: string;
  verdict: 'ready' | 'wait' | 'avoid';
}

const first = (array: string[]) => array.find(s => s.trim().length > 0) || '';

/** Grounded summaries only; never present a scanner score as win probability. */
export function guideForOpportunity(row: MarketOpportunity, status: TradeCheckStatus, venueMessage?: string): PlainTradeGuide {
  const isShort = row.direction === 'SHORT';
  const direction = isShort
    ? `AURELIS is watching for ${row.asset} to fall.`
    : `AURELIS is watching for ${row.asset} to rise.`;
  const lowVolume = row.volumeRatio != null && row.volumeRatio < 0.4;
  const conflictingFlow = row.contradictions.find(t => /aggressive (buy|sell)|flow conflict|buying pressure|selling pressure/i.test(t));
  const signal = row.reasons.some(t => /EMA20 below EMA50/i.test(t))
    ? 'The recent trend is weaker than the longer trend.'
    : row.reasons.some(t => /EMA20 above EMA50/i.test(t))
      ? 'The recent trend is stronger than the longer trend.'
      : first(row.reasons) || 'The scanner identified a possible price setup, not a confirmed winner.';

  const caution = lowVolume && conflictingFlow
    ? 'Recent volume is very low, and buying/selling activity conflicts with this trade. That makes the setup less convincing.'
    : lowVolume
      ? 'Recent volume is very low. A move without active trading can be unreliable.'
      : conflictingFlow
        ? 'Recent buy/sell activity conflicts with the proposed direction.'
        : first(row.contradictions)
          ? 'The scanner found contradictory evidence. Open details to see it.'
          : 'The price can move against this setup or skip its planned stop.';

  const shouldAvoid = Boolean(row.localFailure);
  const ready = !shouldAvoid && status === 'ready';
  const reason = shouldAvoid
    ? row.localFailure!
    : status === 'blocked'
      ? (venueMessage || 'Kraken cannot currently confirm this order at the proposed price.')
      : status === 'checking'
        ? 'AURELIS is checking the current exchange price.'
        : status === 'ready'
          ? 'Kraken has confirmed a compatible current price. Approval and protection checks are still required.'
          : 'The exchange has not confirmed this bet at a current executable price.';

  return {
    direction,
    signal,
    caution,
    headline: shouldAvoid ? 'Not suitable for the current live test'
      : ready ? 'Verified for review, not ordered'
        : status === 'checking' ? 'Checking whether this bet is possible'
          : 'Research idea. Not ready to trade.',
    action: shouldAvoid
      ? 'Choose another setup or keep scanning.'
      : ready
        ? 'You can review this bet. It still needs your approval before any order.'
        : 'Keep scanning or request a new Kraken price check before considering an order.',
    reason,
    verdict: shouldAvoid ? 'avoid' : ready ? 'ready' : 'wait',
  };
}

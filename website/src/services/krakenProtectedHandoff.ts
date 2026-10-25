/**
 * Exchange-native bracket handoff is a USER-EXECUTED workflow.
 * Kraken Pro can offer TP/SL OCO in its supported graphical order form.
 * Kraken REST AddOrder's close[...] takes only one conditional exit, so
 * AURELIS must not pretend that its current API creates a complete OCO.
 *
 * Do not interpolate an unverified web market deep-link or place orders here.
 */
export const KRAKEN_PRO_OFFICIAL_URL = 'https://pro.kraken.com/';

export interface ProtectedTradePlan {
  asset: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  stop: number;
  target: number;
  /** Exact notional limit for the first explicitly authorized test. */
  notionalUsd: number;
  leverage: number;
  /** Optional authenticated Kraken quote. A research entry is NOT that quote. */
  exchangeQuote?: number | null;
  /** Date.now timestamp, required to describe the quote as fresh. */
  quoteAt?: number | null;
  /** pairId from authenticated preview or preflight. Never infer a deep link. */
  venuePair?: string | null;
}

export interface ProtectedTradeHandoff {
  ready: boolean;
  error: string | null;
  text: string;
  market: string;
  quoteFresh: boolean;
}

export function formatProtectedTradeHandoff(plan: ProtectedTradePlan, now = Date.now()): ProtectedTradeHandoff {
  const asset = String(plan.asset || '').trim().toUpperCase();
  const validAsset = /^[A-Z0-9]{2,15}$/.test(asset);
  const validLevels = [plan.entry,plan.stop,plan.target].every(x => Number.isFinite(x) && x > 0);
  const validBracket = validLevels && (plan.direction === 'LONG'
    ? plan.stop < plan.entry && plan.entry < plan.target
    : plan.target < plan.entry && plan.entry < plan.stop);
  const validLeverage = Number.isInteger(plan.leverage) && plan.leverage >= 1 && plan.leverage <= 2;
  const validAmount = Number.isFinite(plan.notionalUsd) && plan.notionalUsd === 10;
  const ready = validAsset && validBracket && validLeverage && validAmount;
  const error = !validAsset ? 'Select a supported coin first.'
    : !validBracket ? 'These entry, stop, and target prices are no longer a valid direction-aware bet. Run a fresh scan.'
    : !validLeverage ? 'The first trade may use only a verified 1× or 2× setting.'
    : !validAmount ? 'The first test is capped at exactly $10 total order notional.'
    : null;
  const quoteFresh = plan.exchangeQuote != null && Number.isFinite(plan.exchangeQuote)
    && plan.exchangeQuote > 0 && plan.quoteAt != null && Number.isFinite(plan.quoteAt)
    && plan.quoteAt <= now && now - plan.quoteAt <= 15_000;
  const market = plan.venuePair && /^[A-Z0-9:/_-]{4,40}$/i.test(plan.venuePair)
    ? plan.venuePair : `${asset}/USD (select the eligible Kraken margin market)`;

  const price = (n: number) => '$' + n.toLocaleString('en-US',{maximumFractionDigits:10});
  const text = [
    'AURELIS → KRAKEN PRO: MANUAL PROTECTED ORDER PLAN',
    'Research only. This is NOT an order or a quote. Review all values in Kraken Pro before confirming.',
    `Market: ${market}`,
    `Direction: ${plan.direction === 'LONG' ? 'BUY / LONG' : 'SELL / SHORT'}`,
    'Maximum total initial order notional: $10.00',
    `Leverage: ${plan.leverage}× (must be available to YOUR account and market)`,
    `Scanner reference entry: ${price(plan.entry)} (NOT guaranteed execution price)`,
    `Stop loss trigger: ${price(plan.stop)}`,
    `Take profit trigger: ${price(plan.target)}`,
    quoteFresh
      ? `Recent authenticated Kraken indicative executable quote: ${price(Number(plan.exchangeQuote))}; verify again on Kraken Pro`
      : 'No fresh executable Kraken quote attached. Do not assume the original entry is current.',
    '',
    'In Kraken Pro, select the exact eligible margin pair; confirm market/book, spread and balance.',
    'Set a $10 total notional (not $10 collateral); select your authorized leverage (maximum 2×).',
    'Add BOTH take-profit and stop-loss via the Kraken Pro TP/SL bracket controls.',
    'Before submitting: verify the quote is still between stop and target, and both linked exits are shown.',
    'Approve inside Kraken Pro only if the bracket and size are confirmed.',
    'After submission, check position and linked orders IN KRAKEN PRO. AURELIS cannot attest OCO from open-order snapshots.',
    'Never place a margin entry if only one protective exit is offered.',
  ].join('\n');
  return {ready,error,text,market,quoteFresh};
}

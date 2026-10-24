/** Hypothetical perps P/L research. This module NEVER routes orders or determines venue eligibility. */
export type ResearchSide = 'LONG' | 'SHORT';
export type PerpsResearchInput = {
  marginUsd: number;
  leverage: number;
  entryPrice: number | null | undefined;
  side: ResearchSide;
  favorableMovePct: number;
  adverseMovePct: number;
};
export type PerpsResearchResult = {
  valid: boolean;
  marginUsd: number;
  leverage: number;
  side: ResearchSide;
  entryPrice: number | null;
  notionalUsd: number;
  favorableMovePct: number;
  adverseMovePct: number;
  favorablePrice: number | null;
  adversePrice: number | null;
  favorablePnlUsd: number | null;
  adversePnlUsd: number | null;
  theoreticalMarginExhaustionMovePct: number;
  theoreticalMarginExhaustionPrice: number | null;
  marginRiskPctAtAdverseMove: number;
  adverseMoveExceedsMargin: boolean;
  caution: string;
};
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));
export const MAX_RESEARCH_LEVERAGE = 20;
export const REAL_KRAKEN_TEST_LEVERAGE_CAP = 2;
export const REAL_KRAKEN_FIRST_TEST_NOTIONAL_USD = 10;
export function calculatePerpsResearch(input: PerpsResearchInput): PerpsResearchResult {
  const marginUsd = finite(input.marginUsd) ? clamp(input.marginUsd, 0, 100000) : 0;
  const leverage = finite(input.leverage) ? clamp(Math.floor(input.leverage), 1, MAX_RESEARCH_LEVERAGE) : 1;
  const entryPrice = finite(input.entryPrice) && input.entryPrice > 0 ? input.entryPrice : null;
  const side: ResearchSide = input.side === 'SHORT' ? 'SHORT' : 'LONG';
  const favorableMovePct = finite(input.favorableMovePct) ? clamp(input.favorableMovePct, 0, 100) : 0;
  const adverseMovePct = finite(input.adverseMovePct) ? clamp(input.adverseMovePct, 0, 100) : 0;
  const signed = side === 'LONG' ? 1 : -1;
  const notionalUsd = marginUsd * leverage;
  const favorablePrice = entryPrice === null ? null : entryPrice * (1 + signed * favorableMovePct / 100);
  const adversePrice = entryPrice === null ? null : entryPrice * (1 - signed * adverseMovePct / 100);
  const theoreticalMarginExhaustionMovePct = 100 / leverage;
  const theoreticalMarginExhaustionPrice = entryPrice === null
    ? null : entryPrice * (1 - signed / leverage);
  return {
    valid: entryPrice !== null && marginUsd > 0,
    marginUsd, leverage, side, entryPrice, notionalUsd,
    favorableMovePct, adverseMovePct, favorablePrice, adversePrice,
    favorablePnlUsd: entryPrice === null || marginUsd <= 0 ? null : notionalUsd * favorableMovePct / 100,
    adversePnlUsd: entryPrice === null || marginUsd <= 0 ? null : -notionalUsd * adverseMovePct / 100,
    theoreticalMarginExhaustionMovePct,
    theoreticalMarginExhaustionPrice,
    marginRiskPctAtAdverseMove: leverage * adverseMovePct,
    adverseMoveExceedsMargin: leverage * adverseMovePct >= 100,
    caution: 'Simplified, linear hypothetical price-move math. The margin-exhaustion price is NOT the venue liquidation price. Maintenance requirements, mark/index price, fees, funding, slippage, risk tiers and cross/isolated collateral can trigger liquidation earlier. No order is prepared or executed.'
  };
}

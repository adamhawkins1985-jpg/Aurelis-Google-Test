export type BetDirection = 'LONG' | 'SHORT';

export interface BetScenarioInput {
  stakeUsd: number;
  leverage: number;
  entry: number;
  stop: number;
  target: number;
  direction: BetDirection;
  /** Full opening + closing fees as a percentage of notional, when known. */
  roundTripCostPct?: number | null;
}

export interface BetScenarioEstimate {
  stakeUsd: number;
  exposureUsd: number;
  leverage: number;
  targetMovePct: number;
  stopMovePct: number;
  targetGrossUsd: number;
  stopGrossUsd: number;
  estimatedFeesUsd: number | null;
  targetAfterFeesUsd: number | null;
  stopAfterFeesUsd: number | null;
  targetRoiPct: number;
  stopRoiPct: number;
  rewardRisk: number | null;
}

/**
 * Read-only scenario arithmetic. Stake is initial collateral, not position notional.
 * Liquidation, funding/borrow charges, slippage, spreads and available balance
 * are NOT modeled here. Never pass its numbers directly to an order API.
 */
export function estimateBetScenario(input: BetScenarioInput): BetScenarioEstimate | null {
  const { stakeUsd, leverage, entry, stop, target, direction, roundTripCostPct } = input;
  if (![stakeUsd, leverage, entry, stop, target].every(n => Number.isFinite(n) && n > 0)) return null;
  if (direction !== 'LONG' && direction !== 'SHORT') return null;
  if (direction === 'LONG' ? !(stop < entry && entry < target) : !(target < entry && entry < stop)) return null;
  if (roundTripCostPct != null && (!Number.isFinite(roundTripCostPct) || roundTripCostPct < 0)) return null;

  const exposureUsd = stakeUsd * leverage;
  if (!Number.isFinite(exposureUsd)) return null;
  const signedMove = (price: number) => (direction === 'LONG' ? price - entry : entry - price) / entry;
  const targetMovePct = signedMove(target) * 100;
  const stopMovePct = signedMove(stop) * 100;
  const targetGrossUsd = exposureUsd * targetMovePct / 100;
  const stopGrossUsd = exposureUsd * stopMovePct / 100;
  const estimatedFeesUsd = roundTripCostPct == null ? null : exposureUsd * roundTripCostPct / 100;
  const targetAfterFeesUsd = estimatedFeesUsd == null ? null : targetGrossUsd - estimatedFeesUsd;
  const stopAfterFeesUsd = estimatedFeesUsd == null ? null : stopGrossUsd - estimatedFeesUsd;
  const gain = Math.max(0, targetAfterFeesUsd ?? targetGrossUsd);
  const loss = Math.max(0, -(stopAfterFeesUsd ?? stopGrossUsd));

  return {
    stakeUsd, exposureUsd, leverage, targetMovePct, stopMovePct,
    targetGrossUsd, stopGrossUsd, estimatedFeesUsd,
    targetAfterFeesUsd, stopAfterFeesUsd,
    targetRoiPct: (targetAfterFeesUsd ?? targetGrossUsd) / stakeUsd * 100,
    stopRoiPct: (stopAfterFeesUsd ?? stopGrossUsd) / stakeUsd * 100,
    rewardRisk: loss > 0 ? gain / loss : null,
  };
}

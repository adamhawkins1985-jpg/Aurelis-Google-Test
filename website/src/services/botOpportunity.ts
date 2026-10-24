import type { SetupCandidate } from '../components/trade/TradeRadarView';

export type OpportunityDirection = 'LONG' | 'SHORT';
export type OpportunitySort = 'score' | 'rewardRisk' | 'volume';
export type OpportunityFilter = 'all' | 'ready' | 'long' | 'short';

export interface MarketOpportunity {
  id: string;
  asset: string;
  market: string;
  direction: OpportunityDirection;
  score: number;
  entry: number;
  stop: number;
  target: number;
  stopPct: number;
  targetPct: number;
  rewardRisk: number;
  roundTripCostPct: number | null;
  volumeUsd: number | null;
  spreadBps: number | null;
  rsi: number | null;
  ema20: number | null;
  ema50: number | null;
  volumeRatio: number | null;
  depthImbalance: number | null;
  change24Pct: number | null;
  leverageReported: number[];
  liveTestLeverage: number | null;
  timestampMs: number;
  reasons: string[];
  contradictions: string[];
  localFailure: string | null;
  status: 'RESEARCH' | 'ELIGIBLE';
  agents: { structure: number; flow: number; history: number; risk: number };
}

const toPositive = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const toFinite = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const safeStrings = (values: unknown): string[] => Array.isArray(values)
  ? values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).slice(0, 8)
  : [];
const leverageSet = (values: unknown): number[] => Array.isArray(values)
  ? [...new Set(values.map(Number).filter((n: number) => Number.isInteger(n) && n > 0 && n <= 125))].sort((a, b) => a - b)
  : [];

/** Keeps market evidence and trade eligibility separate. No exchange orders or synthetic quotes. */
export function readOpportunity(row: any, now = Date.now()): MarketOpportunity {
  const asset = String(row?.asset || '').toUpperCase().trim();
  const market = String(row?.market || row?.kraken?.pairId || '');
  const direction: OpportunityDirection = row?.direction === 'SHORT' ? 'SHORT' : 'LONG';
  const entry = toPositive(row?.entry ?? row?.price);
  const stop = toPositive(row?.invalidation ?? row?.economics?.stop);
  const target = toPositive(row?.target ?? row?.economics?.target);
  const score = toFinite(row?.score) ?? 0;
  const riskFraction = entry > 0 ? Math.abs(stop - entry) / entry : 0;
  const targetFraction = entry > 0 ? Math.abs(target - entry) / entry : 0;
  const stopPct = riskFraction * 100;
  const targetPct = targetFraction * 100;
  const directionalLevelsValid = direction === 'LONG'
    ? stop < entry && entry < target : target < entry && entry < stop;
  const timestampMs = toPositive(row?.ts_ms);
  const current = timestampMs > 0 && timestampMs <= now + 30_000 && now - timestampMs < 5 * 60_000;
  const leverageReported = leverageSet(direction === 'SHORT' ? row?.kraken?.leverageSell : row?.kraken?.leverageBuy);
  const liveTestLeverage = leverageReported.includes(2) ? 2 : leverageReported.includes(1) ? 1 : null;
  const rawFee = toFinite(row?.economics?.estimatedRoundTripCostPct);
  const roundTripCostPct = rawFee != null && rawFee >= 0 ? rawFee : null;
  const rewardRiskFromBackend = toFinite(row?.economics?.netRewardRisk);
  const rewardRisk = rewardRiskFromBackend != null && rewardRiskFromBackend > 0
    ? rewardRiskFromBackend : stopPct > 0 ? targetPct / stopPct : 0;
  let localFailure: string | null = null;
  if (!/^[A-Z0-9]{2,15}$/.test(asset) || !['LONG', 'SHORT'].includes(String(row?.direction))) {
    localFailure = 'Unsupported market or direction';
  } else if (![entry, stop, target].every(n => n > 0) || !directionalLevelsValid) {
    localFailure = 'Entry, stop and target do not form a valid setup';
  } else if (!(stopPct > 0 && stopPct <= 5)) {
    localFailure = 'Stop distance exceeds the 5% live-test risk gate';
  } else if (!current) {
    localFailure = 'Signal is stale or has no verified timestamp';
  } else if (liveTestLeverage == null) {
    localFailure = 'No 1× or 2× leverage reported for this direction';
  }
  const volume = toFinite(row?.scanner?.notional24h);
  const spread = toFinite(row?.scanner?.spreadBps);
  return {
    id: asset + ':' + direction, asset, market, direction, score, entry, stop, target,
    stopPct, targetPct, rewardRisk, roundTripCostPct,
    volumeUsd: volume != null && volume >= 0 ? volume : null,
    spreadBps: spread != null && spread >= 0 ? spread : null,
    rsi: toFinite(row?.structure?.rsi),
    ema20: toFinite(row?.structure?.ema20),
    ema50: toFinite(row?.structure?.ema50),
    volumeRatio: toFinite(row?.structure?.volumeRatio),
    depthImbalance: toFinite(row?.flow?.depthImbalance),
    change24Pct: toFinite(row?.scanner?.change24Pct),
    leverageReported, liveTestLeverage, timestampMs,
    reasons: safeStrings(row?.reasons), contradictions: safeStrings(row?.contradictions),
    localFailure, status: localFailure ? 'RESEARCH' : 'ELIGIBLE',
    agents: {
      structure: toFinite(row?.agents?.structure) ?? 0,
      flow: toFinite(row?.agents?.flow) ?? 0,
      history: toFinite(row?.agents?.history ?? row?.agents?.freqai) ?? 0,
      risk: toFinite(row?.agents?.risk) ?? 0,
    },
  };
}

/** Avoid duplicate asset-side cards; prefer eligible, then higher scored, evidence. */
export function dedupeOpportunities(rows: MarketOpportunity[]): MarketOpportunity[] {
  const byId = new Map<string, MarketOpportunity>();
  for (const row of rows) {
    const existing = byId.get(row.id);
    if (!existing || (existing.localFailure && !row.localFailure)
      || (Boolean(existing.localFailure) === Boolean(row.localFailure) && row.score > existing.score)) {
      byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

export function filterAndSortOpportunities(
  rows: MarketOpportunity[], filter: OpportunityFilter, sort: OpportunitySort, query = '',
  readyIds: ReadonlySet<string> = new Set<string>(),
): MarketOpportunity[] {
  const term = query.trim().toUpperCase();
  const filtered = dedupeOpportunities(rows).filter(row => (!term || row.asset.includes(term) || row.market.toUpperCase().includes(term))
    && (filter === 'all'
      || (filter === 'ready' && readyIds.has(row.id))
      || (filter === 'long' && row.direction === 'LONG')
      || (filter === 'short' && row.direction === 'SHORT')));
  return [...filtered].sort((a, b) =>
    (sort === 'score' ? b.score - a.score
      : sort === 'rewardRisk' ? b.rewardRisk - a.rewardRisk
      : (b.volumeUsd ?? -1) - (a.volumeUsd ?? -1))
    || b.score - a.score || a.asset.localeCompare(b.asset));
}

export function toReviewedSetup(candidate: MarketOpportunity): SetupCandidate {
  if (candidate.localFailure || !candidate.liveTestLeverage) {
    throw new Error('Only a fully qualified and freshly verified venue setup can be reviewed');
  }
  return {
    id: candidate.id, rank: '01', symbol: candidate.asset, name: candidate.asset,
    direction: candidate.direction, isFresh: true,
    payoff: candidate.rewardRisk >= 2 ? 'HIGH PAYOFF' : candidate.rewardRisk >= 1.2 ? 'FAIR PAYOFF' : 'CAUTION',
    score: candidate.score,
    indicators: 'Kraken Spot/Margin market preflight completed',
    commentary: [...candidate.reasons.slice(0, 2), ...candidate.contradictions.slice(0, 2).map(v => 'Caution: ' + v)].join(' · ') ||
      'Ranked Kraken market setup. Order preparation and final approval are separate.',
    entry: candidate.entry, stop: candidate.stop, target: candidate.target,
    netRr: candidate.rewardRisk,
    forge: candidate.agents.structure, pulse: candidate.agents.flow,
    scope: candidate.score, atlas: candidate.agents.history, aegis: candidate.agents.risk,
    notes: [
      ...candidate.reasons.map((detail, i) => ({step: String(i + 1).padStart(2, '0'), agent: 'Signal', detail})),
      ...candidate.contradictions.map((detail, i) => ({step: String(candidate.reasons.length + i + 1).padStart(2, '0'), agent: 'Risk', detail})),
    ],
    margin: 10,
    leverage: candidate.liveTestLeverage,
    leverageOptions: candidate.leverageReported,
    targetNet: candidate.targetPct - (candidate.roundTripCostPct ?? 0),
    stopLoss: candidate.stopPct,
    tradeCost: candidate.roundTripCostPct ?? 0,
    qualified: true,
  };
}

import React, { useEffect, useMemo, useState } from 'react';
import { formatCurrency } from '../../services/marketData';
import { estimateBetScenario, type BetDirection } from '../../services/betScenario';

interface BetScenarioCalculatorProps {
  asset: string;
  direction: BetDirection;
  entry: number;
  stop: number;
  target: number;
  roundTripCostPct?: number | null;
  /** Read-only leverage advertised by the signal's venue market metadata. */
  signalLeverage?: number[];
}

const normalizeLeverages = (values: unknown): number[] => Array.isArray(values)
  ? [...new Set(values.map(Number).filter((n: number) => Number.isInteger(n) && n > 0 && n <= 125))].sort((a, b) => a - b)
  : [];
const showUsd = (value: number) => (value < 0 ? '-' : '+') + formatCurrency(Math.abs(value));

/**
 * Research-only trade scenario. No order APIs, permissions, wallet actions or
 * execution sizing flow through this component. Live Bet has a separate ticket.
 */
export const BetScenarioCalculator: React.FC<BetScenarioCalculatorProps> = ({
  asset, direction, entry, stop, target, roundTripCostPct = null, signalLeverage = [],
}) => {
  const signalKey = signalLeverage.join(',');
  const signalOptions = useMemo(() => normalizeLeverages(signalLeverage), [signalKey]);
  const [stake, setStake] = useState('10');
  const [scenarioEntry, setScenarioEntry] = useState(String(entry || ''));
  const [scenarioStop, setScenarioStop] = useState(String(stop || ''));
  const [scenarioTarget, setScenarioTarget] = useState(String(target || ''));
  const [leverage, setLeverage] = useState('2');
  const [venueOptions, setVenueOptions] = useState<number[]>(signalOptions);
  const [venueStatus, setVenueStatus] = useState<'checking' | 'market' | 'signal' | 'unverified'>('checking');

  useEffect(() => {
    setStake('10');
    setScenarioEntry(String(entry || ''));
    setScenarioStop(String(stop || ''));
    setScenarioTarget(String(target || ''));
  }, [asset, direction]);

  useEffect(() => {
    let active = true;
    const initial = normalizeLeverages(signalOptions);
    setVenueOptions(initial);
    setVenueStatus(initial.length ? 'signal' : 'checking');
    setLeverage(String(initial.includes(2) ? 2 : initial[0] ?? 1));

    const check = async () => {
      try {
        const res = await fetch('/api/kraken/margin-info/' + encodeURIComponent(asset), { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok || data?.ok !== true) throw new Error('Margin info unavailable');
        const options = normalizeLeverages(direction === 'SHORT' ? data.sell : data.buy);
        if (!active) return;
        if (!options.length) {
          setVenueOptions(initial);
          setVenueStatus(initial.length ? 'signal' : 'unverified');
          return;
        }
        setVenueOptions(options);
        setLeverage(current => options.includes(Number(current)) ? current : String(options.includes(2) ? 2 : options[0]));
        setVenueStatus('market');
      } catch {
        if (active) {
          setVenueOptions(initial);
          setVenueStatus(initial.length ? 'signal' : 'unverified');
        }
      }
    };
    if (asset) void check();
    else setVenueStatus('unverified');
    return () => { active = false; };
  }, [asset, direction, signalKey]);

  const estimate = useMemo(() => estimateBetScenario({
    stakeUsd: Number(stake), leverage: Number(leverage),
    entry: Number(scenarioEntry), stop: Number(scenarioStop), target: Number(scenarioTarget),
    direction, roundTripCostPct,
  }), [stake, leverage, scenarioEntry, scenarioStop, scenarioTarget, direction, roundTripCostPct]);

  const hasVerifiedOptions = venueOptions.length > 0;
  const targetUsd = estimate?.targetAfterFeesUsd ?? estimate?.targetGrossUsd ?? null;
  const stopUsd = estimate?.stopAfterFeesUsd ?? estimate?.stopGrossUsd ?? null;
  const resetLevels = () => {
    setScenarioEntry(String(entry || ''));
    setScenarioStop(String(stop || ''));
    setScenarioTarget(String(target || ''));
  };
  const numericInputClass = 'mt-1 w-full min-w-0 p-2 rounded-lg bg-surface-panel border border-white/10 text-text-primary';

  return (
    <section className="rounded-xl border border-primary-container/25 bg-surface-base p-3 space-y-3" aria-label="Interactive bet scenario">
      <div className="flex flex-wrap justify-between gap-2 items-center">
        <div>
          <strong className="text-xs text-text-primary">What-if profit calculator · {asset} {direction}</strong>
          <p className="text-[10px] text-text-muted mt-0.5">Change collateral, leverage, entry, stop or target. Results update instantly.</p>
        </div>
        <button type="button" onClick={resetLevels} className="px-2 py-1 rounded border border-white/10 text-text-secondary text-[10px]">Use signal prices</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <label className="text-[9px] text-text-muted">BET / COLLATERAL USD
          <input aria-label="Scenario collateral in USD" type="number" min="0.01" step="any" value={stake} onChange={e=>setStake(e.target.value)} className={numericInputClass}/>
        </label>
        <label className="text-[9px] text-text-muted">LEVERAGE
          {hasVerifiedOptions ? (
            <select aria-label="Scenario market leverage" value={leverage} onChange={e=>setLeverage(e.target.value)} className={numericInputClass}>
              {venueOptions.map(n=><option key={n} value={String(n)}>{n}×</option>)}
            </select>
          ) : (
            <input aria-label="Hypothetical scenario leverage" type="number" min="1" max="125" step="1" value={leverage} onChange={e=>setLeverage(e.target.value)} className={numericInputClass}/>
          )}
        </label>
        <label className="text-[9px] text-text-muted">ENTRY USD
          <input aria-label="Scenario entry price" type="number" min="0" step="any" value={scenarioEntry} onChange={e=>setScenarioEntry(e.target.value)} className={numericInputClass}/>
        </label>
        <label className="text-[9px] text-text-muted">STOP USD
          <input aria-label="Scenario stop price" type="number" min="0" step="any" value={scenarioStop} onChange={e=>setScenarioStop(e.target.value)} className={numericInputClass}/>
        </label>
        <label className="text-[9px] text-text-muted">TARGET USD
          <input aria-label="Scenario target price" type="number" min="0" step="any" value={scenarioTarget} onChange={e=>setScenarioTarget(e.target.value)} className={numericInputClass}/>
        </label>
      </div>
      <p className="text-[10px] text-text-muted">
        {venueStatus === 'market'
          ? 'Leverage options reported by Kraken market info. Actual account, jurisdiction, pair, collateral and order approval may be more restrictive.'
          : venueStatus === 'signal'
            ? 'Leverage from Kraken signal metadata. Live eligibility still requires a current exchange check.'
            : venueStatus === 'checking'
              ? 'Checking reported Kraken leverage…'
              : 'Kraken leverage unavailable. The multiplier is hypothetical, not a tradable quote.'}
      </p>
      {estimate && targetUsd !== null && stopUsd !== null ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" aria-live="polite">
          {[
            { label: 'Position exposure', value: formatCurrency(estimate.exposureUsd), tone: 'text-text-primary' },
            { label: 'Target profit', value: showUsd(targetUsd), tone: targetUsd >= 0 ? 'text-primary-container' : 'text-red-400' },
            { label: 'Stop loss', value: showUsd(stopUsd), tone: 'text-red-400' },
            { label: 'Return on collateral', value: (estimate.targetRoiPct >= 0 ? '+' : '') + estimate.targetRoiPct.toFixed(2) + '%', tone: estimate.targetRoiPct >= 0 ? 'text-primary-container' : 'text-red-400' },
          ].map(item=><div key={item.label} className="rounded-lg border border-white/10 bg-surface-panel p-2">
            <div className="text-[9px] text-text-muted">{item.label}</div>
            <strong className={item.tone + ' text-[12px] block mt-1'}>{item.value}</strong>
          </div>)}
          <div className="col-span-2 sm:col-span-4 flex flex-wrap gap-3 text-[10px] text-text-muted">
            <span>Target move: {estimate.targetMovePct.toFixed(2)}%</span>
            <span>Stop move: {estimate.stopMovePct.toFixed(2)}%</span>
            <span>Stop ROI: {estimate.stopRoiPct.toFixed(2)}%</span>
            <span>Risk/reward: {estimate.rewardRisk == null ? '—' : '1 : ' + estimate.rewardRisk.toFixed(2)}</span>
            <span>{estimate.estimatedFeesUsd == null ? 'Gross estimate; fees unknown' : 'Estimated round-trip fees: ' + formatCurrency(estimate.estimatedFeesUsd)}</span>
          </div>
        </div>
      ) : (
        <p role="status" className="text-[10px] text-amber-400">
          Enter valid positive values. For LONG, stop must be below entry and target above; SHORT is the reverse.
        </p>
      )}
      <p className="text-[10px] text-text-muted">
        Simulation only. Exposure equals collateral × leverage; profit and losses scale with both.
        Excludes liquidation, slippage, spreads, funding/borrow costs and unverified fees.
        Changing these inputs never changes or submits a live order. The first live Kraken test remains capped at $10 notional and 2× leverage.
      </p>
    </section>
  );
};

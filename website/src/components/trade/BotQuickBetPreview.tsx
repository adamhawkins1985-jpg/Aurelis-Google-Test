import React, { useMemo, useState } from 'react';
import { estimateBetScenario } from '../../services/betScenario';
import type { MarketOpportunity } from '../../services/botOpportunity';

const usd = (value: number) => '$' + Math.abs(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

export function BotQuickBetPreview({opportunity}: {opportunity:MarketOpportunity}) {
  const [amount,setAmount] = useState('100');
  const choices = useMemo(() => [...new Set(opportunity.leverageReported)].sort((a,b)=>a-b),[opportunity.leverageReported.join(',')]);
  const [leverage,setLeverage] = useState(choices.includes(2) ? '2' : String(choices[0] || ''));
  const available = choices.includes(Number(leverage));
  const estimate = available ? estimateBetScenario({
    stakeUsd:Number(amount),
    leverage:Number(leverage),
    entry:opportunity.entry,
    stop:opportunity.stop,
    target:opportunity.target,
    direction:opportunity.direction,
    roundTripCostPct:opportunity.roundTripCostPct,
  }) : null;
  const gain = estimate?.targetAfterFeesUsd ?? estimate?.targetGrossUsd ?? 0;
  const loss = estimate?.stopAfterFeesUsd ?? estimate?.stopGrossUsd ?? 0;

  return <section className="rounded-2xl border border-primary-container/25 bg-primary-container/5 p-3 sm:p-4 space-y-3" aria-label="Simple profit and loss estimate">
    <div>
      <h3 className="text-base font-headline font-bold">What if I bet this amount?</h3>
      <p className="text-[11px] text-text-secondary mt-1">Change the amount or leverage. Watch the possible profit and loss change.</p>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <label className="text-[11px] font-bold text-text-secondary">Money you put in ($)
        <input type="number" min="1" step="any" value={amount} onChange={e=>setAmount(e.target.value)}
          aria-label="Bet collateral dollars" className="mt-1.5 w-full p-3 bg-surface-panel rounded-xl border border-white/15 text-text-primary text-base font-bold"/>
      </label>
      <label className="text-[11px] font-bold text-text-secondary">Leverage
        <select value={leverage} onChange={e=>setLeverage(e.target.value)} disabled={!choices.length}
          aria-label="Leverage reported for this market"
          className="mt-1.5 w-full p-3 bg-surface-panel rounded-xl border border-white/15 text-text-primary text-base font-bold">
          {!choices.length && <option value="">Not available</option>}
          {choices.map(value=><option key={value} value={String(value)}>{value}×</option>)}
        </select>
      </label>
    </div>
    {estimate ? <>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-primary-container/20 bg-surface-panel p-3">
          <div className="text-[10px] text-text-muted">If price reaches target</div>
          <div className={`text-2xl font-headline font-bold mt-1 tabular-nums ${gain>=0?'text-primary-container':'text-rose-500'}`}>
            {gain>=0?'+':'−'}{usd(gain)}
          </div>
          <div className="text-[10px] text-text-muted mt-1">Estimated {gain>=0?'profit':'loss'}</div>
        </div>
        <div className="rounded-xl border border-rose-500/20 bg-surface-panel p-3">
          <div className="text-[10px] text-text-muted">If price reaches stop</div>
          <div className={`text-2xl font-headline font-bold mt-1 tabular-nums ${loss>=0?'text-primary-container':'text-rose-500'}`}>
            {loss>=0?'+':'−'}{usd(loss)}
          </div>
          <div className="text-[10px] text-text-muted mt-1">Estimated {loss>=0?'profit':'loss'}</div>
        </div>
      </div>
      <div className="flex justify-between flex-wrap gap-2 text-[11px] text-text-secondary">
        <span>Your market exposure: <strong className="text-text-primary">{usd(estimate.exposureUsd)}</strong></span>
        <span>Projected return on your money: <strong className="text-text-primary">{estimate.targetRoiPct.toFixed(1)}%</strong></span>
      </div>
    </> : <p className="text-[11px] text-amber-600" role="status">
      Enter a valid amount and select exchange-reported leverage to calculate a scenario.
    </p>}
    <p className="text-[10px] text-text-muted leading-relaxed">
      These are examples, not guaranteed returns. {opportunity.roundTripCostPct==null?'Trading fees are unknown.':'Estimated trading fees included.'}
      {' '}Slippage, borrowing/funding, liquidation and unexpected price gaps are not included.
      Public market leverage is not proof your account can use it. Live Kraken tests remain capped at $10 total position size and 2×, with your approval.
    </p>
  </section>;
}

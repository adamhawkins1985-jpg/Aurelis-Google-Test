import React, { useEffect, useState } from 'react';

type Route = {
  mode: string; preferredVenue: string | null; executionReady: boolean;
  candidates: { venue: string; indicativeVwapUsd: number }[];
  rejected: Record<string, string>; warning: string;
};
const botKeys: Record<string, string> = {
  radar: 'trade_radar', hunter: 'hunter', scope: 'hunter',
  dca: 'dca', grid: 'grid', arbitrage: 'arbitrage',
  live: 'live_bet', signals: 'signal_desk',
};

export function DexRouteReview({ tab }: { tab: string }) {
  const bot = botKeys[tab] || 'hunter';
  const [asset, setAsset] = useState('BTC');
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [route, setRoute] = useState<Route | null>(null);
  const [error, setError] = useState('');
  const [batch, setBatch] = useState<any>(null);
  const [assessment, setAssessment] = useState<any>(null);
  const [strategy, setStrategy] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    setError('');
    setRoute(null);
    try {
      const query = new URLSearchParams({ bot, asset, side, notional: '25' });
      const response = await fetch('/api/bots/dex-route?' + query, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || data.mode !== 'paper') throw new Error(data.error || 'DEX route unavailable');
      setRoute(data as Route);
    } catch (e: any) {
      setError(e?.message || 'DEX route unavailable');
    } finally { setLoading(false); }
  };
  const loadBatch = async () => {
    setLoading(true);
    setError('');
    setBatch(null);
    try {
      const query = new URLSearchParams({ bot, assets: 'BTC,ETH,SOL', side });
      const response = await fetch('/api/bots/dex-batch?' + query, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || data.mode !== 'paper') throw new Error(data.error || 'DEX scan unavailable');
      setBatch(data);
    } catch (e: any) { setError(e?.message || 'DEX scan unavailable'); }
    finally { setLoading(false); }
  };
  const checkRisk = async () => {
    setLoading(true); setError(''); setAssessment(null);
    try {
      const query = new URLSearchParams({ bot, asset, side, notional: '25' });
      const response = await fetch('/api/bots/dex-assessment?' + query, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || data.mode !== 'paper') throw new Error(data.error || 'Risk review unavailable');
      setAssessment(data);
    } catch (e: any) { setError(e?.message || 'Risk review unavailable'); }
    finally { setLoading(false); }
  };
  const checkStrategy = async () => {
    setLoading(true); setError(''); setStrategy(null);
    try {
      const qs = new URLSearchParams({bot, asset, side});
      const res = await fetch('/api/bots/dex-strategy?' + qs, {cache:'no-store'});
      const data = await res.json();
      if (!res.ok || data.mode !== 'paper') throw Error(data.error || 'Strategy unavailable');
      setStrategy(data);
    } catch(e:any) {setError(e?.message || 'Strategy unavailable')}
    finally {setLoading(false)}
  };
  useEffect(() => { void load(); }, [tab]);
  return (
    <section className="mb-3 rounded-xl border border-white/10 bg-surface-panel/95 p-3 font-mono text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><strong className="text-text-primary">OneKey → DEX route review</strong>
          <p className="text-[10px] text-text-muted">Shared across bots · public order books · paper-only, no Kraken routing</p>
        </div>
        <div className="flex items-center gap-2">
          <select aria-label="Route asset" className="rounded bg-surface-base p-1.5" value={asset} onChange={e => setAsset(e.target.value)}>
            {['BTC','ETH','SOL'].map(x => <option key={x} value={x}>{x}</option>)}
          </select>
          <select aria-label="Route side" className="rounded bg-surface-base p-1.5" value={side} onChange={e => setSide(e.target.value as 'long' | 'short')}>
            <option value="long">LONG</option><option value="short">SHORT</option>
          </select>
          <button type="button" onClick={() => void load()} disabled={loading} className="rounded bg-primary-container px-3 py-1.5 text-on-primary-container">{loading ? 'Checking…' : 'Check DEXs'}</button>
          <button type="button" onClick={() => void checkStrategy()} disabled={loading} className="rounded border border-white/20 px-3 py-1.5">Strategy observations</button>
          <button type="button" onClick={() => void checkRisk()} disabled={loading} className="rounded border border-white/20 px-3 py-1.5">Risk review</button>
          {['hunter','trade_radar'].includes(bot) && <button type="button" onClick={() => void loadBatch()} disabled={loading} className="rounded border border-white/20 px-3 py-1.5">Scan BTC / ETH / SOL</button>}
        </div>
      </div>
      {error && <p className="mt-2 text-status-error">{error}</p>}
      {strategy && <div className="mt-2 space-y-1 text-[10px]"><p className="font-bold">Market depth imbalance · no qualified trade signals</p>{(strategy.venueAssessments || []).map((v:any)=><p key={v.venue}>{v.venue}: {v.marketObservation} · imbalance {v.observedDepthImbalance == null ? 'unavailable' : v.observedDepthImbalance} · funding {v.fundingObservation?.hourlyRate ?? v.fundingObservation?.nextRate ?? 'unavailable'} (unverified)</p>)}<p className="text-text-muted">Directional conviction cannot be inferred from a single order book.</p></div>}
      {assessment && <div className="mt-2 space-y-1 text-[10px]">
        <p className="font-bold">DEX risk assessment · {assessment.qualifiedSignals?.length || 0} qualified signals · execution disabled</p>
        {(assessment.venueAssessments || []).map((v: any) => <p key={v.venue}>{v.venue}: spread {v.spreadBps == null ? 'unavailable' : v.spreadBps + ' bps'} · {v.status || 'unverified'} · funding/collateral not verified</p>)}
        <p className="text-text-muted">Market depth alone cannot justify a trade. Position, stop, gas, wallet and liquidation checks remain required.</p>
      </div>}
      {batch && <div className="mt-2 space-y-1">
        <p className="font-bold">DEX market comparison · {batch.routesFound || 0} assets with indicative routes · paper only</p>
        {(batch.markets || []).map((market: any) => <p key={market.asset} className="text-[10px] text-text-secondary">{market.asset}: {market.route?.preferredVenue || market.error || 'No qualifying venue'} · {market.route?.candidates?.length || 0} order books</p>)}
      </div>}
      {route && <div className="mt-2 text-text-secondary">
        <p>Preferred indicative venue: <strong>{route.preferredVenue || 'None qualified'}</strong> · {route.candidates.length} valid depth candidates · execution locked</p>
        <p className="mt-1 text-[10px]">{route.candidates.map(x => x.venue + ' $' + Number(x.indicativeVwapUsd).toFixed(2)).join(' · ') || 'No usable books'}</p>
        <p className="mt-1 text-[10px] text-text-muted">Fees, funding, collateral and wallet-chain compatibility are unverified. This is not a trade recommendation or an executable quote.</p>
      </div>}
    </section>
  );
}

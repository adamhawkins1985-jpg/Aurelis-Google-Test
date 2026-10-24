import React, { useEffect, useState } from 'react';
import type { SetupCandidate } from './TradeRadarView';
import { discoverDexAssets, scanDexMarketUniverse, type DexDiscoveryMarket } from '../../services/dexDiscovery';

interface Props {
  soundEnabled: boolean;
  initialSetup?: SetupCandidate | null;
  onSendToLiveBet?: (setup: SetupCandidate) => void;
}
export const DexHunterView: React.FC<Props> = ({ initialSetup, onSendToLiveBet }) => {
  const [markets, setMarkets] = useState<DexDiscoveryMarket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scanProgress, setScanProgress] = useState({ visited:0,total:0 });
  const [side, setSide] = useState<'long'|'short'>('long');
  const load = async () => {
    setLoading(true); setError('');
    try {
      const assets = await discoverDexAssets([],initialSetup?.symbol);
      setScanProgress({visited:0,total:assets.length});
      const found = await scanDexMarketUniverse(assets,side,'hunter',(rows,visited,total)=>{
        setMarkets(rows);
        setScanProgress({visited,total});
      });
      setMarkets(found);
    } catch(e:any){setMarkets([]);setError(e?.message||'DEX scan unavailable')}
    finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[side]);
  return <div className="space-y-3 p-3 text-xs text-text-primary">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Hunter · Decentralized Markets</h2><p className="text-text-muted">OneKey-first public DEX depth research. No Kraken API or order submission.</p></div>
      <div className="flex gap-2"><select value={side} onChange={e=>setSide(e.target.value as 'long'|'short')} className="bg-surface-base p-2"><option value="long">LONG</option><option value="short">SHORT</option></select><button onClick={()=>void load()} disabled={loading} className="rounded bg-primary-container px-3 py-2 text-on-primary-container">{loading?'Scanning…':'Rescan DEXs'}</button></div>
    </div>
    <p className="text-[10px] text-text-muted">DEX paper depth checked {scanProgress.visited} / {scanProgress.total} market symbols. No live leverage or orders verified.</p>
    {error && <p className="text-status-error">{error}</p>}
    <div className="grid gap-2 sm:grid-cols-3">{markets.map(m=><div key={m.asset} className="rounded-lg border border-white/10 bg-surface-panel p-3"><strong className="text-base">{m.asset}</strong><p className="mt-1">Indicative venue: {m.route?.preferredVenue||'Unavailable'}</p><p className="text-text-muted">{m.route?.candidates?.length||0} valid order books</p><p className="text-[10px] text-text-muted">{m.error||'No verified fees, collateral, wallet compatibility or trade signal'}</p></div>)}</div>
    {initialSetup && <div className="rounded-lg border border-white/10 p-3"><p>Incoming Trade Radar setup: {initialSetup.symbol} {initialSetup.direction}. This remains an unverified proposal.</p><button type="button" className="mt-2 rounded border border-white/20 px-3 py-2" onClick={()=>onSendToLiveBet?.(initialSetup)}>Send proposal to Live Bet paper review</button></div>}
    <p className="text-text-muted">Paper analysis only. No autonomous trades, custody, leverage verification or orders.</p>
  </div>;
};

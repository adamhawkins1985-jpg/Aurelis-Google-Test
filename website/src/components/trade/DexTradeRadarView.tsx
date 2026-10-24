import React, { useEffect, useState } from 'react';
import type { CoinData } from '../../types';
import { discoverDexAssets, scanDexMarketUniverse, type DexDiscoveryMarket } from '../../services/dexDiscovery';
export function DexTradeRadarView({coins, soundEnabled: _soundEnabled}: {coins:CoinData[];soundEnabled:boolean;onPlaceTrade?: (setup:any)=>void}) {
  const [markets,setMarkets]=useState<DexDiscoveryMarket[]>([]);
  const [side,setSide]=useState<'long'|'short'>('long');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [scanProgress,setScanProgress]=useState({visited:0,total:0});
  const scan=async()=>{
    setLoading(true);setError('');
    try{
      const assets = await discoverDexAssets(coins);
      setScanProgress({visited:0,total:assets.length});
      const found = await scanDexMarketUniverse(assets,side,'trade_radar',(rows,visited,total)=>{
        setMarkets(rows);
        setScanProgress({visited,total});
      });
      setMarkets(found);
    }catch(e:any){setMarkets([]);setError(e?.message||'DEX scanner unavailable')}
    finally{setLoading(false)}
  };
  useEffect(()=>{void scan()},[side]);
  return <section className="space-y-3 p-3 text-xs text-text-primary">
    <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-lg font-bold">Trade Radar · DEX Discovery</h2><p className="text-text-muted">Market observations across decentralized venues, independent of Kraken.</p></div>
      <div className="flex gap-2"><select className="bg-surface-base p-2" value={side} onChange={e=>setSide(e.target.value as 'long'|'short')}><option value="long">LONG</option><option value="short">SHORT</option></select><button className="rounded bg-primary-container px-3 py-2 text-on-primary-container" onClick={()=>void scan()} disabled={loading}>{loading?'Checking…':'Scan DEXs'}</button></div>
    </div>
    <p className="text-[10px] text-text-muted">DEX research checked {scanProgress.visited} / {scanProgress.total} available market symbols. Batched public venue checks, no trades.</p>
    {error&&<p className="text-status-error">{error}</p>}
    <div className="overflow-x-auto rounded-lg border border-white/10"><table className="w-full text-left"><thead className="bg-surface-panel"><tr><th className="p-2">Asset</th><th className="p-2">Best indicative venue</th><th className="p-2">Observed VWAP</th><th className="p-2">Valid books</th><th className="p-2">Status</th></tr></thead><tbody>{markets.map(m=>{const best=m.route?.candidates?.find(c=>c.venue===m.route?.preferredVenue);return <tr key={m.asset} className="border-t border-white/10"><td className="p-2 font-bold">{m.asset}</td><td className="p-2">{m.route?.preferredVenue||'None'}</td><td className="p-2">{best?'$'+Number(best.indicativeVwapUsd).toFixed(2):'—'}</td><td className="p-2">{m.route?.candidates?.length||0}</td><td className="p-2 text-text-muted">Research only</td></tr>})}</tbody></table></div>
    <p className="text-text-muted">No qualifying trading signals or execution have been verified. Fee, funding, gas and collateral checks are required before a bet can be prepared.</p>
  </section>;
}

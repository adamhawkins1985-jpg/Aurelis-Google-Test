import React, { useState } from 'react';

const bots: Record<string,string> = {radar:'trade_radar',hunter:'hunter',scope:'hunter',dca:'dca',grid:'grid',arbitrage:'arbitrage',live:'live_bet',signals:'signal_desk'};
export function DexPaperRiskReview({tab}:{tab:string}) {
  const [entry,setEntry]=useState('100');
  const [stop,setStop]=useState('98');
  const [side,setSide]=useState<'long'|'short'>('long');
  const [leverage,setLeverage]=useState('2');
  const [result,setResult]=useState<any>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const submit=async()=>{
    setBusy(true);setError('');setResult(null);
    try {
      const q=new URLSearchParams({bot:bots[tab]||'hunter',venue:'hyperliquid',asset:'BTC',side,notional:'25',entry,stop,leverage});
      const res=await fetch('/api/bots/paper-risk?'+q,{cache:'no-store'});
      const data=await res.json();
      if(!res.ok||data.mode!=='paper') throw Error(data.error||'Risk review unavailable');
      setResult(data);
    } catch(e:any){setError(e?.message||'Risk review unavailable')}finally{setBusy(false)}
  };
  return <section className="rounded-xl border border-white/10 bg-surface-panel/95 p-3 text-xs text-text-primary">
    <strong>Paper position risk · BTC / Hyperliquid · $25 notional</strong>
    <p className="text-[10px] text-text-muted">Illustrative only, not live margin or liquidation calculations.</p>
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <label>Side <select className="block bg-surface-base p-2" value={side} onChange={e=>{const next=e.target.value as 'long'|'short';setSide(next);setStop(next==='long'?'98':'102')}}><option value="long">LONG</option><option value="short">SHORT</option></select></label>
      <label>Entry <input className="block w-24 bg-surface-base p-2" value={entry} onChange={e=>setEntry(e.target.value)}/></label>
      <label>Stop <input className="block w-24 bg-surface-base p-2" value={stop} onChange={e=>setStop(e.target.value)}/></label>
      <label>Leverage <input className="block w-16 bg-surface-base p-2" value={leverage} onChange={e=>setLeverage(e.target.value)}/></label>
      <button type="button" disabled={busy} onClick={()=>void submit()} className="rounded bg-primary-container px-3 py-2 text-on-primary-container">{busy?'Checking…':'Calculate paper risk'}</button>
    </div>
    {error&&<p className="mt-2 text-status-error">{error}</p>}
    {result&&<p className="mt-2 text-text-secondary">Estimated initial margin: ${result.estimatedInitialMarginUsd} · Estimated loss at stop before costs: ${result.estimatedLossAtStopUsdBeforeCosts} · Liquidation: unknown · Execution disabled</p>}
  </section>;
}

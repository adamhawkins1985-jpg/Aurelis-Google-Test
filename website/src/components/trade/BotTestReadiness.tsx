import React,{useCallback,useEffect,useState} from 'react';
import {RefreshCw,ShieldAlert} from 'lucide-react';
type Check={ok:boolean;error:string|null};
type Readiness={
 ok:boolean;checked?:Record<string,Check>;freeMarginAvailable?:boolean;freeMarginUsd?:number|null;
 openMarginPositions?:number|null;openOrders?:number|null;accountClearForFirstTest?:boolean;
 liveOrdersEnabled?:boolean;usPerpsAccountVerified?:boolean;testNotionalMaximumUsd?:number;maxTestLeverage?:number;
};
export const BotTestReadiness:React.FC<{short?:boolean}>=({short=false})=>{
 const [result,setResult]=useState<Readiness|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const load=useCallback(async()=>{
   setBusy(true);
   try{
     const r=await fetch('/api/bots/kraken-test-readiness',{credentials:'same-origin',cache:'no-store'});
     const data=await r.json();
     if(!r.ok||!data?.ok)throw Error(data?.error||'readiness_unavailable');
     setResult(data);setError('');
   }catch(e:any){setResult(null);setError(String(e?.message||'readiness_unavailable').replaceAll('_',' '))}
   finally{setBusy(false)}
 },[]);
 useEffect(()=>{
  void load();const id=window.setInterval(load,90000);
  window.addEventListener('aurelis:wallet-authenticated',load);
  return ()=>{window.clearInterval(id);window.removeEventListener('aurelis:wallet-authenticated',load)};
 },[load]);
 return <section className="rounded-xl bg-surface-panel/95 border border-white/10 p-3 text-[10px] space-y-2">
  <div className="flex items-center justify-between gap-2">
   <strong className="inline-flex gap-1.5 items-center"><ShieldAlert size={13}/> Kraken Spot/Margin test readiness</strong>
   <button type="button" disabled={busy} onClick={load} title="Refresh exchange checks"
    className="rounded border border-white/10 px-2 py-1 disabled:opacity-40">
    <RefreshCw size={12} className={busy?'animate-spin':''}/>
   </button>
  </div>
  <div className="flex flex-wrap gap-x-3 gap-y-1 text-text-secondary">
    {(['trade_balance','open_positions','open_orders'] as const).map(k=>
      <span key={k}>{k.replaceAll('_',' ')}: <strong className={result?.checked?.[k]?.ok?'text-primary-container':'text-amber-400'}>
       {result?.checked?.[k]?.ok?'CHECKED':result?.checked?.[k]?.error||'NOT CHECKED'}</strong></span>)}
  </div>
  <div className="flex flex-wrap gap-x-4 gap-y-1 text-text-secondary">
    <span>Free margin: {result?.freeMarginUsd!=null?'$'+Number(result.freeMarginUsd).toFixed(2):'unavailable'}</span>
    <span>Open positions: {result?.openMarginPositions??'unknown'}</span>
    <span>Open orders: {result?.openOrders??'unknown'}</span>
  </div>
  <div className={result?.liveOrdersEnabled?'text-primary-container font-bold':'text-amber-400 font-bold'}>
    {result?.liveOrdersEnabled?'MANUAL LIVE TEST ENABLED':'LIVE EXECUTION LOCKED'}
    {result?.accountClearForFirstTest?' · account checks passed':' · account checks not fully cleared'}
  </div>
  {!short&&<div className="text-text-muted">
    Test design: $10–$25 notional, maximum 2× leverage, signed Bots owner, fresh order review.
    A passed balance check does not verify attached stops, actual fills or U.S. futures access.
  </div>}
  {error&&<div role="status" className="text-amber-400">{error}</div>}
 </section>;
};

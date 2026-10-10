import React,{useEffect,useState} from 'react';
import {RefreshCw,Wallet} from 'lucide-react';

type Entry={
 name:string;connected:boolean;reason:string;balanceKind:string;
 balances:Record<string,string>|null;orderSubmissionVerified:boolean;
};
type Accounts={ok:boolean;updatedAt:number;accounts:{kraken:Entry;coinbase:Entry}};
export const BotExchangeBalances:React.FC<{futuresResearch?:boolean}>=({futuresResearch=false})=>{
 const [data,setData]=useState<Accounts|null>(null);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(false);
 const load=async()=>{
   setLoading(true);
   try{
     const response=await fetch('/api/bots/exchange-accounts',{cache:'no-store',credentials:'same-origin'});
     const content=await response.json();
     if(!response.ok||!content?.ok)throw Error(content?.error||'exchange_balances_unavailable');
     setData(content);setError('');
   }catch(err:any){setData(null);setError(String(err?.message||'account_data_unavailable').replaceAll('_',' '))}
   finally{setLoading(false)}
 };
 useEffect(()=>{
   void load();
   const timer=window.setInterval(load,60000);
   window.addEventListener('aurelis:wallet-authenticated',load);
   return ()=>{window.clearInterval(timer);window.removeEventListener('aurelis:wallet-authenticated',load)};
 },[]);
 return <section className="mb-2 rounded-xl border border-white/10 bg-surface-panel/90 p-2.5 text-[10px]">
   <div className="flex items-center justify-between gap-3">
     <div className="flex gap-2 items-center text-text-primary font-bold"><Wallet size={13}/> Bot Exchange Accounts
       <span className="text-text-muted font-normal">Read-only balances · spot accounts</span>
     </div>
     <button type="button" onClick={load} disabled={loading} className="rounded border border-white/10 px-2 py-1 text-text-secondary disabled:opacity-50">
       <RefreshCw size={13} className={loading?'animate-spin':''}/>
     </button>
   </div>
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
     {(['kraken','coinbase'] as const).map(id=>{
       const a=data?.accounts?.[id];
       return <div key={id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-white/10 bg-surface-base px-2.5 py-2">
         <strong className="text-text-primary">{id==='kraken'?'Kraken Spot':'Coinbase Advanced'}</strong>
         <span className={a?.connected?'text-primary-container':'text-amber-400'}>
           {a?.connected?'CONNECTED':'NOT VERIFIED'}
         </span>
         {(['USD','USDC','USDT'] as const).map(asset=><span key={asset} className="font-mono text-text-secondary">
           {asset}: {a?.connected && a.balances?.[asset]!=null
            ? Number(a.balances[asset]).toFixed(2) : '—'}
         </span>)}
       </div>;
     })}
   </div>
   {error&&<div role="status" className="mt-2 text-amber-400">{error}</div>}
   <p className="mt-1 text-[9px] text-text-muted">
     Kraken reports total holdings; Coinbase reports available balances. Neither figure proves margin buying power or permission to submit an order.
     {futuresResearch?' Futures market-data access is not a funded or verified futures trading account.':''}
   </p>
 </section>;
};

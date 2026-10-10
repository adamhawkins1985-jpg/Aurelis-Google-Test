import React,{useEffect,useState} from 'react';
import {RefreshCw} from 'lucide-react';

type Order={
  id:string;symbol:string;side:string;type:string;status:string;
  amount:number;filled:number;remaining:number;price:number;createdAt?:number|null;
};
type Venue={ok:boolean;error?:string;orders:Order[]};
type Status={ok:boolean;updatedAt:number;venues:{kraken:Venue;coinbase:Venue}};
export const BrokerOpenOrders:React.FC=()=>{
  const [state,setState]=useState<Status|null>(null);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const read=async()=>{
    setBusy(true);
    try{
      const res=await fetch('/api/bots/open-orders',{credentials:'same-origin',cache:'no-store'});
      const data=await res.json();
      if(!res.ok||!data?.ok)throw Error(data?.error||'orders_unavailable');
      setState(data);setMessage('');
    }catch(e:any){setState(null);setMessage(String(e?.message||'orders_unavailable').replaceAll('_',' '))}
    finally{setBusy(false)}
  };
  useEffect(()=>{
    void read();
    const poll=window.setInterval(read,30000);
    window.addEventListener('aurelis:wallet-authenticated',read);
    return ()=>{window.clearInterval(poll);window.removeEventListener('aurelis:wallet-authenticated',read)};
  },[]);
  return <section className="rounded-xl bg-surface-panel/90 border border-white/10 p-3 text-[10px] space-y-2">
    <div className="flex flex-wrap gap-2 items-center justify-between">
      <div><strong className="text-text-primary">Exchange order monitor</strong>
        <div className="text-text-muted">Real exchange open orders · read-only · updates every 30 seconds</div>
      </div>
      <button type="button" disabled={busy} onClick={read}
        className="px-2 py-1 rounded border border-white/10 bg-surface-base text-text-secondary disabled:opacity-40">
        <RefreshCw size={13} className={busy?'animate-spin':''}/>
      </button>
    </div>
    {(['kraken','coinbase'] as const).map(broker=>{
      const venue=state?.venues?.[broker];
      return <div key={broker} className="rounded-lg border border-white/10 bg-surface-base p-2 space-y-1">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <strong>{broker==='kraken'?'Kraken Spot/Margin':'Coinbase Advanced Spot'}</strong>
          <span className={venue?.ok?'text-primary-container':'text-amber-400'}>
            {venue?.ok?venue.orders.length+' open order(s)':'ORDER STATUS NOT VERIFIED'}
          </span>
        </div>
        {venue?.ok && venue.orders.map(order=><div key={order.id}
            className="flex flex-wrap gap-x-3 gap-y-1 p-1.5 border border-white/5 rounded text-text-secondary">
          <span className="font-bold">{order.symbol}</span>
          <span>{order.side} / {order.type}</span>
          <span>{order.status}</span>
          <span>Filled {Number(order.filled||0).toLocaleString()} / {Number(order.amount||0).toLocaleString()}</span>
          <span>{Number(order.price)>0?'Limit $'+Number(order.price).toLocaleString():'Market/other'}</span>
        </div>)}
        {venue?.ok && !venue.orders.length && <div className="text-text-muted">No open orders reported. This does not include filled or closed orders.</div>}
        {!venue?.ok && <div className="text-amber-400">{venue?.error?.replaceAll('_',' ')||message||'Waiting for authenticated order status.'}</div>}
      </div>;
    })}
    {message&&<div role="status" className="text-amber-400">{message}</div>}
    <p className="text-text-muted">Orders can be partially filled. Account balances and open orders are not a substitute for verified trading permissions, futures collateral, or an order-execution audit.</p>
  </section>;
};

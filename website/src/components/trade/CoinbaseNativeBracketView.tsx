import React,{useEffect,useState} from 'react';
import {CheckCircle2,ShieldAlert} from 'lucide-react';

interface Props {asset:string;direction:'LONG'|'SHORT';entry:number;stop:number;target:number}
type Capability={ok:boolean;configured:boolean;enabled:boolean;reason:string;bridgeOnly:boolean};
type Preview={ok:boolean;token:string;expiresAt:number;asset:string;side:string;
  quoteUsd:number;notionalUsd:number;stop:string;takeProfit:string;
  estimatedCommissionUsd:string;executionEnabled:boolean;warning:string};
type Result={ok:boolean;submitted?:boolean;protectionVerified?:boolean;orderId?:string;error?:string;warning?:string};
const price=(n:number)=>'$'+Number(n).toLocaleString('en-US',{maximumFractionDigits:10});

export const CoinbaseNativeBracketView:React.FC<Props>=({asset,direction,entry,stop,target})=>{
  const [cap,setCap]=useState<Capability|null>(null);
  const [preview,setPreview]=useState<Preview|null>(null);
  const [result,setResult]=useState<Result|null>(null);
  const [lastOrder,setLastOrder]=useState<any|null>(null);
  const [orderStatus,setOrderStatus]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [now,setNow]=useState(Date.now());
  const eligible=direction==='LONG'&&stop>0&&entry>stop&&target>entry;
  useEffect(()=>{
    let active=true;
    setCap(null);setPreview(null);setResult(null);setError('');
    void fetch('/api/bots/coinbase-bracket/capability',{credentials:'same-origin',cache:'no-store'})
      .then(async r=>({r,data:await r.json()}))
      .then(({r,data})=>{if(active){setCap(r.ok?data:null);if(!r.ok)setError(data.error||'Verify Bot Wallet to check Coinbase trading permissions.')}})
      .catch(()=>{if(active)setError('Coinbase trading eligibility cannot be checked.');});
    return ()=>{active=false};
  },[asset,direction,entry,stop,target]);
  useEffect(()=>{const id=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(id)},[]);
  useEffect(()=>{
    if(!cap?.configured)return;
    let active=true;
    const poll=async()=>{
      try{
        const r=await fetch('/api/bots/coinbase-bracket/latest-order',{credentials:'same-origin',cache:'no-store'});
        const d=await r.json();
        if(active){
          if(r.ok&&d.ok){setLastOrder(d.order);setOrderStatus(String(d.message||''))}
          else setOrderStatus('Coinbase order tracking is unavailable. Check the exchange directly.');
        }
      }catch{if(active)setOrderStatus('Coinbase order tracking is unavailable. Check the exchange directly.');}
    };
    void poll();
    const id=window.setInterval(poll,15000);
    return ()=>{active=false;window.clearInterval(id)};
  },[cap?.configured,result?.submitted]);


  const send=async(endpoint:'preview'|'approve',body:object)=>{
    const r=await fetch('/api/bots/coinbase-bracket/'+endpoint,{
      method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body),
    });
    const data=await r.json();
    if(!r.ok||data.ok!==true)throw new Error(String(data.error||'Coinbase rejected the request'));
    return data;
  };
  const review=async()=>{
    setBusy(true);setPreview(null);setResult(null);setError('');
    try{
      const data=await send('preview',{asset,direction,entry,stop,target,
        notionalUsd:10,leverage:1});
      setPreview(data);
    }catch(e:any){setError(String(e?.message||'Unable to preview order'))}
    finally{setBusy(false)}
  };
  const approve=async()=>{
    if(!preview||now>=preview.expiresAt||!cap?.enabled)return;
    if(!window.confirm('REAL COINBASE SPOT BUY: Spend $10 USD on '+asset+' (1×, no short). Attach take profit at '+
      price(Number(preview.takeProfit))+' and stop loss at '+price(Number(preview.stop))+
      '. The stop becomes a stop-limit exit and may not fill during fast price moves. Submit this real order?'))return;
    setBusy(true);setError('');setResult(null);
    try{
      const data=await send('approve',{confirmationToken:preview.token,
        approveRealTrade:true,acknowledgeStopLimitRisk:true});
      setResult(data);setPreview(null);
    }catch(e:any){
      setError('IMPORTANT: '+String(e?.message||'Submission failed')+
        '. If submission outcome is unknown, check Coinbase before making any new order.');
      setPreview(null);
    }finally{setBusy(false)}
  };
  return <section className="rounded-xl border border-primary-container/25 bg-primary-container/5 p-3 sm:p-4 space-y-3 text-[12px] text-text-primary">
    <div className="flex gap-2 items-start">
      <ShieldAlert className="w-5 h-5 shrink-0 mt-1 text-primary-container"/>
      <div>
        <h3 className="text-base font-headline font-bold">Trade inside AURELIS · Coinbase native exits</h3>
        <p className="text-text-secondary mt-1">
          One exchange-native protected order after your explicit approval. Only spot BUY / LONG at 1×
          is supported here. Kraken perps and short trades are not available through this route.
        </p>
      </div>
    </div>
    {!eligible&&<p className="rounded-lg p-2 bg-surface-panel text-amber-400">
      This is a {direction} signal. Coinbase Spot cannot execute a short or a leveraged bet.
      Choose a long setup, or use a separately verified trading venue.
    </p>}
    {eligible&&<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {[['Buy',' $10 total'],['Leverage','1× spot'],['Take profit',price(target)],['Stop loss',price(stop)]]
        .map(([label,value])=><div key={label} className="p-2 rounded-lg bg-surface-panel border border-white/10">
          <div className="text-[10px] text-text-muted">{label}</div><strong>{value}</strong>
        </div>)}
    </div>}
    {cap&&!cap.configured&&<p className="rounded-lg p-2 bg-surface-panel text-amber-400">
      Coinbase account visibility is currently via a read-only connection, not authorized order credentials.
      In-app execution cannot be enabled until Coinbase Advanced trading permissions are verified securely on the server.
    </p>}
    {cap?.configured&&!cap.enabled&&<p className="rounded-lg p-2 bg-surface-panel text-amber-400">
      Trading credentials are configured, but live Coinbase bracket submission is not enabled.
      Preview is read-only. AURELIS won't trade until server-side permissions and protection checks have been approved.
    </p>}
    {eligible&&cap?.configured&&!result&&
      <button type="button" disabled={busy} onClick={()=>void review()}
        className="w-full py-3 rounded-xl bg-surface-panel border border-primary-container/40 text-primary-container font-bold disabled:opacity-40">
        {busy?'Checking Coinbase…':'Check native bracket with Coinbase · No trade'}
      </button>}
    {preview&&<div className="rounded-xl bg-surface-panel border border-white/10 p-3 space-y-2">
      <h4 className="font-bold">Coinbase exchange preview</h4>
      <div className="text-text-secondary">Current ask {price(preview.quoteUsd)} · estimated entry commission {price(Number(preview.estimatedCommissionUsd))}</div>
      <div className="text-text-secondary">Target {price(Number(preview.takeProfit))} · Stop {price(Number(preview.stop))} · $10 notional</div>
      <p className="text-amber-400">A stop-limit order does not guarantee an exit or limit the maximum loss in a gap.</p>
      {now>=preview.expiresAt?<p role="status" className="text-amber-400">Preview expired. Get another exchange quote.</p>:
        cap?.enabled?<button type="button" disabled={busy} onClick={()=>void approve()}
          className="w-full py-3 rounded-xl bg-primary-container text-on-primary-container font-bold disabled:opacity-40">
          Approve this REAL $10 Coinbase bracket order
        </button>:
        <p>Real order submission is locked until the exchange credentials and server protection configuration are verified.</p>}
    </div>}
    {result?.submitted&&<div role="alert" className="rounded-lg bg-surface-panel border border-primary-container/25 p-3 space-y-1">
      <div className="flex items-center gap-2 font-bold"><CheckCircle2 className="h-4 w-4 text-primary-container"/> Coinbase order submitted</div>
      <p>Order ID: <code className="break-all">{result.orderId}</code></p>
      <p className={result.protectionVerified?'text-text-secondary':'text-amber-400'}>
        {result.warning} Verify the actual order, fills, and both exits directly in Coinbase.
      </p>
    </div>}
    {(lastOrder||orderStatus) && <div className="rounded-lg border border-white/10 bg-surface-panel p-3 space-y-1" role="status">
      <div className="font-bold">Latest AURELIS Coinbase order · refreshes every 15s</div>
      {lastOrder?.orderId&&<p className="break-all text-[10px]">Order: {lastOrder.orderId}</p>}
      {lastOrder?.venueStatus&&<p>Exchange status: {lastOrder.venueStatus} · Filled size: {lastOrder.filledSize}</p>}
      {lastOrder?.stopLoss&&lastOrder?.takeProfit&&<p>Attached TP {price(Number(lastOrder.takeProfit))} · SL {price(Number(lastOrder.stopLoss))}</p>}
      <p className={lastOrder?.needsReconciliation?'text-amber-400':'text-text-secondary'}>{orderStatus}</p>
    </div>}
    {error&&<p className="rounded-lg bg-amber-500/10 p-3 text-amber-400 break-words" role="alert">{error}</p>}
    <p className="text-[10px] text-text-muted">Your existing Kraken Spot/Margin test remains $10 notional and 2× maximum with submission locked.
      This separate Coinbase order uses $10 USD and no leverage. Neither AURELIS nor an exchange can guarantee a stop-limit fill.</p>
  </section>;
};

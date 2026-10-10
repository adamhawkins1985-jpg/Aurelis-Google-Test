import React,{useEffect,useState} from 'react';
type Destination={ok:true;asset:'USDC';network:string;method:string;chainId:number;address:string;source:string};
export const KrakenFundingPanel:React.FC=()=>{
  const [network,setNetwork]=useState<'ethereum'|'base'>('ethereum');
  const [destination,setDestination]=useState<Destination|null>(null);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [amount,setAmount]=useState('5');
  const [history,setHistory]=useState<{amount:number;status:string;time:number;method:string}[]>([]);
  useEffect(()=>{setDestination(null);setMessage('')},[network]);
  const lookup=async()=>{
    setBusy(true);setMessage('Checking Kraken deposit details…');
    try{
      const r=await fetch('/api/bots/kraken-deposit-destination?network='+network,{cache:'no-store',credentials:'same-origin'});
      const data=await r.json();
      if(!r.ok)throw Error(data.next||data.error||'deposit_unavailable');
      if(data.asset!=='USDC'||data.network!==network||!/^0x[a-fA-F0-9]{40}$/.test(data.address))
        throw Error('Unexpected Kraken asset, address, or chain');
      setDestination(data);
      setMessage('Existing deposit address confirmed by Kraken. No transfer has been made.');
    }catch(e:any){setDestination(null);setMessage(String(e?.message||'Deposit address unavailable').replaceAll('_',' '))}
    finally{setBusy(false)}
  };
  const deposits=async()=>{
    try{
      const r=await fetch('/api/bots/kraken-deposit-history',{credentials:'same-origin',cache:'no-store'});
      const d=await r.json();
      if(!r.ok)throw Error(d.error||'history_unavailable');
      setHistory(Array.isArray(d.rows)?d.rows:[]);
      setMessage('Latest Kraken USDC deposit statuses refreshed.');
    }catch(e:any){setMessage(String(e?.message||'Deposit history unavailable').replaceAll('_',' '))}
  };
  return <div className="rounded-xl border border-white/10 bg-surface-panel/90 p-3 space-y-2 text-[10px]">
    <div className="font-bold text-text-primary">OneKey → Kraken USDC funding</div>
    <div className="text-text-muted">Use only a Kraken-verified deposit address and the matching chain. Transfers require approval inside OneKey.</div>
    <div className="flex flex-wrap gap-2 items-center">
      <label htmlFor="funding-network">Network</label>
      <select id="funding-network" value={network} onChange={e=>setNetwork(e.target.value as 'ethereum'|'base')}
        className="px-2 py-1.5 rounded border border-white/15 bg-surface-base">
        <option value="ethereum">Ethereum Mainnet</option><option value="base">Base</option>
      </select>
      <button type="button" disabled={busy} onClick={lookup}
        className="rounded border border-white/15 bg-surface-base px-3 py-1.5 disabled:opacity-50">
        GET KRAKEN DEPOSIT ADDRESS
      </button>
    </div>
    {destination && <div className="p-2 rounded border border-primary-container/30 bg-surface-base space-y-1">
      <div className="font-semibold">{destination.asset} · {destination.method}</div>
      <div className="font-mono break-all">{destination.address}</div>
      <div className="flex gap-2 flex-wrap items-center">
        <label htmlFor="fund-amount">USDC amount</label>
        <input id="fund-amount" value={amount} onChange={e=>setAmount(e.target.value)}
          className="w-20 px-2 py-1 rounded bg-surface-panel border border-white/15"/>
        <button type="button" className="rounded bg-primary-container text-on-primary-container px-3 py-1.5 font-bold"
          onClick={()=>{
            const n=Number(amount);
            if(!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(amount)||!Number.isFinite(n)||n<=0||n>100){
              setMessage('Enter an amount above 0 and no more than 100 USDC for the initial funding transfer.');return;
            }
            localStorage.setItem('aurelis_web_send_prefill',JSON.stringify({
              symbol:'USDC',network:destination.network==='ethereum'?'Ethereum':'Base',
              recipient:destination.address,amount,destinationSource:'kraken'
            }));
            window.dispatchEvent(new Event('aurelis:open-wallet'));
          }}>OPEN WALLET WITH FUNDING DETAILS</button>
      </div>
      <button type="button" className="border border-white/15 px-3 py-1 rounded" onClick={async()=>{
        try{await navigator.clipboard.writeText(destination.address);setMessage('Deposit address copied. Verify it again in OneKey before sending.')}
        catch{setMessage('Clipboard unavailable. Copy the address manually.')}
      }}>COPY VERIFIED ADDRESS</button>
    </div>}
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={deposits} className="px-3 py-1.5 rounded border border-white/15">REFRESH KRAKEN DEPOSITS</button>
      {history.length>0&&<span className="text-text-muted">Latest: {history[0].amount} USDC, {history[0].status}</span>}
    </div>
    {message&&<div role="status" className="text-amber-300 break-words">{message}</div>}
    <div className="text-text-muted">No funds are moved here. In OneKey, choose USDC on exactly the same network and send a small test first. Ensure sufficient native ETH for gas. Kraken deposits may have minimums and processing delays.</div>
  </div>;
};

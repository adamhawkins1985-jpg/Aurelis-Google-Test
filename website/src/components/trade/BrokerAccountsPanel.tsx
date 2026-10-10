import React, { useEffect, useState } from 'react';
import { RefreshCw, Wallet, ShieldAlert } from 'lucide-react';
import { KrakenFundingPanel } from './KrakenFundingPanel';
import { BrokerOpenOrders } from './BrokerOpenOrders';
import { BotTestReadiness } from './BotTestReadiness';

type Broker = {
  name:string; connected:boolean; reason:string; configured:boolean;
  balanceKind:string; balances:Record<string,string>|null;
  accountType:string; orderSubmissionVerified:boolean; liveOrdersEnabled:boolean; autoFundingEnabled:boolean;
};
type BrokerStatus = {ok:boolean;accounts:{kraken:Broker;coinbase:Broker};updatedAt:number;transfersEnabled:boolean};
type FundingPlan = {ok:boolean;recommendations:{venue:string;state:string;observedUsdPlusUsdc?:string;indicativeShortfallUsd?:string}[]};

const describe=(reason:string)=>({
  api_not_configured:'API not configured',
  balance_read_ok:'Balance query verified',
  authentication_failed:'API authentication rejected',
  insufficient_permission:'API permission missing',
  wallet_auth_required:'Connect and verify the Bots wallet to see account balances',
  bot_account_owner_not_authorized:'Owner Bots wallet must be linked on the server',
  network_unavailable:'Exchange network unavailable',
  pagination_not_verified:'Account pages not fully verified',
  connection_unverified:'Account API not verified',
}[reason]||reason.replace(/_/g,' '));

interface Props {
  selected: 'kraken'|'coinbase';
  onSelect:(value:'kraken'|'coinbase')=>void;
  requiredUsd:number;
  strategy:'dca'|'grid';
}

export const BrokerAccountsPanel:React.FC<Props>=({selected,onSelect,requiredUsd,strategy})=>{
  const [accounts,setAccounts]=useState<BrokerStatus|null>(null);
  const [message,setMessage]=useState('Checking exchange accounts…');
  const [loading,setLoading]=useState(false);
  const [plan,setPlan]=useState<FundingPlan|null>(null);
  const read=async()=>{
    setLoading(true);
    try{
      const response=await fetch('/api/bots/exchange-accounts',{cache:'no-store',credentials:'same-origin'});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||'account_status_unavailable');
      setAccounts(data);setMessage('');
    }catch(e:any){setAccounts(null);setPlan(null);setMessage(describe(String(e?.message||'account_status_unavailable')))}
    finally{setLoading(false)}
  };
  useEffect(()=>{
    read();
    const id=window.setInterval(read,60000);
    window.addEventListener('aurelis:wallet-authenticated',read);
    return ()=>{window.clearInterval(id);window.removeEventListener('aurelis:wallet-authenticated',read)};
  },[]);
  useEffect(()=>{
    if(!accounts || !Number.isFinite(requiredUsd)||requiredUsd<5||requiredUsd>10000){setPlan(null);return}
    let cancelled=false;
    (async()=>{
      try{
        const resp=await fetch('/api/bots/funding-plan?requiredUsd='+encodeURIComponent(String(requiredUsd)),
          {cache:'no-store',credentials:'same-origin'});
        const body=await resp.json();
        if(!cancelled)setPlan(resp.ok && body.ok?body:null);
      }catch{if(!cancelled)setPlan(null)}
    })();
    return ()=>{cancelled=true};
  },[accounts?.updatedAt,requiredUsd]);

  return <section className="p-3 sm:p-4 rounded-xl bg-surface-panel/95 border border-white/10 space-y-3">
    <div className="flex flex-wrap gap-2 justify-between items-center">
      <div>
        <h3 className="font-bold text-xs text-text-primary">Kraken + Coinbase account connections</h3>
        <p className="text-[10px] text-text-muted mt-1">Authenticated read-only balances. No exchange orders or funding transfers enabled.</p>
      </div>
      <button type="button" onClick={read} disabled={loading} className="flex gap-1 items-center px-2 py-1 text-[10px] rounded-lg border border-white/10 bg-surface-base">
        <RefreshCw size={11} className={loading?'animate-spin':''}/> Refresh
      </button>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {(['kraken','coinbase'] as const).map(id=>{
        const account=accounts?.accounts?.[id];
        return <div key={id} className="p-3 rounded-lg border border-white/10 bg-surface-base/85 space-y-2">
          <div className="flex justify-between gap-2 items-center">
            <strong className="text-[11px]">{id==='kraken'?'Kraken Spot':'Coinbase Advanced'}</strong>
            <span className={account?.connected?'text-amber-400 text-[9px]':'text-text-muted text-[9px]'}>
              {!account?'NOT VERIFIED':account.connected?'BALANCE READABLE':'DISCONNECTED'}
            </span>
          </div>
          <div className="text-[10px] text-text-muted">{account?describe(account.reason):message||'Not checked'}</div>
          <div className="grid grid-cols-3 gap-1">
            {(['USD','USDC','USDT'] as const).map(currency=>
              <div key={currency} className="p-1.5 rounded bg-surface-panel border border-white/5">
                <div className="text-[9px] text-text-muted">{currency}</div>
                <div className="text-[10px] font-semibold">{account?.connected && account.balances?.[currency]!=null
                  ? '$'+Number(account.balances[currency]).toFixed(2):'—'}</div>
              </div>)}
          </div>
          <p className="text-[9px] text-text-muted">
            {account?.connected ? account.balanceKind==='total_holdings'
              ? 'Total holdings, not verified buying power' : 'Reported available balance, not verified order permission'
              : 'Missing data does not mean a zero balance'}
          </p>
        </div>
      })}
    </div>
    <div className="flex flex-wrap gap-2 items-center">
      <label className="text-[10px] text-text-muted font-bold" htmlFor="broker-route">Target broker</label>
      <select id="broker-route" value={selected} onChange={e=>onSelect(e.target.value as 'kraken'|'coinbase')}
        className="px-2 py-1.5 rounded-lg bg-surface-base border border-white/15 text-[11px] text-text-primary">
        <option value="kraken">Kraken Spot</option><option value="coinbase">Coinbase Advanced</option>
      </select>
      <span className="text-[10px] text-amber-400">Order execution unverified, preview only</span>
    </div>
    <div className="p-2.5 rounded-lg border border-white/10 bg-surface-base text-[10px]">
      <div className="flex gap-2 items-center font-bold text-text-primary"><Wallet size={13}/> AURELIS Funding Agent: planning mode</div>
      <div className="text-text-muted mt-1">
        {plan?.recommendations?.length ? plan.recommendations.map(row=>
          (row.venue==='kraken'?'Kraken':'Coinbase')+': '+(row.state==='needs_connection'
            ? 'connection required' : 'indicative gap $'+Number(row.indicativeShortfallUsd||0).toFixed(2))
        ).join(' · ') : 'Connect your authorized Bots wallet to view funding requirements.'}
      </div>
      <div className="text-text-muted mt-1">No automatic deposits, transfers, or {strategy==='grid'?'grid orders':'DCA buys'} will occur.</div>
    </div>
    <KrakenFundingPanel />
    <BrokerOpenOrders />
    <BotTestReadiness/>
    <div className="text-[9px] text-text-muted flex gap-1 items-center"><ShieldAlert size={11}/> No API secrets leave the backend. Kraken deposit addresses require verified Bot Wallet ownership.</div>
  </section>;
};

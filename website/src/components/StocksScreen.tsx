import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, BriefcaseBusiness, CircleDollarSign, Loader2, RefreshCw, Search, ShieldCheck, TrendingUp } from 'lucide-react';
import { playHudSound } from '../services/marketData';

type Account = { cash?:string; portfolio_value?:string; equity?:string; last_equity?:string; buying_power?:string; };
type Position = { symbol:string; qty:string; market_value:string; avg_entry_price:string; current_price:string; unrealized_pl:string; unrealized_plpc:string; };
type Order = { id:string; symbol:string; side:string; type:string; qty?:string; notional?:string; status:string; };
type Overview = { ok:boolean; configured:boolean; environment?:string; account?:Account; positions?:Position[]; orders?:Order[]; error?:string; };
type Bar = { t:string; o:number; h:number; l:number; c:number; v:number; };
type MarketData = { ok:boolean; symbol:string; range:string; feed?:string; snapshot?:any; bars?:Bar[]; error?:string; detail?:string; };
interface Props { soundEnabled:boolean; }
const WATCH = ['AAPL','NVDA','MSFT','AMZN','TSLA','META','GOOGL','AMD'];
const money=(v:unknown)=>{const n=Number(v||0);return Number.isFinite(n)?n.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}):'$0.00';};
const percent=(v:unknown)=>{const n=Number(v||0)*100;return Number.isFinite(n)?`${n>=0?'+':''}${n.toFixed(2)}%`:'0.00%';};

export const StocksScreen:React.FC<Props>=({soundEnabled})=>{
  const [data,setData]=useState<Overview|null>(null);
  const [accountType,setAccountType]=useState<'live'|'ira'>('live');
  const [loading,setLoading]=useState(true);
  const [symbol,setSymbol]=useState('AAPL');
  const [symbolInput,setSymbolInput]=useState('AAPL');
  const [side,setSide]=useState<'buy'|'sell'>('buy');
  const [orderType,setOrderType]=useState<'market'|'limit'>('market');
  const [notional,setNotional]=useState('25');
  const [limitPrice,setLimitPrice]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const [message,setMessage]=useState('');
  const [range,setRange]=useState<'1D'|'5D'|'1M'|'1Y'>('1D');
  const [market,setMarket]=useState<MarketData|null>(null);
  const [marketLoading,setMarketLoading]=useState(true);
  const [equityHunter,setEquityHunter]=useState<any|null>(null);
  const [hunterLoading,setHunterLoading]=useState(false);

  const load=async()=>{setLoading(true);try{const r=await fetch('/api/alpaca/overview?account='+accountType,{cache:'no-store'});setData(await r.json());}catch{setData({ok:false,configured:false,error:'Alpaca connection unavailable'});}finally{setLoading(false);}};
  useEffect(()=>{load();},[accountType]);
  const loadMarket=async()=>{setMarketLoading(true);try{const r=await fetch('/api/alpaca/market/'+encodeURIComponent(symbol)+'?account='+accountType+'&range='+range,{cache:'no-store'});setMarket(await r.json());}catch{setMarket({ok:false,symbol,range,error:'market_data_unavailable'});}finally{setMarketLoading(false);}};
  useEffect(()=>{loadMarket();const timer=window.setInterval(loadMarket,10000);return()=>window.clearInterval(timer);},[symbol,accountType,range]);
  const loadEquityHunter=async(force=false)=>{
    setHunterLoading(true);
    try{
      const r=await fetch('/api/equity-hunter?account='+accountType+(force?'&force=1':''),{cache:'no-store'});
      const out=await r.json();
      setEquityHunter(out);
    }catch(e:any){
      setEquityHunter({ok:false,error:e?.message||'Equity Hunter unavailable'});
    }finally{setHunterLoading(false);}
  };
  useEffect(()=>{loadEquityHunter(false);const timer=window.setInterval(()=>loadEquityHunter(false),60000);return()=>window.clearInterval(timer);},[accountType]);
  const account=data?.account;
  const positions=data?.positions||[];
  const orders=data?.orders||[];
  const equity=Number(account?.equity||account?.portfolio_value||0);
  const prior=Number(account?.last_equity||0);
  const day=prior>0?equity-prior:0;
  const dayPct=prior>0?day/prior:0;
  const selectedPosition=useMemo(()=>positions.find(p=>p.symbol.toUpperCase()===symbol),[positions,symbol]);
  const bars=market?.bars||[];
  const snap=market?.snapshot||{};
  const lastPrice=Number(snap?.latestTrade?.p||snap?.minuteBar?.c||snap?.dailyBar?.c||bars[bars.length-1]?.c||0);
  const prevClose=Number(snap?.prevDailyBar?.c||0);
  const dayMove=prevClose>0&&lastPrice>0?(lastPrice-prevClose)/prevClose:0;
  const bid=Number(snap?.latestQuote?.bp||0);
  const ask=Number(snap?.latestQuote?.ap||0);
  const dayHigh=Number(snap?.dailyBar?.h||0);
  const dayLow=Number(snap?.dailyBar?.l||0);
  const dayVolume=Number(snap?.dailyBar?.v||0);
  const chart=useMemo(()=>{
    if(!bars.length)return {points:'',area:'',min:0,max:0,lastY:0,volumeBars:[] as {x:number;y:number;h:number}[],startLabel:'',endLabel:'',priceTicks:[] as {value:number;y:number}[]};
    const closes=bars.map(b=>Number(b.c||0)).filter(Number.isFinite);
    if(!closes.length)return {points:'',area:'',min:0,max:0,lastY:0,volumeBars:[] as {x:number;y:number;h:number}[],startLabel:'',endLabel:'',priceTicks:[] as {value:number;y:number}[]};
    let min=Math.min(...closes),max=Math.max(...closes); if(max===min){max+=1;min-=1;}
    const w=1000,plotRight=900,priceTop=16,priceBottom=178,volumeTop=194,volumeBottom=226,padX=14;
    const xFor=(i:number)=>padX+(i/Math.max(1,bars.length-1))*(plotRight-padX);
    const yFor=(v:number)=>priceTop+(1-(v-min)/(max-min))*(priceBottom-priceTop);
    const pts=bars.map((b,i)=>xFor(i).toFixed(1)+','+yFor(Number(b.c||0)).toFixed(1)).join(' ');
    const area=padX+','+priceBottom+' '+pts+' '+plotRight+','+priceBottom;
    const maxVol=Math.max(1,...bars.map(b=>Number(b.v||0)));
    const volumeBars=bars.map((b,i)=>{const x=xFor(i);const h=(Number(b.v||0)/maxVol)*(volumeBottom-volumeTop);return {x,y:volumeBottom-h,h};});
    const fmt=(raw:string)=>{const d=new Date(raw);return range==='1D'?d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):d.toLocaleDateString('en-US',{month:'short',day:'numeric'});};
    const priceTicks=[0,1,2,3,4].map(i=>{const value=max-((max-min)*i/4);return {value,y:yFor(value)};});
    return {points:pts,area,min,max,lastY:yFor(Number(bars[bars.length-1]?.c||0)),volumeBars,startLabel:fmt(bars[0]?.t||''),endLabel:fmt(bars[bars.length-1]?.t||''),priceTicks};
  },[bars,range]);

  const choose=(raw:string)=>{const next=raw.trim().toUpperCase().replace(/[^A-Z.-]/g,'').slice(0,10);if(!next)return;if(soundEnabled)playHudSound('click');setSymbol(next);setSymbolInput(next);setMessage('');};
  const setupHunterBuy=(candidate:any)=>{
    choose(candidate.symbol);
    if(candidate?.direction!=='BUY')return;
    setSide('buy');
    setOrderType('market');
    setLimitPrice('');
    setMessage(`Equity Hunter BUY setup loaded · $${notional} ${candidate.symbol} · Review before submitting`);
    window.setTimeout(()=>document.getElementById('stock-order-ticket')?.scrollIntoView({behavior:'smooth',block:'start'}),120);
  };
  const submit=async()=>{
    if(!data?.configured||submitting)return;
    const dollars=Number(notional); if(!Number.isFinite(dollars)||dollars<=0)return;
    if(orderType==='limit'&&(!Number.isFinite(Number(limitPrice))||Number(limitPrice)<=0))return;
    setSubmitting(true);setMessage('');if(soundEnabled)playHudSound('click');
    try{
      const r=await fetch('/api/alpaca/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:accountType,symbol,side,type:orderType,notional:dollars,limitPrice:orderType==='limit'?Number(limitPrice):undefined,confirm:true})});
      const out=await r.json(); if(!r.ok||!out?.ok)throw new Error(out?.detail||out?.error||'Order rejected');
      setMessage(`${side==='buy'?'Buy':'Sell'} order submitted to Alpaca`); await load();
    }catch(e:any){setMessage(e?.message||'Order submission failed');}finally{setSubmitting(false);}
  };

  return <div className="flex flex-col gap-3 max-w-[1720px] mx-auto w-full pb-24">
    <section className="rounded-2xl border border-white/10 bg-surface-panel/90 backdrop-blur-xl overflow-hidden">
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <img src="/provider-icons/alpaca.ico" alt="" className="w-9 h-9 rounded-xl object-contain bg-white/5 p-1.5"/>
          <div><div className="flex items-center gap-2"><h1 className="text-lg font-bold text-text-primary">Stocks</h1><span className="px-2 py-0.5 rounded-full border border-primary-container/30 bg-primary-container/10 text-primary-container text-[9px] font-mono font-bold">ALPACA</span></div><div className="text-[10px] font-mono text-text-muted">AURELIS stock trading · Alpaca execution</div></div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl border border-white/10 bg-black/20 p-1">
            <button type="button" onClick={()=>setAccountType('live')} className={`px-2.5 py-1.5 rounded-lg text-[9px] font-mono font-bold ${accountType==='live'?'bg-primary-container text-black':'text-text-muted hover:text-text-primary'}`}>INDIVIDUAL</button>
            <button type="button" onClick={()=>setAccountType('ira')} className={`px-2.5 py-1.5 rounded-lg text-[9px] font-mono font-bold ${accountType==='ira'?'bg-primary-container text-black':'text-text-muted hover:text-text-primary'}`}>IRA</button>
          </div>
          <div className={`px-2.5 py-1.5 rounded-xl border text-[9px] font-mono flex items-center gap-1.5 ${data?.configured?'border-primary-container/30 bg-primary-container/10 text-primary-container':'border-amber-400/30 bg-amber-400/10 text-amber-300'}`}><span className={`w-1.5 h-1.5 rounded-full ${data?.configured?'bg-primary-container':'bg-amber-300'}`}/>{data?.configured?`${accountType==='ira'?'IRA':'INDIVIDUAL'} · ${data.environment||'LIVE'}`:'API NOT CONNECTED'}</div>
          <button type="button" onClick={load} className="p-2 rounded-xl border border-white/10 bg-white/5 text-text-secondary hover:text-text-primary hover:bg-white/10" title="Refresh Alpaca"><RefreshCw className={`w-4 h-4 ${loading?'animate-spin':''}`}/></button>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-white/10">
        {[
          ['Equity',money(account?.equity||account?.portfolio_value),BriefcaseBusiness],
          ['Buying power',money(account?.buying_power),CircleDollarSign],
          ['Cash',money(account?.cash),ShieldCheck],
          ['Today',money(day),TrendingUp],
        ].map(([label,value,Icon]:any)=><div key={label} className="bg-surface-panel px-4 py-3"><div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider font-mono text-text-muted"><Icon className="w-3.5 h-3.5"/>{label}</div><div className="mt-1 text-base font-bold text-text-primary">{loading?'—':value}</div>{label==='Today'&&!loading&&<div className={`text-[9px] font-mono ${day>=0?'text-primary-container':'text-red-400'}`}>{percent(dayPct)}</div>}</div>)}
      </div>
    </section>

    {!data?.configured&&!loading&&<div className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2.5 text-[10px] font-mono text-amber-200">The AURELIS stock interface is ready. Add the Alpaca API key and secret for this account on the server to populate your account and enable order submission.</div>}

    <section id="equity-hunter-panel" className="rounded-2xl border border-white/10 bg-surface-panel/90 overflow-hidden scroll-mt-3">
      <div className="px-4 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[9px] font-mono font-bold text-primary-container uppercase tracking-wider">AURELIS EQUITY HUNTER</div>
          <div className="text-base font-bold text-text-primary">Stock Opportunity Scanner</div>
          <div className="text-[9px] font-mono text-text-muted mt-0.5">Alpaca market data + news · SEC filings · SPY/QQQ relative strength</div>
        </div>
        <div className="flex items-center gap-2">
          {equityHunter?.ok&&<div className="text-[9px] font-mono text-text-muted">{equityHunter.scanned||0} scanned · {equityHunter.shortlisted||0} shortlisted · {equityHunter.deepAnalyzed||0} deep</div>}
          <button type="button" onClick={()=>loadEquityHunter(true)} disabled={hunterLoading} className="px-3 py-1.5 rounded-lg bg-primary-container text-black text-[9px] font-mono font-bold disabled:opacity-50">{hunterLoading?'HUNTING…':'HUNT'}</button>
        </div>
      </div>

      {equityHunter?.ok ? (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_220px] gap-px bg-white/10">
          <div className="bg-surface-panel divide-y divide-white/5">
            {(equityHunter.candidates||[]).slice(0,6).map((c:any,index:number)=>(
              <button key={c.symbol} type="button" onClick={()=>setupHunterBuy(c)} className="w-full px-4 py-3 grid grid-cols-[36px_minmax(0,1fr)_auto] gap-3 items-center text-left hover:bg-white/[.03]">
                <div className="text-[10px] font-mono text-text-muted">{String(index+1).padStart(2,'0')}</div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] font-black text-text-primary">{c.symbol}</span>
                    <span className={'text-[9px] font-mono font-bold '+(c.direction==='BUY'?'text-primary-container':'text-amber-300')}>{c.direction}</span>
                    <span className="text-[9px] font-mono text-text-muted truncate">{c.name||''}</span>
                  </div>
                  <div className="mt-1 grid grid-cols-3 sm:grid-cols-6 gap-2 text-[8.5px] font-mono">
                    <span className="text-text-muted">TECH <b className="text-text-primary">{Math.round(c.scores?.technical||0)}</b></span>
                    <span className="text-text-muted">REL <b className="text-text-primary">{Math.round(c.scores?.relativeStrength||0)}</b></span>
                    <span className="text-text-muted">VOL <b className="text-text-primary">{Math.round(c.scores?.volume||0)}</b></span>
                    <span className="text-text-muted">LIQ <b className="text-text-primary">{Math.round(c.scores?.liquidity||0)}</b></span>
                    <span className="text-text-muted">MKT <b className="text-text-primary">{Math.round(c.scores?.marketAlignment||0)}</b></span>
                    <span className="text-text-muted">RISK <b className="text-text-primary">{Math.round(c.scores?.risk||0)}</b></span>
                  </div>
                  {c.news?.[0]?.headline&&<div className="mt-1 text-[8.5px] text-text-muted truncate">{c.news[0].headline}</div>}
                </div>
                <div className="text-right">
                  <div className={'text-lg font-black '+(Number(c.readiness)>=70?'text-primary-container':Number(c.readiness)>=60?'text-amber-300':'text-text-secondary')}>{Number(c.readiness||0).toFixed(1)}</div>
                  <div className="text-[8px] font-mono text-text-muted">READINESS</div>
                </div>
              </button>
            ))}
          </div>
          <div className="bg-surface-panel p-4 space-y-3">
            <div>
              <div className="text-[8px] font-mono uppercase text-text-muted">Market backdrop</div>
              <div className="mt-1 flex justify-between text-[10px] font-mono"><span>SPY</span><b className={(equityHunter.benchmarks?.SPY||0)>=0?'text-primary-container':'text-red-400'}>{Number(equityHunter.benchmarks?.SPY||0).toFixed(2)}%</b></div>
              <div className="flex justify-between text-[10px] font-mono"><span>QQQ</span><b className={(equityHunter.benchmarks?.QQQ||0)>=0?'text-primary-container':'text-red-400'}>{Number(equityHunter.benchmarks?.QQQ||0).toFixed(2)}%</b></div>
            </div>
            <div className="border-t border-white/10 pt-3 text-[8.5px] font-mono text-text-muted leading-relaxed">BUY means the stock cleared the current stock-specific trend test. AVOID means the scanner found movement, but deeper structure did not support a buy.</div>
            <div className="text-[8.5px] font-mono text-text-muted">Click a candidate to load it into the stock chart and Alpaca order panel. Hunter does not submit an order by itself.</div>
          </div>
        </div>
      ) : (
        <div className="px-4 py-6 text-center text-[10px] font-mono text-text-muted">{hunterLoading?'Scanning liquid U.S. equities…':(equityHunter?.detail||equityHunter?.error||'Equity Hunter is waiting for Alpaca market data.')}</div>
      )}
    </section>

    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_285px] gap-3">
      <div className="space-y-3">
        <section className="rounded-2xl border border-white/10 bg-surface-panel/90 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-white/10 flex flex-wrap items-center gap-2">
            <form onSubmit={e=>{e.preventDefault();choose(symbolInput);}} className="flex-1 min-w-[220px] flex items-center gap-2 rounded-xl border border-white/10 bg-black/15 px-3"><Search className="w-4 h-4 text-text-muted"/><input value={symbolInput} onChange={e=>setSymbolInput(e.target.value.toUpperCase())} placeholder="Search ticker" className="h-9 flex-1 bg-transparent outline-none text-[11px] font-mono text-text-primary placeholder:text-text-muted"/></form>
            <div className="flex flex-wrap gap-1">{WATCH.map(s=><button key={s} type="button" onClick={()=>choose(s)} className={`px-2.5 py-1.5 rounded-lg border text-[9px] font-mono font-bold ${symbol===s?'border-primary-container/40 bg-primary-container/15 text-primary-container':'border-white/10 bg-white/5 text-text-secondary hover:text-text-primary'}`}>{s}</button>)}</div>
          </div>
          <div className="min-h-[360px] p-4 relative overflow-hidden">
            <div className="absolute inset-0 opacity-30 pointer-events-none" style={{backgroundImage:'linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px)',backgroundSize:'32px 32px'}}/>
            <div className="relative flex flex-wrap justify-between gap-3 items-start">
              <div>
                <div className="flex items-end gap-2"><div className="text-2xl font-black text-text-primary">{symbol}</div>{lastPrice>0&&<div className="text-xl font-bold text-text-primary">{money(lastPrice)}</div>}</div>
                <div className="flex items-center gap-2 text-[10px] font-mono"><span className="text-text-muted">US equity · Alpaca</span><span className="text-text-muted">•</span><span className="text-primary-container">{market?.feed||'IEX'} LIVE</span>{prevClose>0&&<span className={dayMove>=0?'text-primary-container':'text-red-400'}>{dayMove>=0?'+':''}{(dayMove*100).toFixed(2)}%</span>}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-white/10 bg-black/20 p-1">{(['1D','5D','1M','1Y'] as const).map(r=><button key={r} type="button" onClick={()=>setRange(r)} className={`px-2.5 py-1 rounded-md text-[9px] font-mono font-bold ${range===r?'bg-primary-container text-black':'text-text-muted hover:text-text-primary'}`}>{r}</button>)}</div>
                {selectedPosition&&<div className="text-right"><div className="text-[9px] font-mono text-text-muted">POSITION</div><div className="text-[10px] font-bold text-text-primary">{selectedPosition.qty} sh</div></div>}
              </div>
            </div>
            <div className="relative mt-3 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
              {[['BID',bid?money(bid):'—'],['ASK',ask?money(ask):'—'],['DAY HIGH',dayHigh?money(dayHigh):'—'],['DAY LOW',dayLow?money(dayLow):'—'],['VOLUME',dayVolume?dayVolume.toLocaleString('en-US'):'—']].map(([k,v])=><div key={k} className="min-w-0 rounded-lg border border-white/10 bg-black/15 px-2.5 py-2 overflow-hidden"><div className="text-[8px] leading-tight font-mono text-text-muted whitespace-nowrap">{k}</div><div className="mt-1 text-[9px] sm:text-[10px] leading-tight font-bold text-text-primary tabular-nums break-words overflow-hidden text-ellipsis" title={String(v)}>{v}</div></div>)}
            </div>
            <div className="relative mt-3 h-[250px] rounded-xl border border-white/10 bg-surface-base/70 overflow-hidden">
              {marketLoading&&<div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-text-muted"><Loader2 className="w-4 h-4 animate-spin mr-2"/>Loading live market data</div>}
              {!marketLoading&&chart.points&&<svg viewBox="0 0 1000 236" preserveAspectRatio="none" className="w-full h-full">
                <defs>
                  <linearGradient id="alpacaFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity="0.28"/><stop offset="72%" stopColor="currentColor" stopOpacity="0.04"/><stop offset="100%" stopColor="currentColor" stopOpacity="0"/></linearGradient>
                </defs>
                {chart.priceTicks.map((tick,i)=><line key={'h'+i} x1="0" x2="900" y1={tick.y} y2={tick.y} stroke="rgba(148,163,184,.15)" strokeWidth="1" vectorEffect="non-scaling-stroke"/>)}
                {[190,380,570,760].map(x=><line key={'v'+x} y1="0" y2="236" x1={x} x2={x} stroke="rgba(148,163,184,.10)" strokeWidth="1" vectorEffect="non-scaling-stroke"/>)}
                <g opacity="0.36">{chart.volumeBars.map((b,i)=><rect key={i} x={b.x-2.2} y={b.y} width="4.4" height={Math.max(1,b.h)} rx="1" fill="currentColor" className="text-primary-container"/>)}</g>
                <polygon points={chart.area} fill="url(#alpacaFill)" className="text-primary-container"/>
                <line x1="0" x2="900" y1={chart.lastY} y2={chart.lastY} stroke="currentColor" strokeOpacity="0.34" strokeDasharray="5 6" strokeWidth="1" vectorEffect="non-scaling-stroke" className="text-primary-container"/>
                <polyline points={chart.points} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="text-primary-container"/>
                <circle cx="900" cy={chart.lastY} r="4.5" fill="currentColor" className="text-primary-container"/>
              </svg>}
              {!marketLoading&&!chart.points&&<div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-text-muted">{market?.detail||'No chart data returned for this range.'}</div>}
              {chart.points&&<>
                <div className="absolute top-0 bottom-0 right-0 w-[70px] border-l border-white/10 bg-surface-panel/70 pointer-events-none">
                  {chart.priceTicks.map((tick,i)=><div key={i} className="absolute right-2 -translate-y-1/2 text-[9px] font-mono tabular-nums text-text-secondary" style={{top:(tick.y/236*100)+'%'}}>{money(tick.value)}</div>)}
                  <div className="absolute right-0 -translate-y-1/2 bg-primary-container text-black px-2 py-1 rounded-l-md text-[9px] font-mono font-bold tabular-nums" style={{top:(chart.lastY/236*100)+'%'}}>{money(lastPrice)}</div>
                </div>
                <div className="absolute left-3 bottom-2 text-[8px] font-mono text-text-muted">{chart.startLabel}</div>
                <div className="absolute right-[112px] bottom-2 text-[8px] font-mono text-text-muted">{chart.endLabel}</div>
                <div className="absolute left-3 top-3 text-[8px] font-mono uppercase tracking-wider text-text-muted">Price</div>
                <div className="absolute left-3 bottom-[38px] text-[8px] font-mono uppercase tracking-wider text-text-muted">Volume</div>
              </>}
            </div>
            <div className="relative mt-2 flex justify-between text-[8px] font-mono text-text-muted"><span>Auto-refresh 10s</span><span>Source: Alpaca {market?.feed||'IEX'}</span></div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-surface-panel/90 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/10 flex justify-between"><span className="text-[11px] font-bold text-text-primary">Positions</span><span className="text-[9px] font-mono text-text-muted">{positions.length} open</span></div>
          {positions.length?<div className="divide-y divide-white/5">{positions.map(p=>{const pl=Number(p.unrealized_pl||0);return <button type="button" key={p.symbol} onClick={()=>choose(p.symbol)} className="w-full px-4 py-2.5 grid grid-cols-[1fr_auto_auto] gap-4 items-center text-left hover:bg-white/[.03]"><div><div className="text-[11px] font-bold text-text-primary">{p.symbol}</div><div className="text-[9px] font-mono text-text-muted">{p.qty} shares · avg {money(p.avg_entry_price)}</div></div><div className="text-right"><div className="text-[10px] font-mono text-text-primary">{money(p.market_value)}</div><div className="text-[9px] font-mono text-text-muted">{money(p.current_price)}</div></div><div className={`min-w-[88px] text-right text-[10px] font-mono ${pl>=0?'text-primary-container':'text-red-400'}`}><div className="flex justify-end items-center gap-1">{pl>=0?<ArrowUpRight className="w-3 h-3"/>:<ArrowDownRight className="w-3 h-3"/>}{money(pl)}</div><div>{percent(p.unrealized_plpc)}</div></div></button>;})}</div>:<div className="px-4 py-8 text-center text-[10px] font-mono text-text-muted">{data?.configured?'No open stock positions.':'Connect Alpaca to load positions.'}</div>}
        </section>

        <section className="rounded-2xl border border-white/10 bg-surface-panel/90 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/10 text-[11px] font-bold text-text-primary">Recent orders</div>
          {orders.length?<div className="divide-y divide-white/5">{orders.slice(0,8).map(o=><div key={o.id} className="px-4 py-2.5 grid grid-cols-[1fr_auto_auto] gap-4 items-center"><div><div className="text-[10px] font-bold text-text-primary">{o.symbol}</div><div className="text-[9px] font-mono text-text-muted uppercase">{o.side} · {o.type}</div></div><div className="text-[9px] font-mono text-text-secondary">{o.qty?`${o.qty} sh`:money(o.notional)}</div><div className="text-[9px] font-mono text-primary-container uppercase">{o.status}</div></div>)}</div>:<div className="px-4 py-8 text-center text-[10px] font-mono text-text-muted">{data?.configured?'No recent orders.':'Connect Alpaca to load order history.'}</div>}
        </section>
      </div>

      <aside id="stock-order-ticket" className="rounded-2xl border border-white/10 bg-surface-panel/95 overflow-hidden h-fit xl:sticky xl:top-3 scroll-mt-3">
        <div className="px-4 py-3 border-b border-white/10"><div className="text-[9px] font-mono text-text-muted uppercase tracking-wider">Order ticket</div><div className="mt-0.5 text-lg font-black text-text-primary">{symbol}</div></div>
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-black/20 border border-white/10">{(['buy','sell'] as const).map(v=><button key={v} type="button" onClick={()=>setSide(v)} className={`py-2 rounded-lg text-[10px] font-bold uppercase ${side===v?(v==='buy'?'bg-primary-container text-black':'bg-red-500 text-white'):'text-text-muted hover:text-text-primary'}`}>{v}</button>)}</div>
          <div><div className="mb-1 text-[9px] font-mono text-text-muted">ORDER TYPE</div><select value={orderType} onChange={e=>setOrderType(e.target.value as 'market'|'limit')} className="w-full h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-[11px] font-mono text-text-primary outline-none"><option value="market">Market</option><option value="limit">Limit</option></select></div>
          <div><div className="mb-1 text-[9px] font-mono text-text-muted">DOLLAR AMOUNT</div><div className="h-11 rounded-xl border border-white/10 bg-black/20 px-3 flex items-center gap-2"><span className="text-text-muted">$</span><input value={notional} onChange={e=>setNotional(e.target.value.replace(/[^0-9.]/g,''))} className="flex-1 bg-transparent outline-none text-sm font-bold text-text-primary" inputMode="decimal"/></div></div>
          {orderType==='limit'&&<div><div className="mb-1 text-[9px] font-mono text-text-muted">LIMIT PRICE</div><div className="h-11 rounded-xl border border-white/10 bg-black/20 px-3 flex items-center gap-2"><span className="text-text-muted">$</span><input value={limitPrice} onChange={e=>setLimitPrice(e.target.value.replace(/[^0-9.]/g,''))} className="flex-1 bg-transparent outline-none text-sm font-bold text-text-primary" inputMode="decimal"/></div></div>}
          <div className="rounded-xl border border-white/10 bg-black/15 p-3 space-y-1.5 text-[9px] font-mono"><div className="flex justify-between"><span className="text-text-muted">Provider</span><span className="text-text-primary">Alpaca · {accountType==='ira'?'IRA':'Individual'}</span></div><div className="flex justify-between"><span className="text-text-muted">Buying power</span><span className="text-text-primary">{money(account?.buying_power)}</span></div><div className="flex justify-between"><span className="text-text-muted">Environment</span><span className="text-text-primary">{data?.environment||'Not connected'}</span></div></div>
          <button type="button" disabled={!data?.configured||submitting||Number(notional)<=0} onClick={submit} className={`w-full h-11 rounded-xl font-bold text-[11px] transition-all disabled:opacity-35 disabled:cursor-not-allowed ${side==='buy'?'bg-primary-container text-black hover:brightness-110':'bg-red-500 text-white hover:bg-red-400'}`}>{submitting?<span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/>Submitting</span>:`${side==='buy'?'Buy':'Sell'} ${symbol}`}</button>
          {message&&<div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-mono text-text-secondary">{message}</div>}
          <div className="text-[8.5px] leading-relaxed font-mono text-text-muted">Orders go directly to your connected Alpaca account. Brokerage credentials stay server-side and never enter the browser bundle.</div>
        </div>
      </aside>
    </div>
  </div>;
};

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Bot, ChevronRight, ExternalLink, RefreshCw, Send, ShieldAlert } from 'lucide-react';
import { KrakenLiveChart } from './KrakenLiveChart';
import type { NavigationTab } from '../types';

type Frame='5m'|'15m'|'30m'|'1h'|'4h'|'8h'|'12h'|'1d'|'3d'|'7d';
type Mode='spot'|'perps';
type Bar={time:number;open:number;high:number;low:number;close:number;volume:number};
type Signal={price:number;signal:'BUY'|'SELL'|'WAIT';score:number;rsi:number;ema20:number;ema50:number;volumeRatio:number;atr:number;support:number;resistance:number;stop:number;target:number;dataFresh:boolean;entryZone:{low:number;high:number};reasons:string[]};
type Snapshot={ok:boolean;symbol:string;timeframe:Frame;bars:Bar[];observedAt:number;source:string;analysis:Signal};
type Quote={symbol:string;label:string;price:number|null;changePct:number|null;source:string;asOf:number|null;delayed:boolean};
type BrokerBots={
  status:{signalDesk:string;radar:string};
  signalDesk:{direction:'LONG'|'SHORT';readiness:number;label:string;reasons:string[];contradictions:string[];
    levels?:{entry:number;stop:number;target:number};generatedAt:number;
    scores?:Record<string,number>;micro?:{tapeImbalance?:number;bookImbalance?:number;spreadBps?:number};timeframes?:Record<string,any>}|null;
  radar:{direction:'LONG'|'SHORT';score:number;qualified:boolean;entry:number;stop:number;target:number;
    reasons:string[];contradictions?:string[];agents?:Record<string,number>;economics?:Record<string,number>;generatedAt:number}|null;
  derivedBots?:{id:string;label:string;status:string;signalSource:string}[];
  scan?:{scannedMarkets:number;deepAnalyzed:number;source:string|null};
};
type Timeframes={live:number;checked:number;alignment:string;items:{timeframe:string;status:string;signal:'BUY'|'SELL'|'WAIT'|null;rsi:number|null;asOf:number|null}[];directionCounts:{buy:number;sell:number;wait:number}};
type LegacyIntelligence={
  connected:number;asOf:number;
  sources:{source:string;status:'LIVE'|'STALE'|'HISTORICAL'|'UNAVAILABLE';observations:number;firstAt:number|null;lastAt:number|null;newest?:Record<string,number|string|null>}[];
  outcomes:{source:string;horizonSeconds:number;samples:number;positiveDirectionalPct:number|null;label:string}[];
  notes:string[];
};
type AnalogReport={
  source:string;sourceStatus:'CURRENT'|'STALE'|'UNAVAILABLE';sourceDecision:string|null;
  sourceAt:number|null;direction:'LONG'|'SHORT'|null;
  observationsExamined:number;nearest:number;similarityMethod:string;message:string;
  outcomes:{horizonSeconds:number;samples:number;positivePct:number|null;medianReturnPct:number|null;
    meanReturnPct:number|null;p10ReturnPct:number|null;p90ReturnPct:number|null;medianFavorablePct:number|null;medianAdversePct:number|null}[];
};
type EvidenceRow={source:string;timeframe:string;direction:string;score:number|null;sourceAt:number;observedAt:number};
type History={available:boolean;samples:number;startedAt:number|null;notice:string;sources:{source:string;timeframe:string;samples:number;lastAt:number}[];recent:EvidenceRow[]};
type Arbitrage={status:string;venueCount:number;asOf?:number;opportunities:{longVenue:string;shortVenue:string;netSpreadBeforeFundingPct:number}[];note?:string};
type Venues={available:boolean;asOf:number;assessments:{venue:string;spreadBps:number|null;depthImbalance:number|null;marketObservation:string;directionalSignalVerified:boolean}[];funding:{venue:string;hourlyFundingRate:number|null;nextFundingRate:number|null;asOf:number|null}[]};

type Article={title:string;url:string;source:string;published:string;time:number};
type Futures={symbol:string;contract:string;markPrice:number;indexPrice:number;fundingRate:number;openInterest:number;asOf:number;executionVerified:false};
type Message={role:'user'|'assistant';text:string;engine?:string;at:number};
const SYMBOLS=['BTC','ETH','SOL','XRP','DOGE','ADA','AVAX','LINK','LTC','DOT'];
const FRAMES:Frame[]=['5m','15m','30m','1h','4h','8h','12h','1d','3d','7d'];
const money=(n:number|null|undefined)=>n==null||!Number.isFinite(n)?'—':'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:n<1?6:2});
const signed=(n:number|null|undefined)=>n==null||!Number.isFinite(n)?'—':(n>0?'+':'')+n.toFixed(2)+'%';
const time=(value?:number|null)=>value?new Date(value).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'unavailable';
const inRange=(n:number,min:number,max:number)=>Number.isFinite(n)?Math.max(min,Math.min(max,n)):min;
const request=async <T,>(url:string,init?:RequestInit):Promise<T>=>{
  const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...init});
  const body=await r.json();
  if(!r.ok||body?.ok===false)throw new Error(body?.detail||body?.error||'Source unavailable');
  return body as T;
};

export const MarketBrokerScreen:React.FC<{onNavigate:(tab:NavigationTab)=>void}> = ({onNavigate})=>{
  const [symbol,setSymbol]=useState('BTC');
  const [frame,setFrame]=useState<Frame>('1h');
  const [mode,setMode]=useState<Mode>('spot');
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [bots,setBots]=useState<BrokerBots|null>(null);
  const [timeframes,setTimeframes]=useState<Timeframes|null>(null);
  const [history,setHistory]=useState<History|null>(null);
  const [legacy,setLegacy]=useState<LegacyIntelligence|null>(null);
  const [analogs,setAnalogs]=useState<AnalogReport|null>(null);
  const [analogError,setAnalogError]=useState('');
  const [venues,setVenues]=useState<Venues|null>(null);
  const [arbitrage,setArbitrage]=useState<Arbitrage|null>(null);
  const [evidenceError,setEvidenceError]=useState('');
  const [ticker,setTicker]=useState<Quote[]>([]);
  const [futures,setFutures]=useState<Futures|null>(null);
  const [news,setNews]=useState<Article[]>([]);
  const [livePrice,setLivePrice]=useState<number|null>(null);
  const [chartError,setChartError]=useState('');
  const [tapeError,setTapeError]=useState('');
  const [newsError,setNewsError]=useState('');
  const [botsError,setBotsError]=useState('');
  const [loading,setLoading]=useState(true);
  const [refreshKey,setRefreshKey]=useState(0);
  const [margin,setMargin]=useState('100');
  const [leverage,setLeverage]=useState(2);
  const [duration,setDuration]=useState(4);
  const [question,setQuestion]=useState('');
  const [messages,setMessages]=useState<Message[]>([]);
  const [asking,setAsking]=useState(false);

  useEffect(()=>{
    let mounted=true;
    const load=async(first:boolean)=>{
      if(first){setLoading(true);setSnapshot(null);setLivePrice(null);setChartError('');}
      try{
        const data=await request<Snapshot>('/api/market-broker/snapshot?symbol='+symbol+'&tf='+frame);
        if(mounted){setSnapshot(data);setChartError('');}
      }catch(e:any){if(mounted){setChartError(e?.message||'Candles unavailable');setSnapshot(null);}}
      finally{if(mounted)setLoading(false);}
    };
    void load(true);
    const timer=window.setInterval(()=>void load(false),20000);
    return ()=>{mounted=false;window.clearInterval(timer)};
  },[symbol,frame,refreshKey]);

  useEffect(()=>{
    let mounted=true;
    const load=async()=>{
      try{
        const data=await request<BrokerBots&{ok:boolean}>('/api/market-broker/bot-signals?symbol='+symbol);
        if(mounted){setBots(data);setBotsError('');}
      }catch(e:any){if(mounted){setBots(null);setBotsError(e?.message||'Bot feeds unavailable');}}
    };
    setBots(null);void load();
    const timer=window.setInterval(()=>void load(),60000);
    return ()=>{mounted=false;window.clearInterval(timer)};
  },[symbol,refreshKey]);

  useEffect(()=>{
    let mounted=true;
    const load=async()=>{
      try{
        const body=await request<{ok:boolean;items:Quote[]}>('/api/market-broker/tape');
        if(mounted){setTicker(body.items);setTapeError('');}
      }catch(e:any){if(mounted){setTicker([]);setTapeError(e?.message||'Ticker feed offline');}}
    };
    void load();
    const timer=window.setInterval(()=>void load(),15000);
    return ()=>{mounted=false;window.clearInterval(timer)};
  },[refreshKey]);

  useEffect(()=>{
    let mounted=true;
    const load=async()=>{
      try{
        const body=await request<{ok:boolean;articles:Article[]}>('/api/market-broker/news');
        if(mounted){setNews(body.articles);setNewsError('');}
      }catch(e:any){if(mounted){setNews([]);setNewsError(e?.message||'News unavailable');}}
    };
    void load();
    const timer=window.setInterval(()=>void load(),180000);
    return ()=>{mounted=false;window.clearInterval(timer)};
  },[refreshKey]);

  useEffect(()=>{
    if(mode!=='perps'){setFutures(null);return;}
    let mounted=true;
    const load=async()=>{
      try{
        const data=await request<Futures&{ok:boolean}>('/api/market-broker/futures?symbol='+symbol);
        if(mounted)setFutures(data);
      }catch{if(mounted)setFutures(null);}
    };
    setFutures(null);void load();
    const timer=window.setInterval(()=>void load(),30000);
    return ()=>{mounted=false;window.clearInterval(timer);};
  },[mode,symbol,refreshKey]);


  // Independent evidence requests; failed sources never inherit prior coin data.
  useEffect(()=>{
    let mounted=true;
    const load=async()=>{
      const results=await Promise.allSettled([
        request<Timeframes&{ok:boolean}>('/api/market-broker/timeframes?symbol='+symbol),
        request<History&{ok:boolean}>('/api/market-broker/history?symbol='+symbol+'&days=7')
      ]);
      if(!mounted)return;
      const [t,h]=results;
      setTimeframes(t.status==='fulfilled'?t.value:null);
      setHistory(h.status==='fulfilled'?h.value:null);
      setEvidenceError(t.status==='rejected'?'Multi-timeframe feed unavailable':h.status==='rejected'?'History storage unavailable':'');
    };
    setTimeframes(null);setHistory(null);void load();
    const timer=window.setInterval(()=>void load(),120000);
    return()=>{mounted=false;window.clearInterval(timer);};
  },[symbol,refreshKey]);
  useEffect(()=>{
    let mounted=true;
    const load=async()=>{
      try{
        const data=await request<LegacyIntelligence&{ok:boolean}>('/api/market-broker/legacy-intelligence?symbol='+symbol);
        if(mounted)setLegacy(data);
      }catch{if(mounted)setLegacy(null);}
    };
    setLegacy(null);void load();
    const timer=window.setInterval(()=>void load(),180000);
    return()=>{mounted=false;window.clearInterval(timer);};
  },[symbol,refreshKey]);

  useEffect(()=>{
    let mounted=true;
    const load=async()=>{
      try{
        const data=await request<AnalogReport&{ok:boolean}>('/api/market-broker/analogs?symbol='+symbol+'&mode='+mode);
        if(mounted){setAnalogs(data);setAnalogError('');}
      }catch{if(mounted){setAnalogs(null);setAnalogError('Historical comparison unavailable');}}
    };
    setAnalogs(null);setAnalogError('');void load();
    const timer=window.setInterval(()=>void load(),180000);
    return()=>{mounted=false;window.clearInterval(timer);};
  },[symbol,mode,refreshKey]);

  useEffect(()=>{
    if(mode!=='perps'){setVenues(null);setArbitrage(null);return;}
    let mounted=true;
    const load=async()=>{
      const [dex,arb]=await Promise.allSettled([
        request<Venues&{ok:boolean}>('/api/market-broker/venues?symbol='+symbol),
        request<Arbitrage&{ok:boolean}>('/api/market-broker/arbitrage?symbol='+symbol)
      ]);
      if(!mounted)return;
      setVenues(dex.status==='fulfilled'?dex.value:null);
      setArbitrage(arb.status==='fulfilled'?arb.value:null);
    };
    setVenues(null);setArbitrage(null);void load();
    const timer=window.setInterval(()=>void load(),180000);
    return()=>{mounted=false;window.clearInterval(timer);};
  },[symbol,mode,refreshKey]);

  const onPrice=useCallback((price:number)=>{if(Number.isFinite(price)&&price>0)setLivePrice(price)},[]);
  const price=livePrice&&snapshot?.analysis?livePrice:snapshot?.analysis.price||null;
  const a=snapshot?.analysis;
  const longBias=a?.signal==='BUY',shortBias=a?.signal==='SELL';
  const contradicts=!!a&&((longBias&&(bots?.signalDesk?.direction==='SHORT'||bots?.radar?.direction==='SHORT'))
    ||(shortBias&&(bots?.signalDesk?.direction==='LONG'||bots?.radar?.direction==='LONG')));
  const timeframeConflict=!!a&&timeframes?.live!==undefined&&timeframes.live>=3&&((longBias&&timeframes.alignment==='BEARISH')||(shortBias&&timeframes.alignment==='BULLISH'));
  const desiredDirection: 'LONG'|'SHORT'|null=longBias?'LONG':shortBias?'SHORT':null;
  const deskSupport=!!desiredDirection&&bots?.signalDesk?.direction===desiredDirection&&(bots?.signalDesk?.readiness??0)>=68;
  const radarSupport=!!desiredDirection&&bots?.radar?.direction===desiredDirection&&bots?.radar?.qualified===true&&(bots?.radar?.score??0)>=79;
  const decision:Signal['signal']=!a||!a.dataFresh||contradicts||timeframeConflict||(!deskSupport&&!radarSupport)?'WAIT':a.signal;
  const marginUsd=inRange(Number(margin),0,100000);
  const notional=marginUsd*leverage;
  const direction=decision==='SELL'?'SHORT':'LONG';
  const deskLevels=bots?.signalDesk?.levels;
  const referencePrice=a?.price||0;
  const entry=mode==='perps'?(futures?.markPrice||0):referencePrice;
  const spotStop=deskLevels?.stop&&bots?.signalDesk?.direction===direction?deskLevels.stop:(a?.stop||0);
  const spotTarget=deskLevels?.target&&bots?.signalDesk?.direction===direction?deskLevels.target:(a?.target||0);
  const stop=mode==='perps'&&referencePrice>0?entry*(spotStop/referencePrice):spotStop;
  const target=mode==='perps'&&referencePrice>0?entry*(spotTarget/referencePrice):spotTarget;
  const pnlTarget=entry>0?((target-entry)/entry)*notional*(direction==='LONG'?1:-1):0;
  const pnlStop=entry>0?((stop-entry)/entry)*notional*(direction==='LONG'?1:-1):0;
  const chartTimeframe=frame==='1h'?'1H':frame==='4h'?'4H':frame;
  const symbolNews=useMemo(()=>{
    const names:Record<string,string>={BTC:'bitcoin',ETH:'ethereum',SOL:'solana',XRP:'ripple'};
    const match=names[symbol]||symbol.toLowerCase();
    const relevant=news.filter(n=>n.title.toLowerCase().includes(match)||n.title.toUpperCase().includes(symbol));
    return (relevant.length?relevant:news).slice(0,4);
  },[news,symbol]);

  const ask=async(prompt?:string)=>{
    const query=(prompt||question).trim();
    if(!query||asking)return;
    setQuestion('');
    setMessages(current=>[...current.slice(-12),{role:'user',text:query,at:Date.now()}]);
    setAsking(true);
    try{
      const answer=await request<{reply:string;engine:string;marketAsOf:number}>('/api/market-broker/chat',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({message:query,symbol,tf:frame,mode,margin:marginUsd})
      });
      setMessages(current=>[...current,{role:'assistant',text:answer.reply,engine:answer.engine,at:answer.marketAsOf||Date.now()}]);
    }catch(e:any){
      setMessages(current=>[...current,{role:'assistant',text:'Live analysis unavailable: '+(e?.message||'data source offline')+'. No recommendation generated.',engine:'Unavailable',at:Date.now()}]);
    }finally{setAsking(false);}
  };
  const pill=(active:boolean)=>'rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition-colors '+(active?'border-primary-container/50 bg-primary-container/15 text-primary-container':'border-white/10 text-text-secondary hover:text-text-primary hover:bg-white/5');
  
  return (
    <div className="w-full min-w-0 flex flex-col gap-2.5 text-text-primary pb-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bot size={17} className="text-primary-container"/>
          <div>
            <h1 className="font-headline text-lg font-bold tracking-tight leading-tight">AI Market Broker</h1>
            <p className="text-[10px] text-text-muted">Live exchange evidence · No autonomous orders</p>
          </div>
        </div>
        <button type="button" onClick={()=>setRefreshKey(x=>x+1)} className={pill(false)} aria-label="Refresh broker market data"><RefreshCw size={13} className="inline mr-1"/>Refresh</button>
      </div>

      <div className="rounded-lg border border-white/10 bg-surface-panel overflow-hidden" aria-label="Live crypto and macro market prices">
        {ticker.length ? (
          <div className="overflow-hidden">
            <div className="animate-marquee-normal marquee-track flex w-max gap-5 font-mono text-[10px] whitespace-nowrap">
              {[0,1].map(copy=><div key={copy} aria-hidden={copy===1} className="flex shrink-0 items-center gap-5 px-3 py-2">
                {ticker.map(item=><div key={item.symbol} className="flex items-center gap-1.5" title={item.label+' · '+item.source+' · '+(item.delayed?'Delayed/last available quote':'Live spot feed')+' · '+(item.asOf?new Date(item.asOf).toLocaleString():'Unavailable')}>
                  <span className="font-bold text-text-secondary">{item.symbol}</span>
                  <span className="text-text-primary">{money(item.price)}</span>
                  <span className={item.changePct==null?'text-text-muted':item.changePct>=0?'text-primary-container':'text-rose-400'}>{signed(item.changePct)}</span>
                  {item.delayed&&<span className="text-[8px] text-text-muted">D</span>}
                </div>)}
              </div>)}
            </div>
          </div>
        ):<div className="p-2 text-[11px] text-text-muted">Market tape: {tapeError||'Connecting to price sources…'}</div>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-surface-panel px-2.5 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <select aria-label="Trading asset" value={symbol} onChange={e=>setSymbol(e.target.value)}
            className="rounded-md bg-surface-canvas border border-white/15 px-2.5 py-1.5 text-xs font-bold text-text-primary">
            {SYMBOLS.map(x=><option key={x} value={x}>{x} / USD</option>)}
          </select>
          <span className="ml-1 font-mono text-base font-semibold text-text-primary">{money(price)}</span>
          {a&&<span className="text-[10px] text-text-muted">Kraken spot</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {FRAMES.map(f=><button key={f} type="button" className={pill(frame===f)} onClick={()=>setFrame(f)}>{f}</button>)}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.7fr)_minmax(290px,1fr)] gap-2.5">
        <div className="min-w-0 flex flex-col gap-2.5">
          <div className="rounded-lg border border-white/10 bg-surface-panel overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
              <span className="text-xs font-semibold">Price & volume <span className="text-text-muted font-normal">{symbol}/USD · {frame}</span></span>
              <span className={'text-[10px] font-mono '+(a?.dataFresh?'text-primary-container':'text-text-muted')}>{loading?'Loading…':a?.dataFresh?'LIVE candles':'Data unavailable / stale'}</span>
            </div>
            <div className="h-[310px] md:h-[365px] relative">
              {snapshot?.bars?.length ? (
                <KrakenLiveChart symbol={symbol} timeframe={chartTimeframe as any} bars={snapshot.bars} stop={a?.dataFresh?stop:undefined} target={a?.dataFresh?target:undefined} onPrice={onPrice}/>
              ) : <div className="absolute inset-0 flex items-center justify-center text-xs text-text-muted">{chartError||'Loading verified candles…'}</div>}
            </div>
            <div className="flex flex-wrap justify-between gap-2 border-t border-white/10 px-3 py-2 text-[10px] font-mono text-text-muted">
              <span>Support {money(a?.support)} · Resistance {money(a?.resistance)}</span>
              <span>Updated {time(snapshot?.observedAt)}</span>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-surface-panel p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="text-xs font-bold">Signal consensus</h2>
              <span className={'text-[11px] font-bold '+(decision==='BUY'?'text-primary-container':decision==='SELL'?'text-rose-400':'text-text-secondary')}>
                {decision==='BUY'?'BUY SETUP':decision==='SELL'?'SELL / DEFENSIVE':'WAIT'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
              {[
                ['AURELIS Indicators',a?.dataFresh?a.signal:'OFFLINE',a?('RSI '+a.rsi.toFixed(1)):'No candles'],
                ['Signal Desk',bots?.signalDesk?.direction||'OFFLINE',bots?.signalDesk?'Readiness '+bots.signalDesk.readiness.toFixed(0)+'/100':bots?.status?.signalDesk||'Unavailable'],
                ['Trade Radar',bots?.radar?.direction||'NO MATCH',bots?.radar?('Score '+bots.radar.score):bots?.status?.radar||'Unavailable'],
                ['Volume',a?a.volumeRatio.toFixed(2)+'x':'OFFLINE',a?.reasons?.[3]||'No data']
              ].map(([title,v,detail])=><div key={title} className="rounded-md bg-surface-canvas p-2 border border-white/5 min-w-0">
                <div className="text-[9px] text-text-muted truncate">{title}</div>
                <div className="text-xs font-bold mt-1 truncate">{v}</div>
                <div className="text-[9px] text-text-secondary mt-0.5 truncate">{detail}</div>
              </div>)}
            </div>
            <div className="text-[10px] text-text-muted">
              {contradicts||timeframeConflict?'Conflicting verified signals; WAIT overrides the chart direction.':
                deskSupport||radarSupport?'A current bot supports this indicator direction. Entry, execution and costs still need review.':
                'No sufficiently strong matching bot confirmation. Missing bots do not count as confirmation.'}
            </div>
            {botsError&&<div className="text-[10px] text-rose-400 mt-1">{botsError}</div>}

            <div className="flex flex-wrap items-center gap-1.5 mt-3 border-t border-white/10 pt-2" aria-label="Multiple timeframe analysis">
              <span className="text-[10px] font-semibold text-text-secondary mr-1">5-timeframe view</span>
              {timeframes?.items?.length?timeframes.items.map(item=><span key={item.timeframe} title={item.status==='LIVE'?'RSI '+item.rsi?.toFixed(1):'Not available'}
                className={'rounded border px-1.5 py-1 text-[10px] font-mono '+(item.signal==='BUY'?'border-primary-container/30 text-primary-container':item.signal==='SELL'?'border-rose-500/30 text-rose-400':'border-white/10 text-text-muted')}>
                {item.timeframe} {item.signal||'OFF'}
              </span>):<span className="text-[10px] text-text-muted">{evidenceError||'Checking timeframes…'}</span>}
              <span className="text-[10px] text-text-muted ml-auto">{timeframes?.alignment||'No alignment yet'} · {timeframes?.live??0}/5 live</span>
            </div>
            <div className="mt-3 border-t border-white/10 pt-2" aria-label="Historically similar recorded market setups">
              <div className="flex justify-between items-center gap-2">
                <span className="text-xs font-semibold">Similar past setups · {mode==='spot'?'Hunter':'Perps'}</span>
                <span className="text-[10px] text-text-muted">
                  {analogs?analogs.nearest+' matches / 40d':analogError||'Checking…'}
                </span>
              </div>
              {analogs?(
                <>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[10px] text-text-muted">
                    <span>Latest: {analogs.sourceDecision||'Unknown'} {analogs.direction?'('+analogs.direction+')':''}</span>
                    <span>{analogs.sourceStatus.toLowerCase()} · {analogs.sourceAt?new Date(analogs.sourceAt).toLocaleString():'No source time'}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-2">
                    {analogs.outcomes.map(x=><div key={x.horizonSeconds} className="rounded-md border border-white/5 bg-surface-canvas p-2">
                      <div className="text-[9px] text-text-muted">{x.horizonSeconds<3600?x.horizonSeconds/60+'m':x.horizonSeconds/3600+'h'} forward · {x.samples} labeled</div>
                      <div className="font-mono text-xs font-semibold">{x.samples>=15&&x.positivePct!=null?x.positivePct.toFixed(1)+'% positive':'Insufficient'}</div>
                      <div className="text-[9px] text-text-muted">{x.samples>=15&&x.medianReturnPct!=null?'median '+signed(x.medianReturnPct):'No reliable comparison'}</div>
                    </div>)}
                  </div>
                  <div className="flex items-start justify-between gap-2 mt-2 text-[10px] text-text-muted">
                    <span>{analogs.message} Paper/shadow forward movement only, not trade win odds or net P/L. No matching data is used as live confirmation.</span>
                    <button className="shrink-0 text-primary-container hover:underline" type="button" onClick={()=>void ask('Compare '+symbol+' '+mode+' current setup with recorded historical analogs. What happened at each horizon, how many nonoverlapping samples, what disagrees and should I wait?')}>Ask AI</button>
                  </div>
                </>
              ):<div className="text-[10px] text-text-muted mt-2">{analogError||'Querying recorded research outcomes…'}</div>}
            </div>
            <details className="mt-2 border-t border-white/10 pt-2 text-[10px] text-text-secondary">
              <summary className="cursor-pointer font-semibold text-text-primary flex justify-between items-center">
                <span>All bot evidence & recorded history</span>
                <span className="text-text-muted font-normal">{history?.samples??0} saved observations / 7d</span>
              </summary>
              <div className="space-y-2 pt-2">
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <span>Radar {bots?.status.radar||'UNAVAILABLE'} {bots?.radar?'· '+money(bots.radar.entry):''}</span>
                  <span>Signal Desk {bots?.status.signalDesk||'UNAVAILABLE'}</span>
                  <span>{bots?.scan?.scannedMarkets||0} Radar markets scanned</span>
                </div>
                {bots?.signalDesk&&<div>
                  <span className="font-semibold">Desk flow:</span> tape {signed((bots.signalDesk.micro?.tapeImbalance??0)*100)} · book {signed((bots.signalDesk.micro?.bookImbalance??0)*100)} · spread {bots.signalDesk.micro?.spreadBps?.toFixed(1)??'—'} bps
                  <span className="text-text-muted"> · as of {time(bots.signalDesk.generatedAt)}</span>
                  {bots.signalDesk.contradictions?.length>0&&<p className="mt-1 text-rose-400">{bots.signalDesk.contradictions.slice(0,2).join(' · ')}</p>}
                </div>}
                {bots?.radar&&<div><span className="font-semibold">Radar agent scoring:</span> {Object.entries(bots.radar.agents||{}).slice(0,5).map(([key,value])=>key+' '+Number(value).toFixed(0)).join(' · ')||'Unavailable'}
                  <span className="text-text-muted"> · as of {time(bots.radar.generatedAt)}</span>
                </div>}
                <p className="text-text-muted">Hunter, Scope, DCA and Grid currently reuse Radar-derived inputs. They are not four independent signal confirmations. DEX venue observations are paper-only.</p>
                <div className="border-t border-white/10 pt-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <strong>VPS historical intelligence</strong>
                    <span className="text-text-muted">{legacy?.connected??0} research datasets with records</span>
                  </div>
                  {legacy?.sources?.length?<div className="mt-1 space-y-1">
                    {legacy.sources.filter(x=>x.observations>0).map((item,i)=><div key={item.source+i} className="flex justify-between gap-2 font-mono text-[10px]">
                      <span className="truncate">{item.source}</span>
                      <span className="shrink-0 text-text-muted">{item.observations.toLocaleString()} · {item.status.toLowerCase()}</span>
                    </div>)}
                    {!legacy.connected&&<div className="text-text-muted">No accessible historical rows for this asset</div>}
                  </div>:<div className="text-text-muted mt-1">Older bot research unavailable or being checked</div>}
                  {legacy?.outcomes?.length?(
                    <p className="text-text-muted mt-2">
                      Perps retrospective directional labels: {legacy.outcomes.map(x=>(x.horizonSeconds/60)+'m '+x.positiveDirectionalPct?.toFixed(1)+'% ('+x.samples.toLocaleString()+')').join(' · ')}. Not executed trades or validated predictive accuracy.
                    </p>
                  ):null}
                </div>
                <div className="border-t border-white/10 pt-1.5">
                  <strong>Evidence journal</strong> · {history?.available?'Recording new observations':'Storage unavailable'} · {history?.samples??0} samples
                  {history?.recent?.length?<div className="mt-1 space-y-1">
                    {history.recent.slice(0,5).map((item,i)=><div key={item.source+'-'+item.observedAt+'-'+i} className="flex justify-between gap-2 font-mono text-[10px]">
                      <span className="truncate">{item.source.replaceAll('_',' ')} · {item.timeframe} · {item.direction}</span>
                      <span className="shrink-0 text-text-muted">{time(item.observedAt)}</span>
                    </div>)}
                  </div>:<p className="text-text-muted mt-1">Historical samples begin with this upgrade. No older trade performance has been imported.</p>}
                </div>
              </div>
            </details>

          </div>
        </div>

        <div className="flex flex-col min-w-0 gap-2.5">
          <div className="rounded-lg border border-white/10 bg-surface-panel p-3">
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              <button type="button" className={pill(mode==='spot')} onClick={()=>setMode('spot')}>SPOT BROKER</button>
              <button type="button" className={pill(mode==='perps')} onClick={()=>setMode('perps')}>PERPS BROKER</button>
            </div>
            {mode==='spot'?(
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm">Spot limit plan</span>
                  <span className="text-[10px] text-text-muted">Kraken USD reference</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-surface-canvas p-2"><span className="text-[10px] text-text-muted block">Watch buy limit zone</span><strong className="text-xs font-mono">{a?.dataFresh?money(a.entryZone.low)+' – '+money(a.entryZone.high):'Unavailable'}</strong></div>
                  <div className="rounded-md bg-surface-canvas p-2"><span className="text-[10px] text-text-muted block">Invalidation / stop reference</span><strong className="text-xs font-mono">{a?.dataFresh?money(a.stop):'Unavailable'}</strong></div>
                  <div className="rounded-md bg-surface-canvas p-2"><span className="text-[10px] text-text-muted block">Resistance</span><strong className="text-xs font-mono">{money(a?.resistance)}</strong></div>
                  <div className="rounded-md bg-surface-canvas p-2"><span className="text-[10px] text-text-muted block">EMA 20 / EMA 50</span><strong className="text-xs font-mono">{money(a?.ema20)} / {money(a?.ema50)}</strong></div>
                </div>
                <p className="text-[10px] text-text-muted mt-2">{decision==='WAIT'?'No confirmed entry. These are observation levels, not a buy order.':'Derived technical levels only; review spread, fees, liquidity and invalidation before an order.'}</p>
                <button type="button" onClick={()=>void ask('Should I place a spot limit buy for '+symbol+' now? Give me a data-backed entry, stop and reasons to wait.')} className="mt-2 text-[11px] text-primary-container hover:underline">Ask AURELIS about this spot setup <ChevronRight size={12} className="inline"/></button>
              </>
            ):(
              <>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-bold text-sm">Perps scenario calculator</span>
                  <span className="text-[9px] text-text-muted">RESEARCH ONLY</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 mb-2 text-[10px]">
                  <div className="rounded bg-surface-canvas p-1.5"><span className="text-text-muted block">Perp mark</span><b>{money(futures?.markPrice)}</b></div>
                  <div className="rounded bg-surface-canvas p-1.5"><span className="text-text-muted block">Funding rate</span><b>{futures?signed(futures.fundingRate*100):'—'}</b></div>
                  <div className="rounded bg-surface-canvas p-1.5"><span className="text-text-muted block">Open interest</span><b>{futures?futures.openInterest.toLocaleString('en-US',{maximumFractionDigits:0}):'—'}</b></div>
                </div>
                <div className="grid grid-cols-3 gap-1.5 mb-2">
                  <label className="text-[10px] text-text-muted">Margin USD
                    <input aria-label="Perps margin USD" type="number" min="1" max="100000" step="1" value={margin} onChange={e=>setMargin(e.target.value)} className="mt-1 w-full rounded-md bg-surface-canvas border border-white/10 px-2 py-2 font-mono text-xs text-text-primary"/>
                  </label>
                  <label className="text-[10px] text-text-muted">Leverage
                    <select aria-label="Leverage" value={leverage} onChange={e=>setLeverage(Number(e.target.value))} className="mt-1 w-full rounded-md bg-surface-canvas border border-white/10 px-2 py-2 font-mono text-xs text-text-primary">
                      {[1,2].map(x=><option key={x} value={x}>{x}x</option>)}
                    </select>
                  </label>
                  <label className="text-[10px] text-text-muted">Horizon
                    <select aria-label="Trade horizon" value={duration} onChange={e=>setDuration(Number(e.target.value))} className="mt-1 w-full rounded-md bg-surface-canvas border border-white/10 px-2 py-2 font-mono text-xs text-text-primary">
                      {[1,4,8,12,24].map(x=><option key={x} value={x}>{x}h</option>)}
                    </select>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-surface-canvas p-2"><span className="block text-[10px] text-text-muted">Notional / bias</span><strong>{money(notional)} · {decision==='WAIT'?'NO TRADE':direction}</strong></div>
                  <div className="rounded-md bg-surface-canvas p-2"><span className="block text-[10px] text-text-muted">Reference entry</span><strong>{money(entry)}</strong></div>
                  <div className="rounded-md bg-surface-canvas p-2"><span className="block text-[10px] text-text-muted">At hypothetical target {money(target)}</span><strong className="text-primary-container">{a?.dataFresh&&futures?(pnlTarget>=0?'+':'')+money(pnlTarget):'Unavailable'}</strong></div>
                  <div className="rounded-md bg-surface-canvas p-2"><span className="block text-[10px] text-text-muted">At hypothetical stop {money(stop)}</span><strong className="text-rose-400">{a?.dataFresh&&futures?(pnlStop>=0?'+':'')+money(pnlStop):'Unavailable'}</strong></div>
                </div>
                <div className="flex items-start gap-1.5 mt-2 text-[10px] text-text-muted">
                  <ShieldAlert size={13} className="shrink-0 mt-0.5"/>
                  <span>Kraken Derivatives US trading not verified. Spot-derived stop/target moves are translated to the current public perp mark; figures exclude fees, funding, slippage and liquidation rules. {duration}h is a scenario, not a forecast. Live test cap remains 2x and $10 first notional.</span>
                </div>

                <details className="mt-2 border-t border-white/10 pt-2 text-[10px] text-text-secondary">
                  <summary className="cursor-pointer font-semibold text-text-primary">Cross-DEX liquidity & funding · {venues?.assessments?.length??0} venues</summary>
                  <div className="space-y-1.5 pt-2">
                    {venues?.assessments?.length?venues.assessments.map(row=><div key={row.venue} className="flex justify-between gap-2">
                      <span>{row.venue}</span>
                      <span>{row.spreadBps==null?'No validated book':row.spreadBps.toFixed(1)+' bps'} · {row.depthImbalance==null?'no depth':signed(row.depthImbalance*100)+' depth'}</span>
                    </div>):<div>No verified venue observations available</div>}
                    {venues?.funding?.length?venues.funding.map(row=><div key={row.venue} className="flex justify-between gap-2">
                      <span>{row.venue} funding</span><span>{row.hourlyFundingRate!=null?signed(row.hourlyFundingRate*100):row.nextFundingRate!=null?signed(row.nextFundingRate*100):'unavailable'}</span>
                    </div>):null}
                    <div className="border-t border-white/10 pt-1.5 mt-1.5 flex flex-wrap items-center justify-between gap-2">
                      <span>Arbitrage paper scan · {arbitrage?.status||'UNAVAILABLE'} · {arbitrage?.venueCount??0} venues reporting</span>
                      <span>{arbitrage?.opportunities?.length?arbitrage.opportunities[0].longVenue+' → '+arbitrage.opportunities[0].shortVenue+' · '+signed(arbitrage.opportunities[0].netSpreadBeforeFundingPct):'No spread qualified'}</span>
                    </div>
                    <p className="text-text-muted">Paper/public market observations only. No directional signal, funding cost guarantee or U.S. execution eligibility is inferred.</p>
                  </div>
                </details>

                <button type="button" onClick={()=>void ask('Evaluate a '+duration+'h '+symbol+' perp scenario with $'+marginUsd+' margin at '+leverage+'x. Is a long or short supported? Explain entry, stop and risk.')} className="mt-2 text-[11px] text-primary-container hover:underline">Ask AURELIS to assess this bet <ChevronRight size={12} className="inline"/></button>
              </>
            )}
          </div>

          <div className="rounded-lg border border-white/10 bg-surface-panel p-3 flex flex-col gap-2 min-h-[265px]">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold"><Bot size={14} className="text-primary-container"/>AURELIS AI</span>
              <span className="text-[10px] text-text-muted">{symbol} · {mode.toUpperCase()}</span>
            </div>
            <div role="log" aria-label="AURELIS market broker chat" className="max-h-[235px] min-h-[100px] overflow-y-auto flex flex-col gap-2">
              {!messages.length&&<div className="text-[11px] text-text-muted leading-relaxed">Ask about this coin, today's news, spot limit levels, or a perp scenario. Every answer requests fresh verified market data.</div>}
              {messages.slice(-12).map((m,i)=><div key={m.at+'-'+i} className={'rounded-md p-2 text-[11px] leading-relaxed whitespace-pre-wrap '+(m.role==='user'?'bg-primary-container/10 ml-6':'bg-surface-canvas mr-2')}>
                {m.text}
                {m.engine&&<div className="mt-1.5 text-[9px] text-text-muted">{m.engine} · {time(m.at)}</div>}
              </div>)}
              {asking&&<div className="text-[11px] text-text-muted">Checking live market and bot data…</div>}
            </div>
            <form className="mt-auto flex gap-1.5" onSubmit={e=>{e.preventDefault();void ask()}}>
              <input aria-label="Ask AURELIS AI" value={question} maxLength={700} onChange={e=>setQuestion(e.target.value)}
                placeholder="Where should my BTC spot limit go?" className="w-full min-w-0 rounded-md border border-white/10 bg-surface-canvas px-2.5 py-2 text-xs text-text-primary placeholder:text-text-muted"/>
              <button disabled={!question.trim()||asking} type="submit" className="rounded-md bg-primary-container text-on-primary-container px-3 disabled:opacity-40" aria-label="Send broker question"><Send size={15}/></button>
            </form>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-surface-panel px-3 py-2">
        <div className="flex flex-wrap justify-between gap-2 items-center mb-2">
          <h2 className="text-xs font-bold">Latest market headlines</h2>
          <span className="text-[10px] text-text-muted">Publisher headlines, not proven causes</span>
        </div>
        {symbolNews.length?<div className="grid sm:grid-cols-2 gap-1.5">
          {symbolNews.map((item,i)=><a key={item.url+i} href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-start justify-between gap-2 rounded-md bg-surface-canvas/60 hover:bg-white/5 p-2 border border-white/5">
            <div className="min-w-0">
              <div className="text-[11px] font-medium leading-snug line-clamp-2">{item.title}</div>
              <div className="text-[9px] text-text-muted mt-1">{item.source} · {item.time?new Date(item.time).toLocaleDateString():'Time unavailable'}</div>
            </div>
            <ExternalLink size={12} className="text-text-muted shrink-0 mt-0.5"/>
          </a>)}
        </div>:<p className="text-[11px] text-text-muted">{newsError||'Checking news feeds. No verified headlines currently available.'}</p>}
      </div>
      <div className="flex flex-wrap gap-2 justify-between text-[10px] text-text-muted">
        <span><Activity size={12} className="inline mr-1"/>Spot Kraken · Macro quotes delayed/last available · Bot signals only when available</span>
        <button type="button" className="text-primary-container hover:underline" onClick={()=>onNavigate('ai')}>Existing bots & Live Bet <ChevronRight size={12} className="inline"/></button>
      </div>
    </div>
  );
};

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Bot, ChevronRight, ExternalLink, RefreshCw, Send, ShieldAlert } from 'lucide-react';
import { KrakenLiveChart } from './KrakenLiveChart';
import { makeBrokerCoach } from '../services/brokerCoach';
import { calculatePerpsResearch, MAX_RESEARCH_LEVERAGE, REAL_KRAKEN_TEST_LEVERAGE_CAP, REAL_KRAKEN_FIRST_TEST_NOTIONAL_USD, type ResearchSide } from '../services/perpsResearch';
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
  const [showEvidence,setShowEvidence]=useState(false);
  const [showMovingAverages,setShowMovingAverages]=useState(true);
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
  const [researchSide,setResearchSide]=useState<ResearchSide>('LONG');
  const [favorableMove,setFavorableMove]=useState('2');
  const [adverseMove,setAdverseMove]=useState('1');
  const [duration,setDuration]=useState(4);
  const [question,setQuestion]=useState('');
  const [messages,setMessages]=useState<Message[]>([]);
  const [asking,setAsking]=useState(false);
  const contextRef=useRef(symbol+':'+mode);
  contextRef.current=symbol+':'+mode;
  // Preserve the conversation across mode/coin changes; the request is still scoped to its selected context.

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
  const sourceConfirmation=Number(deskSupport)+Number(radarSupport);
  const historicalLabels=analogs?.outcomes?.reduce((total,item)=>total+item.samples,0)??0;
  const spotLongStop=a?.dataFresh&&a.signal==='BUY'&&a.stop<a.entryZone.low?a.stop:null;
  const marketState=!a?'NO DATA':!a.dataFresh?'STALE DATA':contradicts||timeframeConflict?'CONFLICTING SIGNALS':!deskSupport&&!radarSupport?'NO CONFIRMED SETUP':'BOT CONFIRMED';
  const botStatusText=bots?.signalDesk&&bots?.radar?'Signal Desk + Radar':bots?.signalDesk?'Signal Desk only':bots?.radar?'Radar only':'No live bot match';
  const indicatorAge=snapshot?.observedAt?Math.max(0,Math.floor((Date.now()-snapshot.observedAt)/1000)):null;
  const marginUsd=inRange(Number(margin),0,100000);
  const perpMarkFresh=!!futures&&futures.markPrice>0&&Date.now()-futures.asOf<90000;
  const scenario=calculatePerpsResearch({
    marginUsd,leverage,entryPrice:perpMarkFresh?futures?.markPrice:null,
    side:researchSide,
    favorableMovePct:Number(favorableMove),
    adverseMovePct:Number(adverseMove)
  });
  const researchWarning=scenario.adverseMoveExceedsMargin
    ? 'The modeled adverse move would exhaust the entire initial margin before accounting for maintenance and fees.'
    : scenario.marginRiskPctAtAdverseMove>=50
      ? 'The adverse scenario consumes at least half the initial margin before costs.'
      : null;
  const chartTimeframe=frame==='1h'?'1H':frame==='4h'?'4H':frame;
  const symbolNews=useMemo(()=>{
    const names:Record<string,string>={BTC:'bitcoin',ETH:'ethereum',SOL:'solana',XRP:'ripple'};
    const match=names[symbol]||symbol.toLowerCase();
    const relevant=news.filter(n=>n.title.toLowerCase().includes(match)||n.title.toUpperCase().includes(symbol));
    return (relevant.length?relevant:news).slice(0,4);
  },[news,symbol]);

  const relatedNews=symbolNews.find(item=>new RegExp(symbol==='BTC'?'bitcoin|\\bBTC\\b':symbol==='ETH'?'ethereum|\\bETH\\b':symbol==='SOL'?'solana|\\bSOL\\b':symbol==='XRP'?'ripple|\\bXRP\\b':'\\b'+symbol+'\\b','i').test(item.title))||null;
  const coach=makeBrokerCoach({
    symbol,frame,mode,decision,asOf:snapshot?.observedAt??null,
    chart:a?{signal:a.signal,rsi:a.rsi,volumeRatio:a.volumeRatio,support:a.support,resistance:a.resistance,price:a.price,dataFresh:a.dataFresh,entryZone:a.entryZone}:null,
    desk:bots?.signalDesk??null,radar:bots?.radar??null,
    timeframe:timeframes?{alignment:timeframes.alignment,live:timeframes.live}:null,
    analogs:analogs?{nearest:analogs.nearest,sourceDecision:analogs.sourceDecision,outcomes:analogs.outcomes}:null,
    news:relatedNews?{title:relatedNews.title,source:relatedNews.source,time:relatedNews.time}:null
  });
  const suggestions=[
    'Markets are down. Scan our supported coins and explain which might be worth accumulating, and why.',
    'I have $100 total. Screen for a potential perp setup, explain the risks, or tell me to wait.',
    'Show the three closest setups even if none qualifies. Explain exactly what each is missing.',
    'Conservative: rank our current watchlist by confirmation and downside risk.',
    'Balanced: show promising opportunities and what would make them actionable.',
    'Aggressive: find early momentum setups worth watching, with strict hypothetical loss limits.',
    'Teach me why our bots disagree on '+symbol+' and what would change the setup.'
  ];
  const ask=async(prompt?:string)=>{
    const query=(prompt||question).trim();
    if(!query||asking)return;
    const intentMode=/perp|leverag|futures|liquidat|short\b|long\b/i.test(query)?'perps':/accumulat|spot|buy and hold/i.test(query)?'spot':mode;
    const scope=contextRef.current;
    setQuestion('');
    setMessages(current=>[...current.slice(-12),{role:'user',text:query,at:Date.now()}]);
    setAsking(true);
    try{
      const answer=await request<{reply:string;engine:string;providerStatus?:string;marketAsOf:number}>('/api/market-broker/chat',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({message:query,symbol,tf:frame,mode:intentMode,margin:marginUsd,
          researchLeverage:leverage,researchSide,
          favorableMovePct:Number(favorableMove),adverseMovePct:Number(adverseMove)})
      });
      if(contextRef.current===scope)setMessages(current=>[...current,{role:'assistant',text:answer.reply,engine:answer.engine+(answer.providerStatus&&answer.providerStatus!=='online'?' · AI '+answer.providerStatus.replaceAll('_',' '):''),at:answer.marketAsOf||Date.now()}]);
    }catch(e:any){
      if(contextRef.current===scope)setMessages(current=>[...current,{role:'assistant',text:'Live analysis unavailable: '+(e?.message||'data source offline')+'. No recommendation generated.',engine:'Unavailable',at:Date.now()}]);
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

      <section aria-label="Ask AURELIS AI" className="flex flex-col gap-2">
        <p className="text-xs text-text-secondary">Tell me your budget or what the market is doing. I’ll look at what the available data actually supports, explain the reasoning, and tell you when waiting makes more sense.</p>
        <div className="rounded-xl border border-primary-container/30 bg-surface-panel p-3 sm:p-4 flex flex-col gap-3 min-h-[500px]">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-lg font-bold"><Bot size={19} className="text-primary-container"/>AURELIS AI</span>
            <span className="text-[10px] text-text-muted">Ask about up to 20 configured markets · Research only</span>
          </div>
          <div role="log" aria-label="AURELIS market broker chat" className="max-h-[440px] min-h-[230px] overflow-y-auto flex flex-col gap-2">
            {!messages.length&&<div className="text-[12px] text-text-secondary leading-relaxed">Ask me what to buy, what to avoid, or what to learn. For market-wide questions I screen the configured coins, check available bot signals, and tell you what is actually supported. No charts to decipher.</div>}
            {messages.slice(-12).map((m,i)=><div key={m.at+'-'+i} className={'rounded-md p-2 text-[11px] leading-relaxed whitespace-pre-wrap '+(m.role==='user'?'bg-primary-container/10 ml-6':'bg-surface-canvas mr-2')}>
              {m.text}
              {m.engine&&<div className="mt-1.5 text-[9px] text-text-muted">{m.engine} · {time(m.at)}</div>}
            </div>)}
            {asking&&<div className="text-[11px] text-text-muted">Checking live market and bot data…</div>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map(suggestion=><button key={suggestion} type="button" disabled={asking} onClick={()=>void ask(suggestion)}
              className="rounded-full border border-primary-container/30 bg-primary-container/5 px-2.5 py-1.5 text-[10px] text-left text-text-primary hover:bg-primary-container/15 disabled:opacity-40">{suggestion}</button>)}
          </div>
          <form className="mt-auto flex gap-1.5" onSubmit={e=>{e.preventDefault();void ask()}}>
            <input aria-label="Ask AURELIS AI" value={question} maxLength={700} onChange={e=>setQuestion(e.target.value)}
              placeholder="Ask anything: Which coins to accumulate? I have $100, find a potential perp..." className="w-full min-w-0 rounded-md border border-white/10 bg-surface-canvas px-2.5 py-2 text-xs text-text-primary placeholder:text-text-muted"/>
            <button disabled={!question.trim()||asking} type="submit" className="rounded-md bg-primary-container text-on-primary-container px-3 disabled:opacity-40" aria-label="Send broker question"><Send size={15}/></button>
          </form>
        </div>
      </section>
      <button type="button" aria-expanded={showEvidence} onClick={()=>setShowEvidence(x=>!x)}
        className="w-full text-left rounded-lg border border-white/10 bg-surface-panel p-3 flex justify-between items-center gap-2 hover:border-primary-container/30">
        <span className="text-xs font-semibold">{showEvidence?'Hide technical workspace':'Show supporting charts, bot reports & research tools'}</span>
        <span className="text-[11px] text-text-secondary">{showEvidence?'Close':'Optional details'} <ChevronRight size={13} className={'inline '+(showEvidence?'rotate-90':'')}/></span>
      </button>
      <div className={showEvidence?'flex flex-col gap-2.5':'hidden'} aria-hidden={!showEvidence}>
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

      <section className="rounded-xl border border-primary-container/20 bg-surface-panel p-3 sm:p-4 space-y-3" aria-label="AURELIS market coach briefing">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <span className="flex items-center gap-2 text-xs font-bold text-primary-container"><Bot size={16}/> AURELIS · YOUR MARKET READ</span>
          <div className="flex items-center gap-1.5">
            <button type="button" className={pill(mode==='spot')} onClick={()=>setMode('spot')}>Spot advisor</button>
            <button type="button" className={pill(mode==='perps')} onClick={()=>setMode('perps')}>Perps advisor</button>
          </div>
        </div>
        <div>
          <span className={'text-[10px] font-bold font-mono tracking-wider '+(decision==='BUY'?'text-primary-container':decision==='SELL'?'text-rose-500':'text-text-secondary')}>
            {decision==='BUY'?'BUY SETUP':decision==='SELL'?'BEARISH / DEFENSIVE':'WAIT'} · {symbol} {frame} · {coach.dataStatus}
          </span>
          <h2 className="mt-1 text-lg sm:text-xl font-bold leading-snug text-text-primary">{coach.headline}</h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-lg bg-surface-canvas border border-white/10 p-3">
            <span className="text-[10px] font-bold uppercase tracking-wide text-text-secondary">What our data says</span>
            <p className="text-xs sm:text-sm mt-1.5 leading-relaxed">{coach.why}</p>
          </div>
          <div className="rounded-lg bg-surface-canvas border border-white/10 p-3">
            <span className="text-[10px] font-bold uppercase tracking-wide text-text-secondary">What I would look for next</span>
            <p className="text-xs sm:text-sm mt-1.5 leading-relaxed">{coach.next}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div className="flex gap-2"><span className="shrink-0 text-primary-container font-semibold">Learn</span><span className="text-text-secondary">{coach.lesson}</span></div>
          <div className="flex gap-2"><span className="shrink-0 text-primary-container font-semibold">History</span><span className="text-text-secondary">{coach.historical}</span></div>
        </div>
        <div className="text-[11px] text-text-secondary border-t border-white/10 pt-2">
          <span className="font-semibold text-text-primary">In the news:</span> {coach.news}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono text-text-secondary border-t border-white/10 pt-2">
          <span>RSI {a?.dataFresh?a.rsi.toFixed(1):'—'}</span>
          <span>Volume {a?.dataFresh?a.volumeRatio.toFixed(2)+'x':'—'}</span>
          <span>Support {a?.dataFresh?money(a.support):'—'}</span>
          <span>Resistance {a?.dataFresh?money(a.resistance):'—'}</span>
          <span>{timeframes?.alignment||'Timeframes unavailable'}</span>
          <span className="ml-auto">Snapshot {time(snapshot?.observedAt)}</span>
        </div>
      </section>

      <div className="flex flex-col gap-3">

        <div className="order-3 min-w-0 flex flex-col gap-2.5">
          <div className="rounded-lg border border-white/10 bg-surface-panel overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold">Price, volume & levels <span className="text-text-muted font-normal">{symbol}/USD · {frame}</span></span>
                <button type="button" className={pill(showMovingAverages)} onClick={()=>setShowMovingAverages(x=>!x)} aria-pressed={showMovingAverages}>EMA 20/50 {showMovingAverages?'ON':'OFF'}</button>
              </div>
              <span className={'text-[10px] font-mono '+(a?.dataFresh?'text-primary-container':'text-text-muted')}>{loading?'Loading…':a?.dataFresh?'LIVE candles':'Data unavailable / stale'}</span>
            </div>
            <div className="h-[310px] md:h-[365px] relative">
              {snapshot?.bars?.length ? (
                <KrakenLiveChart symbol={symbol} timeframe={chartTimeframe as any} bars={snapshot.bars} support={a?.dataFresh?a.support:undefined} resistance={a?.dataFresh?a.resistance:undefined} showMovingAverages={showMovingAverages} onPrice={onPrice}/>
              ) : <div className="absolute inset-0 flex items-center justify-center text-xs text-text-muted">{chartError||'Loading verified candles…'}</div>}
            </div>
            <div className="flex flex-wrap justify-between gap-2 border-t border-white/10 px-3 py-2 text-[10px] font-mono text-text-muted">
              <span>Support {money(a?.support)} · Resistance {money(a?.resistance)} · EMA20 {money(a?.ema20)} · EMA50 {money(a?.ema50)}</span>
              <span>Updated {time(snapshot?.observedAt)}</span>
            </div>
          </div>

          <div className="order-2 rounded-lg border border-white/10 bg-surface-panel p-3">
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
            <div className="text-[11px] text-text-secondary">
              {contradicts||timeframeConflict?'Conflicting verified signals; WAIT overrides the chart direction.':
                deskSupport||radarSupport?'A current bot supports this indicator direction. Entry, execution and costs still need review.':
                'No sufficiently strong matching bot confirmation. Missing bots do not count as confirmation.'}
            </div>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2" aria-label="Verified bot market evidence">
              <div className="rounded-md bg-surface-canvas border border-white/10 p-2.5">
                <div className="flex justify-between items-center text-[11px]">
                  <strong>Signal Desk · liquidity & trade flow</strong>
                  <span className="text-text-muted">{bots?.signalDesk?time(bots.signalDesk.generatedAt):bots?.status.signalDesk||'Unavailable'}</span>
                </div>
                {bots?.signalDesk?(
                  <>
                    <div className="mt-2 grid grid-cols-3 gap-2 font-mono">
                      <div><span className="text-[9px] text-text-secondary block">Readiness</span><b className="text-xs">{Number.isFinite(bots.signalDesk.readiness)?bots.signalDesk.readiness.toFixed(0)+'/100':'—'}</b></div>
                      <div><span className="text-[9px] text-text-secondary block">Tape imbalance</span><b className="text-xs">{typeof bots.signalDesk.micro?.tapeImbalance==='number'?signed(bots.signalDesk.micro.tapeImbalance*100):'—'}</b></div>
                      <div><span className="text-[9px] text-text-secondary block">Book imbalance</span><b className="text-xs">{typeof bots.signalDesk.micro?.bookImbalance==='number'?signed(bots.signalDesk.micro.bookImbalance*100):'—'}</b></div>
                    </div>
                    <div className="mt-2 h-1.5 bg-surface-panel rounded-full overflow-hidden" title="Signal Desk readiness, not a win probability">
                      <div className="h-full rounded-full bg-primary-container" style={{width:Math.max(0,Math.min(100,bots.signalDesk.readiness||0))+'%'}}/>
                    </div>
                    {bots.signalDesk.contradictions?.length>0&&<p className="mt-2 text-[10px] text-rose-500">{bots.signalDesk.contradictions[0]}</p>}
                  </>
                ):<p className="mt-2 text-[10px] text-text-secondary">No fresh Signal Desk snapshot for this asset.</p>}
              </div>
              <div className="rounded-md bg-surface-canvas border border-white/10 p-2.5">
                <div className="flex justify-between items-center text-[11px]">
                  <strong>Trade Radar · qualified setup</strong>
                  <span className="text-text-muted">{bots?.radar?time(bots.radar.generatedAt):bots?.status.radar||'Unavailable'}</span>
                </div>
                {bots?.radar?(
                  <>
                    <div className="mt-2 grid grid-cols-3 gap-2 font-mono">
                      <div><span className="text-[9px] text-text-secondary block">Radar score</span><b className="text-xs">{Number.isFinite(bots.radar.score)?bots.radar.score.toFixed(0):'—'}</b></div>
                      <div><span className="text-[9px] text-text-secondary block">Direction</span><b className="text-xs">{bots.radar.direction||'—'}</b></div>
                      <div><span className="text-[9px] text-text-secondary block">Qualified</span><b className="text-xs">{bots.radar.qualified?'YES':'NO'}</b></div>
                    </div>
                    <div className="mt-2 text-[10px] text-text-secondary">Entry {money(bots.radar.entry)} · Stop {money(bots.radar.stop)} · Target {money(bots.radar.target)}</div>
                    {bots.radar.reasons?.length>0&&<p className="mt-1 text-[10px] text-text-secondary">{bots.radar.reasons[0]}</p>}
                  </>
                ):<p className="mt-2 text-[10px] text-text-secondary">No fresh Radar candidate matches this asset. Nothing is counted as a vote.</p>}
              </div>
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

        <div className="order-1 grid grid-cols-1 xl:grid-cols-2 min-w-0 gap-3 items-start">
          <div className="rounded-lg border border-white/10 bg-surface-panel p-3">
            {mode==='spot'?(
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm">Spot limit plan</span>
                  <span className="text-[10px] text-text-muted">Kraken USD reference</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-surface-canvas p-2"><span className="text-[10px] text-text-muted block">Unconfirmed spot observation zone</span><strong className="text-xs font-mono">{a?.dataFresh?money(a.entryZone.low)+' – '+money(a.entryZone.high):'Unavailable'}</strong></div>
                  <div className="rounded-md bg-surface-canvas p-2"><span className="text-[10px] text-text-muted block">Potential long invalidation</span><strong className="text-xs font-mono">{spotLongStop!==null?money(spotLongStop):'No valid long stop'}</strong></div>
                  <div className="rounded-md bg-surface-canvas p-2"><span className="text-[10px] text-text-muted block">Resistance</span><strong className="text-xs font-mono">{money(a?.resistance)}</strong></div>
                  <div className="rounded-md bg-surface-canvas p-2"><span className="text-[10px] text-text-muted block">EMA 20 / EMA 50</span><strong className="text-xs font-mono">{money(a?.ema20)} / {money(a?.ema50)}</strong></div>
                </div>
                <p className="text-[10px] text-text-muted mt-2">{decision==='WAIT'?'WAIT: no confirmed spot entry. An unconfirmed observation zone is not a limit-order recommendation.':decision==='SELL'?'SELL / defensive conditions: do not interpret the chart’s short-side stop as a long-buy stop.':'Long setup supported by current bots; levels are technical references, not executable quotes. Review spread, fees and liquidity.'}</p>
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
                    <input aria-label="Perps research margin USD" type="number" min="1" max="100000" step="1" value={margin} onChange={e=>setMargin(e.target.value)} className="mt-1 w-full rounded-md bg-surface-canvas border border-white/10 px-2 py-2 font-mono text-xs text-text-primary"/>
                  </label>
                  <label className="text-[10px] text-text-muted">Research leverage
                    <select aria-label="Research leverage from 1x to 20x" value={leverage} onChange={e=>setLeverage(Number(e.target.value))} className="mt-1 w-full rounded-md bg-surface-canvas border border-white/10 px-2 py-2 font-mono text-xs text-text-primary">
                      {Array.from({length:MAX_RESEARCH_LEVERAGE},(_,i)=>i+1).map(x=><option key={x} value={x}>{x}x</option>)}
                    </select>
                  </label>
                  <label className="text-[10px] text-text-muted">Horizon
                    <select aria-label="Research horizon" value={duration} onChange={e=>setDuration(Number(e.target.value))} className="mt-1 w-full rounded-md bg-surface-canvas border border-white/10 px-2 py-2 font-mono text-xs text-text-primary">
                      {[1,4,8,12,24].map(x=><option key={x} value={x}>{x}h</option>)}
                    </select>
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-1.5 mb-2">
                  <label className="text-[10px] text-text-muted">Scenario side
                    <select aria-label="Hypothetical position direction" value={researchSide} onChange={e=>setResearchSide(e.target.value==='SHORT'?'SHORT':'LONG')} className="mt-1 w-full rounded-md bg-surface-canvas border border-white/10 px-2 py-2 font-mono text-xs text-text-primary">
                      <option value="LONG">Long</option>
                      <option value="SHORT">Short</option>
                    </select>
                  </label>
                  <label className="text-[10px] text-text-muted">Favorable move %
                    <input aria-label="Favorable price move percentage" type="number" min="0" max="100" step="0.25" value={favorableMove} onChange={e=>setFavorableMove(e.target.value)} className="mt-1 w-full rounded-md bg-surface-canvas border border-white/10 px-2 py-2 font-mono text-xs text-text-primary"/>
                  </label>
                  <label className="text-[10px] text-text-muted">Adverse move %
                    <input aria-label="Adverse price move percentage" type="number" min="0" max="100" step="0.25" value={adverseMove} onChange={e=>setAdverseMove(e.target.value)} className="mt-1 w-full rounded-md bg-surface-canvas border border-white/10 px-2 py-2 font-mono text-xs text-text-primary"/>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-surface-canvas p-2"><span className="block text-[10px] text-text-muted">Hypothetical notional / direction</span><strong>{money(scenario.notionalUsd)} · {researchSide}</strong><span className="block text-[9px] text-text-muted">Current signal: {decision==='WAIT'?'WAIT':decision}</span></div>
                  <div className="rounded-md bg-surface-canvas p-2"><span className="block text-[10px] text-text-muted">Live perp mark reference</span><strong>{perpMarkFresh?money(scenario.entryPrice):'Unavailable / stale'}</strong></div>
                  <div className="rounded-md bg-surface-canvas p-2"><span className="block text-[10px] text-text-muted">If favorable {scenario.favorableMovePct}% · {money(scenario.favorablePrice)}</span><strong className="text-primary-container">{scenario.valid?'+'+money(scenario.favorablePnlUsd):'Unavailable'}</strong></div>
                  <div className="rounded-md bg-surface-canvas p-2"><span className="block text-[10px] text-text-muted">If adverse {scenario.adverseMovePct}% · {money(scenario.adversePrice)}</span><strong className="text-rose-400">{scenario.valid?'-'+money(Math.abs(scenario.adversePnlUsd||0)):'Unavailable'}</strong></div>
                </div>
                <div className="mt-2 rounded-md border border-white/10 bg-surface-canvas p-2 text-[10px]">
                  <div className="flex flex-wrap justify-between gap-1">
                    <span className="font-semibold">Margin exhaustion illustration (NOT actual liquidation)</span>
                    <span className="font-mono">{scenario.theoreticalMarginExhaustionMovePct.toFixed(2)}% adverse</span>
                  </div>
                  <div className="flex flex-wrap justify-between gap-1 mt-1 text-text-muted">
                    <span>Theoretical zero-equity price: {scenario.valid?money(scenario.theoreticalMarginExhaustionPrice):'Unavailable'}</span>
                    <span>Modeled margin loss: {scenario.marginRiskPctAtAdverseMove.toFixed(1)}%</span>
                  </div>
                  {researchWarning&&<p className="mt-1 text-rose-400">{researchWarning}</p>}
                </div>
                <div className="flex items-start gap-1.5 mt-2 text-[10px] text-text-muted">
                  <ShieldAlert size={13} className="shrink-0 mt-0.5"/>
                  <span>Research only, not an order. Price moves are assumptions, not predictions or stop/target orders. Real exchange liquidation may occur earlier; collateral, maintenance, fees, funding and slippage are excluded. {duration}h is a scenario horizon, not a forecast. Live Kraken test stays capped at {REAL_KRAKEN_TEST_LEVERAGE_CAP}x and ${REAL_KRAKEN_FIRST_TEST_NOTIONAL_USD} first notional with explicit approval; Kraken Derivatives execution is unverified.</span>
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

                <button type="button" onClick={()=>void ask('Evaluate this HYPOTHETICAL '+duration+'h '+symbol+' '+researchSide+' perp scenario with $'+marginUsd+' margin at '+leverage+'x. Model favorable '+scenario.favorableMovePct+'% and adverse '+scenario.adverseMovePct+'% moves. Compare it with actual bot signals and explain risks, clearly separating research leverage from the real 2x test cap.')} className="mt-2 text-[11px] text-primary-container hover:underline">Ask AURELIS to assess this bet <ChevronRight size={12} className="inline"/></button>
              </>
            )}
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
      </div>
      <div className="flex flex-wrap gap-2 justify-between text-[10px] text-text-muted">
        <span><Activity size={12} className="inline mr-1"/>Spot Kraken · Macro quotes delayed/last available · Bot signals only when available</span>
        <button type="button" className="text-primary-container hover:underline" onClick={()=>onNavigate('ai')}>Existing bots & Live Bet <ChevronRight size={12} className="inline"/></button>
      </div>
    </div>
  );
};

/**
 * Short, deterministic market guidance using only observed evidence.
 * This is the on-screen briefing, not a predictive AI model.
 * Any response that needs deeper judgement goes to the grounded chat endpoint.
 */
export type CoachDirection='BUY'|'SELL'|'WAIT';
export type BrokerCoachInput={
  symbol:string;frame:string;mode:'spot'|'perps';
  decision:CoachDirection;
  chart?:{signal:CoachDirection;rsi:number;volumeRatio:number;support:number;resistance:number;price:number;dataFresh:boolean;entryZone?:{low:number;high:number}}|null;
  desk?:{direction:'LONG'|'SHORT';readiness:number;generatedAt:number;contradictions?:string[];micro?:{tapeImbalance?:number;bookImbalance?:number}}|null;
  radar?:{direction:'LONG'|'SHORT';score:number;qualified:boolean;generatedAt:number}|null;
  timeframe?:{alignment:string;live:number}|null;
  analogs?:{nearest:number;sourceDecision:string|null;outcomes:{horizonSeconds:number;samples:number;positivePct:number|null;medianReturnPct:number|null}[]}|null;
  news?:{title:string;source:string;time:number}|null;
  asOf?:number|null;now?:number;
};
export type CoachBrief={headline:string;why:string;next:string;lesson:string;historical:string;news:string;dataStatus:string};
const pct=(v:number)=>Number.isFinite(v)?(v>0?'+':'')+v.toFixed(1)+'%':'unavailable';
const curr=(v:number)=>Number.isFinite(v)&&v>0?'$'+v.toLocaleString('en-US',{maximumFractionDigits:v<1?6:2,minimumFractionDigits:2}):'unavailable';
export function makeBrokerCoach(input:BrokerCoachInput):CoachBrief{
  const {symbol,frame,mode,chart,desk,radar,timeframe,analogs,news}=input;
  const now=input.now??Date.now();
  const fresh=!!chart?.dataFresh&&!!input.asOf&&now-input.asOf<180000&&input.asOf<now+60000;
  const deskFresh=!!desk?.generatedAt&&now-desk.generatedAt<180000&&desk.generatedAt<now+60000;
  const radarFresh=!!radar?.generatedAt&&now-radar.generatedAt<300000&&radar.generatedAt<now+60000;
  const deskText=deskFresh&&desk?('Desk '+desk.direction.toLowerCase()+' '+(Number.isFinite(desk.readiness)?Math.round(desk.readiness)+'/100':'score unavailable')):'Signal Desk unavailable';
  const radarText=radarFresh&&radar?('Radar '+radar.direction.toLowerCase()+' '+(radar.qualified?'qualified':'unqualified')+' ('+(Number.isFinite(radar.score)?Math.round(radar.score):'—')+')'):'Radar has no fresh matched setup';
  const tfText=timeframe?.live?timeframe.alignment.toLowerCase()+' across '+timeframe.live+'/5 timeframes':'timeframe consensus unavailable';
  const safeDecision=fresh?input.decision:'WAIT';
  const headline=!fresh?('I cannot verify a fresh '+symbol+' setup right now.'):
    safeDecision==='BUY'?(mode==='spot'?'A spot buy setup has confirmation.':'Bullish signals are confirmed, but Perps need separate risk review.'):
    safeDecision==='SELL'?(mode==='spot'?'Bearish setup: I would not treat this as a spot dip-buy.':'Bearish signals favor defensive or short-side research.'):
    mode==='spot'?'I would wait before placing a new spot buy.':'I would wait before taking a leveraged position.';
  const why=!fresh?'The candle snapshot is unavailable or too old, so the page should not recommend an entry.':
    frame+' chart says '+chart!.signal.toLowerCase()+'; '+deskText+'; '+radarText+'; '+tfText+'.';
  const next=!fresh?'Refresh market data and check that Kraken and the bot feeds reconnect.':
    safeDecision==='BUY'?
      (mode==='spot'?'Review the observation zone '+curr(chart!.entryZone?.low??NaN)+'–'+curr(chart!.entryZone?.high??NaN)+'. Check spread and position risk before any limit order.':
        'Check the perpetual mark, funding and downside scenario. Research leverage is not an executable order.'):
    safeDecision==='SELL'?
      (mode==='spot'?'Do not use short-side stop levels as a spot-buy stop. A safer buy discussion needs fresh bullish confirmation.':
        'Consider a short only as a hypothetical scenario; check liquidation and available margin first.'):
      'Wait for a qualified Radar setup or Signal Desk readiness ≥68 in the chart direction, without opposing signals.';
  const lesson=!fresh?'Why freshness matters: a setup from an old candle can be misleading.':
    chart!.rsi<30?('RSI '+chart!.rsi.toFixed(1)+' is oversold. That measures recent downward momentum, not proof of a bottom.'):
    chart!.rsi>70?('RSI '+chart!.rsi.toFixed(1)+' is overbought. Strong trends can remain overbought, so it is not an automatic sell.'):
    ('RSI '+chart!.rsi.toFixed(1)+' measures momentum, not certainty. Volume '+chart!.volumeRatio.toFixed(2)+'x compares recent activity with its baseline.');
  const outcome=analogs?.outcomes?.filter(o=>o.samples>=15&&o.positivePct!=null)
    .sort((a,b)=>Math.abs(a.horizonSeconds-14400)-Math.abs(b.horizonSeconds-14400))[0];
  const historical=analogs&&analogs.nearest>=15&&outcome?
    ('In '+analogs.nearest+' separated research matches, '+(outcome.horizonSeconds/3600)+'h forward movement was positive '+pct(outcome.positivePct!)+' of the time; median '+pct(outcome.medianReturnPct??NaN)+'. Paper observations, not trading odds.'):
    'There are not enough comparable, validated historical outcomes to estimate a meaningful pattern.';
  const newsText=news?.title?('Latest related headline from '+news.source+': '+news.title+'. A headline alone does not establish why price moved.'):'No verified related news headline is available right now.';
  return {headline,why,next,lesson,historical,news:newsText,dataStatus:fresh?'Fresh snapshot':'Unavailable or stale snapshot'};
}

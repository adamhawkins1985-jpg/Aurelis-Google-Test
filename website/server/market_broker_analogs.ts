/**
 * Read-only historical analog search against *existing* VPS research data.
 * No trades, exchange credentials, wallet/account records, or DB writes.
 * Matching uses only features captured at signal time. Forward outcomes are
 * consulted AFTER selection, never for finding nearest neighbors.
 */
import Database from 'better-sqlite3';

type Mode='spot'|'perps';
type Side='LONG'|'SHORT';
type Raw={id:number;at:number;direction:Side|null;decision:string;long:number;short:number;confidence:number;features:any};
type Match={at:number;distance:number;id:number};
type Outcome={id:number;at:number;seconds:number;ret:number;favorable:number|null;adverse:number|null};
export type AnalogReport={
  ok:true;symbol:string;mode:Mode;source:string;asOf:number;
  sourceAt:number|null;sourceDecision:string|null;direction:Side|null;
  sourceStatus:'CURRENT'|'STALE'|'UNAVAILABLE';
  observationsExamined:number;nearest:number;comparisonWindowDays:number;
  featuresUsed:string[];similarityMethod:string;outcomes:{
    horizonSeconds:number;samples:number;positivePct:number|null;medianReturnPct:number|null;
    meanReturnPct:number|null;p10ReturnPct:number|null;p90ReturnPct:number|null;
    medianFavorablePct:number|null;medianAdversePct:number|null;earliestAt:number|null;latestAt:number|null
  }[];
  examples:{at:number;distance:number;sourceDecision:string}[];
  notes:string[];message:string;
};
const PATH={
  spot:'/opt/aurelis/trade-hunter/data/trade_hunter.sqlite3',
  perps:'/opt/aurelis/ai-perps-telemetry/data/telemetry.sqlite3'
} as const;
const CACHE=new Map<string,{until:number;result:AnalogReport}>();
const PENDING=new Map<string,Promise<AnalogReport>>();
const NUM=(v:any)=>typeof v==='number'&&Number.isFinite(v)?v:null;
const N=(v:any)=>{const n=Number(v);return v!==null&&v!==undefined&&Number.isFinite(n)?n:null};
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
function readDb<T>(path:string,fn:(db:Database.Database)=>T):T{
  const db=new Database(path,{readonly:true,fileMustExist:true,timeout:1800});
  try{db.pragma('query_only = ON');return fn(db);}finally{db.close();}
}
function parse(value:any):any{try{return JSON.parse(String(value||'{}'))}catch{return {}}}
function unpack(mode:Mode,r:any):Raw{
  return mode==='spot'?{
    id:r.id,at:r.created_at,decision:String(r.actual_decision||'NO_TRADE'),direction:r.direction,
    long:r.long_score,short:r.short_score,confidence:r.confidence,features:parse(r.features_json)
  }:{
    id:r.id,at:r.observed_at,decision:String(r.decision||'NO_TRADE'),direction:r.decision==='SHORT'?'SHORT':r.decision==='LONG'?'LONG':null,
    long:r.long_score,short:r.short_score,confidence:r.confidence,features:parse(r.feature_json)
  };
}
type Vector={values:(number|null)[];keys:string[];scales:number[]};
const spec=(mode:Mode)=>{
  const specs=mode==='spot'?[
    ['long_score',25],['short_score',25],['confidence',25],
    ['rsi_5m',22],['rsi_15m',22],['rsi_1h',22],['tape',0.5],['oi_change_pct',4]
  ]:[
    ['long_score',25],['short_score',25],['confidence',25],
    ['rsi_5m',22],['rsi_15m',22],['rsi_1h',22],['book_imbalance',35],['funding',0.00005]
  ];
  return {keys:specs.map(x=>String(x[0])),scales:specs.map(x=>Number(x[1]))};
};
function vector(mode:Mode,row:Raw):Vector{
  const f=row.features||{};
  const values=mode==='spot'?[
    row.long,row.short,row.confidence,
    f?.['5m']?.rsi14,f?.['15m']?.rsi14,f?.['1h']?.rsi14,
    f?.tape?.trade_imbalance,f?.open_interest?.change_pct
  ]:[
    row.long,row.short,row.confidence,
    f?.timeframes?.['5m']?.rsi14,f?.timeframes?.['15m']?.rsi14,f?.timeframes?.['1h']?.rsi14,
    f?.orderBook?.imbalancePct,f?.marketContext?.funding
  ];
  const s=spec(mode);
  return {...s,values:values.map(N)};
}
export function analogDistance(anchor:Vector,other:Vector):number|null{
  if(anchor.values.length!==other.values.length)return null;
  let sum=0,count=0;
  for(let i=0;i<anchor.values.length;i++){
    const x=anchor.values[i],y=other.values[i],scale=anchor.scales[i];
    if(x===null||y===null||!scale)continue;
    sum+=Math.pow(clamp((x-y)/scale,-5,5),2);count++;
  }
  // Require most indicators to exist: no false similarity from 1 shared score.
  return count<6?null:Math.sqrt(sum/count);
}
export function analogQueryArgs(mode:Mode,symbol:string,side:Side,decision:string,after:number,before:number){
  return mode==='spot'?[symbol,side,decision,after,before]:[symbol,side,after,before];
}
export function selectAnalogRows(rows:{id:number;at:number;distance:number}[],limit=36,spacingSeconds=14400,maxDistance=1.3){
  const chosen:{id:number;at:number;distance:number}[]=[];
  for(const x of rows.sort((a,b)=>a.distance-b.distance||b.at-a.at)){
    if(!Number.isFinite(x.distance)||x.distance>maxDistance)continue;
    if(chosen.some(prev=>Math.abs(prev.at-x.at)<spacingSeconds))continue;
    chosen.push(x);
    if(chosen.length>=limit)break;
  }
  return chosen;
}
function quantile(sorted:number[],p:number):number|null{
  if(!sorted.length)return null;
  const i=p*(sorted.length-1),lo=Math.floor(i),hi=Math.ceil(i);
  return sorted[lo]+(sorted[hi]-sorted[lo])*(i-lo);
}
function rnd(v:number|null){return v===null?null:Math.round(v*1000)/1000}
function empty(symbol:string,mode:Mode,message:string):AnalogReport{
  return {ok:true,symbol,mode,source:mode==='spot'?'Trade Hunter research':'AI Perps closed-candle research',
    asOf:Date.now(),sourceAt:null,sourceDecision:null,direction:null,sourceStatus:'UNAVAILABLE',
    observationsExamined:0,nearest:0,comparisonWindowDays:40,featuresUsed:[],similarityMethod:'feature-only nearest neighbors',
    outcomes:[],examples:[],notes:['No order execution or private account data','Missing data cannot establish a signal'],message};
}
function compute(db:Database.Database,symbol:string,mode:Mode):AnalogReport{
  const now=Date.now(),nowSec=Math.floor(now/1000);
  const name=mode==='spot'?'Trade Hunter research':'AI Perps closed-candle research';
  const table=mode==='spot'?'research_candidates':'closed_features';
  const latestSql=mode==='spot'?
    'SELECT id,created_at,direction,actual_decision,long_score,short_score,confidence,features_json FROM research_candidates WHERE asset=? ORDER BY created_at DESC,id DESC LIMIT 1':
    'SELECT id,observed_at,decision,long_score,short_score,confidence,feature_json FROM closed_features WHERE coin=? ORDER BY observed_at DESC,id DESC LIMIT 1';
  const row=db.prepare(latestSql).get(symbol) as any;
  if(!row)return empty(symbol,mode,'No recorded historical research for this asset.');
  const anchor=unpack(mode,row),features=vector(mode,anchor);
  const side=anchor.direction;
  const validSide=side==='LONG'||side==='SHORT';
  if(!validSide)return {...empty(symbol,mode,'Current historical-engine reading is NO_TRADE; no directional comparison is available.'),source:mode==='spot'?'Trade Hunter research':'AI Perps closed-candle research',sourceAt:anchor.at*1000,sourceDecision:anchor.decision,sourceStatus:nowSec-anchor.at<1200?'CURRENT':'STALE'};
  // No outcome from within the previous 6h is eligible for a similarity sample.
  // A 40-day window, separated by >=4h, avoids counting consecutive 5m candles as independent setups.
  const before=Math.min(anchor.at,nowSec)-21600,after=before-40*86400;
  const rowsSql=mode==='spot'?
    "SELECT id,created_at,direction,actual_decision,long_score,short_score,confidence,features_json FROM research_candidates WHERE asset=? AND direction=? AND actual_decision=? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC,id DESC LIMIT 16000":
    "SELECT id,observed_at,decision,long_score,short_score,confidence,feature_json FROM closed_features WHERE coin=? AND decision=? AND observed_at BETWEEN ? AND ? ORDER BY observed_at DESC,id DESC LIMIT 15000";
  const args=analogQueryArgs(mode,symbol,side,anchor.decision,after,before);
  const recent=db.prepare(rowsSql).all(...args) as any[];
  const distances:{id:number;at:number;distance:number}[]=[];
  for(const row of recent){
    const sample=unpack(mode,row);
    const d=analogDistance(features,vector(mode,sample));
    if(d!==null)distances.push({id:sample.id,at:sample.at,distance:d});
  }
  const picked=selectAnalogRows(distances,36,14400,1.3);
  const byId=new Map(picked.map(x=>[x.id,x]));
  const horizons=mode==='spot'?[900,3600,14400,21600]:[300,900,3600,14400];
  const validOutcomes:Outcome[]=[];
  if(picked.length){
    const params=picked.map(()=>'?').join(',');
    const sql=mode==='spot'?
      'SELECT candidate_id AS id,observed_at,horizon_seconds,direction_return_pct AS ret,horizon_mfe_pct AS favorable,horizon_mae_pct AS adverse,target_time,labeled_at FROM research_horizon_outcomes WHERE candidate_id IN ('+params+') AND asset=? AND direction=? AND horizon_seconds IN (900,3600,14400,21600)':
      'SELECT feature_id AS id,future_observed_at AS observed_at,horizon_seconds,signal_return_pct AS ret,NULL AS favorable,NULL AS adverse,feature_observed_at,training_eligible FROM closed_outcomes WHERE feature_id IN ('+params+') AND coin=? AND signal_decision=? AND training_eligible=1 AND horizon_seconds IN (300,900,3600,14400)';
    const outcomeRows=db.prepare(sql).all(...picked.map(x=>x.id),symbol,side) as any[];
    for(const o of outcomeRows){
      const p=byId.get(o.id),ret=NUM(o.ret),observed=N(o.observed_at),horizon=N(o.horizon_seconds);
      if(!p||ret===null||observed===null||horizon===null)continue;
      // Verify labels came AFTER features, are mature, and do not point into the future.
      if(observed<=p.at||observed>nowSec||observed-p.at<horizon*0.75)continue;
      if(mode==='perps'&&N(o.feature_observed_at)!==p.at)continue;
      if(observed-p.at>horizon+1800)continue;
      const targetTime=N(o.target_time);
      if(mode==='spot'&&targetTime!==null&&targetTime>observed)continue;
      validOutcomes.push({id:p.id,at:p.at,seconds:horizon,ret,
        favorable:NUM(o.favorable),adverse:NUM(o.adverse)});
    }
  }
  const outcomes=horizons.map(horizonSeconds=>{
    const pickedOutcome=validOutcomes.filter(x=>x.seconds===horizonSeconds);
    const returns=pickedOutcome.map(x=>x.ret).sort((a,b)=>a-b),samples=returns.length;
    const medF=pickedOutcome.map(x=>x.favorable).filter((n):n is number=>n!==null).sort((a,b)=>a-b);
    const medA=pickedOutcome.map(x=>x.adverse).filter((n):n is number=>n!==null).sort((a,b)=>a-b);
    const enough=samples>=15;
    return {horizonSeconds,samples,positivePct:enough?rnd(100*returns.filter(x=>x>0).length/samples):null,
      medianReturnPct:enough?rnd(quantile(returns,.5)):null,meanReturnPct:enough?rnd(returns.reduce((a,b)=>a+b,0)/samples):null,
      p10ReturnPct:enough?rnd(quantile(returns,.1)):null,p90ReturnPct:enough?rnd(quantile(returns,.9)):null,
      medianFavorablePct:enough?rnd(quantile(medF,.5)):null,medianAdversePct:enough?rnd(quantile(medA,.5)):null,
      earliestAt:pickedOutcome.length?Math.min(...pickedOutcome.map(x=>x.at))*1000:null,
      latestAt:pickedOutcome.length?Math.max(...pickedOutcome.map(x=>x.at))*1000:null};
  });
  const status=nowSec-anchor.at<1200?'CURRENT':'STALE';
  return {ok:true,symbol,mode,source:name,asOf:now,sourceAt:anchor.at*1000,sourceDecision:anchor.decision,
    direction:side,sourceStatus:status,
    observationsExamined:recent.length,nearest:picked.length,comparisonWindowDays:40,
    featuresUsed:features.keys.filter((_,i)=>features.values[i]!==null),
    similarityMethod:'Normalized signal scores, RSI, order-flow/funding available at each event; nearest score first, maximum normalized distance 1.3, one sample per 4 hours; 6-hour outcome maturity buffer',
    outcomes,examples:picked.slice(0,5).map(x=>({at:x.at*1000,distance:rnd(x.distance)!,sourceDecision:anchor.decision})),
    notes:[
      'Only the '+name+' dataset is matched, not eight independent bot votes.',
      mode==='spot'?'Trade Hunter signals are paper research even when used in Spot mode. No actual spot fills, fees or P&L are inferred.':
        'Perps research consists of shadow closed-candle simulations; no executed futures trades or Kraken derivatives permission is inferred.',
      'Labels and returns are inspected AFTER nearest neighbors are chosen using contemporaneous features.',
      'Past matches are highly regime-dependent; spacing by 4h does not guarantee statistical independence or out-of-sample validation.',
      'Favorable/adverse movement is not available for Perps labels; calculations exclude fees, funding and slippage.',
      'When current research says NO_TRADE, matched directional movement is counterfactual, NOT a buy or sell recommendation.'
    ],
    message:picked.length<15?'Insufficient similar, time-separated observations for a meaningful historical comparison.':
      anchor.decision==='NO_TRADE'?'Similar past NO_TRADE conditions found. Directional outcomes are hypothetical; current research has no qualifying entry.':
      'Comparable past research setups found. Directional results are descriptive, not calibrated win odds.'};
}
export function historicalAnalogs(symbol:string,mode:Mode):Promise<AnalogReport>{
  if(!/^[A-Z0-9]{2,12}$/.test(symbol)||!['spot','perps'].includes(mode))return Promise.resolve(empty(symbol,mode,'Unsupported asset or mode.'));
  const key=symbol+':'+mode,current=CACHE.get(key),now=Date.now();
  if(current?.until&&current.until>now)return Promise.resolve(current.result);
  const prev=PENDING.get(key);if(prev)return prev;
  const task=Promise.resolve().then(()=>{
    try{
      const result=readDb(PATH[mode],db=>compute(db,symbol,mode));
      CACHE.set(key,{until:Date.now()+180000,result});return result;
    }catch{return empty(symbol,mode,'Historical database could not be read safely.');}
  }).finally(()=>PENDING.delete(key));
  PENDING.set(key,task);
  return task;
}

/**
 * AURELIS legacy intelligence bridge.
 *
 * Explicit known-source read-only SQLite connections. No scanning directories,
 * SQL from requests, database mutation, wallet/account reads or order calls.
 * A row in any legacy research table is NOT a real or profitable trade.
 */
import Database from 'better-sqlite3';

type SourceSummary={
  source:string;status:'LIVE'|'STALE'|'HISTORICAL'|'UNAVAILABLE';
  observations:number;firstAt:number|null;lastAt:number|null;
  newest?:Record<string,number|string|null>;detail?:string;
};
type OutcomeSummary={
  source:string;horizonSeconds:number;samples:number;positiveDirectionalPct:number|null;
  label:string;
};
type LegacyReport={
  symbol:string;asOf:number;sources:SourceSummary[];outcomes:OutcomeSummary[];
  connected:number;notes:string[];
};
const SOURCES={
  intelligence:'/opt/aurelis/engine-tracker/market_intelligence.sqlite3',
  hunter:'/opt/aurelis/trade-hunter/data/trade_hunter.sqlite3',
  perps:'/opt/aurelis/ai-perps-telemetry/data/telemetry.sqlite3',
  okx:'/opt/aurelis/okx-research/data/okx_research.sqlite3',
  toobit:'/opt/aurelis/toobit-research/data/toobit_research.sqlite3'
} as const;
const memory=new Map<string,{until:number;report:LegacyReport}>();
const valid=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
const age=(at:number|null,now:number):SourceSummary['status']=>at===null?'UNAVAILABLE':now-at<30*60000?'LIVE':now-at<7*86400000?'STALE':'HISTORICAL';
const utcMs=(v:unknown,unit:'s'|'ms')=>{
  const n=Number(v);
  return Number.isFinite(n)&&n>0?n*(unit==='s'?1000:1):null;
};
function usingDb<T>(path:string,fn:(db:Database.Database)=>T):T{
  const db=new Database(path,{readonly:true,fileMustExist:true,timeout:2000});
  try{
    db.pragma('query_only = ON');
    return fn(db);
  }finally{db.close();}
}
function coverage(
  db:Database.Database,symbol:string,table:string,column:string,time:string,unit:'s'|'ms',
  source:string,newestSql?:string
):SourceSummary{
  // All identifiers are program constants, not request-supplied.
  const stats=db.prepare('SELECT COUNT(*) n,MIN('+time+') first_at,MAX('+time+') last_at FROM '+table+' WHERE '+column+' = ?').get(symbol) as any;
  const firstAt=utcMs(stats?.first_at,unit),lastAt=utcMs(stats?.last_at,unit);
  const newest=newestSql&&stats?.n?db.prepare(newestSql).get(symbol) as any:null;
  const numeric:Record<string,number|string|null>={};
  if(newest&&typeof newest==='object'){
    for(const [key,v] of Object.entries(newest)){
      if(typeof v==='number'&&Number.isFinite(v))numeric[key]=v;
      else if(typeof v==='string'&&v.length<80)numeric[key]=v;
      else numeric[key]=null;
    }
  }
  return {source,status:age(lastAt,Date.now()),observations:Number(stats?.n||0),firstAt,lastAt,
    ...(Object.keys(numeric).length?{newest:numeric}:{})};
}
function missing(source:string,error='Source inaccessible'):SourceSummary{
  return {source,status:'UNAVAILABLE',observations:0,firstAt:null,lastAt:null,detail:error};
}
export function legacyBrokerIntelligence(symbol:string):LegacyReport{
  if(!/^[A-Z0-9]{2,12}$/.test(symbol))throw new Error('invalid_asset');
  const old=memory.get(symbol),now=Date.now();
  if(old&&old.until>now)return old.report;
  const sources:SourceSummary[]=[],outcomes:OutcomeSummary[]=[];
  const read=(name:string,path:string,work:(db:Database.Database)=>void)=>{
    try{usingDb(path,work)}catch(error:any){
      sources.push(missing(name,'Existing research database could not be read'));
    }
  };

  read('Market Intelligence',SOURCES.intelligence,db=>{
    sources.push(coverage(db,symbol,'model_features','asset','ts','s','Market Intelligence: model features',
      'SELECT ts,price,long_score,short_score,confidence,rsi_5m,rsi_15m,rsi_1h,tape_imbalance,oi_change_pct,funding_rate FROM model_features WHERE asset=? ORDER BY ts DESC LIMIT 1'));
    sources.push(coverage(db,symbol,'market_samples','asset','ts_ms','ms','Market Intelligence: multi-exchange observations',
      'SELECT ts_ms,ref_price,exchanges_ok,mean_depth_imbalance,mean_taker_imbalance,mean_funding_rate FROM market_samples WHERE asset=? ORDER BY ts_ms DESC LIMIT 1'));
  });
  read('Trade Hunter',SOURCES.hunter,db=>{
    sources.push(coverage(db,symbol,'research_candidates','asset','created_at','s','Trade Hunter: research candidates',
      'SELECT created_at,entry,long_score,short_score,confidence,actual_decision,status FROM research_candidates WHERE asset=? ORDER BY created_at DESC LIMIT 1'));
    sources.push(coverage(db,symbol,'research_horizon_outcomes','asset','observed_at','s','Trade Hunter: horizon labels'));
  });
  read('Perps Shadow',SOURCES.perps,db=>{
    sources.push(coverage(db,symbol,'closed_features','coin','observed_at','s','Perps: closed-candle features',
      'SELECT observed_at,mark_price,decision,long_score,short_score,confidence,funding,open_interest FROM closed_features WHERE coin=? ORDER BY observed_at DESC LIMIT 1'));
    sources.push(coverage(db,symbol,'closed_outcomes','coin','feature_observed_at','s','Perps: labeled outcomes'));
    const rows=db.prepare("SELECT horizon_seconds,COUNT(*) n,SUM(CASE WHEN signal_return_pct > 0 THEN 1 ELSE 0 END) positive FROM closed_outcomes WHERE coin=? AND training_eligible=1 AND signal_decision IN ('LONG','SHORT') AND signal_return_pct IS NOT NULL GROUP BY horizon_seconds ORDER BY horizon_seconds LIMIT 6").all(symbol) as any[];
    for(const row of rows){
      const n=Number(row.n);
      if(n<30)continue;
      outcomes.push({source:'Perps Shadow',horizonSeconds:Number(row.horizon_seconds),samples:n,
        positiveDirectionalPct:Math.round(Number(row.positive||0)/n*1000)/10,
        label:'Research-only forward directional return; not executed P/L, trading hit rate, or out-of-sample predictive accuracy'});
    }
  });
  read('OKX Research',SOURCES.okx,db=>{
    sources.push(coverage(db,symbol,'candidate_observations','asset','candidate_created_at','s','OKX: linked research observations'));
  });
  read('Toobit Research',SOURCES.toobit,db=>{
    sources.push(coverage(db,symbol,'candidate_observations','asset','candidate_created_at','s','Toobit: linked research observations'));
  });

  const report:LegacyReport={symbol,asOf:now,sources,outcomes,connected:sources.filter(x=>x.observations>0).length,
    notes:[
      'All legacy sources are read-only and historical. No account balances, keys, orders or wallet details are read.',
      'Market features, Hunter labels, exchange research and Perps labels share underlying market observations; do not sum sample counts or count them as independent votes.',
      'Retrospective labels do not measure actual trading profitability or establish a calibrated probability of success.',
      'Timestamps preserve the original source clock. Any stale source is not current trade confirmation.'
    ]};
  memory.set(symbol,{until:now+120000,report});
  return report;
}

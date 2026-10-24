/**
 * Read-only market evidence journal. Stores no wallet addresses, secrets, orders,
 * user prompts or authenticated account data. History starts when this module
 * starts collecting; never claims to contain prior bot training/backtests.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type Observation = {
  symbol:string; source:string; timeframe:string; direction:'LONG'|'SHORT'|'WAIT'|'OBSERVE';
  score:number|null; price:number|null; sourceAt:number; evidence:Record<string,unknown>;
};
type StoredObservation=Observation&{observedAt:number};
let db:Database.Database|null=null;
let failure='history_not_initialized';
let lastPrune=0;
try{
  const folder=path.resolve(process.env.AURELIS_BROKER_DATA_DIR||path.join(process.cwd(),'data'));
  fs.mkdirSync(folder,{recursive:true});
  db=new Database(path.join(folder,'market-broker-observations.sqlite3'),{timeout:1000});
  db.pragma('journal_mode = WAL');
  db.exec([
    'CREATE TABLE IF NOT EXISTS broker_observations (',
    'id INTEGER PRIMARY KEY AUTOINCREMENT,',
    'symbol TEXT NOT NULL, source TEXT NOT NULL, timeframe TEXT NOT NULL,',
    'direction TEXT NOT NULL, score REAL, price REAL,',
    'source_at INTEGER NOT NULL, observed_at INTEGER NOT NULL,',
    'sample_bucket INTEGER NOT NULL, evidence_json TEXT NOT NULL,',
    'UNIQUE(symbol,source,timeframe,sample_bucket)',
    ');',
    'CREATE INDEX IF NOT EXISTS idx_broker_symbol_time ON broker_observations(symbol,observed_at DESC);'
  ].join('\n'));
  failure='';
}catch(error:any){
  failure='history_storage_unavailable';
  console.warn('[market-broker] Evidence storage not available:',String(error?.message||error));
  db=null;
}
const good=(v:unknown)=>typeof v==='number'&&Number.isFinite(v);
const num=(v:unknown)=>good(v)?v as number:null;
export function recordMarketObservation(event:Observation):boolean{
  if(!db)return false;
  if(!/^[A-Z0-9]{2,12}$/.test(event.symbol)||!/^[a-z_]{3,35}$/.test(event.source)||!['LONG','SHORT','WAIT','OBSERVE'].includes(event.direction))return false;
  const sourceAt=Number(event.sourceAt),now=Date.now();
  if(!Number.isFinite(sourceAt)||sourceAt<=0||sourceAt>now+60000||now-sourceAt>600000)return false;
  try{
    db.prepare('INSERT OR IGNORE INTO broker_observations (symbol,source,timeframe,direction,score,price,source_at,observed_at,sample_bucket,evidence_json) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(event.symbol,event.source,String(event.timeframe).slice(0,20),event.direction,num(event.score),num(event.price),sourceAt,now,Math.floor(now/300000),JSON.stringify(event.evidence||{}).slice(0,5000));
    if(now-lastPrune>86400000){
      db.prepare('DELETE FROM broker_observations WHERE observed_at < ?').run(now-30*86400000);
      lastPrune=now;
    }
    return true;
  }catch{return false;}
}
export function brokerHistory(symbol:string,days=7){
  if(!db)return {available:false,error:failure,startedAt:null,samples:0,sources:[],recent:[] as StoredObservation[],notice:'Historical observations have not been verified or imported.'};
  const since=Date.now()-Math.max(1,Math.min(30,days))*86400000;
  try{
    const stats=db.prepare('SELECT MIN(observed_at) AS first_at, COUNT(*) AS samples FROM broker_observations WHERE symbol = ? AND observed_at >= ?').get(symbol,since) as any;
    const sourceRows=db.prepare('SELECT source, timeframe, COUNT(*) AS samples, MAX(observed_at) AS last_at FROM broker_observations WHERE symbol = ? AND observed_at >= ? GROUP BY source,timeframe ORDER BY last_at DESC').all(symbol,since) as any[];
    const rows=db.prepare('SELECT symbol,source,timeframe,direction,score,price,source_at,observed_at,evidence_json FROM broker_observations WHERE symbol = ? AND observed_at >= ? ORDER BY observed_at DESC LIMIT 36').all(symbol,since) as any[];
    return {
      available:true,startedAt:stats?.first_at||null,samples:Number(stats?.samples||0),
      sources:sourceRows.map(r=>({source:r.source,timeframe:r.timeframe,samples:Number(r.samples),lastAt:Number(r.last_at)})),
      recent:rows.map(r=>({
        symbol:r.symbol,source:r.source,timeframe:r.timeframe,direction:r.direction,
        score:r.score,price:r.price,sourceAt:r.source_at,observedAt:r.observed_at,
        evidence:(()=>{try{return JSON.parse(r.evidence_json)}catch{return {}}})()
      })),
      notice:'Observations collected by this version of AURELIS only. These are not independently validated historical trades, model training results or measured win rates.'
    };
  }catch{return {available:false,error:'history_read_unavailable',startedAt:null,samples:0,sources:[],recent:[],notice:'Historical observations unavailable.'};}
}

/**
 * Forward-observed price movement, not executed trade P&L or model accuracy.
 * Samples are separated by >=4h to reduce repeated-candle overlap.
 * A result requires a later fresh Kraken 1h observation 4-8h after signal.
 */
export function brokerObservedOutcomes(symbol:string,days=30){
  const empty={available:false,samples:0,positive:0,negative:0,flat:0,medianDirectionalMovePct:null as number|null,
    horizon:'4-8h next observed price',note:'No measured trade results; samples are forward spot-price observations without spreads, fees, funding, stops or execution.'};
  if(!db||!/^[A-Z0-9]{2,12}$/.test(symbol))return empty;
  try{
    const since=Date.now()-Math.max(1,Math.min(30,days))*86400000;
    const rows=db.prepare("SELECT direction,price,observed_at FROM broker_observations WHERE symbol=? AND source='kraken_indicators' AND timeframe='1h' AND observed_at>=? AND price>0 ORDER BY observed_at").all(symbol,since) as {direction:string;price:number;observed_at:number}[];
    const moves:number[]=[];let lastSignal=0;
    for(let i=0;i<rows.length;i++){
      const current=rows[i];
      if(!['LONG','SHORT'].includes(current.direction)||current.observed_at-lastSignal<4*3600000)continue;
      lastSignal=current.observed_at;
      const later=rows.find((r,j)=>j>i&&r.observed_at>=current.observed_at+4*3600000&&r.observed_at<=current.observed_at+8*3600000);
      if(!later)continue;
      const raw=(later.price/current.price-1)*100;
      moves.push(current.direction==='LONG'?raw:-raw);
    }
    if(!moves.length)return {...empty,available:true,note:'No mature 4-8h forward observations yet. Do not infer win rates from scan scores.'};
    const sorted=[...moves].sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);
    return {available:true,samples:moves.length,positive:moves.filter(x=>x>0).length,negative:moves.filter(x=>x<0).length,
      flat:moves.filter(x=>x===0).length,
      medianDirectionalMovePct:Number((sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2).toFixed(4)),
      horizon:'4-8h next observed price',note:'Observed directional spot-price changes, NOT independently validated trade win rates or execution P&L. Samples require continuous collector coverage, have selection bias and exclude costs; fewer than 15 samples are insufficient for even descriptive comparisons.'};
  }catch{return empty;}
}

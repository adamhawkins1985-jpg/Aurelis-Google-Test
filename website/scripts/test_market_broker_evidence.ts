import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Only generated fixtures and a temporary database, never live trading or VPS records.
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aurelis-broker-evidence-'));
process.env.AURELIS_BROKER_DATA_DIR=dir;
try{
  const {recordMarketObservation,brokerHistory}=await import('../server/market_broker_history');
  const now=Date.now();
  const base={symbol:'BTC',source:'kraken_indicators',timeframe:'1h',direction:'LONG' as const,
    score:3,price:100,sourceAt:now-2500,evidence:{rsi:55,volumeRatio:1.25}};
  assert.equal(recordMarketObservation(base),true,'fresh valid sample should store');
  assert.equal(recordMarketObservation(base),true,'duplicates safely ignored within one 5 minute bucket');
  assert.equal(recordMarketObservation({...base,symbol:'BTC;DROP TABLE'}),false,'rejects invalid symbols');
  assert.equal(recordMarketObservation({...base,sourceAt:now-86400000}),false,'rejects stale feed data');
  assert.equal(recordMarketObservation({...base,direction:'SHORT',source:'trade_radar',score:83}),true,'independent source can store its own observation');
  const hist=brokerHistory('BTC',7);
  assert.equal(hist.available,true);
  assert.equal(hist.samples,2,'two genuine distinct observations, not duplicate counts');
  assert.equal(hist.sources.length,2);
  assert.ok(hist.recent.every(r=>r.sourceAt<=Date.now()));
  assert.equal(brokerHistory('ETH',7).samples,0,'symbols isolated');
  assert.ok(hist.notice.includes('not independently validated'));
  console.log('PASS: broker observation persistence, duplicate guard, timestamps, symbol isolation and provenance.');
}finally{
  fs.rmSync(dir,{recursive:true,force:true});
}

import assert from 'node:assert/strict';
import { readOpportunity, filterAndSortOpportunities, toReviewedSetup } from '../src/services/botOpportunity';

const now = 1800000000000;
const base = {
  asset:'ADA', market:'ADAUSD:BTNL', direction:'SHORT', ts_ms:now-1000, score:76,
  entry:0.2, target:0.19, invalidation:0.204,
  scanner:{notional24h:4500000,spreadBps:1.3,change24Pct:-2.1},
  kraken:{leverageBuy:[2,3], leverageSell:[2,3,5,10], marginSupported:true},
  economics:{estimatedRoundTripCostPct:0.2,netRewardRisk:2.2},
  structure:{ema20:0.201,ema50:0.205,rsi:43,volumeRatio:0.8},
  flow:{depthImbalance:-0.2},
  reasons:['EMA20 below EMA50','Bearish momentum'],
  contradictions:['Thin book near support'],
  agents:{structure:80,flow:60,risk:75,history:50},
};
const short=readOpportunity(base,now);
assert.equal(short.localFailure,null,'fresh 2x eligible Kraken short');
assert.equal(short.direction,'SHORT');
assert.deepEqual(short.leverageReported,[2,3,5,10],'use side-specific market leverage');
assert.equal(short.liveTestLeverage,2,'live order capped at two, even if Kraken reports 10x');
assert.ok(short.rewardRisk===2.2,'use actual backend economics');
assert.equal(short.volumeUsd,4500000,'display actual liquidity');
assert.deepEqual(short.contradictions,['Thin book near support']);
const handoff=toReviewedSetup(short);
assert.equal(handoff.margin,10,'live amount is still $10 notional');
assert.equal(handoff.leverage,2,'not automatically 10x');
assert.equal(handoff.direction,'SHORT');
assert.equal(handoff.tradeCost,0.2);

const changedDirection=readOpportunity({...base,direction:'LONG'},now);
assert.ok(changedDirection.localFailure?.includes('Entry, stop and target'),'short stop/target cannot be used for long');
const stale=readOpportunity({...base,ts_ms:now-360000},now);
assert.ok(stale.localFailure?.includes('stale'),'expired setup not executable');
const risky=readOpportunity({...base,invalidation:0.215},now);
assert.ok(risky.localFailure?.includes('5%'),'stop risk > 5% remains blocked');
const unsupported=readOpportunity({...base,kraken:{leverageSell:[3,5,10]}},now);
assert.ok(unsupported.localFailure?.includes('1× or 2×'),'market 10x does not imply approved live leverage');
assert.throws(()=>toReviewedSetup(unsupported),'ineligible rows cannot create live setup');

const long=readOpportunity({
  ...base, asset:'SOL',direction:'LONG',entry:200,target:220,invalidation:192,score:84,
  kraken:{leverageBuy:[1,2],leverageSell:[]},
},now);
assert.equal(long.localFailure,null);
const rows=[short,long,stale];
assert.deepEqual(filterAndSortOpportunities(rows,'all','score').map(x=>x.asset),['SOL','ADA'], 'same asset and direction must not repeat');
assert.deepEqual(filterAndSortOpportunities(rows,'long','score').map(x=>x.asset),['SOL']);
assert.deepEqual(filterAndSortOpportunities(rows,'ready','score','',new Set([short.id])).map(x=>x.id),[short.id]);
assert.deepEqual(filterAndSortOpportunities(rows,'all','score','sOl').map(x=>x.asset),['SOL']);
assert.deepEqual(filterAndSortOpportunities(rows,'all','volume').map(x=>x.asset),['SOL','ADA']);
const missingFee=readOpportunity({...base,economics:{netRewardRisk:2}},now);
assert.equal(missingFee.roundTripCostPct,null,'missing fees are unknown, not free');
console.log('PASS: multi-market shortlist, long/short levels, market leverage, stop/freshness gates, and read-only $10 handoff.');

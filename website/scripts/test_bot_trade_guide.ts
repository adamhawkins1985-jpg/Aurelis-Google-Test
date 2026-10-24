import assert from 'node:assert/strict';
import { readOpportunity } from '../src/services/botOpportunity';
import { guideForOpportunity } from '../src/services/botTradeGuide';
import { estimateBetScenario } from '../src/services/betScenario';

const now=Date.now();
const near=readOpportunity({
 asset:'NEAR',market:'NEARUSD:BTNL',direction:'SHORT',entry:4.4374,invalidation:4.5122,target:4.258,
 score:64.5,ts_ms:now-30000,
 kraken:{leverageSell:[2],leverageBuy:[2]},
 structure:{ema20:4.4458,ema50:4.4679,rsi:51.3,volumeRatio:0},
 economics:{estimatedRoundTripCostPct:0.2,netRewardRisk:2.04},
 reasons:['EMA20 below EMA50','RSI 51.3','volume 0.00x recent average'],
 contradictions:['aggressive buy flow conflicts with short structure','very low volume; the move lacks participation'],
},now);
assert.equal(near.localFailure,null);
assert.equal(near.status,'ELIGIBLE'); // local signal only, not exchange-executable.
const unverified=guideForOpportunity(near,'unverified');
assert.equal(unverified.verdict,'wait','Never call unverified signals ready bets');
assert.match(unverified.headline,/Not ready to trade/);
assert.match(unverified.reason,/has not confirmed/);
assert.match(unverified.caution,/very low/i);
assert.match(unverified.direction,/fall/);
const ready=guideForOpportunity(near,'ready');
assert.equal(ready.verdict,'ready');
assert.match(ready.action,/approval/);
const blocked=guideForOpportunity(near,'blocked','Market price is outside the bracket');
assert.equal(blocked.verdict,'wait');
assert.match(blocked.reason,/outside the bracket/);
const stale=readOpportunity({...near,direction:'SHORT',ts_ms:now-999999},now);
assert.notEqual(stale.localFailure,null);
assert.equal(guideForOpportunity(stale,'ready').verdict,'avoid','Invalid signals cannot look ready even if a stale venue status is present');
const example=estimateBetScenario({
 stakeUsd:100,leverage:2,entry:near.entry,stop:near.stop,target:near.target,direction:'SHORT',roundTripCostPct:0.2
});
assert.ok(example);
assert.ok(example.targetGrossUsd>0);
assert.ok(example.stopGrossUsd<0);
assert.ok(example.targetAfterFeesUsd!<example.targetGrossUsd);
console.log('PASS: NEAR plain English caution, exchange verification status, stale fail-closed, collateral ROI and fee-aware profit/loss.');

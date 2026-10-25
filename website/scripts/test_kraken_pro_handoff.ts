import assert from 'node:assert/strict';
import { KRAKEN_PRO_OFFICIAL_URL, formatProtectedTradeHandoff } from '../src/services/krakenProtectedHandoff';

assert.equal(KRAKEN_PRO_OFFICIAL_URL,'https://pro.kraken.com/','Only verified official Kraken Pro destination');
const now=Date.now();
const short=formatProtectedTradeHandoff({
  asset:'NEAR',direction:'SHORT',entry:4.4374,stop:4.5122,target:4.258,
  notionalUsd:10,leverage:2,venuePair:'NEARUSD:BTNL',
},now);
assert.equal(short.ready,true);
assert.equal(short.quoteFresh,false,'Research entry alone is NOT a Kraken executable quote');
assert.match(short.text,/NEARUSD:BTNL/);
assert.match(short.text,/BUY|SELL \/ SHORT/);
assert.match(short.text,/\$10\.00/);
assert.match(short.text,/both take-profit and stop-loss|BOTH take-profit and stop-loss/i);
assert.match(short.text,/NOT an order/);
assert.match(short.text,/Never place a margin entry if only one protective exit is offered/);
assert.match(short.text,/confirm market\/book/);
assert.ok(!short.text.includes('https://pro.kraken.com/app/trade/'),'Never invent market deep links');

const long=formatProtectedTradeHandoff({
  asset:'BTC',direction:'LONG',entry:60000,stop:58000,target:64000,
  notionalUsd:10,leverage:1,
  exchangeQuote:60020,quoteAt:now-4000,
},now);
assert.equal(long.ready,true);
assert.equal(long.quoteFresh,true);
assert.match(long.text,/BUY \/ LONG/);
const stale=formatProtectedTradeHandoff({
  asset:'BTC',direction:'LONG',entry:60000,stop:58000,target:64000,
  notionalUsd:10,leverage:1,exchangeQuote:60020,quoteAt:now-30000,
},now);
assert.equal(stale.quoteFresh,false);
assert.match(stale.text,/No fresh executable Kraken quote attached/);

for (const bad of [
  {...short,asset:'NEAR',direction:'SHORT' as const,entry:4,stop:3,target:3.5,notionalUsd:10,leverage:2},
  {asset:'NEAR',direction:'SHORT' as const,entry:4,stop:4.2,target:3.8,notionalUsd:100,leverage:2},
  {asset:'NEAR',direction:'SHORT' as const,entry:4,stop:4.2,target:3.8,notionalUsd:10,leverage:5},
]) assert.equal(formatProtectedTradeHandoff(bad,now).ready,false,'Risk gates prevent unsafe handoff');
console.log('PASS: Kraken Pro safe manual protected-order handoff; no API order, fake deep links, excess notional or leverage.');

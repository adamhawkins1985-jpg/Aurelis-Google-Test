import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessKrakenMarginHandoff} from '../server/kraken_protection_review';

const pepe={
  asset:'PEPE',pair:'PEPEUSD:BTNL',direction:'LONG' as const,
  setupEntry:0.00000422,stop:0.00000416,target:0.00000437,
  bid:0.00000409,ask:0.00000410,leverage:2,
  allowedLeverages:[2],marketStatus:'online',
  minimumBase:1000,minimumCost:1,lotDecimals:8
};

const stale=assessKrakenMarginHandoff(pepe);
assert.equal(stale.ok,false);
assert.equal(stale.code,'market_outside_bracket');
assert.match(stale.message,/live buy ask/);
assert.match(stale.message,/at\/below its stop/);

assert.equal(assessKrakenMarginHandoff({...pepe,ask:0.00000423}).ok,true,
  'Same original setup should be allowed for review at an in-range Kraken US margin ask.');
assert.equal(assessKrakenMarginHandoff({...pepe,pair:'PEPEUSD'}).ok,false,
  'Ordinary Kraken spot fallback is NOT a funded US margin market.');
assert.equal(assessKrakenMarginHandoff({...pepe,ask:0.00000423,allowedLeverages:[3,5]}).ok,false,
  '3x/5x-only venue cannot override the 2x ceiling.');
assert.equal(assessKrakenMarginHandoff({...pepe,ask:0.00000423,marketStatus:'cancel_only'}).ok,false);
assert.equal(assessKrakenMarginHandoff({...pepe,ask:0,allowedLeverages:[2]}).code,'quote_unavailable');
assert.equal(assessKrakenMarginHandoff({...pepe,ask:0.00000423,minimumBase:3000000}).ok,false,
  'Never raise notional beyond $10 to satisfy minimum base size.');
assert.equal(assessKrakenMarginHandoff({...pepe,ask:0.00000423,minimumCost:11}).ok,false,
  'Never raise notional beyond $10 to satisfy minimum trade value.');

const backend=readFileSync('server/migrated_backend.ts','utf8');
const hunter=readFileSync('src/components/trade/HunterPerpsView.tsx','utf8');
const route=backend.slice(backend.indexOf("app.get('/api/bots/kraken-margin-handoff/:asset'"),
  backend.indexOf("app.get('/api/trade-radar'"));
assert(route.includes('assessKrakenMarginHandoff('),'Hunter gate must check US margin market');
assert(route.includes('market.ticker?.a?.[0]')&&route.includes('market.ticker?.b?.[0]'),
  'Quote must use current buy ask or sell bid, not futures mark or normal last trade');
assert(route.includes('orderPlaced:false'),'Public gate must be read-only');
assert(!route.includes("krakenPrivate(")&&!route.includes("AddOrder"),
  'Public gate must not call signed Kraken APIs or place orders');
assert(hunter.includes('disabled={!marginHandoff?.compatible||marginHandoffBusy||sendingToLiveBet}'),
  'Hunter must disable handoff unless live Kraken margin market is compatible');
assert(hunter.includes('const checked=await checkMarginHandoff()'),
  'Hunter must recheck live Kraken margin quote right before handoff');
assert(hunter.includes('10.00 (fixed)') && hunter.includes('margin:10') && !hunter.includes('setBetAmount('),
  'First live test remains fixed at $10 notional, independently of the simulator');
assert(hunter.includes('formatMicroPrice(entry)'),'PEPE prices must display micro precision');
console.log('PASS: PEPE Kraken BTNL margin quote, stop bracket, 2x cap, $10 minimums, side bid/ask, fail-closed Hunter handoff.');

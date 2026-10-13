import assert from 'node:assert/strict';
import {assessKrakenProtection,krakenExecutablePrice} from '../server/kraken_protection_review';

const xlm={
  direction:'LONG' as const,
  proposedEntry:0.2023,
  stop:0.2005,
  target:0.2067,
  pair:'XLMUSD:BTNL'
};
const valid=assessKrakenProtection({...xlm,liveQuote:0.2024});
assert.equal(valid.ok,true,'XLM screenshot levels are a valid LONG at an in-range exchange quote');

const above=assessKrakenProtection({...xlm,liveQuote:0.2071});
assert.equal(above.code,'market_outside_bracket');
assert.match(above.message,/at\/above its target/);
assert.match(above.message,/Kraken XLMUSD:BTNL live buy ask/);
assert.match(above.message,/entry.*stop.*target/);
assert.match(above.message,/No trade placed/);

const below=assessKrakenProtection({...xlm,liveQuote:0.1998});
assert.equal(below.code,'market_outside_bracket');
assert.match(below.message,/at\/below its stop/);

const badOriginal=assessKrakenProtection({...xlm,proposedEntry:0.198,liveQuote:0.2024});
assert.equal(badOriginal.code,'invalid_setup_levels');

const short={
  direction:'SHORT' as const,
  proposedEntry:2,
  stop:2.05,
  target:1.94,
  pair:'TESTUSD:BTNL'
};
assert.equal(assessKrakenProtection({...short,liveQuote:2.01}).ok,true);
assert.equal(assessKrakenProtection({...short,liveQuote:2.06}).code,'market_outside_bracket');
assert.equal(assessKrakenProtection({...short,liveQuote:1.90}).code,'market_outside_bracket');

const ticker={mark:0.2023,ticker:{a:['0.2052'],b:['0.2018']}};
assert.equal(krakenExecutablePrice(ticker,'LONG'),0.2052,'long market buys should use current ask');
assert.equal(krakenExecutablePrice(ticker,'SHORT'),0.2018,'short market sells should use current bid');
assert.equal(krakenExecutablePrice({mark:0.2023,ticker:{a:[],b:[]}},'LONG'),0.2023,'missing book quote retains last trade fallback');
console.log('PASS: XLM valid original levels, stale long/short checks, executable ask/bid selection, no automatic repricing.');

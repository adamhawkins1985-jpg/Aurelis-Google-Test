import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeBrokerCoach} from '../src/services/brokerCoach';

const now=Date.now();
const basic={
  symbol:'BTC',frame:'1h',mode:'spot' as const,now,asOf:now-8000,
  chart:{signal:'SELL' as const,rsi:33.5,volumeRatio:1.16,support:79000,resistance:82000,price:80200,dataFresh:true,entryZone:{low:79000,high:80200}},
  desk:{direction:'SHORT' as const,readiness:57,generatedAt:now-12000,micro:{tapeImbalance:-0.12,bookImbalance:-0.1}},
  radar:{direction:'LONG' as const,score:63,qualified:false,generatedAt:now-11000},
  timeframe:{alignment:'MIXED',live:5},
  analogs:{nearest:36,sourceDecision:'NO_TRADE',outcomes:[{horizonSeconds:14400,samples:36,positivePct:66.7,medianReturnPct:0.14}]},
  news:{title:'BTC is down after major liquidations',source:'Example News',time:now-8000}
};
const waiting=makeBrokerCoach({...basic,decision:'WAIT'});
assert.match(waiting.headline,/wait/i);
assert.match(waiting.why,/Desk short 57\/100/);
assert.match(waiting.why,/Radar long unqualified/);
assert.match(waiting.next,/qualified Radar|Signal Desk/);
assert.match(waiting.lesson,/RSI 33\.5/);
assert.match(waiting.historical,/Paper observations, not trading odds/);
assert.match(waiting.news,/headline alone does not establish/);
const stale=makeBrokerCoach({...basic,decision:'BUY',asOf:now-450000});
assert.match(stale.headline,/cannot verify a fresh/);
assert.match(stale.next,/Refresh market data/);
assert.doesNotMatch(stale.next,/place a buy/);
const confirmed=makeBrokerCoach({...basic,decision:'BUY',chart:{...basic.chart,signal:'BUY',rsi:46.1},desk:{...basic.desk,direction:'LONG',readiness:81}});
assert.match(confirmed.headline,/spot buy setup/);
const perp=makeBrokerCoach({...basic,mode:'perps',decision:'SELL'});
assert.match(perp.headline,/defensive or short-side research/);
const screen=readFileSync('src/components/MarketBrokerScreen.tsx','utf8');
assert.ok(screen.indexOf('AURELIS · YOUR MARKET READ')<screen.indexOf('Price, volume & levels'),'market brief appears before chart');
assert.ok(screen.includes('order-3 min-w-0')&&screen.includes('Explore live chart'),'advanced research collapses by default');
assert.ok(screen.includes('aria-label="AURELIS market broker chat"'),'prominent chat preserved');
assert.ok(screen.includes("if(contextRef.current===scope)"),'stale assistant responses cannot cross coin/mode changes');
console.log('PASS: conversational broker guidance, bot disagreements, freshness, education, historical labels and focused chat.');

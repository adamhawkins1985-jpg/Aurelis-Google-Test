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
assert.ok(screen.indexOf('aria-label="Ask AURELIS AI"')<screen.indexOf('Price, volume & levels'),'market brief appears before chart');
assert.ok(screen.includes('Show supporting charts, bot reports & research tools')&&screen.includes("showEvidence?'flex flex-col gap-2.5':'hidden'"),'advanced research collapses by default');
assert.ok(screen.includes('aria-label="AURELIS market broker chat"'),'prominent chat preserved');
assert.ok(screen.includes("if(contextRef.current===scope)"),'stale assistant responses cannot cross coin/mode changes');
const brokerServer=readFileSync('server/market_broker.ts','utf8');
assert.ok(brokerServer.includes('NO VERIFIED TRADE. Here are the closest setups and why:'),'no-confirmation fallback must show near misses');
assert.ok(brokerServer.includes('matching Signal Desk >=68 or qualified Radar >=79'),'near misses must disclose exact confirmation requirements');
assert.ok(brokerServer.includes('is the TOTAL budget, not collateral allocated to a trade'),'budget is not margin');
assert.ok(brokerServer.includes('QUALIFIED RESEARCH FOUND')&&brokerServer.includes('NO VERIFIED TRADE.'),'verified and unverified responses must be distinct');
assert.ok(brokerServer.includes('watchlist|rank|closest setups'),'chat must route watchlist research to market scan');
assert.ok(screen.includes('Conservative: rank')&&screen.includes('Aggressive: find early momentum'),'risk-style suggestions should remain accessible');
assert.ok(brokerServer.includes('HYPOTHETICAL RISK EXAMPLE'),'cross-market perps fallback must include concrete profit/loss illustration');
assert.ok(brokerServer.includes("'gemini-2.5-flash'"),'default AI model must use stable supported identifier');
assert.ok(brokerServer.includes("if(!crossAsset&&!market.analysis.dataFresh)"),'broad queries must not depend on default coin freshness');
assert.ok(brokerServer.includes("if(crossAsset&&!marketWide)"),'scan failure must not silently downgrade to single coin');
assert.ok(brokerServer.includes("process.env.GOOGLE_API_KEY"),'support alternative Gemini key variable');
assert.ok(brokerServer.includes("providerStatus='empty_response'"),'empty AI responses must be visible');
assert.ok(screen.includes("answer.providerStatus"),'UI should show AI connectivity diagnostics');
assert.ok(brokerServer.includes("CLOUDFLARE_ACCOUNT_ID")&&brokerServer.includes("CLOUDFLARE_WORKERS_AI_TOKEN"),'Cloudflare primary must use server-only credentials');
assert.ok(brokerServer.includes("api.cloudflare.com/client/v4/accounts/"),'Cloudflare primary must use official API');
assert.ok(brokerServer.indexOf("const cfAccount=")<brokerServer.indexOf("const apiKey=process.env.GEMINI_API_KEY"),'Cloudflare must be attempted before Gemini');
assert.ok(screen.includes("answer.cloudflareStatus"),'Cloudflare diagnostic status must appear in chat');
console.log('PASS: conversational broker guidance, bot disagreements, freshness, education, historical labels and focused chat.');

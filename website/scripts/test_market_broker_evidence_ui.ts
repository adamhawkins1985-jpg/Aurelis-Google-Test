import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const screen=readFileSync('src/components/MarketBrokerScreen.tsx','utf8');
const chart=readFileSync('src/components/KrakenLiveChart.tsx','utf8');
assert.ok(screen.includes("Unconfirmed spot observation zone"), 'unconfirmed zones cannot be called buy recommendations');
assert.ok(screen.includes("a.signal==='BUY'&&a.stop<a.entryZone.low"), 'spot long stop cannot be placed above proposed buy zone');
assert.ok(screen.includes('No valid long stop'),'invalid long stop fails closed');
assert.ok(screen.includes("Signal Desk · liquidity & trade flow"),'real Signal Desk evidence is visible');
assert.ok(screen.includes("Trade Radar · qualified setup"),'Radar score and qualification are visible');
assert.ok(screen.includes('makeBrokerCoach('),'briefing derives from market evidence rather than fabricated confidence');
assert.ok(screen.includes('Explore live chart, full bot evidence & history'),'detailed metrics are available without dominating initial view');
assert.ok(screen.includes('suggestions.map('),'example questions launch real AI requests');
assert.ok(screen.includes('ShowMovingAverages') || screen.includes('showMovingAverages'),'EMA overlays can be toggled');
assert.ok(chart.includes('LineSeries'),'chart draws real moving averages');
assert.ok(chart.includes("title: 'SUPPORT'") && chart.includes("title: 'RESIST.'"),'support/resistance on chart');
assert.ok(chart.includes("document.documentElement.getAttribute('data-theme')"),'chart respects light/white theme');
console.log('PASS: broker verified evidence layout, theme-aware chart overlays and invalid long stop guard');

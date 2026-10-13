import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const screen=readFileSync('src/components/AiScreen.tsx','utf8');
const radar=readFileSync('src/components/trade/TradeRadarView.tsx','utf8');
const hunter=readFileSync('src/components/trade/HunterPerpsView.tsx','utf8');
const live=readFileSync('src/components/trade/LiveBetView.tsx','utf8');

assert(screen.includes('<details className="rounded-xl border border-white/10 bg-surface-panel/70'), 'Exchange info should be collapsible');
assert(screen.includes('Exchange status · balances, orders & test readiness'), 'Exchange status summary should remain available');
assert(screen.includes('Kraken Spot/Margin · Live orders locked'),'Live trading gate should be visible');
assert(screen.includes('<BotWalletAuth />'),'Wallet authorization must remain available');

assert(radar.includes('Continue to Hunter'),'Radar next action should be clear');
assert(!radar.includes('setShowOrderModal'), 'Research-only handoff should not require a redundant modal');
assert(radar.includes('onPlaceTrade?.({ ...activeSetup, margin: 10'),'Radar must hand off to Hunter at $10');
assert(radar.includes("['Entry'") || radar.includes('>ENTRY</span>'),'Radar must show entry price');
assert(radar.includes('STOP</span>') && radar.includes('TARGET</span>'),'Radar must show stop and target');
assert(radar.includes('Full analysis & decision notes'),'Radar research must remain available on demand');

assert(hunter.includes('Futures research & market statistics (optional)'),'Futures research should be collapsible');
assert(hunter.includes('Est. loss at stop:'),'Hunter must show financial risk prominently');
assert(hunter.includes('Continue to Live Bet'),'Hunter should give a clear next action');
assert(hunter.includes('disabled={!marginHandoff?.compatible||marginHandoffBusy||sendingToLiveBet}'),
  'A blocked Kraken setup must not move to Live Bet');
assert(hunter.includes('Find a new bet'),'Blocked setups need a one-step escape');
assert(hunter.includes('Why was this bet blocked?'),'Technical error should remain accessible');

assert(live.includes("key={normalized?'loaded-setup':'no-setup'} open={!normalized}"),
  'Hide the screenshot upload UI once a bet is loaded');
assert(live.includes('liveStatus.positions.length||liveStatus.orders.length'),
  'Open-position management must remain visible whenever live orders or positions exist');
assert(live.includes('Review $10 Kraken bet'),'Kraken review button must stay available');
assert(live.includes('Validate with Kraken · No trade'),'Kraken no-order validation remains explicit');
assert(live.includes('Target NOT placed as an order'),'Unplaced take-profit disclosure must be visible');
assert(live.includes("!executionEnabled||!krakenValidated||busy||!token"),
  'Live execution must remain locked without server capability, fresh validation and token');
assert(live.includes('window.confirm('),'A future enabled real order still requires manual approval');
assert(live.includes('Full order details & risks'),'Detailed risk disclosure must remain available');
assert(live.includes('Lose at stop') && live.includes('Make at target'),'Dollar risk/reward estimates must remain visible');
console.log('PASS: concise bet-first UI, visible risks, collapsible diagnostics and unchanged execution safeguards.');

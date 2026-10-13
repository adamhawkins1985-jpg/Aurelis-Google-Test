import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const screen=readFileSync('src/components/AiScreen.tsx','utf8');
const radar=readFileSync('src/components/trade/TradeRadarView.tsx','utf8');
const hunter=readFileSync('src/components/trade/HunterPerpsView.tsx','utf8');
const live=readFileSync('src/components/trade/LiveBetView.tsx','utf8');
const auto=readFileSync('src/components/trade/BotAutoScanView.tsx','utf8');

assert(screen.includes("{ id: 'radar', label: 'AUTO SCAN' }"), 'Auto Scan must be the primary bot entry');
assert(screen.includes("{ id: 'live', label: 'LIVE BET' }"), 'Live Bet must remain one click away');
assert(screen.includes('Other tools'), 'Other specialist bots must remain accessible in collapsed tools');
assert(screen.includes('<BotAutoScanView'), 'Radar must use automated pipeline instead of manual Hunter navigation');
assert(screen.includes('setAutoScanEnabled(false)'), 'Handoff pauses scanning so the user is not spammed with repeated bets');
assert(screen.includes('setPendingTradeSetup(setup)') && screen.includes("setActiveBotTab('live')"),
  'Auto-detected vetted setups must go directly to Live Bet');
assert(auto.includes('/api/trade-radar?mode=all&limit=5&force=1'), 'Automatic search must use fresh ranked scanner candidates');
assert(auto.includes('/api/bots/kraken-margin-handoff/'), 'Hunter executable quote and risk check must still run before Live Bet');
assert(auto.includes('verdict?.compatible !== true'), 'Unverified venue compatibility must block the pipeline');
assert(auto.includes('controller.abort()'), 'Pausing scanner must abort outstanding preflight requests');
assert(auto.includes('riskPct > 0 && riskPct <= 5'), 'Maximum manual test stop-distance control must remain');
assert(auto.includes('leverage = supported.includes(2) ? 2 : supported.includes(1) ? 1 : 0'),
  'Auto scanner must respect exchange-supported leverage and the 2× test cap');
assert(auto.includes('onBetReady(setup)'), 'Qualified bets automatically advance to human Live Bet review');
assert(!auto.includes('/api/signal-desk/order/submit'), 'Auto scanner must never submit a real Kraken order');


assert(screen.includes('<details className="rounded-xl border border-white/10 bg-surface-panel/70'), 'Exchange info should be collapsible');
assert(screen.includes('Exchange status · balances, orders & test readiness'), 'Exchange status summary should remain available');
assert(screen.includes('Kraken Spot/Margin · Live orders locked'),'Live trading gate should be visible');
assert(screen.includes('<BotWalletAuth />'),'Wallet authorization must remain available');

assert(radar.includes('Continue to Hunter'),'Radar next action should be clear');
assert(radar.includes('/api/bots/kraken-margin-handoff/'), 'Radar must use the actual Kraken BTNL execution quote before forwarding');
assert(radar.includes('disabled={!krakenReady}'), 'Radar must not forward a market-incompatible signal as a live bet');
assert(radar.includes('if (!data.compatible) return;'), 'Radar must fail closed if Kraken price changes at handoff');
assert(radar.includes('const data = await readKrakenMarketCheck();'), 'Radar must revalidate the live quote before handoff');
assert(radar.includes('Kraken Spot/Margin price check'), 'Radar must show scanner-vs-exchange price context');
assert(radar.includes('Radar entry:'), 'Radar must show the unmodified signal entry beside Kraken executable quote');

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
assert(hunter.includes('Radar entry {formatMicroPrice(entry)}'), 'Hunter must expose the actual Kraken-to-signal price difference');
assert(hunter.includes('Kraken spot price is outside this Radar setup'), 'Hunter must explain mismatched source prices rather than a generic below-stop label');
assert(hunter.includes('Why was this bet blocked?'),'Technical error should remain accessible');

assert(live.includes("key={normalized?'loaded-setup':'no-setup'} open={!normalized}"),
  'Hide the screenshot upload UI once a bet is loaded');
assert(live.includes('liveStatus.positions.length||liveStatus.orders.length'),
  'Open-position management must remain visible whenever live orders or positions exist');
assert(live.includes('Review $10 Kraken bet'),'Kraken review button must stay available');
assert(live.includes('One bet · One review'), 'Live Bet must show one unified setup/review card');
assert(live.includes('className="border-t border-white/15 pt-3 space-y-3"'), 'Kraken preview must render inside the existing setup card');
assert(!live.includes("['Bet', preview.symbol+' '+preview.direction]"), 'Do not render a second copy of the bet, position, stop, and target');
assert(live.includes('{!preview && (') && live.includes('{preview && ('), 'Only the relevant next action should show at each review stage');
assert(live.includes('Stop requested only after the entry fills'), 'The conditional stop timing must remain visible even before validation');
assert(live.includes('Refresh quote'), 'Users must be able to refresh a stale preview without navigating away');

assert(live.includes('Validate with Kraken · No trade'),'Kraken no-order validation remains explicit');
assert(live.includes('Target NOT placed as an order'),'Unplaced take-profit disclosure must be visible');
assert(live.includes("!executionEnabled||!krakenValidated||busy||!token"),
  'Live execution must remain locked without server capability, fresh validation and token');
assert(live.includes('window.confirm('),'A future enabled real order still requires manual approval');
assert(live.includes('Full order details & risks'),'Detailed risk disclosure must remain available');
assert(live.includes('Lose at stop') && live.includes('Make at target'),'Dollar risk/reward estimates must remain visible');
console.log('PASS: concise bet-first UI, visible risks, collapsible diagnostics and unchanged execution safeguards.');

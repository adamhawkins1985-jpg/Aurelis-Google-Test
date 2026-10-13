import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const hunter=readFileSync('src/components/trade/HunterPerpsView.tsx','utf8');
const screen=readFileSync('src/components/AiScreen.tsx','utf8');

assert(!hunter.includes('if (!f.some((x) => x.asset === selectedAsset) && f[0]?.asset) setSelectedAsset(f[0].asset)'),
  'Polling futures must never replace the current Radar setup asset with BTC');
assert(hunter.includes('setSelectedAsset(initialSetup.symbol.toUpperCase())'),
  'Hunter should initially select the copied Radar asset');
assert(hunter.includes('!assetListed && <option value={selectedAsset}>'),
  'Hunter selector must always include the currently displayed Radar asset even if it is outside top 50');
assert(hunter.includes('!ticker && <div') && hunter.includes('No public Kraken perpetual quote'),
  'Hunter should identify when it has no public futures quote rather than displaying another coin');
assert(hunter.includes('{matchingSetup.symbol} {matchingSetup.direction}'),
  'Copied setup should only be shown for its own selected asset');
assert(hunter.includes('onReturnToRadar') && hunter.includes('Back to Trade Radar · Hunt for a fresh setup'),
  'Hunter must offer a fresh scan when the Kraken margin handoff fails');
assert(screen.includes("setPendingTradeSetup(null);\n            setActiveBotTab('radar')"),
  'Leaving a stale Hunter setup must clear pending Live Bet state');
assert(hunter.includes('disabled={!marginHandoff?.compatible||marginHandoffBusy||sendingToLiveBet}'),
  'Rejected trades must still be blocked from Live Bet');
console.log('PASS Hunter asset selector, no false BTC fallback, stale trade recovery and fail-closed handoff.');

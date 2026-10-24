import assert from 'node:assert/strict';
import { explainKrakenBlock } from '../src/services/krakenBlockGuide';

const wallet=explainKrakenBlock('wallet_auth_required');
assert.equal(wallet.kind,'wallet');
assert.equal(wallet.tryWallet,true);
assert.equal(wallet.tryNewScan,false);
assert.match(wallet.nextStep,/OneKey/);
assert.match(explainKrakenBlock('bot_account_owner_not_authorized').title,/Wallet/);
assert.equal(explainKrakenBlock('challenge_replayed').kind,'wallet');

const stale=explainKrakenBlock('Kraken NEARUSD:BTNL live sell bid $4.53 is at/above its stop for this SHORT setup');
assert.equal(stale.kind,'price');
assert.equal(stale.tryNewScan,true);
assert.match(stale.nextStep,/Auto Scan/);
assert.match(explainKrakenBlock('kraken_price_moved_repreview').title,/outside/);

const insufficient=explainKrakenBlock('kraken_insufficient_free_margin:requires_5.00_USD:available_0.00_USD');
assert.equal(insufficient.kind,'funds');
assert.match(insufficient.explanation,/Kraken margin/);
assert.equal(explainKrakenBlock('kraken_10_usd_test_below_exchange_cost_minimum_choose_different_pair').kind,'market');
assert.equal(explainKrakenBlock('kraken_leverage_not_supported').kind,'market');
assert.equal(explainKrakenBlock('kraken_linked_stop_target_lifecycle_unverified').kind,'protection');
assert.equal(explainKrakenBlock('trade_confirmation_expired').kind,'validation');
assert.equal(explainKrakenBlock('HTTP_500').kind,'other');
assert.equal(explainKrakenBlock('HTTP_500').tryNewScan,false);
console.log('PASS: Live Bet error guidance for wallet auth, replay, stale quotes, margin, venue minimums and protection lock.');

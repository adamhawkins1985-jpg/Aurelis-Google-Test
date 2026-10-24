import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const backend=readFileSync('server/migrated_backend.ts','utf8');
const wallet=readFileSync('src/components/trade/BotWalletAuth.tsx','utf8');
const live=readFileSync('src/components/trade/LiveBetView.tsx','utf8');
const screen=readFileSync('src/components/AiScreen.tsx','utf8');

assert(backend.includes("import { WalletChallengeStore } from './wallet_auth_challenges';"));
assert(backend.includes('const challenges = new WalletChallengeStore<Challenge>()'));
assert(backend.includes('challenges.issue(sid, challenge)'));
assert(backend.includes('challenges.consume(sid, message)'));
assert(!backend.includes('challenges.set(sid, challenge)'));
assert(backend.includes("const key = value.purpose === 'bots' ? sid + ':bots' : sid"),
  'Owner privileges need a separate scoped record, not a Web-session race');
assert(backend.includes("const session=getVerifiedSession(req,res,'bots')"),
  'Private Kraken balance and order APIs require bots-specific verification');
assert(backend.includes("const session=getVerifiedSession(req,res,'bots');"),
  'Bot authorization display must read a bots-specific session');
assert(backend.includes('&&Number.isFinite(availableMargin)&&availableMargin>=10'),
  'Account ready requires sufficient $10 test collateral');
assert(wallet.includes("await verifyWalletConnectSession(active.address,active.chainId,active.session,'bots')"));
assert(wallet.includes('const current = await read()') && wallet.includes('current?.verified'),
  'Never claim owner verification solely because a signature succeeded');
assert(wallet.includes('aurelis-bot-wallet-auth') && wallet.includes('challenge_replayed'),
  'Wallet component must provide clear recovery');
assert(live.includes('explainKrakenBlock') && live.includes('krakenBlockedGuide.nextStep'),
  'Live Bet needs visible actionable error diagnosis');
assert(live.includes('onFindNewBet') && screen.includes('onFindNewBet={() =>'),
  'Stale Kraken setup needs a direct return to a fresh scan');
assert(live.includes('Live orders are currently locked'),
  'Preview-only UI must disclose the production protection lock');
assert(live.includes('Check $10 Kraken order · No trade placed'),
  'Preview/validation must not masquerade as an order');
assert(backend.includes("if (!KRAKEN_LINKED_OCO_LIFECYCLE_VERIFIED)"),
  'The hard protection gate stays in place despite wallet/auth repairs');
console.log('PASS: wallet replay fixes, bot privilege isolation, margin readiness and transparent Kraken read-only workflow.');

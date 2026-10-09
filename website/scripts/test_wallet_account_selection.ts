import assert from 'node:assert/strict';
import { selectSafeEvmAccount } from '../src/services/walletConnectAccountGuard';

const bot = '0x' + 'a'.repeat(40);
const main = '0x' + 'b'.repeat(40);
const second = '0x' + 'c'.repeat(40);
const chain = 'eip155:8453';
const accounts = [
  'eip155:1:' + main,
  chain + ':' + bot,
  chain + ':' + main,
  chain + ':' + second,
];

assert.equal(selectSafeEvmAccount(accounts, chain, main, bot), main);
assert.equal(selectSafeEvmAccount(accounts, chain, second, bot), second);
assert.equal(selectSafeEvmAccount(accounts, chain, bot, bot), null);
assert.equal(selectSafeEvmAccount(accounts, chain, '0x' + 'd'.repeat(40), bot), null);
assert.equal(selectSafeEvmAccount(accounts, chain, undefined, bot), main);
assert.equal(selectSafeEvmAccount([chain + ':' + bot], chain, undefined, bot), null);
assert.equal(selectSafeEvmAccount([chain + ':' + main], 'eip155:1', main, bot), null);
assert.equal(selectSafeEvmAccount([chain + ':' + main], chain, 'not-an-address', bot), null);
assert.equal(selectSafeEvmAccount([chain + ':not-an-address'], chain), null);
assert.equal(selectSafeEvmAccount(null, chain), null);
assert.equal(selectSafeEvmAccount([chain + ':' + main], 'unknown:1'), null);
console.log('PASS WalletConnect selected account, multi-account sessions, bot isolation and invalid inputs');

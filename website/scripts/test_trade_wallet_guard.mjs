import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const wallet = readFileSync(new URL('../src/services/walletConnectService.ts', import.meta.url), 'utf8');
const trade = readFileSync(new URL('../src/components/trade/DemoExchangeView.tsx', import.meta.url), 'utf8');
const erc20 = wallet.slice(wallet.indexOf('export async function sendWalletConnectErc20Transfer'), wallet.indexOf('export async function sendWalletConnectNativeTransfer'));
assert.match(erc20, /expectedFrom\?: string/);
assert.match(erc20, /session\?\.topic === botTopic\(\)/);
assert.match(erc20, /selectSafeEvmAccount\(ns\?\.accounts, targetChain, params\.expectedFrom, BOT_AGENT_ADDRESS\)/);


assert.match(trade, /expectedFrom: walletAddress/);
assert.ok(trade.includes("if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress))"));
const native = wallet.slice(wallet.indexOf('export async function sendWalletConnectNativeTransfer'), wallet.indexOf('function normalizeEvmNetworkName'));
const asset = wallet.slice(wallet.indexOf('export async function sendWalletConnectAssetTransfer'));
const tradeScreen = readFileSync(new URL('../src/components/TradeScreen.tsx', import.meta.url), 'utf8');
const walletScreen = readFileSync(new URL('../src/components/WalletScreen.tsx', import.meta.url), 'utf8');
assert.match(native, /expectedFrom\?: string/);
assert.match(native, /session\?\.topic === botTopic\(\)/, 'Native ETH transfers must reject bot WalletConnect sessions');
assert.match(native, /selectSafeEvmAccount\(ns\?\.accounts, targetChain, params\.expectedFrom, BOT_AGENT_ADDRESS\)/);


assert.match(asset, /expectedFrom: params\.expectedFrom/g);
assert.match(tradeScreen, /expectedFrom: walletAddress/);
assert.match(walletScreen, /setTradeExpectedFrom\(pinned\)/);
assert.match(walletScreen, /tradeExpectedFrom\.toLowerCase\(\) !== walletAddress\.toLowerCase\(\)/);
assert.match(walletScreen, /expectedFrom: tradeExpectedFrom \|\| undefined/);
assert.match(trade, /Connect the intended main EVM wallet/);
assert.doesNotMatch(trade.slice(trade.indexOf('const nativeBridge = (window as any).AurelisNative;', trade.indexOf('sendWalletConnectErc20Transfer({'))), /send-prefill:/);
console.log('PASS Trade EVM sender and wallet-page handoff pin the selected wallet; native deposit shortcut excluded');

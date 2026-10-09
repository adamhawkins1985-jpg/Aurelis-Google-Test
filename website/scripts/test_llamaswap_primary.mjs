import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const trade = read('../src/components/TradeScreen.tsx');
const primary = read('../src/components/trade/LlamaSwapPrimaryView.tsx');
const dock = read('../src/components/SwapWidgetDock.tsx');

assert.match(trade, /initialSubTab = 'trade'/, 'Trade should default to the Trade tab');
assert.match(trade, /const isLlamaPrimary = !\(activeSubTab === 'trade' && aiPlan\);/, 'Buy, Sell, and standard Trade use hosted primary; explicit AI plans retain advanced Trade');
assert.match(trade, /isLlamaPrimary \? \(\s*<LlamaSwapPrimaryView \/>/, 'LlamaSwap must be the main Trade view');
assert.match(trade, /\) : \(\s*<DemoExchangeView/, 'Explicit AI plan advanced form must remain available');
assert.match(trade, /setTradeExpectedFrom|expectedFrom: walletAddress/, 'Main wallet handoff remains explicitly pinned');
assert.match(primary, /LLAMASWAP_URL = 'https:\/\/swap\.defillama\.com\/'/, 'Only official HTTPS swap origin');
assert.match(primary, /src=\{LLAMASWAP_URL\}/, 'Hosted iframe uses the official URL');
assert.match(primary, /top-bar connection is not automatically shared/, 'No false claims of wallet session sharing');
assert.doesNotMatch(primary, /postMessage|walletConnectTopic|eth_sendTransaction|seedPhrase|privateKey/, 'Never bridge signing or wallet secrets across the iframe');
assert.match(primary, /target="_blank"/, 'Fallback to official provider in new tab');
for (const id of ['thorchain', 'uniswap', 'rango', 'mayan', 'swapspro']) {
  assert.match(dock, new RegExp("id: '" + id + "'"), 'Preserve alternate provider icon: ' + id);
}
assert.match(dock, /isSwapWidgetUnavailable = \(providerId: string\) => providerId === 'rango'/, 'Disable restricted Rango provider');
assert.match(dock, /isSwapWidgetUnavailable\(active\.id\) \? \(/, 'Disable Rango embedded desktop provider');
assert.match(dock, /isSwapWidgetUnavailable\(provider\.id\) \? \(/, 'Disable Rango embedded mobile provider');
assert.match(dock, /desktopBridge\.openUtility\('swap', provider\.id\)/, 'Keep other desktop icon functionality');
console.log('PASS LlamaSwap primary, separate wallet consent, original dock icons, restricted Rango, and explicit AI plan flow');

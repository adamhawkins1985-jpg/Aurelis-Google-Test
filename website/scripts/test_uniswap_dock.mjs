import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const dock = readFileSync(new URL('../src/components/SwapWidgetDock.tsx', import.meta.url), 'utf8');
const trade = readFileSync(new URL('../src/components/TradeScreen.tsx', import.meta.url), 'utf8');

assert.match(trade, /<LlamaSwapPrimaryView\s*\/>/, 'Main Trade should remain LlamaSwap');
for (const id of ['thorchain', 'mayan', 'uniswap', 'swapspro', 'rango']) {
  assert.match(dock, new RegExp("id: '" + id + "'"), 'Keep right-side provider ' + id);
}
assert.doesNotMatch(dock, /id: 'llama'/, 'Remove duplicate Llama dock icon');
assert.match(dock, /https:\/\/app\.uniswap\.org\/swap/, 'Use official Uniswap swap app');
assert.match(dock, /https:\/\/app\.uniswap\.org\/buy/, 'Uniswap buy option available from icon');
assert.match(dock, /isUniswapExternalLaunch\(active\.id\) \? \(/, 'Desktop/web Uniswap panel avoids a blocked iframe');
assert.match(dock, /isUniswapExternalLaunch\(provider\.id\) \? \(/, 'Mobile Uniswap page avoids a blocked iframe');
assert.match(dock, /desktopBridge\.openBrowser\(url\)/, 'Desktop app browser host opens Uniswap');
assert.match(dock, /openUtility\('swap', provider\.id\)/, 'Other desktop swap popups remain');
assert.match(dock, /providerId === 'rango'/, 'Rango must remain disabled in this US setup');
assert.match(dock, /allowlisting/, 'Explain Uniswap iframe allowlisting requirement');
console.log('PASS Uniswap right dock, buy link, preserved providers and LlamaSwap primary');

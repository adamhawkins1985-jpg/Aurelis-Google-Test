import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dock = readFileSync(new URL('../src/components/SwapWidgetDock.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const primary = readFileSync(new URL('../src/components/trade/LlamaSwapPrimaryView.tsx', import.meta.url), 'utf8');

assert.match(app, /<SwapWidgetDock theme=\{theme\} \/>/, 'Pass parent theme to desktop swap dock');
assert.match(app, /<MobileSwapWidgetPage providerId=\{swapWidgetParams\?\.get\('swapWidget'\)\} theme=\{theme\} \/>/, 'Pass parent theme on mobile');
assert.match(dock, /theme === 'light' \? '059669' : '00F5A0'/, 'Use accessible AURELIS light and dark green accents');
assert.match(dock, /\/embed\?theme=\$\{theme\}&accent=%23\$\{accent\}&radius=18&width=440&font=mono/, 'Use supported hosted SwapsPro styling query parameters');
assert.match(dock, /src=\{getSwapWidgetUrl\(active, theme\)\}/, 'Apply current theme to desktop popup');
assert.match(dock, /src=\{getSwapWidgetUrl\(provider, theme\)\}/, 'Apply current theme to mobile page');
assert.match(dock, /if \(provider.id !== 'swapspro'\) return provider.url/, 'Preserve URLs for other swap icons');
assert.match(dock, /providerId === 'rango'/, 'Rango remains blocked for this US setup');
assert.match(dock, /isUniswapExternalLaunch/, 'Uniswap remains external until allowlist approval');
assert.match(primary, /LLAMASWAP_URL/, 'Keep LlamaSwap main Trade view');
assert.doesNotMatch(dock, /postMessage\([^)]*(?:privateKey|seed|walletConnect)/, 'Never forward signing materials to hosted widgets');
console.log('PASS SwapsPro white/green theme, dark matching, original providers and wallet isolation');

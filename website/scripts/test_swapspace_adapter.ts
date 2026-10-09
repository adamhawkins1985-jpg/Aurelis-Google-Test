import assert from 'node:assert/strict';
import { SwapSpaceService } from '../server/swapspace_service';

process.env.SWAPSPACE_API_KEY = 'ci-placeholder';
const originalFetch = globalThis.fetch;
let calls: { url: string; options?: RequestInit }[] = [];
let handler = (_url: string, _options?: RequestInit): unknown => ({});
const from = { currency: 'eth', network: 'eth' };
const to = { currency: 'btc', network: 'btc' };
globalThis.fetch = (async (input: string | URL | Request, options?: RequestInit) => {
  const url = String(input);
  calls.push({ url, options });
  return new Response(JSON.stringify(handler(url, options)), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}) as typeof fetch;

try {
  handler = () => ({ id: 'offer-1', partner: 'nexchange', toAmount: 0.00029, min: 0.001, max: 3, exists: true, fixed: false });
  const quote = await SwapSpaceService.getQuote(from, to, '0.01');
  assert.equal(quote.partner, 'nexchange');
  assert.equal(quote.toAmount, '0.00029');
  assert.match(calls.at(-1)!.url, /amounts\/best/);
  console.log('PASS quote normalization');
  // Live API verified on 2026-10-09: USDC on Arbitrum uses 'arb', not 'arbitrum'.
  handler = () => [{ code: 'usdc', network: 'arb' }];
  const catalog = await SwapSpaceService.getCurrencies();
  assert.ok(catalog.some(asset => asset.changenowCurrency === 'usdc' && asset.changenowNetwork === 'arbitrum'));
  const usdcArbitrum = { currency: 'usdc', network: 'arbitrum' };
  calls = [];
  handler = () => ({
    id: 'offer-arb', partner: 'nexchange', exists: true, fromAmount: 60,
    toAmount: 0.02395, fromCurrency: 'usdc', fromNetwork: 'arb',
    toCurrency: 'eth', toNetwork: 'eth', min: 0.5, max: 1000,
  });
  const arbQuote = await SwapSpaceService.getQuote(usdcArbitrum, from, '60');
  assert.equal(arbQuote.fromNetwork, 'arbitrum');
  assert.match(calls.at(-1)!.url, /fromNetwork=arb/);
  assert.doesNotMatch(calls.at(-1)!.url, /fromNetwork=arbitrum/);
  handler = (url) => url.includes('/amounts/best')
    ? { id: 'offer-arb', partner: 'nexchange', exists: true, fromAmount: 60,
        toAmount: 0.02395, fromCurrency: 'usdc', fromNetwork: 'arb',
        toCurrency: 'eth', toNetwork: 'eth', min: 0.5, max: 1000 }
    : { id: 'mock-arb', status: 'waiting', from: { address: 'mock-deposit', code: 'usdc', network: 'arb' },
        to: { code: 'eth', network: 'eth' } };
  calls = [];
  const arbOrder = await SwapSpaceService.createExchange({
    fromAsset: usdcArbitrum, toAsset: from, amount: '60',
    destinationAddress: 'mock-destination', refundAddress: 'mock-refund',
  }, '203.0.113.5');
  assert.equal(arbOrder.fromNetwork, 'arbitrum');
  const submitted = JSON.parse(String(calls.at(-1)!.options!.body));
  assert.equal(submitted.fromNetwork, 'arb');
  console.log('PASS live-verified Arbitrum network alias in catalog, quote, and mocked order');

  handler = () => ({ id: 'offer-1', partner: 'nexchange', toAmount: 'Infinity', min: 0.001, exists: true });
  await assert.rejects(SwapSpaceService.getQuote(from, to, '0.01'), /no executable offer/);
  handler = () => ({ id: 'offer-1', partner: 'nexchange', toAmount: 0.00029, min: 0.001, exists: true, fromCurrency: 'eth', fromNetwork: 'base', toCurrency: 'btc', toNetwork: 'btc' });
  await assert.rejects(SwapSpaceService.getQuote(from, to, '0.01'), /quote asset or network did not match/);
  console.log('PASS nonfinite quote and mismatched quote network rejected');
  for (const malformed of [
    { partner: 'nexchange', toAmount: 0, amount: 0.01, exists: true },
    { partner: 'nexchange', toAmount: 0.00029, fromAmount: 0.2, exists: true },
    { partner: 'nexchange', toAmount: 0.00029, min: 'not-a-number', exists: true },
    { partner: 'nexchange', toAmount: 0.00029, max: '-1', exists: true },
  ]) {
    handler = () => malformed;
    await assert.rejects(SwapSpaceService.getQuote(from, to, '0.01'), /no executable offer/);
  }
  console.log('PASS zero payout, different source amount, and invalid amount limits rejected');



  handler = () => ({ partner: 'nexchange', toAmount: 1, exists: false, min: 0.01 });
  await assert.rejects(SwapSpaceService.getQuote(from, to, '0.1'), /no executable offer/);
  handler = () => ({ partner: 'nexchange', toAmount: 1, exists: true, min: 1 });
  await assert.rejects(SwapSpaceService.getQuote(from, to, '0.1'), /no executable offer/);
  console.log('PASS unavailable and below-minimum offers');

  calls = [];
  handler = (url) => url.includes('/amounts/best')
    ? { id: 'offer-1', partner: 'nexchange', toAmount: 0.00029, min: 0.001, exists: true }
    : { id: 'mock-order', from: { address: 'mock-deposit', amount: '0.01' }, to: { amount: '0.00029' }, status: 'waiting' };
  const order = await SwapSpaceService.createExchange({
    fromAsset: from, toAsset: to, amount: '0.01', destinationAddress: 'mock-destination', refundAddress: 'mock-refund',
  }, '203.0.113.5');
  assert.equal(order.depositAddress, 'mock-deposit');
  assert.equal(order.exchangeId, 'mock-order');
  const payload = JSON.parse(String(calls.at(-1)!.options!.body));
  assert.equal(payload.address, 'mock-destination');
  assert.equal(payload.refund, 'mock-refund');
  assert.equal(payload.userIp, '203.0.113.5');
  assert.equal(calls.filter(c => c.url.endsWith('/exchange')).length, 1);
  console.log('PASS mocked order creation and deposit mapping');

  calls = [];
  for (const amount of ['Infinity', 'NaN', '-1', '0']) {
    await assert.rejects(SwapSpaceService.createExchange({
      fromAsset: from, toAsset: to, amount, destinationAddress: 'mock-destination', refundAddress: 'mock-refund',
    }, '203.0.113.5'), /positive finite/);
  }
  assert.equal(calls.length, 0);
  console.log('PASS nonfinite and nonpositive order amounts blocked before API calls');

  calls = [];
  handler = (url) => url.includes('/amounts/best')
    ? { id: 'offer-1', partner: 'nexchange', toAmount: 0.00029, min: 0.001, exists: true }
    : { id: 'mock-order', from: { address: 'mock-deposit' }, to: { address: 'unexpected-recipient' }, status: 'waiting' };
  await assert.rejects(SwapSpaceService.createExchange({
    fromAsset: from, toAsset: to, amount: '0.01', destinationAddress: 'mock-destination', refundAddress: 'mock-refund',
  }, '203.0.113.5'), /destination did not match/);
  console.log('PASS mismatched order destination blocked');
  for (const response of [
    { id: 'mock-order', status: 'waiting', refundAddress: 'unexpected-refund', from: { address: 'mock-deposit' } },
    { id: 'mock-order', status: 'waiting', partner: 'unexpected-provider', from: { address: 'mock-deposit' } },
  ]) {
    handler = (url) => url.includes('/amounts/best')
      ? { id: 'offer-1', partner: 'nexchange', toAmount: 0.00029, min: 0.001, exists: true }
      : response;
    await assert.rejects(SwapSpaceService.createExchange({
      fromAsset: from, toAsset: to, amount: '0.01',
      destinationAddress: 'mock-destination', refundAddress: 'mock-refund',
    }, '203.0.113.5'), /refund address did not match|provider changed/);
  }
  console.log('PASS mismatched refund address and quote partner blocked');


  handler = (url) => url.includes('/amounts/best')
    ? { id: 'offer-1', partner: 'nexchange', toAmount: 0.00029, min: 0.001, exists: true }
    : { id: 'mock-order', status: 'waiting', from: { address: 'mock-deposit', currency: 'eth', network: 'base' }, to: { currency: 'btc', network: 'btc' } };
  await assert.rejects(SwapSpaceService.createExchange({
    fromAsset: from, toAsset: to, amount: '0.01', destinationAddress: 'mock-destination', refundAddress: 'mock-refund',
  }, '203.0.113.5'), /asset or network did not match/);
  console.log('PASS conflicting exchange source network rejected');
  handler = (url) => url.includes('/amounts/best')
    ? { id: 'offer-1', partner: 'nexchange', toAmount: 0.00029, min: 0.001, exists: true }
    : { id: 'mock-order', status: 'waiting', from: { address: 'mock-deposit', code: 'wrong-token', network: 'eth' }, to: { code: 'btc', network: 'btc' } };
  await assert.rejects(SwapSpaceService.createExchange({
    fromAsset: from, toAsset: to, amount: '0.01', destinationAddress: 'mock-destination', refundAddress: 'mock-refund',
  }, '203.0.113.5'), /asset or network did not match/);
  console.log('PASS provider code mismatch rejected before showing deposit instructions');
  handler = (url) => url.includes('/amounts/best')
    ? { id: 'offer-1', partner: 'nexchange', toAmount: 0.00029, min: 0.001, exists: true }
    : { id: 'mock-order', status: 'waiting', from: { address: 'mock-deposit', code: 'eth', currency: 'wrong-token', network: 'eth' }, to: { code: 'btc', network: 'btc' } };
  await assert.rejects(SwapSpaceService.createExchange({
    fromAsset: from, toAsset: to, amount: '0.01', destinationAddress: 'mock-destination', refundAddress: 'mock-refund',
  }, '203.0.113.5'), /asset or network did not match/);
  console.log('PASS conflicting provider code/currency aliases rejected');



  for (const orderResponse of [
    { id: 'mock-order', status: 'waiting' },
    { from: { address: 'mock-deposit' }, status: 'waiting' },
    { id: 'mock-order', from: { address: '' }, status: 'waiting' },
  ]) {
    handler = (url) => url.includes('/amounts/best')
      ? { id: 'offer-1', partner: 'nexchange', toAmount: 0.00029, min: 0.001, exists: true }
      : orderResponse;
    await assert.rejects(SwapSpaceService.createExchange({
      fromAsset: from, toAsset: to, amount: '0.01',
      destinationAddress: 'mock-destination', refundAddress: 'mock-refund',
    }, '203.0.113.5'), /missing the deposit address or exchange ID/);
  }
  console.log('PASS incomplete exchange orders never produce deposit instructions');

  handler = (url) => url.includes('/amounts/best')
    ? { id: 'offer-1', partner: 'nexchange', toAmount: 0.00029, min: 0.001, exists: true }
    : { id: 'mock-order', status: 'unexpected-provider-state', from: { address: 'mock-deposit' } };
  await assert.rejects(SwapSpaceService.createExchange({
    fromAsset: from, toAsset: to, amount: '0.01',
    destinationAddress: 'mock-destination', refundAddress: 'mock-refund',
  }, '203.0.113.5'), /order status was unrecognized/);
  await assert.rejects(SwapSpaceService.getQuote(from, to, 'Infinity'), /positive finite number/);
  await assert.rejects(SwapSpaceService.getQuote(from, to, '0'), /positive finite number/);
  console.log('PASS unknown order status and invalid amounts fail closed');

  for (const terminalStatus of ['finished', 'failed', 'refunded']) {
    handler = (url) => url.includes('/amounts/best')
      ? { id: 'offer-1', partner: 'nexchange', toAmount: 0.00029, min: 0.001, exists: true }
      : { id: 'mock-order', status: terminalStatus, from: { address: 'mock-deposit' } };
    await assert.rejects(SwapSpaceService.createExchange({
      fromAsset: from, toAsset: to, amount: '0.01',
      destinationAddress: 'mock-destination', refundAddress: 'mock-refund',
    }, '203.0.113.5'), /terminal order state/);
  }
  console.log('PASS terminal exchange states never expose deposit instructions');





  calls = [];
  await assert.rejects(SwapSpaceService.createExchange({
    fromAsset: from, toAsset: to, amount: '0.01', destinationAddress: '', refundAddress: 'mock-refund',
  }, '203.0.113.5'), /Destination and refund/);
  assert.equal(calls.length, 0);
  console.log('PASS invalid addresses rejected before network requests');

  for (const state of ['waiting', 'confirming', 'exchanging', 'sending', 'finished', 'failed', 'refunded']) {
    handler = () => ({ id: 'mock-order', status: state, from: { transactionHash: 'source-hash' }, to: { transactionHash: 'dest-hash' } });
    const result = await SwapSpaceService.getExchangeStatus('mock-order');
    assert.equal(result.status, state);
    assert.equal(result.payinHash, 'source-hash');
    assert.equal(result.payoutHash, 'dest-hash');
  }
  console.log('PASS simulated progress, success, failure and refund states');
  handler = () => ({ id: 'different-order', status: 'finished' });
  await assert.rejects(SwapSpaceService.getExchangeStatus('mock-order'), /could not verify the requested exchange ID/);
  handler = () => ({ status: 'finished' });
  await assert.rejects(SwapSpaceService.getExchangeStatus('mock-order'), /could not verify the requested exchange ID/);
  handler = () => ({ id: 'mock-order', status: 'unexpected-new-provider-state' });
  const unknown = await SwapSpaceService.getExchangeStatus('mock-order');
  assert.equal(unknown.ok, false);
  assert.equal(unknown.status, 'unknown');
  console.log('PASS missing/mismatched exchange IDs and unknown status fail closed');
} finally {
  globalThis.fetch = originalFetch;
}

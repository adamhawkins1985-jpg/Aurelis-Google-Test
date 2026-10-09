import { CANONICAL_ASSETS, CreateExchangeRequest } from './exchange_models';

// Main shell BUY / SELL / TRADE only. No bot wallet/session dependencies.
const BASE = 'https://api.swapspace.co/api/v2';
const str = (value: unknown) => value == null ? '' : String(value);
// Preserve AURELIS network names at the UI boundary, translate only for SwapSpace API calls.
const providerNetwork = (value: string) => {
  const network = value.toLowerCase();
  return network === 'arbitrum' ? 'arb' : network;
};
const payload = (value: any): any => value?.data ?? value;
const status = (value: any) => {
  const s = str(value).toLowerCase();
  if (['waiting','confirming','exchanging','sending','finished','failed','refunded'].includes(s)) return s;
  if (['verifying','expired','action_required'].includes(s)) return 'action_required';
  return 'unknown';
};

async function request(path: string, options: RequestInit = {}) {
  const key = process.env.SWAPSPACE_API_KEY?.trim();
  if (!key) throw new Error('SwapSpace API key is not configured on the server');
  const response = await fetch(BASE + path, {
    ...options,
    headers: { Authorization: key, 'User-Agent': 'Aurelis-Integration/1.0', 'Content-Type': 'application/json', ...options.headers },
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(str(body?.message || body?.error || 'SwapSpace request failed (' + response.status + ')'));
  return payload(body);
}

const pair = (from: {currency:string;network?:string}, to: {currency:string;network?:string}, amount: string) => {
  const search = new URLSearchParams({
    fromCurrency: from.currency.toLowerCase(),
    fromNetwork: providerNetwork(from.network || from.currency),
    toCurrency: to.currency.toLowerCase(),
    toNetwork: providerNetwork(to.network || to.currency),
    amount,
  });
  return search.toString();
};

export class SwapSpaceService {
  static async getCurrencies() {
    const response = await request('/currencies');
    const available = Array.isArray(response) ? response : (response?.currencies || response?.items || []);
    if (!Array.isArray(available) || !available.length) throw new Error('SwapSpace currency catalog unavailable');
    const supported = new Set(available.map((x: any) => str(x.code || x.symbol || x.currency).toLowerCase() + ':' + str(x.network || x.blockchain).toLowerCase()));
    return CANONICAL_ASSETS.filter(asset => supported.has(asset.changenowCurrency + ':' + providerNetwork(asset.changenowNetwork)));
  }

  static async getQuote(from: {currency:string;network?:string}, to: {currency:string;network?:string}, amount: string) {
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) throw new Error('SwapSpace quote amount must be a positive finite number');
    const data = await request('/amounts/best?' + pair(from, to, amount));
    const best = Array.isArray(data) ? data[0] : data;
    // Use destination amount only; do not treat a zero payout as missing and fall back to source amount.
    const output = str(best?.toAmount ?? best?.amountTo ?? best?.estimatedAmount);
    const partner = str(best?.partner?.id || best?.partner?.name || best?.partner);
    const requested = Number(amount);
    const quotedFrom = best?.fromAmount;
    const minimum = best?.minAmount ?? best?.min;
    const maximum = best?.max;
    const invalidBound = (value: any) => value != null && (!Number.isFinite(Number(value)) || Number(value) < 0);
    const amountMismatch = quotedFrom != null && (
      !Number.isFinite(Number(quotedFrom)) ||
      Math.abs(Number(quotedFrom) - requested) > Math.max(Math.abs(requested) * 1e-8, 1e-12)
    );
    if (best?.exists === false || !partner || !Number.isFinite(Number(output)) || !(Number(output) > 0) ||
        invalidBound(minimum) || invalidBound(maximum) || amountMismatch ||
        (minimum != null && requested < Number(minimum)) ||
        (maximum != null && Number(maximum) > 0 && requested > Number(maximum))) {
      throw new Error('SwapSpace returned no executable offer');
    }
    const quoteIdentities: Array<[unknown, string]> = [
      [best?.fromCurrency, from.currency], [best?.fromNetwork, providerNetwork(from.network || from.currency)],
      [best?.toCurrency, to.currency], [best?.toNetwork, providerNetwork(to.network || to.currency)],
    ];
    if (quoteIdentities.some(([actual, expected]) => actual != null && String(actual).trim() !== '' && String(actual).trim().toLowerCase() !== expected.toLowerCase())) {
      throw new Error('SwapSpace quote asset or network did not match the requested trade');
    }
    return {
      ok: true as const, fromAmount: amount, toAmount: output,
      fromCurrency: from.currency, toCurrency: to.currency,
      fromNetwork: from.network || from.currency, toNetwork: to.network || to.currency,
      minimumAmount: str(best?.minAmount || best?.min || 0),
      rateId: str(best?.rateId || best?.id), flow: best?.fixed ? 'fixed-rate' : 'standard',
      expiresAt: null, rawProvider: 'SwapSpace' as const, partner,
    };
  }

  static async createExchange(body: CreateExchangeRequest & { partner?: string }, userIp: string) {
    // Re-quote server-side, never trust a provider name or payout value from the browser.
    if (!body.destinationAddress?.trim() || !body.refundAddress?.trim()) throw new Error('Destination and refund addresses are required');
    if (!Number.isFinite(Number(body.amount)) || Number(body.amount) <= 0) throw new Error('Exchange amount must be a positive finite number');
    if (!userIp?.trim()) throw new Error('A verified client IP is required');
    const quote = await this.getQuote(body.fromAsset, body.toAsset, str(body.amount));
    const fixed = quote.flow === 'fixed-rate';
    const result = await request('/exchange', {
      method: 'POST',
      body: JSON.stringify({
        partner: quote.partner,
        fromCurrency: body.fromAsset.currency.toLowerCase(),
        fromNetwork: providerNetwork(body.fromAsset.network || body.fromAsset.currency),
        toCurrency: body.toAsset.currency.toLowerCase(),
        toNetwork: providerNetwork(body.toAsset.network || body.toAsset.currency),
        address: body.destinationAddress,
        amount: Number(body.amount),
        fixed,
        extraId: body.destinationExtraId || '',
        rateId: fixed ? quote.rateId : '',
        refund: body.refundAddress,
        userIp,
      }),
    });
    const id = str(result?.id);
    if (result?.error) throw new Error('SwapSpace declined the order');
    const deposit = str(result?.from?.address || result?.addressFrom || result?.address_from || result?.payinAddress);
    if (!id || !deposit) throw new Error('SwapSpace order response was missing the deposit address or exchange ID. Contact support before retrying.');
    if (status(result?.status) === 'unknown') throw new Error('SwapSpace order status was unrecognized. Do not send funds.');
    if (['finished', 'failed', 'refunded'].includes(status(result?.status))) throw new Error('SwapSpace returned a terminal order state. Do not send funds.');
    // Check every populated provider identity field. A matching "code" must not hide
    // a contradictory "currency" or legacy field in the same response.
    const matches = (actual: unknown, expected: string) =>
      actual == null || String(actual).trim() === '' || String(actual).trim().toLowerCase() === expected.toLowerCase();
    const expectedFromNetwork = providerNetwork(body.fromAsset.network || body.fromAsset.currency);
    const expectedToNetwork = providerNetwork(body.toAsset.network || body.toAsset.currency);
    const identities: Array<[unknown, string]> = [
      [result?.from?.code, body.fromAsset.currency],
      [result?.from?.currency, body.fromAsset.currency],
      [result?.fromCurrency, body.fromAsset.currency],
      [result?.from?.network, expectedFromNetwork],
      [result?.fromNetwork, expectedFromNetwork],
      [result?.to?.code, body.toAsset.currency],
      [result?.to?.currency, body.toAsset.currency],
      [result?.toCurrency, body.toAsset.currency],
      [result?.to?.network, expectedToNetwork],
      [result?.toNetwork, expectedToNetwork],
    ];
    if (identities.some(([actual, expected]) => !matches(actual, expected))) {
      throw new Error('SwapSpace order asset or network did not match the requested trade. Do not send funds.');
    }
    const addressesMatch = (received: string, requested: string) => {
      const actual = received.trim();
      const expected = requested.trim();
      const evm = /^0x[a-fA-F0-9]{40}$/;
      return evm.test(actual) && evm.test(expected)
        ? actual.toLowerCase() === expected.toLowerCase()
        : actual === expected;
    };
    const returnedDestination = str(result?.to?.address || result?.addressTo || result?.address_to);
    if (returnedDestination && !addressesMatch(returnedDestination, body.destinationAddress)) {
      throw new Error('SwapSpace order destination did not match the requested recipient. Do not send funds.');
    }
    const returnedRefund = str(result?.refundAddress || result?.refund);
    if (returnedRefund && !addressesMatch(returnedRefund, body.refundAddress)) {
      throw new Error('SwapSpace order refund address did not match the requested wallet. Do not send funds.');
    }
    if (result?.partner && String(result.partner).toLowerCase() !== String(quote.partner).toLowerCase()) {
      throw new Error('SwapSpace exchange provider changed after the quote. Do not send funds.');
    }
    return {
      ok: true as const, exchangeId: id, provider: 'SwapSpace' as const,
      fromCurrency: body.fromAsset.currency, toCurrency: body.toAsset.currency,
      fromNetwork: body.fromAsset.network || body.fromAsset.currency,
      toNetwork: body.toAsset.network || body.toAsset.currency,
      fromAmount: str(body.amount), expectedToAmount: str(result?.to?.amount || result?.toAmount || result?.amountTo || quote.toAmount),
      depositAddress: deposit, depositExtraId: str(result?.from?.extraId || result?.extraIdFrom || result?.extra_id_from),
      destinationAddress: body.destinationAddress, refundAddress: body.refundAddress || '',
      status: status(result?.status),
    };
  }

  static async getExchangeStatus(id: string) {
    const result = await request('/exchange/' + encodeURIComponent(id));
    if (!result || result?.error || !result?.id || String(result.id) !== id) throw new Error('SwapSpace status response could not verify the requested exchange ID');
    return {
      ok: status(result?.status) !== 'unknown', exchangeId: id, status: status(result?.status),
      providerStatus: str(result?.status || 'unknown'),
      payinHash: result?.from?.transactionHash || result?.txFrom || result?.tx_from || null,
      payoutHash: result?.to?.transactionHash || result?.txTo || result?.tx_to || null,
      fromAmount: str(result?.from?.amount || result?.amountFrom || result?.amount_from),
      toAmount: str(result?.to?.amount || result?.amountTo || result?.amount_to),
    };
  }
}

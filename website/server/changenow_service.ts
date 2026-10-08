import {
  ExchangeAsset,
  CANONICAL_ASSETS,
  QuoteResult,
  NormalizedQuoteSuccess,
  NormalizedQuoteError,
  NormalizedExchangeSuccess,
  NormalizedExchangeStatus,
  CreateExchangeRequest,
} from './exchange_models';

const CHANGENOW_BASE_V2 = 'https://api.changenow.io/v2';
const CHANGENOW_BASE_V1 = 'https://api.changenow.io/v1';

// Server-side API key retrieved strictly from environment variables
function getApiKey(): string | undefined {
  return process.env.CHANGENOW_API_KEY?.trim() || undefined;
}

// In-memory catalog cache to avoid hammering ChangeNOW currencies endpoint
let cachedCurrencies: ExchangeAsset[] | null = null;
let lastCurrenciesFetch = 0;
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes

/**
 * Layer A: changenow_service
 * Handles all direct communication with the ChangeNOW API.
 */
export class ChangeNowService {
  /**
   * Fetch all supported currencies and networks, normalized into ExchangeAsset catalog
   */
  static async getCurrencies(): Promise<ExchangeAsset[]> {
    const now = Date.now();
    if (cachedCurrencies && now - lastCurrenciesFetch < CACHE_TTL_MS) {
      return cachedCurrencies;
    }

    try {
      const res = await fetch(`${CHANGENOW_BASE_V2}/exchange/currencies`, {
        headers: {
          Accept: 'application/json',
          ...(getApiKey() ? { 'x-changenow-api-key': getApiKey()! } : {}),
        },
      });

      if (!res.ok) {
        throw new Error(`Currencies endpoint returned status ${res.status}`);
      }

      const list: any[] = await res.json();
      if (!Array.isArray(list)) {
        return CANONICAL_ASSETS;
      }

      // Map ChangeNOW catalog
      const catalog: ExchangeAsset[] = list
        .filter((c) => c && c.ticker && !c.isFiat)
        .map((c) => {
          const tickerUpper = String(c.ticker).toUpperCase();
          const netLower = String(c.network || c.ticker).toLowerCase();

          return {
            symbol: tickerUpper,
            name: c.name || tickerUpper,
            changenowCurrency: String(c.ticker).toLowerCase(),
            changenowNetwork: netLower,
            chainId: netLower,
            internalChain: netLower,
            logoURI: c.image || undefined,
            enabled: Boolean(c.buy && c.sell),
            supportsMemo: Boolean(c.hasExternalId || c.isExtraIdSupported),
          };
        });

      // Merge canonical priorities at the front
      const canonicalKeys = new Set(
        CANONICAL_ASSETS.map((a) => `${a.changenowCurrency}:${a.changenowNetwork}`)
      );
      const otherAssets = catalog.filter(
        (a) => !canonicalKeys.has(`${a.changenowCurrency}:${a.changenowNetwork}`)
      );

      cachedCurrencies = [...CANONICAL_ASSETS, ...otherAssets];
      lastCurrenciesFetch = now;
      return cachedCurrencies;
    } catch (err: any) {
      console.warn('Failed to fetch full ChangeNOW currencies catalog, using canonical assets:', err?.message);
      return CANONICAL_ASSETS;
    }
  }

  /**
   * Fetch real minimum deposit amount for a specific asset pair from ChangeNOW
   */
  static async getMinimum(
    fromCurrency: string,
    fromNetwork: string,
    toCurrency: string,
    toNetwork: string
  ): Promise<{ minAmount: number; raw: any }> {
    const fromCur = fromCurrency.toLowerCase();
    const fromNet = fromNetwork.toLowerCase();
    const toCur = toCurrency.toLowerCase();
    const toNet = toNetwork.toLowerCase();

    const url = `${CHANGENOW_BASE_V2}/exchange/min-amount?fromCurrency=${fromCur}&toCurrency=${toCur}&fromNetwork=${fromNet}&toNetwork=${toNet}&flow=standard`;

    const headers: Record<string, string> = { Accept: 'application/json' };
    const apiKey = getApiKey();
    if (apiKey) {
      headers['x-changenow-api-key'] = apiKey;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`ChangeNOW minimum error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const minVal = Number(data.minAmount);
    return {
      minAmount: isNaN(minVal) ? 0 : minVal,
      raw: data,
    };
  }

  /**
   * Fetch estimated swap quote from ChangeNOW
   * Uses ChangeNOW v2 estimated-amount when API key is provided, with robust v1 fallback.
   */
  static async getQuote(
    fromCurrency: string,
    fromNetwork: string,
    toCurrency: string,
    toNetwork: string,
    amountStr: string
  ): Promise<QuoteResult> {
    const fromCur = fromCurrency.toLowerCase();
    const fromNet = fromNetwork.toLowerCase();
    const toCur = toCurrency.toLowerCase();
    const toNet = toNetwork.toLowerCase();
    const numAmount = parseFloat(amountStr);

    if (isNaN(numAmount) || numAmount <= 0) {
      return {
        ok: false,
        code: 'BELOW_MINIMUM',
        message: 'Enter a valid amount greater than 0',
      };
    }

    // 1. Check real minimum first
    let minAmount = 0;
    try {
      const minData = await this.getMinimum(fromCur, fromNet, toCur, toNet);
      minAmount = minData.minAmount;
      if (numAmount < minAmount) {
        return {
          ok: false,
          code: 'BELOW_MINIMUM',
          minimumAmount: String(minAmount),
          message: `Amount ${amountStr} ${fromCurrency.toUpperCase()} is below the minimum required ${minAmount} ${fromCurrency.toUpperCase()}`,
        };
      }
    } catch (minErr: any) {
      // If pair is unsupported or unavailable
      const errMsg = minErr?.message || '';
      if (errMsg.includes('pair_is_inactive') || errMsg.includes('not found') || errMsg.includes('unavailable')) {
        return {
          ok: false,
          code: 'PAIR_UNAVAILABLE',
          message: `Trading pair ${fromCurrency.toUpperCase()} (${fromNet}) -> ${toCurrency.toUpperCase()} (${toNet}) is currently unavailable on ChangeNOW.`,
          details: errMsg,
        };
      }
    }

    // 2. Fetch quote: Attempt v2 first, then v1
    const apiKey = getApiKey();
    if (apiKey) {
      try {
        const v2Url = `${CHANGENOW_BASE_V2}/exchange/estimated-amount?fromCurrency=${fromCur}&toCurrency=${toCur}&fromAmount=${amountStr}&fromNetwork=${fromNet}&toNetwork=${toNet}&flow=standard`;
        const v2Res = await fetch(v2Url, {
          headers: {
            Accept: 'application/json',
            'x-changenow-api-key': apiKey,
          },
        });

        if (v2Res.ok) {
          const v2Data = await v2Res.json();
          return {
            ok: true,
            fromAmount: String(amountStr),
            toAmount: String(v2Data.toAmount || v2Data.estimatedAmount),
            fromCurrency: fromCurrency.toUpperCase(),
            toCurrency: toCurrency.toUpperCase(),
            fromNetwork: fromNet,
            toNetwork: toNet,
            minimumAmount: String(minAmount || v2Data.minAmount || '0'),
            rateId: v2Data.rateId || '',
            flow: 'standard',
            expiresAt: v2Data.validUntil || null,
            rawProvider: 'ChangeNOW',
          };
        }
      } catch (e) {
        // Fall through to v1
      }
    }

    // Fallback: ChangeNOW v1 exchange-amount
    try {
      const v1Url = `${CHANGENOW_BASE_V1}/exchange-amount/${amountStr}/${fromCur}_${toCur}`;
      const v1Res = await fetch(v1Url, {
        headers: { Accept: 'application/json' },
      });

      if (!v1Res.ok) {
        const v1Err = await v1Res.text();
        return {
          ok: false,
          code: 'QUOTE_FAILED',
          minimumAmount: String(minAmount),
          message: `ChangeNOW could not quote this pair: ${v1Err}`,
        };
      }

      const v1Data = await v1Res.json();
      const estimated = v1Data.estimatedAmount;
      if (estimated === undefined || estimated === null) {
        return {
          ok: false,
          code: 'QUOTE_FAILED',
          message: v1Data.message || 'ChangeNOW returned an empty estimate for this pair',
        };
      }

      return {
        ok: true,
        fromAmount: String(amountStr),
        toAmount: String(estimated),
        fromCurrency: fromCurrency.toUpperCase(),
        toCurrency: toCurrency.toUpperCase(),
        fromNetwork: fromNet,
        toNetwork: toNet,
        minimumAmount: String(minAmount),
        rateId: '',
        flow: 'standard',
        expiresAt: null,
        rawProvider: 'ChangeNOW',
      };
    } catch (quoteErr: any) {
      return {
        ok: false,
        code: 'PROVIDER_UNAVAILABLE',
        message: `ChangeNOW quote service communication failure: ${quoteErr?.message || String(quoteErr)}`,
      };
    }
  }

  /**
   * Create an exchange on ChangeNOW (v2 endpoint)
   * POST https://api.changenow.io/v2/exchange
   */
  static async createExchange(
    params: CreateExchangeRequest
  ): Promise<NormalizedExchangeSuccess | NormalizedQuoteError> {
    const fromCur = params.fromAsset.currency.toLowerCase();
    const fromNet = (params.fromAsset.network || params.fromAsset.currency).toLowerCase();
    const toCur = params.toAsset.currency.toLowerCase();
    const toNet = (params.toAsset.network || params.toAsset.currency).toLowerCase();
    const amountStr = String(params.amount);

    if (!params.destinationAddress?.trim()) {
      return {
        ok: false,
        code: 'INVALID_ADDRESS',
        message: 'Destination wallet address is required to create a swap',
      };
    }

    // Verify minimum
    try {
      const minData = await this.getMinimum(fromCur, fromNet, toCur, toNet);
      const numAmt = parseFloat(amountStr);
      if (numAmt < minData.minAmount) {
        return {
          ok: false,
          code: 'BELOW_MINIMUM',
          minimumAmount: String(minData.minAmount),
          message: `Amount ${amountStr} is below minimum required ${minData.minAmount}`,
        };
      }
    } catch (e: any) {
      console.warn('Could not verify minimum prior to exchange creation:', e?.message);
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      return {
        ok: false,
        code: 'PROVIDER_UNAVAILABLE',
        message:
          'CHANGENOW_API_KEY environment variable is not configured on the server. ChangeNOW requires an API key to create live deposit exchanges.',
      };
    }

    const payload: Record<string, any> = {
      fromCurrency: fromCur,
      toCurrency: toCur,
      fromNetwork: fromNet,
      toNetwork: toNet,
      fromAmount: amountStr,
      address: params.destinationAddress.trim(),
      flow: 'standard',
    };

    if (params.destinationExtraId?.trim()) {
      payload.extraId = params.destinationExtraId.trim();
    }
    if (params.refundAddress?.trim()) {
      payload.refundAddress = params.refundAddress.trim();
    }
    if (params.refundExtraId?.trim()) {
      payload.refundExtraId = params.refundExtraId.trim();
    }
    if (params.rateId?.trim()) {
      payload.rateId = params.rateId.trim();
    }

    try {
      const res = await fetch(`${CHANGENOW_BASE_V2}/exchange`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-changenow-api-key': apiKey,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorText = data.message || data.error || JSON.stringify(data);
        return {
          ok: false,
          code: 'EXCHANGE_CREATE_FAILED',
          message: `ChangeNOW exchange rejected: ${errorText}`,
          details: data,
        };
      }

      return {
        ok: true,
        exchangeId: data.id,
        provider: 'ChangeNOW',
        fromCurrency: params.fromAsset.currency.toUpperCase(),
        toCurrency: params.toAsset.currency.toUpperCase(),
        fromNetwork: fromNet,
        toNetwork: toNet,
        fromAmount: String(data.fromAmount || amountStr),
        expectedToAmount: String(data.toAmount || data.expectedToAmount || '0'),
        depositAddress: data.payinAddress || data.depositAddress,
        depositExtraId: data.payinExtraId || data.depositExtraId || '',
        destinationAddress: params.destinationAddress,
        refundAddress: params.refundAddress || '',
        status: 'waiting',
        rawStatus: data.status,
      };
    } catch (err: any) {
      return {
        ok: false,
        code: 'EXCHANGE_CREATE_FAILED',
        message: `Network error creating ChangeNOW exchange: ${err?.message || String(err)}`,
      };
    }
  }

  /**
   * Get transaction status from ChangeNOW
   * Normalizes statuses: waiting, confirming, exchanging, sending, finished, failed, refunded, action_required, unknown
   */
  static async getExchangeStatus(exchangeId: string): Promise<NormalizedExchangeStatus> {
    const apiKey = getApiKey();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (apiKey) {
      headers['x-changenow-api-key'] = apiKey;
    }

    try {
      const res = await fetch(`${CHANGENOW_BASE_V2}/exchange/by-id?id=${encodeURIComponent(exchangeId)}`, {
        headers,
      });

      if (!res.ok) {
        const errText = await res.text();
        return {
          ok: false,
          exchangeId,
          status: 'unknown',
          providerStatus: `HTTP_${res.status}`,
          payinHash: null,
          payoutHash: null,
          fromAmount: '0',
          toAmount: '0',
          error: `ChangeNOW status error (${res.status}): ${errText}`,
        };
      }

      const data = await res.json();
      const rawStatus = String(data.status || '').toLowerCase();

      // Status mapping table
      let normalizedStatus: NormalizedExchangeStatus['status'] = 'unknown';
      if (rawStatus === 'waiting' || rawStatus === 'new') {
        normalizedStatus = 'waiting';
      } else if (rawStatus === 'confirming') {
        normalizedStatus = 'confirming';
      } else if (rawStatus === 'exchanging') {
        normalizedStatus = 'exchanging';
      } else if (rawStatus === 'sending') {
        normalizedStatus = 'sending';
      } else if (rawStatus === 'finished') {
        normalizedStatus = 'finished';
      } else if (rawStatus === 'failed' || rawStatus === 'expired') {
        normalizedStatus = 'failed';
      } else if (rawStatus === 'refunded') {
        normalizedStatus = 'refunded';
      } else if (rawStatus === 'verifying' || rawStatus === 'action_required') {
        normalizedStatus = 'action_required';
      }

      return {
        ok: true,
        exchangeId: data.id || exchangeId,
        status: normalizedStatus,
        providerStatus: data.status || 'unknown',
        payinHash: data.payinHash || null,
        payoutHash: data.payoutHash || null,
        fromAmount: String(data.fromAmount || data.amountSend || '0'),
        toAmount: String(data.toAmount || data.amountReceive || '0'),
      };
    } catch (err: any) {
      return {
        ok: false,
        exchangeId,
        status: 'unknown',
        providerStatus: 'CONNECTION_ERROR',
        payinHash: null,
        payoutHash: null,
        fromAmount: '0',
        toAmount: '0',
        error: err?.message || String(err),
      };
    }
  }
}

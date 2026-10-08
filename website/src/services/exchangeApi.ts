import {
  ExchangeAsset,
  CANONICAL_ASSETS,
  QuoteResult,
  NormalizedQuoteSuccess,
  NormalizedExchangeSuccess,
  NormalizedExchangeStatus,
  CreateExchangeRequest,
} from '../../server/exchange_models';

export type {
  ExchangeAsset,
  QuoteResult,
  NormalizedQuoteSuccess,
  NormalizedExchangeSuccess,
  NormalizedExchangeStatus,
  CreateExchangeRequest,
};

export { CANONICAL_ASSETS };

/**
 * Address Resolver interface for AURELIS self-custody wallet.
 * Injects user's own destination & refund addresses based on network.
 */
export interface WalletAddressProvider {
  getAddress(asset: ExchangeAsset): Promise<string> | string;
}

export class AurelisWalletAddressProvider implements WalletAddressProvider {
  private addresses: Record<string, string>;
  private baseEvmAddress: string;

  constructor(addresses: Record<string, string> = {}, baseEvmAddress?: string) {
    this.addresses = addresses;
    this.baseEvmAddress =
      baseEvmAddress ||
      addresses.ETH ||
      addresses.ethereum ||
      addresses.ARBITRUM ||
      addresses.arbitrum ||
      '';
  }

  setAddresses(addresses: Record<string, string>) {
    this.addresses = addresses || {};
    this.baseEvmAddress =
      this.addresses.ETH ||
      this.addresses.ethereum ||
      this.addresses.ARBITRUM ||
      this.addresses.arbitrum ||
      this.baseEvmAddress;
  }

  setEvmAddress(address: string) {
    if (address?.trim()) {
      this.baseEvmAddress = address.trim();
    }
  }

  getAddress(asset: ExchangeAsset): string {
    const net = (asset.changenowNetwork || asset.changenowCurrency).toLowerCase();
    const aliases: Record<string, string[]> = {
      eth: ['ETH', 'ethereum'],
      arbitrum: ['ARBITRUM', 'arbitrum'],
      base: ['BASE', 'base'],
      op: ['OPTIMISM', 'optimism'],
      optimism: ['OPTIMISM', 'optimism'],
      matic: ['POLYGON', 'polygon'],
      polygon: ['POLYGON', 'polygon'],
      bsc: ['BSC', 'smartchain'],
      avaxc: ['AVALANCHEC', 'avalanchec', 'AVAXC', 'avaxc'],
      avalanchec: ['AVALANCHEC', 'avalanchec', 'AVAXC', 'avaxc'],
      cchain: ['AVALANCHEC', 'avalanchec', 'AVAXC', 'avaxc'],
      'c-chain': ['AVALANCHEC', 'avalanchec', 'AVAXC', 'avaxc'],
      xchain: ['AVALANCHEX', 'avalanchex', 'AVAXX', 'avaxx'],
      'x-chain': ['AVALANCHEX', 'avalanchex', 'AVAXX', 'avaxx'],
      avax: ['AVALANCHEX', 'avalanchex', 'AVAXX', 'avaxx'],
      btc: ['BTC', 'bitcoin'],
      sol: ['SOL', 'solana'],
      tao: ['BITTENSOR', 'bittensor', 'TAO', 'tao'],
      near: ['NEAR', 'near'],
      xrp: ['XRP', 'xrp'],
    };

    for (const key of aliases[net] || [net.toUpperCase(), net]) {
      const value = this.addresses[key];
      if (value?.trim()) return value.trim();
    }

    if (
      ['eth', 'arbitrum', 'base', 'op', 'optimism', 'matic', 'polygon', 'bsc', 'avaxc', 'avalanchec', 'cchain', 'c-chain', 'linea', 'zksync'].includes(net)
    ) {
      return this.baseEvmAddress;
    }

    return '';
  }
}

export const defaultAddressProvider = new AurelisWalletAddressProvider();

/**
 * Layer A/B Client Adapter
 * Consumes AURELIS server-side endpoints:
 * - GET /api/exchange/currencies
 * - POST /api/exchange/quote
 * - POST /api/exchange/create
 * - GET /api/exchange/status/:exchangeId
 */
export async function getCurrencies(): Promise<ExchangeAsset[]> {
  try {
    const res = await fetch('/api/exchange/currencies');
    const data = await res.json();
    if (data.ok && Array.isArray(data.catalog)) {
      return data.catalog;
    }
    return CANONICAL_ASSETS;
  } catch {
    return CANONICAL_ASSETS;
  }
}

export async function getQuote(
  fromAsset: { currency: string; network?: string },
  toAsset: { currency: string; network?: string },
  amount: string | number
): Promise<QuoteResult> {
  const res = await fetch('/api/exchange/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fromAsset,
      toAsset,
      amount: String(amount),
    }),
  });

  const data = await res.json();
  return data;
}

export async function createExchange(
  params: CreateExchangeRequest
): Promise<NormalizedExchangeSuccess | { ok: false; message: string; code?: string }> {
  const res = await fetch('/api/exchange/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await res.json();
  return data;
}

export async function getExchangeStatus(
  exchangeId: string
): Promise<NormalizedExchangeStatus> {
  const res = await fetch(`/api/exchange/status/${encodeURIComponent(exchangeId)}`);
  const data = await res.json();
  return data;
}

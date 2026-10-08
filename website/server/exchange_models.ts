export interface ExchangeAsset {
  symbol: string;
  name: string;
  changenowCurrency: string;
  changenowNetwork: string;
  chainId?: string | number;
  internalChain?: string;
  logoURI?: string;
  enabled: boolean;
  supportsMemo: boolean;
}

export interface QuoteRequest {
  fromAsset: {
    currency: string;
    network?: string;
  };
  toAsset: {
    currency: string;
    network?: string;
  };
  amount: string | number;
}

export interface NormalizedQuoteSuccess {
  ok: true;
  fromAmount: string;
  toAmount: string;
  fromCurrency: string;
  toCurrency: string;
  fromNetwork: string;
  toNetwork: string;
  minimumAmount: string;
  rateId: string;
  flow: 'standard' | 'fixed-rate';
  expiresAt: null | string;
  rawProvider: 'ChangeNOW';
}

export interface NormalizedQuoteError {
  ok: false;
  code:
    | 'UNSUPPORTED_ASSET'
    | 'UNSUPPORTED_NETWORK'
    | 'PAIR_UNAVAILABLE'
    | 'BELOW_MINIMUM'
    | 'QUOTE_FAILED'
    | 'INVALID_ADDRESS'
    | 'PROVIDER_UNAVAILABLE'
    | 'EXCHANGE_CREATE_FAILED'
    | 'EXCHANGE_NOT_FOUND'
    | 'ACTION_REQUIRED';
  minimumAmount?: string;
  message: string;
  details?: any;
}

export type QuoteResult = NormalizedQuoteSuccess | NormalizedQuoteError;

export interface CreateExchangeRequest {
  fromAsset: {
    currency: string;
    network?: string;
  };
  toAsset: {
    currency: string;
    network?: string;
  };
  amount: string | number;
  destinationAddress: string;
  destinationExtraId?: string;
  refundAddress?: string;
  refundExtraId?: string;
  rateId?: string;
}

export interface NormalizedExchangeSuccess {
  ok: true;
  exchangeId: string;
  provider: 'ChangeNOW';
  fromCurrency: string;
  toCurrency: string;
  fromNetwork: string;
  toNetwork: string;
  fromAmount: string;
  expectedToAmount: string;
  depositAddress: string;
  depositExtraId: string;
  destinationAddress: string;
  refundAddress: string;
  status:
    | 'waiting'
    | 'confirming'
    | 'exchanging'
    | 'sending'
    | 'finished'
    | 'failed'
    | 'refunded'
    | 'action_required'
    | 'unknown'
    | 'new';
  rawStatus?: string;
}

export interface NormalizedExchangeStatus {
  ok: boolean;
  exchangeId: string;
  status:
    | 'waiting'
    | 'confirming'
    | 'exchanging'
    | 'sending'
    | 'finished'
    | 'failed'
    | 'refunded'
    | 'action_required'
    | 'unknown';
  providerStatus: string;
  payinHash: string | null;
  payoutHash: string | null;
  fromAmount: string;
  toAmount: string;
  error?: string;
}

// Canonical asset definitions for AURELIS wallet
export const CANONICAL_ASSETS: ExchangeAsset[] = [
  {
    symbol: 'BTC',
    name: 'Bitcoin',
    changenowCurrency: 'btc',
    changenowNetwork: 'btc',
    chainId: 'btc',
    internalChain: 'bitcoin',
    logoURI: 'https://content-api.changenow.io/uploads/btc_1_527dc9ec3c.svg',
    enabled: true,
    supportsMemo: false,
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    changenowCurrency: 'eth',
    changenowNetwork: 'eth',
    chainId: '1',
    internalChain: 'ethereum',
    logoURI: 'https://content-api.changenow.io/uploads/eth_f4ebb54ec0.svg',
    enabled: true,
    supportsMemo: false,
  },
  {
    symbol: 'SOL',
    name: 'Solana',
    changenowCurrency: 'sol',
    changenowNetwork: 'sol',
    chainId: 'solana',
    internalChain: 'solana',
    logoURI: 'https://content-api.changenow.io/uploads/sol_88ceb9c78f.svg',
    enabled: true,
    supportsMemo: false,
  },
  {
    symbol: 'TAO',
    name: 'Bittensor',
    changenowCurrency: 'tao',
    changenowNetwork: 'tao',
    chainId: 'bittensor',
    internalChain: 'bittensor',
    logoURI: 'https://content-api.changenow.io/uploads/tao_61c0c66042.svg',
    enabled: true,
    supportsMemo: false,
  },
  {
    symbol: 'NEAR',
    name: 'NEAR Protocol',
    changenowCurrency: 'near',
    changenowNetwork: 'near',
    chainId: 'near',
    internalChain: 'near',
    logoURI: 'https://content-api.changenow.io/uploads/near_62e622f9db.svg',
    enabled: true,
    supportsMemo: false,
  },
  {
    symbol: 'USDC',
    name: 'USD Coin (Ethereum)',
    changenowCurrency: 'usdc',
    changenowNetwork: 'eth',
    chainId: '1',
    internalChain: 'ethereum',
    logoURI: 'https://content-api.changenow.io/uploads/usd_coin_e5aa76326e.svg',
    enabled: true,
    supportsMemo: false,
  },
  {
    symbol: 'USDC',
    name: 'USD Coin (Arbitrum)',
    changenowCurrency: 'usdc',
    changenowNetwork: 'arbitrum',
    chainId: '42161',
    internalChain: 'arbitrum',
    logoURI: 'https://content-api.changenow.io/uploads/usd_coin_e5aa76326e.svg',
    enabled: true,
    supportsMemo: false,
  },
  {
    symbol: 'USDC',
    name: 'USD Coin (Base)',
    changenowCurrency: 'usdc',
    changenowNetwork: 'base',
    chainId: '8453',
    internalChain: 'base',
    logoURI: 'https://content-api.changenow.io/uploads/usd_coin_e5aa76326e.svg',
    enabled: true,
    supportsMemo: false,
  },
  {
    symbol: 'USDC',
    name: 'USD Coin (Solana)',
    changenowCurrency: 'usdc',
    changenowNetwork: 'sol',
    chainId: 'solana',
    internalChain: 'solana',
    logoURI: 'https://content-api.changenow.io/uploads/usd_coin_e5aa76326e.svg',
    enabled: true,
    supportsMemo: false,
  },
  {
    symbol: 'XRP',
    name: 'Ripple',
    changenowCurrency: 'xrp',
    changenowNetwork: 'xrp',
    chainId: 'xrp',
    internalChain: 'ripple',
    logoURI: 'https://content-api.changenow.io/uploads/xrp_3f5b722d32.svg',
    enabled: true,
    supportsMemo: true,
  },
];

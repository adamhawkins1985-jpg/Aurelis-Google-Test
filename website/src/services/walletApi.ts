import {
  getAurelisWalletProvider,
  type WalletAddressMap,
  type WalletPortfolioAsset,
} from './walletProvider';

export type { WalletAddressMap, WalletPortfolioAsset } from './walletProvider';
export {
  getAurelisWalletProvider,
  setAurelisWalletProvider,
  type AurelisWalletProvider,
} from './walletProvider';

export async function getNativeWalletAddresses(): Promise<WalletAddressMap> {
  return getAurelisWalletProvider().getAddresses();
}

export async function getLatestWalletPortfolio(): Promise<WalletPortfolioAsset[]> {
  return getAurelisWalletProvider().getPortfolio();
}

export type WalletReceiveOption = {
  key: string;
  label: string;
  address: string;
};

const DIRECT_NETWORK_LABELS: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  ETHEREUM: 'Ethereum',
  ARBITRUM: 'Arbitrum',
  BASE: 'Base',
  SOL: 'Solana',
  SOLANA: 'Solana',
  NEAR: 'NEAR',
  BITTENSOR: 'TAO / Bittensor',
  TAO: 'TAO / Bittensor',
  XRP: 'XRP',
  BSC: 'BNB Smart Chain',
  BNB: 'BNB Smart Chain',
  POLYGON: 'Polygon',
  MATIC: 'Polygon',
  AVAX: 'Avalanche C-Chain',
  AVALANCHE: 'Avalanche C-Chain',
  OPTIMISM: 'Optimism',
  LTC: 'Litecoin',
  DOGE: 'Dogecoin',
  CARDANO: 'Cardano',
  ADA: 'Cardano',
  SUI: 'Sui',
  TRON: 'Tron',
  TRX: 'Tron',
  STELLAR: 'Stellar',
  XLM: 'Stellar',
  ZCASH: 'Zcash',
  ZEC: 'Zcash',
  POLKADOT: 'Polkadot',
  DOT: 'Polkadot',
  TON: 'TON',
  APTOS: 'Aptos',
  ALGORAND: 'Algorand',
  ALGO: 'Algorand',
  INJECTIVE: 'Injective',
  INJ: 'Injective',
  GAIA: 'Cosmos Hub',
  COSMOS: 'Cosmos Hub',
  ATOM: 'Cosmos Hub',
};

const EVM_CHAIN_LABELS: Record<string, string> = {
  '1': 'Ethereum',
  '10': 'Optimism',
  '56': 'BNB Smart Chain',
  '100': 'Gnosis Chain',
  '137': 'Polygon',
  '250': 'Fantom',
  '324': 'zkSync Era',
  '8453': 'Base',
  '42161': 'Arbitrum',
  '43114': 'Avalanche C-Chain',
  '59144': 'Linea',
  '534352': 'Scroll',
};

const PREFERRED_RECEIVE_KEYS = [
  'BTC',
  'btc--0',
  'ETH',
  'ethereum',
  'evm--1',
  'ARBITRUM',
  'arbitrum',
  'evm--42161',
  'BASE',
  'base',
  'evm--8453',
  'SOL',
  'solana',
  'NEAR',
  'BITTENSOR',
  'XRP',
  'BSC',
  'evm--56',
  'POLYGON',
  'evm--137',
  'AVAX',
  'evm--43114',
  'OPTIMISM',
  'evm--10',
  'LTC',
  'DOGE',
  'CARDANO',
  'SUI',
  'TRON',
  'STELLAR',
  'ZCASH',
  'POLKADOT',
  'TON',
  'APTOS',
  'ALGORAND',
  'INJECTIVE',
  'GAIA',
];

function preferredReceiveOrder(key: string): number {
  const direct = PREFERRED_RECEIVE_KEYS.indexOf(key);
  if (direct >= 0) return direct;
  const lower = key.toLowerCase();
  const lowerIndex = PREFERRED_RECEIVE_KEYS.findIndex(
    (item) => item.toLowerCase() === lower
  );
  return lowerIndex >= 0 ? lowerIndex : Number.MAX_SAFE_INTEGER;
}

function prettifyNetworkKey(key: string): string {
  return key
    .replace(/--/g, ' ')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
    .trim();
}

export function labelWalletNetwork(key: string): string {
  const normalized = String(key || '').trim();
  const upper = normalized.toUpperCase();
  if (DIRECT_NETWORK_LABELS[upper]) return DIRECT_NETWORK_LABELS[upper];

  const lower = normalized.toLowerCase();
  if (DIRECT_NETWORK_LABELS[lower.toUpperCase()]) {
    return DIRECT_NETWORK_LABELS[lower.toUpperCase()];
  }

  const evmMatch = lower.match(/^evm--(\d+)$/);
  if (evmMatch) {
    return EVM_CHAIN_LABELS[evmMatch[1]] || `EVM Chain ${evmMatch[1]}`;
  }

  if (lower.startsWith('btc')) return 'Bitcoin';
  if (lower.startsWith('sol')) return 'Solana';
  if (lower.startsWith('near')) return 'NEAR';
  if (lower.startsWith('xrp')) return 'XRP';
  if (lower.startsWith('ltc')) return 'Litecoin';
  if (lower.startsWith('doge')) return 'Dogecoin';
  if (lower.startsWith('ada') || lower.startsWith('cardano')) return 'Cardano';
  if (lower.startsWith('sui')) return 'Sui';
  if (lower.startsWith('trx') || lower.startsWith('tron')) return 'Tron';
  if (lower.startsWith('xlm') || lower.startsWith('stellar')) return 'Stellar';
  if (lower.startsWith('zec') || lower.startsWith('zcash')) return 'Zcash';
  if (lower.startsWith('dot') || lower.startsWith('polkadot')) return 'Polkadot';
  if (lower.startsWith('ton')) return 'TON';
  if (lower.startsWith('aptos') || lower.startsWith('apt')) return 'Aptos';
  if (lower.startsWith('algo')) return 'Algorand';
  if (lower.startsWith('inj') || lower.startsWith('injective')) return 'Injective';
  if (lower.startsWith('cosmos') || lower.startsWith('gaia') || lower.startsWith('atom')) {
    return 'Cosmos Hub';
  }
  if (lower.includes('bittensor') || lower.includes('tao')) return 'TAO / Bittensor';

  return prettifyNetworkKey(normalized || 'Wallet Network');
}

export function getWalletReceiveOptions(
  addresses: WalletAddressMap,
  fallbackAddress = ''
): WalletReceiveOption[] {
  const rows = Object.entries(addresses || {})
    .map(([key, address]) => ({
      key: String(key),
      label: labelWalletNetwork(String(key)),
      address: String(address || '').trim(),
    }))
    .filter((item) => item.key && item.address);

  if (!rows.length && fallbackAddress) {
    rows.push({ key: 'ETH', label: 'Ethereum / EVM', address: fallbackAddress });
  }

  return rows.sort((a, b) => {
    const orderA = preferredReceiveOrder(a.key);
    const orderB = preferredReceiveOrder(b.key);
    if (orderA !== orderB) return orderA - orderB;
    return a.label.localeCompare(b.label);
  });
}

export function firstEvmAddress(addresses: WalletAddressMap): string {
  return (
    addresses.ETH ||
    addresses.ethereum ||
    addresses['evm--1'] ||
    addresses.ARBITRUM ||
    addresses.arbitrum ||
    addresses['evm--42161'] ||
    addresses.BASE ||
    addresses.base ||
    addresses['evm--8453'] ||
    Object.entries(addresses).find(([key]) => key.toLowerCase().startsWith('evm--'))?.[1] ||
    ''
  );
}

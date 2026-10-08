export type WalletAddressMap = Record<string, string>;

export interface WalletPortfolioAsset {
  symbol: string;
  name: string;
  amount: number;
  chain?: string;
  assetId?: string;
  priceUsd?: number;
  change24h?: number;
  accountAddress?: string;
  walletName?: string;
  walletProfileId?: string;
  walletCanSign?: boolean;
}

export interface AurelisWalletProvider {
  readonly id: string;
  getAddresses(): Promise<WalletAddressMap>;
  getPortfolio(): Promise<WalletPortfolioAsset[]>;
}

type AurelisWalletEngineBridge = {
  id?: string;
  getAddresses?: () => unknown | Promise<unknown>;
  getPortfolio?: () => unknown | Promise<unknown>;
};

interface NativeAddressesResponse {
  ok: boolean;
  addresses: WalletAddressMap;
  updatedAt?: number;
  source?: string;
  error?: string;
}

function normalizePortfolio(items: unknown[]): WalletPortfolioAsset[] {
  return items
    .map((raw: any) => ({
      symbol: String(raw?.symbol || '').toUpperCase(),
      name: String(raw?.name || raw?.symbol || ''),
      amount: Number(raw?.amount ?? raw?.balance ?? 0),
      chain: String(raw?.chain || raw?.network || raw?.networkId || ''),
      assetId: String(raw?.assetId || raw?.id || ''),
      priceUsd: Number(raw?.priceUsd ?? raw?.price ?? 0),
      change24h: Number(raw?.change24h ?? 0),
      accountAddress: String(raw?.accountAddress || raw?.address || ''),
      walletName: String(raw?.walletName || raw?.profileName || ''),
      walletProfileId: String(raw?.walletProfileId || raw?.profileId || ''),
      walletCanSign: Boolean(raw?.walletCanSign || false),
    }))
    .filter((item: WalletPortfolioAsset) =>
      item.symbol && Number.isFinite(item.amount) && item.amount > 0
    );
}

function parseMaybeJson(value: unknown): any {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

// Agent Money belongs exclusively to Bots. Never include it in the main portfolio.
const BOT_ONLY_ADDRESS = '0xd2919c82e5fecbb0c4be7a7c37bfc066579f233e';
const isBotOnlyAddress = (value: string) => String(value || '').trim().toLowerCase() === BOT_ONLY_ADDRESS;

function getSavedExternalWalletAddress(): string {
  if (typeof window === 'undefined') return '';
  try {
    const connected = localStorage.getItem('aurelis_wallet_connected') === 'true';
    const provider = String(localStorage.getItem('aurelis_wallet_provider') || '').toLowerCase();
    const address = String(localStorage.getItem('aurelis_wallet_address') || '').trim();
    const looksExternal = !provider || !provider.includes('aurelis');
    return connected && looksExternal && /^0x[a-fA-F0-9]{40}$/.test(address) && !isBotOnlyAddress(address) ? address : '';
  } catch {
    return '';
  }
}

function getSavedWatchAddresses(): Record<string, string[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem('aurelis_watch_addresses');
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string[]> = {};
    for (const [chain, value] of Object.entries(parsed)) {
      const list = Array.isArray(value) ? value : [value];
      out[String(chain).toLowerCase()] = Array.from(new Set(list.map((item) => String(item || '').trim()).filter(item => item && !isBotOnlyAddress(item))));
    }
    return out;
  } catch {
    return {};
  }
}


type SavedWalletProfile = {
  id: string;
  name: string;
  provider?: string;
  addresses: Record<string, string>;
};

const EMPTY_EVM_ADDRESS = '0x0000000000000000000000000000000000000000';

const WATCH_CHAIN_ALIASES: Record<string, string> = {
  eth: 'evm', ethereum: 'evm', evm: 'evm', eip155: 'evm', address: 'evm',
  bitcoin: 'btc', btc: 'btc',
  litecoin: 'ltc', ltc: 'ltc',
  dogecoin: 'doge', doge: 'doge',
  zcash: 'zec', zec: 'zec',
  solana: 'sol', sol: 'sol',
  ripple: 'xrp', xrp: 'xrp',
  near: 'near',
};

function normalizeWatchChain(raw: string): string {
  const cleaned = String(raw || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return WATCH_CHAIN_ALIASES[cleaned] || cleaned;
}

function isEvmAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());
}

function normalizeProfileAddresses(value: unknown): Record<string, string> {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = normalizeWatchChain(rawKey);
    const address = String(rawValue || '').trim();
    if (!key || !address) continue;
    if (/seed|mnemonic|private/i.test(key) || /seed phrase|private key|mnemonic/i.test(address)) continue;
    if (isBotOnlyAddress(address)) continue;
    out[key] = address;
  }
  return out;
}

function getSavedWalletProfiles(): SavedWalletProfile[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('aurelis_wallet_profiles');
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    return list
      .map((profile: any, index: number): SavedWalletProfile | null => {
        const addresses = normalizeProfileAddresses(profile?.addresses || {});
        if (!Object.keys(addresses).length) return null;
        const name = String(profile?.name || profile?.provider || `Wallet ${index + 1}`).trim() || `Wallet ${index + 1}`;
        const id = String(profile?.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || `wallet-${index + 1}`);
        return { id, name, provider: String(profile?.provider || name), addresses };
      })
      .filter(Boolean) as SavedWalletProfile[];
  } catch {
    return [];
  }
}

function appendWatchParams(params: URLSearchParams, addresses: Record<string, string[]> | Record<string, string>): void {
  for (const [rawChain, rawValue] of Object.entries(addresses || {})) {
    const chain = normalizeWatchChain(rawChain);
    const list = Array.isArray(rawValue) ? rawValue : [rawValue];
    if (!chain || chain === 'evm') continue;
    for (const watchAddress of list) {
      const value = String(watchAddress || '').trim();
      if (value) params.append(chain, value);
    }
  }
}

async function fetchExternalPortfolioRequest(params: URLSearchParams, walletName?: string, walletProfileId?: string, walletCanSign = false): Promise<WalletPortfolioAsset[]> {
  const res = await fetch(`/api/wallet/external-evm-portfolio?${params.toString()}`, { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok || !Array.isArray(data.assets)) {
    throw new Error(data?.error || 'External wallet portfolio unavailable');
  }
  const label = String(walletName || '').trim();
  const assets = data.assets.map((item: any) => ({
    ...item,
    walletName: label,
    walletProfileId: walletProfileId || '',
    walletCanSign,
    assetId: `${walletProfileId || 'wallet'}_${item?.assetId || item?.symbol || item?.chain || 'asset'}`,
    name: label ? `${label} • ${item?.name || item?.symbol || 'Asset'}` : (item?.name || item?.symbol || 'Asset'),
  }));
  return normalizePortfolio(assets);
}

async function fetchExternalEvmPortfolio(address: string): Promise<WalletPortfolioAsset[]> {
  const calls: Promise<WalletPortfolioAsset[]>[] = [];
  const primary = String(address || '').trim();
  const legacyWatch = getSavedWatchAddresses();
  const profiles = getSavedWalletProfiles();

  if (isEvmAddress(primary) || Object.keys(legacyWatch).length) {
    const canSign = isEvmAddress(primary);
    const params = new URLSearchParams({ address: canSign ? primary : EMPTY_EVM_ADDRESS });
    if (!canSign) params.set('skipEvm', '1');
    appendWatchParams(params, legacyWatch);
    calls.push(fetchExternalPortfolioRequest(params, canSign ? 'Connected Wallet' : 'Watch Assets', 'connected', canSign));
  }

  for (const profile of profiles) {
    const evm = profile.addresses.evm || profile.addresses.ethereum || profile.addresses.eth || '';
    const canSign = isEvmAddress(evm);
    const params = new URLSearchParams({ address: canSign ? evm : EMPTY_EVM_ADDRESS });
    if (!canSign) params.set('skipEvm', '1');
    appendWatchParams(params, profile.addresses);
    calls.push(fetchExternalPortfolioRequest(params, profile.name, profile.id, canSign));
  }

  if (!calls.length) return [];
  const settled = await Promise.allSettled(calls);
  return settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
}

function getInjectedBridge(): AurelisWalletEngineBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  const bridge = (window as any).AurelisWalletEngine as AurelisWalletEngineBridge | undefined;
  if (!bridge || typeof bridge !== 'object') return undefined;
  if (typeof bridge.getAddresses !== 'function' || typeof bridge.getPortfolio !== 'function') {
    return undefined;
  }
  return bridge;
}

type AurelisHostedWalletSnapshot = {
  engine?: string;
  addresses?: WalletAddressMap;
  assets?: unknown[];
};

function installHostedWalletSnapshot(snapshot: AurelisHostedWalletSnapshot): void {
  if (typeof window === 'undefined') return;
  const addresses =
    snapshot?.addresses && typeof snapshot.addresses === 'object'
      ? snapshot.addresses
      : {};
  const assets = Array.isArray(snapshot?.assets) ? snapshot.assets : [];
  const bridge: AurelisWalletEngineBridge = {
    id: String(snapshot?.engine || 'onekey-hosted'),
    getAddresses: async () => addresses,
    getPortfolio: async () => assets,
  };
  (window as any).AurelisWalletEngine = bridge;
  window.dispatchEvent(
    new CustomEvent('aurelis:wallet-engine-ready', {
      detail: { engine: bridge.id },
    })
  );
  window.dispatchEvent(new Event('aurelis:wallet-refresh'));
}

function installHostedWalletTransport(): void {
  if (typeof window === 'undefined') return;
  (window as any).__AURELIS_INSTALL_WALLET_SNAPSHOT__ =
    installHostedWalletSnapshot;

  const hostMode = (() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('walletHost') === 'onekey' || params.get('desktop') === '1';
  })();
  if (!hostMode || window.parent === window) return;

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window.parent) return;
    const message = parseMaybeJson(event.data);
    if (
      message?.source !== 'aurelis-wallet-host' ||
      message?.type !== 'snapshot'
    ) {
      return;
    }
    installHostedWalletSnapshot(message.payload || {});
  });
}

installHostedWalletTransport();

class AurelisServerWalletProvider implements AurelisWalletProvider {
  readonly id = 'aurelis-server';

  async getAddresses(): Promise<WalletAddressMap> {
    const externalAddress = getSavedExternalWalletAddress();
    const watch = getSavedWatchAddresses();
    const profiles = getSavedWalletProfiles();
    if (externalAddress || Object.keys(watch).length || profiles.length) {
      const addresses: WalletAddressMap = {};
      const put = (key: string, value: string) => {
        if (key && value && !isBotOnlyAddress(value) && !addresses[key]) addresses[key] = value;
      };
      if (externalAddress) {
        for (const key of ['ETH','ethereum','evm--1','BASE','base','evm--8453','ARBITRUM','arbitrum','evm--42161','OPTIMISM','optimism','evm--10','BSC','bsc','evm--56','POLYGON','polygon','evm--137','AVAX','avalanche','evm--43114']) {
          put(key, externalAddress);
        }
      }
      for (const [chain, list] of Object.entries(watch)) {
        const value = list[0];
        put(chain.toUpperCase(), value);
        put(chain, value);
      }
      for (const profile of profiles) {
        for (const [chain, value] of Object.entries(profile.addresses)) {
          put(`${profile.id}:${chain}`, value);
          put(`${profile.name}:${chain}`, value);
          put(chain.toUpperCase(), value);
          put(chain, value);
        }
      }
      return addresses;
    }

    const res = await fetch('/api/wallet/native-addresses', { cache: 'no-store' });
    const data: NativeAddressesResponse = await res.json();
    if (!res.ok || !data?.ok || !data.addresses) {
      throw new Error(data?.error || 'AURELIS wallet addresses unavailable');
    }
    return Object.fromEntries(Object.entries(data.addresses).filter(([,value]) => !isBotOnlyAddress(String(value)))) as WalletAddressMap;
  }

  async getPortfolio(): Promise<WalletPortfolioAsset[]> {
    const externalAddress = getSavedExternalWalletAddress();
    const hasWatchProfiles = Object.keys(getSavedWatchAddresses()).length > 0 || getSavedWalletProfiles().length > 0;
    if (externalAddress || hasWatchProfiles) {
      return fetchExternalEvmPortfolio(externalAddress || EMPTY_EVM_ADDRESS);
    }

    const res = await fetch('/api/wallet/portfolio-latest', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data?.ok || !Array.isArray(data.assets)) {
      throw new Error(data?.error || 'AURELIS wallet portfolio unavailable');
    }
    return normalizePortfolio(data.assets).filter(item => !isBotOnlyAddress(item.accountAddress || ''));
  }
}

class AurelisInjectedWalletProvider implements AurelisWalletProvider {
  get id(): string {
    return getInjectedBridge()?.id || 'aurelis-injected';
  }

  private bridge(): AurelisWalletEngineBridge {
    const bridge = getInjectedBridge();
    if (!bridge) throw new Error('AURELIS injected wallet engine unavailable');
    return bridge;
  }

  async getAddresses(): Promise<WalletAddressMap> {
    const payload = parseMaybeJson(await this.bridge().getAddresses?.());
    const addresses = payload?.addresses ?? payload;
    if (!addresses || typeof addresses !== 'object' || Array.isArray(addresses)) {
      throw new Error('AURELIS injected wallet addresses invalid');
    }
    return Object.fromEntries(
      Object.entries(addresses)
        .map(([chain, address]) => [String(chain), String(address || '')])
        .filter(([, address]) => address)
    );
  }

  async getPortfolio(): Promise<WalletPortfolioAsset[]> {
    const payload = parseMaybeJson(await this.bridge().getPortfolio?.());
    const assets = Array.isArray(payload) ? payload : payload?.assets;
    if (!Array.isArray(assets)) {
      throw new Error('AURELIS injected wallet portfolio invalid');
    }
    return normalizePortfolio(assets);
  }
}

class AurelisAutoWalletProvider implements AurelisWalletProvider {
  readonly id = 'aurelis-auto';
  private readonly server = new AurelisServerWalletProvider();
  private readonly injected = new AurelisInjectedWalletProvider();

  async getAddresses(): Promise<WalletAddressMap> {
    if (!getInjectedBridge()) return this.server.getAddresses();
    try {
      return await this.injected.getAddresses();
    } catch (error) {
      console.warn('[AURELIS] injected wallet address provider failed; using server fallback', error);
      return this.server.getAddresses();
    }
  }

  async getPortfolio(): Promise<WalletPortfolioAsset[]> {
    if (!getInjectedBridge()) return this.server.getPortfolio();
    try {
      return await this.injected.getPortfolio();
    } catch (error) {
      console.warn('[AURELIS] injected wallet portfolio provider failed; using server fallback', error);
      return this.server.getPortfolio();
    }
  }
}

let activeWalletProvider: AurelisWalletProvider = new AurelisAutoWalletProvider();

export function setAurelisWalletProvider(provider: AurelisWalletProvider): void {
  activeWalletProvider = provider;
}

export function getAurelisWalletProvider(): AurelisWalletProvider {
  return activeWalletProvider;
}

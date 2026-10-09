import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  ExchangeAsset,
  CANONICAL_ASSETS,
  NormalizedQuoteSuccess,
  NormalizedExchangeSuccess,
  NormalizedExchangeStatus,
  AurelisWalletAddressProvider,
  getCurrencies,
  getQuote,
  createExchange,
  getExchangeStatus,
} from '../../services/exchangeApi';
import { CoinIcon } from '../CoinIcon';
import { NetworkIcon, getNetworkDisplayName } from '../NetworkIcon';
import {
  ChevronDown,
  Search,
  X,
  ArrowUpDown,
  Check,
  Copy,
  AlertTriangle,
  Send,
  RefreshCw,
} from 'lucide-react';
import { playHudSound } from '../../services/marketData';
import { getNativeWalletAddresses, WalletAddressMap } from '../../services/walletApi';
import { sendWalletConnectErc20Transfer } from '../../services/walletConnectService';
import type { CoinData, WalletHolding } from '../../types';

interface DemoExchangeViewProps {
  mode?: 'buy' | 'sell' | 'trade';
  walletAddress?: string;
  soundEnabled?: boolean;
  marketCoins?: CoinData[];
  holdings?: WalletHolding[];
  initialAssetSymbol?: string;
  initialFromSymbol?: string;
  initialToSymbol?: string;
  initialFromNetwork?: string;
  initialToNetwork?: string;
  initialAmount?: string;
  forceChangeNow?: boolean;
  onOpenWalletSend?: (prefill: { symbol: string; network: string; recipient: string; amount: string; memo?: string }) => void;
  aiLegNumber?: number;
  aiLegTotal?: number;
  onNextAiLeg?: () => void;
}

interface NativeGemQuote {
  ok: boolean;
  fromSymbol?: string;
  toSymbol?: string;
  fromNetwork?: string;
  toNetwork?: string;
  fromAmount?: string;
  fromAssetId?: string;
  toAssetId?: string;
  toAmount?: string;
  provider?: string;
  providerId?: string;
  slippageBps?: number;
  quoteCount?: number;
  error?: string;
}

export const DemoExchangeView: React.FC<DemoExchangeViewProps> = ({
  mode = 'trade',
  walletAddress,
  soundEnabled = false,
  marketCoins = [],
  holdings = [],
  initialAssetSymbol,
  initialFromSymbol,
  initialToSymbol,
  initialFromNetwork,
  initialToNetwork,
  initialAmount,
  forceChangeNow = false,
  onOpenWalletSend,
  aiLegNumber,
  aiLegTotal,
  onNextAiLeg,
}) => {
  // Catalog
  const [catalog, setCatalog] = useState<ExchangeAsset[]>(CANONICAL_ASSETS);
  const [loadingCatalog, setLoadingCatalog] = useState<boolean>(false);

  const [walletAddresses, setWalletAddresses] = useState<WalletAddressMap>({});
  const [walletAddressError, setWalletAddressError] = useState<string | null>(null);

  // Address provider instance: real AURELIS native addresses only.
  const addressProvider = useMemo(() => {
    return new AurelisWalletAddressProvider(walletAddresses, walletAddress);
  }, [walletAddresses, walletAddress]);

  // Form selections
  const [fromSymbol, setFromSymbol] = useState<string>('BTC');
  const [fromNetwork, setFromNetwork] = useState<string>('btc');
  const [toSymbol, setToSymbol] = useState<string>('ETH');
  const [toNetwork, setToNetwork] = useState<string>('eth');
  const [amount, setAmount] = useState<string>('0.05');

  useEffect(() => {
    const stable = catalog.find((a) => ['USDC', 'USDT'].includes(a.symbol.toUpperCase())) || null;
    const preferred = (initialAssetSymbol || '').toUpperCase();
    const held = holdings.find((h) => Number(h.amount) > 0 && !['USDC', 'USDT'].includes(h.symbol.toUpperCase()));
    const targetSymbol = preferred || held?.symbol?.toUpperCase() || 'ETH';
    const target = catalog.find((a) => a.symbol.toUpperCase() === targetSymbol) || catalog.find((a) => a.symbol.toUpperCase() === 'ETH');
    if (!target) return;

    if (initialFromSymbol && initialToSymbol) {
      const fromSym = initialFromSymbol.toUpperCase();
      const toSym = initialToSymbol.toUpperCase();
      const fromCandidate =
        catalog.find((a) => a.symbol.toUpperCase() === fromSym && (!initialFromNetwork || a.changenowNetwork.toLowerCase() === initialFromNetwork.toLowerCase())) ||
        catalog.find((a) => a.symbol.toUpperCase() === fromSym);
      const toCandidate =
        catalog.find((a) => a.symbol.toUpperCase() === toSym && initialToNetwork && a.changenowNetwork.toLowerCase() === initialToNetwork.toLowerCase()) ||
        catalog.find((a) => a.symbol.toUpperCase() === toSym && initialFromNetwork && a.changenowNetwork.toLowerCase() === initialFromNetwork.toLowerCase()) ||
        catalog.find((a) => a.symbol.toUpperCase() === toSym);
      if (fromCandidate && toCandidate) {
        setFromSymbol(fromCandidate.symbol.toUpperCase());
        setFromNetwork(fromCandidate.changenowNetwork);
        setToSymbol(toCandidate.symbol.toUpperCase());
        setToNetwork(toCandidate.changenowNetwork);
        if (initialAmount) setAmount(initialAmount);
      }
    } else if (mode === 'buy' && stable) {
      setFromSymbol(stable.symbol.toUpperCase());
      setFromNetwork(stable.changenowNetwork);
      setToSymbol(target.symbol.toUpperCase());
      setToNetwork(target.changenowNetwork);
      setAmount('10');
    } else if (mode === 'sell' && stable) {
      setFromSymbol(target.symbol.toUpperCase());
      setFromNetwork(target.changenowNetwork);
      setToSymbol(stable.symbol.toUpperCase());
      setToNetwork(stable.changenowNetwork);
      const bal = holdings.find((h) => h.symbol.toUpperCase() === target.symbol.toUpperCase())?.amount;
      if (bal && bal > 0) setAmount(String(Math.min(bal, bal)));
    }
    setQuote(null);
    setGemQuote(null);
    setQuoteError(null);
  }, [mode, initialAssetSymbol, initialFromSymbol, initialToSymbol, initialFromNetwork, initialToNetwork, initialAmount, catalog.length]);

  // Modal selector states
  const [pickerTarget, setPickerTarget] = useState<'from' | 'to' | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [pickerViewport, setPickerViewport] = useState(() => ({
    top: window.visualViewport?.offsetTop || 0,
    height: window.visualViewport?.height || window.innerHeight,
  }));

  // Quote State
  const [isQuoting, setIsQuoting] = useState<boolean>(false);
  const [quote, setQuote] = useState<NormalizedQuoteSuccess | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [minimumAmount, setMinimumAmount] = useState<string | null>(null);
  const [gemQuote, setGemQuote] = useState<NativeGemQuote | null>(null);
  const [isGemQuoting, setIsGemQuoting] = useState<boolean>(false);

  // Exchange Order State
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [exchangeOrder, setExchangeOrder] = useState<NormalizedExchangeSuccess | null>(null);

  // Status Tracking
  const [orderStatus, setOrderStatus] = useState<NormalizedExchangeStatus | null>(null);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [walletSendMessage, setWalletSendMessage] = useState<string | null>(null);
  const [isSendingDeposit, setIsSendingDeposit] = useState(false);
  const [depositTxHash, setDepositTxHash] = useState<string | null>(null);

  useEffect(() => {
    if (!pickerTarget) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const vv = window.visualViewport;
    const updateViewport = () => {
      setPickerViewport({
        top: vv?.offsetTop || 0,
        height: vv?.height || window.innerHeight,
      });
    };
    updateViewport();
    vv?.addEventListener('resize', updateViewport);
    vv?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    return () => {
      document.body.style.overflow = previousOverflow;
      vv?.removeEventListener('resize', updateViewport);
      vv?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
    };
  }, [pickerTarget]);

  useEffect(() => {
    let mounted = true;
    const nativeSnapshot = (window as any).__aurelisNativeWalletSnapshot;
    if (nativeSnapshot?.addresses && typeof nativeSnapshot.addresses === 'object') {
      setWalletAddresses(nativeSnapshot.addresses);
    }
    getNativeWalletAddresses()
      .then((addresses) => {
        if (mounted) {
          setWalletAddresses((current) => ({ ...addresses, ...current }));
          setWalletAddressError(null);
        }
      })
      .catch((error) => {
        if (mounted && !nativeSnapshot?.addresses) {
          setWalletAddressError(error?.message || 'AURELIS wallet addresses unavailable');
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  // 1. Load currencies catalog on mount
  useEffect(() => {
    let isMounted = true;
    setLoadingCatalog(true);
    getCurrencies()
      .then((assets) => {
        if (isMounted && assets?.length) {
          setCatalog(assets);
        }
      })
      .finally(() => {
        if (isMounted) setLoadingCatalog(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Distinct list of unique symbols in catalog with metadata
  const distinctCoins = useMemo(() => {
    const map = new Map<string, { symbol: string; name: string; logoURI?: string; networks: string[] }>();
    catalog.forEach((c) => {
      const sym = c.symbol.toUpperCase();
      const existing = map.get(sym);
      if (existing) {
        if (!existing.networks.includes(c.changenowNetwork)) {
          existing.networks.push(c.changenowNetwork);
        }
      } else {
        map.set(sym, {
          symbol: sym,
          name: c.name || sym,
          logoURI: c.logoURI,
          networks: [c.changenowNetwork],
        });
      }
    });
    return Array.from(map.values());
  }, [catalog]);

  const pickerCoins = useMemo(() => {
    const map = new Map<string, { symbol: string; name: string; logoURI?: string; networks: string[] }>();
    distinctCoins.forEach((coin) => map.set(coin.symbol.toUpperCase(), coin));
    marketCoins.forEach((coin) => {
      const symbol = coin.symbol.toUpperCase();
      const existing = map.get(symbol);
      if (existing) {
        if (!existing.logoURI && coin.imageUrl) existing.logoURI = coin.imageUrl;
        if ((!existing.name || existing.name === symbol) && coin.name) existing.name = coin.name;
      } else {
        map.set(symbol, {
          symbol,
          name: coin.name || symbol,
          logoURI: coin.imageUrl,
          networks: [],
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [distinctCoins, marketCoins]);

  // Filter the full AURELIS market universe, not only ChangeNOW's catalog.
  const filteredCoins = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return pickerCoins;
    return pickerCoins.filter(
      (c) =>
        c.symbol.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.networks.some((n) => n.toLowerCase().includes(q))
    );
  }, [pickerCoins, searchQuery]);

  // Networks available for currently selected fromSymbol
  const fromAvailableNetworks = useMemo(() => {
    return catalog
      .filter((c) => c.symbol.toUpperCase() === fromSymbol.toUpperCase())
      .map((c) => c.changenowNetwork);
  }, [catalog, fromSymbol]);

  // Destination networks must also be receivable by the connected AURELIS wallet.
  const toAvailableNetworks = useMemo(() => {
    const candidates = catalog.filter((c) => c.symbol.toUpperCase() === toSymbol.toUpperCase());
    const seen = new Set<string>();
    return candidates
      .filter((asset) => {
        const net = asset.changenowNetwork.toLowerCase();
        if (seen.has(net)) return false;
        seen.add(net);
        return Boolean(addressProvider.getAddress(asset));
      })
      .map((c) => c.changenowNetwork);
  }, [catalog, toSymbol, addressProvider]);

  // Selected asset objects
  const selectedFromAsset = useMemo(() => {
    return (
      catalog.find(
        (c) =>
          c.symbol.toUpperCase() === fromSymbol.toUpperCase() &&
          c.changenowNetwork.toLowerCase() === fromNetwork.toLowerCase()
      ) ||
      catalog.find((c) => c.symbol.toUpperCase() === fromSymbol.toUpperCase()) ||
      CANONICAL_ASSETS[0]
    );
  }, [catalog, fromSymbol, fromNetwork]);

  const selectedToAsset = useMemo(() => {
    return (
      catalog.find(
        (c) =>
          c.symbol.toUpperCase() === toSymbol.toUpperCase() &&
          c.changenowNetwork.toLowerCase() === toNetwork.toLowerCase()
      ) ||
      catalog.find((c) => c.symbol.toUpperCase() === toSymbol.toUpperCase()) ||
      CANONICAL_ASSETS[1]
    );
  }, [catalog, toSymbol, toNetwork]);

  useEffect(() => {
    if (!toAvailableNetworks.length) return;
    const currentValid = toAvailableNetworks.some(
      (net) => net.toLowerCase() === toNetwork.toLowerCase()
    );
    if (!currentValid) {
      setToNetwork(toAvailableNetworks[0]);
      setQuote(null);
      setGemQuote(null);
      setQuoteError(null);
    }
  }, [toAvailableNetworks, toNetwork]);

  const gemIsBestRoute = !forceChangeNow && Boolean(
    quote &&
      gemQuote?.ok &&
      gemQuote.toAmount &&
      Number(gemQuote.toAmount) > Number(quote.toAmount)
  );

  // Automatically resolved AURELIS wallet addresses
  const resolvedDestinationAddress = useMemo(() => {
    return addressProvider.getAddress(selectedToAsset);
  }, [addressProvider, selectedToAsset]);

  const resolvedRefundAddress = useMemo(() => {
    return addressProvider.getAddress(selectedFromAsset);
  }, [addressProvider, selectedFromAsset]);

  const sourceWalletHolding = useMemo(() => {
    const symbol = selectedFromAsset.symbol.toUpperCase();
    const chainHints = [selectedFromAsset.internalChain, selectedFromAsset.changenowNetwork]
      .filter(Boolean)
      .map((v) => String(v).toLowerCase());
    return (
      holdings.find((h) =>
        h.symbol.toUpperCase() === symbol &&
        chainHints.some((hint) => String(h.chain || '').toLowerCase().includes(hint))
      ) || holdings.find((h) => h.symbol.toUpperCase() === symbol)
    );
  }, [holdings, selectedFromAsset]);

  // Popular quick chips
  const popularSymbols = ['BTC', 'ETH', 'SOL', 'TAO', 'USDC', 'NEAR', 'XRP'];

  // Handle coin picking
  const handleSelectCoin = (sym: string) => {
    if (soundEnabled) playHudSound('switch');
    if (pickerTarget === 'from') {
      setFromSymbol(sym);
      const nets = catalog
        .filter((c) => c.symbol.toUpperCase() === sym.toUpperCase())
        .map((c) => c.changenowNetwork);
      if (nets.length > 0 && !nets.includes(fromNetwork)) {
        setFromNetwork(nets[0]);
      }
    } else if (pickerTarget === 'to') {
      setToSymbol(sym);
      const nets = catalog
        .filter((c) => c.symbol.toUpperCase() === sym.toUpperCase())
        .map((c) => c.changenowNetwork);
      if (nets.length > 0 && !nets.includes(toNetwork)) {
        setToNetwork(nets[0]);
      }
    }
    setPickerTarget(null);
    setSearchQuery('');
    setQuote(null);
    setGemQuote(null);
    setQuoteError(null);
  };

  // Swap From and To pairs
  const handleFlipPairs = () => {
    if (soundEnabled) playHudSound('switch');
    const oldFromSym = fromSymbol;
    const oldFromNet = fromNetwork;
    setFromSymbol(toSymbol);
    setFromNetwork(toNetwork);
    setToSymbol(oldFromSym);
    setToNetwork(oldFromNet);
    setQuote(null);
    setQuoteError(null);
  };

  const fetchNativeGemQuote = async (): Promise<NativeGemQuote | null> => {
    const bridge = (window as any).AurelisNative;
    if (!bridge || typeof bridge.requestSwapQuote !== 'function') {
      return null;
    }

    setIsGemQuoting(true);
    return await new Promise<NativeGemQuote | null>((resolve) => {
      let settled = false;
      const finish = (result: NativeGemQuote | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        setIsGemQuoting(false);
        resolve(result);
      };

      const timer = window.setTimeout(() => finish(null), 12000);
      (window as any).__aurelisNativeSwapQuoteResult = (result: NativeGemQuote) => {
        finish(result);
      };

      try {
        bridge.requestSwapQuote(
          JSON.stringify({
            fromSymbol,
            fromNetwork: selectedFromAsset.changenowNetwork,
            toSymbol,
            toNetwork: selectedToAsset.changenowNetwork,
            amount,
          }),
        );
      } catch {
        finish(null);
      }
    });
  };

  // 2. Fetch estimated quote from ChangeNOW API
  const handleFetchQuote = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setQuoteError('Please enter a valid amount');
      return;
    }

    if (soundEnabled) playHudSound('click');
    setIsQuoting(true);
    setQuoteError(null);
    setQuote(null);
    setGemQuote(null);

    try {
      const res = await getQuote(
        {
          currency: selectedFromAsset.changenowCurrency,
          network: selectedFromAsset.changenowNetwork,
        },
        {
          currency: selectedToAsset.changenowCurrency,
          network: selectedToAsset.changenowNetwork,
        },
        amount
      );

      if (res.ok) {
        setQuote(res);
        setMinimumAmount(res.minimumAmount);
        const nativeQuote = await fetchNativeGemQuote();
        if (nativeQuote?.ok) {
          setGemQuote(nativeQuote);
        }
      } else {
        setQuoteError(res.message);
        if (res.minimumAmount) {
          setMinimumAmount(res.minimumAmount);
        }
      }
    } catch (err: any) {
      setQuoteError(err?.message || 'Quote request failed');
    } finally {
      setIsQuoting(false);
    }
  };

  // 3. Execute the best quoted route
  const handleCreateExchange = async () => {
    if (gemIsBestRoute && gemQuote?.fromAssetId) {
      const bridge = (window as any).AurelisNative;
      if (!bridge || typeof bridge.openNativeScreen !== 'function') {
        setCreateError('Gem is the best route, but the native AURELIS swap bridge is unavailable.');
        return;
      }
      if (soundEnabled) playHudSound('trade');
      setCreateError(null);
      bridge.openNativeScreen(
        'swap-prefill:' +
          JSON.stringify({
            fromAssetId: gemQuote.fromAssetId,
            toAssetId: gemQuote.toAssetId || '',
            amount,
            provider: gemQuote.provider || 'Gem',
          }),
      );
      return;
    }

    if (!resolvedDestinationAddress) {
      setCreateError('No AURELIS address is available for ' + getNetworkDisplayName(toNetwork) + '.');
      return;
    }
    if (!resolvedRefundAddress) {
      setCreateError('No AURELIS refund address is available for ' + getNetworkDisplayName(fromNetwork) + '.');
      return;
    }

    if (soundEnabled) playHudSound('trade');
    setIsCreating(true);
    setCreateError(null);

    try {
      const res = await createExchange({
        fromAsset: {
          currency: selectedFromAsset.changenowCurrency,
          network: selectedFromAsset.changenowNetwork,
        },
        toAsset: {
          currency: selectedToAsset.changenowCurrency,
          network: selectedToAsset.changenowNetwork,
        },
        amount,
        destinationAddress: resolvedDestinationAddress,
        refundAddress: resolvedRefundAddress,
        rateId: quote?.rateId || undefined,
      });

      if (res.ok) {
        setExchangeOrder(res);
        setOrderStatus({
          ok: true,
          exchangeId: res.exchangeId,
          status: 'waiting',
          providerStatus: 'waiting',
          payinHash: null,
          payoutHash: null,
          fromAmount: res.fromAmount,
          toAmount: res.expectedToAmount,
        });
      } else {
        setCreateError(res.message || 'Failed to create exchange');
      }
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to connect to exchange creation endpoint');
    } finally {
      setIsCreating(false);
    }
  };

  // 4. Poll status every 10s when an order is active
  useEffect(() => {
    if (!exchangeOrder?.exchangeId) return;

    let timer: NodeJS.Timeout;
    const poll = async () => {
      try {
        setIsPolling(true);
        const st = await getExchangeStatus(exchangeOrder.exchangeId);
        if (st.ok) {
          setOrderStatus(st);
          if (['finished', 'failed', 'refunded'].includes(st.status)) {
            return;
          }
        }
      } catch (e) {
        console.warn('Status poll error:', e);
      } finally {
        setIsPolling(false);
      }
      timer = setTimeout(poll, 10000);
    };

    poll();

    return () => {
      clearTimeout(timer);
    };
  }, [exchangeOrder?.exchangeId]);

  const copyToClipboard = (text: string, key: string) => {
    if (soundEnabled) playHudSound('click');
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-4 sm:p-5 bg-surface-panel border border-white/10 rounded-2xl font-mono text-xs select-none shadow-xl">
      {/* Header */}
      <div className="pb-3 border-b border-white/10 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-primary-container shadow-[0_0_8px_rgba(0,245,160,0.8)] animate-pulse" />
          <div>
            <h2 className="font-bold text-sm text-text-primary uppercase tracking-wide">
              {mode === 'buy' ? 'Buy Crypto' : mode === 'sell' ? 'Sell Crypto' : 'Trade Crypto'}
            </h2>
            <span className="text-[11px] text-text-muted">
              Uses the connected wallet for non-custodial routing and transaction approval
            </span>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-full bg-primary-container/10 border border-primary-container/25 text-[10px] text-primary-container font-bold">
          {walletAddress ? 'Wallet Connected' : 'Wallet Required'}
        </span>
      </div>

      {/* SWAP FORM */}
      <div className="space-y-3">
        {/* ========================================================================= */}
        {/* 1. YOU SEND (FROM) WITH COIN & NETWORK ICONS */}
        {/* ========================================================================= */}
        <div className="p-3.5 bg-surface-base rounded-xl border border-white/10 space-y-2.5">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[11px] uppercase font-bold tracking-wider">
              You Send
            </span>
            <div className="flex items-center gap-1.5 text-[10px]">
              <NetworkIcon network={fromNetwork} size="xs" />
              <span>Network: <strong>{getNetworkDisplayName(fromNetwork)}</strong></span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
            {/* Coin Picker Button with Actual Coin Icon */}
            <div className="sm:col-span-6">
              <button
                type="button"
                onClick={() => {
                  if (soundEnabled) playHudSound('click');
                  setPickerTarget('from');
                }}
                className="w-full flex items-center justify-between p-2.5 bg-surface-panel hover:bg-white/10 border border-white/15 hover:border-primary-container/50 rounded-xl transition-all cursor-pointer group"
                title="Select source cryptocurrency"
              >
                <div className="flex items-center gap-2.5">
                  <CoinIcon
                    symbol={fromSymbol}
                    imageUrl={selectedFromAsset.logoURI}
                    size="md"
                    className="shadow-md"
                  />
                  <div className="text-left">
                    <span className="block font-bold text-xs text-text-primary group-hover:text-primary-container transition-colors">
                      {fromSymbol}
                    </span>
                    <span className="block text-[10px] text-text-muted truncate max-w-[120px]">
                      {selectedFromAsset.name}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-text-muted group-hover:text-text-primary">
                  <NetworkIcon network={fromNetwork} size="xs" />
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </button>
            </div>

            {/* Amount Input */}
            <div className="sm:col-span-6">
              <div className="flex items-center bg-surface-panel border border-white/15 focus-within:border-primary-container/50 rounded-xl p-2 transition-colors">
                <input
                  type="number"
                  step="any"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setQuote(null);
                  }}
                  placeholder="0.0"
                  className="w-full bg-transparent text-text-primary font-bold font-mono text-sm outline-none px-1"
                />
                <span className="text-[11px] text-text-muted font-bold shrink-0 pr-1">
                  {fromSymbol}
                </span>
              </div>
            </div>
          </div>

          {/* Network Selection with Actual Network Icons */}
          <div className="pt-1 border-t border-white/5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-text-muted uppercase font-bold mr-1">
              Select Network:
            </span>
            {fromAvailableNetworks.map((net) => {
              const isSelected = net.toLowerCase() === fromNetwork.toLowerCase();
              return (
                <button
                  key={net}
                  type="button"
                  onClick={() => {
                    if (soundEnabled) playHudSound('click');
                    setFromNetwork(net);
                    setQuote(null);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-primary-container text-on-primary-container font-bold shadow-[0_0_8px_rgba(0,245,160,0.3)]'
                      : 'bg-surface-panel hover:bg-white/10 text-text-secondary border border-white/10 hover:text-text-primary'
                  }`}
                >
                  <NetworkIcon network={net} size="xs" />
                  <span>{getNetworkDisplayName(net)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* FLIP PAIRS BUTTON */}
        <div className="flex justify-center -my-1.5 z-10">
          <button
            type="button"
            onClick={handleFlipPairs}
            className="w-8 h-8 rounded-full bg-surface-base border border-white/20 hover:border-primary-container hover:bg-surface-panel text-text-secondary hover:text-primary-container flex items-center justify-center shadow-lg transition-all cursor-pointer"
            title="Invert swap direction"
          >
            <ArrowUpDown className="w-4 h-4" />
          </button>
        </div>

        {/* ========================================================================= */}
        {/* 2. YOU RECEIVE (TO) WITH COIN & NETWORK ICONS */}
        {/* ========================================================================= */}
        <div className="p-3.5 bg-surface-base rounded-xl border border-white/10 space-y-2.5">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[11px] uppercase font-bold tracking-wider">
              You Receive (Estimated)
            </span>
            <div className="flex items-center gap-1.5 text-[10px]">
              <NetworkIcon network={toNetwork} size="xs" />
              <span>Network: <strong>{getNetworkDisplayName(toNetwork)}</strong></span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
            {/* Coin Picker Button with Actual Coin Icon */}
            <div className="sm:col-span-6">
              <button
                type="button"
                onClick={() => {
                  if (soundEnabled) playHudSound('click');
                  setPickerTarget('to');
                }}
                className="w-full flex items-center justify-between p-2.5 bg-surface-panel hover:bg-white/10 border border-white/15 hover:border-primary-container/50 rounded-xl transition-all cursor-pointer group"
                title="Select destination cryptocurrency"
              >
                <div className="flex items-center gap-2.5">
                  <CoinIcon
                    symbol={toSymbol}
                    imageUrl={selectedToAsset.logoURI}
                    size="md"
                    className="shadow-md"
                  />
                  <div className="text-left">
                    <span className="block font-bold text-xs text-text-primary group-hover:text-primary-container transition-colors">
                      {toSymbol}
                    </span>
                    <span className="block text-[10px] text-text-muted truncate max-w-[120px]">
                      {selectedToAsset.name}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-text-muted group-hover:text-text-primary">
                  <NetworkIcon network={toNetwork} size="xs" />
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </button>
            </div>

            {/* Estimated Receive Output */}
            <div className="sm:col-span-6">
              <div className="flex items-center justify-between bg-surface-panel border border-white/15 rounded-xl p-2 px-3">
                <span className="font-bold font-mono text-sm text-primary-container truncate">
                  {quote ? quote.toAmount : '—'}
                </span>
                <span className="text-[11px] text-text-muted font-bold shrink-0 pl-1">
                  {toSymbol}
                </span>
              </div>
            </div>
          </div>

          {/* Network Selection with Actual Network Icons */}
          <div className="pt-1 border-t border-white/5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-text-muted uppercase font-bold mr-1">
              Select Network:
            </span>
            {toAvailableNetworks.map((net) => {
              const isSelected = net.toLowerCase() === toNetwork.toLowerCase();
              return (
                <button
                  key={net}
                  type="button"
                  onClick={() => {
                    if (soundEnabled) playHudSound('click');
                    setToNetwork(net);
                    setQuote(null);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-primary-container text-on-primary-container font-bold shadow-[0_0_8px_rgba(0,245,160,0.3)]'
                      : 'bg-surface-panel hover:bg-white/10 text-text-secondary border border-white/10 hover:text-text-primary'
                  }`}
                >
                  <NetworkIcon network={net} size="xs" />
                  <span>{getNetworkDisplayName(net)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 3. DESTINATION: AUTOMATICALLY RESOLVED AURELIS WALLET */}
        {/* ========================================================================= */}
        <div className="p-3 bg-surface-base rounded-xl border border-white/5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-text-muted uppercase font-bold">
              Destination: AURELIS Wallet
            </span>
            <span className="text-[10px] text-primary-container font-bold flex items-center gap-1">
              <NetworkIcon network={toNetwork} size="xs" />
              <span>{resolvedDestinationAddress ? `${getNetworkDisplayName(toNetwork)} Auto-Resolved` : `${getNetworkDisplayName(toNetwork)} Unavailable`}</span>
            </span>
          </div>
          <div className="p-2.5 bg-surface-panel border border-white/10 rounded-lg break-all text-[11px] text-text-primary flex items-center justify-between gap-2">
            <span className="font-mono">{resolvedDestinationAddress || 'Address unavailable'}</span>
            <button
              type="button"
              onClick={() => resolvedDestinationAddress && copyToClipboard(resolvedDestinationAddress, 'dest')}
              className="text-[10px] text-text-muted hover:text-text-primary cursor-pointer shrink-0 font-bold"
            >
              {copiedKey === 'dest' ? '[Copied]' : '[Copy]'}
            </button>
          </div>
          <div className="text-[10px] text-text-muted flex items-center gap-1">
            <span>Refund Address:</span>
            <span className="text-text-secondary font-mono truncate">{resolvedRefundAddress || 'Address unavailable'}</span>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 4. QUOTE AND MINIMUM INFO */}
        {/* ========================================================================= */}
        <div className="p-3 bg-surface-base rounded-xl border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-[11px] text-text-muted">Estimated Exchange Quote:</div>
            {quote ? (
              <div className="flex items-center gap-2 mt-0.5">
                <CoinIcon symbol={toSymbol} imageUrl={selectedToAsset.logoURI} size="sm" />
                <span className="text-sm font-bold text-primary-container">
                  {gemIsBestRoute && gemQuote?.toAmount ? gemQuote.toAmount : quote.toAmount} {toSymbol}
                </span>
                <span className="text-[10px] text-text-muted font-normal">
                  on {getNetworkDisplayName(toNetwork)}
                </span>
              </div>
            ) : (
              <div className="text-xs text-text-secondary">
                Click Review Quote to compare live ChangeNOW and Gem routes
              </div>
            )}
            {minimumAmount && (
              <div className="text-[10px] text-text-muted">
                Minimum: <strong>{minimumAmount} {fromSymbol}</strong>
              </div>
            )}
            {isGemQuoting && (
              <div className="text-[10px] text-text-muted">Comparing Gem routes…</div>
            )}
            {quote && gemQuote?.ok && gemQuote.toAmount && (
              <div className="mt-2 pt-2 border-t border-white/5 space-y-1">
                <div className="text-[10px] text-text-muted uppercase tracking-wide">Route comparison</div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono">
                  <span className={
                    Number(quote.toAmount) >= Number(gemQuote.toAmount)
                      ? 'text-primary-container font-bold'
                      : 'text-text-secondary'
                  }>
                    ChangeNOW {quote.toAmount} {toSymbol}
                  </span>
                  <span className={
                    Number(gemQuote.toAmount) > Number(quote.toAmount)
                      ? 'text-primary-container font-bold'
                      : 'text-text-secondary'
                  }>
                    Gem {gemQuote.toAmount} {toSymbol}
                    {gemQuote.provider ? ' · ' + gemQuote.provider : ''}
                  </span>
                </div>
                <div className="text-[9px] text-text-muted">
                  Best route selected automatically: <strong className="text-primary-container">{gemIsBestRoute ? 'Gem' : 'ChangeNOW'}</strong>.
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleFetchQuote}
            disabled={isQuoting}
            className="px-4 py-2 bg-white/10 hover:bg-white/15 border border-white/20 text-text-primary font-bold rounded-xl cursor-pointer disabled:opacity-50 self-start sm:self-auto transition-all"
          >
            {isQuoting ? 'Checking Quote...' : 'Review Quote'}
          </button>
        </div>

        {/* QUOTE ERROR NOTIFICATION */}
        {quoteError && (
          <div className="p-3 bg-status-error/15 border border-status-error/40 text-status-error rounded-xl text-[11px] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{quoteError}</span>
          </div>
        )}

        {/* CREATE EXCHANGE BUTTON */}
        <div className="pt-1">
          <button
            type="button"
            onClick={handleCreateExchange}
            disabled={isCreating || !quote || (!gemIsBestRoute && (!resolvedDestinationAddress || !resolvedRefundAddress))}
            className="w-full py-3 bg-primary-container hover:brightness-110 text-on-primary-container font-bold text-xs uppercase tracking-wide rounded-xl cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(0,245,160,0.3)] transition-all flex items-center justify-center gap-2"
          >
            {isCreating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Creating ChangeNOW Exchange...</span>
              </>
            ) : (
              <>
                <span>{gemIsBestRoute ? 'Use Gem Route' : 'Create ChangeNOW Exchange'}</span>
                {quote && (
                  <span>
                    ({quote.fromAmount} {fromSymbol} → {gemIsBestRoute && gemQuote?.toAmount ? gemQuote.toAmount : quote.toAmount} {toSymbol})
                  </span>
                )}
              </>
            )}
          </button>
        </div>

        {/* CREATE ERROR NOTIFICATION */}
        {createError && (
          <div className="p-3 bg-status-error/15 border border-status-error/40 text-status-error rounded-xl text-[11px] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{createError}</span>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 5. DEPOSIT DETAILS & STATUS TRACKING (When order created) */}
      {/* ========================================================================= */}
      {exchangeOrder && (
        <div className="mt-6 pt-4 border-t border-white/10 space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-xs uppercase tracking-wide text-text-primary flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary-container animate-ping" />
              <span>Exchange Order ({exchangeOrder.exchangeId})</span>
            </h3>
            <span className="text-[10px] text-text-muted font-bold">
              ID: {exchangeOrder.exchangeId}
            </span>
          </div>

          {/* DEPOSIT ADDRESS BOX WITH ICONS */}
          <div className="p-3.5 bg-surface-base rounded-xl border border-white/15 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-text-muted uppercase font-bold flex items-center gap-1.5">
                <CoinIcon symbol={exchangeOrder.fromCurrency} size="xs" />
                <NetworkIcon network={exchangeOrder.fromNetwork} size="xs" />
                <span>ChangeNOW Deposit Address:</span>
              </span>
              <span className="text-[10px] text-primary-container font-bold">
                {getNetworkDisplayName(exchangeOrder.fromNetwork)}
              </span>
            </div>

            <div className="p-2.5 bg-surface-panel border border-white/20 rounded-lg break-all text-xs font-bold text-primary-container flex items-center justify-between gap-2">
              <span className="font-mono">{exchangeOrder.depositAddress}</span>
              <button
                type="button"
                onClick={() => copyToClipboard(exchangeOrder.depositAddress, 'deposit')}
                className="text-[10px] px-2 py-1 rounded bg-primary-container/20 text-primary-container hover:bg-primary-container/30 cursor-pointer shrink-0 font-bold"
              >
                {copiedKey === 'deposit' ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <p className="text-[10px] text-text-secondary leading-relaxed">
              Send exactly <strong>{exchangeOrder.fromAmount} {exchangeOrder.fromCurrency}</strong> on the <strong>{getNetworkDisplayName(exchangeOrder.fromNetwork)}</strong> network to this deposit address.
            </p>
          </div>

          {/* EXTRA ID / MEMO IF REQUIRED */}
          {exchangeOrder.depositExtraId && (
            <div className="p-3 bg-amber-500/15 border border-amber-500/50 rounded-xl space-y-1.5">
              <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px] uppercase">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Required Deposit Memo / ExtraId:</span>
              </div>
              <div className="p-2 bg-surface-panel border border-amber-500/30 rounded-lg break-all text-xs font-bold text-text-primary flex items-center justify-between gap-2">
                <span className="font-mono">{exchangeOrder.depositExtraId}</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(exchangeOrder.depositExtraId, 'memo')}
                  className="text-[10px] px-2 py-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 cursor-pointer shrink-0 font-bold"
                >
                  {copiedKey === 'memo' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-[10px] text-amber-400 font-sans leading-tight">
                IMPORTANT: Sending without this memo/tag can lose or delay your deposit permanently.
              </p>
            </div>
          )}

          {/* WALLET DISPATCH BUTTON */}
          <div className="p-3 bg-surface-base rounded-xl border border-white/5 flex items-center justify-between gap-2">
            <div>
              <strong className="block text-text-primary text-[11px]">
                AURELIS Self-Custody Send
              </strong>
              <span className="text-[10px] text-text-muted">
                Transfer {exchangeOrder.fromAmount} {exchangeOrder.fromCurrency} from AURELIS wallet
              </span>
            </div>
            <button
              type="button"
              onClick={async () => {
                if (soundEnabled) playHudSound('trade');
                if (isSendingDeposit) return;
                setWalletSendMessage(null);
                setDepositTxHash(null);

                if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
                  setWalletSendMessage('Select a valid main wallet before sending exchange deposits. Bot wallet sessions are not available here.');
                  return;
                }

                const isAeroBase =
                  exchangeOrder.fromCurrency.toUpperCase() === 'AERO' &&
                  exchangeOrder.fromNetwork.toLowerCase() === 'base';

                if (isAeroBase) {
                  setIsSendingDeposit(true);
                  try {
                    setWalletSendMessage('Waiting for wallet approval on Base…');
                    const sent = await sendWalletConnectErc20Transfer({
                      chainId: 8453,
                      tokenContract: '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
                      decimals: 18,
                      recipient: exchangeOrder.depositAddress,
                      amount: exchangeOrder.fromAmount,
                      expectedFrom: walletAddress,
                    });
                    setDepositTxHash(sent.txHash);
                    setWalletSendMessage(
                      'AERO broadcast to Base. ChangeNOW is waiting for network confirmation.',
                    );
                  } catch (error: any) {
                    setWalletSendMessage(
                      error?.message || 'The connected wallet did not broadcast the AERO deposit.',
                    );
                  } finally {
                    setIsSendingDeposit(false);
                  }
                  return;
                }

                if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress || '')) {
                  setWalletSendMessage('Connect the intended main EVM wallet in AURELIS before sending this deposit.');
                  return;
                }
                if (onOpenWalletSend) {
                  onOpenWalletSend({
                    symbol: exchangeOrder.fromCurrency,
                    network: exchangeOrder.fromNetwork,
                    recipient: exchangeOrder.depositAddress,
                    amount: exchangeOrder.fromAmount,
                    memo: exchangeOrder.depositExtraId || '',
                  });
                  setWalletSendMessage('Opening AURELIS Wallet Send with the deposit details pinned to your selected wallet.');
                } else {
                  setWalletSendMessage('AURELIS Wallet Send is unavailable. No transfer has been initiated.');
                }
              }}
              disabled={isSendingDeposit}
              className="px-3.5 py-1.5 bg-white/10 hover:bg-white/20 border border-white/15 rounded-xl text-text-primary text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-wait"
            >
              <Send className="w-3 h-3" />
              <span>{isSendingDeposit ? 'Waiting for Approval…' : 'Send Deposit Now'}</span>
            </button>
          </div>
          {walletSendMessage && (
            <div className="text-[10px] text-text-secondary px-1">{walletSendMessage}</div>
          )}
          {depositTxHash && (
            <div className="text-[10px] text-primary-container px-1 break-all">
              Base Tx: {depositTxHash}
            </div>
          )}
          {walletAddressError && (
            <div className="text-[10px] text-status-error px-1">{walletAddressError}</div>
          )}

          {onNextAiLeg && aiLegNumber && aiLegTotal && aiLegNumber < aiLegTotal && (
            <button
              type="button"
              onClick={onNextAiLeg}
              className="w-full px-3.5 py-2.5 rounded-xl bg-primary-container text-on-primary-container text-[11px] font-black tracking-wide hover:brightness-110 transition-all"
            >
              NEXT SWAP LEG · {aiLegNumber + 1} OF {aiLegTotal}
            </button>
          )}

          {/* LIVE STATUS TRACKER */}
          <div className="p-3 bg-surface-base rounded-xl border border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-text-muted uppercase font-bold">
                Transaction Status
              </span>
              <div className="flex items-center gap-1.5">
                {isPolling && <span className="text-[10px] text-text-muted">Polling...</span>}
                <span className="px-2.5 py-0.5 rounded-full uppercase font-bold text-[10px] bg-primary-container/20 text-primary-container border border-primary-container/30">
                  {orderStatus?.status || 'waiting'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px] text-text-muted pt-1">
              <div>
                Raw Provider Status: <span className="text-text-primary font-bold">{orderStatus?.providerStatus || 'waiting'}</span>
              </div>
              <div className="flex items-center gap-1">
                <span>Expected:</span>
                <CoinIcon symbol={exchangeOrder.toCurrency} size="xs" />
                <span className="text-text-primary font-bold">{exchangeOrder.expectedToAmount} {exchangeOrder.toCurrency}</span>
              </div>
              {orderStatus?.payinHash && (
                <div className="col-span-2 break-all">
                  Payin Hash: <span className="text-primary-container font-mono">{orderStatus.payinHash}</span>
                </div>
              )}
              {orderStatus?.payoutHash && (
                <div className="col-span-2 break-all">
                  Payout Hash: <span className="text-primary-container font-mono">{orderStatus.payoutHash}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. COIN PICKER MODAL (With Search, Popular Chips & Full Catalog) */}
      {/* ========================================================================= */}
      {pickerTarget && createPortal(
        <div
          className="fixed left-0 right-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-hidden"
          style={{ top: `${pickerViewport.top}px`, height: `${pickerViewport.height}px` }}
        >
          <div className="w-full max-w-md bg-surface-panel border border-white/15 rounded-2xl p-3 sm:p-4 shadow-2xl space-y-3 h-full sm:h-auto sm:max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
              <h3 className="font-bold text-sm text-text-primary uppercase tracking-wide">
                Select {pickerTarget === 'from' ? 'Source' : 'Destination'} Asset
              </h3>
              <button
                type="button"
                onClick={() => {
                  setPickerTarget(null);
                  setSearchQuery('');
                }}
                className="p-1 rounded text-text-muted hover:text-text-primary cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Input */}
            <div className="flex items-center bg-surface-base border border-white/15 rounded-xl px-2.5 py-2 shrink-0">
              <Search className="w-4 h-4 text-text-muted mr-2 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search symbol, name, or network..."
                className="w-full bg-transparent text-text-primary text-xs font-mono outline-none"
                autoFocus
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-text-muted hover:text-text-primary cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Popular Quick Chips. Hide while searching so results stay above the keyboard. */}
            {!searchQuery.trim() && (
              <div className="shrink-0 space-y-1">
                <span className="text-[10px] text-text-muted uppercase font-bold block">
                  Popular Assets:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {popularSymbols.map((sym) => (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => handleSelectCoin(sym)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-base hover:bg-white/10 border border-white/10 hover:border-primary-container/40 text-[10px] font-bold text-text-primary transition-all cursor-pointer"
                    >
                      <CoinIcon symbol={sym} size="xs" />
                      <span>{sym}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Coin List with Real Icons & Network Badges */}
            <div className="overflow-y-auto overscroll-contain space-y-1 pr-1 flex-1 min-h-0">
              {filteredCoins.length === 0 ? (
                <div className="p-6 text-center text-text-muted text-xs">
                  No assets matching &ldquo;{searchQuery}&rdquo;
                </div>
              ) : (
                filteredCoins.map((coin) => {
                  const isCurrent =
                    pickerTarget === 'from'
                      ? coin.symbol === fromSymbol
                      : coin.symbol === toSymbol;
                  return (
                    <button
                      key={coin.symbol}
                      type="button"
                      onClick={() => handleSelectCoin(coin.symbol)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-primary-container/15 border border-primary-container/40 text-primary-container'
                          : 'bg-surface-base hover:bg-white/10 border border-white/5 text-text-primary'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <CoinIcon
                          symbol={coin.symbol}
                          imageUrl={coin.logoURI}
                          size="md"
                        />
                        <div className="text-left">
                          <strong className="block text-xs font-bold">
                            {coin.symbol}
                          </strong>
                          <span className="block text-[10px] text-text-muted truncate max-w-[180px]">
                            {coin.name}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap justify-end max-w-[140px]">
                        {coin.networks.slice(0, 3).map((net) => (
                          <div
                            key={net}
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-panel border border-white/10 text-[9px] text-text-secondary"
                            title={`Available on ${getNetworkDisplayName(net)}`}
                          >
                            <NetworkIcon network={net} size="xs" />
                            <span>{net.toUpperCase()}</span>
                          </div>
                        ))}
                        {coin.networks.length > 3 && (
                          <span className="text-[9px] text-text-muted">
                            +{coin.networks.length - 3}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ,
        document.body
      )}

    </div>
  );
};

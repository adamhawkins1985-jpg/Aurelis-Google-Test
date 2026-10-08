import React, { useState, useEffect, useMemo, useRef } from 'react';
import { TitleBar } from './components/TitleBar';
import { TabSelector } from './components/TabSelector';
import { CoinManagerDrawer } from './components/CoinManagerDrawer';
import { ChartScreen } from './components/ChartScreen';
import { WatchlistScreen } from './components/WatchlistScreen';
import { HeatmapScreen } from './components/HeatmapScreen';
import { MarqueeScreen } from './components/MarqueeScreen';
import { FooterBar } from './components/FooterBar';
import { WindowsWidgetGuideModal } from './components/WindowsWidgetGuideModal';
import { WalletScreen } from './components/WalletScreen';
import { TradeScreen } from './components/TradeScreen';
import { StocksScreen } from './components/StocksScreen';
import { AurelisLogo } from './components/AurelisLogo';
import { BottomNav } from './components/BottomNav';
import { MobileAiChatBar } from './components/MobileAiChatBar';
import { DesktopTopNav } from './components/DesktopTopNav';
import { HomeScreen } from './components/HomeScreen';
import { EarnBorrowScreen } from './components/EarnBorrowScreen';
import { PredictionsScreen } from './components/PredictionsScreen';
import { PerpsScreen } from './components/PerpsScreen';
import { SignalDeskScreen } from './components/SignalDeskScreen';
import { AiScreen } from './components/AiScreen';
import { AssetTemplateScreen } from './components/AssetTemplateScreen';
import { SwapWidgetDock, MobileSwapWidgetPage } from './components/SwapWidgetDock';
import { AiChatDock } from './components/AiChatDock';
import { DesktopUtilityWindow } from './components/DesktopUtilityWindow';
import { INITIAL_COINS } from './data/initialCoins';
import { CoinData, HUDTab, NavigationTab, Timeframe, ThemeMode, WalletHolding, WalletTransaction } from './types';
import { fetchLiveCryptoMarkets, fetchTopCryptoMarkets, playHudSound, formatCurrency } from './services/marketData';
import { Maximize2, Zap, RotateCcw, ChevronUp } from 'lucide-react';
import { getNativeWalletAddresses, firstEvmAddress, getLatestWalletPortfolio } from './services/walletApi';

export default function App() {
  // Coin dataset state (initialized with 30+ top coins + any custom added online tokens)
  const [coins, setCoins] = useState<CoinData[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedCustom = localStorage.getItem('aurelis_custom_coins');
        if (savedCustom) {
          const parsed = JSON.parse(savedCustom);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const existingIds = new Set(INITIAL_COINS.map((c) => c.id));
            const customOnly = parsed.filter((c: CoinData) => !existingIds.has(c.id));
            return [...INITIAL_COINS, ...customOnly];
          }
        }
      } catch {}
    }
    return INITIAL_COINS;
  });
  const coinsRef = useRef<CoinData[]>(coins);

  useEffect(() => {
    coinsRef.current = coins;
  }, [coins]);

  useEffect(() => {
    const w = window as any;
    const previous = w.aurelisEmbeddedApprovalResult;
    w.aurelisEmbeddedApprovalResult = (raw: string) => {
      let result: any = null;
      try { result = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { result = null; }
      window.dispatchEvent(new CustomEvent('aurelis:approval-result', { detail: result }));
      if (result?.status === 'approved') {
        // Android Send now runs as one native flow. Do not reopen Send from an
        // embedded approval callback or recipient/amount will be requested twice.
        w.__aurelisPendingSend = null;
      }
    };
    return () => { w.aurelisEmbeddedApprovalResult = previous; };
  }, []);

  const [selectedCoinId, setSelectedCoinId] = useState<string>('bitcoin');
  const [activeTab, setActiveTab] = useState<HUDTab>('chart');
  const [chartViewMode, setChartViewMode] = useState<'all-starred' | 'single-coin'>('all-starred');
  const [timeframe, setTimeframe] = useState<Timeframe>('1H');
  const [navigationTab, setNavigationTab] = useState<NavigationTab>('home');
  const [embeddedUtilityKind, setEmbeddedUtilityKind] = useState<'chat' | 'notes' | 'livebet' | null>(() => {
    const requested = new URLSearchParams(window.location.search).get('utility');
    const saved = window.localStorage.getItem('aurelis_android_active_utility');
    const candidate = requested || saved;
    return candidate === 'chat' || candidate === 'notes' || candidate === 'livebet' ? candidate : null;
  });

  useEffect(() => {
    const syncEmbeddedUtility = () => {
      const requested = new URLSearchParams(window.location.search).get('utility');
      const valid = requested === 'chat' || requested === 'notes' || requested === 'livebet';
      if (valid) setEmbeddedUtilityKind(requested);
      else {
        window.localStorage.removeItem('aurelis_android_active_utility');
        setEmbeddedUtilityKind(null);
      }
    };
    window.addEventListener('popstate', syncEmbeddedUtility);
    window.addEventListener('aurelis:open-utility', syncEmbeddedUtility);
    window.addEventListener('aurelis:close-utility', syncEmbeddedUtility);
    return () => {
      window.removeEventListener('popstate', syncEmbeddedUtility);
      window.removeEventListener('aurelis:open-utility', syncEmbeddedUtility);
      window.removeEventListener('aurelis:close-utility', syncEmbeddedUtility);
    };
  }, []);

  useEffect(() => {
    const bridge = (window as any).AurelisDesktop;
    if (!bridge || typeof bridge.onMainNavigate !== 'function') return;
    const unsubscribe = bridge.onMainNavigate((payload:any) => {
      const tab = String(payload?.tab || '');
      if (['home','markets','signals','trade','stocks','wallet','earn-borrow','predictions','perps','ai'].includes(tab)) {
        setSelectedAssetKey(null);
        setNavigationTab(tab as NavigationTab);
        if (payload?.action === 'ai-swap-plan') {
          const plan = payload?.plan;
          if (plan && Array.isArray(plan?.legs)) {
            localStorage.setItem('aurelis_ai_swap_plan', JSON.stringify(plan));
          }
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent('aurelis-ai-swap-plan', { detail: { plan } }));
          }, 20);
        }
      }
    });
    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, []);

  // Top dropdown panel for Chart, Watchlist, Heatmap from current page
  const [marketsDropdownTab, setMarketsDropdownTab] = useState<HUDTab | null>(null);

  // Watchlist: Strictly only allow coins the user has starred
  const [starredCoinIds, setStarredCoinIds] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('aurelis_starred_coins');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed;
        }
        // Legacy fallback
        const legacyFavs = localStorage.getItem('aurelis_favorites');
        if (legacyFavs) {
          const parsed = JSON.parse(legacyFavs);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }
    return ['bitcoin', 'ethereum', 'solana'];
  });

  // Agent Money is reserved for Bots and must not populate the main wallet.
  const isBotOnlyAddress = (value: unknown) => String(value || '').trim().toLowerCase() === '0xd2919c82e5fecbb0c4be7a7c37bfc066579f233e';
  // Real AURELIS wallet state. Android supplies a native snapshot; desktop resolves saved wallet addresses.
  const [isWalletConnected, setIsWalletConnected] = useState<boolean>(false);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [walletHoldings, setWalletHoldings] = useState<WalletHolding[]>([]);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([]);
  const [selectedAssetKey, setSelectedAssetKey] = useState<string | null>(null);

  useEffect(() => {
    const applySnapshot = (snapshot: any) => {
      if (!snapshot || typeof snapshot !== 'object') return;
      const evm = snapshot.evmAddress || snapshot.address || '';
      if (evm && !isBotOnlyAddress(evm)) {
        setWalletAddress(evm);
        setIsWalletConnected(true);
      }
      if (Array.isArray(snapshot.holdings)) {
        setWalletHoldings(
          snapshot.holdings
            .map((item: any) => ({
              symbol: String(item.symbol || '').toUpperCase(),
              name: String(item.name || item.symbol || ''),
              amount: Number(item.amount || 0),
              chain: String(item.chain || ''),
              assetId: String(item.assetId || ''),
              price: Number(item.price || 0),
              change24h: Number(item.change24h || 0),
              balanceText: String(item.balanceText || ''),
              balanceEquivalent: String(item.balanceEquivalent || ''),
            }))
            .filter((item: WalletHolding) => item.symbol && Number.isFinite(item.amount) && item.amount > 0)
        );
      }
      if (Array.isArray(snapshot.transactions)) {
        setWalletTransactions(snapshot.transactions);
      }
    };

    const nativeSnapshot = (window as any).__aurelisNativeWalletSnapshot;
    if (nativeSnapshot) applySnapshot(nativeSnapshot);

    const onNativeContext = (event: Event) => {
      applySnapshot((event as CustomEvent).detail);
    };
    const getSavedExternalWalletAddress = () => {
      try {
        const saved = localStorage.getItem('aurelis_wallet_address') || '';
        return /^0x[a-fA-F0-9]{40}$/.test(saved) && !isBotOnlyAddress(saved) ? saved : '';
      } catch {
        return '';
      }
    };

    const refreshWalletAddresses = () => {
      getNativeWalletAddresses()
        .then((addresses) => {
          const values = Object.values(addresses).filter(Boolean);
          const evm = firstEvmAddress(addresses);
          const savedExternal = getSavedExternalWalletAddress();
          const nextAddress = [evm,...values,savedExternal].find(value=>value && !isBotOnlyAddress(value)) || '';
          setWalletAddress(nextAddress);
          setIsWalletConnected(Boolean(nextAddress));
        })
        .catch(() => {
          const savedExternal = getSavedExternalWalletAddress();
          setWalletAddress(savedExternal);
          setIsWalletConnected(Boolean(savedExternal));
        });
    };
    const refreshWalletHoldings = () => {
      getLatestWalletPortfolio()
        .then((assets) => {
          setWalletHoldings(
            assets.filter(item => !isBotOnlyAddress(item.accountAddress)).map((item) => ({
              symbol: item.symbol,
              name: item.name,
              amount: item.amount,
              chain: item.chain,
              assetId: item.assetId,
              price: item.priceUsd,
              change24h: item.change24h,
              accountAddress: item.accountAddress,
              walletName: item.walletName,
              walletProfileId: item.walletProfileId,
              walletCanSign: item.walletCanSign,
            }))
          );
        })
        .catch(() => setWalletHoldings([]));
    };
    const onWalletAuthenticated = () => {
      refreshWalletAddresses();
      refreshWalletHoldings();
    };
    const onWalletRefresh = () => {
      refreshWalletAddresses();
      refreshWalletHoldings();
      window.setTimeout(refreshWalletHoldings, 4000);
      window.setTimeout(refreshWalletHoldings, 12000);
      window.setTimeout(refreshWalletHoldings, 30000);
    };
    const onWalletEngineReady = () => {
      refreshWalletAddresses();
      refreshWalletHoldings();
    };
    window.addEventListener('aurelis:native-wallet-context', onNativeContext as EventListener);
    window.addEventListener('aurelis:wallet-authenticated', onWalletAuthenticated as EventListener);
    window.addEventListener('aurelis:wallet-refresh', onWalletRefresh as EventListener);
    window.addEventListener('aurelis:wallet-engine-ready', onWalletEngineReady as EventListener);

    getNativeWalletAddresses()
      .then((addresses) => {
        const values = Object.values(addresses).filter(Boolean);
        const evm = firstEvmAddress(addresses);
        const savedExternal = (() => {
          try {
            const saved = localStorage.getItem('aurelis_wallet_address') || '';
            return /^0x[a-fA-F0-9]{40}$/.test(saved) ? saved : '';
          } catch {
            return '';
          }
        })();
        const nextAddress = [evm,...values,savedExternal].find(value=>value && !isBotOnlyAddress(value)) || '';
        if (nextAddress) {
          setWalletAddress((current) => current || nextAddress);
          setIsWalletConnected(true);
        }
      })
      .catch(() => {
        try {
          const saved = localStorage.getItem('aurelis_wallet_address') || '';
          if (/^0x[a-fA-F0-9]{40}$/.test(saved) && !isBotOnlyAddress(saved)) {
            setWalletAddress((current) => current || saved);
            setIsWalletConnected(true);
          }
        } catch {}
      });

    if (!nativeSnapshot?.holdings?.length) {
      getLatestWalletPortfolio()
        .then((assets) => {
          setWalletHoldings(
            assets.filter(item => !isBotOnlyAddress(item.accountAddress)).map((item) => ({
              symbol: item.symbol,
              name: item.name,
              amount: item.amount,
              chain: item.chain,
              assetId: item.assetId,
              price: item.priceUsd,
              change24h: item.change24h,
              accountAddress: item.accountAddress,
              walletName: item.walletName,
              walletProfileId: item.walletProfileId,
              walletCanSign: item.walletCanSign,
            }))
          );
        })
        .catch(() => {});
    }

    return () => {
      window.removeEventListener('aurelis:native-wallet-context', onNativeContext as EventListener);
      window.removeEventListener('aurelis:wallet-authenticated', onWalletAuthenticated as EventListener);
      window.removeEventListener('aurelis:wallet-refresh', onWalletRefresh as EventListener);
      window.removeEventListener('aurelis:wallet-engine-ready', onWalletEngineReady as EventListener);
    };
  }, []);

  const selectedAssetHolding = selectedAssetKey
    ? walletHoldings.find((h) => `${h.symbol.toUpperCase()}::${String(h.chain || '').toUpperCase()}` === selectedAssetKey) ||
      walletHoldings.find((h) => h.symbol.toUpperCase() === selectedAssetKey.split('::')[0])
    : undefined;
  const selectedAssetCoin = selectedAssetHolding
    ? coins.find((c) => c.symbol.toUpperCase() === selectedAssetHolding.symbol.toUpperCase())
    : undefined;

  const openAssetPage = (coin: CoinData, holding?: WalletHolding) => {
    const match = holding || walletHoldings.find((h) => h.symbol.toUpperCase() === coin.symbol.toUpperCase());
    if (!match) return;
    setSelectedCoinId(coin.id);
    setSelectedAssetKey(`${match.symbol.toUpperCase()}::${String(match.chain || '').toUpperCase()}`);
  };

  const [tradeTargetCoin, setTradeTargetCoin] = useState<CoinData | undefined>();

  // Sync starred coins to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('aurelis_starred_coins', JSON.stringify(starredCoinIds));
      localStorage.setItem('aurelis_favorites', JSON.stringify(starredCoinIds));
    } catch {}
  }, [starredCoinIds]);

  // Theme Mode (Dark / Light)
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('aurelis_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    }
    return 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'light') {
      document.documentElement.classList.add('theme-light');
      document.documentElement.classList.remove('theme-dark');
    } else {
      document.documentElement.classList.add('theme-dark');
      document.documentElement.classList.remove('theme-light');
    }
    localStorage.setItem('aurelis_theme', theme);
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Widget Settings
  const [opacity, setOpacity] = useState<number>(96);
  const [isPinned, setIsPinned] = useState<boolean>(true);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [isManagerOpen, setIsManagerOpen] = useState<boolean>(false);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [pendingTradeAlert, setPendingTradeAlert] = useState<any | null>(null);
  const [backdropMode, setBackdropMode] = useState<'cyber' | 'desktop' | 'grid'>('cyber');
  const [latencyMs, setLatencyMs] = useState<number>(12);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Pop out independent standalone desktop widget window
  const handlePopoutWidget = () => {
    window.open(
      window.location.href,
      'AurelisHUDWidget',
      'width=475,height=620,menubar=no,toolbar=no,location=no,status=no,resizable=yes'
    );
  };

  // Load top 100 crypto markets in background on mount
  useEffect(() => {
    let isMounted = true;

    async function loadTopMarkets() {
      try {
        const topMarkets = await fetchTopCryptoMarkets();
        if (isMounted && topMarkets && topMarkets.length > 0) {
          setCoins((prev) => {
            const mergedMap = new Map<string, CoinData>();
            for (const c of prev) {
              mergedMap.set(c.id, c);
            }
            for (const tm of topMarkets) {
              const existing = mergedMap.get(tm.id);
              if (existing) {
                mergedMap.set(tm.id, {
                  ...existing,
                  price: tm.price || existing.price,
                  change24h: tm.change24h ?? existing.change24h,
                  volume24h: tm.volume24h || existing.volume24h,
                  marketCap: tm.marketCap || existing.marketCap,
                  sparkline: tm.sparkline.length > 0 ? tm.sparkline : existing.sparkline,
                  imageUrl: tm.imageUrl || existing.imageUrl,
                });
              } else {
                mergedMap.set(tm.id, tm);
              }
            }
            return Array.from(mergedMap.values());
          });
        }
      } catch {}
    }

    loadTopMarkets();
  }, []);

  // Fetch real data on mount and poll periodically
  useEffect(() => {
    let isMounted = true;

    async function loadRealData() {
      setIsSyncing(true);
      try {
        const liveData = await fetchLiveCryptoMarkets(coinsRef.current);
        if (isMounted && liveData && liveData.length > 0) {
          setCoins((prev) => {
            return prev.map((c) => {
              const match = liveData.find(
                (l) => l.symbol.toLowerCase() === c.symbol.toLowerCase()
              );
              if (!match) return c;
              return {
                ...c,
                price: match.price,
                change24h: match.change24h,
                volume24h: match.volume24h,
                high24h: match.high24h,
                low24h: match.low24h,
                sparkline: match.sparkline && match.sparkline.length > 0 ? match.sparkline : c.sparkline,
              };
            });
          });
        }
      } catch {
        // Ignore network errors gracefully
      } finally {
        if (isMounted) {
          setIsSyncing(false);
        }
      }
    }

    loadRealData();
    const intervalId = setInterval(loadRealData, 8000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  // Latency telemetry fluctuations (does NOT alter coin prices)
  useEffect(() => {
    const tickInterval = setInterval(() => {
      // Fluctuate telemetry latency realistically (10ms - 14ms)
      setLatencyMs(10 + Math.floor(Math.random() * 5));
    }, 3000);

    return () => clearInterval(tickInterval);
  }, []);

  // Filter tracked coins: ONLY coins the user has starred appear on the Watchlist
  const trackedCoins = useMemo(() => {
    return coins.filter((c) => starredCoinIds.includes(c.id));
  }, [coins, starredCoinIds]);

  // Selected coin for Chart
  const selectedCoin = useMemo(() => {
    return (
      coins.find((c) => c.id === selectedCoinId) ||
      trackedCoins[0] ||
      coins[0] ||
      INITIAL_COINS[0]
    );
  }, [coins, selectedCoinId, trackedCoins]);

  // Toggle star / presence on watchlist
  const handleToggleStar = (id: string) => {
    setStarredCoinIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Add token from online search into active coins and watchlist
  const handleAddOnlineCoin = (newCoin: CoinData) => {
    setCoins((prev) => {
      const exists = prev.some((c) => c.id === newCoin.id);
      const updated = exists ? prev : [newCoin, ...prev];
      try {
        const customCoins = updated.filter((c) => !INITIAL_COINS.some((ic) => ic.id === c.id));
        localStorage.setItem('aurelis_custom_coins', JSON.stringify(customCoins));
      } catch {}
      return updated;
    });

    // Star the coin so it immediately appears on the watchlist
    setStarredCoinIds((prev) => (prev.includes(newCoin.id) ? prev : [newCoin.id, ...prev]));
    setSelectedCoinId(newCoin.id);
    setChartViewMode('single-coin');
    setActiveTab('chart');
  };

  // Wallet & Trade Handlers
  const handleConnectWallet = (address?: string, provider?: string) => {
    const addr = address || walletAddress;
    if (!addr || isBotOnlyAddress(addr)) return;
    setIsWalletConnected(true);
    setWalletAddress(addr);
    try {
      localStorage.setItem('aurelis_wallet_connected', 'true');
      localStorage.setItem('aurelis_wallet_address', addr);
      if (provider) localStorage.setItem('aurelis_wallet_provider', provider);
    } catch {}
  };

  const handleDisconnectWallet = () => {
    setIsWalletConnected(false);
    setWalletAddress('');
    try {
      localStorage.setItem('aurelis_wallet_connected', 'false');
      localStorage.removeItem('aurelis_wallet_address');
      localStorage.removeItem('aurelis_wallet_provider');
    } catch {}
  };

  const handleOpenWallet = () => {
    setNavigationTab('wallet');
  };

  const handleOpenTrade = (coin?: CoinData) => {
    if (coin) setTradeTargetCoin(coin);
    setNavigationTab('trade');
  };

  const handleExecuteTrade = (
    paySymbol: string,
    payAmount: number,
    receiveSymbol: string,
    receiveAmount: number
  ) => {
    // 1. Update holdings
    setWalletHoldings((prev) => {
      const updated = [...prev];
      // Deduct pay
      const payIdx = updated.findIndex((h) => h.symbol.toUpperCase() === paySymbol.toUpperCase());
      if (payIdx >= 0) {
        const remaining = Math.max(0, updated[payIdx].amount - payAmount);
        updated[payIdx] = { ...updated[payIdx], amount: remaining };
      }
      // Add receive
      const recIdx = updated.findIndex((h) => h.symbol.toUpperCase() === receiveSymbol.toUpperCase());
      if (recIdx >= 0) {
        updated[recIdx] = { ...updated[recIdx], amount: updated[recIdx].amount + receiveAmount };
      } else {
        const foundCoin = coins.find((c) => c.symbol.toUpperCase() === receiveSymbol.toUpperCase());
        updated.push({
          symbol: receiveSymbol.toUpperCase(),
          name: foundCoin?.name || receiveSymbol,
          amount: receiveAmount,
        });
      }
      try {
        localStorage.setItem('aurelis_wallet_holdings', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    // 2. Record transaction
    const newTx: WalletTransaction = {
      id: `tx-${Date.now()}`,
      type: 'swap',
      fromSymbol: paySymbol,
      fromAmount: payAmount,
      toSymbol: receiveSymbol,
      toAmount: receiveAmount,
      timestamp: Date.now(),
      txHash: `0x${Math.random().toString(16).substring(2, 10)}${Math.random().toString(16).substring(2, 10)}`,
      status: 'confirmed',
    };

    setWalletTransactions((prev) => {
      const updated = [newTx, ...prev];
      try {
        localStorage.setItem('aurelis_wallet_txs', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  // Reset to default top starred coins
  const handleResetDefaults = () => {
    setStarredCoinIds(['bitcoin', 'ethereum', 'solana']);
  };

  // Select coin and switch to chart
  const handleSelectCoin = (coin: CoinData) => {
    setSelectedCoinId(coin.id);
    setChartViewMode('single-coin');
    setActiveTab('chart');
  };

  // Backdrop cycle
  const handleCycleBackdrop = () => {
    setBackdropMode((prev) => {
      if (prev === 'cyber') return 'desktop';
      if (prev === 'desktop') return 'grid';
      return 'cyber';
    });
  };

  const isPopout = typeof window !== 'undefined' && window.name === 'AurelisHUDWidget';

  const utilityParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const utilityKind =
    embeddedUtilityKind || (utilityParams?.get('utility') as 'chat' | 'notes' | 'livebet' | null);
  if (utilityKind && ['chat','notes','livebet'].includes(utilityKind)) {
    const requestedCoin = String(utilityParams?.get('coin') || '').toUpperCase();
    const utilityCoin = coins.find((coin) => coin.symbol.toUpperCase() === requestedCoin) || selectedCoin;
    return <DesktopUtilityWindow kind={utilityKind} coins={coins} selectedCoin={utilityCoin} />;
  }

  // Check for standalone isolated desk mode (?deskOnly=true or ?standalone=true)
  const isStandaloneDesk =
    typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).get('deskOnly') === 'true' ||
      new URLSearchParams(window.location.search).get('standalone') === 'true');

  if (isStandaloneDesk) {
    return (
      <div className="min-h-screen bg-surface-canvas text-text-primary p-2 sm:p-4 font-mono select-none">
        <div className="w-full flex items-center justify-between p-2.5 px-3.5 mb-2 bg-surface-panel/90 rounded-xl border border-white/10 text-xs shadow-md">
          <div className="flex items-center gap-2">
            <span className="text-primary-container font-bold">AURELIS / STANDALONE SIGNAL DESK</span>
            <span className="px-1.5 py-0.5 rounded bg-primary-container/20 text-primary-container text-[9px] font-bold">
              ISOLATED
            </span>
          </div>
          <a
            href={window.location.origin + window.location.pathname}
            className="text-[11px] text-text-muted hover:text-text-primary hover:underline"
          >
            ← Return to Full Aurelis Terminal
          </a>
        </div>
        <SignalDeskScreen
          coins={coins}
          onSelectCoin={handleSelectCoin}
          soundEnabled={soundEnabled}
          isStandalone={true}
        />
      </div>
    );
  }

  // Check for standalone isolated borrow desk mode (?borrowOnly=true or ?page=borrow)
  const isStandaloneBorrow =
    typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).get('borrowOnly') === 'true' ||
      new URLSearchParams(window.location.search).get('page') === 'borrow' ||
      new URLSearchParams(window.location.search).get('view') === 'borrow');

  if (isStandaloneBorrow) {
    return (
      <div className="min-h-screen bg-surface-canvas text-text-primary p-2 sm:p-4 font-mono select-none">
        <div className="max-w-[1720px] mx-auto w-full flex items-center justify-between p-2.5 px-3.5 mb-2 bg-surface-panel/90 rounded-xl border border-white/10 text-xs shadow-md">
          <div className="flex items-center gap-2">
            <span className="text-primary-container font-bold">AURELIS / STANDALONE BORROW DESK</span>
            <span className="px-1.5 py-0.5 rounded bg-primary-container/20 text-primary-container text-[9px] font-bold">
              ISOLATED
            </span>
          </div>
          <a
            href={window.location.origin + window.location.pathname}
            className="text-[11px] text-text-muted hover:text-text-primary hover:underline"
          >
            ← Return to Full Aurelis Terminal
          </a>
        </div>
        <EarnBorrowScreen
          soundEnabled={soundEnabled}
          coins={coins}
          isWalletConnected={isWalletConnected}
          onConnectWallet={handleConnectWallet}
          onNavigate={setNavigationTab}
          isStandalone={true}
        />
      </div>
    );
  }

  const swapWidgetParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isStandaloneSwapWidget = Boolean(
    swapWidgetParams?.get('swapWidgets') === 'true' || swapWidgetParams?.get('swapWidget')
  );

  if (isStandaloneSwapWidget) {
    return <MobileSwapWidgetPage providerId={swapWidgetParams?.get('swapWidget')} />;
  }

  // Check for standalone isolated wallet access mode (?walletOnly=true or ?page=wallet)
  const isStandaloneWallet =
    typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).get('walletOnly') === 'true' ||
      new URLSearchParams(window.location.search).get('page') === 'wallet' ||
      new URLSearchParams(window.location.search).get('view') === 'wallet');

  if (isStandaloneWallet) {
    return (
      <div className="min-h-screen bg-surface-canvas text-text-primary p-2 sm:p-4 font-mono select-none">
        <div className="max-w-[1720px] mx-auto w-full flex items-center justify-between p-2.5 px-3.5 mb-2 bg-surface-panel/90 rounded-xl border border-white/10 text-xs shadow-md">
          <div className="flex items-center gap-2">
            <span className="text-primary-container font-bold">AURELIS / STANDALONE WALLET & WEB ACCESS</span>
            <span className="px-1.5 py-0.5 rounded bg-primary-container/20 text-primary-container text-[9px] font-bold">
              ISOLATED
            </span>
          </div>
          <a
            href={window.location.origin + window.location.pathname}
            className="text-[11px] text-text-muted hover:text-text-primary hover:underline"
          >
            ← Return to Full Aurelis Terminal
          </a>
        </div>
        <WalletScreen
          coins={coins}
          isConnected={isWalletConnected}
          onConnect={handleConnectWallet}
          onDisconnect={handleDisconnectWallet}
          walletAddress={walletAddress}
          holdings={walletHoldings}
          transactions={walletTransactions}
          onOpenTrade={(coin) => {
            if (coin) setTradeTargetCoin(coin);
            setNavigationTab('trade');
          }}
          onOpenAsset={openAssetPage}
          onNavigate={setNavigationTab}
          soundEnabled={soundEnabled}
          theme={theme}
          isStandalone={true}
        />
      </div>
    );
  }

  // Check for standalone isolated trade/bots modes (?radarOnly=true, ?hunterOnly=true, etc. or ?tradeTab=...)
  const isStandaloneTrade =
    typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).get('tradeOnly') === 'true' ||
      new URLSearchParams(window.location.search).get('radarOnly') === 'true' ||
      new URLSearchParams(window.location.search).get('hunterOnly') === 'true' ||
      new URLSearchParams(window.location.search).get('scopeOnly') === 'true' ||
      new URLSearchParams(window.location.search).get('dcaOnly') === 'true' ||
      new URLSearchParams(window.location.search).get('gridOnly') === 'true' ||
      new URLSearchParams(window.location.search).get('arbitrageOnly') === 'true' ||
      new URLSearchParams(window.location.search).get('botsOnly') === 'true' ||
      new URLSearchParams(window.location.search).get('page') === 'trade' ||
      new URLSearchParams(window.location.search).get('page') === 'bots');

  if (isStandaloneTrade) {
    const params = new URLSearchParams(window.location.search);
    let initialTab: any = 'radar';
    if (params.get('radarOnly') === 'true') initialTab = 'radar';
    else if (params.get('hunterOnly') === 'true') initialTab = 'hunter';
    else if (params.get('scopeOnly') === 'true') initialTab = 'scope';
    else if (params.get('dcaOnly') === 'true') initialTab = 'dca';
    else if (params.get('gridOnly') === 'true') initialTab = 'grid';
    else if (params.get('arbitrageOnly') === 'true') initialTab = 'arbitrage';
    else if (params.get('tradeTab')) initialTab = params.get('tradeTab');

    return (
      <div className="min-h-screen bg-surface-canvas text-text-primary p-2 sm:p-4 font-mono select-none">
        <div className="max-w-[1720px] mx-auto w-full flex items-center justify-between p-2.5 px-3.5 mb-2 bg-surface-panel/90 rounded-xl border border-white/10 text-xs shadow-md">
          <div className="flex items-center gap-2">
            <span className="text-primary-container font-bold">AURELIS / STANDALONE TRADE & BOTS DESK</span>
            <span className="px-1.5 py-0.5 rounded bg-primary-container/20 text-primary-container text-[9px] font-bold">
              ISOLATED
            </span>
          </div>
          <a
            href={window.location.origin + window.location.pathname}
            className="text-[11px] text-text-muted hover:text-text-primary hover:underline"
          >
            ← Return to Full Aurelis Terminal
          </a>
        </div>
        <TradeScreen
          coins={coins}
          initialPayCoin={tradeTargetCoin || selectedCoin}
          initialSubTab={initialTab}
          isConnected={isWalletConnected}
          walletAddress={walletAddress}
          holdings={walletHoldings}
          onExecuteTrade={handleExecuteTrade}
          onOpenWallet={() => setNavigationTab('wallet')}
          onNavigate={setNavigationTab}
          soundEnabled={soundEnabled}
          theme={theme}
        />
      </div>
    );
  }

  const isDesktopApp = typeof window !== 'undefined' && (Boolean((window as any).AurelisDesktop?.isDesktop) || new URLSearchParams(window.location.search).get('desktop') === '1');
  const isOneKeyHost = typeof window !== 'undefined' && (() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('walletHost') === 'onekey' || params.get('desktop') === '1';
  })();

  return (
    <div
      data-theme={theme}
      style={isOneKeyHost ? { paddingTop: 30 } : undefined}
      className={`theme-${theme} min-h-screen w-full flex flex-col items-center justify-center ${
        isPopout ? 'p-0' : 'p-3 sm:p-6'
      } transition-all duration-300 relative overflow-hidden select-none ${
        isDesktopApp
          ? (theme === 'light' ? 'bg-transparent text-[#0f172a]' : 'bg-transparent text-text-primary')
          : theme === 'light'
          ? 'bg-[#e2e8f0] text-[#0f172a]'
          : backdropMode === 'cyber'
          ? 'bg-surface-base text-text-primary'
          : backdropMode === 'desktop'
          ? 'bg-[#0a0f16] text-text-primary'
          : 'bg-[#080d14] text-text-primary'
      }`}
    >
      {/* Background Decor */}
      {!isPopout && !isDesktopApp && theme === 'light' && (
        <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_65%_60%_at_50%_45%,rgba(5,150,105,0.08),rgba(226,232,240,0.98))] z-0" />
      )}

      {!isPopout && !isDesktopApp && theme === 'dark' && backdropMode === 'cyber' && (
        <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_65%_60%_at_50%_45%,rgba(0,245,160,0.08),rgba(6,9,14,0.98))] z-0" />
      )}

      {!isPopout && !isDesktopApp && theme === 'dark' && backdropMode === 'desktop' && (
        <div className="fixed inset-0 pointer-events-none z-0">
          {/* Windows 11 Cyber Glow wallpaper ambiance */}
          <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] rounded-full bg-cyan-600/10 blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/3 w-[450px] h-[450px] rounded-full bg-emerald-600/10 blur-[130px]" />
          <div className="absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:24px_24px] opacity-25" />
        </div>
      )}

      {!isPopout && !isDesktopApp && theme === 'dark' && backdropMode === 'grid' && (
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0d_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0d_1px,transparent_1px)] bg-[size:32px_32px] opacity-40" />
          <div className="absolute inset-0 bg-radial from-transparent to-surface-base" />
        </div>
      )}

      {/* MINIMIZED DESKTOP HUD DOCK PILL */}
      {isMinimized ? (
        <div className="relative z-20 flex items-center gap-3 bg-surface-canvas backdrop-blur-2xl px-4 py-2 rounded-full border border-primary-container/40 shadow-[0_12px_40px_rgba(0,0,0,0.85),0_0_20px_rgba(0,245,160,0.2)] animate-in zoom-in-95 duration-150">
          <div className="flex items-center gap-2">
            <AurelisLogo variant="mark-only" className="w-4 h-4 text-primary-container" color="currentColor" />
            <span className="font-headline font-bold text-[12px] text-text-primary uppercase tracking-wider">
              AURELIS
            </span>
          </div>

          <div className="h-4 w-px bg-white/20" />

          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="text-cyan-400 font-bold">{selectedCoin.symbol}</span>
            <span className="text-text-primary font-bold">{formatCurrency(selectedCoin.price)}</span>
            <span
              className={`font-semibold ${
                selectedCoin.change24h >= 0 ? 'text-oracle-synced' : 'text-status-error'
              }`}
            >
              {selectedCoin.change24h >= 0 ? '▲ +' : '▼ '}
              {Math.abs(selectedCoin.change24h).toFixed(1)}%
            </span>
          </div>

          <button
            onClick={() => {
              if (soundEnabled) playHudSound('click');
              setIsMinimized(false);
            }}
            className="p-1 rounded-full hover:bg-white/10 text-primary-container transition-colors ml-1 cursor-pointer"
            title="Restore Aurelis Window"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        /* FLOATING DESKTOP CYBERNETIC HUD WIDGET */
        <div
          id="hudWidget"
          style={{ opacity: opacity / 100 }}
          className={`relative z-10 w-full ${
            isPopout ? 'h-screen max-w-full rounded-none border-none' : isMaximized ? 'max-w-4xl rounded-2xl' : 'max-w-2xl rounded-2xl'
          } ${isDesktopApp && !isPopout ? 'h-[calc(100vh-24px)] max-h-[calc(100vh-24px)]' : ''} bg-surface-canvas backdrop-blur-2xl border border-white/10 ${
            theme === 'light'
              ? 'shadow-[0_20px_45px_rgba(15,23,42,0.12),0_0_15px_rgba(5,150,105,0.08)]'
              : 'shadow-[0_24px_50px_rgba(0,0,0,0.85),0_0_24px_rgba(0,245,160,0.14)]'
          } overflow-hidden flex flex-col transition-all duration-200 pb-28 md:pb-2`}
        >
          {/* 1. TitleBar with Home navigation on Aurelis Logo */}
          <TitleBar
            opacity={opacity}
            onOpacityChange={setOpacity}
            theme={theme}
            onToggleTheme={handleToggleTheme}
            latencyMs={latencyMs}
            isMinimized={isMinimized}
            onToggleMinimize={() => setIsMinimized(true)}
            isMaximized={isMaximized}
            onToggleMaximize={() => setIsMaximized(!isMaximized)}
            soundEnabled={soundEnabled}
            onToggleSound={() => setSoundEnabled(!soundEnabled)}
            backdropMode={backdropMode}
            onCycleBackdrop={handleCycleBackdrop}
            onOpenGuide={() => setIsGuideOpen(true)}
            onGoHome={() => setNavigationTab('home')}
            onPopoutWidget={handlePopoutWidget}
            isWalletConnected={isWalletConnected}
            onOpenWallet={() => {
              setMarketsDropdownTab(null);
              setNavigationTab('wallet');
            }}
            onOpenTradeAlert={(setup) => {
              setPendingTradeAlert({ ...setup, _openedAt: Date.now() });
              setMarketsDropdownTab(null);
              setNavigationTab('ai');
            }}
          />

          {/* Desktop Top Navigation Bar (Active on Desktop/Tablet, Hidden on Mobile Phone) */}
          <DesktopTopNav
            activeTab={navigationTab}
            onSelectTab={(tab) => {
              setMarketsDropdownTab(null);
              setNavigationTab(tab);
            }}
            soundEnabled={soundEnabled}
            isWalletConnected={isWalletConnected}
          />

          {/* 2. Top Segmented Tab Selector (Chart, Watch, Heatmap) + Continuous Ticker Running Under Buttons */}
          <TabSelector
            activeTab={marketsDropdownTab}
            onSelectTab={(tab) => {
              if (soundEnabled) playHudSound('switch');
              setMarketsDropdownTab((prev) => (prev === tab ? null : tab));
            }}
            onToggleManager={() => setIsManagerOpen(!isManagerOpen)}
            isManagerOpen={isManagerOpen}
            activeCount={starredCoinIds.length}
            soundEnabled={soundEnabled}
            isWalletConnected={isWalletConnected}
            coins={coins}
            starredCoins={trackedCoins}
            onSelectCoin={(coin) => {
              handleSelectCoin(coin);
              setChartViewMode('single-coin');
              setMarketsDropdownTab('chart');
            }}
          />

          {/* Expandable Drawer: Watchlist Roster Manager */}
          {isManagerOpen && (
            <CoinManagerDrawer
              coins={coins}
              selectedCoinIds={starredCoinIds}
              onToggleCoin={handleToggleStar}
              onAddOnlineCoin={handleAddOnlineCoin}
              onClose={() => setIsManagerOpen(false)}
              soundEnabled={soundEnabled}
              onResetDefaults={handleResetDefaults}
            />
          )}

          {/* 2.5 MARKETS TOP DROPDOWN: Chart, Watchlist, Heatmap (Drops down over current page) */}
          {marketsDropdownTab !== null && (
            <div
              id="markets-top-dropdown"
              className="relative w-full z-30 bg-surface-panel/95 backdrop-blur-2xl border-b border-primary-container/20 shadow-[0_16px_40px_rgba(0,0,0,0.8)] animate-in slide-in-from-top-3 duration-200"
            >
              {/* Dropdown Control Header */}
              <div className="flex items-center justify-between px-3 py-1.5 bg-surface-base/90 border-b border-white/5 text-[11px] font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary-container shadow-[0_0_8px_rgba(0,245,160,0.8)] animate-pulse" />
                  <span className="font-bold text-text-primary uppercase tracking-wide flex items-center gap-1.5">
                    {marketsDropdownTab === 'chart' && (
                      <>
                        <span>CHART ANALYZER</span>
                        <span className="text-text-muted">•</span>
                        <span className="text-primary-container">{selectedCoin.symbol}</span>
                        <span className="text-[10px] text-text-secondary font-normal">${formatCurrency(selectedCoin.price)}</span>
                      </>
                    )}
                    {marketsDropdownTab === 'watchlist' && (
                      <>
                        <span>WATCHLIST ROSTER</span>
                        <span className="text-text-muted">•</span>
                        <span className="text-primary-container">{trackedCoins.length} ASSETS</span>
                      </>
                    )}
                    {marketsDropdownTab === 'heatmap' && (
                      <>
                        <span>MARKET HEATMAP</span>
                        <span className="text-text-muted">•</span>
                        <span className="text-primary-container">24H PERFORMANCE</span>
                      </>
                    )}
                  </span>
                  <span className="text-[9.5px] text-text-muted hidden sm:inline px-1.5 py-0.5 rounded bg-white/5 border border-white/5">
                    Drop-down over {navigationTab.toUpperCase()}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {marketsDropdownTab === 'chart' && (
                    <button
                      type="button"
                      onClick={() => {
                        if (soundEnabled) playHudSound('click');
                        setChartViewMode(chartViewMode === 'all-starred' ? 'single-coin' : 'all-starred');
                      }}
                      className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                    >
                      {chartViewMode === 'all-starred' ? 'Focus Single' : 'Show All Starred'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (soundEnabled) playHudSound('switch');
                      setMarketsDropdownTab(null);
                    }}
                    className="flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-primary-container/15 hover:bg-primary-container/25 border border-primary-container/30 text-primary-container text-[10.5px] font-bold cursor-pointer transition-colors"
                    title="Collapse to current page"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>Collapse</span>
                  </button>
                </div>
              </div>

              {/* Dropdown Body: Full Screen Components */}
              <div className="p-2 sm:p-3 max-h-[580px] overflow-y-auto">
                {marketsDropdownTab === 'chart' && (
                  <ChartScreen
                    coin={selectedCoin}
                    starredCoins={trackedCoins}
                    onSelectCoin={handleSelectCoin}
                    viewMode={chartViewMode}
                    onViewModeChange={setChartViewMode}
                    timeframe={timeframe}
                    onTimeframeChange={setTimeframe}
                    soundEnabled={soundEnabled}
                    theme={theme}
                    isStarred={starredCoinIds.includes(selectedCoin.id)}
                    onToggleStar={handleToggleStar}
                    onOpenManager={() => setIsManagerOpen(true)}
                    onOpenTrade={(coin) => {
                      if (coin) handleSelectCoin(coin);
                      setMarketsDropdownTab(null);
                      setNavigationTab('trade');
                    }}
                    onOpenWallet={() => {
                      setMarketsDropdownTab(null);
                      setNavigationTab('wallet');
                    }}
                  />
                )}

                {marketsDropdownTab === 'watchlist' && (
                  <WatchlistScreen
                    coins={trackedCoins}
                    selectedCoinId={selectedCoinId}
                    onSelectCoin={(coin) => {
                      handleSelectCoin(coin);
                      setChartViewMode('single-coin');
                      setMarketsDropdownTab('chart');
                    }}
                    favorites={starredCoinIds}
                    onToggleFavorite={handleToggleStar}
                    onOpenManager={() => setIsManagerOpen(true)}
                    soundEnabled={soundEnabled}
                  />
                )}

                {marketsDropdownTab === 'heatmap' && (
                  <HeatmapScreen
                    coins={coins}
                    onSelectCoin={(coin) => {
                      handleSelectCoin(coin);
                      setChartViewMode('single-coin');
                      setMarketsDropdownTab('chart');
                    }}
                    soundEnabled={soundEnabled}
                  />
                )}
              </div>

              {/* Slim Bottom Collapse Handle */}
              <div
                onClick={() => {
                  if (soundEnabled) playHudSound('switch');
                  setMarketsDropdownTab(null);
                }}
                className="w-full py-1.5 bg-surface-base/95 hover:bg-surface-base border-t border-white/5 flex items-center justify-center gap-1.5 text-[10px] font-mono font-medium text-text-muted hover:text-primary-container cursor-pointer transition-colors group"
                title="Click to collapse dropdown"
              >
                <ChevronUp className="w-3.5 h-3.5 transition-transform group-hover:-translate-y-0.5" />
                <span>COLLAPSE TO {navigationTab.toUpperCase()}</span>
                <ChevronUp className="w-3.5 h-3.5 transition-transform group-hover:-translate-y-0.5" />
              </div>
            </div>
          )}

          {/* 3. Main Display Screen */}
          <div className="relative w-full overflow-y-auto overflow-x-hidden min-h-0 p-2 sm:p-3 flex flex-col justify-between flex-1">
            {selectedAssetCoin && selectedAssetHolding ? (
              <AssetTemplateScreen
                coin={selectedAssetCoin}
                holding={selectedAssetHolding}
                address={selectedAssetHolding.accountAddress || (window as any).__aurelisNativeWalletSnapshot?.addresses?.[String(selectedAssetHolding.chain || '').toLowerCase()] || walletAddress}
                onBack={() => setSelectedAssetKey(null)}
                onOpenTrade={(coin) => {
                  setTradeTargetCoin(coin);
                  setSelectedAssetKey(null);
                  setNavigationTab('trade');
                }}
                onNavigate={(tab) => {
                  setSelectedAssetKey(null);
                  setNavigationTab(tab);
                }}
              />
            ) : (
              <>
            {/* HOME SCREEN: Portfolio Balance, Green/Red PnL, Coins I Own, Multi-Source News */}
            {navigationTab === 'home' && (
              <HomeScreen
                coins={coins}
                holdings={walletHoldings}
                onSelectCoin={(coin, holding) => {
                  openAssetPage(coin, holding);
                }}
                onNavigate={(dest) => {
                  if (dest === 'chart') {
                    setMarketsDropdownTab('chart');
                  } else {
                    setNavigationTab(dest);
                  }
                }}
                soundEnabled={soundEnabled}
                walletAddress={walletAddress}
              />
            )}

            {/* SIGNAL DESK / LIVE CHART ANALYST (Compact HUD Version of Signal Desk) */}
            {navigationTab === 'signals' && (
              <SignalDeskScreen
                coins={coins}
                onSelectCoin={(coin) => {
                  openAssetPage(coin);
                }}
                soundEnabled={soundEnabled}
              />
            )}

            {/* TRADE SCREEN: Spot Swap / Instant Trade */}
            {navigationTab === 'trade' && (
              <TradeScreen
                coins={coins}
                initialPayCoin={tradeTargetCoin || selectedCoin}
                isConnected={isWalletConnected}
                walletAddress={walletAddress}
                holdings={walletHoldings}
                onExecuteTrade={handleExecuteTrade}
                onOpenWallet={() => setNavigationTab('wallet')}
                onNavigate={setNavigationTab}
                soundEnabled={soundEnabled}
                theme={theme}
              />
            )}

            {/* STOCKS SCREEN: Native AURELIS UI with Alpaca execution */}
            {navigationTab === 'stocks' && (
              <StocksScreen soundEnabled={soundEnabled} />
            )}

            {/* WALLET SCREEN: Web3 Wallet & Balances */}
            {navigationTab === 'wallet' && (
              <WalletScreen
                coins={coins}
                isConnected={isWalletConnected}
                onConnect={handleConnectWallet}
                onDisconnect={handleDisconnectWallet}
                walletAddress={walletAddress}
                holdings={walletHoldings}
                transactions={walletTransactions}
                onOpenTrade={(coin) => {
                  if (coin) setTradeTargetCoin(coin);
                  setSelectedAssetKey(null);
                  setNavigationTab('trade');
                }}
                onOpenAsset={openAssetPage}
                onNavigate={(tab) => {
                  setSelectedAssetKey(null);
                  setNavigationTab(tab);
                }}
                soundEnabled={soundEnabled}
                theme={theme}
              />
            )}

            {/* AI SCREEN: Aurelis AI Market Intelligence & Copilot */}
            {navigationTab === 'ai' && (
              <AiScreen
                coins={coins}
                selectedCoin={selectedCoin}
                onSelectCoin={handleSelectCoin}
                onNavigate={setNavigationTab}
                soundEnabled={soundEnabled}
                theme={theme}
                initialTradeAlert={pendingTradeAlert}
              />
            )}

            {/* EARN / BORROW SCREEN: Lending, APYs, Collateral, Health Factor */}
            {navigationTab === 'earn-borrow' && (
              <EarnBorrowScreen
                soundEnabled={soundEnabled}
                coins={coins}
                isWalletConnected={isWalletConnected}
                onConnectWallet={handleConnectWallet}
                onNavigate={setNavigationTab}
              />
            )}

            {/* PREDICTIONS SCREEN: Prediction Markets */}
            {navigationTab === 'predictions' && (
              <PredictionsScreen soundEnabled={soundEnabled} />
            )}

            {/* PERPS SCREEN: Perpetual Futures DEX with Leverage */}
            {navigationTab === 'perps' && (
              <PerpsScreen soundEnabled={soundEnabled} />
            )}

            {/* Fallback for legacy navigationTab === 'markets' */}
            {navigationTab === 'markets' && (
              <HomeScreen
                coins={coins}
                holdings={walletHoldings}
                onSelectCoin={(coin) => {
                  handleSelectCoin(coin);
                  setChartViewMode('single-coin');
                  setMarketsDropdownTab('chart');
                }}
                onNavigate={(dest) => {
                  if (dest === 'chart') {
                    setMarketsDropdownTab('chart');
                  } else {
                    setNavigationTab(dest as NavigationTab);
                  }
                }}
                soundEnabled={soundEnabled}
                walletAddress={walletAddress}
              />
            )}
              </>
            )}
          </div>

          {/* 4. Footer Status Bar */}
          <FooterBar isSyncing={isSyncing} />

          {/* 5. Bottom Navigation Dock: Home, Trade, Wallet, Earn/Borrow, Predictions, Perps */}
          <BottomNav
            activeTab={navigationTab}
            onSelectTab={setNavigationTab}
            soundEnabled={soundEnabled}
            isWalletConnected={isWalletConnected}
          />
        </div>
      )}

      <div className="md:hidden fixed left-0 right-0 bottom-[62px] z-[10040] pointer-events-none">
        <div className="max-w-md mx-auto pointer-events-auto">
          <MobileAiChatBar
            coins={coins}
            selectedCoin={selectedCoin}
            soundEnabled={soundEnabled}
          />
        </div>
      </div>

      {!isPopout && (
        <>
          <AiChatDock coins={coins} selectedCoin={selectedCoin} soundEnabled={soundEnabled} holdings={walletHoldings} onNavigate={setNavigationTab} />
          <SwapWidgetDock />
        </>
      )}

      {/* Windows Desktop Widget Guide Modal */}
      <WindowsWidgetGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        soundEnabled={soundEnabled}
        onPopoutWidget={handlePopoutWidget}
      />
    </div>
  );
}

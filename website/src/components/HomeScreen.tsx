import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  TrendingUp,
  TrendingDown,
  Eye,
  EyeOff,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  Landmark,
  ExternalLink,
  Clock,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  Newspaper,
  Plus,
  X,
  Copy,
  Check,
  ChevronDown,
} from 'lucide-react';
import { CoinData, CryptoNewsArticle, WalletHolding } from '../types';
import { formatCurrency, playHudSound } from '../services/marketData';
import { CoinIcon } from './CoinIcon';
import { QRCodeSVG } from 'qrcode.react';
import { getNativeWalletAddresses, getWalletReceiveOptions, WalletAddressMap } from '../services/walletApi';
import { sendWalletConnectAssetTransfer } from '../services/walletConnectService';
import { openOneKeyAction } from './OneKeyActionRouter';


function openOneKeyNativeReceive(): boolean {
  if (typeof window === 'undefined') return false;
  const message = JSON.stringify({ source: 'aurelis-web', type: 'open-onekey-receive' });
  const rnWebView = (window as any).ReactNativeWebView;
  if (rnWebView && typeof rnWebView.postMessage === 'function') {
    rnWebView.postMessage(message);
    return true;
  }
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(message, '*');
    return true;
  }
  return false;
}

interface HomeScreenProps {
  coins: CoinData[];
  holdings: WalletHolding[];
  onSelectCoin: (coin: CoinData, holding?: WalletHolding) => void;
  onNavigate: (tab: 'trade' | 'wallet' | 'earn-borrow' | 'predictions' | 'perps' | 'chart') => void;
  soundEnabled: boolean;
  walletAddress?: string;
}

function holdingIdentity(holding: WalletHolding): string {
  const chain = (holding.chain || 'unknown').trim().toLowerCase();
  const assetRef = (holding.assetId || holding.tokenAddress || '').trim().toLowerCase();
  const fallback = `${holding.symbol.trim().toLowerCase()}:${holding.name.trim().toLowerCase()}`;
  return `${chain}:${assetRef || fallback}`;
}

// Curated multi-source crypto news with rich topical imagery
export const HomeScreen: React.FC<HomeScreenProps> = ({
  coins,
  holdings,
  onSelectCoin,
  onNavigate,
  soundEnabled,
  walletAddress = '',
}) => {
  const [showBalance, setShowBalance] = useState(true);
  const [selectedNews, setSelectedNews] = useState<CryptoNewsArticle | null>(null);
  const [newsArticles, setNewsArticles] = useState<CryptoNewsArticle[]>([]);
  const [mobileHomeView, setMobileHomeView] = useState<'overview' | 'assets' | 'news'>('overview');
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [nativeAddresses, setNativeAddresses] = useState<WalletAddressMap>({});
  const [receiveNetwork, setReceiveNetwork] = useState('ETH');
  const [receivePickerOpen, setReceivePickerOpen] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [sendAssetKey, setSendAssetKey] = useState('');
  const [sendPickerOpen, setSendPickerOpen] = useState(false);
  const [sendRecipient, setSendRecipient] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendTxHash, setSendTxHash] = useState('');

  useEffect(() => {
    let mounted = true;

    const loadNews = () => {
      fetch('/api/crypto-news', { cache: 'no-store' })
        .then((res) => res.json())
        .then((rows) => {
          if (!mounted || !Array.isArray(rows)) return;
          const now = Date.now();
          const mapped = rows.map((item: any, index: number) => {
            const publishedMs = Date.parse(item.published || '') || now;
            const minutes = Math.max(1, Math.floor((now - publishedMs) / 60000));
            const timeAgo = minutes < 60 ? minutes + 'm ago' : Math.floor(minutes / 60) + 'h ago';
            return {
              id: 'live-news-' + index + '-' + publishedMs,
              title: String(item.title || 'Crypto market update'),
              source: String(item.source || 'Crypto News'),
              sourceColor: '#64748b',
              timeAgo,
              imageUrl: String(item.image || ''),
              summary: 'Open the story for the full report.',
              sentiment: 'neutral' as const,
              category: 'Market' as const,
              readTime: 'Live',
              url: String(item.url || ''),
            };
          });
          setNewsArticles(mapped);
        })
        .catch(() => {});
    };

    loadNews();
    const timer = window.setInterval(loadNews, 5 * 60 * 1000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    getNativeWalletAddresses()
      .then((addresses) => {
        if (active) setNativeAddresses(addresses);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!showReceiveModal && !showSendModal && !selectedNews) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showReceiveModal, showSendModal, selectedNews]);

  // Compute live portfolio balance and 24h PnL from real coin prices
  const { totalBalance, pnl24hUsd, pnl24hPercent, enrichedHoldings } = useMemo(() => {
    let balance = 0;
    let prevBalance = 0;
    const seenHoldings = new Set<string>();
    const uniqueHoldings = holdings.filter((h) => {
      const identity = holdingIdentity(h);
      const account = (h.accountAddress || '').trim().toLowerCase();
      const fingerprint = `${identity}:${account}:${h.amount}:${h.balanceText || ''}:${h.balanceEquivalent || ''}`;
      if (seenHoldings.has(fingerprint)) return false;
      seenHoldings.add(fingerprint);
      return true;
    });

    const enriched = uniqueHoldings.map((h) => {
      // Find matching live market coin
      const coin = coins.find(
        (c) => c.symbol.toUpperCase() === h.symbol.toUpperCase()
      );

      // Prefer the live market feed, but fall back to the real wallet snapshot.
      // Some owned assets are not present in the current market list even though Gem
      // already supplied their price/change data.
      const price = Number(coin?.price ?? h.price ?? 0);
      const change24h = Number(coin?.change24h ?? h.change24h ?? 0);

      const value = h.amount * price;
      const prevPrice = price / (1 + change24h / 100);
      const prevValue = h.amount * prevPrice;

      balance += value;
      prevBalance += prevValue;

      return {
        ...h,
        id: `${holdingIdentity(h)}:${(h.accountAddress || '').trim().toLowerCase()}:${h.amount}`,
        color: coin?.color || '#64748b',
        livePrice: price,
        change24h,
        totalValue: value,
        matchingCoin: coin,
      };
    });

    const pnlUsd = balance - prevBalance;
    const pnlPct = prevBalance > 0 ? (pnlUsd / prevBalance) * 100 : 0;
    const visibleHoldings = enriched.filter((holding) => {
      const isNativeEthDust = holding.symbol.toUpperCase() === 'ETH' && holding.totalValue < 0.25;
      return !isNativeEthDust;
    });

    return {
      totalBalance: balance,
      pnl24hUsd: pnlUsd,
      pnl24hPercent: pnlPct,
      enrichedHoldings: visibleHoldings,
    };
  }, [coins, holdings]);

  const isPositivePnl = pnl24hUsd >= 0;

  const filteredNews = newsArticles;

  const receiveOptions = useMemo(
    () => getWalletReceiveOptions(nativeAddresses, walletAddress),
    [nativeAddresses, walletAddress]
  );

  useEffect(() => {
    if (receiveOptions.length && !receiveOptions.some((item) => item.key === receiveNetwork)) {
      setReceiveNetwork(receiveOptions[0].key);
    }
  }, [receiveOptions, receiveNetwork]);

  const selectedReceiveAddress =
    receiveOptions.find((item) => item.key === receiveNetwork)?.address ||
    walletAddress;

  const sendAssetOptions = holdings
    .filter((item) => Number(item.amount) > 0)
    .map((item) => {
      const network = String(item.chain || 'AURELIS');
      return {
        key: `${item.symbol.toUpperCase()}::${network.toUpperCase()}`,
        symbol: item.symbol,
        network,
        assetId: item.assetId || '',
        amount: Number(item.amount),
      };
    });

  const selectedSendAsset =
    sendAssetOptions.find((item) => item.key === sendAssetKey) || sendAssetOptions[0];

  const isOneKeyHost = typeof window !== 'undefined' && (() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('walletHost') === 'onekey' || params.get('desktop') === '1';
  })();

  const openSendModal = () => {
    if (soundEnabled) playHudSound('click');
    openOneKeyAction('send', () => {
      if (isOneKeyHost) {
        setSendError('OneKey signing is not connected to AURELIS Send. Complete the transfer inside OneKey.');
        setShowSendModal(true);
        return;
      }
      const bridge = (window as any).AurelisNative;
      if (bridge && typeof bridge.openNativeScreen === 'function') {
        bridge.openNativeScreen('send');
        return;
      }
      if (!sendAssetKey && sendAssetOptions[0]) setSendAssetKey(sendAssetOptions[0].key);
      setShowSendModal(true);
    });
  };

  const submitSendApproval = async () => {
    if (!selectedSendAsset || !sendRecipient || !sendAmount || isSending) return;
    const w = window as any;
    w.__aurelisPendingSend = {
      assetId: selectedSendAsset.assetId,
      symbol: selectedSendAsset.symbol,
      network: selectedSendAsset.network,
      recipient: sendRecipient,
      amount: sendAmount,
    };

    const bridge = w.AurelisNative;
    if (bridge && typeof bridge.openNativeScreen === 'function' && selectedSendAsset.assetId) {
      bridge.openNativeScreen(
        'send-prefill:' + JSON.stringify({
          assetId: selectedSendAsset.assetId,
          recipient: sendRecipient,
          amount: sendAmount,
        }),
      );
      return;
    }

    setIsSending(true);
    setSendError(null);
    setSendTxHash('');
    try {
      const sent = await sendWalletConnectAssetTransfer({
        network: selectedSendAsset.network,
        assetId: selectedSendAsset.assetId,
        symbol: selectedSendAsset.symbol,
        recipient: sendRecipient,
        amount: sendAmount,
      });
      setSendTxHash(sent.txHash);
      window.dispatchEvent(new CustomEvent('aurelis:wallet-refresh'));
    } catch (error: any) {
      setSendError(error?.message || 'Transaction was not broadcast');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 p-3 sm:p-5 max-w-4xl mx-auto w-full select-none pb-20 animate-in fade-in duration-200">
      {/* ========================================================================= */}
      {/* 1. PORTFOLIO BALANCE CARD WITH DYNAMIC GREEN / RED PNL */}
      {/* ========================================================================= */}
      <section
        id="portfolio-balance-card"
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-surface-panel via-surface-panel/90 to-surface-container-high/40 border border-white/10 p-5 shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
      >
        {/* Cybernetic background glow */}
        <div
          className={`absolute -right-16 -top-16 w-56 h-56 rounded-full blur-3xl pointer-events-none opacity-20 ${
            isPositivePnl ? 'bg-primary-container' : 'bg-status-error'
          }`}
        />

        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-medium text-text-muted tracking-wider uppercase">
              Total Portfolio Balance
            </span>
            <button
              type="button"
              onClick={() => {
                if (soundEnabled) playHudSound('click');
                setShowBalance(!showBalance);
              }}
              className="text-text-muted hover:text-text-primary transition-colors cursor-pointer p-0.5 rounded"
              title={showBalance ? 'Hide Balance' : 'Show Balance'}
            >
              {showBalance ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-container/60 border border-white/5 text-[10px] font-mono text-oracle-synced font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-oracle-synced animate-pulse" />
            <span>LIVE ORACLE</span>
          </div>
        </div>

        {/* Big Balance Number */}
        <div className="flex items-baseline gap-2 mb-2">
          <h1 className="text-2xl sm:text-4xl font-headline font-bold text-text-primary tracking-tight">
            {showBalance ? formatCurrency(totalBalance) : '••••••••••'}
          </h1>
          <span className="text-xs font-mono text-text-muted">USD</span>
        </div>

        {/* 24h PnL Banner Underneath (GREEN if positive, RED if negative) */}
        <div className="flex items-center gap-2 flex-wrap mb-5">
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold border transition-colors ${
              isPositivePnl
                ? 'bg-status-success/15 border-status-success/30 text-status-success'
                : 'bg-status-error/15 border-status-error/30 text-status-error'
            }`}
          >
            {isPositivePnl ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5" />
            )}
            <span>
              {showBalance
                ? `${isPositivePnl ? '+' : ''}${formatCurrency(pnl24hUsd)} (${isPositivePnl ? '+' : ''}${pnl24hPercent.toFixed(2)}%)`
                : '••••••• (24h)'}
            </span>
          </div>
          <span className="text-[11px] font-mono text-text-muted">Past 24 Hours</span>
        </div>

        {/* Action Button Pills: Deposit, Trade, Send, Borrow */}
        <div className="grid grid-cols-4 gap-2 pt-2 border-t border-white/5">
          <button
            type="button"
            onClick={() => {
              if (soundEnabled) playHudSound('click');
              openOneKeyAction('receive', () => {
                if (isOneKeyHost && openOneKeyNativeReceive()) return;
                if (!isOneKeyHost) {
                  const bridge = (window as any).AurelisNative;
                  if (bridge && typeof bridge.openNativeScreen === 'function') {
                    bridge.openNativeScreen('receive');
                    return;
                  }
                }
                setShowReceiveModal(true);
              });
            }}
            className="flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-surface-container/70 hover:bg-surface-container border border-white/10 hover:border-primary-container/40 text-text-primary transition-all group cursor-pointer"
          >
            <div className="w-6 h-6 rounded-lg bg-primary-container/15 flex items-center justify-center text-primary-container group-hover:scale-110 transition-transform">
              <ArrowDownLeft className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-mono font-medium">Receive</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (soundEnabled) playHudSound('click');
              onNavigate('trade');
            }}
            className="flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-primary-container text-on-primary-container font-mono font-bold transition-all shadow-[0_0_12px_rgba(0,245,160,0.3)] hover:opacity-95 group cursor-pointer"
          >
            <div className="w-6 h-6 rounded-lg bg-surface-canvas/20 flex items-center justify-center text-on-primary-container group-hover:rotate-180 transition-transform duration-300">
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-mono">Trade</span>
          </button>

          <button
            type="button"
            onClick={openSendModal}
            className="flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-surface-container/70 hover:bg-surface-container border border-white/10 hover:border-primary-container/40 text-text-primary transition-all group cursor-pointer"
          >
            <div className="w-6 h-6 rounded-lg bg-cyan-500/15 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
              <ArrowUpRight className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-mono font-medium">Send</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (soundEnabled) playHudSound('click');
              onNavigate('earn-borrow');
            }}
            className="flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-surface-container/70 hover:bg-surface-container border border-white/10 hover:border-primary-container/40 text-text-primary transition-all group cursor-pointer"
            title="Compare collateral loan markets. Execution is not yet enabled."
          >
            <div className="w-6 h-6 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
              <Landmark className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-mono font-medium">Borrow</span>
          </button>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* MOBILE SECTION TABS (Eliminates Endless Scrolling on Phones) */}
      {/* ========================================================================= */}
      <div className="flex sm:hidden items-center p-1 rounded-xl bg-surface-panel/95 border border-white/10 gap-1 -mt-2 shadow-md">
        {[
          { id: 'overview', label: 'Overview', icon: <Sparkles className="w-3.5 h-3.5" /> },
          { id: 'assets', label: `Assets (${enrichedHoldings.length})`, icon: <ShieldCheck className="w-3.5 h-3.5" /> },
          { id: 'news', label: 'News', icon: <Newspaper className="w-3.5 h-3.5" /> },
        ].map((tab) => {
          const isActive = mobileHomeView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (soundEnabled) playHudSound('switch');
                setMobileHomeView(tab.id as any);
              }}
              className={`flex-1 py-1.5 px-1 rounded-lg text-[11px] font-mono font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                isActive
                  ? 'bg-primary-container text-on-primary-container shadow-[0_0_8px_rgba(0,245,160,0.3)]'
                  : 'text-text-muted hover:text-text-primary hover:bg-white/5'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* 2. COINS I OWN SECTION (Portfolio Assets Breakdown) */}
      {/* ========================================================================= */}
      <section
        id="coins-i-own-section"
        className={`${
          mobileHomeView === 'news' ? 'hidden sm:flex' : 'flex'
        } flex-col gap-3`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary-container" />
            <h2 className="font-headline font-bold text-sm sm:text-base text-text-primary tracking-wide">
              Coins I Own
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-white/5 text-[10px] font-mono text-text-muted">
              {enrichedHoldings.length} Assets
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              if (soundEnabled) playHudSound('click');
              onNavigate('trade');
            }}
            className="flex items-center gap-1 text-[11px] font-mono text-primary-container hover:underline cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>Add Asset</span>
          </button>
        </div>

        {/* Owned Coins Grid / Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {enrichedHoldings.map((holding) => {
            const isPos = holding.change24h >= 0;
            const allocationPct = totalBalance > 0 ? (holding.totalValue / totalBalance) * 100 : 0;
            const rawChain = String(holding.chain || '').toLowerCase();
            const networkLabel =
              rawChain === 'base' ? 'Base' :
              rawChain === 'arbitrum' ? 'Arbitrum' :
              rawChain === 'ethereum' ? 'Ethereum' :
              rawChain === 'optimism' ? 'Optimism' :
              rawChain === 'polygon' ? 'Polygon' :
              rawChain ? rawChain.charAt(0).toUpperCase() + rawChain.slice(1) : '';
            const showNetworkLabel = Boolean(
              networkLabel &&
              (
                holding.symbol.toUpperCase() === 'ETH' ||
                (
                  networkLabel.toLowerCase() !== holding.symbol.toLowerCase() &&
                  networkLabel.toLowerCase() !== holding.name.toLowerCase()
                )
              )
            );
            const displayName = holding.symbol.toUpperCase();

            return (
              <div
                key={holding.id}
                onClick={() => {
                  if (soundEnabled) playHudSound('click');
                  if (holding.matchingCoin) {
                    onSelectCoin(holding.matchingCoin, holding);
                  }
                }}
                className="group relative min-w-0 overflow-hidden p-3.5 rounded-xl bg-surface-panel/85 hover:bg-surface-panel border border-white/5 hover:border-primary-container/40 transition-all cursor-pointer shadow-sm hover:shadow-[0_4px_20px_rgba(0,0,0,0.4)] flex flex-col justify-between gap-2.5"
                title={`Open ${showNetworkLabel ? `${displayName} on ${networkLabel}` : holding.name} asset page`}
              >
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <CoinIcon
                      symbol={holding.symbol}
                      name={holding.name}
                      color={holding.color}
                      className="w-8 h-8 rounded-full"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-headline font-bold text-xs text-text-primary group-hover:text-primary-container transition-colors flex items-center gap-1 min-w-0">
                        <span className="shrink-0">{displayName}</span>
                        {showNetworkLabel && (
                          <span className="text-[10px] font-mono text-text-muted shrink-0">
                            · {networkLabel}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-text-secondary">
                        {holding.amount} {holding.symbol}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono font-bold text-xs text-text-primary">
                      {showBalance ? formatCurrency(holding.totalValue) : '••••••'}
                    </div>
                    <div
                      className={`text-[10px] font-mono font-semibold flex items-center justify-end gap-0.5 ${
                        isPos ? 'text-status-success' : 'text-status-error'
                      }`}
                    >
                      {isPos ? '+' : ''}
                      {holding.change24h.toFixed(2)}%
                    </div>
                  </div>
                </div>

                {/* Allocation Progress Bar */}
                <div className="w-full">
                  <div className="flex items-center justify-between gap-2 text-[9px] font-mono text-text-muted mb-1 min-w-0">
                    <span className="truncate">{formatCurrency(holding.livePrice)} / unit</span>
                    <span className="shrink-0">{allocationPct.toFixed(1)}% of portfolio</span>
                  </div>
                  <div className="w-full h-1 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.max(3, allocationPct))}%`,
                        backgroundColor: holding.color || '#00F5D4',
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Mobile View All Assets Button */}
        {mobileHomeView === 'overview' && enrichedHoldings.length > 3 && (
          <button
            type="button"
            onClick={() => {
              if (soundEnabled) playHudSound('switch');
              setMobileHomeView('assets');
            }}
            className="sm:hidden w-full py-2 rounded-xl bg-surface-panel border border-white/5 text-[11px] font-mono text-primary-container hover:bg-white/5 flex items-center justify-center gap-1 cursor-pointer"
          >
            <span>View All {enrichedHoldings.length} Assets</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </section>

      {/* ========================================================================= */}
      {/* 3. MULTI-SOURCE CRYPTO NEWS FEED WITH ARTICLE IMAGES */}
      {/* ========================================================================= */}
      <section
        id="crypto-news-section"
        className={`${
          mobileHomeView === 'assets' ? 'hidden sm:flex' : 'flex'
        } flex-col gap-3 pt-2`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-cyan-400" />
            <h2 className="font-headline font-bold text-sm sm:text-base text-text-primary tracking-wide">
              Market Intelligence & News
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 text-[10px] font-mono">
              Multi-Source
            </span>
          </div>

        </div>

        {/* News Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredNews.map(
            (article) => (
              <article
                key={article.id}
                onClick={() => {
                  if (soundEnabled) playHudSound('click');
                  setSelectedNews(article);
                }}
                className="group min-w-0 overflow-hidden p-3 rounded-xl bg-surface-panel/85 hover:bg-surface-panel border border-white/5 hover:border-white/20 transition-all cursor-pointer flex flex-col justify-between gap-3 shadow-sm hover:shadow-[0_4px_25px_rgba(0,0,0,0.5)]"
              >
                {/* Image & Badges */}
                <div className="relative w-full h-36 rounded-lg overflow-hidden bg-surface-base">
                  <img
                    src={article.imageUrl}
                    alt={article.title}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                  {/* Source Pill */}
                  <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/75 backdrop-blur-md border border-white/10 text-[10px] font-mono font-bold text-white">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: article.sourceColor }}
                    />
                    <span>{article.source}</span>
                  </div>

                  {/* Sentiment & Read Time */}
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] font-mono text-white/90">
                    <span
                      className={`px-1.5 py-0.5 rounded font-bold uppercase text-[9px] ${
                        article.sentiment === 'bullish'
                          ? 'bg-status-success/30 text-status-success border border-status-success/40'
                          : 'bg-white/20 text-white'
                      }`}
                    >
                      {article.sentiment}
                    </span>
                    <div className="flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded">
                      <Clock className="w-2.5 h-2.5" />
                      <span>{article.timeAgo}</span>
                    </div>
                  </div>
                </div>

                {/* Title & Preview */}
                <div>
                  <h3 className="font-headline font-bold text-xs sm:text-sm text-text-primary group-hover:text-primary-container transition-colors line-clamp-2 leading-snug mb-1 break-words [overflow-wrap:anywhere]">
                    {article.title}
                  </h3>
                  <p className="text-[11px] font-sans text-text-secondary line-clamp-2 leading-relaxed break-words [overflow-wrap:anywhere]">
                    {article.summary}
                  </p>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[10px] font-mono text-text-muted">
                  <span>{article.category}</span>
                  <span className="text-primary-container flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform font-bold">
                    <span>Read story</span>
                    <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </article>
            )
          )}
        </div>

        {/* Mobile View All News Button */}
        {mobileHomeView === 'overview' && filteredNews.length > 2 && (
          <button
            type="button"
            onClick={() => {
              if (soundEnabled) playHudSound('switch');
              setMobileHomeView('news');
            }}
            className="sm:hidden w-full py-2 rounded-xl bg-surface-panel border border-white/5 text-[11px] font-mono text-primary-container hover:bg-white/5 flex items-center justify-center gap-1 cursor-pointer"
          >
            <span>Browse All {filteredNews.length} News Stories</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </section>

      {/* ========================================================================= */}
      {/* 4. MODAL: FULL NEWS ARTICLE READER */}
      {/* ========================================================================= */}
      {showReceiveModal && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-md flex items-start justify-center px-4 pt-[max(72px,8vh)] pb-6 overflow-y-auto">
          <div className="w-full max-w-sm bg-surface-panel border border-white/15 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="font-headline font-bold text-base text-text-primary">Receive Assets</h3>
              <button type="button" onClick={() => setShowReceiveModal(false)} className="text-text-muted hover:text-text-primary">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="relative">
              <label className="text-[11px] text-text-muted font-mono block mb-1">Asset / Network</label>
              <button
                type="button"
                onClick={() => setReceivePickerOpen((open) => !open)}
                className="w-full bg-surface-base px-3 py-2.5 rounded-xl border border-white/10 text-text-primary font-mono text-xs flex items-center justify-between gap-3"
              >
                <span className="truncate text-left">{receiveOptions.find((item) => item.key === receiveNetwork)?.label || 'Select network'}</span>
                <ChevronDown className={`w-4 h-4 text-text-muted shrink-0 transition-transform ${receivePickerOpen ? 'rotate-180' : ''}`} />
              </button>
              {receivePickerOpen && (
                <div className="absolute left-0 right-0 mt-1.5 z-[10020] max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-[#090d12] shadow-[0_18px_45px_rgba(0,0,0,0.8)] p-1.5">
                  {receiveOptions.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setReceiveNetwork(item.key);
                        setCopiedAddress(false);
                        setReceivePickerOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg text-left font-mono ${item.key === receiveNetwork ? 'bg-primary-container/10 text-primary-container' : 'text-text-primary hover:bg-white/5'}`}
                    >
                      <span className="text-[11px] font-bold truncate">{item.label}</span>
                      <span className="text-[9px] text-text-muted uppercase">{item.key}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col items-center gap-3">
              {selectedReceiveAddress ? (
                <div className="p-3 bg-white rounded-xl">
                  <QRCodeSVG value={selectedReceiveAddress} size={144} level="M" />
                </div>
              ) : (
                <div className="w-36 h-36 rounded-xl bg-surface-base border border-white/10 flex items-center justify-center text-text-muted text-center p-3">
                  Wallet address unavailable
                </div>
              )}
              <p className="font-mono text-xs text-center text-text-secondary break-all bg-surface-base p-2.5 rounded-lg border border-white/5 w-full">
                {selectedReceiveAddress || 'Address unavailable'}
              </p>
              <button
                type="button"
                disabled={!selectedReceiveAddress}
                onClick={() => {
                  if (!selectedReceiveAddress) return;
                  navigator.clipboard.writeText(selectedReceiveAddress);
                  setCopiedAddress(true);
                  setTimeout(() => setCopiedAddress(false), 2000);
                }}
                className="w-full py-2.5 rounded-xl bg-primary-container text-on-primary-container font-mono font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                {copiedAddress ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copiedAddress ? 'Address Copied!' : 'Copy Address'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showSendModal && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-md flex items-start justify-center px-4 pt-[max(72px,8vh)] pb-6 overflow-y-auto">
          <div className="w-full max-w-sm bg-surface-panel border border-white/15 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="font-headline font-bold text-base text-text-primary">Send Crypto</h3>
              <button type="button" onClick={() => setShowSendModal(false)} className="text-text-muted hover:text-text-primary">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              {isOneKeyHost && (
                <div className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-[10px] text-amber-100 font-mono leading-relaxed">
                  Send is disabled in the OneKey-hosted shell for now. Use OneKey native Send until AURELIS is wired into OneKey signing.
                </div>
              )}
              <div className="relative">
                <label className="text-[11px] text-text-muted font-mono block mb-1">Asset</label>
                <button
                  type="button"
                  onClick={() => setSendPickerOpen((open) => !open)}
                  className="w-full bg-surface-base px-3 py-2.5 rounded-xl border border-white/10 text-text-primary font-mono text-xs flex items-center justify-between gap-3"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {selectedSendAsset && <CoinIcon symbol={selectedSendAsset.symbol} className="w-5 h-5 shrink-0" />}
                    <span className="truncate text-left">
                      {selectedSendAsset
                        ? `${selectedSendAsset.symbol} · ${selectedSendAsset.network}`
                        : 'Select asset'}
                    </span>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-text-muted shrink-0 transition-transform ${sendPickerOpen ? 'rotate-180' : ''}`} />
                </button>
                {sendPickerOpen && (
                  <div className="absolute left-0 right-0 mt-1.5 z-[10020] max-h-60 overflow-y-auto rounded-xl border border-white/10 bg-[#090d12] shadow-[0_18px_45px_rgba(0,0,0,0.8)] p-1.5">
                    {sendAssetOptions.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          setSendAssetKey(item.key);
                          setSendPickerOpen(false);
                        }}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left font-mono ${item.key === selectedSendAsset?.key ? 'bg-primary-container/10 text-primary-container' : 'text-text-primary hover:bg-white/5'}`}
                      >
                        <CoinIcon symbol={item.symbol} className="w-6 h-6 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[11px] font-bold truncate">{item.symbol}</span>
                          <span className="block text-[9px] text-text-muted truncate">{item.network}</span>
                        </span>
                        <span className="text-[10px] text-text-secondary tabular-nums">
                          {item.amount.toLocaleString(undefined, { maximumFractionDigits: 8 })}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedSendAsset && (
                <div className="flex justify-between text-[10px] font-mono px-1">
                  <span className="text-text-muted">Available</span>
                  <span className="text-text-secondary">{selectedSendAsset.amount.toLocaleString(undefined, { maximumFractionDigits: 8 })} {selectedSendAsset.symbol}</span>
                </div>
              )}
              <div>
                <label className="text-[11px] text-text-muted font-mono block mb-1">Recipient Address</label>
                <input
                  value={sendRecipient}
                  onChange={(e) => setSendRecipient(e.target.value)}
                  placeholder="Wallet address"
                  className="w-full bg-surface-base px-3 py-2 rounded-xl border border-white/10 text-text-primary font-mono text-xs outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-text-muted font-mono block mb-1">Amount</label>
                <input
                  type="number"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-surface-base px-3 py-2 rounded-xl border border-white/10 text-text-primary font-mono text-xs outline-none"
                />
              </div>
              <button
                type="button"
                disabled={!selectedSendAsset || !sendRecipient || !sendAmount || isSending}
                onClick={submitSendApproval}
                className="w-full py-2.5 rounded-xl bg-primary-container text-on-primary-container font-mono font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <ArrowUpRight className="w-4 h-4" />
                {isOneKeyHost ? 'Use OneKey Send For Now' : isSending ? 'Waiting for Wallet Approval…' : 'Approve & Send'}
              </button>
              {sendError && (
                <div className="text-[10px] text-status-error break-words">{sendError}</div>
              )}
              {sendTxHash && (
                <div className="text-[10px] text-primary-container break-all font-mono">
                  Broadcast: {sendTxHash}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {selectedNews && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
          onClick={() => setSelectedNews(null)}
        >
          <div
            className="w-full max-w-lg bg-surface-panel rounded-2xl border border-white/10 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header Image */}
            <div className="relative w-full h-48 sm:h-56 bg-surface-base shrink-0">
              <img
                src={selectedNews.imageUrl}
                alt={selectedNews.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-surface-panel via-surface-panel/40 to-transparent" />
              <button
                type="button"
                onClick={() => setSelectedNews(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center cursor-pointer transition-colors"
                title="Close"
              >
                ✕
              </button>
              <div className="absolute bottom-3 left-4 flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: selectedNews.sourceColor }}
                />
                <span className="font-mono font-bold text-xs text-white">
                  {selectedNews.source}
                </span>
                <span className="text-white/60 text-xs font-mono">• {selectedNews.timeAgo}</span>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex flex-col gap-4 overflow-y-auto">
              <h2 className="font-headline font-bold text-base sm:text-lg text-text-primary leading-snug">
                {selectedNews.title}
              </h2>

              <div className="flex items-center gap-2 text-[10px] font-mono">
                <span className="px-2 py-0.5 rounded bg-primary-container/20 text-primary-container font-bold">
                  {selectedNews.category}
                </span>
                <span className="px-2 py-0.5 rounded bg-white/5 text-text-muted">
                  {selectedNews.readTime}
                </span>
                <span className="px-2 py-0.5 rounded bg-status-success/15 text-status-success font-bold uppercase">
                  {selectedNews.sentiment}
                </span>
              </div>

              <div className="space-y-3 text-xs sm:text-sm font-sans text-text-secondary leading-relaxed">
                <p>{selectedNews.summary}</p>
                <p>
                  According to desks monitoring exchange liquidity, trading desks have witnessed
                  accelerating turnover across spot and perpetual venues. Macro conditions remain
                  supportive as global central banks signal renewed liquidity injections.
                </p>
                <p>
                  On-chain data indicates accumulation by long-term holders, while derivatives open
                  interest reaches new cyclical benchmarks.
                </p>
              </div>

              {/* Source action button */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                <span className="text-[11px] font-mono text-text-muted">
                  Source: {selectedNews.source}
                </span>
                {selectedNews.url && (
                  <a
                    href={selectedNews.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-white/10 border border-white/10 text-xs font-mono text-primary-container transition-colors"
                  >
                    <span>View on {selectedNews.source}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      ,
        document.body
      )}
    </div>
  );
};

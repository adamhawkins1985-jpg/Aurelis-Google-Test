import React, { useEffect, useMemo, useState } from 'react';
import { TrendingUp, List, Grid3X3, PlusCircle, ChevronDown, Radio } from 'lucide-react';
import { HUDTab, CoinData } from '../types';
import { playHudSound, formatCurrency } from '../services/marketData';
import { CoinIcon } from './CoinIcon';

interface TabSelectorProps {
  activeTab: HUDTab | null;
  onSelectTab: (tab: HUDTab) => void;
  onToggleManager: () => void;
  isManagerOpen: boolean;
  activeCount: number;
  soundEnabled: boolean;
  isWalletConnected?: boolean;
  coins?: CoinData[];
  starredCoins?: CoinData[];
  onSelectCoin?: (coin: CoinData) => void;
}

export const TabSelector: React.FC<TabSelectorProps> = ({
  activeTab,
  onSelectTab,
  onToggleManager,
  isManagerOpen,
  activeCount,
  soundEnabled,
  isWalletConnected = false,
  coins = [],
  starredCoins = [],
  onSelectCoin,
}) => {
  const [activeLiveCount, setActiveLiveCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/kraken/live-status', { cache: 'no-store', credentials: 'include' });
        const data = await response.json();
        if (!cancelled && response.ok && data?.ok && Array.isArray(data.positions)) setActiveLiveCount(data.positions.length);
      } catch {}
    };
    load();
    const timer = window.setInterval(load, 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  // 3 Primary Market Tabs: Chart, Watchlist, Heatmap
  const tabs: { id: HUDTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'chart',
      label: 'Chart',
      icon: <TrendingUp className="w-3.5 h-3.5" />,
    },
    {
      id: 'watchlist',
      label: 'Watch',
      icon: <List className="w-3.5 h-3.5" />,
    },
    {
      id: 'heatmap',
      label: 'Heatmap',
      icon: <Grid3X3 className="w-3.5 h-3.5" />,
    },
  ];

  // Prioritize starred coins, then general coins for the ticker tape
  const tickerCoins = useMemo(() => {
    if (!coins || coins.length === 0) return [];
    if (starredCoins && starredCoins.length > 0) {
      const starredIds = new Set(starredCoins.map((c) => c.id));
      const rest = coins.filter((c) => !starredIds.has(c.id));
      return [...starredCoins, ...rest];
    }
    return coins;
  }, [coins, starredCoins]);

  // Duplicate items to ensure seamless infinite looping marquee
  const displayTickerItems = useMemo(() => {
    if (tickerCoins.length === 0) return [];
    let items = [...tickerCoins];
    while (items.length < 12 && items.length > 0) {
      items = [...items, ...tickerCoins];
    }
    return [...items, ...items];
  }, [tickerCoins]);

  return (
    <div id="tab-selector-wrapper" className="flex flex-col bg-surface-container-lowest/90 border-b border-white/5 shrink-0 select-none">
      {/* Row 1: Segmented Buttons Bar */}
      <div
        id="tab-selector-bar"
        className="px-2.5 pt-2 pb-1.5 flex items-center justify-between gap-1.5 overflow-x-auto"
      >
        {/* 3 Segmented Market Tabs: Chart, Watch, Heatmap */}
        <div className="grid grid-cols-4 gap-0.5 sm:gap-1 p-0.5 bg-surface-panel/90 rounded-lg border border-white/5 flex-1 max-w-[370px]">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`tabBtn-${tab.id}`}
                onClick={() => {
                  if (soundEnabled) playHudSound('switch');
                  onSelectTab(tab.id);
                }}
                className={`flex items-center justify-center gap-1 py-1 px-1.5 rounded-md text-[10.5px] font-headline font-semibold transition-all relative cursor-pointer ${
                  isActive
                    ? 'bg-primary-container text-on-primary-container shadow-[0_0_12px_rgba(0,245,160,0.35)] font-bold'
                    : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                }`}
                title={isActive ? `Collapse ${tab.label} Dropdown` : `Open ${tab.label} Dropdown`}
              >
                {tab.icon}
                <span className="truncate">{tab.label}</span>
                <ChevronDown
                  className={`w-3 h-3 transition-transform duration-200 ${
                    isActive ? 'rotate-180 text-on-primary-container' : 'text-text-muted opacity-70'
                  }`}
                />
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              if (soundEnabled) playHudSound('trade');
              const utilityUrl = new URL(window.location.href);
              utilityUrl.searchParams.set('utility', 'livebet');
              const androidEmbed =
                Boolean((window as any).__AURELIS_ANDROID_APP__) ||
                new URLSearchParams(window.location.search).get('embed') === 'android';
              if (androidEmbed) {
                utilityUrl.searchParams.set('embed', 'android');
                window.localStorage.setItem('aurelis_android_active_utility', 'livebet');
                window.history.pushState({}, '', utilityUrl.toString());
                window.dispatchEvent(new CustomEvent('aurelis:open-utility'));
                return;
              }
              const desktopBridge = (window as any).AurelisDesktop;
              if (desktopBridge?.isDesktop && typeof desktopBridge.openUtility === 'function') {
                desktopBridge.openUtility('livebet');
                return;
              }
              window.open(utilityUrl.toString(), 'AurelisLive', 'popup=yes,width=430,height=620,resizable=yes,scrollbars=yes');
            }}
            className={`flex items-center justify-center gap-1 py-1 px-1.5 rounded-md text-[10.5px] font-headline font-semibold transition-all relative cursor-pointer ${
              activeLiveCount > 0
                ? 'bg-red-500/15 text-red-300 border border-red-500/35 shadow-[0_0_10px_rgba(239,68,68,.22)]'
                : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
            }`}
            title={activeLiveCount > 0 ? `Open Live · ${activeLiveCount} active` : 'Open Live'}
          >
            <Radio className={`w-3.5 h-3.5 ${activeLiveCount > 0 ? 'text-red-400' : ''}`} />
            <span>LIVE</span>
            {activeLiveCount > 0 && (
              <span className="min-w-[14px] h-[14px] px-1 rounded bg-red-500 text-white text-[8px] font-mono font-bold flex items-center justify-center">
                {activeLiveCount}
              </span>
            )}
          </button>
        </div>

        {/* Quick Add / Manage Watchlist Button with Badge Counter */}
        <button
          id="btnOpenManager"
          onClick={() => {
            if (soundEnabled) playHudSound('click');
            onToggleManager();
          }}
          className={`h-7 px-2 rounded-lg border text-[10px] font-mono font-medium flex items-center gap-1 transition-all group shrink-0 cursor-pointer ${
            isManagerOpen
              ? 'bg-primary-container/20 border-primary-container text-primary-container shadow-[0_0_10px_rgba(0,245,160,0.2)]'
              : 'bg-surface-panel border-white/10 hover:border-primary-container/40 text-primary-container'
          }`}
          title="Manage Tracked Coins"
        >
          <PlusCircle
            className={`w-3.5 h-3.5 transition-transform duration-200 ${
              isManagerOpen ? 'rotate-45 text-status-error' : 'group-hover:rotate-90 text-primary-container'
            }`}
          />
          <span id="activeBadgeCount" className="text-text-primary font-bold">
            {activeCount}
          </span>
        </button>
      </div>

      {/* Row 2: Live Continuous Ticker Running Under Chart, Trade, Wallet Buttons */}
      {displayTickerItems.length > 0 && (
        <div
          id="continuous-ticker-bar"
          className="relative w-full h-[26px] bg-surface-base/85 border-t border-white/5 overflow-hidden flex items-center select-none group"
        >
          {/* Subtle LIVE Beacon Badge */}
          <div className="z-10 bg-surface-base pl-2.5 pr-2 py-0.5 border-r border-white/5 flex items-center gap-1.5 shrink-0 text-[9px] font-mono text-text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-oracle-synced animate-ping" />
            <span className="text-oracle-synced font-bold">LIVE</span>
          </div>

          {/* Left & Right gradient edge fades for seamless scrolling visual */}
          <div className="absolute left-[54px] top-0 bottom-0 w-4 bg-gradient-to-r from-surface-base to-transparent pointer-events-none z-10" />
          <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-surface-base to-transparent pointer-events-none z-10" />

          {/* Scrolling Ticker Track (pauses smoothly on hover) */}
          <div className="flex items-center gap-4 animate-marquee-ultraslow marquee-track whitespace-nowrap pl-4 cursor-pointer">
            {displayTickerItems.map((c, idx) => {
              const isPositive = c.change24h >= 0;
              return (
                <button
                  key={`${c.id}-${idx}`}
                  type="button"
                  onClick={() => {
                    if (soundEnabled) playHudSound('click');
                    if (onSelectCoin) onSelectCoin(c);
                  }}
                  className="flex items-center gap-1.5 text-[10px] font-mono hover:bg-white/10 px-1.5 py-0.5 rounded transition-colors group/item shrink-0 cursor-pointer"
                  title={`Open ${c.name} (${c.symbol}) chart`}
                >
                  <CoinIcon symbol={c.symbol} name={c.name} size="xs" />
                  <span className="font-bold text-text-primary group-hover/item:text-primary-container transition-colors">
                    {c.symbol}
                  </span>
                  <span className="text-text-secondary font-medium">
                    {formatCurrency(c.price)}
                  </span>
                  <span
                    className={`font-semibold flex items-center leading-none ${
                      isPositive ? 'text-oracle-synced' : 'text-status-error'
                    }`}
                  >
                    {isPositive ? '▲+' : '▼'}
                    {Math.abs(c.change24h).toFixed(1)}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};


import React, { useState, useEffect } from 'react';
import { Pause, Play, Star, SlidersHorizontal, Check } from 'lucide-react';
import { CoinData, MarqueeSpeed } from '../types';
import { CoinIcon } from './CoinIcon';
import { formatCurrency, playHudSound } from '../services/marketData';

interface MarqueeScreenProps {
  coins: CoinData[];
  starredCoins?: CoinData[];
  onSelectCoin: (coin: CoinData) => void;
  soundEnabled: boolean;
}

export const MarqueeScreen: React.FC<MarqueeScreenProps> = ({
  coins,
  starredCoins = [],
  onSelectCoin,
  soundEnabled,
}) => {
  // Speed setting with localStorage persistence, default to 'crawl' (0.1x ultra-slow)
  const [speed, setSpeed] = useState<MarqueeSpeed>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('aurelis_marquee_speed');
        if (saved === 'crawl' || saved === 'ultraslow' || saved === 'slow' || saved === 'normal' || saved === 'fast') {
          return saved;
        }
      } catch {}
    }
    return 'crawl';
  });

  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [showStarredOnly, setShowStarredOnly] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('aurelis_marquee_starred_only');
        if (saved !== null) return JSON.parse(saved);
      } catch {}
    }
    return starredCoins.length > 0;
  });

  useEffect(() => {
    try {
      localStorage.setItem('aurelis_marquee_speed', speed);
    } catch {}
  }, [speed]);

  useEffect(() => {
    try {
      localStorage.setItem('aurelis_marquee_starred_only', JSON.stringify(showStarredOnly));
    } catch {}
  }, [showStarredOnly]);

  const speedClass = {
    crawl: 'animate-marquee-crawl',
    ultraslow: 'animate-marquee-ultraslow',
    slow: 'animate-marquee-slow',
    normal: 'animate-marquee-normal',
    fast: 'animate-marquee-fast',
  }[speed];

  const speedLabels: Record<MarqueeSpeed, { label: string; desc: string }> = {
    crawl: { label: '0.1x Crawl', desc: 'Ultra-slow 240s crawl - leisurely & easy to read' },
    ultraslow: { label: '0.25x Slow', desc: 'Relaxed 160s drift - smooth and comfortable' },
    slow: { label: '0.5x Medium', desc: 'Gentle 100s pace' },
    normal: { label: '1x Normal', desc: 'Standard 60s stream' },
    fast: { label: '1.5x Brisk', desc: '35s quick scan' },
  };

  // Select which coins to display in ticker
  const activeCoins = showStarredOnly && starredCoins.length > 0 ? starredCoins : coins;

  // Duplicate items array to make the infinite loop continuous and seamless
  let repeatedItems = [...activeCoins];
  while (repeatedItems.length < 10 && repeatedItems.length > 0) {
    repeatedItems = [...repeatedItems, ...activeCoins];
  }
  const displayItems = [...repeatedItems, ...repeatedItems];

  return (
    <section id="section-marquee" className="flex flex-col gap-2.5 w-full select-none">
      {/* Header Bar */}
      <div className="flex items-center justify-between pb-1 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="w-4 h-4 text-primary-container" />
            <h2 className="font-headline font-bold text-[13px] text-text-primary">
              Continuous Ticker
            </h2>
          </div>
          <span className="px-1.5 py-0.5 rounded bg-surface-panel text-[9px] font-mono text-cyan-400 border border-white/5">
            {isPaused ? 'PAUSED' : 'STREAMING'}
          </span>
        </div>

        {/* Filter Toggle: Starred Only vs All Coins */}
        {starredCoins.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (soundEnabled) playHudSound('click');
              setShowStarredOnly(!showStarredOnly);
            }}
            className={`px-2 py-0.5 rounded-md text-[10px] font-mono flex items-center gap-1 border transition-all cursor-pointer ${
              showStarredOnly
                ? 'bg-primary-container/20 text-primary-container border-primary-container/40 font-bold'
                : 'bg-surface-panel text-text-muted border-white/5 hover:text-text-primary'
            }`}
            title={showStarredOnly ? 'Showing starred coins only' : 'Showing all coins'}
          >
            <Star className={`w-3 h-3 ${showStarredOnly ? 'fill-primary-container' : ''}`} />
            <span>{showStarredOnly ? 'Starred Coins Only' : 'All Coins'}</span>
          </button>
        )}
      </div>

      {/* Speed Controls & Pause Button Toolbar */}
      <div className="flex items-center justify-between gap-1.5 bg-surface-panel/85 p-1.5 rounded-lg border border-white/5 flex-wrap">
        {/* Pause / Resume Button */}
        <button
          type="button"
          onClick={() => {
            if (soundEnabled) playHudSound('click');
            setIsPaused(!isPaused);
          }}
          className={`px-2 py-1 rounded text-[10px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer ${
            isPaused
              ? 'bg-status-warning/20 text-status-warning border border-status-warning/40 shadow-sm'
              : 'bg-surface-container hover:bg-surface-container-high text-text-secondary border border-white/5'
          }`}
          title={isPaused ? 'Resume ticker movement' : 'Freeze ticker movement'}
        >
          {isPaused ? (
            <>
              <Play className="w-3 h-3 fill-current" />
              <span>Resume</span>
            </>
          ) : (
            <>
              <Pause className="w-3 h-3" />
              <span>Pause</span>
            </>
          )}
        </button>

        {/* Speed Preset Buttons */}
        <div className="flex items-center gap-1 text-[9px] font-mono">
          <span className="text-text-muted text-[8px] uppercase tracking-wider mr-0.5 hidden sm:inline">
            Speed:
          </span>

          {(['crawl', 'ultraslow', 'slow', 'normal', 'fast'] as MarqueeSpeed[]).map((spd) => {
            const isSelected = speed === spd;
            return (
              <button
                key={spd}
                type="button"
                onClick={() => {
                  if (soundEnabled) playHudSound('click');
                  setSpeed(spd);
                  if (isPaused) setIsPaused(false);
                }}
                className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-primary-container text-on-primary-container font-bold shadow-[0_0_6px_rgba(0,245,160,0.3)]'
                    : 'text-text-muted hover:text-text-primary bg-surface-container/60 hover:bg-surface-container'
                }`}
                title={speedLabels[spd].desc}
              >
                {spd === 'crawl' ? '0.1x Crawl' : spd === 'ultraslow' ? '0.25x' : spd === 'slow' ? '0.5x' : spd === 'normal' ? '1x' : '1.5x'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Speed explanation hint */}
      <div className="flex items-center justify-between text-[9px] font-mono text-text-muted px-1">
        <span>
          Pace: <strong className="text-primary-container">{speedLabels[speed].label}</strong> ({speedLabels[speed].desc})
        </span>
        <span className="hidden sm:inline text-text-muted">Hover cursor over ticker to freeze</span>
      </div>

      {/* Marquee Ribbon Box */}
      <div className="relative w-full bg-surface-container-lowest/90 border border-white/10 rounded-xl p-2.5 overflow-hidden shadow-inner">
        {/* Left & Right edge blur masks */}
        <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-surface-container-lowest via-surface-container-lowest/80 to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-surface-container-lowest via-surface-container-lowest/80 to-transparent z-10 pointer-events-none" />

        <div className="overflow-hidden flex whitespace-nowrap">
          <div
            className={`flex items-center gap-6 marquee-track shrink-0 ${speedClass} ${
              isPaused ? 'marquee-paused' : ''
            }`}
          >
            {displayItems.map((coin, index) => {
              const isPositive = coin.change24h >= 0;
              return (
                <div key={`${coin.id}-${index}`} className="flex items-center gap-6 shrink-0">
                  <div
                    onClick={() => {
                      if (soundEnabled) playHudSound('switch');
                      onSelectCoin(coin);
                    }}
                    className="flex items-center gap-2 text-[11px] font-mono font-medium hover:text-primary-container cursor-pointer transition-colors"
                  >
                    <CoinIcon
                      symbol={coin.symbol}
                      name={coin.name}
                      color={coin.color}
                      iconSymbol={coin.iconSymbol}
                      imageUrl={coin.imageUrl}
                      size="sm"
                    />
                    <span className="text-text-primary font-bold">{coin.name}</span>
                    <span className="text-cyan-400 text-[10px]">{coin.symbol}</span>
                    <span className="text-text-primary font-bold">
                      {formatCurrency(coin.price)}
                    </span>
                    <span
                      className={`font-semibold ${
                        isPositive ? 'text-oracle-synced' : 'text-status-error'
                      }`}
                    >
                      {isPositive ? '▲ +' : '▼ '}
                      {Math.abs(coin.change24h).toFixed(1)}%
                    </span>
                  </div>

                  <span className="text-white/20 select-none">•</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Marquee Customization Options Card */}
      <div className="bg-surface-panel/75 p-3 rounded-xl border border-white/5 flex flex-col gap-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-headline font-semibold text-text-primary">Ticker Settings</span>
          <span className="text-[10px] font-mono text-primary-container font-bold">
            {speedLabels[speed].label}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
          <div className="p-2 rounded bg-surface-container flex flex-col gap-0.5 border border-white/5">
            <span className="text-text-muted">PAUSE CONTROL</span>
            <span className="text-oracle-synced font-bold">BUTTON & HOVER</span>
          </div>
          <div className="p-2 rounded bg-surface-container flex flex-col gap-0.5 border border-white/5">
            <span className="text-text-muted">ITEMS SHOWN</span>
            <span className="text-text-primary font-bold">
              {activeCoins.length} {showStarredOnly ? 'Starred' : 'Coins'}
            </span>
          </div>
        </div>

        <p className="text-[9px] font-mono text-text-muted mt-0.5 leading-relaxed">
          The ticker now glides at a calm, readable pace. Use <strong>0.1x Crawl</strong> for an ultra-slow, gentle scroll or press <strong>Pause</strong> anytime to freeze the ticker in place.
        </p>
      </div>
    </section>
  );
};

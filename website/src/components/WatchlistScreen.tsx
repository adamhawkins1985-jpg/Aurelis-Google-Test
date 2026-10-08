import React from 'react';
import { Star, Plus } from 'lucide-react';
import { CoinData } from '../types';
import { CoinIcon } from './CoinIcon';
import { formatCurrency, playHudSound } from '../services/marketData';

interface WatchlistScreenProps {
  coins: CoinData[];
  selectedCoinId: string;
  onSelectCoin: (coin: CoinData) => void;
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  onOpenManager: () => void;
  soundEnabled: boolean;
}

export const WatchlistScreen: React.FC<WatchlistScreenProps> = ({
  coins,
  selectedCoinId,
  onSelectCoin,
  favorites,
  onToggleFavorite,
  onOpenManager,
  soundEnabled,
}) => {
  return (
    <section id="section-watchlist" className="flex flex-col gap-2 w-full select-none">
      {/* Header Bar */}
      <div className="flex items-center justify-between pb-1 border-b border-white/5">
        <div className="flex items-center gap-1.5">
          <span className="font-headline font-bold text-[13px] text-text-primary">
            Watchlist
          </span>
          <span className="px-1.5 py-0.5 rounded-full bg-primary-container/15 text-primary-container text-[9px] font-mono font-bold border border-primary-container/30">
            {coins.length} Starred
          </span>
        </div>
        <span className="text-[10px] font-mono text-oracle-synced flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-oracle-synced animate-pulse" />
          Realtime Pyth
        </span>
      </div>

      {/* Crypto Rows or Empty State */}
      {coins.length > 0 ? (
        <div className="flex flex-col gap-1.5 max-h-[285px] overflow-y-auto pr-0.5">
          {coins.map((coin) => {
            const isSelected = coin.id === selectedCoinId;
            const isFav = favorites.includes(coin.id);
            const isPositive = coin.change24h >= 0;

            return (
              <div
                key={coin.id}
                onClick={() => {
                  if (soundEnabled) playHudSound('switch');
                  onSelectCoin(coin);
                }}
                className={`flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer group ${
                  isSelected
                    ? 'bg-surface-panel border-primary-container/40 shadow-[0_0_12px_rgba(0,245,160,0.1)]'
                    : 'bg-surface-panel/80 hover:bg-surface-container border-white/5 hover:border-primary-container/30'
                }`}
              >
                {/* Left Column: Star + Coin Icon + Name/Symbol */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (soundEnabled) playHudSound('click');
                      onToggleFavorite(coin.id);
                    }}
                    className="text-primary-container hover:text-text-muted transition-colors p-0.5 cursor-pointer"
                    title="Remove from watchlist (unstar)"
                  >
                    <Star
                      className={`w-3.5 h-3.5 transition-all ${
                        isFav
                          ? 'text-primary-container fill-primary-container drop-shadow-[0_0_5px_rgba(0,245,160,0.5)]'
                          : 'text-text-muted'
                      }`}
                    />
                  </button>

                  <CoinIcon
                    symbol={coin.symbol}
                    name={coin.name}
                    color={coin.color}
                    iconSymbol={coin.iconSymbol}
                    imageUrl={coin.imageUrl}
                    size="md"
                  />

                  <div className="flex flex-col min-w-0">
                    <span className="font-headline font-bold text-[12px] text-text-primary leading-tight truncate">
                      {coin.name}
                    </span>
                    <span className="font-mono text-[9px] text-cyan-400 font-medium">
                      {coin.symbol}
                    </span>
                  </div>
                </div>

                {/* Right Column: Price and Delta % */}
                <div className="text-right shrink-0">
                  <div className="font-mono font-bold text-[12px] text-text-primary">
                    {formatCurrency(coin.price)}
                  </div>
                  <div
                    className={`font-mono text-[10px] font-semibold flex items-center justify-end gap-0.5 ${
                      isPositive ? 'text-oracle-synced' : 'text-status-error'
                    }`}
                  >
                    <span>{isPositive ? '▲ +' : '▼ '}</span>
                    <span>{Math.abs(coin.change24h).toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 px-4 text-center bg-surface-panel/40 rounded-xl border border-white/5 gap-2 my-1">
          <div className="w-9 h-9 rounded-full bg-primary-container/10 border border-primary-container/20 flex items-center justify-center text-primary-container">
            <Star className="w-4 h-4" />
          </div>
          <div className="text-[12px] font-headline font-bold text-text-primary">
            No Starred Coins Yet
          </div>
          <p className="text-[10px] font-mono text-text-muted max-w-[240px] leading-relaxed">
            Your watchlist only shows coins you have starred. Click below to browse and star cryptocurrencies.
          </p>
          <button
            onClick={() => {
              if (soundEnabled) playHudSound('click');
              onOpenManager();
            }}
            className="mt-1 px-3 py-1 rounded-lg bg-primary-container text-surface-canvas font-mono font-bold text-[10px] uppercase flex items-center gap-1 shadow-sm hover:opacity-90 cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>Browse & Star Coins</span>
          </button>
        </div>
      )}

      {/* Add More Tokens to Watchlist button */}
      <button
        id="btnAddMoreTokens"
        onClick={() => {
          if (soundEnabled) playHudSound('click');
          onOpenManager();
        }}
        className="w-full py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high border border-dashed border-white/15 hover:border-primary-container/40 text-[10px] font-mono text-text-secondary hover:text-primary-container flex items-center justify-center gap-1 transition-all cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>Manage Starred Coins / Add New</span>
      </button>
    </section>
  );
};


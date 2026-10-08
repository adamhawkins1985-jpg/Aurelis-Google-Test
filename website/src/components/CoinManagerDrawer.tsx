import React, { useState, useEffect } from 'react';
import { Search, X, CheckSquare, Square, RotateCcw, Globe, Plus, Check, Loader2, TrendingUp, Star } from 'lucide-react';
import { CoinData } from '../types';
import { CoinIcon } from './CoinIcon';
import {
  playHudSound,
  searchOnlineCryptoTokens,
  fetchTokenMarketData,
  OnlineTokenSearchResult,
  formatCurrency,
} from '../services/marketData';

interface CoinManagerDrawerProps {
  coins: CoinData[];
  selectedCoinIds: string[];
  onToggleCoin: (id: string) => void;
  onAddOnlineCoin?: (coin: CoinData) => void;
  onClose: () => void;
  soundEnabled: boolean;
  onResetDefaults?: () => void;
}

export const CoinManagerDrawer: React.FC<CoinManagerDrawerProps> = ({
  coins,
  selectedCoinIds,
  onToggleCoin,
  onAddOnlineCoin,
  onClose,
  soundEnabled,
  onResetDefaults,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'roster' | 'online'>('roster');
  const [onlineResults, setOnlineResults] = useState<OnlineTokenSearchResult[]>([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [addingCoinId, setAddingCoinId] = useState<string | null>(null);
  const [addedSuccessIds, setAddedSuccessIds] = useState<string[]>([]);

  // Filter loaded coins
  const filteredCoins = coins.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Debounced online search across 10,000+ tokens
  useEffect(() => {
    if (activeTab !== 'online' || !searchQuery.trim() || searchQuery.trim().length < 2) {
      if (activeTab === 'online' && !searchQuery.trim()) {
        setOnlineResults([]);
      }
      return;
    }

    let isCurrent = true;
    setIsSearchingOnline(true);
    const timer = setTimeout(async () => {
      const results = await searchOnlineCryptoTokens(searchQuery);
      if (isCurrent) {
        setOnlineResults(results);
        setIsSearchingOnline(false);
      }
    }, 400);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [searchQuery, activeTab]);

  const handleAddOnlineToken = async (item: OnlineTokenSearchResult) => {
    if (addingCoinId) return;
    if (soundEnabled) playHudSound('click');
    setAddingCoinId(item.id);

    try {
      const detailedCoin = await fetchTokenMarketData(item.id);
      const coinToAdd: CoinData = detailedCoin || {
        id: item.id,
        symbol: item.symbol,
        name: item.name,
        price: 1.0,
        change24h: 0.0,
        volume24h: 1000000,
        marketCap: 10000000,
        sparkline: [0.98, 0.99, 1.0, 1.01, 1.0],
        imageUrl: item.large || item.thumb,
        iconSymbol: item.symbol.slice(0, 2),
      };

      if (onAddOnlineCoin) {
        onAddOnlineCoin(coinToAdd);
      }
      if (soundEnabled) playHudSound('trade');
      setAddedSuccessIds((prev) => [...prev, item.id]);
    } catch {
      // Fallback simple token addition
      const fallbackCoin: CoinData = {
        id: item.id,
        symbol: item.symbol,
        name: item.name,
        price: 1.0,
        change24h: 0.0,
        volume24h: 1000000,
        marketCap: 10000000,
        sparkline: [0.98, 0.99, 1.0, 1.01, 1.0],
        imageUrl: item.large || item.thumb,
        iconSymbol: item.symbol.slice(0, 2),
      };
      if (onAddOnlineCoin) {
        onAddOnlineCoin(fallbackCoin);
      }
      setAddedSuccessIds((prev) => [...prev, item.id]);
    } finally {
      setAddingCoinId(null);
    }
  };

  const activeCount = selectedCoinIds.length;

  return (
    <div
      id="coinManagerDrawer"
      className="border-b border-primary-container/20 bg-surface-container-lowest/98 p-3 flex flex-col gap-2.5 transition-all animate-in slide-in-from-top-2 duration-150 shrink-0"
    >
      {/* Header & Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {/* Mode Switcher */}
          <div className="flex items-center bg-surface-panel/90 p-0.5 rounded-lg border border-white/10 text-[10px] font-mono font-semibold">
            <button
              onClick={() => {
                if (soundEnabled) playHudSound('click');
                setActiveTab('roster');
              }}
              className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                activeTab === 'roster'
                  ? 'bg-primary-container text-surface-canvas font-bold shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Roster ({coins.length})
            </button>
            <button
              onClick={() => {
                if (soundEnabled) playHudSound('click');
                setActiveTab('online');
              }}
              className={`px-2 py-0.5 rounded-md transition-all flex items-center gap-1 cursor-pointer ${
                activeTab === 'online'
                  ? 'bg-primary-container text-surface-canvas font-bold shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Globe className="w-2.5 h-2.5" />
              <span>Search 10,000+</span>
            </button>
          </div>

          <span
            id="coinStatusCount"
            className="px-1.5 py-0.5 rounded-full bg-primary-container/15 text-primary-container text-[9px] font-mono font-bold border border-primary-container/30"
          >
            {activeCount} Starred on Watchlist
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onResetDefaults && activeTab === 'roster' && (
            <button
              onClick={() => {
                if (soundEnabled) playHudSound('click');
                onResetDefaults();
              }}
              className="text-text-muted hover:text-text-primary text-[10px] font-mono flex items-center gap-0.5 cursor-pointer"
              title="Reset default watchlist"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>Reset</span>
            </button>
          )}
          <button
            onClick={() => {
              if (soundEnabled) playHudSound('click');
              onClose();
            }}
            className="text-text-muted hover:text-text-primary p-0.5 rounded transition-colors cursor-pointer"
            title="Close Drawer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Live Search Input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-text-muted" />
        <input
          id="coinSearchInput"
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={
            activeTab === 'roster'
              ? `Filter ${coins.length} tokens (BTC, SOL, PEPE, SUI, DOGE)...`
              : 'Search 10,000+ online crypto tokens (e.g. KAS, TAO, BONK)...'
          }
          className="w-full bg-surface-panel/90 border border-white/10 rounded-lg pl-8 pr-3 py-1 text-[11px] font-mono text-text-primary placeholder:text-text-muted focus:border-primary-container focus:outline-none transition-colors"
          autoFocus
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1.5 text-text-muted hover:text-text-primary cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* ROSTER TAB: Local / Pre-loaded Coins */}
      {activeTab === 'roster' && (
        <>
          <div id="manageCoinList" className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1">
            {filteredCoins.map((coin) => {
              const isSelected = selectedCoinIds.includes(coin.id);
              return (
                <label
                  key={coin.id}
                  className={`coin-item flex items-center justify-between p-1.5 rounded-md border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-surface-panel/90 border-primary-container/30 text-text-primary'
                      : 'bg-surface-panel/40 border-white/5 text-text-secondary hover:border-white/20'
                  }`}
                  onClick={() => {
                    if (soundEnabled) playHudSound('click');
                    onToggleCoin(coin.id);
                  }}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <CoinIcon
                      symbol={coin.symbol}
                      name={coin.name}
                      color={coin.color}
                      iconSymbol={coin.iconSymbol}
                      imageUrl={coin.imageUrl}
                      size="sm"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-[10px] font-mono truncate">{coin.symbol}</span>
                      <span className="text-[8px] text-text-muted truncate max-w-[70px]">{coin.name}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-[9px] font-mono text-text-muted hidden sm:inline">
                      {formatCurrency(coin.price)}
                    </span>
                    <div
                      className={`p-1 rounded transition-colors ${
                        isSelected
                          ? 'text-primary-container'
                          : 'text-text-muted hover:text-text-secondary'
                      }`}
                      title={isSelected ? 'Starred (on Watchlist) - Click to unstar' : 'Star to add to Watchlist'}
                    >
                      <Star
                        className={`w-3.5 h-3.5 transition-transform ${
                          isSelected
                            ? 'fill-primary-container drop-shadow-[0_0_5px_rgba(0,245,160,0.5)] scale-110'
                            : ''
                        }`}
                      />
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {filteredCoins.length === 0 && (
            <div className="p-3 text-center bg-surface-panel/50 rounded-lg border border-white/5">
              <p className="text-[11px] text-text-muted font-mono">
                No tokens match "{searchQuery}" in your current roster.
              </p>
              <button
                onClick={() => {
                  setActiveTab('online');
                }}
                className="mt-1.5 px-3 py-1 rounded bg-primary-container text-surface-canvas font-mono font-bold text-[10px] uppercase flex items-center gap-1 mx-auto hover:opacity-90 cursor-pointer"
              >
                <Globe className="w-3 h-3" />
                Search across 10,000+ Online Tokens
              </button>
            </div>
          )}
        </>
      )}

      {/* ONLINE TAB: Search 10,000+ Cryptocurrencies */}
      {activeTab === 'online' && (
        <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
          {isSearchingOnline && (
            <div className="flex items-center justify-center gap-2 py-4 text-text-muted text-[11px] font-mono">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-container" />
              Searching global cryptocurrency database...
            </div>
          )}

          {!isSearchingOnline && onlineResults.length > 0 && (
            <div className="grid grid-cols-2 gap-1.5">
              {onlineResults.map((item) => {
                const isAlreadyInCoins = coins.some((c) => c.id === item.id || c.symbol === item.symbol);
                const isSelected = selectedCoinIds.includes(item.id) || addedSuccessIds.includes(item.id);
                const isAdding = addingCoinId === item.id;

                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-1.5 rounded-md bg-surface-panel/80 border border-white/10 hover:border-primary-container/40 transition-all"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {item.thumb ? (
                        <img
                          src={item.thumb}
                          alt={item.symbol}
                          className="w-4 h-4 rounded-full shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <CoinIcon symbol={item.symbol} name={item.name} size="sm" />
                      )}
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-[10px] font-mono text-text-primary">{item.symbol}</span>
                          {item.market_cap_rank && (
                            <span className="text-[8px] font-mono text-cyan-400 bg-cyan-400/10 px-1 rounded">
                              #{item.market_cap_rank}
                            </span>
                          )}
                        </div>
                        <span className="text-[8px] text-text-muted truncate max-w-[70px]">{item.name}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleAddOnlineToken(item)}
                      disabled={isAdding || isAlreadyInCoins || isSelected}
                      className={`px-1.5 py-1 rounded text-[9px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer ${
                        isAlreadyInCoins || isSelected
                          ? 'bg-oracle-synced/20 text-oracle-synced border border-oracle-synced/30'
                          : 'bg-primary-container text-surface-canvas hover:opacity-90 shadow-sm'
                      }`}
                      title={isAlreadyInCoins || isSelected ? 'Starred on Watchlist' : 'Star & add to Watchlist'}
                    >
                      {isAdding ? (
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      ) : isAlreadyInCoins || isSelected ? (
                        <>
                          <Star className="w-2.5 h-2.5 fill-current" />
                          <span>Starred</span>
                        </>
                      ) : (
                        <>
                          <Star className="w-2.5 h-2.5" />
                          <span>Star</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {!isSearchingOnline && searchQuery.trim().length >= 2 && onlineResults.length === 0 && (
            <div className="p-3 text-center bg-surface-panel/40 rounded-lg border border-white/5 text-[11px] font-mono text-text-muted">
              No online tokens found for "{searchQuery}". Try another symbol or name.
            </div>
          )}

          {!searchQuery.trim() && (
            <div className="p-3 text-center bg-surface-panel/30 rounded-lg border border-white/5 text-[11px] font-mono text-text-muted">
              Type any coin name or symbol above (e.g. <span className="text-primary-container">KAS</span>,{' '}
              <span className="text-primary-container">TAO</span>, <span className="text-primary-container">BONK</span>,{' '}
              <span className="text-primary-container">RENDER</span>, <span className="text-primary-container">PEPE</span>) to search across thousands of crypto tokens.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

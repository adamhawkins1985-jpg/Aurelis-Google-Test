import React, { useState } from 'react';
import {
  Target,
  Flame,
  CheckCircle2,
  TrendingUp,
  DollarSign,
  Users,
  Clock,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import { playHudSound, formatCurrency } from '../services/marketData';

interface PredictionMarket {
  id: string;
  title: string;
  category: 'Crypto' | 'Macro' | 'Tech';
  yesPrice: number; // in cents e.g. 0.68 = 68%
  noPrice: number;  // in cents e.g. 0.32 = 32%
  volume24h: number;
  endDate: string;
  liquidity: number;
  imageUrl?: string;
  hot?: boolean;
}

const INITIAL_PREDICTIONS: PredictionMarket[] = [
  {
    id: 'pred-1',
    title: 'Bitcoin to surpass $100,000 before end of Q4?',
    category: 'Crypto',
    yesPrice: 0.68,
    noPrice: 0.32,
    volume24h: 18450000,
    endDate: 'Dec 31, 2026',
    liquidity: 5200000,
    imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=400&q=80',
    hot: true,
  },
  {
    id: 'pred-2',
    title: 'Federal Reserve to lower Fed Funds rate at upcoming FOMC?',
    category: 'Macro',
    yesPrice: 0.84,
    noPrice: 0.16,
    volume24h: 24100000,
    endDate: 'Oct 30, 2026',
    liquidity: 9100000,
    imageUrl: 'https://images.unsplash.com/photo-1642543492481-44e81e3914a7?auto=format&fit=crop&w=400&q=80',
    hot: true,
  },
  {
    id: 'pred-3',
    title: 'Solana Market Cap to flip BNB before July?',
    category: 'Crypto',
    yesPrice: 0.42,
    noPrice: 0.58,
    volume24h: 7850000,
    endDate: 'Jun 30, 2026',
    liquidity: 2400000,
    imageUrl: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?auto=format&fit=crop&w=400&q=80',
    hot: false,
  },
  {
    id: 'pred-4',
    title: 'Spot Ethereum ETF cumulative net inflows to cross $5 Billion?',
    category: 'Crypto',
    yesPrice: 0.59,
    noPrice: 0.41,
    volume24h: 11200000,
    endDate: 'Nov 15, 2026',
    liquidity: 3800000,
    imageUrl: 'https://images.unsplash.com/photo-1622979135225-d2ba269bc1df?auto=format&fit=crop&w=400&q=80',
    hot: false,
  },
  {
    id: 'pred-5',
    title: 'First S&P 500 tech firm to disclose Bitcoin balance sheet treasury in 2026?',
    category: 'Tech',
    yesPrice: 0.35,
    noPrice: 0.65,
    volume24h: 5300000,
    endDate: 'Dec 31, 2026',
    liquidity: 1600000,
    imageUrl: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=400&q=80',
    hot: false,
  },
];

interface PredictionsScreenProps {
  soundEnabled: boolean;
}

export const PredictionsScreen: React.FC<PredictionsScreenProps> = ({ soundEnabled }) => {
  const [markets, setMarkets] = useState<PredictionMarket[]>(INITIAL_PREDICTIONS);
  const [selectedFilter, setSelectedFilter] = useState<'All' | 'Crypto' | 'Macro' | 'Tech'>('All');
  const [betModal, setBetModal] = useState<{
    market: PredictionMarket;
    outcome: 'YES' | 'NO';
  } | null>(null);
  const [betAmount, setBetAmount] = useState('50');
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const filtered = selectedFilter === 'All'
    ? markets
    : markets.filter((m) => m.category === selectedFilter);

  const handleBetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!betModal || !betAmount || Number(betAmount) <= 0) return;

    if (soundEnabled) playHudSound('trade');
    const amt = parseFloat(betAmount);
    const price = betModal.outcome === 'YES' ? betModal.market.yesPrice : betModal.market.noPrice;
    const shares = (amt / price).toFixed(1);
    const potentialPayout = (Number(shares) * 1.0).toFixed(2);

    setSuccessToast(`Bought ${shares} shares of ${betModal.outcome} for $${amt}. Potential Payout: $${potentialPayout}`);
    setBetModal(null);
    setBetAmount('50');
    setTimeout(() => setSuccessToast(null), 4500);
  };

  return (
    <div className="flex flex-col gap-5 p-3 sm:p-5 max-w-4xl mx-auto w-full select-none pb-20 animate-in fade-in duration-200">
      {/* Toast Alert */}
      {successToast && (
        <div className="p-3 bg-status-success/20 border border-status-success/40 text-status-success rounded-xl text-xs font-mono flex items-center gap-2 animate-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Header Banner */}
      <section className="p-5 rounded-2xl bg-gradient-to-br from-surface-panel to-surface-container-high/40 border border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.45)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-amber-400" />
            <h1 className="font-headline font-bold text-base sm:text-lg text-text-primary">
              Aurelis Decentralized Prediction Markets
            </h1>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-mono font-bold">
            <Flame className="w-3.5 h-3.5" />
            <span>24h Volume: $66.8M</span>
          </div>
        </div>

        <p className="text-xs text-text-secondary font-sans leading-relaxed">
          Trade on future event outcomes with automated market maker pricing. Buy YES or NO shares; winning shares redeem for $1.00 USDC.
        </p>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-white/5">
          {(['All', 'Crypto', 'Macro', 'Tech'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => {
                if (soundEnabled) playHudSound('switch');
                setSelectedFilter(filter);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                selectedFilter === filter
                  ? 'bg-amber-400 text-surface-canvas shadow-[0_0_12px_rgba(251,191,36,0.3)]'
                  : 'bg-surface-panel border border-white/5 text-text-muted hover:text-text-primary'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </section>

      {/* Prediction Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {filtered.map((market) => {
          const yesPct = Math.round(market.yesPrice * 100);
          const noPct = Math.round(market.noPrice * 100);

          return (
            <div
              key={market.id}
              className="p-4 rounded-xl bg-surface-panel/85 border border-white/5 hover:border-white/20 transition-all flex flex-col justify-between gap-3 shadow-sm hover:shadow-[0_4px_25px_rgba(0,0,0,0.4)]"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-headline font-bold text-xs sm:text-sm text-text-primary leading-snug">
                  {market.title}
                </h3>
                {market.hot && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 text-[9px] font-mono font-bold border border-rose-500/30 shrink-0">
                    <Flame className="w-2.5 h-2.5" />
                    HOT
                  </span>
                )}
              </div>

              {/* Progress Bar of Probability */}
              <div>
                <div className="flex items-center justify-between text-xs font-mono font-bold mb-1">
                  <span className="text-primary-container">YES {yesPct}%</span>
                  <span className="text-rose-400">NO {noPct}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-rose-500/30 overflow-hidden flex">
                  <div
                    className="h-full bg-primary-container transition-all duration-500"
                    style={{ width: `${yesPct}%` }}
                  />
                </div>
              </div>

              {/* Stats: Volume & End Date */}
              <div className="flex items-center justify-between text-[10px] font-mono text-text-muted pt-1">
                <span>Vol: ${(market.volume24h / 1000000).toFixed(1)}M</span>
                <span>Resolves: {market.endDate}</span>
              </div>

              {/* Trade Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => {
                    if (soundEnabled) playHudSound('click');
                    setBetModal({ market, outcome: 'YES' });
                  }}
                  className="py-2 rounded-xl bg-primary-container/15 hover:bg-primary-container border border-primary-container/30 text-primary-container hover:text-on-primary-container font-mono font-bold text-xs transition-all flex items-center justify-center gap-1 cursor-pointer group"
                >
                  <span>Buy YES</span>
                  <span className="text-[10px] opacity-75">(${market.yesPrice.toFixed(2)})</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (soundEnabled) playHudSound('click');
                    setBetModal({ market, outcome: 'NO' });
                  }}
                  className="py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500 border border-rose-500/30 text-rose-400 hover:text-white font-mono font-bold text-xs transition-all flex items-center justify-center gap-1 cursor-pointer group"
                >
                  <span>Buy NO</span>
                  <span className="text-[10px] opacity-75">(${market.noPrice.toFixed(2)})</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bet Modal */}
      {betModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setBetModal(null)}
        >
          <div
            className="w-full max-w-sm bg-surface-panel rounded-2xl border border-white/10 p-5 shadow-2xl animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className={`px-2 py-0.5 rounded text-xs font-mono font-bold uppercase ${
                  betModal.outcome === 'YES'
                    ? 'bg-primary-container/20 text-primary-container border border-primary-container/30'
                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                }`}
              >
                Buy {betModal.outcome} Shares
              </span>

              <button
                type="button"
                onClick={() => setBetModal(null)}
                className="text-text-muted hover:text-text-primary cursor-pointer"
              >
                ✕
              </button>
            </div>

            <h3 className="font-headline font-bold text-xs sm:text-sm text-text-primary leading-snug mb-4">
              {betModal.market.title}
            </h3>

            <form onSubmit={handleBetSubmit} className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-[11px] font-mono text-text-muted mb-1">
                  <span>Investment Amount (USD)</span>
                  <span>Wallet: $4,250.00 USDC</span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-text-muted font-mono text-sm">$</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={betAmount}
                    onChange={(e) => setBetAmount(e.target.value)}
                    className="w-full bg-surface-base pl-7 pr-3 py-2 rounded-xl border border-white/10 text-sm font-mono text-text-primary focus:border-amber-400 outline-none"
                    required
                  />
                </div>
              </div>

              {/* Quick Amount Buttons */}
              <div className="grid grid-cols-4 gap-1.5 text-xs font-mono">
                {['25', '50', '100', '250'].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setBetAmount(val)}
                    className="py-1 rounded-lg bg-surface-container hover:bg-white/10 text-text-secondary border border-white/5 cursor-pointer"
                  >
                    ${val}
                  </button>
                ))}
              </div>

              {/* Math preview */}
              <div className="p-3 rounded-xl bg-surface-base/60 border border-white/5 space-y-1.5 text-[11px] font-mono text-text-secondary">
                <div className="flex justify-between">
                  <span>Share Price</span>
                  <span className="text-text-primary font-bold">
                    ${betModal.outcome === 'YES' ? betModal.market.yesPrice.toFixed(2) : betModal.market.noPrice.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Estimated Shares</span>
                  <span className="text-text-primary font-bold">
                    {(Number(betAmount) / (betModal.outcome === 'YES' ? betModal.market.yesPrice : betModal.market.noPrice)).toFixed(1)}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-status-success pt-1 border-t border-white/5">
                  <span>Potential Return</span>
                  <span>
                    +${((Number(betAmount) / (betModal.outcome === 'YES' ? betModal.market.yesPrice : betModal.market.noPrice)) - Number(betAmount)).toFixed(2)} (
                    {(((1 / (betModal.outcome === 'YES' ? betModal.market.yesPrice : betModal.market.noPrice)) - 1) * 100).toFixed(0)}%)
                  </span>
                </div>
              </div>

              <button
                type="submit"
                className={`w-full py-2.5 rounded-xl font-mono font-bold text-xs transition-all cursor-pointer shadow-lg ${
                  betModal.outcome === 'YES'
                    ? 'bg-primary-container text-on-primary-container hover:opacity-90 shadow-[0_0_15px_rgba(0,245,160,0.3)]'
                    : 'bg-rose-500 text-white hover:opacity-90 shadow-[0_0_15px_rgba(244,63,94,0.3)]'
                }`}
              >
                Confirm Order: Buy {betModal.outcome}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

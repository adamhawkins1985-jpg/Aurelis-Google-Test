import React, { useState } from 'react';
import {
  Zap,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Sliders,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import { playHudSound, formatCurrency } from '../services/marketData';

interface Position {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  markPrice: number;
  liqPrice: number;
  leverage: number;
  margin: number;
  pnlUsd: number;
  pnlPercent: number;
}

const INITIAL_POSITIONS: Position[] = [
  {
    id: 'pos-1',
    symbol: 'BTC-PERP',
    side: 'LONG',
    size: 0.25,
    entryPrice: 63950.0,
    markPrice: 64800.0,
    liqPrice: 58200.0,
    leverage: 10,
    margin: 1598.75,
    pnlUsd: 212.5,
    pnlPercent: 13.29,
  },
  {
    id: 'pos-2',
    symbol: 'ETH-PERP',
    side: 'SHORT',
    size: 2.5,
    entryPrice: 3510.0,
    markPrice: 3450.0,
    liqPrice: 3780.0,
    leverage: 15,
    margin: 585.0,
    pnlUsd: 150.0,
    pnlPercent: 25.64,
  },
];

interface PerpsScreenProps {
  soundEnabled: boolean;
}

export const PerpsScreen: React.FC<PerpsScreenProps> = ({ soundEnabled }) => {
  const [selectedPair, setSelectedPair] = useState('BTC-PERP');
  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [leverage, setLeverage] = useState<number>(10);
  const [marginInput, setMarginInput] = useState<string>('250');
  const [positions, setPositions] = useState<Position[]>(INITIAL_POSITIONS);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Mock live prices
  const markPrice = selectedPair === 'BTC-PERP'
    ? 64800.0
    : selectedPair === 'ETH-PERP'
    ? 3450.0
    : selectedPair === 'SOL-PERP'
    ? 152.4
    : 0.98;

  const fundingRate = '+0.0102% in 2h 45m';

  // Computed values
  const marginUsd = parseFloat(marginInput) || 0;
  const positionSizeUsd = marginUsd * leverage;
  const positionSizeTokens = markPrice > 0 ? (positionSizeUsd / markPrice).toFixed(4) : '0';

  // Liquidation calculation (simplified)
  const liqDistance = (1 / leverage) * 0.9;
  const liqPrice = side === 'LONG'
    ? markPrice * (1 - liqDistance)
    : markPrice * (1 + liqDistance);

  const handlePlaceOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (marginUsd <= 0) return;

    if (soundEnabled) {
      playHudSound('trade');
    }

    const newPos: Position = {
      id: `pos-${Date.now()}`,
      symbol: selectedPair,
      side,
      size: parseFloat(positionSizeTokens),
      entryPrice: markPrice,
      markPrice,
      liqPrice: parseFloat(liqPrice.toFixed(2)),
      leverage,
      margin: marginUsd,
      pnlUsd: 0,
      pnlPercent: 0,
    };

    setPositions([newPos, ...positions]);
    setToastMessage(`Executed ${leverage}x ${side} on ${selectedPair} for $${marginUsd}`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleClosePosition = (id: string) => {
    if (soundEnabled) playHudSound('click');
    setPositions(positions.filter((p) => p.id !== id));
    setToastMessage('Position closed at market price.');
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <div className="flex flex-col gap-5 p-3 sm:p-5 max-w-4xl mx-auto w-full select-none pb-20 animate-in fade-in duration-200">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="p-3 bg-primary-container/20 border border-primary-container/40 text-primary-container rounded-xl text-xs font-mono flex items-center gap-2 animate-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Bar */}
      <section className="p-4 rounded-2xl bg-surface-panel border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 font-mono font-bold text-xs">
            <Zap className="w-4 h-4" />
            <span>PERPETUALS</span>
          </div>

          <div className="flex items-center gap-1.5">
            {['BTC-PERP', 'ETH-PERP', 'SOL-PERP', 'AURELIS-PERP'].map((pair) => (
              <button
                key={pair}
                type="button"
                onClick={() => setSelectedPair(pair)}
                className={`px-2 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                  selectedPair === pair
                    ? 'bg-surface-container text-primary-container border border-primary-container/30'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {pair.replace('-PERP', '')}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div>
            <span className="text-text-muted text-[10px] block">Mark Price</span>
            <span className="font-bold text-text-primary">{formatCurrency(markPrice)}</span>
          </div>
          <div>
            <span className="text-text-muted text-[10px] block">Funding Rate</span>
            <span className="text-oracle-synced font-bold">{fundingRate}</span>
          </div>
        </div>
      </section>

      {/* Order Entry Form & Order Book Depth */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Order Form (2 Cols on md) */}
        <div className="md:col-span-2 p-5 rounded-2xl bg-surface-panel border border-white/10 shadow-lg space-y-4">
          {/* Long / Short Switch */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-surface-base rounded-xl border border-white/5">
            <button
              type="button"
              onClick={() => setSide('LONG')}
              className={`py-2 rounded-lg font-mono font-bold text-xs transition-all flex items-center justify-center gap-1 cursor-pointer ${
                side === 'LONG'
                  ? 'bg-status-success text-surface-canvas shadow-[0_0_12px_rgba(0,245,160,0.35)]'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>LONG / BUY</span>
            </button>

            <button
              type="button"
              onClick={() => setSide('SHORT')}
              className={`py-2 rounded-lg font-mono font-bold text-xs transition-all flex items-center justify-center gap-1 cursor-pointer ${
                side === 'SHORT'
                  ? 'bg-status-error text-white shadow-[0_0_12px_rgba(244,63,94,0.35)]'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5" />
              <span>SHORT / SELL</span>
            </button>
          </div>

          {/* Leverage Selector */}
          <div>
            <div className="flex items-center justify-between text-xs font-mono text-text-muted mb-2">
              <span className="flex items-center gap-1">
                <Sliders className="w-3.5 h-3.5 text-primary-container" />
                <span>Leverage: <strong className="text-text-primary">{leverage}x</strong></span>
              </span>
              <span>Max: 50x</span>
            </div>

            <div className="grid grid-cols-6 gap-1 font-mono text-xs">
              {[2, 5, 10, 20, 30, 50].map((lev) => (
                <button
                  key={lev}
                  type="button"
                  onClick={() => setLeverage(lev)}
                  className={`py-1.5 rounded-lg font-bold border transition-all cursor-pointer ${
                    leverage === lev
                      ? 'bg-primary-container/20 border-primary-container text-primary-container'
                      : 'bg-surface-base border-white/5 text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {lev}x
                </button>
              ))}
            </div>
          </div>

          {/* Margin Input */}
          <form onSubmit={handlePlaceOrder} className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs font-mono text-text-muted mb-1">
                <span>Margin Collateral (USD)</span>
                <span>Available: $4,250.00 USDC</span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-text-muted font-mono text-sm">$</span>
                <input
                  type="number"
                  min="10"
                  step="10"
                  value={marginInput}
                  onChange={(e) => setMarginInput(e.target.value)}
                  className="w-full bg-surface-base pl-7 pr-3 py-2 rounded-xl border border-white/10 text-sm font-mono text-text-primary focus:border-primary-container outline-none"
                  required
                />
              </div>
            </div>

            {/* Calculations Preview */}
            <div className="p-3 rounded-xl bg-surface-base/60 border border-white/5 space-y-1.5 text-xs font-mono text-text-secondary">
              <div className="flex justify-between">
                <span>Total Position Size</span>
                <span className="text-text-primary font-bold">
                  {formatCurrency(positionSizeUsd)} ({positionSizeTokens} {selectedPair.replace('-PERP', '')})
                </span>
              </div>
              <div className="flex justify-between">
                <span>Entry Price</span>
                <span className="text-text-primary">{formatCurrency(markPrice)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span className="flex items-center gap-1 text-rose-400">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Est. Liquidation Price</span>
                </span>
                <span className="text-rose-400">{formatCurrency(liqPrice)}</span>
              </div>
            </div>

            <button
              type="submit"
              className={`w-full py-3 rounded-xl font-mono font-bold text-xs transition-all cursor-pointer shadow-lg uppercase tracking-wider ${
                side === 'LONG'
                  ? 'bg-status-success text-surface-canvas hover:opacity-95 shadow-[0_0_15px_rgba(0,245,160,0.3)]'
                  : 'bg-status-error text-white hover:opacity-95 shadow-[0_0_15px_rgba(244,63,94,0.3)]'
              }`}
            >
              Open {leverage}x {side} ({formatCurrency(positionSizeUsd)})
            </button>
          </form>
        </div>

        {/* Mini Order Book Depth (1 Col on md) */}
        <div className="p-4 rounded-2xl bg-surface-panel border border-white/10 shadow-lg flex flex-col justify-between">
          <div className="font-headline font-bold text-xs text-text-primary mb-2 flex items-center justify-between">
            <span>Order Book Depth</span>
            <span className="text-[10px] font-mono text-oracle-synced">0.01 Spread</span>
          </div>

          {/* Asks (Sells / Red) */}
          <div className="space-y-1 text-[11px] font-mono mb-2">
            {[
              { p: markPrice * 1.004, s: '1.42', bar: 75 },
              { p: markPrice * 1.002, s: '0.85', bar: 50 },
              { p: markPrice * 1.001, s: '2.14', bar: 90 },
            ].map((ask, idx) => (
              <div key={idx} className="relative flex justify-between px-1.5 py-0.5 rounded overflow-hidden">
                <div
                  className="absolute right-0 top-0 bottom-0 bg-status-error/10 pointer-events-none"
                  style={{ width: `${ask.bar}%` }}
                />
                <span className="text-status-error z-10">{ask.p.toFixed(2)}</span>
                <span className="text-text-muted z-10">{ask.s}</span>
              </div>
            ))}
          </div>

          {/* Current Mid Price */}
          <div className="py-1 px-2 my-1 rounded bg-surface-base font-mono font-bold text-center text-xs text-text-primary border border-white/5">
            {formatCurrency(markPrice)}
          </div>

          {/* Bids (Buys / Green) */}
          <div className="space-y-1 text-[11px] font-mono">
            {[
              { p: markPrice * 0.999, s: '3.12', bar: 95 },
              { p: markPrice * 0.998, s: '1.20', bar: 60 },
              { p: markPrice * 0.996, s: '0.94', bar: 40 },
            ].map((bid, idx) => (
              <div key={idx} className="relative flex justify-between px-1.5 py-0.5 rounded overflow-hidden">
                <div
                  className="absolute right-0 top-0 bottom-0 bg-status-success/10 pointer-events-none"
                  style={{ width: `${bid.bar}%` }}
                />
                <span className="text-status-success z-10">{bid.p.toFixed(2)}</span>
                <span className="text-text-muted z-10">{bid.s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Open Positions Table */}
      <section className="rounded-2xl bg-surface-panel border border-white/10 p-4 shadow-lg">
        <h2 className="font-headline font-bold text-sm text-text-primary mb-3">
          Open Positions ({positions.length})
        </h2>

        {positions.length === 0 ? (
          <div className="text-center py-8 text-xs font-mono text-text-muted">
            No open perpetual positions. Open a Long or Short to trade with leverage.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-[10px] text-text-muted">
                  <th className="pb-2">Contract</th>
                  <th className="pb-2">Size</th>
                  <th className="pb-2">Entry</th>
                  <th className="pb-2">Mark</th>
                  <th className="pb-2">Liq Price</th>
                  <th className="pb-2 text-right">PnL (ROE)</th>
                  <th className="pb-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {positions.map((pos) => {
                  const isPos = pos.pnlUsd >= 0;
                  return (
                    <tr key={pos.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              pos.side === 'LONG'
                                ? 'bg-status-success/20 text-status-success'
                                : 'bg-status-error/20 text-status-error'
                            }`}
                          >
                            {pos.side} {pos.leverage}x
                          </span>
                          <span className="font-bold text-text-primary">{pos.symbol}</span>
                        </div>
                      </td>

                      <td className="py-2.5 text-text-secondary">
                        {pos.size} ({formatCurrency(pos.margin * pos.leverage)})
                      </td>

                      <td className="py-2.5 text-text-muted">
                        ${pos.entryPrice.toLocaleString()}
                      </td>

                      <td className="py-2.5 text-text-primary font-bold">
                        ${pos.markPrice.toLocaleString()}
                      </td>

                      <td className="py-2.5 text-rose-400 font-bold">
                        ${pos.liqPrice.toLocaleString()}
                      </td>

                      <td className="py-2.5 text-right font-bold">
                        <span className={isPos ? 'text-status-success' : 'text-status-error'}>
                          {isPos ? '+' : ''}${pos.pnlUsd.toFixed(2)} ({isPos ? '+' : ''}{pos.pnlPercent.toFixed(2)}%)
                        </span>
                      </td>

                      <td className="py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleClosePosition(pos.id)}
                          className="px-2.5 py-1 rounded-lg bg-surface-container hover:bg-white/10 text-[11px] text-text-secondary hover:text-text-primary border border-white/5 cursor-pointer transition-colors"
                        >
                          Market Close
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

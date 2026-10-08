import React, { useState, useEffect, useMemo } from 'react';
import {
  Radio,
  Sliders,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  Sparkles,
  BarChart2,
  RefreshCw,
  Eye,
  Zap,
  ChevronDown,
  ChevronUp,
  Settings2,
  BookOpen,
  PieChart,
  Share2,
  Maximize2,
} from 'lucide-react';
import { CoinData } from '../types';
import { playHudSound, formatCurrency } from '../services/marketData';
import { KrakenLiveChart } from './KrakenLiveChart';

interface SignalDeskScreenProps {
  coins: CoinData[];
  onSelectCoin?: (coin: CoinData) => void;
  soundEnabled: boolean;
  isStandalone?: boolean;
}

type MobileSubTab = 'chart' | 'intelligence' | 'depth' | 'watchlist';

export const SignalDeskScreen: React.FC<SignalDeskScreenProps> = ({
  coins,
  onSelectCoin,
  soundEnabled,
  isStandalone = false,
}) => {
  // State
  const [selectedCoinSymbol, setSelectedCoinSymbol] = useState<
    'BTC' | 'ETH' | 'SOL' | 'XRP' | 'DOGE' | 'ADA' | 'AVAX' | 'LINK' | 'ZEC'
  >('SOL');
  const [provider, setProvider] = useState<'Kraken Futures' | 'Kraken Spot'>('Kraken Futures');
  const [positionAmount, setPositionAmount] = useState('25');
  const [positionLeverage, setPositionLeverage] = useState('2');
  const [supportedLeverage, setSupportedLeverage] = useState<number[]>([]);
  const [timeframe, setTimeframe] = useState<'5m' | '15m' | '1H' | '4H'>('5m');
  const [activeIndicators, setActiveIndicators] = useState({
    ema20: true,
    ema50: true,
    bb: true,
    volume: true,
    liquidity: true,
    heatmap: true,
  });
  const [mobileSubTab, setMobileSubTab] = useState<MobileSubTab>('chart');
  const [isSettingsExpanded, setIsSettingsExpanded] = useState(false);
  const [refreshCountdown, setRefreshCountdown] = useState(5);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [krakenReview, setKrakenReview] = useState<any | null>(null);
  const [krakenToken, setKrakenToken] = useState('');
  const [orderBusy, setOrderBusy] = useState(false);
  const [liveBars, setLiveBars] = useState<any[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [livePrice, setLivePrice] = useState(0);
  const [deepDecision, setDeepDecision] = useState<any | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);
  const [deepError, setDeepError] = useState<string | null>(null);

  // Active Position state
  const [activePosition, setActivePosition] = useState<{
    symbol: string;
    side: 'LONG' | 'SHORT';
    leverage: number;
    sizeUsd: number;
    marginUsd: number;
    entryPrice: number;
    markPrice: number;
    unrealizedPnl: number;
    pnlPct: number;
    txid?: string;
  } | null>(null);

  // Countdown timer for analysis refresh
  useEffect(() => {
    const timer = setInterval(() => {
      setRefreshCountdown((prev) => (prev <= 1 ? 5 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadLivePosition = async () => {
      try {
        const response = await fetch('/api/kraken/live-status', { cache: 'no-store', credentials: 'include' });
        const data = await response.json();
        if (cancelled || !response.ok || !data?.ok || !Array.isArray(data.positions)) return;
        const p = data.positions[0];
        if (!p) { setActivePosition(null); return; }
        const rawPair = String(p.pair || '').toUpperCase();
        const symbol = rawPair.startsWith('XBT') ? 'BTC' : rawPair.replace(/USD.*$/,'').replace(/^X/,'').replace(/^Z/,'') || selectedCoinSymbol;
        const margin = Number(p.margin || 0);
        const value = Math.abs(Number(p.value || 0));
        const pnl = Number(p.pnl || 0);
        const entry = Number(p.openingPrice || 0);
        const remaining = Number(p.remaining || 0);
        const mark = remaining > 0 && value > 0 ? value / remaining : entry;
        setActivePosition({
          symbol,
          side: String(p.side || '').toLowerCase() === 'sell' ? 'SHORT' : 'LONG',
          leverage: margin > 0 && value > 0 ? Math.max(1, Math.round(value / margin)) : 2,
          sizeUsd: value,
          marginUsd: margin,
          entryPrice: entry,
          markPrice: mark,
          unrealizedPnl: pnl,
          pnlPct: margin > 0 ? (pnl / margin) * 100 : 0,
          txid: String(p.txid || ''),
        });
      } catch {}
    };
    loadLivePosition();
    const timer = window.setInterval(loadLivePosition, 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const intervalMap: Record<string, number> = { '5m': 5, '15m': 15, '1H': 60, '4H': 240 };
    const load = async () => {
      setChartLoading(true);
      try {
        const response = await fetch(
          '/api/kraken/ohlc/' + selectedCoinSymbol + '?interval=' + (intervalMap[timeframe] || 5),
          { cache: 'no-store' }
        );
        const data = await response.json();
        if (!response.ok || !data?.ok || !Array.isArray(data.bars)) throw new Error(data?.detail || data?.error || 'Kraken chart unavailable');
        if (!cancelled) {
          setLiveBars(data.bars);
          setChartError(null);
        }
      } catch (error: any) {
        if (!cancelled) setChartError(error?.message || 'Kraken chart unavailable');
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    };
    load();
    const timer = window.setInterval(load, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedCoinSymbol, timeframe]);

  useEffect(() => {
    let cancelled = false;
    const loadDeep = async () => {
      setDeepLoading(true);
      try {
        const response = await fetch('/api/signal-desk/deep/' + selectedCoinSymbol, { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok || !data?.ok) throw new Error(data?.detail || data?.error || 'Deep desk unavailable');
        if (!cancelled) {
          setDeepDecision(data);
          setDeepError(null);
          setRefreshCountdown(5);
        }
      } catch (error: any) {
        if (!cancelled) setDeepError(error?.message || 'Deep desk unavailable');
      } finally {
        if (!cancelled) setDeepLoading(false);
      }
    };
    loadDeep();
    const timer = window.setInterval(loadDeep, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedCoinSymbol]);

  const selectedCoinData = coins.find((coin) => coin.symbol.toUpperCase() === selectedCoinSymbol);
  const deskPrice = Number(selectedCoinData?.price || 0);
  const deskEntry = Number(deepDecision?.levels?.entry || deskPrice || 0);
  const deskStop = Number(deepDecision?.levels?.stop || (deskPrice > 0 ? deskPrice * 0.994 : 0));
  const deskTarget = Number(deepDecision?.levels?.target || (deskPrice > 0 ? deskPrice * 1.011 : 0));
  const deskDirection: 'LONG' | 'SHORT' = deepDecision?.direction === 'SHORT' ? 'SHORT' : 'LONG';

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch('/api/kraken/margin-info/' + encodeURIComponent(selectedCoinSymbol), { cache: 'no-store' });
        const data = await response.json();
        if (!active || !response.ok || !data?.ok) return;
        const allowed = (deskDirection === 'SHORT' ? data.sell : data.buy).map(Number).filter((x:number)=>Number.isFinite(x)&&x>0);
        setSupportedLeverage(allowed);
        if (allowed.length && !allowed.includes(Number(positionLeverage))) setPositionLeverage(String(allowed[0]));
      } catch {}
    };
    load();
    return () => { active = false; };
  }, [selectedCoinSymbol, deskDirection]);

  const deskSizing = useMemo(() => {
    const position = Number(positionAmount);
    const lev = Number(positionLeverage);
    if (!(position > 0) || !(lev > 0) || !(deskEntry > 0) || !(deskStop > 0) || !(deskTarget > 0)) return null;
    const stopPct = Math.abs(deskEntry - deskStop) / deskEntry;
    const targetPct = Math.abs(deskTarget - deskEntry) / deskEntry;
    const loss = position * stopPct;
    const gain = position * targetPct;
    return { position, margin: position / lev, loss, gain, stopPct: stopPct*100, targetPct: targetPct*100, rr: loss>0?gain/loss:0 };
  }, [positionAmount, positionLeverage, deskEntry, deskStop, deskTarget]);

  const handleReviewSetup = async () => {
    if (!deskPrice || !deskStop || !deskTarget) {
      setToastMessage('Live Kraken price is unavailable for this asset.');
      return;
    }
    setOrderBusy(true);
    setKrakenReview(null);
    setKrakenToken('');
    try {
      const response = await fetch('/api/signal-desk/order/prepare', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'KRAKEN',
          asset: selectedCoinSymbol,
          direction: deskDirection,
          amount: Number(positionAmount || 25),
          leverage: Number(positionLeverage),
          stopLoss: deskStop,
          takeProfit: deskTarget,
          signal: { source: 'signal_desk_deep', timeframe, readiness: deepDecision?.readiness, scores: deepDecision?.scores },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || data?.message || 'Kraken review failed.');
      setKrakenReview(data.preview || null);
      setKrakenToken(String(data.confirmation?.token || ''));
      setToastMessage('Kraken review ready. Check the locked values before Execute.');
      if (soundEnabled) playHudSound('trade');
    } catch (error: any) {
      setToastMessage(error?.message || 'Kraken review failed.');
    } finally {
      setOrderBusy(false);
      setTimeout(() => setToastMessage(null), 4500);
    }
  };

  const handleExecuteSetup = async () => {
    if (!krakenToken) {
      setToastMessage('Review the Kraken setup first.');
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }
    setOrderBusy(true);
    try {
      const response = await fetch('/api/signal-desk/order/submit', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmationToken: krakenToken }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || data?.message || 'Kraken submission failed.');
      const mark = Number(data?.execution?.markPriceAtSubmit || deskPrice);
      setActivePosition({
        symbol: selectedCoinSymbol,
        side: deskDirection,
        leverage: Number(positionLeverage),
        sizeUsd: Number(positionAmount || 25),
        marginUsd: Number(positionAmount || 25) / Math.max(1, Number(positionLeverage)),
        entryPrice: mark,
        markPrice: mark,
        unrealizedPnl: 0,
        pnlPct: 0,
      });
      setKrakenToken('');
      setToastMessage('Kraken order submitted. Live position status will confirm execution.');
      if (soundEnabled) playHudSound('trade');
    } catch (error: any) {
      setToastMessage(error?.message || 'Kraken submission failed.');
    } finally {
      setOrderBusy(false);
      setTimeout(() => setToastMessage(null), 4500);
    }
  };

  const handleClosePosition = async () => {
    if (!activePosition?.txid || orderBusy) return;
    if (!window.confirm(`Close ${activePosition.symbol} ${activePosition.side} at market now?`)) return;
    if (soundEnabled) playHudSound('click');
    setOrderBusy(true);
    try {
      const response = await fetch('/api/kraken/close-position', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txid: activePosition.txid }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Close failed');
      setActivePosition(null);
      setToastMessage(data?.alreadyClosed ? 'Position was already closed.' : 'Kraken close order submitted.');
    } catch (error:any) {
      setToastMessage(error?.message || 'Kraken close failed.');
    } finally {
      setOrderBusy(false);
      setTimeout(() => setToastMessage(null), 3500);
    }
  };

  const availableCoins: Array<
    'BTC' | 'ETH' | 'SOL' | 'XRP' | 'DOGE' | 'ADA' | 'AVAX' | 'LINK' | 'ZEC'
  > = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'ZEC'];

  // Subcomponents reusable between Mobile Cockpit & Desktop Panoramic
  const renderWatchlistAndTrades = () => (
    <div className="flex flex-col gap-3">
      {/* Watchlist */}
      <div className="p-3 sm:p-3.5 rounded-xl bg-surface-panel/95 border border-white/10 shadow-lg">
        <div className="flex items-center justify-between pb-2 border-b border-white/5 mb-2">
          <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">
            WATCHLIST
          </span>
          <span className="text-[10px] text-text-muted">Selected markets</span>
        </div>

        <div className="space-y-1.5 sm:space-y-2">
          {[
            { sym: 'BTC', price: '83,891.6', status: 'NO TRADE', conf: '36% Weak', isLong: false, isShort: false },
            { sym: 'ETH', price: '2,689.24', status: 'NO TRADE', conf: '26% Weak', isLong: false, isShort: false },
            { sym: 'SOL', price: '121.03', status: 'LONG', conf: '61% Developing', isLong: true, isShort: false },
            { sym: 'XRP', price: '1.5676', status: 'SHORT', conf: '58% Developing', isLong: false, isShort: true },
          ].map((item) => (
            <div
              key={item.sym}
              onClick={() => {
                if (soundEnabled) playHudSound('switch');
                setSelectedCoinSymbol(item.sym as any);
              }}
              className={`p-2 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                selectedCoinSymbol === item.sym
                  ? 'bg-primary-container/15 border-primary-container/50 shadow-[0_0_8px_rgba(0,245,160,0.15)]'
                  : 'bg-surface-base/60 border-white/5 hover:border-white/20'
              }`}
            >
              <div>
                <div className="font-bold text-text-primary text-[11px] flex items-center gap-1.5">
                  <span>{item.sym}</span>
                  <span className="text-text-muted font-normal">${item.price}</span>
                </div>
                <div
                  className={`text-[9.5px] font-bold ${
                    item.isLong
                      ? 'text-status-success'
                      : item.isShort
                      ? 'text-status-error'
                      : 'text-text-muted'
                  }`}
                >
                  {item.status}
                </div>
              </div>

              <span className="text-[10px] font-mono text-text-secondary">{item.conf}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Live Trades Card */}
      <div className="p-3 sm:p-3.5 rounded-xl bg-surface-panel/95 border border-white/10 shadow-lg flex flex-col justify-between gap-2.5">
        <div className="flex items-center justify-between pb-1.5 border-b border-white/5">
          <div>
            <span className="text-[10px] text-text-muted uppercase font-bold block">LIVE TRADES</span>
            <span className="text-[11px] font-bold text-text-primary">{activePosition ? '1 active position' : 'No active positions'}</span>
          </div>
          <span className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] font-bold text-text-muted">
            KRAKEN
          </span>
        </div>

        {activePosition ? (
          <div className="p-2.5 rounded-lg bg-surface-base border border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-text-primary text-xs">
                  {activePosition.symbol} {activePosition.leverage}x
                </span>
                <span className="px-1.5 py-0.5 rounded bg-status-success/20 text-status-success text-[9px] font-bold">
                  {activePosition.side}
                </span>
              </div>
              <span className="text-[10px] text-text-muted">Kraken USD</span>
            </div>

            <div className="grid grid-cols-2 gap-1 text-[10px] text-text-secondary">
              <div>
                <span className="text-text-muted block text-[9px]">POSITION</span>
                <span>${activePosition.sizeUsd.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-text-muted block text-[9px]">MARGIN</span>
                <span>${activePosition.marginUsd.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-text-muted block text-[9px]">ENTRY</span>
                <span>${activePosition.entryPrice.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-text-muted block text-[9px]">MARK</span>
                <span>${activePosition.markPrice.toFixed(2)}</span>
              </div>
            </div>

            {/* Unrealized PnL */}
            <div className="p-1.5 rounded bg-rose-500/10 border border-rose-500/20 text-center">
              <span className="text-[9px] text-text-muted block">UNREALIZED P&L</span>
              <span className="text-xs font-bold text-status-error">
                -${Math.abs(activePosition.unrealizedPnl).toFixed(2)} ({activePosition.pnlPct}%)
              </span>
            </div>

            <div className="flex items-center justify-between text-[10px] pt-1">
              <span className="text-text-muted">EST. IF CLOSED NOW</span>
              <span className="font-bold text-amber-400">
                ${(activePosition.marginUsd + activePosition.unrealizedPnl).toFixed(2)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                type="button"
                className="py-1 rounded bg-surface-container hover:bg-white/10 text-[10px] text-text-secondary cursor-pointer"
              >
                View chart
              </button>
              <button
                type="button"
                onClick={handleClosePosition}
                className="py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 text-[10px] font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-text-muted text-[11px]">
            No active trade. Execute setup from analyst panel.
          </div>
        )}
      </div>
    </div>
  );

  const renderChartAndSetup = () => {
    const bars = liveBars.slice(-120);
    const latest = bars[bars.length - 1];
    const currentPrice = Number(livePrice || latest?.close || deskPrice || 0);
    const previousClose = Number(bars[bars.length - 2]?.close || currentPrice || 0);
    const changePct = previousClose ? ((currentPrice - previousClose) / previousClose) * 100 : 0;
    const stop = currentPrice ? currentPrice * 0.994 : 0;
    const target = currentPrice ? currentPrice * 1.011 : 0;

    return (
      <div className="p-3 sm:p-3.5 rounded-xl bg-surface-panel/95 border border-white/10 shadow-lg flex flex-col gap-2.5 min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-headline font-bold text-sm text-text-primary truncate">{selectedCoinSymbol} USD</span>
            <span className="text-xs font-bold text-text-primary">{currentPrice ? formatCurrency(currentPrice) : '—'}</span>
            <span className={`text-[11px] font-bold ${changePct >= 0 ? 'text-status-success' : 'text-status-error'}`}>
              {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
            </span>
            <span className="text-[9px] text-text-muted">{timeframe} · Kraken WebSocket</span>
          </div>
          <span className="px-2 py-1 rounded-md bg-primary-container/10 border border-primary-container/25 text-[9px] text-primary-container font-bold">LIVE</span>
        </div>

        {chartError && !bars.length ? (
          <div className="h-72 sm:h-[340px] rounded-lg bg-surface-base/90 border border-white/5 flex items-center justify-center px-4 text-center text-[11px] text-status-error">
            {chartError}
          </div>
        ) : (
          <KrakenLiveChart
            symbol={selectedCoinSymbol}
            timeframe={timeframe}
            bars={bars}
            stop={stop}
            target={target}
            onPrice={setLivePrice}
          />
        )}

        <div className="grid grid-cols-3 gap-2 p-2 rounded-lg bg-surface-base border border-white/5 text-[10px] text-center min-w-0">
          <div className="min-w-0"><span className="text-[9px] text-text-muted block">LIVE</span><span className="font-bold text-cyan-400 break-all">{currentPrice ? currentPrice.toFixed(currentPrice >= 1 ? 2 : 6) : '—'}</span></div>
          <div className="min-w-0"><span className="text-[9px] text-text-muted block">STOP</span><span className="font-bold text-rose-400 break-all">{stop ? stop.toFixed(stop >= 1 ? 2 : 6) : '—'}</span></div>
          <div className="min-w-0"><span className="text-[9px] text-text-muted block">TARGET</span><span className="font-bold text-primary-container break-all">{target ? target.toFixed(target >= 1 ? 2 : 6) : '—'}</span></div>
        </div>
      </div>
    );
  };

  const renderLiquidityAndDepth = () => (
    <div className="p-3 sm:p-3.5 rounded-xl bg-surface-panel/95 border border-white/10 shadow-lg space-y-3">
      {/* Live Liquidity Bar */}
      <div className="p-2.5 rounded-lg bg-surface-base border border-white/5 space-y-1.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-bold text-text-primary">Live liquidity</span>
          <span className="text-text-muted">Balanced book • top 20 levels</span>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className="text-status-success font-bold">BIDS 52.4%</span>
          <span className="text-status-error font-bold">ASKS 47.6%</span>
        </div>

        <div className="w-full h-1.5 rounded-full overflow-hidden flex bg-surface-panel">
          <div className="h-full bg-status-success" style={{ width: '52.4%' }} />
          <div className="h-full bg-status-error" style={{ width: '47.6%' }} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 text-[9px] text-text-muted pt-1">
          <div>
            <span className="block">LARGEST BUY WALL</span>
            <span className="font-bold text-text-primary">120.86</span>
          </div>
          <div>
            <span className="block">LARGEST SELL WALL</span>
            <span className="font-bold text-text-primary">121.17</span>
          </div>
          <div>
            <span className="block">SPREAD</span>
            <span className="font-bold text-text-primary">2.48 bps</span>
          </div>
          <div>
            <span className="block">BOOK IMBALANCE</span>
            <span className="font-bold text-text-primary">4.8 pts</span>
          </div>
        </div>
      </div>

      {/* Order-Book Heatmap */}
      <div className="p-2.5 rounded-lg bg-surface-base border border-white/5 space-y-1">
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="font-bold text-text-primary">Order-book heat map</span>
          <span className="text-text-muted text-[9px]">Brighter = resting liquidity</span>
        </div>

        {/* Asks */}
        <div className="space-y-0.5 text-[9.5px]">
          {[
            { p: '121.10', size: '8,262.2', bar: 70 },
            { p: '121.09', size: '6,124.68', bar: 55 },
            { p: '121.08', size: '7,983.97', bar: 65 },
            { p: '121.07', size: '6,512.65', bar: 58 },
            { p: '121.06', size: '11,865.06', bar: 95 },
            { p: '121.05', size: '11,567.46', bar: 90 },
          ].map((ask) => (
            <div key={ask.p} className="relative flex justify-between px-1 py-0.5 rounded overflow-hidden">
              <div
                className="absolute right-0 top-0 bottom-0 bg-status-error/25 pointer-events-none"
                style={{ width: `${ask.bar}%` }}
              />
              <span className="text-status-error z-10 font-bold">{ask.p}</span>
              <span className="text-text-muted z-10">{ask.size}</span>
            </div>
          ))}
        </div>

        {/* Mark price divider */}
        <div className="py-0.5 px-2 bg-primary-container/10 border border-primary-container/30 text-center text-[10px] font-bold text-primary-container rounded">
          MARK 121.03
        </div>

        {/* Bids */}
        <div className="space-y-0.5 text-[9.5px]">
          {[
            { p: '121.00', size: '5,467.89', bar: 50 },
            { p: '120.99', size: '6,874.68', bar: 60 },
            { p: '120.98', size: '9,557.68', bar: 85 },
            { p: '120.97', size: '4,124.81', bar: 40 },
            { p: '120.96', size: '4,852.40', bar: 45 },
          ].map((bid) => (
            <div key={bid.p} className="relative flex justify-between px-1 py-0.5 rounded overflow-hidden">
              <div
                className="absolute right-0 top-0 bottom-0 bg-status-success/25 pointer-events-none"
                style={{ width: `${bid.bar}%` }}
              />
              <span className="text-status-success z-10 font-bold">{bid.p}</span>
              <span className="text-text-muted z-10">{bid.size}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderIntelligenceAndMatrix = () => {
    const d = deepDecision;
    const scores = d?.scores || {};
    const levels = d?.levels || {};
    const tfs = d?.timeframes || {};
    const readiness = Number(d?.readiness || 0);
    const label = String(d?.label || (deepLoading ? 'UPDATING' : 'WAIT'));
    const direction = d?.direction === 'SHORT' ? 'SHORT' : 'LONG';
    const readyTone = readiness >= 68 ? 'text-primary-container' : readiness >= 55 ? 'text-amber-400' : 'text-rose-400';
    const bar = (value: any) => Math.max(0, Math.min(100, Number(value || 0)));
    const fmt = (value: any, digits = 1) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—';

    return (
      <div className="p-3 sm:p-3.5 rounded-xl bg-surface-panel/95 border border-white/10 shadow-lg space-y-3">
        <div className="flex items-center justify-between pb-1.5 border-b border-white/5">
          <span className="text-[10px] text-text-muted uppercase font-bold">DEEP DESK</span>
          <span className={`px-2 py-0.5 rounded border border-white/10 text-[9.5px] font-bold ${readyTone}`}>
            {deepLoading ? 'Updating…' : `${fmt(readiness, 1)}% ${label}`}
          </span>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[9px] text-text-muted uppercase">Execution Readiness</div>
            <div className={`text-3xl font-headline font-black ${readyTone}`}>{fmt(readiness, 1)}</div>
          </div>
          <div className={`text-sm font-black ${direction === 'LONG' ? 'text-primary-container' : 'text-rose-400'}`}>{direction}</div>
        </div>
        <div className="h-2 rounded-full bg-surface-base overflow-hidden border border-white/5">
          <div className="h-full bg-primary-container transition-all duration-500" style={{ width: `${bar(readiness)}%` }} />
        </div>
        {deepError && <div className="p-2 rounded-lg border border-rose-500/20 bg-rose-500/10 text-[10px] text-rose-300">{deepError}</div>}
        <div className="grid grid-cols-2 gap-2 text-[9px]">
          {[
            ['SETUP', scores.setup], ['TIMING', scores.timing], ['FLOW', scores.flow],
            ['STRUCTURE', scores.structure], ['RISK', scores.risk], ['PAYOFF', scores.payoff],
          ].map(([name, value]) => (
            <div key={String(name)} className="p-2 rounded-lg bg-surface-base border border-white/5">
              <div className="flex justify-between gap-2 mb-1"><span className="text-text-muted">{name}</span><strong>{fmt(value, 0)}</strong></div>
              <div className="h-1 rounded bg-white/5 overflow-hidden"><div className="h-full bg-cyan-400" style={{ width: `${bar(value)}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="p-2.5 rounded-lg bg-surface-base border border-white/5 text-[10.5px] leading-relaxed">
          <div className="text-text-muted text-[9px] uppercase mb-1">What the desk is waiting for</div>
          <div className="text-text-primary">{d?.waitFor || 'Building live execution thesis…'}</div>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {[1,5,15,60,240].map((interval) => {
            const row = tfs?.[interval] || {};
            const trend = Number(row?.trend || 0);
            return (
              <div key={interval} className="p-1.5 rounded bg-surface-base border border-white/5 text-center">
                <div className="text-[8px] text-text-muted">{interval === 60 ? '1H' : interval === 240 ? '4H' : interval + 'm'}</div>
                <div className={`text-[9px] font-bold ${trend > 0 ? 'text-primary-container' : trend < 0 ? 'text-rose-400' : 'text-text-muted'}`}>
                  {trend > 0 ? 'UP' : trend < 0 ? 'DOWN' : 'MIX'}
                </div>
              </div>
            );
          })}
        </div>
        <div className="space-y-1.5">
          <div className="text-[9px] text-text-muted uppercase font-bold">Confirmation</div>
          {(Array.isArray(d?.reasons) ? d.reasons : []).slice(0, 5).map((reason: string, index: number) => (
            <div key={index} className="flex gap-1.5 text-[10px] text-text-secondary">
              <span className="text-primary-container">•</span><span>{reason}</span>
            </div>
          ))}
        </div>
        {(Array.isArray(d?.contradictions) && d.contradictions.length > 0) && (
          <div className="space-y-1.5 p-2.5 rounded-lg border border-rose-500/20 bg-rose-500/5">
            <div className="text-[9px] text-rose-300 uppercase font-bold">Contradictions</div>
            {d.contradictions.slice(0, 5).map((reason: string, index: number) => (
              <div key={index} className="flex gap-1.5 text-[10px] text-rose-200/90">
                <span>×</span><span>{reason}</span>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-3 gap-2 p-2 rounded-lg bg-surface-base border border-white/5 text-[10px]">
          <div><span className="text-[8px] text-text-muted block">ENTRY</span><strong className="text-cyan-400">{levels.entry ? formatCurrency(levels.entry) : '—'}</strong></div>
          <div><span className="text-[8px] text-text-muted block">STOP</span><strong className="text-rose-400">{levels.stop ? formatCurrency(levels.stop) : '—'}</strong></div>
          <div><span className="text-[8px] text-text-muted block">TARGET</span><strong className="text-primary-container">{levels.target ? formatCurrency(levels.target) : '—'}</strong></div>
        </div>
        <button
          type="button"
          onClick={handleReviewSetup}
          disabled={orderBusy || !d || readiness < 68}
          className="w-full py-2.5 rounded-xl bg-primary-container text-on-primary-container font-mono font-bold text-xs transition-all shadow-[0_0_12px_rgba(0,245,160,0.3)] hover:opacity-95 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Zap className="w-3.5 h-3.5" />
          <span>{readiness >= 68 ? `Review ${direction} on Kraken` : 'Not Ready to Execute'}</span>
        </button>
      </div>
    );
  };

  return (
    <div
      className={`flex flex-col gap-3 p-1.5 sm:p-4 w-full min-w-0 select-none pb-24 text-text-primary text-xs font-mono overflow-x-hidden ${isStandalone ? 'max-w-none mx-auto' : 'max-w-full mx-0'}`}
    >
      {/* Toast Alert */}
      {toastMessage && (
        <div className="p-2.5 bg-primary-container/20 border border-primary-container/40 text-primary-container rounded-xl text-xs font-mono flex items-center gap-2 animate-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* COMPACT STICKY HEADER (Optimized for Mobile with Zero Clutter) */}
      {/* ========================================================================= */}
      <header className="p-2.5 sm:p-4 rounded-xl bg-surface-panel/95 border border-white/10 shadow-lg flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[9px] font-mono tracking-widest text-primary-container font-bold uppercase">
                AURELIS SIGNAL DESK
              </span>
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-container opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary-container" />
              </span>
            </div>
            <h1 className="text-sm sm:text-lg font-headline font-bold text-text-primary flex flex-wrap items-center gap-1.5 min-w-0 break-words">
              <span>{selectedCoinSymbol} Live Analyst</span>
              <span className="text-xs font-mono text-primary-container font-normal">
                {deskPrice ? formatCurrency(deskPrice) : '—'}
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {!isStandalone && (
              <button
                type="button"
                onClick={() => {
                  const desktop = (window as any).AurelisDesktop;
                  if (desktop?.isDesktop && typeof desktop.openUtility === 'function') {
                    desktop.openUtility('signal');
                    return;
                  }
                  const url = window.location.origin + window.location.pathname + '?deskOnly=true';
                  const popup = window.open(url, 'AurelisSignalDesk', 'popup=yes,width=1500,height=950,resizable=yes,scrollbars=yes');
                  popup?.focus();
                }}
                className="flex p-1.5 rounded-lg bg-surface-base border border-white/10 text-text-secondary hover:text-primary-container cursor-pointer items-center gap-1 text-[9px]"
                title="Open Signal Desk in a separate resizable window"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Expand</span>
              </button>
            )}

            {/* Countdown pill */}
            <span className="text-[9px] text-text-muted bg-surface-base px-2 py-1 rounded border border-white/5">
              Sync {refreshCountdown}s
            </span>

            {/* Quick settings toggle on mobile */}
            <button
              type="button"
              onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
              className="lg:hidden p-1.5 rounded-lg bg-surface-base border border-white/10 text-text-secondary hover:text-text-primary cursor-pointer flex items-center gap-1 text-[10px]"
              title="Execution Settings"
            >
              <Settings2 className="w-3.5 h-3.5 text-primary-container" />
              {isSettingsExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Multi-coin horizontal pill scroller */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar border-t border-white/5 pt-2">
          {availableCoins.map((sym) => {
            const isSelected = selectedCoinSymbol === sym;
            return (
              <button
                key={sym}
                type="button"
                onClick={() => {
                  if (soundEnabled) playHudSound('switch');
                  setSelectedCoinSymbol(sym);
                }}
                className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer shrink-0 ${
                  isSelected
                    ? 'bg-primary-container text-on-primary-container shadow-[0_0_8px_rgba(0,245,160,0.35)]'
                    : 'bg-surface-base border border-white/10 text-text-secondary hover:text-text-primary'
                }`}
              >
                {sym}
              </button>
            );
          })}
        </div>

        {/* Expandable Execution Controls (Collapsible on mobile to save vertical screen space) */}
        <div
          className={`${
            isSettingsExpanded ? 'grid' : 'hidden lg:grid'
          } grid-cols-2 sm:grid-cols-5 lg:grid-cols-5 gap-2 pt-2 border-t border-white/5 items-center animate-in fade-in duration-150`}
        >
          {/* Provider */}
          <div className="flex flex-col">
            <span className="text-[9px] text-text-muted uppercase">PROVIDER</span>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as any)}
              className="bg-surface-base px-2 py-1 rounded-md border border-white/10 text-[11px] text-text-primary outline-none focus:border-primary-container cursor-pointer mt-0.5"
            >
              <option value="Kraken Futures">Kraken Futures</option>
              <option value="Kraken Spot">Kraken Spot</option>
            </select>
          </div>

          {/* Position amount */}
          <div className="flex flex-col">
            <span className="text-[9px] text-text-muted uppercase">POSITION (USDT)</span>
            <input
              type="number"
              value={positionAmount}
              onChange={(e) => setPositionAmount(e.target.value)}
              className="bg-surface-base px-2 py-1 rounded-md border border-white/10 text-[11px] text-text-primary outline-none focus:border-primary-container mt-0.5"
            />
          </div>

          <div className="flex flex-col">
            <span className="text-[9px] text-text-muted uppercase">LEVERAGE</span>
            <select value={positionLeverage} onChange={(e) => { setPositionLeverage(e.target.value); setKrakenReview(null); setKrakenToken(''); }}
              className="bg-surface-base px-2 py-1 rounded-md border border-white/10 text-[11px] text-text-primary outline-none focus:border-primary-container cursor-pointer mt-0.5">
              {(supportedLeverage.length ? supportedLeverage : [2,3,4,5]).map((x)=><option key={x} value={String(x)}>{x}x</option>)}
            </select>
          </div>

          {/* Available Margin */}
          <div className="flex flex-col">
            <span className="text-[9px] text-text-muted uppercase">MARGIN</span>
            <span className="text-[11px] font-bold text-oracle-synced mt-1">${(Number(positionAmount || 0) / Math.max(1, Number(positionLeverage))).toFixed(2)} USDT</span>
          </div>

          {/* Timeframe */}
          <div className="flex flex-col">
            <span className="text-[9px] text-text-muted uppercase">TIMEFRAME</span>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as any)}
              className="bg-surface-base px-2 py-1 rounded-md border border-white/10 text-[11px] text-text-primary outline-none focus:border-primary-container cursor-pointer mt-0.5"
            >
              <option value="5m">5m</option>
              <option value="15m">15m</option>
              <option value="1H">1H</option>
              <option value="4H">4H</option>
            </select>
          </div>
        </div>
        {deskSizing && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
            <div className="p-2 rounded-lg bg-surface-base border border-white/5">
              <div className="text-[8px] text-text-muted uppercase">Est. Margin</div>
              <div className="text-[10px] font-bold text-text-primary mt-0.5">${deskSizing.margin.toFixed(2)}</div>
            </div>
            <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="text-[8px] text-text-muted uppercase">Lose at Stop</div>
              <div className="text-[10px] font-bold text-red-400 mt-0.5">-${deskSizing.loss.toFixed(2)} · {deskSizing.stopPct.toFixed(2)}%</div>
            </div>
            <div className="p-2 rounded-lg bg-primary-container/10 border border-primary-container/20">
              <div className="text-[8px] text-text-muted uppercase">Make at Target</div>
              <div className="text-[10px] font-bold text-primary-container mt-0.5">+${deskSizing.gain.toFixed(2)} · {deskSizing.targetPct.toFixed(2)}%</div>
            </div>
            <div className="p-2 rounded-lg bg-surface-base border border-white/5">
              <div className="text-[8px] text-text-muted uppercase">Risk / Reward</div>
              <div className="text-[10px] font-bold text-text-primary mt-0.5">1 : {deskSizing.rr.toFixed(2)}</div>
            </div>
          </div>
        )}
      </header>

      {/* ========================================================================= */}
      {/* MOBILE SEGMENTED SUB-NAV (Zero Endless Scrolling On Phones) */}
      {/* ========================================================================= */}
      <div className={`${isStandalone ? 'lg:hidden' : 'flex'} items-stretch gap-1 w-full min-w-0`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 p-1 rounded-xl bg-surface-panel/90 border border-white/10 gap-1 flex-1 min-w-0">
        {[
          { id: 'chart', label: 'Chart & Setup', icon: <BarChart2 className="w-3.5 h-3.5" /> },
          {
            id: 'intelligence',
            label: 'AI Read',
            icon: <Sparkles className="w-3.5 h-3.5" />,
            badge: deepDecision ? Math.round(Number(deepDecision.readiness || 0)) + '%' : '—',
          },
          { id: 'depth', label: 'Orderbook', icon: <PieChart className="w-3.5 h-3.5" /> },
          { id: 'watchlist', label: 'Markets', icon: <BookOpen className="w-3.5 h-3.5" />, badge: '1' },
        ].map((tab) => {
          const isActive = mobileSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (soundEnabled) playHudSound('switch');
                setMobileSubTab(tab.id as MobileSubTab);
              }}
              className={`min-w-0 py-1.5 px-1 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer relative ${
                isActive
                  ? 'bg-primary-container text-on-primary-container shadow-[0_0_8px_rgba(0,245,160,0.3)]'
                  : 'text-text-muted hover:text-text-primary hover:bg-white/5'
              }`}
            >
              {tab.icon}
              <span className="truncate">{tab.label}</span>
              {tab.badge && (
                <span
                  className={`text-[8px] px-1 rounded-full ${
                    isActive ? 'bg-black/20 text-on-primary-container' : 'bg-white/10 text-primary-container'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
        </div>
        {!isStandalone && (
          <button
            type="button"
            onClick={() => {
              const desktop = (window as any).AurelisDesktop;
              if (desktop?.isDesktop && typeof desktop.openUtility === 'function') {
                desktop.openUtility('signal');
                return;
              }
              const url = window.location.origin + window.location.pathname + '?deskOnly=true';
              const popup = window.open(url, 'AurelisSignalDesk', 'popup=yes,width=1500,height=950,resizable=yes,scrollbars=yes');
              popup?.focus();
            }}
            className="shrink-0 px-2.5 rounded-xl bg-surface-panel/90 border border-primary-container/30 text-primary-container text-[9px] font-bold flex items-center gap-1.5 hover:bg-primary-container/10"
            title="Open Signal Desk in a full resizable window"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Expand</span>
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MOBILE VIEWPORT CONTENT (Only 1 Active Tab Visible At A Time = Zero Fatigue) */}
      {/* ========================================================================= */}
      <div className={isStandalone ? 'block lg:hidden' : 'block'}>
        {mobileSubTab === 'chart' && renderChartAndSetup()}
        {mobileSubTab === 'intelligence' && renderIntelligenceAndMatrix()}
        {mobileSubTab === 'depth' && renderLiquidityAndDepth()}
        {mobileSubTab === 'watchlist' && renderWatchlistAndTrades()}
      </div>

      {/* ========================================================================= */}
      {/* DESKTOP PANORAMIC 3-COLUMN VIEW (Automatic on Larger Screens) */}
      {/* ========================================================================= */}
      {isStandalone && (
        <div className="hidden lg:grid grid-cols-12 gap-3 min-w-0">
          <div className="col-span-3 min-w-0">{renderWatchlistAndTrades()}</div>
          <div className="col-span-6 min-w-0 flex flex-col gap-3">
            {renderChartAndSetup()}
            {renderLiquidityAndDepth()}
          </div>
          <div className="col-span-3 min-w-0">{renderIntelligenceAndMatrix()}</div>
        </div>
      )}

      {krakenReview && (
        <div className="lg:hidden p-3 rounded-xl bg-surface-panel/95 border border-primary-container/25 space-y-2 overflow-hidden">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-primary-container" />
            <strong className="text-[10px]">Kraken review locked</strong>
          </div>
          <div className="grid grid-cols-2 gap-2 min-w-0">
            {[
              ['Pair', krakenReview.symbol],
              ['Position', '$' + krakenReview.positionValueUsd],
              ['Kraken mark', '$' + krakenReview.markPrice],
              ['Stop', '$' + krakenReview.stopLoss],
              ['Target', '$' + krakenReview.takeProfit],
              ['Leverage', String(krakenReview.leverage) + 'x'],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 p-2 rounded-lg bg-surface-base border border-white/5">
                <div className="text-[8px] text-text-muted uppercase">{label}</div>
                <div className="text-[10px] font-bold break-all mt-0.5">{String(value ?? '—')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STICKY QUICK-EXECUTION FLOATING DOCK (Mobile Bottom Shortcut) */}
      {/* ========================================================================= */}
      <div className="lg:hidden sticky bottom-14 z-20 p-2 rounded-xl bg-surface-canvas/95 backdrop-blur-md border border-primary-container/30 shadow-[0_8px_20px_rgba(0,0,0,0.7)] flex flex-wrap items-center justify-between gap-2 min-w-0">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="px-1.5 py-0.5 rounded bg-status-success/20 text-status-success text-[9px] font-bold">
            LONG
          </span>
          <span className="text-[11px] font-bold text-text-primary">
            {selectedCoinSymbol} {deskPrice ? formatCurrency(deskPrice) : "—"}
          </span>
          <span className="text-[10px] text-primary-container">
            TP {deskTarget ? formatCurrency(deskTarget) : "—"}
          </span>
        </div>

        <button
          type="button"
          onClick={handleExecuteSetup}
          disabled={orderBusy || !krakenToken}
          className="px-3 py-1.5 rounded-lg bg-primary-container text-on-primary-container text-[11px] font-bold flex items-center gap-1 shadow-[0_0_10px_rgba(0,245,160,0.4)] cursor-pointer disabled:opacity-40"
        >
          <Zap className="w-3 h-3" />
          <span>Execute ${positionAmount}</span>
        </button>
      </div>

    </div>
  );
};

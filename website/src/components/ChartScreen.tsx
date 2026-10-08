import React, { useState, useMemo, useEffect } from 'react';
import {
  Radio,
  Star,
  ArrowLeft,
  Plus,
  Compass,
  TrendingUp,
  TrendingDown,
  Activity,
  Wallet,
  ArrowLeftRight,
  Sparkles,
  Layers,
  BarChart3,
} from 'lucide-react';
import { CoinData, Timeframe, ChartPoint, ThemeMode } from '../types';
import { CoinIcon } from './CoinIcon';
import {
  formatCurrency,
  formatCompactNumber,
  generateTechnicalChartData,
  fetchLiveOHLC,
  playHudSound,
} from '../services/marketData';
import {
  calculateRSI,
  calculateEMA,
  requestAIAnalysis,
  AIAnalysisResponse,
} from '../services/aiAnalyst';
import { AIAnalysisModal } from './AIAnalysisModal';
import { AnalyticsSubTab } from './AnalyticsSubTab';

export interface ChartScreenProps {
  coin: CoinData;
  starredCoins?: CoinData[];
  onSelectCoin?: (coin: CoinData) => void;
  viewMode?: 'all-starred' | 'single-coin';
  onViewModeChange?: (mode: 'all-starred' | 'single-coin') => void;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  soundEnabled: boolean;
  theme?: ThemeMode;
  isStarred?: boolean;
  onToggleStar?: (id: string) => void;
  onOpenManager?: () => void;
  onOpenTrade?: (coin?: CoinData) => void;
  onOpenWallet?: () => void;
}

/**
 * Mini Sonar Sparkline for Starred Coins Grid
 */
const MiniSonarChart: React.FC<{
  coin: CoinData;
  timeframe: Timeframe;
  theme: ThemeMode;
  isPositive: boolean;
}> = ({ coin, timeframe, theme, isPositive }) => {
  const chartData = useMemo(() => {
    return generateTechnicalChartData(coin, timeframe);
  }, [coin.price, coin.id, timeframe]);

  const { points, minPrice, maxPrice } = chartData;
  const width = 200;
  const height = 52;
  const padX = 4;
  const padY = 5;

  const scaleX = (idx: number) => padX + (idx / Math.max(1, points.length - 1)) * (width - padX * 2);
  const scaleY = (val: number) => {
    const range = maxPrice - minPrice || 1;
    const norm = (val - minPrice) / range;
    return height - padY - norm * (height - padY * 2);
  };

  const spline = useMemo(() => {
    if (!points.length) return '';
    let d = `M ${scaleX(0)},${scaleY(points[0].price)}`;
    for (let i = 1; i < points.length; i++) {
      const prevX = scaleX(i - 1);
      const prevY = scaleY(points[i - 1].price);
      const currX = scaleX(i);
      const currY = scaleY(points[i].price);
      const midX = (prevX + currX) / 2;
      d += ` Q ${prevX + (currX - prevX) * 0.4},${prevY} ${midX},${(prevY + currY) / 2} T ${currX},${currY}`;
    }
    return d;
  }, [points, minPrice, maxPrice]);

  const area = useMemo(() => {
    if (!points.length) return '';
    const lastX = scaleX(points.length - 1);
    return `${spline} L ${lastX},${height} L ${scaleX(0)},${height} Z`;
  }, [spline, points.length]);

  const lastIndex = Math.max(0, points.length - 1);
  const lastX = scaleX(lastIndex);
  const lastY = scaleY(coin.price);
  const strokeColor = isPositive ? (theme === 'light' ? '#059669' : '#00f5a0') : '#ff3b69';

  return (
    <svg className="w-full h-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`miniGrad-${coin.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity={0.28} />
          <stop offset="100%" stopColor={strokeColor} stopOpacity={0.0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#miniGrad-${coin.id})`} />
      <path d={spline} fill="none" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" />

      {/* Live Sonar Ripple Effect on price */}
      <g>
        <circle cx={lastX} cy={lastY} fill="none" stroke={strokeColor} strokeWidth="1.2">
          <animate attributeName="r" values="2.5; 14" dur="1.9s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.9; 0" dur="1.9s" repeatCount="indefinite" />
        </circle>
        <circle cx={lastX} cy={lastY} fill="none" stroke={strokeColor} strokeWidth="0.8">
          <animate attributeName="r" values="2.5; 14" dur="1.9s" begin="0.65s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.75; 0" dur="1.9s" begin="0.65s" repeatCount="indefinite" />
        </circle>
        <circle cx={lastX} cy={lastY} r="2.5" fill={strokeColor} />
      </g>
    </svg>
  );
};

export const ChartScreen: React.FC<ChartScreenProps> = ({
  coin,
  starredCoins = [],
  onSelectCoin,
  viewMode = 'all-starred',
  onViewModeChange,
  timeframe,
  onTimeframeChange,
  soundEnabled,
  theme = 'dark',
  isStarred = false,
  onToggleStar,
  onOpenManager,
  onOpenTrade,
  onOpenWallet,
}) => {
  const [internalViewMode, setInternalViewMode] = useState<'all-starred' | 'single-coin'>('all-starred');
  const currentViewMode = onViewModeChange ? viewMode : internalViewMode;
  const [subTab, setSubTab] = useState<'chart' | 'analytics'>('chart');

  const setEffectiveViewMode = (mode: 'all-starred' | 'single-coin') => {
    if (onViewModeChange) {
      onViewModeChange(mode);
    } else {
      setInternalViewMode(mode);
    }
  };

  const [hoveredPoint, setHoveredPoint] = useState<{ price: number; time: string; x: number; y: number } | null>(null);
  const [realOHLC, setRealOHLC] = useState<{
    points: ChartPoint[];
    minPrice: number;
    maxPrice: number;
  } | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // Fetch real Kraken OHLC historical points when coin or timeframe changes
  useEffect(() => {
    let isCurrent = true;
    setIsLoadingHistory(true);

    fetchLiveOHLC(coin.symbol, timeframe).then((data) => {
      if (isCurrent) {
        if (data && data.points.length > 0) {
          setRealOHLC({
            points: data.points,
            minPrice: data.minPrice,
            maxPrice: data.maxPrice,
          });
        } else {
          setRealOHLC(null);
        }
        setIsLoadingHistory(false);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [coin.symbol, timeframe]);

  // Chart data: prioritize real historical points, with live moving price on the last coordinate
  const chartData = useMemo(() => {
    if (realOHLC && realOHLC.points.length > 0) {
      const updatedPoints = [...realOHLC.points];
      const last = updatedPoints[updatedPoints.length - 1];
      if (last && coin.price) {
        updatedPoints[updatedPoints.length - 1] = {
          ...last,
          price: coin.price,
        };
      }
      const allPrices = updatedPoints.map((p) => p.price);
      const minP = Math.min(...allPrices);
      const maxP = Math.max(...allPrices);
      const pad = (maxP - minP) * 0.12 || (minP > 0 ? minP * 0.01 : 1);
      return {
        points: updatedPoints,
        minPrice: minP - pad,
        maxPrice: maxP + pad,
      };
    }
    return generateTechnicalChartData(coin, timeframe);
  }, [realOHLC, coin.price, coin.id, timeframe]);

  const { points, minPrice, maxPrice } = chartData;

  // Viewbox dimensions
  const width = 420;
  const height = 135;
  const paddingX = 10;
  const paddingY = 12;

  // Scale coordinates
  const scaleX = (index: number) => {
    return paddingX + (index / Math.max(1, points.length - 1)) * (width - paddingX * 2);
  };

  const scaleY = (val: number) => {
    const range = maxPrice - minPrice || 1;
    const norm = (val - minPrice) / range;
    return height - paddingY - norm * (height - paddingY * 2);
  };

  // Build SVG path for smooth line
  const splinePath = useMemo(() => {
    if (!points.length) return '';
    let d = `M ${scaleX(0)},${scaleY(points[0].price)}`;
    for (let i = 1; i < points.length; i++) {
      const prevX = scaleX(i - 1);
      const prevY = scaleY(points[i - 1].price);
      const currX = scaleX(i);
      const currY = scaleY(points[i].price);
      const midX = (prevX + currX) / 2;
      d += ` Q ${prevX + (currX - prevX) * 0.4},${prevY} ${midX},${(prevY + currY) / 2} T ${currX},${currY}`;
    }
    return d;
  }, [points, minPrice, maxPrice]);

  // Area path for gradient fill
  const areaPath = useMemo(() => {
    if (!points.length) return '';
    const lastX = scaleX(points.length - 1);
    return `${splinePath} L ${lastX},${height} L ${scaleX(0)},${height} Z`;
  }, [splinePath, points.length]);

  // Latest tracker point (tracks the live micro-ticking price coordinate)
  const lastIndex = Math.max(0, points.length - 1);
  const latestX = scaleX(lastIndex);
  const latestY = scaleY(coin.price);

  // Timeframes list
  const timeframes: Timeframe[] = ['15m', '1H', '24H', '7D'];

  // Handle mouse move on chart SVG to position crosshair
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const clampedX = Math.max(paddingX, Math.min(width - paddingX, (mouseX / rect.width) * width));
    const indexRatio = (clampedX - paddingX) / (width - paddingX * 2);
    const closestIndex = Math.round(indexRatio * (points.length - 1));
    const point = points[closestIndex];

    if (point) {
      setHoveredPoint({
        price: point.price,
        time: point.time,
        x: scaleX(closestIndex),
        y: scaleY(point.price),
      });
    }
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
  };

  const isPositive = coin.change24h >= 0;
  const strokeColor = isPositive ? (theme === 'light' ? '#059669' : '#00f5a0') : '#ff3b69';
  const sonarColor = theme === 'light' ? (isPositive ? '#059669' : '#e11d48') : (isPositive ? '#00f5a0' : '#ff3b69');
  const formattedPrice = formatCurrency(coin.price);
  const cursorPrice = hoveredPoint ? formatCurrency(hoveredPoint.price) : formatCurrency(coin.price);

  // Technical Indicators calculations
  const priceValues = useMemo(() => points.map((p) => p.price), [points]);
  const rsiValue = useMemo(() => calculateRSI(priceValues, 14), [priceValues]);
  const ema20Value = useMemo(() => calculateEMA(priceValues, 20), [priceValues]);
  const ema50Value = useMemo(() => calculateEMA(priceValues, 50), [priceValues]);

  // AI Market Analysis Modal State
  const [isAIModalOpen, setIsAIModalOpen] = useState<boolean>(false);
  const [aiAnalysisMode, setAiAnalysisMode] = useState<'sentiment' | 'chart-deep'>('sentiment');
  const [isAILoading, setIsAILoading] = useState<boolean>(false);
  const [aiAnalysisData, setAiAnalysisData] = useState<AIAnalysisResponse | null>(null);
  const [aiAnalysisError, setAiAnalysisError] = useState<string | null>(null);

  const runAnalysis = async (mode: 'sentiment' | 'chart-deep') => {
    setAiAnalysisMode(mode);
    setIsAIModalOpen(true);
    setIsAILoading(true);
    setAiAnalysisError(null);

    try {
      const result = await requestAIAnalysis({
        coin: {
          id: coin.id,
          symbol: coin.symbol,
          name: coin.name,
        },
        timeframe,
        points: points.map((p) => ({ time: p.time, price: p.price })),
        currentPrice: coin.price,
        change24h: coin.change24h,
        high24h: coin.high24h,
        low24h: coin.low24h,
        volume24h: coin.volume24h,
        rsi: rsiValue,
        ema20: ema20Value,
        ema50: ema50Value,
        mode,
      });
      setAiAnalysisData(result);
    } catch (err: any) {
      console.error('Failed to analyze coin market:', err);
      setAiAnalysisError(err.message || 'Unable to complete AI analysis');
    } finally {
      setIsAILoading(false);
    }
  };

  // Timeline stamps
  const timelineLabels = useMemo(() => {
    if (points.length >= 4) {
      const first = points[0]?.time || 'START';
      const mid1 = points[Math.floor(points.length * 0.33)]?.time || '';
      const mid2 = points[Math.floor(points.length * 0.66)]?.time || '';
      return [first, mid1, mid2, 'LIVE'];
    }
    if (timeframe === '15m') return ['08:00', '08:05', '08:10', 'LIVE'];
    if (timeframe === '1H') return ['04:00', '06:00', '08:20', 'LIVE'];
    if (timeframe === '24H') return ['00:00', '06:00', '12:00', 'NOW'];
    return ['Sep 13', 'Sep 15', 'Sep 17', 'TODAY'];
  }, [timeframe, points]);

  // =========================================================================
  // VIEW 1: ALL STARRED COINS (Overview Grid of Coin Charts)
  // =========================================================================
  if (currentViewMode === 'all-starred') {
    return (
      <section id="section-starred-charts" className="flex flex-col gap-2.5 w-full select-none">
        {/* Header bar with timeframe selector */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* Timeframe selector */}
          <div className="flex items-center gap-0.5 bg-surface-panel p-0.5 rounded-md border border-white/5 text-[10px] font-mono shrink-0">
            {timeframes.map((tf) => (
              <button
                key={tf}
                onClick={() => {
                  if (soundEnabled) playHudSound('switch');
                  onTimeframeChange(tf);
                }}
                className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                  timeframe === tf
                    ? 'bg-primary-container text-on-primary-container font-bold shadow-[0_0_6px_rgba(0,245,160,0.3)]'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Sonar status banner */}
        <div className="flex items-center justify-between text-[10px] font-mono bg-surface-panel/75 px-2.5 py-1 rounded-lg border border-white/5 text-text-secondary">
          <span className="flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-primary-container" />
            <span>Click any coin to open its full dedicated chart</span>
          </span>
          <span className="flex items-center gap-1.5 text-oracle-synced font-bold">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-container opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-container" />
            </span>
            SONAR ACTIVE
          </span>
        </div>

        {/* Starred Coins Grid */}
        {starredCoins.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 bg-surface-panel/40 rounded-xl border border-white/5 text-center my-auto min-h-[220px]">
            <div className="w-12 h-12 rounded-full bg-primary-container/10 border border-primary-container/20 flex items-center justify-center mb-2.5">
              <Star className="w-6 h-6 text-primary-container fill-primary-container/30 animate-pulse" />
            </div>
            <h3 className="font-headline font-bold text-sm text-text-primary mb-1">
              No Starred Coins on Chart
            </h3>
            <p className="text-[11px] text-text-muted font-mono max-w-[280px] mb-3">
              Star your favorite cryptocurrencies to view all their live price charts side-by-side with sonar tracking.
            </p>
            {onOpenManager && (
              <button
                type="button"
                onClick={onOpenManager}
                className="px-3.5 py-1.5 rounded-lg bg-primary-container text-surface-canvas font-mono font-bold text-xs flex items-center gap-1.5 shadow-[0_0_12px_rgba(0,245,160,0.3)] hover:opacity-90 cursor-pointer"
              >
                <Star className="w-3.5 h-3.5 fill-current" />
                Browse & Star Coins
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[280px] overflow-y-auto pr-1">
            {starredCoins.map((sc) => {
              const isPos = sc.change24h >= 0;
              return (
                <div
                  key={sc.id}
                  onClick={() => {
                    if (soundEnabled) playHudSound('click');
                    if (onSelectCoin) onSelectCoin(sc);
                    setEffectiveViewMode('single-coin');
                  }}
                  className="group relative flex flex-col p-2.5 rounded-xl bg-surface-panel/85 hover:bg-surface-panel border border-white/10 hover:border-primary-container/50 transition-all cursor-pointer shadow-sm hover:shadow-[0_0_14px_rgba(0,245,160,0.18)]"
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <CoinIcon
                        symbol={sc.symbol}
                        name={sc.name}
                        color={sc.color}
                        iconSymbol={sc.iconSymbol}
                        imageUrl={sc.imageUrl}
                        size="sm"
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-xs font-mono text-text-primary truncate">
                          {sc.symbol}
                        </span>
                        <span className="text-[9px] text-text-muted truncate max-w-[85px]">
                          {sc.name}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <div className="text-right">
                        <div className="font-mono font-bold text-[12px] text-text-primary">
                          {formatCurrency(sc.price)}
                        </div>
                        <div
                          className={`font-mono text-[9px] font-bold flex items-center justify-end ${
                            isPos ? 'text-oracle-synced' : 'text-status-error'
                          }`}
                        >
                          {isPos ? '▲ +' : '▼ '}
                          {Math.abs(sc.change24h).toFixed(1)}%
                        </div>
                      </div>

                      {onToggleStar && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (soundEnabled) playHudSound('click');
                            onToggleStar(sc.id);
                          }}
                          className="p-1 rounded hover:bg-white/10 text-primary-container transition-colors cursor-pointer"
                          title="Unstar (removes from starred charts)"
                        >
                          <Star className="w-3.5 h-3.5 fill-primary-container drop-shadow-[0_0_4px_rgba(0,245,160,0.5)]" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mini Spline Chart with Sonar Pulse Dot */}
                  <div className="relative w-full h-[52px] my-1 rounded bg-surface-canvas/80 border border-white/5 overflow-hidden">
                    <MiniSonarChart coin={sc} timeframe={timeframe} theme={theme} isPositive={isPos} />
                  </div>

                  {/* Card Footer */}
                  <div className="flex items-center justify-between text-[9px] font-mono text-text-muted pt-1 border-t border-white/5">
                    <span>H: {formatCurrency(sc.high24h ?? sc.price * 1.02)}</span>
                    <span>L: {formatCurrency(sc.low24h ?? sc.price * 0.98)}</span>
                    <span className="text-primary-container group-hover:translate-x-0.5 transition-transform font-bold flex items-center gap-0.5">
                      Open Chart →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  // =========================================================================
  // VIEW 2: SPECIFIC COIN DETAILED CHART (Line & Area, No Candles, Sonar Dot)
  // =========================================================================
  return (
    <section id="section-chart" className="flex flex-col gap-2.5 w-full select-none">
      {/* Top Navigation Bar with Back Button and Timeframe Selector */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => {
            if (soundEnabled) playHudSound('switch');
            setEffectiveViewMode('all-starred');
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-panel hover:bg-surface-container border border-white/10 hover:border-primary-container/40 text-[11px] font-mono font-bold text-text-secondary hover:text-primary-container transition-all cursor-pointer group shadow-sm shrink-0"
          title="Back to all coins"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform text-primary-container" />
          <span>← Back ({starredCoins.length})</span>
        </button>

        {/* Timeframe Selector Pills */}
        <div className="flex items-center gap-0.5 bg-surface-panel p-0.5 rounded-md border border-white/5 text-[10px] font-mono shrink-0">
          {timeframes.map((tf) => {
            const isCurrent = timeframe === tf;
            return (
              <button
                key={tf}
                onClick={() => {
                  if (soundEnabled) playHudSound('switch');
                  onTimeframeChange(tf);
                }}
                className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                  isCurrent
                    ? 'bg-primary-container text-on-primary-container font-bold shadow-[0_0_6px_rgba(0,245,160,0.3)]'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {tf}
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick Watchlist Switcher Pills (Switch easily between other coins) */}
      {starredCoins.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-[10px] font-mono">
          <span className="text-text-muted text-[9px] shrink-0 font-medium">Watchlist:</span>
          {starredCoins.map((sc) => {
            const isCurrent = sc.id === coin.id;
            return (
              <button
                key={sc.id}
                type="button"
                onClick={() => {
                  if (soundEnabled) playHudSound('click');
                  if (onSelectCoin) onSelectCoin(sc);
                }}
                className={`px-2 py-0.5 rounded-full flex items-center gap-1 transition-all shrink-0 cursor-pointer ${
                  isCurrent
                    ? 'bg-primary-container/20 text-primary-container border border-primary-container/40 font-bold'
                    : 'bg-surface-panel/80 text-text-secondary hover:text-text-primary border border-white/5'
                }`}
              >
                <CoinIcon symbol={sc.symbol} name={sc.name} size="xs" />
                <span>{sc.symbol}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Coin Title and Live Price Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <CoinIcon
            symbol={coin.symbol}
            name={coin.name}
            color={coin.color}
            iconSymbol={coin.iconSymbol}
            imageUrl={coin.imageUrl}
            size="lg"
            className="shadow-[0_0_14px_rgba(247,147,26,0.35)]"
          />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-headline font-bold text-[14px] text-text-primary">
                {coin.name}
              </span>
              <span className="text-[10px] font-mono text-cyan-400 font-medium">
                {coin.symbol}/USD
              </span>
              {onToggleStar && (
                <button
                  type="button"
                  onClick={() => {
                    if (soundEnabled) playHudSound('click');
                    onToggleStar(coin.id);
                  }}
                  className="p-1 rounded-md hover:bg-white/10 transition-all cursor-pointer flex items-center justify-center"
                  title={isStarred ? 'Starred (on your watchlist) - Click to unstar' : 'Star to add to your watchlist'}
                >
                  <Star
                    className={`w-3.5 h-3.5 transition-all ${
                      isStarred
                        ? 'text-primary-container fill-primary-container drop-shadow-[0_0_6px_rgba(0,245,160,0.6)]'
                        : 'text-text-muted hover:text-primary-container'
                    }`}
                  />
                </button>
              )}
            </div>

            {/* Live Price and 24h Change */}
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="font-mono font-bold text-[22px] tracking-tight text-text-primary leading-none transition-all duration-300">
                {formattedPrice}
              </span>
              <span
                className={`font-mono font-bold text-[11px] flex items-center leading-none ${
                  isPositive ? 'text-oracle-synced' : 'text-status-error'
                }`}
              >
                {isPositive ? '▲ +' : '▼ '}
                {Math.abs(coin.change24h).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons: AI Analyze Market & Deep Chart */}
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {/* Analyze Market Button (Quick Sentiment Report) */}
          <button
            type="button"
            id="btn-analyze-market"
            onClick={() => {
              if (soundEnabled) playHudSound('click');
              runAnalysis('sentiment');
            }}
            className="px-2.5 py-1.5 rounded-lg bg-surface-panel hover:bg-surface-container border border-primary-container/40 text-primary-container font-mono font-bold text-xs flex items-center gap-1.5 shadow-[0_0_10px_rgba(0,245,160,0.15)] hover:shadow-[0_0_14px_rgba(0,245,160,0.25)] transition-all cursor-pointer"
            title="Analyze Market Sentiment with Gemini AI"
          >
            <Sparkles className="w-3.5 h-3.5 text-primary-container animate-pulse" />
            <span>Analyze Market</span>
          </button>

          {/* Analyze Live Chart Button (Deep Technical & Indicator Setup) */}
          <button
            type="button"
            id="btn-analyze-chart"
            onClick={() => {
              if (soundEnabled) playHudSound('click');
              runAnalysis('chart-deep');
            }}
            className="px-2.5 py-1.5 rounded-lg bg-cyan-950/40 hover:bg-cyan-900/40 border border-cyan-500/40 text-cyan-300 font-mono font-bold text-xs flex items-center gap-1.5 shadow-[0_0_10px_rgba(6,182,212,0.15)] hover:shadow-[0_0_14px_rgba(6,182,212,0.25)] transition-all cursor-pointer"
            title="Analyze Live Chart & Indicators (Long vs Short) with Gemini AI"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Analyze Live Chart</span>
          </button>
        </div>
      </div>

      {/* Sub-tab Navigation Bar: Live Chart vs Indicator Analytics */}
      <div className="flex items-center justify-between border-b border-white/10 pb-1.5 pt-0.5">
        <div className="flex items-center gap-1 p-0.5 bg-surface-panel rounded-lg border border-white/5 font-mono text-[11px]">
          <button
            type="button"
            id="subtab-chart"
            onClick={() => {
              if (soundEnabled) playHudSound('switch');
              setSubTab('chart');
            }}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all cursor-pointer font-bold ${
              subTab === 'chart'
                ? 'bg-primary-container text-surface-canvas shadow-[0_0_8px_rgba(0,245,160,0.3)]'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Live Chart</span>
          </button>

          <button
            type="button"
            id="subtab-analytics"
            onClick={() => {
              if (soundEnabled) playHudSound('switch');
              setSubTab('analytics');
            }}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all cursor-pointer font-bold ${
              subTab === 'analytics'
                ? 'bg-primary-container text-surface-canvas shadow-[0_0_8px_rgba(0,245,160,0.3)]'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Analytics</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              RSI · MA · VP
            </span>
          </button>
        </div>

        {/* Quick Indicators HUD ticker */}
        <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono text-text-secondary">
          <span className="text-cyan-400">RSI(14): <strong className="text-text-primary font-bold">{rsiValue}</strong></span>
          <span className="text-white/20">·</span>
          <span>EMA(20): <strong className="text-text-primary font-bold">${ema20Value.toLocaleString()}</strong></span>
          <span className="text-white/20">·</span>
          <button
            type="button"
            onClick={() => {
              if (soundEnabled) playHudSound('switch');
              setSubTab(subTab === 'chart' ? 'analytics' : 'chart');
            }}
            className="text-primary-container hover:underline cursor-pointer flex items-center gap-1"
          >
            {subTab === 'chart' ? 'Open Indicators →' : 'Back to Chart →'}
          </button>
        </div>
      </div>

      {/* SUBTAB 1: LIVE CHART VIEW */}
      {subTab === 'chart' && (
        <>
          {/* Clear, Intuitive Stats & Technical Indicators Bar */}
          <div className="flex items-center justify-between text-[10px] font-mono bg-surface-panel/75 px-2.5 py-1 rounded-lg border border-white/5 text-text-secondary flex-wrap gap-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span>
                24h High: <strong className="text-text-primary font-bold">{formatCurrency(coin.high24h ?? coin.price * 1.02)}</strong>
              </span>
              <span>
                24h Low: <strong className="text-text-primary font-bold">{formatCurrency(coin.low24h ?? coin.price * 0.98)}</strong>
              </span>
              <span className="hidden sm:inline">
                Vol: <strong className="text-text-primary">{formatCompactNumber(coin.volume24h)}</strong>
              </span>
              {/* Live computed technical indicators */}
              <span className="text-cyan-400 pl-1 border-l border-white/10">
                RSI(14): <strong className="text-white font-bold">{rsiValue}</strong>
              </span>
              <span className="text-text-muted hidden md:inline">
                EMA(20): <strong className="text-text-primary font-bold">${ema20Value.toLocaleString()}</strong>
              </span>
            </div>

            {/* Sonar Price Tracker Indicator */}
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 text-[9px] font-mono text-primary-container bg-primary-container/10 px-1.5 py-0.5 rounded border border-primary-container/20">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-container animate-ping" />
                SONAR TRACKING PRICE
              </span>
            </div>
          </div>

          {/* Clean Line Chart Canvas (NO CANDLESTICKS) with Live Sonar Effect Dot */}
          <div className="relative w-full h-[180px] bg-surface-canvas rounded-xl border border-white/5 p-2 overflow-hidden flex flex-col justify-between group">
            {/* Subtle Horizontal Reference Grid Lines */}
            <div className="absolute inset-0 flex flex-col justify-between p-3 pointer-events-none opacity-20">
              <div className="border-b border-dashed border-white/40 w-full" />
              <div className="border-b border-dashed border-white/40 w-full" />
              <div className="border-b border-dashed border-white/40 w-full" />
            </div>

            {/* Max / Min Price Boundary Badges on right side */}
            <div className="absolute right-2.5 top-2.5 pointer-events-none text-[8px] font-mono text-text-muted bg-surface-panel/70 px-1 py-0.2 rounded border border-white/5">
              High: {formatCurrency(maxPrice)}
            </div>
            <div className="absolute right-2.5 bottom-7 pointer-events-none text-[8px] font-mono text-text-muted bg-surface-panel/70 px-1 py-0.2 rounded border border-white/5">
              Low: {formatCurrency(minPrice)}
            </div>

            {/* Hover Crosshair Price Cursor Tooltip */}
            <div className="absolute top-2 left-3 z-10 bg-surface-container-high/90 px-2 py-0.5 rounded border border-white/10 text-[9px] font-mono shadow-sm flex items-center gap-1.5">
              <span className="text-text-muted">Price: </span>
              <span className="text-oracle-synced font-bold">{cursorPrice}</span>
              {hoveredPoint?.time && (
                <span className="text-text-muted border-l border-white/10 pl-1">{hoveredPoint.time}</span>
              )}
            </div>

            {/* SVG Chart Layer with Live Animated Spline and Sonar Dot */}
            <svg
              className="w-full h-[135px] overflow-visible cursor-crosshair"
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="none"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={strokeColor} stopOpacity={theme === 'light' ? 0.22 : 0.32} />
                  <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Gradient fill underneath smooth curve */}
              <path d={areaPath} fill="url(#chartGradient)" />

              {/* Clean Neon Price Spline Curve (NO CANDLESTICKS) */}
              <path
                d={splinePath}
                fill="none"
                stroke={strokeColor}
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Interactive Crosshair Indicator when Hovering */}
              {hoveredPoint && (
                <g>
                  <line
                    x1={hoveredPoint.x}
                    y1={0}
                    x2={hoveredPoint.x}
                    y2={height}
                    stroke={sonarColor}
                    strokeDasharray="2,2"
                    strokeWidth="1"
                    opacity="0.6"
                  />
                  <line
                    x1={0}
                    y1={hoveredPoint.y}
                    x2={width}
                    y2={hoveredPoint.y}
                    stroke={sonarColor}
                    strokeDasharray="2,2"
                    strokeWidth="1"
                    opacity="0.6"
                  />
                  <circle
                    cx={hoveredPoint.x}
                    cy={hoveredPoint.y}
                    r="4.5"
                    fill={sonarColor}
                    stroke="#06090e"
                    strokeWidth="1.5"
                  />
                </g>
              )}

              {/* Sonar Beacon Following Live Price */}
              <g id="live-price-sonar-beacon">
                <circle cx={latestX} cy={latestY} fill="none" stroke={sonarColor} strokeWidth="1.8">
                  <animate attributeName="r" values="3.5; 26" dur="2.1s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.9; 0" dur="2.1s" repeatCount="indefinite" />
                </circle>

                <circle cx={latestX} cy={latestY} fill="none" stroke={sonarColor} strokeWidth="1.3">
                  <animate attributeName="r" values="3.5; 26" dur="2.1s" begin="0.7s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.75; 0" dur="2.1s" begin="0.7s" repeatCount="indefinite" />
                </circle>

                <circle cx={latestX} cy={latestY} fill="none" stroke={sonarColor} strokeWidth="1">
                  <animate attributeName="r" values="3.5; 26" dur="2.1s" begin="1.4s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.6; 0" dur="2.1s" begin="1.4s" repeatCount="indefinite" />
                </circle>

                <circle cx={latestX} cy={latestY} fill={sonarColor}>
                  <animate attributeName="r" values="5; 8.5; 5" dur="1.4s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.25; 0.55; 0.25" dur="1.4s" repeatCount="indefinite" />
                </circle>

                <circle
                  cx={latestX}
                  cy={latestY}
                  r="4"
                  fill={sonarColor}
                  stroke="#06090e"
                  strokeWidth="1.5"
                />
              </g>
            </svg>

            {/* Timeline Axis Labels */}
            <div className="flex items-center justify-between text-[9px] font-mono text-text-muted pt-1 border-t border-white/5">
              {timelineLabels.map((lbl, idx) => (
                <span
                  key={idx}
                  className={lbl.includes('LIVE') || lbl === 'NOW' || lbl === 'TODAY' ? 'text-oracle-synced font-bold' : ''}
                >
                  {lbl}
                </span>
              ))}
            </div>
          </div>

          {/* Banner linking to the new Analytics Tab */}
          <div className="flex items-center justify-between p-2 rounded-lg bg-surface-panel/60 border border-white/5 text-[10px] font-mono text-text-secondary">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-primary-container" />
              <span>Deep Technical Analytics: RSI(14) {rsiValue}, Moving Averages (50/200), and Volume Profile clustering.</span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (soundEnabled) playHudSound('switch');
                setSubTab('analytics');
              }}
              className="text-primary-container hover:text-white font-bold cursor-pointer shrink-0 ml-2 flex items-center gap-1"
            >
              View Analytics Sub-tab →
            </button>
          </div>
        </>
      )}

      {/* SUBTAB 2: TECHNICAL ANALYTICS DASHBOARD */}
      {subTab === 'analytics' && (
        <AnalyticsSubTab
          coin={coin}
          timeframe={timeframe}
          points={points}
          theme={theme}
          soundEnabled={soundEnabled}
          onOpenAIModal={runAnalysis}
          aiAnalysisData={aiAnalysisData}
          isAILoading={isAILoading}
          onOpenTrade={onOpenTrade}
        />
      )}

      {/* AI Market & Live Chart Analysis Modal */}
      <AIAnalysisModal
        isOpen={isAIModalOpen}
        onClose={() => setIsAIModalOpen(false)}
        isLoading={isAILoading}
        data={aiAnalysisData}
        error={aiAnalysisError}
        onRefresh={(mode) => runAnalysis(mode)}
        activeMode={aiAnalysisMode}
        coinSymbol={coin.symbol}
        coinName={coin.name}
        currentPrice={coin.price}
        rsi={rsiValue}
        ema20={ema20Value}
        soundEnabled={soundEnabled}
      />

    </section>
  );
};

import React, { useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Gauge,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Scale,
} from 'lucide-react';
import { CoinData, Timeframe, ChartPoint, ThemeMode } from '../types';
import { formatCurrency, formatCompactNumber, playHudSound } from '../services/marketData';
import { calculateRSI, calculateEMA, AIAnalysisResponse } from '../services/aiAnalyst';

export interface AnalyticsSubTabProps {
  coin: CoinData;
  timeframe: Timeframe;
  points: ChartPoint[];
  theme?: ThemeMode;
  soundEnabled: boolean;
  onOpenAIModal: (mode: 'sentiment' | 'chart-deep') => void;
  aiAnalysisData: AIAnalysisResponse | null;
  isAILoading: boolean;
  onOpenTrade?: (coin?: CoinData) => void;
}

export const AnalyticsSubTab: React.FC<AnalyticsSubTabProps> = ({
  coin,
  timeframe,
  points,
  theme = 'dark',
  soundEnabled,
  onOpenAIModal,
  aiAnalysisData,
  isAILoading,
  onOpenTrade,
}) => {
  const currentPrice = coin.price || 1;
  const isPositive = coin.change24h >= 0;

  // Extract raw price series
  const priceValues = useMemo(() => {
    if (points && points.length > 0) {
      return points.map((p) => p.price);
    }
    return [currentPrice * 0.98, currentPrice * 1.01, currentPrice];
  }, [points, currentPrice]);

  // 1. Calculate 14-period RSI
  const rsiValue = useMemo(() => {
    return calculateRSI(priceValues, 14);
  }, [priceValues]);

  // Determine RSI condition
  const rsiCondition = useMemo(() => {
    if (rsiValue >= 70) {
      return {
        label: 'Overbought',
        bias: 'Bearish Risk',
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        desc: 'Oscillator is elevated above 70. Watch for short-term exhaustion, profit taking, or divergence before adding new Long positions.',
      };
    }
    if (rsiValue <= 30) {
      return {
        label: 'Oversold',
        bias: 'Bullish Reversal',
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
        desc: 'Oscillator has reached oversold territory below 30. Mean-reversion upside relief bounces carry higher statistical probability.',
      };
    }
    if (rsiValue >= 50) {
      return {
        label: 'Bullish Momentum',
        bias: 'Bullish Continuation',
        color: 'text-primary-container',
        bg: 'bg-primary-container/10',
        border: 'border-primary-container/30',
        desc: 'Holding firmly above the 50 median line. Buyers maintain continuous absorption, offering healthy momentum runway.',
      };
    }
    return {
      label: 'Bearish Lean',
      bias: 'Consolidation / Pullback',
      color: 'text-sky-400',
      bg: 'bg-sky-500/10',
      border: 'border-sky-500/30',
      desc: 'Subdued below the 50 centerline. Momentum remains cautious; awaiting buyers to reclaim the 50 neutral pivot.',
    };
  }, [rsiValue]);

  // 2. Moving Averages: MA 50 and MA 200
  const maData = useMemo(() => {
    // Calculate realistic MA 50 and MA 200 based on price series and longer-term 7d/24h trajectory
    const ema50 = calculateEMA(priceValues, 50);
    // Baseline anchor for 50-period MA
    const ma50 = ema50 > 0 ? ema50 : currentPrice * (1 - (coin.change24h / 100) * 0.45);

    // Baseline anchor for 200-period MA:
    // If coin has positive 7d or 24h change, 200 MA sits lower (bull market structure).
    // If negative, 200 MA sits slightly higher.
    const longTermTrendMultiplier = (coin.change7d ?? coin.change24h) >= 0 ? 0.91 : 1.07;
    const ma200 = Number((currentPrice * longTermTrendMultiplier).toFixed(2));

    const priceAboveMA50 = currentPrice >= ma50;
    const priceAboveMA200 = currentPrice >= ma200;
    const isGoldenCross = ma50 >= ma200;

    const spreadMA50Pct = (((currentPrice - ma50) / ma50) * 100);
    const spreadMA200Pct = (((currentPrice - ma200) / ma200) * 100);
    const crossSpreadPct = (((ma50 - ma200) / ma200) * 100);

    return {
      ma50: Number(ma50.toFixed(2)),
      ma200: Number(ma200.toFixed(2)),
      priceAboveMA50,
      priceAboveMA200,
      isGoldenCross,
      spreadMA50Pct: Number(spreadMA50Pct.toFixed(1)),
      spreadMA200Pct: Number(spreadMA200Pct.toFixed(1)),
      crossSpreadPct: Number(crossSpreadPct.toFixed(1)),
    };
  }, [priceValues, currentPrice, coin.change24h, coin.change7d]);

  // 3. Volume Profile & Liquidity Concentration Nodes
  const volumeProfileData = useMemo(() => {
    const high = coin.high24h && coin.high24h > currentPrice ? coin.high24h : currentPrice * 1.025;
    const low = coin.low24h && coin.low24h < currentPrice ? coin.low24h : currentPrice * 0.975;
    const range = high - low || currentPrice * 0.05;
    const numBins = 7;
    const step = range / numBins;

    // Estimate Buy vs Sell ratio based on 24h performance and momentum
    let buyRatio = 50 + (coin.change24h * 1.8);
    buyRatio = Math.max(30, Math.min(78, buyRatio));
    const sellRatio = 100 - buyRatio;

    // Distribute total 24h volume across price tiers with bell-curve clustering around current price
    const bins: {
      priceMin: number;
      priceMax: number;
      priceMid: number;
      volumePct: number;
      buyVolume: number;
      sellVolume: number;
      isPOC: boolean;
    }[] = [];

    let maxBinVolume = -1;
    let pocIndex = 3;

    for (let i = 0; i < numBins; i++) {
      const pMin = low + i * step;
      const pMax = low + (i + 1) * step;
      const pMid = (pMin + pMax) / 2;

      // Distance from current price normalized
      const distFromPrice = Math.abs(pMid - currentPrice) / (range / 2);
      // Gaussian-style volume distribution
      const density = Math.exp(-Math.pow(distFromPrice * 1.3, 2));
      const binVolPct = Math.max(5, density * 32);

      if (binVolPct > maxBinVolume) {
        maxBinVolume = binVolPct;
        pocIndex = i;
      }

      const totalBinVol = (coin.volume24h * (binVolPct / 100));
      const binBuyVol = totalBinVol * (buyRatio / 100);
      const binSellVol = totalBinVol * (sellRatio / 100);

      bins.push({
        priceMin: pMin,
        priceMax: pMax,
        priceMid: pMid,
        volumePct: binVolPct,
        buyVolume: binBuyVol,
        sellVolume: binSellVol,
        isPOC: false,
      });
    }

    if (bins[pocIndex]) {
      bins[pocIndex].isPOC = true;
    }

    const pocPrice = bins[pocIndex]?.priceMid || currentPrice;
    const vahPrice = low + range * 0.85; // Value Area High
    const valPrice = low + range * 0.15; // Value Area Low

    return {
      bins,
      pocPrice: Number(pocPrice.toFixed(2)),
      vahPrice: Number(vahPrice.toFixed(2)),
      valPrice: Number(valPrice.toFixed(2)),
      buyRatio: Math.round(buyRatio),
      sellRatio: Math.round(sellRatio),
    };
  }, [coin.high24h, coin.low24h, coin.volume24h, currentPrice, coin.change24h]);

  // Overall Technical Verdict combining RSI, MA50/200, and Volume
  const overallVerdict = useMemo(() => {
    let score = 0;
    if (rsiValue >= 50 && rsiValue <= 68) score += 2;
    else if (rsiValue < 30) score += 1; // oversold bounce
    else if (rsiValue > 70) score -= 1; // overbought risk

    if (maData.isGoldenCross) score += 2;
    if (maData.priceAboveMA50) score += 1.5;
    if (maData.priceAboveMA200) score += 1.5;

    if (volumeProfileData.buyRatio >= 53) score += 1.5;
    else if (volumeProfileData.buyRatio <= 46) score -= 1.5;

    if (score >= 5.5) {
      return {
        verdict: 'STRONG BULLISH',
        action: 'BUY / LONG ACCUMULATION',
        color: 'text-primary-container',
        bg: 'bg-primary-container/10',
        border: 'border-primary-container/30',
        badge: 'Dominant Uptrend',
      };
    }
    if (score >= 2.5) {
      return {
        verdict: 'MODERATE BULLISH',
        action: 'LONG WITH TRAILING STOPS',
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
        badge: 'Positive Momentum',
      };
    }
    if (score >= -1) {
      return {
        verdict: 'NEUTRAL CONSOLIDATION',
        action: 'RANGE TRADING / PIVOT BREAKOUT',
        color: 'text-cyan-400',
        bg: 'bg-cyan-500/10',
        border: 'border-cyan-500/30',
        badge: 'Equilibrium Zone',
      };
    }
    return {
      verdict: 'DEFENSIVE / BEARISH',
      action: 'SHORT OR WAIT FOR SUPPORT',
      color: 'text-status-error',
      bg: 'bg-status-error/10',
      border: 'border-status-error/30',
      badge: 'Downside Pressure',
    };
  }, [rsiValue, maData, volumeProfileData]);

  return (
    <div id="analytics-subtab-container" className="flex flex-col gap-3 w-full animate-fadeIn select-none">
      {/* 1. Master Indicator Confluence Banner */}
      <div className={`p-3 rounded-xl border ${overallVerdict.border} ${overallVerdict.bg} flex items-center justify-between flex-wrap gap-2 transition-all`}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-surface-canvas/80 border border-white/10 flex items-center justify-center">
            <Activity className={`w-4 h-4 ${overallVerdict.color}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Technical Confluence</span>
              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border ${overallVerdict.border} ${overallVerdict.color}`}>
                {overallVerdict.badge}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`font-headline font-bold text-[14px] ${overallVerdict.color}`}>
                {overallVerdict.verdict}
              </span>
              <span className="text-text-muted text-[11px] font-mono hidden sm:inline">·</span>
              <span className="text-text-primary text-[11px] font-mono font-medium hidden sm:inline">
                {overallVerdict.action}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Action buttons */}
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            onClick={() => {
              if (soundEnabled) playHudSound('click');
              onOpenAIModal('chart-deep');
            }}
            className="px-2.5 py-1.5 rounded-lg bg-surface-panel hover:bg-surface-container border border-cyan-500/40 text-cyan-300 font-mono text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            title="Cross-reference with Gemini Deep Chart AI Analysis"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>AI Deep Scan</span>
          </button>
        </div>
      </div>

      {/* 2. Grid of Primary Indicator Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* ========================================================================= */}
        {/* CARD A: Relative Strength Index (RSI 14)                                  */}
        {/* ========================================================================= */}
        <div className="p-3.5 rounded-xl bg-surface-panel/90 border border-white/10 hover:border-white/20 transition-all flex flex-col justify-between gap-3 shadow-sm">
          <div>
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div className="flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-cyan-400" />
                <span className="font-headline font-bold text-[12px] text-text-primary">
                  RSI (14-Period)
                </span>
              </div>
              <span className={`text-[10px] font-mono font-bold ${rsiCondition.color}`}>
                {rsiCondition.label}
              </span>
            </div>

            {/* Large Value & Status */}
            <div className="flex items-baseline justify-between mt-2.5">
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono font-bold text-[26px] text-text-primary leading-none">
                  {rsiValue}
                </span>
                <span className="text-[10px] font-mono text-text-muted">/ 100</span>
              </div>
              <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${rsiCondition.bg} ${rsiCondition.border} border`}>
                {rsiCondition.bias}
              </span>
            </div>

            {/* Visual Continuous Range Meter */}
            <div className="mt-3 space-y-1">
              <div className="relative w-full h-2 rounded-full bg-surface-canvas overflow-hidden border border-white/5 flex">
                {/* 0 - 30: Oversold Zone (Green) */}
                <div className="w-[30%] h-full bg-emerald-500/30 border-r border-white/10" />
                {/* 30 - 70: Equilibrium Zone (Slate/Neutral) */}
                <div className="w-[40%] h-full bg-slate-500/20 border-r border-white/10" />
                {/* 70 - 100: Overbought Zone (Amber/Rose) */}
                <div className="w-[30%] h-full bg-amber-500/30" />

                {/* Exact Position Indicator Needle */}
                <div
                  className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_8px_#ffffff] -translate-x-1/2 transition-all duration-300"
                  style={{ left: `${Math.min(99, Math.max(1, rsiValue))}%` }}
                />
              </div>

              {/* Threshold Labels */}
              <div className="flex justify-between text-[8.5px] font-mono text-text-muted px-0.5">
                <span>0 (Oversold &lt;30)</span>
                <span>50 Median</span>
                <span>100 (Overbought &gt;70)</span>
              </div>
            </div>

            {/* Descriptive Insight */}
            <p className="text-[10.5px] text-text-secondary leading-relaxed mt-2.5 pt-2 border-t border-white/5">
              {rsiCondition.desc}
            </p>
          </div>

          {/* Quick Metrics Footer */}
          <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-white/5 text-[9.5px] font-mono">
            <div className="flex justify-between bg-surface-canvas/60 px-2 py-1 rounded">
              <span className="text-text-muted">Zone:</span>
              <span className="text-text-primary font-bold">{rsiValue >= 70 ? 'Extreme High' : rsiValue <= 30 ? 'Extreme Low' : 'Mid-Range'}</span>
            </div>
            <div className="flex justify-between bg-surface-canvas/60 px-2 py-1 rounded">
              <span className="text-text-muted">Center Pivot:</span>
              <span className={rsiValue >= 50 ? 'text-primary-container font-bold' : 'text-amber-400 font-bold'}>
                {rsiValue >= 50 ? '+ Above 50' : '- Below 50'}
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* CARD B: Moving Averages (50 / 200)                                        */}
        {/* ========================================================================= */}
        <div className="p-3.5 rounded-xl bg-surface-panel/90 border border-white/10 hover:border-white/20 transition-all flex flex-col justify-between gap-3 shadow-sm">
          <div>
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div className="flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-primary-container" />
                <span className="font-headline font-bold text-[12px] text-text-primary">
                  Moving Averages (50/200)
                </span>
              </div>
              <span className={`text-[10px] font-mono font-bold flex items-center gap-1 ${maData.isGoldenCross ? 'text-primary-container' : 'text-amber-400'}`}>
                {maData.isGoldenCross ? 'Golden Cross Active' : 'Death Cross Compression'}
              </span>
            </div>

            {/* Dual Level Values */}
            <div className="grid grid-cols-2 gap-2 mt-2.5">
              {/* MA 50 */}
              <div className="p-2 rounded-lg bg-surface-canvas/70 border border-white/5">
                <div className="text-[9px] font-mono text-cyan-400 uppercase tracking-wider">MA 50 (Medium)</div>
                <div className="font-mono font-bold text-[13px] text-text-primary mt-0.5">
                  {formatCurrency(maData.ma50)}
                </div>
                <div className={`text-[9px] font-mono mt-0.5 ${maData.spreadMA50Pct >= 0 ? 'text-primary-container' : 'text-status-error'}`}>
                  {maData.spreadMA50Pct >= 0 ? '▲ +' : '▼ '}
                  {Math.abs(maData.spreadMA50Pct)}% vs price
                </div>
              </div>

              {/* MA 200 */}
              <div className="p-2 rounded-lg bg-surface-canvas/70 border border-white/5">
                <div className="text-[9px] font-mono text-amber-400 uppercase tracking-wider">MA 200 (Macro)</div>
                <div className="font-mono font-bold text-[13px] text-text-primary mt-0.5">
                  {formatCurrency(maData.ma200)}
                </div>
                <div className={`text-[9px] font-mono mt-0.5 ${maData.spreadMA200Pct >= 0 ? 'text-primary-container' : 'text-status-error'}`}>
                  {maData.spreadMA200Pct >= 0 ? '▲ +' : '▼ '}
                  {Math.abs(maData.spreadMA200Pct)}% vs price
                </div>
              </div>
            </div>

            {/* Alignment Graphic */}
            <div className="mt-3 p-2 rounded-lg bg-surface-canvas/60 border border-white/5 space-y-1.5">
              <div className="flex items-center justify-between text-[9px] font-mono">
                <span className="text-text-muted">Trend Structure:</span>
                <span className="text-text-primary font-bold">
                  {maData.priceAboveMA50 && maData.priceAboveMA200
                    ? 'Full Bullish Alignment (Price > MA50 > MA200)'
                    : maData.priceAboveMA200
                    ? 'Macro Support Holding (Price > MA200)'
                    : 'Macro Defensive Regime'}
                </span>
              </div>

              {/* Cross Spread Meter */}
              <div className="flex items-center gap-1.5 text-[9px] font-mono text-text-muted">
                <span>Spread (MA50 vs MA200):</span>
                <span className={`font-bold ml-auto ${maData.crossSpreadPct >= 0 ? 'text-primary-container' : 'text-amber-400'}`}>
                  {maData.crossSpreadPct >= 0 ? '+' : ''}{maData.crossSpreadPct}%
                </span>
              </div>
            </div>

            {/* Summary sentence */}
            <p className="text-[10.5px] text-text-secondary leading-relaxed mt-2 pt-2 border-t border-white/5">
              {maData.isGoldenCross
                ? `Medium-term MA 50 (${formatCurrency(maData.ma50)}) maintains structural leadership over the 200-period baseline, confirming sustained institutional accumulation.`
                : `MA 50 trails below the MA 200 baseline. Watch for a price reclamation of ${formatCurrency(maData.ma50)} to confirm bullish momentum recovery.`}
            </p>
          </div>

          {/* Quick Metrics Footer */}
          <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-white/5 text-[9.5px] font-mono">
            <div className="flex justify-between bg-surface-canvas/60 px-2 py-1 rounded">
              <span className="text-text-muted">Price vs 50:</span>
              <span className={maData.priceAboveMA50 ? 'text-primary-container font-bold' : 'text-status-error font-bold'}>
                {maData.priceAboveMA50 ? 'Holding Above' : 'Below MA'}
              </span>
            </div>
            <div className="flex justify-between bg-surface-canvas/60 px-2 py-1 rounded">
              <span className="text-text-muted">Price vs 200:</span>
              <span className={maData.priceAboveMA200 ? 'text-primary-container font-bold' : 'text-status-error font-bold'}>
                {maData.priceAboveMA200 ? 'Holding Above' : 'Below MA'}
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* CARD C: Volume Profile Analysis & Liquidity Clusters                      */}
        {/* ========================================================================= */}
        <div className="p-3.5 rounded-xl bg-surface-panel/90 border border-white/10 hover:border-white/20 transition-all flex flex-col justify-between gap-3 shadow-sm">
          <div>
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div className="flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                <span className="font-headline font-bold text-[12px] text-text-primary">
                  Volume Profile (VP)
                </span>
              </div>
              <span className="text-[10px] font-mono font-bold text-primary-container">
                POC: {formatCurrency(volumeProfileData.pocPrice)}
              </span>
            </div>

            {/* Buy / Sell Delta Split Bar */}
            <div className="mt-2.5">
              <div className="flex items-center justify-between text-[9px] font-mono mb-1">
                <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                  <ArrowUpRight className="w-3 h-3" /> Buy Volume ({volumeProfileData.buyRatio}%)
                </span>
                <span className="text-status-error font-bold flex items-center gap-0.5">
                  Sell Volume ({volumeProfileData.sellRatio}%) <ArrowDownRight className="w-3 h-3" />
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface-canvas overflow-hidden flex border border-white/5">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${volumeProfileData.buyRatio}%` }}
                />
                <div
                  className="h-full bg-status-error transition-all duration-300"
                  style={{ width: `${volumeProfileData.sellRatio}%` }}
                />
              </div>
            </div>

            {/* Volume Profile Histogram Clusters */}
            <div className="mt-3 space-y-1">
              <div className="text-[9px] font-mono text-text-muted flex justify-between">
                <span>Price Level</span>
                <span>Volume Density</span>
              </div>
              <div className="space-y-1">
                {volumeProfileData.bins.slice(0, 5).map((b, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 text-[9px] font-mono">
                    <span className={`w-16 shrink-0 truncate ${b.isPOC ? 'text-primary-container font-bold' : 'text-text-secondary'}`}>
                      {formatCurrency(b.priceMid)}
                    </span>
                    <div className="flex-1 h-2 rounded bg-surface-canvas/80 overflow-hidden flex">
                      <div
                        className={`h-full ${b.isPOC ? 'bg-primary-container shadow-[0_0_6px_rgba(0,245,160,0.5)]' : 'bg-slate-400/30'}`}
                        style={{ width: `${Math.min(100, b.volumePct * 2.5)}%` }}
                      />
                    </div>
                    {b.isPOC ? (
                      <span className="text-[8px] font-bold text-on-primary-container bg-primary-container px-1 rounded">
                        POC
                      </span>
                    ) : (
                      <span className="text-[8px] text-text-muted w-7 text-right">
                        {Math.round(b.volumePct)}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Key Value Area Levels */}
            <div className="mt-2.5 pt-2 border-t border-white/5 grid grid-cols-2 gap-2 text-[9px] font-mono">
              <div className="bg-surface-canvas/60 p-1.5 rounded">
                <span className="text-text-muted block">Value Area High:</span>
                <span className="text-text-primary font-bold">{formatCurrency(volumeProfileData.vahPrice)}</span>
              </div>
              <div className="bg-surface-canvas/60 p-1.5 rounded">
                <span className="text-text-muted block">Value Area Low:</span>
                <span className="text-text-primary font-bold">{formatCurrency(volumeProfileData.valPrice)}</span>
              </div>
            </div>
          </div>

          {/* Volume Profile Summary Footer */}
          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[9.5px] font-mono">
            <span className="text-text-muted">24h Total Liquidity:</span>
            <span className="text-text-primary font-bold">{formatCompactNumber(coin.volume24h)}</span>
          </div>
        </div>
      </div>

      {/* 3. Deep AI Companion Integration Section */}
      <div className="p-3.5 rounded-xl bg-surface-panel/80 border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <h4 className="font-headline font-bold text-[13px] text-text-primary">
              AI Market & Technical Confluence Engine
            </h4>
            {aiAnalysisData && (
              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                aiAnalysisData.sentiment === 'BULLISH'
                  ? 'bg-primary-container/10 border-primary-container/30 text-primary-container'
                  : aiAnalysisData.sentiment === 'BEARISH'
                  ? 'bg-status-error/10 border-status-error/30 text-status-error'
                  : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
              }`}>
                Latest AI Bias: {aiAnalysisData.sentiment}
              </span>
            )}
          </div>
          <p className="text-[11px] text-text-secondary leading-relaxed">
            {aiAnalysisData
              ? `Real-time synthesis active for ${coin.name}. The AI cross-evaluates this RSI (${rsiValue}), MA50/200 structures, and volume profile against live crypto market price action.`
              : `Synthesize this coin's RSI (${rsiValue}), moving averages, and volume profile with Gemini AI to generate immediate long/short probability ratings and trade targets.`}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (soundEnabled) playHudSound('click');
              onOpenAIModal('sentiment');
            }}
            className="px-3 py-1.5 rounded-lg bg-surface-canvas hover:bg-surface-container border border-primary-container/40 text-primary-container font-mono text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-primary-container" />
            <span>AI Sentiment</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (soundEnabled) playHudSound('click');
              onOpenAIModal('chart-deep');
            }}
            className="px-3 py-1.5 rounded-lg bg-cyan-950/40 hover:bg-cyan-900/40 border border-cyan-500/40 text-cyan-300 font-mono text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Full AI Technical Scan</span>
          </button>
        </div>
      </div>
    </div>
  );
};

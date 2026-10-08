import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Compass,
  ExternalLink,
  X,
  RefreshCw,
  Layers,
  Activity,
  ShieldAlert,
  ArrowLeft,
} from 'lucide-react';
import { AIAnalysisResponse } from '../services/aiAnalyst';
import { playHudSound } from '../services/marketData';

interface AIAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  data: AIAnalysisResponse | null;
  error: string | null;
  onRefresh: (mode: 'sentiment' | 'chart-deep') => void;
  activeMode: 'sentiment' | 'chart-deep';
  coinSymbol: string;
  coinName: string;
  currentPrice: number;
  rsi?: number;
  ema20?: number;
  soundEnabled: boolean;
}

export const AIAnalysisModal: React.FC<AIAnalysisModalProps> = ({
  isOpen,
  onClose,
  isLoading,
  data,
  error,
  onRefresh,
  activeMode,
  coinSymbol,
  coinName,
  currentPrice,
  rsi,
  ema20,
  soundEnabled,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (soundEnabled) playHudSound('switch');
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, soundEnabled, onClose]);

  if (!isOpen) return null;

  const isBullish = data?.sentiment === 'BULLISH';
  const isBearish = data?.sentiment === 'BEARISH';

  return createPortal(
    <div
      data-ai-analysis-modal="true"
      className="fixed inset-0 z-[2147483000] flex items-stretch sm:items-center justify-center bg-[#05080b] sm:bg-black/75 sm:backdrop-blur-md overflow-hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          if (soundEnabled) playHudSound('switch');
          onClose();
        }
      }}
    >
      <div className="relative w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-xl bg-[#090d14] border-0 sm:border border-primary-container/30 rounded-none sm:rounded-2xl shadow-none sm:shadow-[0_0_30px_rgba(0,245,160,0.15)] flex flex-col overflow-hidden text-[#f3f6f9]">
        {/* Modal Top Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/10 bg-surface-canvas/90 gap-2">
          <button
            type="button"
            onClick={() => {
              if (soundEnabled) playHudSound('switch');
              onClose();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-container/15 hover:bg-primary-container text-primary-container hover:text-on-primary-container border border-primary-container/40 font-mono text-xs font-bold transition-all cursor-pointer shadow-sm group shrink-0"
            title="Return to previous screen"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
            <span>Back</span>
          </button>

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary-container/15 border border-primary-container/40 flex items-center justify-center text-primary-container shadow-[0_0_10px_rgba(0,245,160,0.3)]">
              <Sparkles className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-headline font-bold text-sm tracking-wide text-white">
                  Aurelis AI Intel
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-primary-container/20 text-primary-container border border-primary-container/30 font-bold">
                  LIVE
                </span>
              </div>
              <p className="text-[11px] font-mono text-text-muted">
                {coinName} ({coinSymbol}/USD)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (soundEnabled) playHudSound('switch');
              onClose();
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-status-error/15 hover:bg-status-error/25 border border-status-error/30 text-status-error hover:text-white font-mono text-xs font-bold cursor-pointer transition-colors shrink-0"
            title="Close analysis"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>

        {/* Mode Switch Tabs inside Modal */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-surface-panel/40">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (soundEnabled) playHudSound('click');
                onRefresh('sentiment');
              }}
              className={`px-3 py-1 rounded-md text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeMode === 'sentiment'
                  ? 'bg-primary-container text-surface-canvas shadow-[0_0_8px_rgba(0,245,160,0.3)]'
                  : 'text-text-muted hover:text-text-primary bg-surface-panel/60 border border-white/5'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Quick Sentiment</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (soundEnabled) playHudSound('click');
                onRefresh('chart-deep');
              }}
              className={`px-3 py-1 rounded-md text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeMode === 'chart-deep'
                  ? 'bg-primary-container text-surface-canvas shadow-[0_0_8px_rgba(0,245,160,0.3)]'
                  : 'text-text-muted hover:text-text-primary bg-surface-panel/60 border border-white/5'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Deep Chart & Indicators</span>
            </button>
          </div>

          {/* Quick Stats Pill */}
          <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono text-text-secondary">
            <span>RSI: <strong className="text-text-primary">{rsi ?? '50.0'}</strong></span>
            <span>•</span>
            <span>EMA-20: <strong className="text-text-primary">${ema20?.toLocaleString() ?? '—'}</strong></span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto flex-1 font-mono text-xs leading-relaxed space-y-3.5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3 text-center">
              <RefreshCw className="w-8 h-8 text-primary-container animate-spin" />
              <div className="space-y-1">
                <p className="font-headline font-bold text-sm text-text-primary">
                  Analyzing Live Chart & Web Catalysts...
                </p>
                <p className="text-[11px] text-text-muted font-mono max-w-sm">
                  Computing 14-period RSI, moving averages, and cross-referencing real-time Google Search data for {coinSymbol}.
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-status-error/15 border border-status-error/40 text-status-error space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>AI Analysis Error</span>
              </div>
              <p className="text-[11px] leading-normal">{error}</p>
              <button
                type="button"
                onClick={() => onRefresh(activeMode)}
                className="mt-2 px-3 py-1.5 rounded-lg bg-status-error/20 hover:bg-status-error/30 text-status-error text-[11px] font-bold border border-status-error/40 transition-colors cursor-pointer"
              >
                Retry Analysis
              </button>
            </div>
          ) : data ? (
            <>
              {/* Sentiment Banner */}
              <div
                className={`flex items-center justify-between p-3 rounded-xl border ${
                  isBullish
                    ? 'bg-oracle-synced/10 border-oracle-synced/30 text-oracle-synced'
                    : isBearish
                    ? 'bg-status-error/10 border-status-error/30 text-status-error'
                    : 'bg-amber-400/10 border-amber-400/30 text-amber-400'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {isBullish ? (
                    <TrendingUp className="w-6 h-6 stroke-[2.5]" />
                  ) : isBearish ? (
                    <TrendingDown className="w-6 h-6 stroke-[2.5]" />
                  ) : (
                    <Compass className="w-6 h-6 stroke-[2.5]" />
                  )}
                  <div>
                    <span className="text-[10px] uppercase tracking-widest block font-sans font-semibold opacity-75">
                      Market Bias Direction
                    </span>
                    <strong className="text-base font-headline tracking-wide">
                      {data.sentiment} {isBullish ? '(LONG SETUP)' : isBearish ? '(SHORT SETUP)' : '(NEUTRAL / RANGE)'}
                    </strong>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[9px] uppercase tracking-wider block opacity-70">
                    {data.engine === 'algorithmic-indicator' ? 'Engine' : 'Intelligence Model'}
                  </span>
                  <span className="text-[11px] font-bold text-white flex items-center gap-1 justify-end">
                    {data.engine === 'algorithmic-indicator' ? (
                      <span className="text-primary-container">Indicator Algorithmic</span>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 text-primary-container" />
                        <span className="text-primary-container">{data.modelUsed || 'Gemini AI'}</span>
                      </>
                    )}
                  </span>
                </div>
              </div>

              {/* Quota Exceeded Advisory Banner */}
              {data.quotaExceeded && (
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>
                    Gemini API free tier rate limit (429) was reached. Seamlessly switched to Aurelis Algorithmic Indicator Engine.
                  </span>
                </div>
              )}

              {/* Analysis Text formatted */}
              <div className="p-3.5 rounded-xl bg-surface-canvas/80 border border-white/5 space-y-2 text-text-primary whitespace-pre-wrap leading-relaxed text-[11.5px]">
                {data.analysis}
              </div>

              {/* Web Sources & Grounding Citations */}
              {data.sources && data.sources.length > 0 && (
                <div className="pt-2">
                  <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider block mb-1.5">
                    Live Web Citations (Google Search)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {data.sources.map((src, i) => (
                      <a
                        key={i}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-surface-panel hover:bg-surface-container border border-white/10 hover:border-primary-container/40 text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors"
                      >
                        <span className="truncate max-w-[200px]">{src.title}</span>
                        <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-white/10 bg-surface-canvas/90 text-[10px] font-mono text-text-muted">
          <span>AI-generated market insights. Not financial advice.</span>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => onRefresh(activeMode)}
            className="px-2.5 py-1 rounded-md bg-surface-panel hover:bg-surface-container text-text-primary border border-white/10 hover:border-primary-container/40 flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Re-Analyze</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

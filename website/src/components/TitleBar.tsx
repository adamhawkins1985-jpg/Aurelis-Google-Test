import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Square, X, Volume2, VolumeX, Monitor, Sun, Moon, Wallet, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { playHudSound } from '../services/marketData';
import { AurelisLogo } from './AurelisLogo';
import { ThemeMode } from '../types';

interface TitleBarProps {
  opacity: number;
  onOpacityChange: (val: number) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  latencyMs: number;
  isMinimized: boolean;
  onToggleMinimize: () => void;
  isMaximized: boolean;
  onToggleMaximize: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  backdropMode: 'cyber' | 'desktop' | 'grid';
  onCycleBackdrop: () => void;
  onOpenGuide?: () => void;
  onGoHome?: () => void;
  onPopoutWidget?: () => void;
  onOpenTrade?: () => void;
  onOpenWallet?: () => void;
  isWalletConnected?: boolean;
  onOpenTradeAlert?: (setup: any) => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  opacity,
  onOpacityChange,
  theme,
  onToggleTheme,
  latencyMs,
  isMinimized,
  onToggleMinimize,
  isMaximized,
  onToggleMaximize,
  soundEnabled,
  onToggleSound,
  backdropMode,
  onCycleBackdrop,
  onOpenGuide,
  onGoHome,
  onPopoutWidget,
  onOpenTrade,
  onOpenWallet,
  isWalletConnected = false,
  onOpenTradeAlert,
}) => {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [toastAlert, setToastAlert] = useState<any | null>(null);
  const [tradeAlerts, setTradeAlerts] = useState<any[]>([]);
  const [tradeAlertsOpen, setTradeAlertsOpen] = useState(false);
  const alertedTradeKeys = useRef<Set<string>>(new Set());
  const lastFetchedId = useRef<number>(0);
  const [seenAlertId, setSeenAlertId] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    return Number(localStorage.getItem('aurelis_web_alert_seen_id') || 0);
  });

  useEffect(() => {
    let active = true;
    const loadAlerts = async () => {
      try {
        const response = await fetch('/api/alerts/recent?limit=30', {
          cache: 'no-store',
          credentials: 'include',
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!active || !data?.ok || !Array.isArray(data.alerts)) return;
        const nextAlerts = data.alerts;
        const newestId = Number(nextAlerts[0]?.id || 0);
        if (lastFetchedId.current > 0 && newestId > lastFetchedId.current) {
          const fresh = nextAlerts.find((item: any) => Number(item.id) > lastFetchedId.current);
          if (fresh?.type === 'wallet_received') {
            setToastAlert(fresh);
            window.setTimeout(() => setToastAlert(null), 7000);
          }
        }
        lastFetchedId.current = Math.max(lastFetchedId.current, newestId);
        setAlerts(nextAlerts);
      } catch {}
    };
    loadAlerts();
    const timer = window.setInterval(loadAlerts, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    try {
      const saved = JSON.parse(localStorage.getItem('aurelis_trade_alert_keys') || '[]');
      if (Array.isArray(saved)) alertedTradeKeys.current = new Set(saved.map(String));
    } catch {}

    const loadTradeAlerts = async () => {
      try {
        const response = await fetch('/api/trade-radar', { cache: 'no-store' });
        const data = await response.json();
        if (!active || !response.ok || !data?.ok || !Array.isArray(data.candidates)) return;
        const qualifying = data.candidates
          .filter((c: any) => Number(c?.score || 0) >= 79)
          .map((c: any) => {
            const economics = c?.economics || {};
            const symbol = String(c?.asset || c?.market || '—').toUpperCase();
            const direction = String(c?.direction || 'LONG').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
            const entry = Number(c?.entry || c?.price || 0);
            const stop = Number(c?.invalidation || economics?.stop || 0);
            const target = Number(c?.target || economics?.target || 0);
            const score = Number(c?.score || 0);
            const key = `${symbol}:${direction}:${entry.toFixed(8)}:${target.toFixed(8)}`;
            return {
              key,
              symbol,
              name: symbol,
              direction,
              score,
              entry,
              stop,
              target,
              margin: 25,
              leverage: 1,
              id: key,
              rank: '',
              isFresh: true,
              payoff: 'FAIR PAYOFF',
              netRr: Number(economics?.netRewardRisk || 0),
              forge: 0,
              pulse: 0,
              scope: score,
              atlas: 0,
              aegis: 0,
              indicators: '',
              commentary: Array.isArray(c?.reasons) ? c.reasons.join(' · ') : 'AURELIS high-confidence trade setup.',
              notes: [],
              targetNet: Number(economics?.expectedNetRewardPct || 0),
              stopLoss: Number(economics?.plannedRiskPct || 0),
              tradeCost: Number(economics?.estimatedRoundTripCostPct || 0),
            };
          });

        const newOnes = qualifying.filter((setup: any) => !alertedTradeKeys.current.has(setup.key));
        if (newOnes.length > 0) {
          newOnes.forEach((setup: any) => alertedTradeKeys.current.add(setup.key));
          try {
            localStorage.setItem('aurelis_trade_alert_keys', JSON.stringify(Array.from(alertedTradeKeys.current).slice(-200)));
          } catch {}
          setTradeAlerts((current) => {
            const byKey = new Map(current.map((item: any) => [item.key, item]));
            newOnes.forEach((item: any) => byKey.set(item.key, item));
            return Array.from(byKey.values()).sort((a: any, b: any) => b.score - a.score).slice(0, 20);
          });
          if (soundEnabled) {
            playHudSound('trade');
            try {
              if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance('Huge trade alert!');
                utterance.rate = 0.82;
                utterance.pitch = 0.78;
                utterance.volume = 1;
                const voices = window.speechSynthesis.getVoices();
                const preferred = voices.find((v) => /en-US/i.test(v.lang) && /male|david|mark|guy|george/i.test(v.name)) || voices.find((v) => /en-US/i.test(v.lang));
                if (preferred) utterance.voice = preferred;
                window.speechSynthesis.speak(utterance);
              }
            } catch {}
          }
        }
      } catch {}
    };

    loadTradeAlerts();
    const timer = window.setInterval(loadTradeAlerts, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [soundEnabled]);

  const discardTradeAlert = (key: string) => {
    setTradeAlerts((current) => current.filter((item: any) => item.key !== key));
  };

  const unreadCount = useMemo(
    () => alerts.filter((item) => Number(item.id || 0) > seenAlertId).length,
    [alerts, seenAlertId]
  );

  const markAlertsSeen = () => {
    const newestId = Number(alerts[0]?.id || seenAlertId);
    setSeenAlertId(newestId);
    try { localStorage.setItem('aurelis_web_alert_seen_id', String(newestId)); } catch {}
  };

  return (
    <div
      id="titlebar-container"
      className="relative h-10 px-3 bg-surface-panel border-b border-white/10 flex items-center justify-between gap-2 select-none shrink-0"
    >
      {tradeAlerts.length > 0 && (
        <div className="absolute left-1/2 -translate-x-1/2 top-1 z-[260]">
          <button
            type="button"
            onClick={() => setTradeAlertsOpen((open) => !open)}
            className="h-8 px-4 rounded-lg bg-red-600 hover:bg-red-500 border border-red-400/70 text-white text-[11px] font-black tracking-[0.12em] shadow-[0_0_18px_rgba(220,38,38,.45)] flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4" />
            TRADE ALERT!!!
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-white text-red-700 text-[9px] leading-[18px] text-center">{tradeAlerts.length}</span>
          </button>

          {tradeAlertsOpen && (
            <div className="absolute left-1/2 -translate-x-1/2 top-9 w-[min(560px,92vw)] max-h-[430px] overflow-hidden rounded-xl border border-red-500/40 bg-[#0b0f14] shadow-[0_22px_60px_rgba(0,0,0,.8)]">
              <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-black text-red-400 tracking-wider">TRADE ALERTS</div>
                  <div className="text-[9px] text-text-muted">New AURELIS setups rated 79 or higher</div>
                </div>
                <button onClick={() => setTradeAlertsOpen(false)} className="p-1 text-text-muted hover:text-white"><X className="w-4 h-4" /></button>
              </div>
              <div className="max-h-[370px] overflow-y-auto">
                {tradeAlerts.map((setup: any) => (
                  <div key={setup.key} className="px-3 py-2.5 border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <strong className="text-[12px] text-white">{setup.symbol}</strong>
                          <span className={`text-[9px] font-bold ${setup.direction === 'LONG' ? 'text-emerald-400' : 'text-rose-400'}`}>{setup.direction}</span>
                          <span className="text-[9px] font-black text-red-400">SCORE {setup.score}</span>
                        </div>
                        <div className="mt-1 text-[9px] text-text-secondary">Entry ${setup.entry} · Stop ${setup.stop} · Target ${setup.target}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setTradeAlertsOpen(false);
                          onOpenTradeAlert?.(setup);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-primary-container text-on-primary-container text-[9px] font-bold whitespace-nowrap"
                      >
                        OPEN TRADE
                      </button>
                      <button
                        type="button"
                        onClick={() => discardTradeAlert(setup.key)}
                        className="px-2 py-1.5 rounded-lg border border-white/10 text-[9px] text-text-muted hover:text-status-error whitespace-nowrap"
                      >
                        DISCARD
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Brand with Official Aurelis Logo - Clicking returns to Home Dashboard */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          className="flex items-center cursor-pointer group py-0.5 border-none bg-transparent outline-none"
          title="Return to Home Dashboard (Balance & News)"
          onClick={() => {
            if (soundEnabled) playHudSound('switch');
            if (onGoHome) onGoHome();
            else if (onOpenGuide) onOpenGuide();
          }}
        >
          {/* Official Aurelis Vector Wordmark & Emblem */}
          <AurelisLogo
            variant="full"
            className="h-4 sm:h-[18px] w-auto text-text-primary group-hover:text-primary-container transition-colors"
            color="currentColor"
          />
        </button>
      </div>

      {/* Button between the aurelis logo and the dark button: Connect Wallet / Wallet Connected */}
      <button
        type="button"
        id="titlebar-connect-wallet-btn"
        onClick={() => {
          if (soundEnabled) playHudSound('click');
          if (onOpenWallet) onOpenWallet();
        }}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-mono font-bold transition-all cursor-pointer ${
          isWalletConnected
            ? 'bg-primary-container/15 text-primary-container border border-primary-container/40 hover:bg-primary-container/25 shadow-[0_0_10px_rgba(0,245,160,0.2)]'
            : 'bg-white/5 hover:bg-white/10 text-text-primary border border-white/15 hover:border-primary-container/50 hover:text-primary-container'
        }`}
        title={isWalletConnected ? 'Wallet Connected - Open Wallet Settings' : 'Connect Wallet - Open Wallet Settings'}
      >
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            isWalletConnected
              ? 'bg-primary-container shadow-[0_0_6px_rgba(0,245,160,0.8)] animate-pulse'
              : 'bg-text-muted'
          }`}
        />
        <Wallet className="w-3.5 h-3.5 shrink-0" />
        <span className="whitespace-nowrap">
          {isWalletConnected ? 'Wallet Connected' : 'Connect Wallet'}
        </span>
      </button>

      {/* Controls & Window Action Buttons starting with Dark/Light button */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <button
          type="button"
          id="aurelis-refresh-btn"
          onClick={() => {
            if (soundEnabled) playHudSound('click');
            window.location.reload();
          }}
          className="relative p-1 rounded text-text-secondary hover:text-primary-container hover:bg-white/5 transition-colors cursor-pointer"
          title="Refresh AURELIS"
          aria-label="Refresh AURELIS"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        {/* Light / Dark Theme Switcher (Dark button) */}
        <button
          id="themeToggleBtn"
          onClick={() => {
            if (soundEnabled) playHudSound('click');
            onToggleTheme();
          }}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold transition-all cursor-pointer ${
            theme === 'light'
              ? 'bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 border border-amber-500/30 shadow-[0_0_8px_rgba(245,158,11,0.15)]'
              : 'bg-surface-container-high text-text-secondary hover:text-text-primary border border-white/5'
          }`}
          title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
        >
          {theme === 'light' ? (
            <Sun className="w-2.5 h-2.5 text-amber-500" />
          ) : (
            <Moon className="w-2.5 h-2.5 text-cyan-400" />
          )}
          <span className="text-[9px] uppercase">{theme === 'light' ? 'LIGHT' : 'DARK'}</span>
        </button>

        {/* Audio Mute/Unmute */}
        <button
          id="btn-toggle-sound"
          onClick={() => {
            onToggleSound();
            if (!soundEnabled) playHudSound('click');
          }}
          className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors cursor-pointer"
          title={soundEnabled ? 'Mute Audio' : 'Enable Audio'}
        >
          {soundEnabled ? (
            <Volume2 className="w-3 h-3 text-primary-container" />
          ) : (
            <VolumeX className="w-3 h-3 text-text-muted" />
          )}
        </button>

        {/* Opacity Slider */}
        <div className="hidden sm:flex items-center gap-1 bg-surface-container-lowest/80 px-1.5 py-0.5 rounded border border-white/5 text-[9px] font-mono text-text-secondary">
          <span className="text-text-muted">OP</span>
          <input
            id="opacityRange"
            type="range"
            min="45"
            max="100"
            value={opacity}
            onChange={(e) => onOpacityChange(Number(e.target.value))}
            className="w-9 sm:w-11 h-1 bg-surface-container-high rounded appearance-none cursor-pointer accent-primary-container"
            title="Adjust Widget Opacity"
          />
          <span id="opacityText" className="w-6 text-right font-bold text-text-primary">
            {opacity}%
          </span>
        </div>

        {/* Windows OS Window Actions */}
        <div className="flex items-center gap-0.5 bg-surface-container-lowest/90 rounded border border-white/5 p-0.5">
          <button
            id="btn-win-minimize"
            onClick={() => {
              if (soundEnabled) playHudSound('click');
              const desktop = (window as any).AurelisDesktop;
              if (desktop?.isDesktop && desktop?.minimize) desktop.minimize();
              else onToggleMinimize();
            }}
            className="w-5 h-5 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-white/10 rounded transition-colors cursor-pointer"
            title={isMinimized ? 'Restore' : 'Minimize to Dock'}
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            id="btn-win-maximize"
            onClick={() => {
              if (soundEnabled) playHudSound('click');
              const desktop = (window as any).AurelisDesktop;
              if (desktop?.isDesktop && desktop?.maximizeToggle) desktop.maximizeToggle();
              else onToggleMaximize();
            }}
            className="w-5 h-5 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-white/10 rounded transition-colors cursor-pointer"
            title={isMaximized ? 'Restore Default Size' : 'Expand Size'}
          >
            <Square className="w-2.5 h-2.5" />
          </button>
          <button
            id="btn-win-close"
            onClick={() => {
              if (soundEnabled) playHudSound('click');
              const desktop = (window as any).AurelisDesktop;
              if (desktop?.isDesktop && desktop?.close) desktop.close();
              else onToggleMinimize();
            }}
            className="w-5 h-5 flex items-center justify-center text-text-secondary hover:text-status-error hover:bg-status-error/20 rounded transition-colors cursor-pointer"
            title="Minimize to Tray"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {toastAlert && (
        <div className="fixed top-3 right-3 z-[10000] w-[min(360px,calc(100vw-24px))] rounded-xl border border-primary-container/30 bg-surface-panel shadow-[0_18px_45px_rgba(0,0,0,0.75)] p-3">
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-full bg-primary-container/10 border border-primary-container/25 flex items-center justify-center shrink-0">
              <Wallet className="w-3.5 h-3.5 text-primary-container" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-primary-container">{toastAlert.title || 'Funds received'}</div>
              <div className="text-[10px] text-text-secondary mt-0.5">{toastAlert.body}</div>
            </div>
            <button onClick={() => setToastAlert(null)} className="ml-auto text-text-muted hover:text-text-primary"><X className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      )}
    </div>
  );
};

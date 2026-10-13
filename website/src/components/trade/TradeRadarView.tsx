import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Radar,
  Crosshair,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  Download,
  Share2,
  Copy,
  Check,
  X,
  Shield,
  Zap,
} from 'lucide-react';
import { CoinData } from '../../types';
import { playHudSound, formatCurrency } from '../../services/marketData';

export interface SetupCandidate {
  id: string;
  rank: string;
  symbol: string;
  name: string;
  direction: 'LONG' | 'SHORT';
  isFresh: boolean;
  payoff: 'FAIR PAYOFF' | 'HIGH PAYOFF' | 'CAUTION';
  score: number;
  indicators: string;
  commentary: string;
  entry: number;
  stop: number;
  target: number;
  netRr: number;
  forge: number;
  pulse: number;
  scope: number;
  atlas: number;
  aegis: number;
  notes: { step: string; agent: string; detail: string }[];
  margin: number;
  leverage?: number;
  targetNet: number;
  stopLoss: number;
  tradeCost: number;
  qualified?: boolean;
}

interface TradeRadarViewProps {
  coins: CoinData[];
  soundEnabled: boolean;
  onPlaceTrade?: (setup: SetupCandidate) => void;
}

const formatPrice = (value: number) => {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1) return n.toFixed(2);
  if (Math.abs(n) >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
};

export const TradeRadarView: React.FC<TradeRadarViewProps> = ({
  coins,
  soundEnabled,
  onPlaceTrade,
}) => {
  const [setups, setSetups] = useState<SetupCandidate[]>([]);
  const [selectedSetupId, setSelectedSetupId] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'all' | 'btc'>('all');
  const [isHunting, setIsHunting] = useState<boolean>(false);
  const [radarError, setRadarError] = useState<string | null>(null);
  const [radarMeta, setRadarMeta] = useState({ scanned: 0, deepAnalyzed: 0, source: 'AURELIS' });
  const [showWhyModal, setShowWhyModal] = useState<boolean>(false);
  const [showOrderModal, setShowOrderModal] = useState<boolean>(false);
  const [copiedNote, setCopiedNote] = useState<boolean>(false);
  const [positionAmount, setPositionAmount] = useState('10');
  const [positionLeverage, setPositionLeverage] = useState('2');
  const [supportedLeverage, setSupportedLeverage] = useState<number[]>([]);

  const mapCandidate = useCallback((candidate: any, index: number): SetupCandidate => {
    const econ = candidate?.economics || {};
    const structure = candidate?.structure || {};
    const agents = candidate?.agents || {};
    const reasons = Array.isArray(candidate?.reasons) ? candidate.reasons : [];
    const contradictions = Array.isArray(candidate?.contradictions) ? candidate.contradictions : [];
    const ageMs = Date.now() - Number(candidate?.ts_ms || 0);
    const rr = Number(econ.netRewardRisk || 0);
    const payoff: SetupCandidate['payoff'] = rr >= 2 ? 'HIGH PAYOFF' : rr >= 1.2 ? 'FAIR PAYOFF' : 'CAUTION';
    const notes = [
      ...reasons.map((detail: string, i: number) => ({ step: String(i + 1).padStart(2, '0'), agent: 'Signal', detail })),
      ...contradictions.map((detail: string, i: number) => ({ step: String(reasons.length + i + 1).padStart(2, '0'), agent: 'Risk', detail })),
      {
        step: String(reasons.length + contradictions.length + 1).padStart(2, '0'),
        agent: 'Economics',
        detail: `Net R:R ${rr.toFixed(2)} · expected net ${Number(econ.expectedNetRewardPct || 0).toFixed(2)}%`,
      },
    ];
    return {
      id: String(candidate?.asset || candidate?.market || index).toLowerCase(),
      rank: String(index + 1).padStart(2, '0'),
      symbol: String(candidate?.asset || '—').toUpperCase(),
      name: String(candidate?.asset || candidate?.market || 'Unknown'),
      direction: String(candidate?.direction || 'LONG').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG',
      isFresh: ageMs >= 0 && ageMs < 5 * 60 * 1000,
      payoff,
      score: Number(candidate?.score || 0),
      indicators: `EMA20 ${Number(structure.ema20 || 0).toPrecision(5)} · EMA50 ${Number(structure.ema50 || 0).toPrecision(5)} · RSI ${Number(structure.rsi || 0).toFixed(1)}`,
      commentary: [...reasons, ...contradictions.map((x: string) => `Risk: ${x}`)].join(' · ') || 'Live AURELIS scan candidate.',
      entry: Number(candidate?.entry || candidate?.price || 0),
      stop: Number(candidate?.invalidation || econ.stop || 0),
      target: Number(candidate?.target || econ.target || 0),
      netRr: rr,
      forge: Math.round(Number(agents.structure || 0)),
      pulse: Math.round(Number(agents.flow || 0)),
      scope: Math.round(Number(candidate?.score || 0)),
      atlas: Math.round(Number(agents.history || agents.freqai || 0)),
      aegis: Math.round(Number(agents.risk || 0)),
      notes,
      margin: 25,
      targetNet: Number(econ.expectedNetRewardPct || 0),
      stopLoss: Number(econ.plannedRiskPct || 0),
      tradeCost: Number(econ.estimatedRoundTripCostPct || 0),
      qualified: true,
    };
  }, []);

  const loadRadar = useCallback(async () => {
    setIsHunting(true);
    setRadarError(null);
    try {
      const query = new URLSearchParams({
        mode: filterMode === 'btc' ? 'btc' : 'all',
        limit: filterMode === 'btc' ? '1' : '5',
        force: '1',
      });
      const res = await fetch('/api/trade-radar?' + query.toString(), { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data?.ok || !Array.isArray(data.candidates)) {
        throw new Error(data?.error || 'Trade Radar unavailable');
      }
      const qualifiedRows = data.candidates;
      const btcWatchRows = filterMode === 'btc' && qualifiedRows.length === 0 && Array.isArray(data.trackedCandidates)
        ? data.trackedCandidates.filter((row: any) => String(row?.asset || '').toUpperCase() === 'BTC').slice(0, 1)
        : [];
      const sourceRows = qualifiedRows.length ? qualifiedRows : btcWatchRows;
      const mapped = sourceRows.map((candidate: any, index: number) => ({
        ...mapCandidate(candidate, index),
        qualified: qualifiedRows.includes(candidate),
      }));
      setSetups(mapped);
      setSelectedSetupId((current) => mapped.some((s: SetupCandidate) => s.id === current) ? current : (mapped[0]?.id || ''));
      setRadarMeta({
        scanned: Number(data.scannedMarkets || data.requestedUniverse || 0),
        deepAnalyzed: Number(data.deepAnalyzed || mapped.length || 0),
        source: String(data.source || data.marketDataSources?.[0] || 'AURELIS'),
      });
    } catch (error: any) {
      setSetups([]);
      setSelectedSetupId('');
      setRadarError(error?.message || 'Trade Radar unavailable');
    } finally {
      setIsHunting(false);
    }
  }, [mapCandidate, soundEnabled, filterMode]);

  useEffect(() => {
    loadRadar();
    const timer = window.setInterval(loadRadar, 30000);
    return () => window.clearInterval(timer);
  }, [loadRadar]);

  const activeSetup = useMemo(() => {
    return setups.find((s) => s.id === selectedSetupId) || setups[0] || null;
  }, [selectedSetupId, setups]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!activeSetup?.symbol) return;
      try {
        const response = await fetch('/api/kraken/margin-info/' + encodeURIComponent(activeSetup.symbol), { cache: 'no-store' });
        const data = await response.json();
        if (!active || !response.ok || !data?.ok) return;
        const allowed = (activeSetup.direction === 'SHORT' ? data.sell : data.buy)
          .map(Number)
          .filter((x: number) => Number.isFinite(x) && x > 0);
        setSupportedLeverage(allowed);
        if (allowed.length && !allowed.includes(Number(positionLeverage))) setPositionLeverage(String(allowed[0]));
      } catch {}
    };
    load();
    return () => { active = false; };
  }, [activeSetup?.symbol, activeSetup?.direction]);

  const sizing = useMemo(() => {
    if (!activeSetup) return null;
    const position = Number(positionAmount);
    const leverage = Number(positionLeverage);
    if (!(position > 0) || !(leverage > 0) || !(activeSetup.entry > 0) || !(activeSetup.stop > 0) || !(activeSetup.target > 0)) return null;
    const stopPct = Math.abs(activeSetup.entry - activeSetup.stop) / activeSetup.entry;
    const targetPct = Math.abs(activeSetup.target - activeSetup.entry) / activeSetup.entry;
    const loss = position * stopPct;
    const gain = position * targetPct;
    return { position, leverage, margin: position / leverage, loss, gain, stopPct: stopPct * 100, targetPct: targetPct * 100, rr: loss > 0 ? gain / loss : 0 };
  }, [activeSetup, positionAmount, positionLeverage]);

  const handleHunt = () => {
    if (soundEnabled) playHudSound('switch');
    loadRadar();
  };

  if (!activeSetup) {
    return (
      <div className="space-y-3 font-mono select-none text-text-primary text-xs">
        <div className="p-4 rounded-xl bg-surface-panel/95 border border-white/10">
          <div className="flex items-center gap-2">
            <Radar className={`w-4 h-4 text-cyan-400 ${isHunting ? 'animate-pulse' : ''}`} />
            <strong>{isHunting ? 'Scanning live crypto markets…' : 'No live setup available'}</strong>
          </div>
          {radarError && <div className="mt-2 text-status-error text-[11px]">{radarError}</div>}
          {!isHunting && (
            <button type="button" onClick={handleHunt} className="mt-3 px-3 py-1.5 rounded-full bg-cyan-400 text-black font-bold cursor-pointer">
              Retry scan
            </button>
          )}
        </div>
      </div>
    );
  }

  const handleCopyReport = () => {
    if (soundEnabled) playHudSound('click');
    const text = `🎯 AURELIS TRADE RADAR SETUP: ${activeSetup.symbol} (${activeSetup.direction})
Score: ${activeSetup.score}/100
Entry: $${activeSetup.entry} | Stop: $${formatPrice(activeSetup.stop)} | Target: $${formatPrice(activeSetup.target)} | Net R:R: ${activeSetup.netRr}
Aegis Risk: ${activeSetup.aegis} | Forge Trend: ${activeSetup.forge}
Commentary: ${activeSetup.commentary}`;
    navigator.clipboard.writeText(text);
    setCopiedNote(true);
    setTimeout(() => setCopiedNote(false), 2000);
  };

  return (
    <div className="space-y-4 font-mono select-none text-text-primary text-xs">
      {/* 1. Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl bg-surface-panel/95 border border-white/10 shadow-lg">
        <div>
          <div className="text-[10px] text-primary-container font-bold uppercase tracking-wider mb-0.5">
            AURELIS TRADE RADAR
          </div>
          <h1 className="text-lg sm:text-2xl font-headline font-bold text-text-primary">
            Find the setups worth looking at.
          </h1>
          <p className="text-[11px] text-text-muted font-sans mt-0.5 max-w-2xl">
            AURELIS scans live crypto markets, filters payoff, and sizes risk.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
          <div className="flex rounded-full bg-surface-base border border-white/10 p-0.5">
            <button
              type="button"
              onClick={() => {
                if (soundEnabled) playHudSound('click');
                setFilterMode('all');
              }}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-primary-container text-on-primary-container shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Top 200
            </button>
            <button
              type="button"
              onClick={() => {
                if (soundEnabled) playHudSound('click');
                setFilterMode('btc');
              }}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                filterMode === 'btc'
                  ? 'bg-primary-container text-on-primary-container shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Bitcoin
            </button>
          </div>

          <button
            type="button"
            onClick={handleHunt}
            className="px-4 py-1.5 rounded-full bg-cyan-400 hover:bg-cyan-300 text-black font-bold text-xs shadow-[0_0_12px_rgba(0,210,255,0.35)] transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Crosshair className={`w-3.5 h-3.5 ${isHunting ? 'animate-spin' : ''}`} />
            <span>{isHunting ? 'Scanning…' : 'Hunt'}</span>
          </button>
        </div>
      </div>

      {/* 2. Status Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 px-3.5 rounded-lg bg-surface-base border border-white/5 text-[10.5px]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-cyan-400 font-bold">● LIVE</span>
          <span className="text-text-secondary">{radarMeta.scanned} scanned · {radarMeta.deepAnalyzed} deep analyzed · {radarMeta.source}</span>
        </div>
        <span className="text-text-muted font-mono">
          Forge · Pulse · Scope Consensus · Atlas · Aegis
        </span>
      </div>

      {/* 3. Candidate Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-surface-panel/95 border border-white/10 shadow-xl space-y-4">
        {/* Top Header of Candidate */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-3 border-b border-white/10">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-2xl sm:text-3xl font-headline font-bold text-text-primary tracking-tight">
                {activeSetup.symbol}
              </span>
              <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-400 font-bold text-[10px] border border-cyan-500/30">
                {activeSetup.direction}
              </span>
              {activeSetup.isFresh && (
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold text-[10px] border border-emerald-500/30">
                  FRESH
                </span>
              )}
              <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold text-[10px] border border-amber-500/30">
                {activeSetup.payoff}
              </span>
            </div>

            <div className="inline-flex px-2 py-0.5 rounded bg-cyan-400/10 border border-cyan-400/30 text-cyan-300 font-bold text-[9.5px]">
              CURRENT SETUP
            </div>

            <p className="text-[11.5px] text-text-secondary font-sans leading-relaxed max-w-xl">
              {activeSetup.commentary}
            </p>
          </div>

          {/* Right: Score / 100 & Radar bars */}
          <div className="flex flex-col sm:items-end gap-2 w-full sm:w-72 shrink-0">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl sm:text-4xl font-headline font-bold text-text-primary">
                {activeSetup.score}
              </span>
              <span className="text-text-muted text-xs">/100</span>
            </div>

            {/* Micro radar progress bars */}
            <div className="w-full space-y-1.5 text-[10px]">
              {[
                { label: 'Forge / Trend', val: activeSetup.forge },
                { label: 'Pulse / Liquidity', val: activeSetup.pulse },
                { label: 'Scope Consensus', val: activeSetup.scope },
                { label: 'Atlas / Positioning', val: activeSetup.atlas },
                { label: 'Aegis / Risk', val: activeSetup.aegis },
              ].map((bar) => (
                <div key={bar.label} className="flex items-center justify-between gap-2">
                  <span className="text-text-muted whitespace-nowrap">{bar.label}</span>
                  <div className="flex items-center gap-2 flex-1 max-w-[120px]">
                    <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-cyan-400 h-full rounded-full transition-all duration-300"
                        style={{ width: `${bar.val}%` }}
                      />
                    </div>
                    <span className="text-text-primary font-bold text-[10px] w-6 text-right">
                      {bar.val}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  if (soundEnabled) playHudSound('click');
                  setShowWhyModal(true);
                }}
                className="px-3 py-1.5 rounded-full bg-surface-base border border-white/10 text-text-secondary hover:text-text-primary text-[10.5px] font-bold cursor-pointer transition-colors"
              >
                Why this?
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!activeSetup.qualified) return;
                  if (soundEnabled) playHudSound('trade');
                  setShowOrderModal(true);
                }}
                disabled={!activeSetup.qualified}
                className={`px-3.5 py-1.5 rounded-full font-bold text-[10.5px] transition-all ${
                  activeSetup.qualified
                    ? 'bg-cyan-400 hover:bg-cyan-300 text-black shadow-[0_0_10px_rgba(0,210,255,0.3)] cursor-pointer'
                    : 'bg-white/5 text-text-muted border border-white/10 cursor-not-allowed'
                }`}
              >
                {activeSetup.qualified ? 'Review in Hunter' : 'No trade'}
              </button>
            </div>
          </div>
        </div>

        {/* Middle: Entry, Stop, Target, Net R:R */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-xl bg-surface-base/80 border border-white/5">
          <div>
            <span className="text-[9px] text-text-muted uppercase block">ENTRY</span>
            <strong className="text-sm font-bold text-text-primary">${activeSetup.entry}</strong>
          </div>
          <div>
            <span className="text-[9px] text-text-muted uppercase block">STOP</span>
            <strong className="text-sm font-bold text-status-error">${formatPrice(activeSetup.stop)}</strong>
          </div>
          <div>
            <span className="text-[9px] text-text-muted uppercase block">TARGET</span>
            <strong className="text-sm font-bold text-primary-container">${formatPrice(activeSetup.target)}</strong>
          </div>
          <div>
            <span className="text-[9px] text-text-muted uppercase block">NET R:R</span>
            <strong className="text-sm font-bold text-cyan-300">{activeSetup.netRr}</strong>
          </div>
        </div>

        {/* Step-by-Step Decision Notes Table */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[9px] text-text-muted font-bold uppercase tracking-wider pb-1">
            <span>AURELIS DECISION NOTES</span>
            <span>STEP-BY-STEP</span>
          </div>

          <div className="divide-y divide-white/5 bg-surface-base rounded-xl border border-white/5 p-2 text-[10.5px]">
            {activeSetup.notes.map((note) => (
              <div key={note.step} className="py-1.5 px-2 flex items-baseline gap-3">
                <span className="text-cyan-400 font-bold shrink-0">{note.step}</span>
                <span className="text-text-muted font-bold w-20 shrink-0">{note.agent}</span>
                <span className="text-text-secondary font-sans leading-relaxed">{note.detail}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sizing Footer Bar */}
        <div className="p-3 rounded-xl bg-surface-base border border-white/5 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <label className="text-[9px] text-text-muted">POSITION USD
              <input value={positionAmount} onChange={(e) => setPositionAmount(e.target.value)} inputMode="decimal" className="mt-1 w-full p-2 rounded-lg bg-surface-panel border border-white/10 text-text-primary" />
            </label>
            <label className="text-[9px] text-text-muted">LEVERAGE
              <select value={positionLeverage} onChange={(e) => setPositionLeverage(e.target.value)} className="mt-1 w-full p-2 rounded-lg bg-surface-panel border border-white/10 text-text-primary">
                {(supportedLeverage.length ? supportedLeverage : [2,3,4,5]).map((x) => <option key={x} value={String(x)}>{x}x</option>)}
              </select>
            </label>
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20"><div className="text-[8px] text-text-muted uppercase">Est. Margin</div><div className="text-[11px] font-bold text-cyan-300 mt-1">{sizing ? formatCurrency(sizing.margin) : '—'}</div></div>
          </div>
          {sizing && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div><span className="text-[8px] text-text-muted uppercase block">Lose at Stop</span><strong className="text-status-error">-{formatCurrency(sizing.loss)} · {sizing.stopPct.toFixed(2)}%</strong></div>
              <div><span className="text-[8px] text-text-muted uppercase block">Make at Target</span><strong className="text-primary-container">+{formatCurrency(sizing.gain)} · {sizing.targetPct.toFixed(2)}%</strong></div>
              <div><span className="text-[8px] text-text-muted uppercase block">Risk / Reward</span><strong className="text-cyan-300">1 : {sizing.rr.toFixed(2)}</strong></div>
              <div><span className="text-[8px] text-text-muted uppercase block">Round-trip Cost</span><strong className="text-text-secondary">{activeSetup.tradeCost.toFixed(4)}%</strong></div>
            </div>
          )}
          <div className="flex justify-end">
          <button
            type="button"
            onClick={handleCopyReport}
            className="text-[10px] text-text-muted hover:text-text-primary flex items-center gap-1 self-start sm:self-auto cursor-pointer"
          >
            {copiedNote ? <Check className="w-3 h-3 text-primary-container" /> : <Copy className="w-3 h-3" />}
            <span>{copiedNote ? 'Setup Copied' : 'Copy Setup'}</span>
          </button>
          </div>
        </div>
      </div>

      {/* 4. Ranked Setups Table */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-surface-panel/95 border border-white/10 shadow-xl space-y-2">
        <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs">
          <strong className="font-headline font-bold text-text-primary">Ranked setups</strong>
          <span className="text-[9.5px] text-text-muted uppercase tracking-wider">
            SCOPE / KRAKEN PUBLIC
          </span>
        </div>

        <div className="space-y-1">
          {setups.map((setup) => {
            const isSelected = setup.id === selectedSetupId;
            return (
              <div
                key={setup.id}
                onClick={() => {
                  if (soundEnabled) playHudSound('click');
                  setSelectedSetupId(setup.id);
                }}
                className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-cyan-500 text-black border-cyan-400 shadow-[0_0_15px_rgba(0,210,255,0.4)]'
                    : 'bg-surface-base/80 hover:bg-white/5 border-white/5 text-text-primary'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-bold ${isSelected ? 'text-black' : 'text-text-muted'}`}>
                    {setup.rank}
                  </span>
                  <span className={`font-headline font-bold text-sm ${isSelected ? 'text-black' : 'text-text-primary'}`}>
                    {setup.symbol}
                  </span>
                  {setup.direction === 'SHORT' && (
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                      isSelected ? 'bg-black text-rose-300' : 'bg-rose-500/20 text-rose-400'
                    }`}>
                      SHORT
                    </span>
                  )}
                  {setup.direction === 'LONG' && !isSelected && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500/15 text-cyan-400">
                      LONG
                    </span>
                  )}
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                    isSelected ? 'bg-black/20 text-black' : 'text-text-muted'
                  }`}>
                    WATCH
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  <span className={`hidden sm:inline text-[10.5px] font-mono ${
                    isSelected ? 'text-black font-semibold' : 'text-text-muted'
                  }`}>
                    {setup.indicators}
                  </span>
                  <span className={`text-base font-bold font-headline ${
                    isSelected ? 'text-black' : 'text-cyan-400'
                  }`}>
                    {setup.score}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* WHY THIS MODAL */}
      {showWhyModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 select-none"
          onClick={() => setShowWhyModal(false)}
        >
          <div
            className="w-full max-w-md bg-surface-panel rounded-2xl border border-white/10 p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="font-headline font-bold text-sm text-text-primary">
                Aurelis Hunter Analysis · {activeSetup.symbol}
              </h3>
              <button
                type="button"
                onClick={() => setShowWhyModal(false)}
                className="text-text-muted hover:text-text-primary cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-text-secondary font-sans leading-relaxed">
              {activeSetup.commentary}
            </p>
            <div className="p-3 bg-surface-base rounded-xl border border-white/5 space-y-2 text-[10.5px]">
              <div><strong>Forge Trend:</strong> {activeSetup.forge}/100</div>
              <div><strong>Pulse Liquidity:</strong> {activeSetup.pulse}/100</div>
              <div><strong>Aegis Risk:</strong> {activeSetup.aegis}/100</div>
              <div><strong>Calculated Net R:R:</strong> {activeSetup.netRr}:1</div>
            </div>
            <button
              type="button"
              onClick={() => setShowWhyModal(false)}
              className="w-full py-2 rounded-xl bg-surface-base border border-white/10 font-bold text-xs cursor-pointer hover:bg-white/10"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* RESEARCH HANDOFF MODAL, NO ORDER SENT */}
      {showOrderModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 select-none"
          onClick={() => setShowOrderModal(false)}
        >
          <div
            className="w-full max-w-md bg-surface-panel rounded-2xl border border-white/10 p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="font-headline font-bold text-sm text-text-primary">
                Review Trade Preflight
              </h3>
              <button
                type="button"
                onClick={() => setShowOrderModal(false)}
                className="text-text-muted hover:text-text-primary cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-surface-base rounded-xl border border-white/5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-text-muted">Symbol:</span>
                <strong>{activeSetup.symbol}/USD ({activeSetup.direction})</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Entry:</span>
                <strong>${activeSetup.entry}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Stop Loss:</span>
                <strong className="text-status-error">${formatPrice(activeSetup.stop)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Take Profit:</span>
                <strong className="text-primary-container">${formatPrice(activeSetup.target)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Position:</span>
                <strong>{formatCurrency(Number(positionAmount) || 0)} @ {positionLeverage}x</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Est. Margin:</span>
                <strong>{sizing ? formatCurrency(sizing.margin) : '—'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Lose at Stop:</span>
                <strong className="text-status-error">{sizing ? '-' + formatCurrency(sizing.loss) : '—'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Make at Target:</span>
                <strong className="text-primary-container">{sizing ? '+' + formatCurrency(sizing.gain) : '—'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Risk / Reward:</span>
                <strong>{sizing ? '1 : ' + sizing.rr.toFixed(2) : '—'}</strong>
              </div>
            </div>

            <p className="text-[10px] text-amber-400">This sends a research setup to Hunter for review. No exchange order is placed.</p>
            <button
              type="button"
              onClick={() => {
                if (soundEnabled) playHudSound('trade');
                if (onPlaceTrade) onPlaceTrade({ ...activeSetup, margin: Number(positionAmount) || 10, leverage: Number(positionLeverage) || 2 });
                setShowOrderModal(false);
              }}
              className="w-full py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-bold text-xs shadow-[0_0_12px_rgba(0,210,255,0.35)] cursor-pointer"
            >
              Send Setup to Hunter
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

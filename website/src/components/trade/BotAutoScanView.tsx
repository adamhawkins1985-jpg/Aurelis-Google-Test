import React, { useEffect, useState } from 'react';
import { Pause, Play, RefreshCw, ShieldCheck } from 'lucide-react';
import type { SetupCandidate } from './TradeRadarView';

type Step = 'scanning' | 'analyzing' | 'waiting' | 'unavailable' | 'paused';
interface CandidateRow {
  asset: string;
  direction: 'LONG' | 'SHORT';
  score: number;
  result: string;
}
interface ScannerSummary {
  scanned: number;
  deep: number;
  source: string;
}
interface Props {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onBetReady: (setup: SetupCandidate) => void;
}

const positive = (v: unknown) => Number.isFinite(Number(v)) && Number(v) > 0;
const fmtError = (message: string) => message.slice(0, 180);

export const BotAutoScanView: React.FC<Props> = ({ enabled, onEnabledChange, onBetReady }) => {
  const [step, setStep] = useState<Step>(enabled ? 'scanning' : 'paused');
  const [activity, setActivity] = useState('Waiting for the next Kraken scan');
  const [meta, setMeta] = useState<ScannerSummary>({ scanned: 0, deep: 0, source: 'Kraken Spot/Margin' });
  const [checks, setChecks] = useState<CandidateRow[]>([]);
  const [scanNonce, setScanNonce] = useState(0);
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStep('paused');
      setActivity('Scanner paused. Resume when you want another bet.');
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();

    const run = async () => {
      if (!active) return;
      setStep('scanning');
      setActivity('Searching for qualified Kraken setups…');
      setChecks([]);
      try {
        const scan = await fetch('/api/trade-radar?mode=all&limit=5&force=1', {
          cache: 'no-store', signal: controller.signal, credentials: 'same-origin',
        });
        const result = await scan.json();
        if (!scan.ok || result?.ok !== true || !Array.isArray(result.candidates)) {
          throw new Error(result?.error || 'Radar scan unavailable');
        }
        if (!active) return;
        const candidates = result.candidates.slice(0, 5);
        setLastScanAt(Date.now());
        setMeta({
          scanned: Number(result.scannedMarkets || 0),
          deep: Number(result.deepAnalyzed || 0),
          source: String(result.source || 'KRAKEN'),
        });
        if (!candidates.length) {
          setStep('waiting');
          setActivity('No qualified setups right now. Checking again automatically.');
          return;
        }

        const evaluated: CandidateRow[] = [];
        for (const row of candidates) {
          if (!active) return;
          const asset = String(row?.asset || '').toUpperCase();
          const direction: 'LONG' | 'SHORT' = row?.direction === 'SHORT' ? 'SHORT' : 'LONG';
          const entry = Number(row?.entry);
          const stop = Number(row?.invalidation ?? row?.economics?.stop);
          const target = Number(row?.target ?? row?.economics?.target);
          const score = Number(row?.score || 0);
          const stamp = Number(row?.ts_ms || 0);
          const allowed = (direction === 'LONG' ? row?.kraken?.leverageBuy : row?.kraken?.leverageSell) || [];
          const supported = (Array.isArray(allowed) ? allowed : []).map(Number)
            .filter((n: number) => Number.isInteger(n) && n >= 1 && n <= 2);
          const leverage = supported.includes(2) ? 2 : supported.includes(1) ? 1 : 0;
          const originalValid = direction === 'LONG'
            ? stop < entry && entry < target : target < entry && entry < stop;
          const riskPct = positive(entry) ? Math.abs(entry - stop) / entry * 100 : Infinity;
          const valid = /^[A-Z0-9]{2,15}$/.test(asset) &&
            [entry, stop, target].every(positive) && originalValid &&
            riskPct > 0 && riskPct <= 5 && leverage > 0 &&
            stamp > 0 && Date.now() - stamp < 5 * 60_000;

          if (!valid) {
            evaluated.push({ asset, direction, score, result: 'Risk, venue, or signal freshness check failed' });
            setChecks([...evaluated]);
            continue;
          }
          setStep('analyzing');
          setActivity('Checking ' + asset + ' ' + direction + ' with Kraken…');
          try {
            const query = new URLSearchParams({
              direction, entry: String(entry), stop: String(stop),
              target: String(target), leverage: String(leverage),
            });
            // Identical read-only venue/risk gate used by Hunter. No signed order calls.
            const url = '/api/bots/kraken-margin-handoff/' + encodeURIComponent(asset) + '?' + query;
            const check = await fetch(url, {
              cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
            });
            const verdict = await check.json();
            if (!active) return;
            if (!check.ok || verdict?.ok !== true || verdict?.compatible !== true) {
              evaluated.push({
                asset, direction, score,
                result: check.ok ? 'Not eligible on Kraken right now' : 'Kraken validation unavailable',
              });
              setChecks([...evaluated]);
              continue;
            }
            const quote = Number(verdict.executableQuote);
            const freshCheckedAt = Number(verdict.checkedAt);
            if (!positive(quote) || !freshCheckedAt || Date.now() - freshCheckedAt > 15_000) {
              evaluated.push({ asset, direction, score, result: 'Executable price is not fresh' });
              setChecks([...evaluated]);
              continue;
            }
            // Only a freshly checked market-compatible setup reaches human Live Bet review.
            // Live Bet still performs its own authenticated prepare and validate-only steps.
            const economics = row?.economics || {};
            const agents = row?.agents || {};
            const rr = Number(economics.netRewardRisk || 0);
            const setup: SetupCandidate = {
              id: String(row?.asset).toLowerCase(), rank: '01',
              symbol: asset, name: asset, direction, isFresh: true,
              payoff: rr >= 2 ? 'HIGH PAYOFF' : rr >= 1.2 ? 'FAIR PAYOFF' : 'CAUTION',
              score, indicators: 'Verified Kraken BTNL Spot/Margin market',
              commentary: 'Auto-scanned and checked at the exchange. Final order review is required.',
              entry, stop, target, netRr: rr,
              forge: Number(agents.structure || 0), pulse: Number(agents.flow || 0),
              scope: score, atlas: Number(agents.history || 0),
              aegis: Number(agents.risk || 0), notes: [],
              margin: 10, leverage, targetNet: Number(economics.expectedNetRewardPct || 0),
              stopLoss: Number(economics.plannedRiskPct || 0),
              tradeCost: Number(economics.estimatedRoundTripCostPct || 0), qualified: true,
            };
            setChecks([...evaluated, { asset, direction, score, result: 'Passed. Sent to Live Bet.' }]);
            setActivity(asset + ' ' + direction + ' passed. Opening your review.');
            // Parent pauses further scans before navigating. Never submit a real order here.
            onBetReady(setup);
            return;
          } catch (error: any) {
            if (!active || controller.signal.aborted) return;
            evaluated.push({ asset, direction, score, result: 'Kraken check unavailable' });
            setChecks([...evaluated]);
          }
        }
        setStep('waiting');
        setActivity('No executable $10 setup passed. Rescanning automatically.');
      } catch (error: any) {
        if (!active || controller.signal.aborted) return;
        setStep('unavailable');
        setActivity(fmtError(error?.message || 'Scanner unavailable. Automatic retry scheduled.'));
      } finally {
        if (active) timer = setTimeout(() => { void run(); }, 30_000);
      }
    };
    void run();
    return () => {
      active = false;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [enabled, scanNonce, onBetReady]);

  return (
    <div className="space-y-3 font-mono text-xs text-text-primary">
      <div className="rounded-2xl border border-white/10 bg-surface-panel p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-primary-container">AURELIS AUTO SCAN</div>
            <h2 className="text-lg font-headline font-bold mt-1">Find a bet → Check it → Live Bet</h2>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => {
              if (!enabled) onEnabledChange(true);
              else setScanNonce((n) => n + 1);
            }} className="rounded-lg px-3 py-2 bg-primary-container text-on-primary-container font-bold inline-flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5"/> {enabled ? 'Scan now' : 'Resume scan'}
            </button>
            {enabled && <button type="button" onClick={() => onEnabledChange(false)}
              className="rounded-lg px-3 py-2 border border-white/15 bg-surface-base inline-flex items-center gap-1.5">
              <Pause className="h-3.5 w-3.5"/> Pause
            </button>}
          </div>
        </div>
        <div role="status" aria-live="polite" className="rounded-xl bg-surface-base border border-white/10 p-3">
          <div className="flex items-center gap-2 font-bold">
            {step === 'scanning' || step === 'analyzing'
              ? <RefreshCw className="h-4 w-4 text-primary-container animate-spin" />
              : step === 'paused' ? <Play className="h-4 w-4" />
              : <ShieldCheck className="h-4 w-4 text-primary-container" />}
            {step === 'scanning' ? '1 / 3 · Searching'
              : step === 'analyzing' ? '2 / 3 · Checking the setup'
              : step === 'paused' ? 'Paused'
              : step === 'unavailable' ? 'Retrying the scan'
              : 'Waiting for a qualifying bet'}
          </div>
          <p className="text-text-secondary mt-1">{activity}</p>
          <div className="text-[10px] text-text-muted mt-2">
            {meta.scanned} scanned · {meta.deep} deep analyzed · {meta.source}
            {lastScanAt && ' · checked ' + new Date(lastScanAt).toLocaleTimeString()}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
          <div className="rounded-lg border border-white/10 bg-surface-base p-2"><strong>SCAN</strong><div className="text-text-muted">Find candidates</div></div>
          <div className="rounded-lg border border-white/10 bg-surface-base p-2"><strong>HUNTER</strong><div className="text-text-muted">Automatic check</div></div>
          <div className="rounded-lg border border-white/10 bg-surface-base p-2"><strong>LIVE BET</strong><div className="text-text-muted">You approve</div></div>
        </div>
        <div className="text-[10px] text-text-muted flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0"/>
          No automatic orders. $10 test notional, 2× maximum, exchange check and final signed approval remain.
        </div>
      </div>
      {checks.length > 0 && <details className="rounded-xl border border-white/10 bg-surface-panel p-3 text-[10px]">
        <summary className="cursor-pointer font-bold">Checked candidates ({checks.length})</summary>
        <div className="mt-2 space-y-2">
          {checks.map((row, index) => (
            <div key={row.asset + '-' + index} className="flex justify-between gap-3 border-b border-white/5 pb-1">
              <span>{row.asset} {row.direction} · {row.score.toFixed(1)}/100</span>
              <span className="text-text-muted text-right">{row.result}</span>
            </div>
          ))}
        </div>
      </details>}
    </div>
  );
};

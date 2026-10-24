import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, Activity, AlertTriangle, BarChart3, CheckCircle2, Clock3,
  Crosshair, Filter, Layers3, Pause, Play, RefreshCw, Search, ShieldCheck,
  SlidersHorizontal, TrendingDown, TrendingUp, XCircle,
} from 'lucide-react';
import type { SetupCandidate } from './TradeRadarView';
import { BetScenarioCalculator } from './BetScenarioCalculator';
import { BotQuickBetPreview } from './BotQuickBetPreview';
import { guideForOpportunity } from '../../services/botTradeGuide';
import {
  dedupeOpportunities, filterAndSortOpportunities, readOpportunity, toReviewedSetup,
  type MarketOpportunity, type OpportunityFilter, type OpportunitySort,
} from '../../services/botOpportunity';

type Step = 'scanning' | 'analyzing' | 'waiting' | 'unavailable' | 'paused';
type VenueState = 'checking' | 'ready' | 'blocked' | 'unavailable';
interface VenueCheck {
  state: VenueState;
  message: string;
  quote?: number;
  quoteType?: string;
  checkedAt?: number;
}
interface ScannerSummary {
  scanned: number;
  deep: number;
  qualified: number;
  source: string;
  generatedAt: number | null;
}
interface Props {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onBetReady: (setup: SetupCandidate) => void;
}

const positive = (v: unknown) => Number.isFinite(Number(v)) && Number(v) > 0;
const precision = (price: number) => {
  if (!(price > 0)) return '—';
  return price.toLocaleString('en-US', {
    minimumFractionDigits: price >= 100 ? 2 : price >= 1 ? 3 : price >= 0.01 ? 4 : 0,
    maximumFractionDigits: price >= 100 ? 2 : price >= 1 ? 4 : price >= 0.01 ? 6 : 12,
  });
};
const money = (amount: number | null) =>
  amount == null ? '—' : '$' + amount.toLocaleString('en-US', {maximumFractionDigits: 0, notation: amount >= 1e6 ? 'compact' : 'standard'});
const percent = (value: number | null, digits = 2) =>
  value == null ? '—' : (value > 0 ? '+' : '') + value.toFixed(digits) + '%';
const timestamp = (stamp: number | null) => stamp != null && stamp > 0 ? new Date(stamp).toLocaleTimeString([], {hour:'numeric',minute:'2-digit',second:'2-digit'}) : '—';
const classify = (row: MarketOpportunity, check: VenueCheck | undefined, now: number) => {
  if (row.localFailure) return 'research' as const;
  if (check?.state === 'ready' && check.checkedAt && now - check.checkedAt <= 15_000) return 'ready' as const;
  if (check?.state === 'checking') return 'checking' as const;
  if (check?.state === 'blocked') return 'blocked' as const;
  return 'unverified' as const;
};

async function verifyVenue(row: MarketOpportunity, signal?: AbortSignal): Promise<VenueCheck> {
  if (row.localFailure) return {state:'blocked',message:row.localFailure};
  if (!row.liveTestLeverage || Date.now() - row.timestampMs >= 5 * 60_000) {
    return {state:'blocked',message:'Signal freshness or eligible test leverage not verified'};
  }
  const params = new URLSearchParams({
    direction: row.direction,
    entry: String(row.entry), stop: String(row.stop),
    target: String(row.target), leverage: String(row.liveTestLeverage),
  });
  const url = '/api/bots/kraken-margin-handoff/' + encodeURIComponent(row.asset) + '?' + params;
  const response = await fetch(url, {cache:'no-store',credentials:'same-origin',signal});
  const verdict = await response.json();
  if (!response.ok || verdict?.ok !== true) {
    return {state:'unavailable',message:String(verdict?.message || verdict?.error || 'Kraken market check unavailable').slice(0,160)};
  }
  if (verdict?.compatible !== true) {
    return {state:'blocked',message:String(verdict?.reason || verdict?.message || 'Venue or price does not support this setup').slice(0,160)};
  }
  const quote = Number(verdict.executableQuote);
  const checkedAt = Number(verdict.checkedAt);
  if (!positive(quote) || !Number.isFinite(checkedAt) || checkedAt <= 0 || checkedAt > Date.now() + 5_000 || Date.now() - checkedAt > 15_000) {
    return {state:'unavailable',message:'Executable quote missing or stale'};
  }
  return {
    state:'ready',message:'Compatible Kraken Spot/Margin market. Final order review still required.',
    quote, quoteType: String(verdict.quoteType || 'bid/ask'), checkedAt,
  };
}

const metric = (label: string, value: string, detail: string) => (
  <div className="rounded-xl border border-white/10 bg-surface-base/75 p-3 min-w-0">
    <div className="text-[9px] font-bold uppercase tracking-wider text-text-muted">{label}</div>
    <div className="mt-1 text-xl sm:text-2xl font-headline font-bold tabular-nums text-text-primary truncate">{value}</div>
    <div className="mt-1 text-[10px] text-text-muted">{detail}</div>
  </div>
);

export const BotAutoScanView: React.FC<Props> = ({enabled, onEnabledChange, onBetReady}) => {
  const [step, setStep] = useState<Step>('scanning');
  const [activity, setActivity] = useState('Connecting to Kraken market discovery');
  const [meta, setMeta] = useState<ScannerSummary>({scanned:0,deep:0,qualified:0,source:'Kraken',generatedAt:null});
  const [opportunities, setOpportunities] = useState<MarketOpportunity[]>([]);
  const [venueChecks, setVenueChecks] = useState<Record<string,VenueCheck>>({});
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);
  const [scanNonce, setScanNonce] = useState(0);
  const [selectedId, setSelectedId] = useState<string>('');
  const [filter, setFilter] = useState<OpportunityFilter>('all');
  const [sort, setSort] = useState<OpportunitySort>('score');
  const [query, setQuery] = useState('');
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, []);

  const readyIds = useMemo(() => new Set(
    opportunities.filter(row => classify(row, venueChecks[row.id], now) === 'ready').map(row => row.id),
  ), [opportunities, venueChecks, now]);
  const listed = useMemo(() =>
    filterAndSortOpportunities(opportunities, filter, sort, query, readyIds),
    [opportunities, filter, sort, query, readyIds],
  );
  const selected = listed.find(row => row.id === selectedId) ?? listed[0] ?? null;
  const selectedCheck = selected ? venueChecks[selected.id] : undefined;
  const selectedStatus = selected ? classify(selected, selectedCheck, now) : 'unverified';
  const guidance = selected ? guideForOpportunity(selected, selectedStatus, selectedCheck?.message) : null;
  const eligibleCount = opportunities.filter(row => row.status === 'ELIGIBLE').length;
  const blockedCount = opportunities.filter(row => classify(row, venueChecks[row.id], now) === 'blocked').length;

  const freshCheckAndHandoff = useCallback(async (row: MarketOpportunity) => {
    if (reviewBusy) return;
    setReviewBusy(true);
    setReviewError('');
    try {
      if (row.localFailure) throw new Error(row.localFailure);
      // Mandatory fresh side-specific exchange check on every user handoff click.
      const check = await verifyVenue(row);
      setVenueChecks(previous => ({...previous,[row.id]:check}));
      if (check.state !== 'ready') throw new Error(check.message);
      onBetReady(toReviewedSetup(row)); // Parent pauses scans; Live Bet still requires manual order approval.
    } catch (e: any) {
      setReviewError(String(e?.message || 'Kraken could not verify this setup').slice(0,160));
    } finally {
      setReviewBusy(false);
    }
  }, [onBetReady, reviewBusy]);

  useEffect(() => {
    if (!enabled) {
      setStep('paused');
      setActivity('Monitoring paused. Your last shortlist remains visible.');
      return;
    }
    let active = true;
    let timer: number | null = null;
    const controller = new AbortController();
    const run = async () => {
      if (!active) return;
      setStep('scanning');
      setActivity('Screening Kraken market universe…');
      try {
        // All backend-qualified candidates are returned. The backend independently
        // controls market universe and deep analysis count, which are reported honestly.
        const scan = await fetch('/api/trade-radar?mode=all&limit=100&force=1', {
          cache:'no-store',signal:controller.signal,credentials:'same-origin',
        });
        const result = await scan.json();
        if (!scan.ok || result?.ok !== true || !Array.isArray(result.candidates)) {
          throw new Error(result?.error || 'Kraken market scanner unavailable');
        }
        if (!active) return;
        const candidates = result.candidates;
        const ranked = dedupeOpportunities(candidates.map((row: any) => readOpportunity(row)));
        ranked.sort((a: MarketOpportunity,b: MarketOpportunity) => b.score - a.score || b.rewardRisk - a.rewardRisk);
        setOpportunities(ranked);
        setVenueChecks({});
        setReviewError('');
        setSelectedId(current => ranked.some((row:MarketOpportunity) => row.id === current) ? current : ranked[0]?.id ?? '');
        setLastScanAt(Date.now());
        setMeta({
          scanned: Number(result.scannedMarkets || result.requestedUniverse || 0),
          deep: Number(result.deepAnalyzed || 0),
          qualified: ranked.length,
          source: String(result.source || result.marketDataSources?.[0] || 'Kraken public'),
          generatedAt: Number(result.generatedAt) > 0 ? Number(result.generatedAt) * 1000 : null,
        });
        if (!ranked.length) {
          setStep('waiting');
          setActivity('No qualified signals on this pass. Rescanning in 30 seconds.');
          return;
        }

        const eligible = ranked.filter((row: MarketOpportunity) => !row.localFailure);
        if (!eligible.length) {
          setStep('waiting');
          setActivity('Market signals found, but none passed the first live-test safeguards.');
          return;
        }
        setStep('analyzing');
        setActivity('Preflighting the highest-ranked setups against Kraken…');
        const preflightRows = eligible.slice(0, 12);
        let readySeen = false;
        // Small parallel groups reduce API bursts. This checks actual Kraken BTNL
        // quotes; it does not submit or validate an exchange order.
        for (let i = 0; i < preflightRows.length && active; i += 3) {
          const group = preflightRows.slice(i, i + 3);
          await Promise.all(group.map(async (row: MarketOpportunity) => {
            if (!active) return;
            setVenueChecks(previous => ({...previous,[row.id]:{state:'checking',message:'Checking Kraken quote…'}}));
            let check: VenueCheck;
            try {
              check = await verifyVenue(row, controller.signal);
            } catch (error:any) {
              if (controller.signal.aborted || !active) return;
              check = {state:'unavailable',message:String(error?.message || 'Venue verification unavailable').slice(0,160)};
            }
            if (!active) return;
            setVenueChecks(previous => ({...previous,[row.id]:check}));
            if (check.state === 'ready') {
              readySeen = true;
              if (autoAdvance && active) {
                active = false;
                onBetReady(toReviewedSetup(row));
              }
            }
          }));
        }
        if (!active) return;
        setStep('waiting');
        setActivity(readySeen
          ? 'Executable setups found. Select a candidate to explore or review the bet.'
          : 'Signals ranked. No preflighted setup is currently executable; another scan is scheduled.');
      } catch (error: any) {
        if (!active || controller.signal.aborted) return;
        setStep('unavailable');
        setActivity(String(error?.message || 'Scanner unavailable; retry scheduled').slice(0,160));
      } finally {
        if (active) timer = window.setTimeout(() => {void run();}, 30_000);
      }
    };
    void run();
    return () => {
      active = false;
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled, scanNonce, autoAdvance, onBetReady]);

  const verifySelected = async (row: MarketOpportunity) => {
    if (reviewBusy || row.localFailure) return;
    setReviewBusy(true);
    setReviewError('');
    setVenueChecks(previous=>({...previous,[row.id]:{state:'checking',message:'Checking Kraken now…'}}));
    try {
      const check = await verifyVenue(row);
      setVenueChecks(previous=>({...previous,[row.id]:check}));
      if (check.state !== 'ready') setReviewError(check.message);
    } catch (error:any) {
      const message = String(error?.message || 'Kraken price check failed').slice(0,160);
      setVenueChecks(previous=>({...previous,[row.id]:{state:'unavailable',message}}));
      setReviewError(message);
    } finally {
      setReviewBusy(false);
    }
  };

  const scanAgain = () => {
    if (!enabled) onEnabledChange(true);
    else setScanNonce(value => value + 1);
  };
  const inspectionCount = Object.values(venueChecks).filter(item => item.state !== 'checking').length;

  return (
    <div className="font-sans text-sm text-text-primary space-y-3">
      <section className="relative overflow-hidden rounded-2xl border border-primary-container/20 bg-gradient-to-br from-primary-container/10 via-surface-panel to-surface-panel p-4 sm:p-5">
        <div className="absolute -right-8 -top-12 h-44 w-44 rounded-full bg-primary-container/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-primary-container">
              <Crosshair className="h-4 w-4" /> AURELIS / OPPORTUNITY DESK
            </div>
            <h1 className="text-xl sm:text-2xl font-headline font-extrabold tracking-tight text-text-primary">AURELIS Bet Finder</h1>
            <p className="text-[11px] text-text-secondary leading-relaxed">
              Find a possible trade, see why it matters, and test your profit or loss in seconds.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="status" className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-surface-base px-3 py-2 text-[10px] font-bold">
              <span className={`h-2 w-2 rounded-full ${step==='unavailable'?'bg-amber-500':enabled?'bg-primary-container animate-pulse':'bg-text-muted'}`}/>
              {step==='paused'?'PAUSED':step==='unavailable'?'RETRYING':step==='analyzing'?'VERIFYING':'SCANNING'}
            </div>
            <button type="button" onClick={scanAgain}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-container px-3 py-2.5 font-bold text-on-primary-container hover:brightness-110">
              <RefreshCw className="h-4 w-4" /> {enabled?'Scan now':'Resume'}
            </button>
            {enabled && <button type="button" onClick={()=>onEnabledChange(false)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-surface-base px-3 py-2.5 font-bold text-text-primary">
              <Pause className="h-4 w-4"/> Pause
            </button>}
          </div>
        </div>


        <div className="mt-4 p-3 sm:p-4 rounded-xl border border-white/10 bg-surface-panel/85" role="status">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className={`rounded-xl p-2.5 ${readyIds.size?'bg-primary-container/15 text-primary-container':'bg-amber-500/10 text-text-primary'}`}>
              {readyIds.size
                ? <CheckCircle2 className="w-7 h-7"/>
                : <AlertTriangle className="w-7 h-7 text-amber-500"/>}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-xl font-headline font-bold">
                {readyIds.size
                  ? `${readyIds.size} ${readyIds.size===1?'bet is':'bets are'} verified for review`
                  : meta.qualified
                    ? `Found ${meta.qualified} ideas. None ready to trade yet.`
                    : step==='scanning' ? 'Searching for possible bets…' : 'No qualifying trades found yet'}
              </h2>
              <p className="text-[12px] text-text-secondary mt-1">
                {readyIds.size
                  ? 'Review the verified opportunities below. No orders have been placed.'
                  : meta.qualified
                    ? 'These are research ideas, not approved bets. Select a coin to understand the risks.'
                    : 'AURELIS will keep looking for trades that pass its checks.'}
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-secondary">
            <span><strong className="text-text-primary">{meta.scanned}</strong> markets checked</span>
            <span>·</span>
            <span><strong className="text-text-primary">{meta.deep}</strong> closely analyzed</span>
            <span>·</span>
            <span>Updated {timestamp(lastScanAt)}</span>
          </div>
        </div>
        <details className="mt-2 text-[11px] text-text-secondary">
          <summary className="cursor-pointer font-semibold hover:text-text-primary">How thorough was this scan?</summary>
          <div className="mt-2 grid grid-cols-2 lg:grid-cols-4 gap-2">
            {metric('Markets screened',String(meta.scanned),'Quick checks')}
            {metric('Deep analyzed',String(meta.deep),'Closer technical checks')}
            {metric('Ranked signals',String(meta.qualified),'Possible trade ideas')}
            {metric('Kraken verified',String(readyIds.size),'Fresh compatible quotes')}
          </div>
          <p className="mt-2">
            {activity} · {meta.source}. The backend screens more coins than it analyzes deeply;
            the score measures signal strength, not the probability of making money.
          </p>
        </details>
      </section>

      <details className="rounded-xl border border-white/10 bg-surface-panel p-3 text-[12px] text-text-secondary">
        <summary className="cursor-pointer font-semibold text-text-primary">Scanner preferences</summary>
        <label className="mt-3 flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={autoAdvance} onChange={e=>setAutoAdvance(e.target.checked)} className="h-4 w-4 accent-emerald-500"/>
          Automatically open the first exchange-verified setup in Live Bet
        </label>
        <p className="mt-2 text-[11px]">Off by default so you can compare coins. Even when enabled, placing a real order requires your separate approval.</p>
      </details>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-start">
        <section className="xl:col-span-5 rounded-2xl border border-white/10 bg-surface-panel overflow-hidden min-w-0">
          <div className="p-3 sm:p-4 border-b border-white/10 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-bold tracking-wider text-primary-container">POSSIBLE BETS</div>
                <h2 className="text-base sm:text-lg font-headline font-bold">Pick a coin to explore</h2>
              </div>
              <span className="text-[11px] text-text-muted">{opportunities.length} found · {readyIds.size} verified</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {([
                ['all','All'],['ready','Verified'],['long','Longs'],['short','Shorts'],
              ] as const).map(([value,label])=>(
                <button key={value} type="button" onClick={()=>setFilter(value)}
                  className={`rounded-lg px-3 py-1.5 text-[10px] font-bold border ${filter===value
                    ? 'border-primary-container bg-primary-container text-on-primary-container'
                    : 'border-white/10 bg-surface-base text-text-secondary hover:text-text-primary'}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <label className="flex items-center gap-2 rounded-lg bg-surface-base border border-white/10 px-2">
                <Search className="h-4 w-4 text-text-muted shrink-0"/>
                <input aria-label="Search assets" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search coin or market"
                  className="w-full bg-transparent py-2 outline-none text-text-primary min-w-0 text-[11px]"/>
              </label>
              <label className="flex items-center gap-1.5 rounded-lg bg-surface-base border border-white/10 px-2">
                <SlidersHorizontal className="h-3.5 w-3.5 text-text-muted"/>
                <select aria-label="Sort opportunities" value={sort} onChange={e=>setSort(e.target.value as OpportunitySort)}
                  className="bg-transparent text-[11px] text-text-primary py-2">
                  <option value="score">Score</option>
                  <option value="rewardRisk">R:R</option>
                  <option value="volume">Volume</option>
                </select>
              </label>
            </div>
          </div>

          <div className="max-h-[760px] overflow-y-auto divide-y divide-white/5" role="list" aria-label="Ranked market opportunities">
            {listed.map((row,index)=>{
              const checked = venueChecks[row.id];
              const state = classify(row,checked,now);
              const active = selected?.id===row.id;
              return <button type="button" role="listitem" key={row.id} onClick={()=>{setSelectedId(row.id);setReviewError('')}}
                className={`w-full text-left px-3 sm:px-4 py-3 transition-colors border-l-[3px] ${active
                  ? 'border-primary-container bg-primary-container/10'
                  : 'border-transparent hover:bg-surface-base/80'}`}>
                <div className="flex justify-between items-center gap-2">
                  <div className="flex gap-2 items-center min-w-0">
                    <span className="text-[11px] text-text-muted tabular-nums w-5">{index+1}.</span>
                    <div>
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-lg font-headline font-bold text-text-primary">{row.asset}</span>
                        <span className={`text-[11px] font-semibold ${row.direction==='LONG'?'text-primary-container':'text-rose-500'}`}>
                          {row.direction==='LONG'?'Possible rise':'Possible fall'}
                        </span>
                      </div>
                      <p className="text-[11px] text-text-secondary mt-1">
                        {row.direction==='LONG'?'Bet on price going up':'Bet on price going down'}
                      </p>
                    </div>
                  </div>
                  <div className={`text-right shrink-0 text-[11px] font-bold ${state==='ready'?'text-primary-container':state==='blocked'?'text-rose-500':'text-text-muted'}`}>
                    {state==='ready'?'Ready to review':state==='checking'?'Checking…':state==='blocked'?'Not eligible':'Research only'}
                  </div>
                </div>
              </button>;
            })}
            {!listed.length && <div className="py-12 px-5 text-center space-y-2">
              <Filter className="h-7 w-7 text-text-muted mx-auto"/>
              <div className="font-bold text-text-primary">{step==='scanning'?'Loading market signals…':'No matching opportunities'}</div>
              <p className="text-[11px] text-text-muted">Try a different filter, or rescan when markets change.</p>
            </div>}
          </div>
          {opportunities.length>12 && <div className="p-3 border-t border-white/10 text-[10px] text-text-muted">
            Top 12 locally eligible signals receive automatic Kraken preflight. Others can be verified when you choose them.
          </div>}
        </section>

        <section className="xl:col-span-7 rounded-2xl border border-white/10 bg-surface-panel min-w-0 overflow-hidden">
          {!selected ? (
            <div className="min-h-80 flex flex-col items-center justify-center p-6 text-center">
              <Layers3 className="w-9 h-9 text-primary-container mb-3"/>
              <strong className="text-lg">Your next setup appears here</strong>
              <p className="text-text-muted mt-2 text-[11px]">AURELIS only shows levels returned by the live scanner. No fabricated signals.</p>
            </div>
          ) : (
            <div className="p-3 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold text-text-muted">AURELIS EXPLAINS</div>
                  <h2 className="text-2xl font-headline font-bold mt-1">{selected.asset}: {selected.direction==='LONG'?'Could go up':'Could go down'}</h2>
                </div>
                <span className="text-[11px] text-text-muted">{selectedStatus==='ready'?'Exchange checked':'Not approved to trade'}</span>
              </div>
              <div className={`rounded-xl border p-3 sm:p-4 ${guidance?.verdict==='ready'
                ? 'bg-primary-container/10 border-primary-container/25'
                : 'bg-amber-500/5 border-amber-500/25'}`} role="status">
                <div className="flex items-start gap-3">
                  {guidance?.verdict==='ready'
                    ? <CheckCircle2 className="w-6 h-6 mt-0.5 shrink-0 text-primary-container"/>
                    : <AlertTriangle className="w-6 h-6 mt-0.5 shrink-0 text-amber-500"/>}
                  <div className="space-y-2">
                    <h3 className="text-lg font-headline font-bold">{guidance?.headline}</h3>
                    <p className="text-[13px] leading-relaxed text-text-primary">{guidance?.direction}</p>
                    <p className="text-[12px] leading-relaxed text-text-secondary"><strong className="text-text-primary">Why:</strong> {guidance?.signal}</p>
                    <p className="text-[12px] leading-relaxed text-text-secondary"><strong className="text-text-primary">Concern:</strong> {guidance?.caution}</p>
                    <p className="text-[12px] font-medium text-text-primary">{guidance?.action}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl bg-surface-base border border-white/10 p-3 space-y-2">
                <div className="text-[10px] text-text-secondary leading-relaxed">
                  <span className="font-bold text-text-primary">Why it matters: </span>
                  {selected.direction==='LONG'?'AURELIS sees a possible upward setup.':'AURELIS sees a possible downward setup.'}
                  {' '}Its planned move to target is {selected.targetPct.toFixed(2)}%, versus {selected.stopPct.toFixed(2)}% to the stop.
                  {selected.rewardRisk >= 2 ? ' The scanner reports a reward-to-risk ratio above 2:1.' : ' The reward-to-risk ratio requires extra scrutiny.'}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['ENTRY',selected.entry],
                    ['TAKE PROFIT',selected.target],
                    ['STOP LOSS',selected.stop],
                  ].map(([name,value])=><div key={String(name)} className="rounded-lg border border-white/10 bg-surface-panel p-2">
                    <div className="text-[8.5px] text-text-muted font-bold">{name}</div>
                    <div className="mt-1 font-bold text-[12px] sm:text-sm tabular-nums break-all">{precision(Number(value))}</div>
                  </div>)}
                </div>
                <div className="space-y-1.5">
                  <div className="h-2 rounded-full bg-surface-panel overflow-hidden flex">
                    <div className="h-full bg-rose-500/75" style={{width:(selected.stopPct/(selected.stopPct+selected.targetPct)*100)+'%'}}/>
                    <div className="h-full bg-primary-container/75 flex-1"/>
                  </div>
                  <div className="flex justify-between gap-2 text-[10px] text-text-muted">
                    <span>Stop distance {selected.stopPct.toFixed(2)}%</span>
                    <span>Target distance {selected.targetPct.toFixed(2)}%</span>
                  </div>
                </div>
              </div>

              <BotQuickBetPreview key={selected.id} opportunity={selected} />

              <details className="rounded-xl border border-white/10 bg-surface-base p-3 text-[12px] text-text-secondary">
                <summary className="cursor-pointer font-semibold text-text-primary">Why AURELIS picked this coin · Full market analysis</summary>
                <div className="mt-3 space-y-3">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-surface-base rounded-xl p-2.5 border border-white/10">
                  <div className="text-[9px] text-text-muted">Reward / risk</div>
                  <div className="font-headline font-bold text-xl mt-1">1 : {selected.rewardRisk.toFixed(2)}</div>
                </div>
                <div className="bg-surface-base rounded-xl p-2.5 border border-white/10">
                  <div className="text-[9px] text-text-muted">24h volume</div>
                  <div className="font-headline font-bold text-xl mt-1">{money(selected.volumeUsd)}</div>
                </div>
                <div className="bg-surface-base rounded-xl p-2.5 border border-white/10">
                  <div className="text-[9px] text-text-muted">Spread</div>
                  <div className="font-headline font-bold text-xl mt-1">{selected.spreadBps==null?'—':selected.spreadBps.toFixed(1)+' bp'}</div>
                </div>
                <div className="bg-surface-base rounded-xl p-2.5 border border-white/10">
                  <div className="text-[9px] text-text-muted">Market leverage</div>
                  <div className="font-headline font-bold text-lg mt-1">{selected.leverageReported.length
                    ? selected.leverageReported[0]+'–'+selected.leverageReported[selected.leverageReported.length-1]+'×' : 'Unverified'}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/10 bg-surface-base p-3">
                  <div className="inline-flex items-center gap-1.5 text-[10px] font-bold text-primary-container uppercase tracking-wide">
                    <CheckCircle2 className="w-3.5 h-3.5"/> What supports this setup
                  </div>
                  <div className="space-y-1.5 mt-2 text-[11px] text-text-secondary">
                    {selected.reasons.length ? selected.reasons.slice(0,3).map((reason,i)=><div key={i} className="flex gap-2"><span className="text-primary-container">•</span><span>{reason}</span></div>)
                    : <p>No detailed supporting reasons returned by the scanner.</p>}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-surface-base p-3">
                  <div className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-500 uppercase tracking-wide">
                    <AlertTriangle className="w-3.5 h-3.5"/> What could invalidate it
                  </div>
                  <div className="space-y-1.5 mt-2 text-[11px] text-text-secondary">
                    {selected.contradictions.length ? selected.contradictions.slice(0,3).map((reason,i)=><div key={i} className="flex gap-2"><span className="text-amber-500">•</span><span>{reason}</span></div>)
                    : <p>{selected.localFailure || 'Price could hit the stop; liquidity, spread and volatility can change before execution.'}</p>}
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-surface-base/75 p-3 border border-white/10 space-y-2">
                <div className="flex gap-2 items-center font-bold text-[11px]"><BarChart3 className="h-4 w-4 text-primary-container"/> Exchange and technical evidence</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                  {[
                    ['RSI (15m)',selected.rsi==null?'—':selected.rsi.toFixed(1)],
                    ['EMA 20',selected.ema20==null?'—':precision(selected.ema20)],
                    ['EMA 50',selected.ema50==null?'—':precision(selected.ema50)],
                    ['Recent volume',selected.volumeRatio==null?'—':selected.volumeRatio.toFixed(2)+'× normal'],
                    ['24h price change',percent(selected.change24Pct)],
                    ['Depth imbalance',selected.depthImbalance==null?'—':selected.depthImbalance.toFixed(3)],
                    ['Est. trading cost',selected.roundTripCostPct==null?'Unknown':selected.roundTripCostPct.toFixed(3)+'%'],
                    ['Kraken BTNL test',selected.liveTestLeverage==null?'Not supported':selected.liveTestLeverage+'× max'],
                  ].map(([label,value])=><div key={label} className="rounded-lg bg-surface-panel p-2">
                    <div className="text-text-muted">{label}</div>
                    <div className="font-bold text-text-primary mt-1">{value}</div>
                  </div>)}
                </div>
                <p className="text-[10px] text-text-muted">
                  Signal score is a ranking input, not a probability of profit. Futures research prices are not a Kraken US margin execution quote.
                </p>
              </div>

              <BetScenarioCalculator key={selected.id} asset={selected.asset} direction={selected.direction}
                entry={selected.entry} stop={selected.stop} target={selected.target}
                roundTripCostPct={selected.roundTripCostPct}
                signalLeverage={selected.leverageReported} />

                </div>
              </details>
              <div className="rounded-xl border border-primary-container/25 bg-primary-container/5 p-3 space-y-2">
                <div className="flex flex-wrap gap-2 items-center justify-between">
                  <div>
                    <div className="text-[14px] font-bold">What can I do now?</div>
                    <div className="text-[10px] text-text-secondary mt-1">
                      {guidance?.reason}
                    </div>
                  </div>
                  {selectedCheck?.quote && <div className="text-[10px] text-text-muted">
                    Live {selectedCheck.quoteType} {precision(selectedCheck.quote)} · {timestamp(selectedCheck.checkedAt ?? null)}
                  </div>}
                </div>
                {reviewError && <p role="alert" className="text-rose-400 text-[10px]">{reviewError}</p>}
                <button type="button" disabled={reviewBusy || Boolean(selected.localFailure)}
                  onClick={()=>selectedStatus==='ready'?void freshCheckAndHandoff(selected):void verifySelected(selected)}
                  className="w-full rounded-xl bg-primary-container p-3 font-bold text-on-primary-container flex items-center justify-center gap-2 disabled:opacity-40 hover:brightness-110">
                  {reviewBusy?<RefreshCw className="h-4 w-4 animate-spin"/>:<ArrowRight className="h-4 w-4"/>}
                  {reviewBusy?'Checking Kraken…':selectedStatus==='ready'?'Review this bet in Live Bet':'Check if Kraken can trade this bet'}
                </button>
                <div className="flex justify-between flex-wrap gap-2 text-[10px] text-text-muted">
                  <span>First, check the exchange price. If compatible, review the bet. No trade is placed here.</span>
                  <span>First real order: $10 notional max · 2× max · manual approval</span>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
      <details className="rounded-xl border border-white/10 bg-surface-panel/70 p-3 text-[10px] text-text-muted">
        <summary className="cursor-pointer font-bold">Research coverage, market restrictions and definitions</summary>
        <div className="mt-2 space-y-2 leading-relaxed">
          <p>Scanner venue: {meta.source}. Scan coverage and deep-analysis counts are reported by the backend; no artificial confidence ratings or fabricated opportunities.</p>
          <p>Preflight checks: {inspectionCount} · Compatible quotes expire after 15 seconds and must be rechecked when you choose Review. {blockedCount} candidates currently have blocked or invalid checks.</p>
          <p>Kraken market leverage is a public market capability, not a promise your account or jurisdiction may execute that leverage. The first actual test order remains $10 maximum total notional and 2× maximum, with authenticated validation and explicit consent.</p>
          <p>Profit examples exclude unknown slippage, borrowing/funding, changing spreads and liquidation. A planned stop is not a guaranteed exit or a placed stop order.</p>
        </div>
      </details>
    </div>
  );
};

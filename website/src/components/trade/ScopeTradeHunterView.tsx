import React, { useEffect, useMemo, useState } from 'react';
import { Crosshair, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { playHudSound, formatCurrency } from '../../services/marketData';
import { fetchKrakenRadar, KrakenRadarCandidate } from '../../services/krakenBots';
import type { SetupCandidate } from './TradeRadarView';

interface ScopeTradeHunterViewProps {
  soundEnabled: boolean;
  onSendToLiveBet?: (setup: SetupCandidate) => void;
}

export const ScopeTradeHunterView: React.FC<ScopeTradeHunterViewProps> = ({ soundEnabled, onSendToLiveBet }) => {
  const [candidates, setCandidates] = useState<KrakenRadarCandidate[]>([]);
  const [scanned, setScanned] = useState(0);
  const [deep, setDeep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchKrakenRadar();
      setCandidates(data.candidates);
      setScanned(data.scannedMarkets);
      setDeep(data.deepAnalyzed);
    } catch (e: any) {
      setError(e?.message || 'Kraken scan unavailable');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const best = useMemo(() => candidates[0] || null, [candidates]);
  // Only pass actual scanner-provided protective levels and a qualified LONG/SHORT.
  // This is an order REVIEW handoff, never a direct trade.
  const canReview=Boolean(best&&best.score>=79&&['LONG','SHORT'].includes(best.direction)&&
    Number(best.entry||best.price)>0&&Number(best.invalidation)>0&&Number(best.target)>0&&
    (best.direction==='LONG'
      ? Number(best.invalidation)<Number(best.entry||best.price)&&Number(best.target)>Number(best.entry||best.price)
      : Number(best.invalidation)>Number(best.entry||best.price)&&Number(best.target)<Number(best.entry||best.price)));
  const reviewTop=()=>{
    if(!best||!canReview||!onSendToLiveBet)return;
    if(soundEnabled)playHudSound('switch');
    const price=Number(best.entry||best.price);
    const stop=Number(best.invalidation);
    const target=Number(best.target);
    const stopPct=Math.abs(price-stop)/price;
    const rr=stopPct>0?(Math.abs(target-price)/price)/stopPct:0;
    const candidate:SetupCandidate={
      id:'scope-'+best.asset.toLowerCase(),rank:'01',symbol:best.asset,name:best.asset,
      direction:best.direction==='SHORT'?'SHORT':'LONG',isFresh:true,payoff:rr>=2?'HIGH PAYOFF':rr>=1.2?'FAIR PAYOFF':'CAUTION',
      score:Number(best.score),indicators:'Live Kraken scan',
      commentary:(best.reasons||[]).join(' · ')||'Scope Trade research candidate.',
      entry:price,stop,target,netRr:rr,forge:0,pulse:0,scope:Number(best.score),atlas:0,aegis:0,
      notes:[],margin:25,leverage:2,targetNet:0,stopLoss:stopPct*100,tradeCost:0,
      qualified:true
    };
    onSendToLiveBet(candidate);
  };


  return (
    <div className="space-y-4 font-mono select-none text-text-primary text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl bg-surface-panel/95 border border-white/10">
        <div>
          <div className="text-[10px] text-primary-container font-bold uppercase tracking-wider">AURELIS SCOPE TRADE</div>
          <h1 className="text-xl sm:text-2xl font-headline font-bold">Kraken Decision Desk</h1>
          <p className="text-[11px] text-text-muted font-sans mt-1">Live Kraken market scan. No static finalists.</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-container text-on-primary-container font-bold">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Scanning…' : 'Scan Kraken'}
        </button>
      </div>

      {error && <div className="p-3 rounded-xl bg-status-error/10 border border-status-error/20 text-status-error">{error}</div>}

      <div className="p-4 rounded-2xl bg-surface-panel/95 border border-white/10">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div>
            <div className="text-[9px] text-text-muted uppercase">Kraken Universe</div>
            <div className="font-bold text-sm">{scanned} scanned · {deep} deep analyzed</div>
          </div>
          <span className="px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[9px] font-bold">KRAKEN PUBLIC</span>
        </div>

        {best ? (
          <div className="mt-3 grid grid-cols-1 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-5 p-3 rounded-xl bg-surface-base border border-white/5">
              <div className="text-[9px] text-text-muted uppercase">Top Setup</div>
              <div className="flex items-center gap-2 mt-1">
                <strong className="text-lg">{best.asset}</strong>
                <span className={best.direction === 'SHORT' ? 'text-rose-400' : 'text-emerald-400'}>
                  {best.direction === 'SHORT' ? <TrendingDown className="inline w-4 h-4" /> : <TrendingUp className="inline w-4 h-4" />} {best.direction}
                </span>
              </div>
              <div className="text-[10px] text-text-secondary mt-2">Score {Number(best.score || 0).toFixed(1)} · {formatCurrency(Number(best.price || 0))}</div>
            </div>
            <div className="lg:col-span-7 grid grid-cols-3 gap-2">
              <div className="p-3 rounded-xl bg-surface-base border border-white/5"><div className="text-[8.5px] text-text-muted">ENTRY</div><div className="font-bold">{formatCurrency(Number(best.entry || best.price || 0))}</div></div>
              <div className="p-3 rounded-xl bg-surface-base border border-white/5"><div className="text-[8.5px] text-text-muted">TARGET</div><div className="font-bold text-emerald-400">{best.target ? formatCurrency(best.target) : '—'}</div></div>
              <div className="p-3 rounded-xl bg-surface-base border border-white/5"><div className="text-[8.5px] text-text-muted">STOP</div><div className="font-bold text-rose-400">{best.invalidation ? formatCurrency(best.invalidation) : '—'}</div></div>
            </div>
          </div>
        ) : !loading && <div className="mt-3 text-text-muted">No qualified Kraken setup right now.</div>}
      </div>

      <div className="rounded-xl border border-white/10 bg-surface-panel p-3 flex flex-wrap gap-3 items-center justify-between">
        <div className="text-[10px] text-text-muted">
          Scope is Kraken market research, not a broker. Qualified signals can be sent to Live Bet's
          Kraken Spot/Margin review; no futures order is submitted here.
        </div>
        <button type="button" onClick={reviewTop} disabled={!canReview || !onSendToLiveBet}
          className="rounded-lg border border-primary-container/30 bg-primary-container/15 px-3 py-2 text-primary-container font-bold disabled:opacity-40">
          REVIEW QUALIFIED SETUP IN LIVE BET
        </button>
      </div>
      <div className="p-3.5 rounded-2xl bg-surface-panel/95 border border-white/10">
        <div className="flex items-center gap-2 mb-2"><Crosshair className="w-4 h-4 text-cyan-400" /><strong>Kraken Finalists</strong></div>
        <div className="overflow-x-auto">
          <table className="w-full text-[10.5px]">
            <thead><tr className="text-text-muted border-b border-white/10"><th className="py-2 text-left">#</th><th className="text-left">Asset</th><th className="text-right">Direction</th><th className="text-right">Score</th><th className="text-right">Price</th><th className="text-right">Flow</th></tr></thead>
            <tbody>
              {candidates.slice(0, 12).map((c, i) => (
                <tr key={`${c.asset}-${i}`} className="border-b border-white/5">
                  <td className="py-2 text-text-muted">{i + 1}</td>
                  <td className="font-bold">{c.asset}</td>
                  <td className={`text-right ${c.direction === 'SHORT' ? 'text-rose-400' : 'text-emerald-400'}`}>{c.direction}</td>
                  <td className="text-right">{Number(c.score || 0).toFixed(1)}</td>
                  <td className="text-right">{formatCurrency(Number(c.price || 0))}</td>
                  <td className="text-right">{c.flow?.takerImbalance !== undefined ? Number(c.flow.takerImbalance).toFixed(3) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

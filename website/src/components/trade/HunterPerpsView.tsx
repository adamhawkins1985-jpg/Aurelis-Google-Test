import React, { useEffect, useMemo, useState } from 'react';
import { Activity, RefreshCw, ShieldCheck, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { playHudSound, formatCurrency } from '../../services/marketData';
import { fetchKrakenFutures, fetchKrakenRadar, KrakenFutureTicker, KrakenRadarCandidate } from '../../services/krakenBots';
import type { SetupCandidate } from './TradeRadarView';

interface HunterPerpsViewProps {
  soundEnabled: boolean;
  initialSetup?: SetupCandidate | null;
  onSendToLiveBet?: (setup: SetupCandidate) => void;
}

export const HunterPerpsView: React.FC<HunterPerpsViewProps> = ({ soundEnabled, initialSetup = null, onSendToLiveBet }) => {
  const [futures, setFutures] = useState<KrakenFutureTicker[]>([]);
  const [radar, setRadar] = useState<KrakenRadarCandidate[]>([]);
  const [selectedAsset, setSelectedAsset] = useState('BTC');
  const [betAmount, setBetAmount] = useState('25');
  const [leverage, setLeverage] = useState('2');
  const [supportedLeverage, setSupportedLeverage] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [f, r] = await Promise.all([fetchKrakenFutures(), fetchKrakenRadar()]);
      setFutures(f);
      setRadar(r.candidates);
      if (!f.some((x) => x.asset === selectedAsset) && f[0]?.asset) setSelectedAsset(f[0].asset);
    } catch (e: any) {
      setError(e?.message || 'Kraken data unavailable');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!initialSetup) return;
    setSelectedAsset(initialSetup.symbol.toUpperCase());
    setBetAmount(String(initialSetup.margin || 25));
    setLeverage(String(initialSetup.leverage || 2));
  }, [initialSetup]);

  const ticker = useMemo(
    () => futures.find((x) => x.asset === selectedAsset) || futures[0],
    [futures, selectedAsset]
  );
  const candidate = useMemo(
    () => radar.find((x) => x.asset?.toUpperCase() === selectedAsset.toUpperCase()),
    [radar, selectedAsset]
  );

  const matchingSetup=initialSetup?.symbol.toUpperCase()===selectedAsset.toUpperCase()?initialSetup:null;
  const bias: 'LONG' | 'SHORT' =
    matchingSetup?.direction === 'SHORT' ? 'SHORT' :
    matchingSetup?.direction === 'LONG' ? 'LONG' :
    candidate?.direction === 'SHORT' ? 'SHORT' :
    candidate?.direction === 'LONG' ? 'LONG' :
    (ticker?.change24h ?? 0) >= 0 ? 'LONG' : 'SHORT';
  useEffect(() => {
    let active = true;
    const loadMarginInfo = async () => {
      try {
        const response = await fetch('/api/kraken/margin-info/' + encodeURIComponent(selectedAsset), { cache: 'no-store' });
        const data = await response.json();
        if (!active || !response.ok || !data?.ok) return;
        const allowed = (bias === 'SHORT' ? data.sell : data.buy)
          .map(Number)
          .filter((x: number) => Number.isFinite(x) && x > 0);
        setSupportedLeverage(allowed);
        if (allowed.length && !allowed.includes(Number(leverage))) setLeverage(String(allowed[0]));
      } catch {}
    };
    loadMarginInfo();
    return () => { active = false; };
  }, [selectedAsset, bias]);

  const mark = Number(ticker?.markPrice || 0);
  const target = Number(matchingSetup?.target || candidate?.target || (bias === 'LONG' ? mark * 1.03 : mark * 0.97));
  const stop = Number(matchingSetup?.stop || candidate?.invalidation || (bias === 'LONG' ? mark * 0.985 : mark * 1.015));
  const entry = Number(matchingSetup?.entry || candidate?.entry || mark);
  const sizing = useMemo(() => {
    const position = Number(betAmount);
    const lev = Number(leverage);
    if (!(position > 0) || !(lev > 0) || !(entry > 0) || !(stop > 0) || !(target > 0)) return null;
    const stopPct = Math.abs(entry - stop) / entry;
    const targetPct = Math.abs(target - entry) / entry;
    const loss = position * stopPct;
    const gain = position * targetPct;
    return { position, margin: position / lev, loss, gain, stopPct: stopPct * 100, targetPct: targetPct * 100, rr: loss > 0 ? gain / loss : 0 };
  }, [betAmount, leverage, entry, stop, target]);

  const sendToLiveBet = () => {
    if (!matchingSetup || !onSendToLiveBet) return;
    if (soundEnabled) playHudSound('trade');
    const amount = Number(betAmount);
    const lev = Number(leverage);
    onSendToLiveBet({
      ...matchingSetup,
      symbol: selectedAsset.toUpperCase(),
      name: selectedAsset.toUpperCase(),
      direction: bias,
      entry,
      stop,
      target,
      margin: Number.isFinite(amount) && amount > 0 ? amount : matchingSetup.margin,
      leverage: Number.isFinite(lev) && lev > 0 ? lev : 1,
    });
  };

  return (
    <div className="space-y-4 font-mono select-none text-text-primary text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl bg-surface-panel/95 border border-white/10">
        <div>
          <div className="text-[10px] text-primary-container font-bold uppercase tracking-wider">AURELIS HUNTER PERPS</div>
          <h1 className="text-xl sm:text-2xl font-headline font-bold">Kraken Futures Market Hunter</h1>
          <p className="text-[11px] text-text-muted font-sans mt-1">Public Kraken perpetuals market data + Kraken Trade Radar research. Futures order API NOT connected.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">LIVE MARKET DATA</span>
          <button onClick={load} className="p-2 rounded-lg bg-surface-base border border-white/10 text-cyan-400">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && <div className="p-3 rounded-xl bg-status-error/10 border border-status-error/20 text-status-error">{error}</div>}

      {initialSetup && (
        <div className="p-3 rounded-xl bg-primary-container/10 border border-primary-container/25 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[9px] text-primary-container font-bold uppercase">Trade Radar setup copied into Hunter</div>
            <div className="text-[11px] text-text-primary mt-1">
              {initialSetup.symbol} {initialSetup.direction} · Entry {formatCurrency(entry)} · Stop {formatCurrency(stop)} · Target {formatCurrency(target)}
            </div>
          </div>
          <span className="text-[10px] font-bold text-primary-container">${betAmount} @ {leverage}x</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 p-4 rounded-2xl bg-surface-panel/95 border border-white/10 space-y-3">
          <div className="text-[10px] text-text-muted uppercase font-bold">Perpetual Market</div>
          <select value={selectedAsset} onChange={(e) => setSelectedAsset(e.target.value)} className="w-full p-2.5 rounded-xl bg-surface-base border border-white/10 text-text-primary font-bold">
            {futures.slice(0, 50).map((x) => <option key={x.symbol} value={x.asset}>{x.asset} · {x.symbol}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[9px] text-text-muted">POSITION USD
              <input value={betAmount} onChange={(e) => setBetAmount(e.target.value)} className="mt-1 w-full p-2 rounded-lg bg-surface-base border border-white/10 text-text-primary" />
            </label>
            <label className="text-[9px] text-text-muted">LEVERAGE
              <select value={leverage} onChange={(e) => setLeverage(e.target.value)} className="mt-1 w-full p-2 rounded-lg bg-surface-base border border-white/10 text-text-primary">
                {(supportedLeverage.length ? supportedLeverage.map(String) : ['2','3','4','5']).map((x) => <option key={x} value={x}>{x}x</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="lg:col-span-8 p-4 rounded-2xl bg-surface-panel/95 border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] text-text-muted">PUBLIC KRAKEN PERPETUAL QUOTE</div>
              <div className="text-xl font-headline font-bold">{selectedAsset} · {formatCurrency(mark)}</div>
            </div>
            <div className={`flex items-center gap-1 font-bold ${bias === 'LONG' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {bias === 'LONG' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {bias}
            </div>
          </div>
          {sizing && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                ['Position', formatCurrency(sizing.position)],
                ['Est. Margin', formatCurrency(sizing.margin)],
                ['Lose at Stop', '-' + formatCurrency(sizing.loss) + ' (' + sizing.stopPct.toFixed(2) + '%)'],
                ['Make at Target', '+' + formatCurrency(sizing.gain) + ' (' + sizing.targetPct.toFixed(2) + '%)'],
                ['Risk / Reward', '1 : ' + sizing.rr.toFixed(2)],
              ].map(([k,v]) => <div key={k} className="p-2.5 rounded-lg bg-surface-base border border-white/5"><div className="text-[8.5px] text-text-muted uppercase">{k}</div><div className="font-bold mt-1">{v}</div></div>)}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ['Bid', ticker?.bid ? formatCurrency(ticker.bid) : '—'],
              ['Ask', ticker?.ask ? formatCurrency(ticker.ask) : '—'],
              ['Funding', ticker ? ticker.fundingRate.toFixed(6) : '—'],
              ['Open Interest', ticker ? Number(ticker.openInterest).toLocaleString() : '—'],
              ['24h Change', ticker ? ticker.change24h.toFixed(2) + '%' : '—'],
              ['24h Volume', ticker ? '$' + Number(ticker.volumeQuote).toLocaleString(undefined,{notation:'compact',maximumFractionDigits:1}) : '—'],
              ['Entry', entry ? formatCurrency(entry) : '—'],
              ['Target', target ? formatCurrency(target) : '—'],
              ['Stop', stop ? formatCurrency(stop) : '—'],
            ].map(([k,v]) => <div key={k} className="p-2.5 rounded-lg bg-surface-base border border-white/5"><div className="text-[8.5px] text-text-muted uppercase">{k}</div><div className="font-bold mt-1">{v}</div></div>)}
          </div>
          <div className="p-3 rounded-xl bg-surface-base border border-white/5 text-[10.5px] text-text-secondary">
            <ShieldCheck className="inline w-3.5 h-3.5 text-primary-container mr-1.5" />
            Research only: public Kraken futures quotes plus Kraken Trade Radar signals. The connected account shown above is Kraken SPOT, not a funded or authorized futures account. Live Bet is a separate Spot/Margin review.
          </div>
          {matchingSetup && onSendToLiveBet && (
            <button
              type="button"
              onClick={sendToLiveBet}
              className="w-full py-2.5 rounded-xl bg-primary-container text-on-primary-container font-bold text-[11px] flex items-center justify-center gap-2 hover:brightness-110 transition-all cursor-pointer"
            >
              <span>Send to Live Bet</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="p-3.5 rounded-2xl bg-surface-panel/95 border border-white/10">
        <div className="flex items-center gap-2 mb-2"><Activity className="w-4 h-4 text-cyan-400" /><strong>Top Kraken Perpetuals</strong></div>
        <div className="overflow-x-auto">
          <table className="w-full text-[10.5px]">
            <thead><tr className="text-text-muted border-b border-white/10"><th className="py-2 text-left">Asset</th><th className="text-right">Mark</th><th className="text-right">Funding</th><th className="text-right">24h</th><th className="text-right">Volume</th></tr></thead>
            <tbody>
              {futures.slice(0, 12).map((x) => (
                <tr key={x.symbol} onClick={() => setSelectedAsset(x.asset)} className="border-b border-white/5 hover:bg-white/5 cursor-pointer">
                  <td className="py-2 font-bold">{x.asset}</td>
                  <td className="text-right">{formatCurrency(x.markPrice)}</td>
                  <td className="text-right">{x.fundingRate.toFixed(6)}</td>
                  <td className={`text-right ${x.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{x.change24h >= 0 ? '+' : ''}{x.change24h.toFixed(2)}%</td>
                  <td className="text-right">${Number(x.volumeQuote).toLocaleString(undefined,{notation:'compact',maximumFractionDigits:1})}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

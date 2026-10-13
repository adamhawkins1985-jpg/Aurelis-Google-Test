import React, { useEffect, useMemo, useState } from 'react';
import { Activity, RefreshCw, ShieldCheck, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { playHudSound, formatCurrency } from '../../services/marketData';
import { fetchKrakenFutures, fetchKrakenRadar, KrakenFutureTicker, KrakenRadarCandidate } from '../../services/krakenBots';
import type { SetupCandidate } from './TradeRadarView';

interface KrakenMarginHandoff {
  ok:boolean;compatible:boolean;code:string;reason:string;
  pair:string;executableQuote:number|null;quoteType:string;checkedAt:number;
  eligibleExecutionVenue:boolean;supportsSelectedLeverage:boolean;
}
const formatMicroPrice=(v:number)=>'$'+v.toLocaleString('en-US',{maximumFractionDigits:12});

interface HunterPerpsViewProps {
  soundEnabled: boolean;
  initialSetup?: SetupCandidate | null;
  onSendToLiveBet?: (setup: SetupCandidate) => void;
  onReturnToRadar?: () => void;
}

export const HunterPerpsView: React.FC<HunterPerpsViewProps> = ({ soundEnabled, initialSetup = null, onSendToLiveBet, onReturnToRadar }) => {
  const [futures, setFutures] = useState<KrakenFutureTicker[]>([]);
  const [radar, setRadar] = useState<KrakenRadarCandidate[]>([]);
  const [selectedAsset, setSelectedAsset] = useState('BTC');
  const [betAmount, setBetAmount] = useState('10');
  const [leverage, setLeverage] = useState('2');
  const [supportedLeverage, setSupportedLeverage] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marginHandoff,setMarginHandoff]=useState<KrakenMarginHandoff|null>(null);
  const [marginHandoffBusy,setMarginHandoffBusy]=useState(false);
  const [marginHandoffError,setMarginHandoffError]=useState('');
  const [sendingToLiveBet,setSendingToLiveBet]=useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [f, r] = await Promise.all([fetchKrakenFutures(), fetchKrakenRadar()]);
      setFutures(f);
      setRadar(r.candidates);
      // Do not switch away from Trade Radar's asset just because the asset is
      // absent from the first 50 public futures contracts. Live Bet is BTNL margin.
      // The selector must always agree with the displayed setup.
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
    // Test execution is capped to $10 notional and 2x. Hunter is not a futures order ticket.
    setBetAmount('10');
    setLeverage(String(Math.min(2,Math.max(1,Number(initialSetup.leverage)||2))));
  }, [initialSetup]);

  const ticker = useMemo(
    () => futures.find((x) => x.asset === selectedAsset) || null,
    [futures, selectedAsset]
  );
  const listedFutures=futures.slice(0,50);
  const assetListed=listedFutures.some((x)=>x.asset===selectedAsset);
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
          .map(Number).filter((x: number) => Number.isFinite(x) && x>=1 && x<=2);
        setSupportedLeverage(allowed);
        if(allowed.length && !allowed.includes(Number(leverage)))setLeverage(String(allowed[0]));
      } catch {}
    };
    loadMarginInfo();
    return () => { active = false; };
  }, [selectedAsset, bias]);

  const mark = Number(ticker?.markPrice || 0);
  const target = Number(matchingSetup?.target || candidate?.target || (bias === 'LONG' ? mark * 1.03 : mark * 0.97));
  const stop = Number(matchingSetup?.stop || candidate?.invalidation || (bias === 'LONG' ? mark * 0.985 : mark * 1.015));
  const entry = Number(matchingSetup?.entry || candidate?.entry || mark);
  // The public futures feed above is research; Live Bet executes on Kraken US BTNL margin.
  // Never send a setup solely because futures price data is available.
  const handoffQuery=matchingSetup ? new URLSearchParams({
    direction:bias,entry:String(entry),stop:String(stop),target:String(target),
    leverage:String(leverage)
  }).toString() : '';
  const handoffUrl=handoffQuery
    ? '/api/bots/kraken-margin-handoff/'+encodeURIComponent(selectedAsset)+'?'+handoffQuery
    : '';
  const checkMarginHandoff=async():Promise<KrakenMarginHandoff|null>=>{
    if(!handoffUrl)return null;
    const response=await fetch(handoffUrl,{credentials:'same-origin',cache:'no-store'});
    const data=await response.json();
    if(!response.ok||data?.ok!==true)
      throw new Error(data?.message||data?.error||'Kraken US Spot/Margin quote unavailable');
    return data as KrakenMarginHandoff;
  };
  useEffect(()=>{
    let active=true;
    if(!handoffUrl){
      setMarginHandoff(null);setMarginHandoffError('');setMarginHandoffBusy(false);
      return;
    }
    const refresh=async()=>{
      setMarginHandoffBusy(true);
      try{
        const next=await checkMarginHandoff();
        if(active){setMarginHandoff(next);setMarginHandoffError('')}
      }catch(e:any){
        if(active){setMarginHandoff(null);setMarginHandoffError(e?.message||'Margin quote unavailable')}
      }finally{if(active)setMarginHandoffBusy(false)}
    };
    setMarginHandoff(null);
    void refresh();
    const id=window.setInterval(refresh,25000);
    return ()=>{active=false;window.clearInterval(id)};
  },[handoffUrl]);
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

  const sendToLiveBet = async () => {
    if(!matchingSetup||!onSendToLiveBet||sendingToLiveBet)return;
    setSendingToLiveBet(true);
    try{
      // A fresh, side-specific Kraken margin quote is REQUIRED on every click.
      const checked=await checkMarginHandoff();
      setMarginHandoff(checked);
      if(!checked?.compatible){
        setMarginHandoffError(checked?.reason||'Kraken margin setup cannot be verified');
        return;
      }
      setMarginHandoffError('');
      if(soundEnabled)playHudSound('trade');
      onSendToLiveBet({
        ...matchingSetup,
        symbol:selectedAsset.toUpperCase(),name:selectedAsset.toUpperCase(),
        direction:bias,entry,stop,target,margin:10,leverage:Number(leverage)
      });
    }catch(error:any){
      setMarginHandoff(null);
      setMarginHandoffError(error?.message||'Kraken margin preflight failed');
    }finally{setSendingToLiveBet(false)}
  };

  return (
    <div className="space-y-4 font-mono select-none text-text-primary text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl bg-surface-panel/95 border border-white/10">
        <div>
          <div className="text-[10px] text-primary-container font-bold uppercase tracking-wider">AURELIS HUNTER PERPS</div>
          <h1 className="text-xl sm:text-2xl font-headline font-bold">Kraken Futures Market Hunter</h1>
          <p className="text-[11px] text-text-muted font-sans mt-1">Choose a bet → Check Kraken → Continue to Live Bet</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">LIVE MARKET DATA</span>
          <button onClick={load} className="p-2 rounded-lg bg-surface-base border border-white/10 text-cyan-400">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && <div className="p-3 rounded-xl bg-status-error/10 border border-status-error/20 text-status-error">{error}</div>}

      {matchingSetup && (
        <div className="p-3 rounded-xl bg-primary-container/10 border border-primary-container/25 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[9px] text-primary-container font-bold uppercase">Trade Radar setup copied into Hunter</div>
            <div className="text-[11px] text-text-primary mt-1">
              {matchingSetup.symbol} {matchingSetup.direction} · Entry {formatMicroPrice(entry)} · Stop {formatMicroPrice(stop)} · Target {formatMicroPrice(target)}
            </div>
          </div>
          <span className="text-[10px] font-bold text-primary-container">${betAmount} @ {leverage}x</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 p-4 rounded-2xl bg-surface-panel/95 border border-white/10 space-y-3">
          <div className="text-[10px] text-text-muted uppercase font-bold">Selected asset · futures research</div>
          <select value={selectedAsset} onChange={(e) => setSelectedAsset(e.target.value)}
            className="w-full p-2.5 rounded-xl bg-surface-base border border-white/10 text-text-primary font-bold">
            {!assetListed && <option value={selectedAsset}>{selectedAsset} · Selected Radar asset</option>}
            {listedFutures.map((x) => <option key={x.symbol} value={x.asset}>{x.asset} · {x.symbol}</option>)}
          </select>
          {!ticker && <div className="text-[10px] text-amber-400">
            No public Kraken perpetual quote for {selectedAsset} in this feed.
            The Kraken US Spot/Margin preflight below uses a separate BTNL market quote.
          </div>}
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[9px] text-text-muted">POSITION USD
              <input value={betAmount} readOnly title="First Kraken Spot/Margin test is fixed at $10 notional"
                className="mt-1 w-full p-2 rounded-lg bg-surface-base border border-white/10 text-text-primary" />
            </label>
            <label className="text-[9px] text-text-muted">LEVERAGE
              <select value={leverage} onChange={(e) => setLeverage(e.target.value)} className="mt-1 w-full p-2 rounded-lg bg-surface-base border border-white/10 text-text-primary">
                {(supportedLeverage.length ? supportedLeverage.map(String) : ['1','2']).map((x) => <option key={x} value={x}>{x}x</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="lg:col-span-8 p-4 rounded-2xl bg-surface-panel/95 border border-white/10 space-y-3">
          {matchingSetup && sizing && (
            <div className="p-3 rounded-xl border border-white/10 bg-surface-base flex flex-wrap gap-x-5 gap-y-2 items-center text-[10px]">
              <strong>{selectedAsset} {bias} · $10 at {leverage}×</strong>
              <span className="text-red-400">Est. loss at stop: -{formatCurrency(sizing.loss)}</span>
              <span className="text-primary-container">Est. gain at target: +{formatCurrency(sizing.gain)}</span>
              <span>R:R 1:{sizing.rr.toFixed(2)}</span>
            </div>
          )}
          <details className="rounded-xl border border-white/10 bg-surface-base/60 p-2 text-[10px]" open={!matchingSetup}>
            <summary className="cursor-pointer font-bold text-text-secondary">Futures research & market statistics (optional)</summary>
            <div className="mt-2 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] text-text-muted">PUBLIC KRAKEN PERPETUAL QUOTE (RESEARCH ONLY)</div>
              <div className="text-xl font-headline font-bold">{selectedAsset} · {ticker?formatMicroPrice(mark):'No futures quote'}</div>
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
              ['Bid', ticker?.bid ? formatMicroPrice(ticker.bid) : '—'],
              ['Ask', ticker?.ask ? formatMicroPrice(ticker.ask) : '—'],
              ['Funding', ticker ? ticker.fundingRate.toFixed(6) : '—'],
              ['Open Interest', ticker ? Number(ticker.openInterest).toLocaleString() : '—'],
              ['24h Change', ticker ? ticker.change24h.toFixed(2) + '%' : '—'],
              ['24h Volume', ticker ? '$' + Number(ticker.volumeQuote).toLocaleString(undefined,{notation:'compact',maximumFractionDigits:1}) : '—'],
              ['Entry', entry ? formatMicroPrice(entry) : '—'],
              ['Target', target ? formatMicroPrice(target) : '—'],
              ['Stop', stop ? formatMicroPrice(stop) : '—'],
            ].map(([k,v]) => <div key={k} className="p-2.5 rounded-lg bg-surface-base border border-white/5"><div className="text-[8.5px] text-text-muted uppercase">{k}</div><div className="font-bold mt-1">{v}</div></div>)}
          </div>
          <div className="p-3 rounded-xl bg-surface-base border border-white/5 text-[10.5px] text-text-secondary">
            <ShieldCheck className="inline w-3.5 h-3.5 text-primary-container mr-1.5" />
            Research only. Public futures prices are not executable Kraken Spot/Margin quotes.
          </div>
            </div>
          </details>
          {matchingSetup && onSendToLiveBet && (
            <div className="space-y-2">
              <div className="p-3 rounded-xl bg-surface-base border border-white/10 space-y-1.5 text-[10px]">
                <div className="flex items-center justify-between gap-2">
                  <strong>Kraken margin check</strong>
                  <button type="button" onClick={()=>void checkMarginHandoff().then(d=>{setMarginHandoff(d);setMarginHandoffError('')}).catch(e=>{setMarginHandoff(null);setMarginHandoffError(e?.message||'Quote unavailable')})}
                    className="rounded border border-white/10 px-2 py-1" title="Recheck Kraken margin market">
                    <RefreshCw className="w-3.5 h-3.5"/>
                  </button>
                </div>
                {marginHandoff?.executableQuote!=null&&
                  <div className="text-text-muted">{marginHandoff.pair} · {marginHandoff.quoteType} {formatMicroPrice(marginHandoff.executableQuote)} · checked {new Date(marginHandoff.checkedAt).toLocaleTimeString()}</div>}
                {marginHandoffBusy && <div className="text-text-muted">Checking Kraken's execution market…</div>}
                {!marginHandoffBusy && marginHandoff?.compatible &&
                  <div className="text-primary-container font-bold">Kraken quote fits this setup · Ready for Live Bet review</div>}
                {!marginHandoffBusy && marginHandoff&&!marginHandoff.compatible && (
                  <div role="alert" className="text-amber-400 font-bold">
                    {marginHandoff.reason.includes('at/below its stop') ? 'Price below stop · Get a new bet' :
                     marginHandoff.reason.includes('at/above its target') ? 'Price past target · Get a new bet' :
                     marginHandoff.reason.includes('at/above its stop') ? 'Price above stop · Get a new bet' :
                     marginHandoff.reason.includes('at/below its target') ? 'Price past target · Get a new bet' :
                     'Setup not available on Kraken margin'}
                  </div>
                )}
                {marginHandoffError&&<div role="alert" className="text-amber-400 font-bold">Kraken check unavailable · Retry or get a new bet</div>}
                {(marginHandoff&&!marginHandoff.compatible||marginHandoffError) && (
                  <details className="text-text-muted">
                    <summary className="cursor-pointer">Why was this bet blocked?</summary>
                    <p className="mt-2 break-words">{marginHandoffError||marginHandoff?.reason}</p>
                  </details>
                )}
                {onReturnToRadar && ((marginHandoff&&!marginHandoff.compatible)||marginHandoffError) && (
                  <button type="button" onClick={onReturnToRadar}
                    className="mt-2 w-full rounded-lg border border-white/15 bg-surface-panel px-3 py-2 text-text-primary font-bold">
                    Find a new bet
                  </button>
                )}
              </div>
              <button type="button" onClick={()=>void sendToLiveBet()}
                disabled={!marginHandoff?.compatible||marginHandoffBusy||sendingToLiveBet}
                className="w-full py-2.5 rounded-xl bg-primary-container text-on-primary-container font-bold text-[11px] flex items-center justify-center gap-2 hover:brightness-110 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                <span>{sendingToLiveBet?'Checking price…':marginHandoff?.compatible?'Continue to Live Bet':'Waiting for Kraken check'}</span>
                <ArrowRight className="w-4 h-4"/>
              </button>
            </div>
          )}
        </div>
      </div>

      <details className="p-3.5 rounded-2xl bg-surface-panel/95 border border-white/10">
        <summary className="cursor-pointer text-[10px] font-bold text-text-secondary">Explore more futures markets (optional)</summary>
        <div className="flex items-center gap-2 mb-2 mt-3"><Activity className="w-4 h-4 text-cyan-400" /><strong>Top Kraken Perpetuals</strong></div>
        <div className="overflow-x-auto">
          <table className="w-full text-[10.5px]">
            <thead><tr className="text-text-muted border-b border-white/10"><th className="py-2 text-left">Asset</th><th className="text-right">Mark</th><th className="text-right">Funding</th><th className="text-right">24h</th><th className="text-right">Volume</th></tr></thead>
            <tbody>
              {futures.slice(0, 12).map((x) => (
                <tr key={x.symbol} onClick={() => setSelectedAsset(x.asset)} className="border-b border-white/5 hover:bg-white/5 cursor-pointer">
                  <td className="py-2 font-bold">{x.asset}</td>
                  <td className="text-right">{formatMicroPrice(x.markPrice)}</td>
                  <td className="text-right">{x.fundingRate.toFixed(6)}</td>
                  <td className={`text-right ${x.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{x.change24h >= 0 ? '+' : ''}{x.change24h.toFixed(2)}%</td>
                  <td className="text-right">${Number(x.volumeQuote).toLocaleString(undefined,{notation:'compact',maximumFractionDigits:1})}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
};

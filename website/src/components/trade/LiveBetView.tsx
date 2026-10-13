import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ImagePlus, Loader2, ShieldCheck, Upload, X } from 'lucide-react';
import { formatCurrency, playHudSound } from '../../services/marketData';
import type { SetupCandidate } from './TradeRadarView';

interface LiveBetViewProps {
  soundEnabled: boolean;
  initialSetup?: SetupCandidate | null;
}

interface ParsedTrade {
  asset?: string;
  market?: string;
  symbol?: string;
  direction?: string;
  side?: string;
  entry?: number | string | null;
  current_price?: number | string | null;
  stop_loss?: number | string | null;
  stopLoss?: number | string | null;
  take_profit?: number | string | null;
  takeProfit?: number | string | null;
  leverage?: number | string | null;
}

const num = (value: any): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[$,%x,]/gi, '').trim());
  return Number.isFinite(n) ? n : null;
};

const prepareScreenshotForAnalysis = async (file: File, originalDataUrl: string): Promise<string> => {
  try {
    const bitmap = await createImageBitmap(file);
    const targetWidth = Math.min(1600, Math.max(bitmap.width, bitmap.width < 1000 ? bitmap.width * 2.5 : bitmap.width));
    const scale = targetWidth / bitmap.width;
    if (scale <= 1.05) {
      bitmap.close();
      return originalDataUrl;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      bitmap.close();
      return originalDataUrl;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/png');
  } catch {
    return originalDataUrl;
  }
};

export const LiveBetView: React.FC<LiveBetViewProps> = ({
  soundEnabled,
  initialSetup = null,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [trade, setTrade] = useState<ParsedTrade | null>(null);
  const [amount, setAmount] = useState('10');
  const [leverage, setLeverage] = useState('2');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState('Drop or choose a bet screenshot.');
  const [preview, setPreview] = useState<any | null>(null);
  const [token, setToken] = useState('');
  const [krakenValidated,setKrakenValidated]=useState(false);
  const [validationStatus,setValidationStatus]=useState('');
  const [validationExpiresAt,setValidationExpiresAt]=useState<number|null>(null);
  useEffect(()=>{
    if(validationExpiresAt==null)return;
    const remaining=validationExpiresAt-Date.now();
    if(remaining<=0){
      setKrakenValidated(false);
      setValidationStatus('Exchange validation has expired. Review and validate again. No trade placed.');
      return;
    }
    const timer=window.setTimeout(()=>{
      setKrakenValidated(false);
      setValidationStatus('Exchange validation has expired. Review and validate again. No trade placed.');
    },remaining);
    return ()=>window.clearTimeout(timer);
  },[validationExpiresAt]);
  const [submitResult, setSubmitResult] = useState<any | null>(null);
  const [submitError, setSubmitError] = useState('');
  const [krakenReviewError,setKrakenReviewError]=useState('');
  const [executionEnabled,setExecutionEnabled]=useState(false);
  const [executionCapabilityMessage,setExecutionCapabilityMessage]=useState('Checking execution safeguards…');
  useEffect(()=>{
    let active=true;
    const check=async()=>{
      try{
        const response=await fetch('/api/bots/kraken-execution-capability',{cache:'no-store',credentials:'same-origin'});
        const body=await response.json();
        if(active){
          setExecutionEnabled(Boolean(response.ok&&body?.enabled));
          setExecutionCapabilityMessage(response.ok?(body?.enabled?'Kraken Spot/Margin manual approval available':'Kraken order submission locked until exchange validation'):(body?.error||'Auth required'));
        }
      }catch{if(active){setExecutionEnabled(false);setExecutionCapabilityMessage('Execution capability cannot be verified')}}
    };
    void check();
    window.addEventListener('aurelis:wallet-authenticated',check);
    return ()=>{active=false;window.removeEventListener('aurelis:wallet-authenticated',check)};
  },[]);

  const [supportedLeverage, setSupportedLeverage] = useState<number[]>([]);
  const [liveStatus, setLiveStatus] = useState<{positions:any[];orders:any[]}>({positions:[],orders:[]});
  const [liveStatusError, setLiveStatusError] = useState('');
  const [liveStatusLoading, setLiveStatusLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState('');

  useEffect(() => {
    if (!initialSetup) return;
    setTrade({
      asset: initialSetup.symbol,
      direction: initialSetup.direction,
      entry: initialSetup.entry,
      stop_loss: initialSetup.stop,
      take_profit: initialSetup.target,
      leverage: initialSetup.leverage || 1,
    });
    setAmount('10');
    setLeverage(String(Math.min(2,Math.max(1,Number(initialSetup.leverage)||2))));
    setPreview(null);
    setToken('');
    setKrakenValidated(false);
    setValidationExpiresAt(null);
    setValidationStatus('');
    setKrakenReviewError('');
    setStatus('Verified setup loaded. Check the final Kraken order review before any submission.');
  }, [initialSetup]);
  const normalized = useMemo(() => {
    if (!trade) return null;
    const asset = String(trade.asset || trade.market || trade.symbol || '')
      .replace(/(?:[-_/]?(?:USD|USDT|PERP|SWAP))+$/i, '')
      .replace(/[^A-Za-z0-9._-]/g, '')
      .toUpperCase();
    let direction = String(trade.direction || trade.side || '').toUpperCase();
    if (direction === 'BUY') direction = 'LONG';
    if (direction === 'SELL') direction = 'SHORT';
    const entry = num(trade.entry ?? trade.current_price);
    const stop = num(trade.stop_loss ?? trade.stopLoss);
    const target = num(trade.take_profit ?? trade.takeProfit);
    const extractedLeverage = num(trade.leverage);
    return {
      asset,
      direction,
      entry,
      stop,
      target,
      leverage: extractedLeverage && extractedLeverage > 0 ? extractedLeverage : Number(leverage || 1),
    };
  }, [trade, leverage]);

  const liveEstimate = useMemo(() => {
    if (!normalized?.entry || !normalized?.stop || !normalized?.target) return null;
    const positionValue = Number(amount);
    const lev = Number(leverage);
    if (!Number.isFinite(positionValue) || positionValue <= 0 || !Number.isFinite(lev) || lev <= 0) return null;
    const entry = Number(normalized.entry);
    const stopPct = Math.abs(entry - Number(normalized.stop)) / entry;
    const targetPct = Math.abs(Number(normalized.target) - entry) / entry;
    const estimatedLoss = positionValue * stopPct;
    const estimatedGain = positionValue * targetPct;
    return {
      positionValue,
      margin: positionValue / lev,
      estimatedLoss,
      estimatedGain,
      stopPct: stopPct * 100,
      targetPct: targetPct * 100,
      rr: estimatedLoss > 0 ? estimatedGain / estimatedLoss : 0,
    };
  }, [normalized?.entry, normalized?.stop, normalized?.target, amount, leverage]);

  useEffect(() => {
    let active = true;
    const asset = normalized?.asset;
    const direction = normalized?.direction;
    if (!asset || !['LONG', 'SHORT'].includes(String(direction))) {
      setSupportedLeverage([]);
      return () => { active = false; };
    }
    const loadMarginInfo = async () => {
      try {
        const response = await fetch('/api/kraken/margin-info/' + encodeURIComponent(asset), { cache: 'no-store' });
        const data = await response.json();
        if (!active || !response.ok || !data?.ok) return;
        const allowed = (direction === 'SHORT' ? data.sell : data.buy)
          .map(Number)
          .filter((x: number) => Number.isFinite(x) && x >= 1 && x <= 2);
        setSupportedLeverage(allowed);
        if (allowed.length && !allowed.includes(Number(leverage))) {
          setLeverage(String(allowed[0]));
          setPreview(null);
          setToken('');
          setStatus(`Adjusted leverage to ${allowed[0]}x, the lowest Kraken-supported value for ${asset} ${direction}.`);
        }
      } catch {}
    };
    loadMarginInfo();
    return () => { active = false; };
  }, [normalized?.asset, normalized?.direction]);

  const loadLiveStatus = async () => {
    setLiveStatusLoading(true);
    try {
      const response = await fetch('/api/kraken/live-status', { cache: 'no-store', credentials: 'include' });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Kraken live status unavailable');
      setLiveStatus({ positions: Array.isArray(data.positions) ? data.positions : [], orders: Array.isArray(data.orders) ? data.orders : [] });
      setLiveStatusError('');
    } catch (error:any) {
      setLiveStatusError(error?.message || 'Kraken live status unavailable');
    } finally {
      setLiveStatusLoading(false);
    }
  };

  useEffect(() => {
    loadLiveStatus();
    const timer = window.setInterval(loadLiveStatus, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const cancelKrakenOrder = async (txid:string) => {
    if (!window.confirm('Cancel this open Kraken order?')) return;
    setActionBusy('order:'+txid);
    try {
      const response = await fetch('/api/kraken/cancel-order', {
        method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({txid})
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Cancel failed');
      setStatus('Kraken order canceled.');
      await loadLiveStatus();
    } catch (error:any) {
      setStatus(error?.message || 'Kraken cancel failed.');
    } finally {
      setActionBusy('');
    }
  };

  const closeKrakenPosition = async (txid:string) => {
    if (!window.confirm('Close this Kraken margin position at market? IMPORTANT: Kraken conditional stop-loss orders may remain active after a separate close and could open an opposite position later. Review and cancel any associated conditional stops in Kraken after closing.')) return;
    setActionBusy('position:'+txid);
    try {
      const response = await fetch('/api/kraken/close-position', {
        method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({txid})
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Close failed');
      setStatus('Kraken close order submitted.');
      await loadLiveStatus();
    } catch (error:any) {
      setStatus(error?.message || 'Kraken close failed.');
    } finally {
      setActionBusy('');
    }
  };

  const readImage = async (file: File) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setStatus('Use a PNG, JPEG, or WebP screenshot.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setStatus('Screenshot is too large. Maximum is 8 MB.');
      return;
    }
    setBusy(true);
    setPreview(null);
    setToken('');
    setSubmitResult(null);
    setSubmitError('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setImageUrl(dataUrl);
      setStatus('AURELIS AI is reading the screenshot…');
      const analysisImage = await prepareScreenshotForAnalysis(file, dataUrl);
      const response = await fetch('/api/live-bet/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: analysisImage }),
      });
      const responseText = await response.text();
      let data: any = null;
      try { data = JSON.parse(responseText); } catch {}
      if (!response.ok || !data?.ok || !data?.trade) {
        const detail = typeof data?.detail === 'string' ? data.detail : '';
        const message = detail || data?.error || (responseText.trim().startsWith('<')
          ? 'Image reader returned an invalid response. Please try a clearer screenshot.'
          : 'AI could not reconstruct the bet.');
        throw new Error(message);
      }
      setTrade(data.trade);
      setStatus('Screenshot parsed. Review the reconstructed trade below.');
      if (soundEnabled) playHudSound('ping');
    } catch (error: any) {
      setTrade(null);
      setStatus(error?.message || 'AI could not read this screenshot.');
    } finally {
      setBusy(false);
    }
  };

  const reviewDex = async () => {
    if (!normalized?.asset || !['LONG', 'SHORT'].includes(normalized.direction)) {
      setStatus('Choose an asset and LONG/SHORT direction before DEX review.');
      return;
    }
    setBusy(true);
    setToken('');
    setPreview(null);
    setSubmitResult(null);
    setSubmitError('');
    try {
      const query = new URLSearchParams({
        bot: 'live_bet',
        asset: normalized.asset.toUpperCase(),
        side: normalized.direction.toLowerCase(),
        notional: String(Number(amount)),
      });
      const response = await fetch('/api/bots/dex-route?' + query, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || data.mode !== 'paper') throw new Error(data.error || 'DEX review unavailable');
      setStatus(data.preferredVenue
        ? 'Paper DEX route: ' + data.preferredVenue + '. No order submitted. Fees, collateral, and wallet approval not verified.'
        : 'No qualifying DEX order book. No order submitted.');
    } catch (error: any) {
      setStatus(error?.message || 'DEX review failed.');
    } finally {
      setBusy(false);
    }
  };

  const reviewKraken = async () => {
    if (!normalized?.asset || !['LONG', 'SHORT'].includes(normalized.direction)) {
      setStatus('AURELIS needs a clear asset and LONG/SHORT direction.');
      return;
    }
    if (!normalized.stop || !normalized.target) {
      setStatus('A visible stop and target are required before Kraken review.');
      return;
    }
    setBusy(true);
    setToken('');
    setKrakenValidated(false);
    setValidationExpiresAt(null);
    setValidationStatus('');
    setSubmitResult(null);
    setSubmitError('');
    setKrakenReviewError('');
    try {
      const response = await fetch('/api/signal-desk/order/prepare', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'KRAKEN',
          asset: normalized.asset,
          direction: normalized.direction,
          amount: Number(amount),
          leverage: Number(leverage),
          stopLoss: normalized.stop,
          takeProfit: normalized.target,
          setupEntry: normalized.entry,
          signal: { source: 'live_bet_import' },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || data?.message || 'Kraken review failed.');
      }
      setPreview(data.preview || null);
      setToken(String(data.confirmation?.token || ''));
      setStatus('Kraken review locked. Confirm the details before submitting.');
      if (soundEnabled) playHudSound('trade');
    } catch (error: any) {
      setPreview(null);
      setKrakenReviewError(error?.message || 'Kraken review failed.');
      setStatus(error?.message || 'Kraken review failed.');
    } finally {
      setBusy(false);
    }
  };

  const validateKraken = async () => {
    if(!token||!preview){
      setValidationStatus('Create a fresh Kraken review first.');
      return;
    }
    setBusy(true);
    setKrakenValidated(false);
    setValidationExpiresAt(null);
    setValidationStatus('Validating Kraken order parameters. No trade will be placed.');
    try{
      const response=await fetch('/api/signal-desk/order/validate',{
        method:'POST',credentials:'include',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({confirmationToken:token})
      });
      const data=await response.json();
      if(!response.ok||!data?.ok||!data?.validated||data?.orderPlaced!==false)
        throw new Error(data?.error||'Kraken validation not confirmed');
      const expiresAt=Math.min(Number(data.expiresAt)||0,Date.now()+28000);
      if(!Number.isFinite(expiresAt)||expiresAt<=Date.now())
        throw new Error('Exchange validation expired before the result was received');
      setKrakenValidated(true);
      setValidationExpiresAt(expiresAt);
      setValidationStatus('KRAKEN VALIDATED. No order placed. Approval window expires shortly; real trading remains locked.');
    }catch(error:any){
      setKrakenValidated(false);
      setValidationStatus('Validation failed: '+(error?.message||'Unknown error')+'. No order requested.');
    }finally{setBusy(false)}
  };

  const submitKraken = async () => {
    if (!token||!krakenValidated) {
      setStatus('Fresh Kraken validation is required before any submission.');
      return;
    }
    setBusy(true);
    setSubmitError('');
    try {
      const response = await fetch('/api/signal-desk/order/submit', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmationToken: token, acknowledgeLiveTest:true }),
      });
      const responseText = await response.text();
      let data: any = null;
      try { data = JSON.parse(responseText); } catch {}
      setSubmitResult(data);
      if (!response.ok || !data?.ok) {
        const message = data?.error || data?.message || (responseText.trim().startsWith('<') ? 'Kraken returned an invalid response.' : responseText.trim()) || 'Kraken submission failed.';
        throw new Error(message);
      }
      setToken('');
      setKrakenValidated(false);
      setValidationExpiresAt(null);
      setPreview(null);
      setStatus('Kraken trade submitted. Live position status is refreshing now.');
      await loadLiveStatus();
      window.setTimeout(() => document.getElementById('livebet-submit-result')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
      if (soundEnabled) playHudSound('trade');
    } catch (error: any) {
      const message = error?.message || 'Kraken submission failed.';
      setSubmitError(message);
      setStatus(message);
      window.setTimeout(() => document.getElementById('livebet-locked-review')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    } finally {
      setBusy(false);
    }
  };
  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) readImage(file);
  };

  return (
    <div className="space-y-3 font-mono text-xs text-text-primary">
      <div className="px-3 py-2.5 rounded-xl bg-surface-panel/95 border border-white/10 flex flex-wrap gap-2 items-center justify-between">
        <strong className="text-sm text-text-primary">
          {normalized ? normalized.asset+' '+normalized.direction+' · Kraken review' : 'Live Bet · Kraken Spot/Margin'}
        </strong>
        <span className="text-[10px] text-text-muted">{normalized ? 'Review → Validate (no trade)' : 'Load a bet to review'}</span>
      </div>

      <details key={normalized?'loaded-setup':'no-setup'} open={!normalized}
        className="rounded-xl border border-white/10 bg-surface-panel/75 p-2 text-[10px]">
        <summary className="cursor-pointer text-text-secondary font-bold">
          {normalized?'Use a screenshot instead':'Upload a bet screenshot'}
        </summary>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`p-4 rounded-2xl border border-dashed cursor-pointer text-center transition-all ${
          dragging ? 'border-primary-container bg-primary-container/10' : 'border-white/15 bg-surface-panel/75'
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && readImage(e.target.files[0])}
        />
        {imageUrl ? (
          <img src={imageUrl} alt="Bet screenshot" className="mx-auto max-h-52 max-w-full rounded-xl object-contain" />
        ) : (
          <div className="py-4">
            <ImagePlus className="w-8 h-8 mx-auto text-primary-container mb-2" />
            <div className="font-bold">Drop bet screenshot here</div>
            <div className="text-[10px] text-text-muted mt-1">or tap to choose an image</div>
          </div>
        )}
      </div>
      <div className="p-2 rounded-lg bg-surface-base/60 mt-2">
        <div className="flex items-center gap-2 text-[10px]">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-container" /> : <ShieldCheck className="w-3.5 h-3.5 text-primary-container" />}
          <span className="break-words min-w-0">{status}</span>
        </div>
      </div>
      </details>

      <details open={Boolean(liveStatus.positions.length||liveStatus.orders.length)}
        className="p-3 rounded-xl bg-surface-panel/95 border border-white/10 space-y-2">
        <summary className="cursor-pointer text-[10px] font-bold text-text-secondary">
          Kraken status · {liveStatusError?'Unavailable':liveStatus.positions.length+' positions · '+liveStatus.orders.length+' orders'}
        </summary>
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[9px] text-primary-container font-bold uppercase tracking-wider">Kraken Live Status</div>
            <div className="text-[9px] text-text-muted">Refreshes every 5 seconds</div>
          </div>
          <button type="button" onClick={loadLiveStatus} disabled={liveStatusLoading}
            className="p-1.5 rounded-lg border border-white/10 bg-surface-base text-text-muted hover:text-text-primary disabled:opacity-40">
            <Loader2 className={`w-3.5 h-3.5 ${liveStatusLoading?'animate-spin':''}`}/>
          </button>
        </div>

        {liveStatusError ? (
          <div className="text-[9px] text-red-400 break-words">{liveStatusError}</div>
        ) : (
          <>
            <div className="space-y-1.5">
              <div className="text-[8.5px] uppercase tracking-wider text-text-muted">Open Positions</div>
              {liveStatus.positions.length ? liveStatus.positions.map((p:any) => (
                <div key={p.txid} className="grid grid-cols-[1fr_auto] gap-2 items-center rounded-xl border border-white/5 bg-surface-base/70 p-2.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-text-primary">{p.pair}</span>
                      <span className={`text-[9px] font-bold uppercase ${p.side==='buy'?'text-primary-container':'text-red-400'}`}>{p.side==='buy'?'LONG':'SHORT'}</span>
                      <span className={`text-[9px] font-bold ${Number(p.pnl)>=0?'text-primary-container':'text-red-400'}`}>{Number(p.pnl)>=0?'+':''}{formatCurrency(Number(p.pnl||0))}</span>
                    </div>
                    <div className="mt-1 text-[9px] text-text-muted">
                      {Number(p.remaining||0).toLocaleString('en-US',{maximumFractionDigits:8})} open · margin {formatCurrency(Number(p.margin||0))} · value {formatCurrency(Number(p.value||0))}
                    </div>
                  </div>
                  <button type="button" onClick={()=>closeKrakenPosition(p.txid)} disabled={!!actionBusy}
                    className="px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-[9px] font-bold hover:bg-red-500/25 disabled:opacity-40">
                    {actionBusy==='position:'+p.txid?'CLOSING…':'CLOSE'}
                  </button>
                </div>
              )) : <div className="text-[9px] text-text-muted py-1">No open Kraken margin positions.</div>}
            </div>

            <div className="space-y-1.5 pt-1">
              <div className="text-[8.5px] uppercase tracking-wider text-text-muted">Open Orders</div>
              {liveStatus.orders.length ? liveStatus.orders.map((o:any) => (
                <div key={o.txid} className="grid grid-cols-[1fr_auto] gap-2 items-center rounded-xl border border-white/5 bg-surface-base/70 p-2.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-text-primary">{o.pair}</span>
                      <span className="text-[9px] uppercase text-text-secondary">{o.side} · {o.orderType}</span>
                    </div>
                    <div className="mt-1 text-[9px] text-text-muted">{Number(o.volume||0).toLocaleString('en-US',{maximumFractionDigits:8})} volume · {o.status}</div>
                  </div>
                  <button type="button" onClick={()=>cancelKrakenOrder(o.txid)} disabled={!!actionBusy}
                    className="px-3 py-1.5 rounded-lg border border-white/10 bg-surface-base text-text-secondary hover:text-text-primary disabled:opacity-40">
                    {actionBusy==='order:'+o.txid?'CANCELING…':'CANCEL'}
                  </button>
                </div>
              )) : <div className="text-[9px] text-text-muted py-1">No open Kraken orders.</div>}
            </div>
          </>
        )}
      </details>

      {normalized && (
        <div className="p-4 rounded-2xl bg-surface-panel/95 border border-white/10 space-y-3 overflow-hidden">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-0">
            {[
              ['Asset', normalized.asset || '—'],
              ['Direction', normalized.direction || '—'],
              ['Entry', normalized.entry ? formatCurrency(normalized.entry) : 'Market'],
              ['Stop', normalized.stop ? formatCurrency(normalized.stop) : '—'],
              ['Target', normalized.target ? formatCurrency(normalized.target) : '—'],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 p-2.5 rounded-lg bg-surface-base border border-white/5">
                <div className="text-[8.5px] text-text-muted uppercase">{label}</div>
                <div className="font-bold mt-1 break-words">{value}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0 text-[9px] text-text-muted">
              POSITION USD
              <input
                value={amount}
                readOnly
                title="First Kraken test is capped at $10 total notional"
                className="mt-1 w-full min-w-0 p-2 rounded-lg bg-surface-base border border-white/10 text-text-primary"
              />
            </label>
            <label className="min-w-0 text-[9px] text-text-muted">
              LEVERAGE
              <select
                value={leverage}
                onChange={(e) => { setLeverage(e.target.value); setPreview(null); setToken(''); setKrakenValidated(false); setValidationExpiresAt(null); }}
                className="mt-1 w-full min-w-0 p-2 rounded-lg bg-surface-base border border-white/10 text-text-primary"
              >
                {(supportedLeverage.length ? supportedLeverage : [1,2]).map((x) => <option key={x} value={String(x)}>{x}x</option>)}
              </select>
            </label>
          </div>

          {liveEstimate && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2.5 rounded-lg bg-surface-base border border-white/5">
                <div className="text-[8.5px] text-text-muted uppercase">Est. margin</div>
                <div className="font-bold mt-1">{formatCurrency(liveEstimate.margin)}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                <div className="text-[8.5px] text-text-muted uppercase">Lose at stop</div>
                <div className="font-bold mt-1 text-red-400">-{formatCurrency(liveEstimate.estimatedLoss)} <span className="text-[8px]">({liveEstimate.stopPct.toFixed(2)}%)</span></div>
              </div>
              <div className="p-2.5 rounded-lg bg-primary-container/10 border border-primary-container/20">
                <div className="text-[8.5px] text-text-muted uppercase">Make at target</div>
                <div className="font-bold mt-1 text-primary-container">+{formatCurrency(liveEstimate.estimatedGain)} <span className="text-[8px]">({liveEstimate.targetPct.toFixed(2)}%)</span></div>
              </div>
              <div className="p-2.5 rounded-lg bg-surface-base border border-white/5">
                <div className="text-[8.5px] text-text-muted uppercase">Risk / reward</div>
                <div className="font-bold mt-1">1 : {liveEstimate.rr.toFixed(2)}</div>
              </div>
            </div>
          )}

          {krakenReviewError && (
            <div role="alert" className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-[11px] text-amber-300">
              <strong className="block mb-1">
                {krakenReviewError.includes('at/below its stop')?'Price below stop · New bet needed' :
                 krakenReviewError.includes('at/above its target')?'Price beyond target · New bet needed' :
                 'Kraken review blocked · No order placed'}
              </strong>
              <details>
                <summary className="cursor-pointer text-[10px]">Why was it blocked?</summary>
                <p className="mt-2 break-words leading-relaxed">{krakenReviewError}</p>
              </details>
            </div>
          )}
          <button type="button" onClick={reviewKraken} disabled={busy}
            className="w-full py-2.5 rounded-xl bg-primary-container text-on-primary-container font-bold disabled:opacity-40">
            Review $10 Kraken bet
          </button>
          <details className="text-[10px] text-text-muted">
            <summary className="cursor-pointer">Other research options</summary>
            <button type="button" onClick={reviewDex} disabled={busy}
              className="w-full mt-2 py-2 rounded-xl border border-white/10 text-text-secondary font-bold disabled:opacity-40">
              DEX paper route (no trade)
            </button>
          </details>
        </div>
      )}
      {preview && (
        <div id="livebet-locked-review" className="p-4 rounded-2xl bg-surface-panel/95 border border-primary-container/30 space-y-3 overflow-hidden">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary-container" />
            <strong>Kraken review · $10 test</strong>
          </div>
          <div className="grid grid-cols-2 gap-2 min-w-0">
            {[
              ['Bet', preview.symbol+' '+preview.direction],
              ['Position', '$' + preview.positionValueUsd],
              ['Stop', '$' + preview.stopLoss],
              ['Target', '$' + preview.takeProfit],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 p-2 rounded-lg bg-surface-base border border-white/5">
                <div className="text-[8.5px] text-text-muted uppercase">{label}</div>
                <div className="font-bold mt-1 break-all">{String(value ?? '—')}</div>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-2.5 text-[10px] font-semibold text-amber-300">
            Kraken Spot/Margin · Stop requested after fill · Target NOT placed as an order.
          </div>
          <details className="text-[10px] text-text-muted">
            <summary className="cursor-pointer">Full order details & risks</summary>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {[
                ['Kraken quote', '$'+preview.markPrice],
                ['Quantity', preview.quantity],
                ['Est. margin', '$'+preview.estimatedMarginUsd],
                ['Venue', 'Kraken Spot/Margin (not futures)'],
              ].map(([label,value])=>(
                <div key={label} className="rounded-lg bg-surface-base p-2">
                  <div className="uppercase text-[9px]">{label}</div>
                  <strong className="break-all text-text-primary">{String(value??'—')}</strong>
                </div>
              ))}
            </div>
            <p className="mt-2">No protective orders are active before entry. Validation does not verify a fill or stop activation. A separate manual position close can leave a conditional stop active.</p>
          </details>
          <button type="button" onClick={validateKraken} disabled={busy||!token}
            className="w-full py-2.5 rounded-xl border border-primary-container/40 bg-primary-container/10 text-primary-container font-bold disabled:opacity-40">
            Validate with Kraken · No trade
          </button>
          {validationStatus && <div role="status" className={krakenValidated?'text-primary-container text-[10px]':'text-amber-300 text-[10px]'}>{validationStatus}</div>}
          <button type="button" disabled={!executionEnabled||!krakenValidated||busy||!token}
            onClick={()=>{
              if(!window.confirm('REAL LIVE TEST: Submit a Kraken Spot/Margin market entry capped at $10 notional and 2x leverage? The stop is requested after fill, take-profit is NOT placed. The trade can lose money. Approve this specific order?'))return;
              void submitKraken();
            }}
            className="w-full py-2.5 rounded-xl bg-primary-container text-on-primary-container font-bold disabled:opacity-40">
            {executionEnabled?'Approve real $10 order':'Live trading locked'}
          </button>
          <details className="text-[10px] text-text-muted">
            <summary className="cursor-pointer">Execution status</summary>
            <p className="mt-1">{executionCapabilityMessage}</p>
          </details>
          {submitError && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/25 text-red-300 text-[10px] break-words">
              Submission stopped: {submitError}
            </div>
          )}
          <p className="text-[9px] text-text-muted text-center">A real order requires fresh validation and your separate approval.</p>
        </div>
      )}

      {submitResult?.ok && (
        <div id="livebet-submit-result" className="p-4 rounded-xl bg-primary-container/10 border border-primary-container/25 text-primary-container">
          <div className="font-bold">ORDER SUBMITTED</div>
          <div className="text-[10px] mt-1">{submitResult.preview?.asset || normalized?.asset || 'Kraken trade'} was accepted. Live status above is refreshing.</div>
        </div>
      )}
    </div>
  );
};

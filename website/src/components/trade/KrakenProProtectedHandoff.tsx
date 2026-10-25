import React, { useMemo, useState } from 'react';
import { ArrowUpRight, CheckCircle2, ClipboardCopy, ShieldAlert } from 'lucide-react';
import { formatProtectedTradeHandoff, KRAKEN_PRO_OFFICIAL_URL } from '../../services/krakenProtectedHandoff';

interface Props {
  asset: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  stop: number;
  target: number;
  leverage: number;
  market?: string | null;
}

export function KrakenProProtectedHandoff({asset,direction,entry,stop,target,leverage,market}:Props) {
  const [copied,setCopied] = useState<'copied'|'failed'|null>(null);
  const plan = useMemo(() => formatProtectedTradeHandoff({
    asset,direction,entry,stop,target,
    notionalUsd:10,leverage,
    venuePair:market,
  }), [asset,direction,entry,stop,target,leverage,market]);

  const copy = async () => {
    if (!plan.ready) return;
    try {
      await navigator.clipboard.writeText(plan.text);
      setCopied('copied');
    } catch {
      setCopied('failed');
    }
  };

  return <section aria-label="Protected trading on Kraken Pro"
    className="rounded-2xl border border-primary-container/30 bg-primary-container/5 p-3 sm:p-4 space-y-3 text-text-primary">
    <div className="flex items-start gap-2">
      <ShieldAlert className="w-5 h-5 mt-0.5 shrink-0 text-primary-container" aria-hidden="true" />
      <div>
        <h3 className="text-base font-headline font-bold">Trade with both protective exits</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">
          AURELIS's Kraken API cannot safely place a linked stop-loss and take-profit together.
          Kraken Pro has a native TP/SL bracket order form for eligible markets.
          Use it to review and approve the complete order yourself.
        </p>
      </div>
    </div>

    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
      {[
        ['Market',plan.market],
        ['Direction',direction==='LONG'?'BUY / LONG':'SELL / SHORT'],
        ['Max. order',' $10.00 notional'],
        ['Test leverage',leverage+'× maximum'],
      ].map(([title,value])=><div key={title} className="rounded-lg bg-surface-panel border border-white/10 p-2">
        <div className="text-text-muted text-[9px]">{title}</div>
        <div className="font-bold break-words mt-1">{value}</div>
      </div>)}
    </div>
    <div className="rounded-xl bg-surface-panel/80 p-3">
      <div className="text-[11px] font-bold mb-2">In Kraken Pro, verify these before approving</div>
      <ol className="list-decimal pl-5 text-[11px] text-text-secondary space-y-1.5">
        <li>Find the correct eligible margin market and check the live buy/sell price.</li>
        <li>Set an order total of at most $10, and select account-approved leverage no higher than 2×.</li>
        <li>Enable <strong className="text-text-primary">both Take Profit and Stop Loss</strong> in the TP/SL bracket form.</li>
        <li>Confirm the two exits are linked, the price is still between them, and then approve there.</li>
      </ol>
    </div>
    {!plan.ready && <p className="text-amber-400 text-[11px]" role="alert">{plan.error}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={()=>void copy()} disabled={!plan.ready}
        className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-primary-container/40 bg-surface-panel font-bold text-[12px] disabled:opacity-40">
        <ClipboardCopy className="w-4 h-4" /> Copy planned trade
      </button>
      <a href={KRAKEN_PRO_OFFICIAL_URL} target="_blank" rel="noopener noreferrer"
        aria-disabled={!plan.ready} onClick={event=>{if(!plan.ready)event.preventDefault()}}
        className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary-container text-on-primary-container font-bold text-[12px] ${plan.ready?'':'opacity-40 cursor-not-allowed'}`}>
        Open Kraken Pro <ArrowUpRight className="w-4 h-4"/>
      </a>
    </div>
    {copied==='copied' && <p role="status" className="text-primary-container text-[11px] inline-flex gap-1 items-center">
      <CheckCircle2 className="w-3.5 h-3.5"/> Trade plan copied. Paste for reference; you still need to enter and approve the order in Kraken Pro.
    </p>}
    {copied==='failed' && <p role="status" className="text-amber-400 text-[11px]">Clipboard permission unavailable. Use the values above, and confirm both exit prices in Kraken Pro.</p>}
    <p className="text-[10px] text-text-muted leading-relaxed">
      Nothing is submitted or prefilled automatically. Kraken Pro market, account eligibility, live prices,
      bracket availability and fills must be checked there. Do not trade if linked exits aren't offered.
      AURELIS's separate REST entry button remains locked.
    </p>
  </section>;
}

import React, { useEffect, useMemo, useState } from 'react';
import { Activity, RefreshCw, Shield, WalletCards } from 'lucide-react';
import { CoinData } from '../../types';
import { playHudSound } from '../../services/marketData';

interface ArbitrageBotViewProps {
  coins: CoinData[];
  soundEnabled: boolean;
}

type VenueState = {
  dataReady?: boolean;
  marketsReady?: number;
  dataOnly?: boolean;
  walletRequired?: boolean;
  walletReady?: boolean;
  executionReady?: boolean;
  status?: string;
  source?: string;
};

type DexOpportunity = {
  asset: string;
  longVenue: string;
  shortVenue: string;
  longAskUsd: number;
  shortBidUsd: number;
  grossSpreadPct: number;
  roundTripFeePct: number;
  netSpreadBeforeFundingPct: number;
  targetNotionalPerLegUsd: number;
  walletReady: boolean;
  executionReady: boolean;
};

type DexScan = {
  mode: string;
  architecture: string;
  treasury: {
    signerProvider?: string;
    walletSessionConfigured?: boolean;
    liveTransfersEnabled?: boolean;
    liveTradingEnabled?: boolean;
    defaultCollateral?: string;
  };
  targetNotionalPerLegUsd: number;
  venues: Record<string, VenueState>;
  opportunities: DexOpportunity[];
  researchOpportunities?: DexOpportunity[];
  scanMs?: number;
  warning?: string;
};

const PRIMARY = ['hyperliquid', 'lighter', 'dydx', 'gmx'];
const PLANNED = ['jupiter', 'paradex', 'aevo', 'edgex', 'grvt', 'variational', 'aster'];
const LABEL: Record<string, string> = {
  hyperliquid: 'Hyperliquid',
  lighter: 'Lighter',
  dydx: 'dYdX',
  gmx: 'GMX',
  jupiter: 'Jupiter',
  paradex: 'Paradex',
  aevo: 'Aevo',
  edgex: 'edgeX',
  grvt: 'GRVT',
  variational: 'Variational',
  aster: 'Aster',
};

const money = (value?: number) =>
  Number(value || 0).toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });

const pct = (value?: number) => `${Number(value || 0).toFixed(3)}%`;

export const ArbitrageBotView: React.FC<ArbitrageBotViewProps> = ({ soundEnabled }) => {
  const [target, setTarget] = useState('25');
  const [scan, setScan] = useState<DexScan | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const load = async (fresh = false) => {
    if (fresh && soundEnabled) playHudSound('switch');
    setIsScanning(true);
    try {
      const amount = Math.max(5, Number(target || 25));
      const response = await fetch(
        `/api/arbitrage/dex-scan?target=${encodeURIComponent(String(amount))}&fresh=${fresh ? 'true' : 'false'}`,
        { cache: 'no-store' },
      );
      const body = await response.json();
      if (!response.ok || !body?.venues || !Array.isArray(body?.opportunities)) {
        throw new Error(body?.detail || body?.error || 'DEX scanner unavailable');
      }
      setScan(body);
      setError('');
      setUpdatedAt(Date.now());
    } catch (err: any) {
      setError(err?.message || 'DEX scanner unavailable');
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    load(true);
    const timer = window.setInterval(() => load(false), 5000);
    return () => window.clearInterval(timer);
    // target is applied when SCAN NOW is pressed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paperRows = scan?.researchOpportunities || scan?.opportunities || [];
  const top = paperRows[0] || null;
  const dataReady = useMemo(
    () => PRIMARY.filter((venue) => scan?.venues?.[venue]?.dataReady).length,
    [scan],
  );
  const walletReady = Boolean(scan?.treasury?.walletSessionConfigured);

  return (
    <div className="space-y-4 font-mono select-none text-text-primary text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl bg-surface-panel/95 border border-white/10 shadow-lg">
        <div>
          <span className="text-[10px] text-primary-container font-bold uppercase tracking-wider block mb-0.5">
            AURELIS PAPER RESEARCH
          </span>
          <h1 className="text-xl sm:text-2xl font-headline font-bold text-text-primary">Arbitrage</h1>
          <p className="text-[11px] text-text-muted font-sans mt-0.5 max-w-2xl">
            Paper-only DEX order-book comparisons. No order execution, automated transfers, or U.S.-restricted venue routing.
          </p>
        </div>
        <span className="px-3 py-1 rounded-full bg-primary-container/10 border border-primary-container/30 text-primary-container text-[10px] font-bold self-start sm:self-auto">
          PAPER ONLY · NO LIVE ORDERS
        </span>
      </div>

      <div className="p-3.5 rounded-xl bg-surface-base border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <WalletCards className="w-4 h-4 text-primary-container" />
          <div>
            <div className="text-[9px] text-text-muted uppercase tracking-wider">WALLET RESEARCH STATUS</div>
            <div className="font-bold text-[12px]">OneKey Agent Wallet</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className={`px-2 py-1 rounded border ${
            walletReady
              ? 'text-primary-container border-primary-container/30 bg-primary-container/10'
              : 'text-amber-300 border-amber-400/20 bg-amber-400/5'
          }`}>
            {walletReady ? 'RESEARCH WALLET LINKED' : 'NO SIGNER NEEDED FOR PAPER'}
          </span>
          <span className="px-2 py-1 rounded border border-white/10 text-text-muted">
            {scan?.treasury?.defaultCollateral || 'USDC'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {PRIMARY.map((venue) => {
          const state = scan?.venues?.[venue] || {};
          return (
            <div key={venue} className="p-3.5 rounded-xl bg-surface-panel/95 border border-white/10 shadow-lg">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-black">{LABEL[venue]}</span>
                <span className={`text-[9px] font-bold ${state.dataReady ? 'text-primary-container' : 'text-amber-400'}`}>
                  {state.dataReady ? (state.dataOnly ? 'DATA' : 'LIVE BOOK') : 'WAIT'}
                </span>
              </div>
              <div className="text-[20px] font-black mt-2">{state.marketsReady || 0}<span className="text-[10px] text-text-muted ml-1">markets</span></div>
              <div className="text-[9px] text-text-muted mt-0.5">
                {state.dataOnly
                  ? 'data-only until executable SDK quote path is wired'
                  : walletReady
                  ? 'wallet signer detected'
                  : 'market data ready · signer pending'}
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-4 rounded-2xl bg-surface-panel/95 border border-white/10 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div className="text-[9px] text-primary-container uppercase font-bold tracking-wider">RESEARCH MODE ONLY</div>
            <h2 className="text-sm font-bold mt-0.5">DEX Data Network</h2>
            <div className="text-[9px] text-text-muted mt-1">Some venues restrict U.S. derivatives access. They provide research data only.</div>
          </div>
          <button
            type="button"
            onClick={() => load(true)}
            disabled={isScanning}
            className="px-4 py-2 rounded-xl bg-primary-container text-on-primary-container font-bold text-xs disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            {isScanning ? 'SCANNING…' : 'SCAN NOW'}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          <div className="p-2.5 rounded-lg bg-surface-base border border-white/10">
            <div className="text-[8px] text-text-muted uppercase">Target / leg</div>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-text-muted">$</span>
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                type="number"
                min="5"
                className="w-full bg-transparent outline-none font-bold"
              />
            </div>
          </div>
          <Metric label="LIVE DATA" value={`${dataReady} / 4`} />
          <Metric label="ROUTES" value={String(paperRows.length)} />
          <Metric label="SCAN" value={scan?.scanMs ? `${scan.scanMs} ms` : '--'} />
          <Metric label="TRANSFERS" value={'DISABLED'} />
          <Metric label="TRADING" value={'DISABLED'} />
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {PLANNED.map((venue) => (
            <span key={venue} className="px-2 py-1 rounded-lg border border-white/10 bg-surface-base text-[9px] text-text-muted">
              {LABEL[venue]} · DATA ONLY
            </span>
          ))}
          <span className="px-2 py-1 rounded-lg border border-white/10 bg-surface-base text-[9px] text-text-muted">
            CEX price data only
          </span>
        </div>
      </div>

      <div className="p-4 sm:p-5 rounded-2xl bg-surface-panel/95 border border-white/10 shadow-xl space-y-3">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div>
            <div className="text-[9px] text-primary-container uppercase font-bold tracking-wider">BEST PAPER SPREAD</div>
            <div className="text-base font-bold mt-0.5">
              {top ? `${top.asset} · ${LABEL[top.longVenue] || top.longVenue} → ${LABEL[top.shortVenue] || top.shortVenue}` : 'WAITING FOR BOOKS'}
            </div>
          </div>
          <span className="px-2 py-1 rounded border border-white/10 text-[9px] text-text-muted">
            {'RESEARCH ONLY'}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          <Metric label="ASSET" value={top?.asset || '--'} />
          <Metric label="LONG" value={top ? LABEL[top.longVenue] || top.longVenue : '--'} />
          <Metric label="ASK" value={top ? money(top.longAskUsd) : '--'} />
          <Metric label="SHORT" value={top ? LABEL[top.shortVenue] || top.shortVenue : '--'} />
          <Metric label="BID" value={top ? money(top.shortBidUsd) : '--'} />
          <Metric label="GROSS" value={top ? pct(top.grossSpreadPct) : '--'} accent />
          <Metric label="FEES RT" value={top ? pct(top.roundTripFeePct) : '--'} />
          <Metric label="NET*" value={top ? pct(top.netSpreadBeforeFundingPct) : '--'} accent={Boolean(top && top.netSpreadBeforeFundingPct > 0)} />
        </div>
      </div>

      <div className="p-3.5 sm:p-4 rounded-2xl bg-surface-panel/95 border border-white/10 shadow-xl space-y-2">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <strong className="text-xs">Paper Opportunity Monitor</strong>
          <span className="text-[9px] text-primary-container font-bold">{paperRows.length} PAPER ROUTES</span>
        </div>
        {error && <div className="p-2.5 rounded-lg border border-red-400/20 bg-red-400/5 text-red-300 text-[10px]">{error}</div>}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-text-muted text-[9px] uppercase">
                <th className="py-2 px-2">Asset</th>
                <th className="py-2 px-2">Long</th>
                <th className="py-2 px-2">Short</th>
                <th className="py-2 px-2">Ask</th>
                <th className="py-2 px-2">Bid</th>
                <th className="py-2 px-2">Gross</th>
                <th className="py-2 px-2">Fees RT</th>
                <th className="py-2 px-2">Net*</th>
                <th className="py-2 px-2 text-right">State</th>
              </tr>
            </thead>
            <tbody>
              {paperRows.slice(0, 18).map((row, index) => (
                <tr key={`${row.asset}-${row.longVenue}-${row.shortVenue}-${index}`} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2 px-2 font-bold">{row.asset}</td>
                  <td className="py-2 px-2">{LABEL[row.longVenue] || row.longVenue}</td>
                  <td className="py-2 px-2">{LABEL[row.shortVenue] || row.shortVenue}</td>
                  <td className="py-2 px-2">{money(row.longAskUsd)}</td>
                  <td className="py-2 px-2">{money(row.shortBidUsd)}</td>
                  <td className="py-2 px-2">{pct(row.grossSpreadPct)}</td>
                  <td className="py-2 px-2 text-text-muted">{pct(row.roundTripFeePct)}</td>
                  <td className={`py-2 px-2 font-bold ${row.netSpreadBeforeFundingPct > 0 ? 'text-primary-container' : 'text-text-muted'}`}>
                    {pct(row.netSpreadBeforeFundingPct)}
                  </td>
                  <td className="py-2 px-2 text-right text-text-muted">
                    {'PAPER ONLY'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pt-1 flex flex-wrap gap-2 items-center text-[9px] text-text-muted">
          <Activity className="w-3 h-3" />
          <span>* Net includes current order-book depth and configured taker fees, before funding/borrow effects.</span>
          {updatedAt && <span className="ml-auto">Updated {new Date(updatedAt).toLocaleTimeString()}</span>}
        </div>
      </div>

      <div className="p-3 rounded-xl border border-amber-400/15 bg-amber-400/5 text-[10px] text-amber-200 flex gap-2 items-start">
        <Shield className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          Live transfers and order submission remain locked until the real OneKey Agent Wallet session is attached and two-leg fill recovery is validated. CEX Kraken / Toobit / OKX / Kalshi remains available as fallback infrastructure.
        </span>
      </div>
    </div>
  );
};

const Metric: React.FC<{ label: string; value: React.ReactNode; accent?: boolean }> = ({ label, value, accent = false }) => (
  <div className="p-2 rounded-lg bg-surface-base border border-white/5">
    <div className="text-[8px] text-text-muted uppercase">{label}</div>
    <div className={`font-bold mt-1 ${accent ? 'text-primary-container' : 'text-text-primary'}`}>{value}</div>
  </div>
);

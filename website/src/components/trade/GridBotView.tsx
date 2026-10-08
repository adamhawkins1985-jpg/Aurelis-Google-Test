import React, { useState, useMemo, useEffect } from 'react';
import {
  Grid as GridIcon,
  Shield,
  RefreshCw,
  TrendingUp,
  Activity,
  Layers,
} from 'lucide-react';
import { CoinData } from '../../types';
import { playHudSound, formatCurrency } from '../../services/marketData';
import { fetchKrakenRadar, KrakenRadarCandidate } from '../../services/krakenBots';

interface GridBotViewProps {
  coins: CoinData[];
  soundEnabled: boolean;
}

export const GridBotView: React.FC<GridBotViewProps> = ({ coins, soundEnabled }) => {
  const [selectedAsset, setSelectedAsset] = useState<string>('BTC');
  const [capital, setCapital] = useState<string>('1000');
  const [rangeMode, setRangeMode] = useState<string>('AI Range');
  const [gridLevels, setGridLevels] = useState<number>(10);
  const [breakoutGuard, setBreakoutGuard] = useState<string>('Enabled');
  const [mode, setMode] = useState<string>('Phone approval');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [preparedReview, setPreparedReview] = useState<boolean>(false);

  const [radarCandidates, setRadarCandidates] = useState<KrakenRadarCandidate[]>([]);

  const loadRadar = async () => {
    setIsScanning(true);
    try {
      const data = await fetchKrakenRadar();
      setRadarCandidates(data.candidates);
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    loadRadar();
    const timer = window.setInterval(loadRadar, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const selectedCoin = useMemo(
    () => coins.find((c) => c.symbol.toUpperCase() === selectedAsset.toUpperCase()),
    [coins, selectedAsset]
  );
  const selectedCandidate = useMemo(
    () => radarCandidates.find((c) => c.asset?.toUpperCase() === selectedAsset.toUpperCase()) || null,
    [radarCandidates, selectedAsset]
  );
  const selectedPrice = Number(selectedCoin?.price || selectedCandidate?.price || 0);

  const lowerRange = useMemo(() => {
    const atr = Number(selectedCandidate?.structure?.atr || 0);
    return (atr > 0 ? selectedPrice - atr * 2 : selectedPrice * 0.989).toFixed(2);
  }, [selectedPrice, selectedCandidate]);
  const upperRange = useMemo(() => {
    const atr = Number(selectedCandidate?.structure?.atr || 0);
    return (atr > 0 ? selectedPrice + atr * 2 : selectedPrice * 1.009).toFixed(2);
  }, [selectedPrice, selectedCandidate]);
  const step = useMemo(
    () => ((parseFloat(upperRange) - parseFloat(lowerRange)) / gridLevels).toFixed(2),
    [upperRange, lowerRange, gridLevels]
  );
  const capitalPerGrid = useMemo(
    () => (parseFloat(capital || '1000') / gridLevels).toFixed(2),
    [capital, gridLevels]
  );

  const marketRows = useMemo(() => {
    return radarCandidates.slice(0, 20).map((r, index) => ({
      id: String(index + 1),
      asset: r.asset,
      signal: r.direction,
      score: Number(r.score || 0),
      target: Number(r.target || 0),
      stop: Number(r.invalidation || 0),
      price: Number(r.price || 0),
      venues: 'Kraken',
    }));
  }, [radarCandidates]);

  const handleScanRange = () => {
    if (soundEnabled) playHudSound('switch');
    setPreparedReview(false);
    loadRadar();
  };

  return (
    <div className="space-y-4 font-mono select-none text-text-primary text-xs">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl bg-surface-panel/95 border border-white/10 shadow-lg">
        <div>
          <span className="text-[10px] text-primary-container font-bold uppercase tracking-wider block mb-0.5">
            AURELIS BOT
          </span>
          <h1 className="text-xl sm:text-2xl font-headline font-bold text-text-primary">
            Grid
          </h1>
          <p className="text-[11px] text-text-muted font-sans mt-0.5 max-w-xl">
            Kraken Trade Radar range research with breakout protection.
          </p>
        </div>

        <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold self-start sm:self-auto">
          KRAKEN RESEARCH LIVE
        </span>
      </div>

      {/* 2. Phone Approval Required Banner */}
      <div className="p-2.5 px-3.5 rounded-lg bg-surface-base border border-white/5 flex items-center gap-2 text-[10.5px]">
        <span className="text-text-muted uppercase font-bold tracking-wider">
          PHONE APPROVAL REQUIRED
        </span>
        <span className="text-text-secondary font-sans">
          Wallet signs every fund-moving action.
        </span>
      </div>

      {/* 3. Grid Settings Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-surface-panel/95 border border-white/10 shadow-xl space-y-3">
        <h2 className="text-xs font-bold text-text-primary font-headline">Grid Settings</h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-[10.5px]">
          <div>
            <label className="text-[9px] text-text-muted uppercase block mb-1">ASSET</label>
            <div className="flex items-center gap-1.5 p-2 rounded-lg bg-surface-base border border-white/10">
              <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 font-bold text-[9px] flex items-center justify-center">
                ₿
              </span>
              <select
                value={selectedAsset}
                onChange={(e) => setSelectedAsset(e.target.value)}
                className="bg-transparent text-text-primary outline-none font-bold text-xs w-full cursor-pointer"
              >
                {radarCandidates.slice(0, 30).map((c) => (
                  <option key={c.asset} value={c.asset}>{c.asset}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[9px] text-text-muted uppercase block mb-1">CAPITAL</label>
            <div className="flex items-center gap-1 p-2 rounded-lg bg-surface-base border border-white/10">
              <span className="text-text-muted">$</span>
              <input
                type="number"
                value={capital}
                onChange={(e) => setCapital(e.target.value)}
                className="bg-transparent text-text-primary outline-none font-bold text-xs w-full"
              />
            </div>
          </div>

          <div>
            <label className="text-[9px] text-text-muted uppercase block mb-1">RANGE</label>
            <select
              value={rangeMode}
              onChange={(e) => setRangeMode(e.target.value)}
              className="p-2 rounded-lg bg-surface-base border border-white/10 text-text-primary outline-none font-bold text-xs w-full cursor-pointer"
            >
              <option value="AI Range">AI Range</option>
              <option value="Fixed 5%">Fixed 5%</option>
              <option value="Fixed 10%">Fixed 10%</option>
            </select>
          </div>

          <div>
            <label className="text-[9px] text-text-muted uppercase block mb-1">GRID LEVELS</label>
            <input
              type="number"
              min="2"
              max="100"
              value={gridLevels}
              onChange={(e) => setGridLevels(parseInt(e.target.value) || 10)}
              className="p-2 rounded-lg bg-surface-base border border-white/10 text-text-primary outline-none font-bold text-xs w-full"
            />
          </div>

          <div>
            <label className="text-[9px] text-text-muted uppercase block mb-1">BREAKOUT GUARD</label>
            <select
              value={breakoutGuard}
              onChange={(e) => setBreakoutGuard(e.target.value)}
              className="p-2 rounded-lg bg-surface-base border border-white/10 text-text-primary outline-none font-bold text-xs w-full cursor-pointer"
            >
              <option value="Enabled">Enabled</option>
              <option value="Disabled">Disabled</option>
            </select>
          </div>

          <div>
            <label className="text-[9px] text-text-muted uppercase block mb-1">MODE</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="p-2 rounded-lg bg-surface-base border border-white/10 text-text-primary outline-none font-bold text-xs w-full cursor-pointer"
            >
              <option value="Phone approval">Phone approval</option>
              <option value="Autonomous">Autonomous</option>
            </select>
          </div>
        </div>
      </div>

      {/* 4. Current Grid Decision Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-surface-panel/95 border border-white/10 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-white/10">
          <div>
            <span className="text-[9px] text-cyan-400 uppercase font-bold tracking-wider block mb-0.5">
              CURRENT GRID DECISION
            </span>
            <h2 className="text-base sm:text-lg font-headline font-bold text-text-primary">
              {selectedAsset} — {selectedCandidate ? 'KRAKEN RANGE CHECK' : 'WAITING FOR KRAKEN DATA'}
            </h2>
          </div>
          <span className="px-2.5 py-1 rounded bg-surface-base border border-white/10 text-text-muted text-[10px] font-bold self-start sm:self-auto">
            {selectedCandidate ? 'LIVE' : 'WAIT'}
          </span>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2 py-0.5 rounded bg-surface-base border border-white/10 text-text-muted text-[9.5px] font-bold">
            KRAKEN SIGNAL
          </span>
          <span className="text-text-secondary text-[11px] font-sans">
            Live direction &nbsp; <strong className="text-cyan-400 font-mono">{selectedCandidate?.direction || 'NO_TRADE'} · score {Number(selectedCandidate?.score || 0).toFixed(1)}</strong>
          </span>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 p-3 rounded-xl bg-surface-base/80 border border-white/5 text-[10.5px]">
          <div>
            <span className="text-[8.5px] text-text-muted uppercase block">ASSET</span>
            <strong className="text-xs text-text-primary">{selectedAsset}</strong>
          </div>
          <div>
            <span className="text-[8.5px] text-text-muted uppercase block">PRICE</span>
            <strong className="text-xs text-text-primary font-mono">{formatCurrency(selectedPrice)}</strong>
          </div>
          <div>
            <span className="text-[8.5px] text-text-muted uppercase block">LOWER RANGE</span>
            <strong className="text-xs text-text-primary font-mono">${lowerRange}</strong>
          </div>
          <div>
            <span className="text-[8.5px] text-text-muted uppercase block">UPPER RANGE</span>
            <strong className="text-xs text-text-primary font-mono">${upperRange}</strong>
          </div>
          <div>
            <span className="text-[8.5px] text-text-muted uppercase block">LEVELS</span>
            <strong className="text-xs text-text-primary">{gridLevels}</strong>
          </div>
          <div>
            <span className="text-[8.5px] text-text-muted uppercase block">STEP</span>
            <strong className="text-xs text-text-primary font-mono">${step}</strong>
          </div>
          <div>
            <span className="text-[8.5px] text-text-muted uppercase block">CAPITAL / GRID</span>
            <strong className="text-xs text-text-primary font-mono">${capitalPerGrid}</strong>
          </div>
          <div>
            <span className="text-[8.5px] text-text-muted uppercase block">RANGE CHECK</span>
            <strong className="text-xs text-amber-400">WAIT</strong>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleScanRange}
            className="px-4 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-bold text-xs shadow-[0_0_12px_rgba(0,210,255,0.35)] cursor-pointer flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Scanning Range…' : 'SCAN RANGE'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (soundEnabled) playHudSound('click');
              setPreparedReview(true);
              window.setTimeout(() => document.getElementById('grid-prepared-review')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
            }}
            className="px-4 py-2 rounded-xl bg-surface-base border border-white/10 hover:bg-white/10 text-text-secondary hover:text-text-primary font-bold text-xs cursor-pointer"
          >
            PREPARE GRID
          </button>
        </div>
      </div>

      {preparedReview && (
        <div id="grid-prepared-review" className="p-4 sm:p-5 rounded-2xl bg-surface-panel/95 border border-primary-container/30 shadow-xl space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[9px] uppercase font-bold tracking-wider text-primary-container">STEP 2 · GRID REVIEW</div>
              <div className="text-sm font-bold mt-1">{selectedAsset} grid plan prepared</div>
            </div>
            <span className="px-2 py-1 rounded bg-primary-container/10 border border-primary-container/25 text-primary-container text-[9px] font-bold">PREPARED</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div className="p-2.5 rounded-lg bg-surface-base border border-white/5"><div className="text-[8px] text-text-muted uppercase">Lower</div><div className="font-bold mt-1">${lowerRange}</div></div>
            <div className="p-2.5 rounded-lg bg-surface-base border border-white/5"><div className="text-[8px] text-text-muted uppercase">Upper</div><div className="font-bold mt-1">${upperRange}</div></div>
            <div className="p-2.5 rounded-lg bg-surface-base border border-white/5"><div className="text-[8px] text-text-muted uppercase">Levels</div><div className="font-bold mt-1">{gridLevels}</div></div>
            <div className="p-2.5 rounded-lg bg-surface-base border border-white/5"><div className="text-[8px] text-text-muted uppercase">Per grid</div><div className="font-bold mt-1">${capitalPerGrid}</div></div>
            <div className="p-2.5 rounded-lg bg-surface-base border border-white/5"><div className="text-[8px] text-text-muted uppercase">Breakout guard</div><div className="font-bold mt-1">{breakoutGuard}</div></div>
          </div>
          <div className="text-[10px] text-text-muted">Range mode {rangeMode} · capital {formatCurrency(Number(capital || 0))} · step ${step} · Kraken signal {selectedCandidate?.direction || 'NO_TRADE'}.</div>
          <div className="px-3 py-2 rounded-lg bg-surface-base border border-white/5 text-[10px] text-text-secondary">Next step: review the individual grid orders and approve them on the phone. No grid orders have been submitted yet.</div>
        </div>
      )}

      {/* 5. Market Context Table */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-surface-panel/95 border border-white/10 shadow-xl space-y-2">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <strong className="text-xs font-bold text-text-primary">Market Context</strong>
          <span className="px-2 py-0.5 rounded bg-surface-base border border-white/10 text-cyan-400 text-[9px] font-bold">
            {marketRows.length} KRAKEN MARKETS
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-text-muted text-[9px] uppercase">
                <th className="py-2 px-2">#</th>
                <th className="py-2 px-2">Asset</th>
                <th className="py-2 px-2">Signal</th>
                <th className="py-2 px-2">Score</th>
                <th className="py-2 px-2">Price</th>
                <th className="py-2 px-2">Target</th>
                <th className="py-2 px-2">Stop</th>
                <th className="py-2 px-2 text-right">Venues</th>
              </tr>
            </thead>
            <tbody>
              {marketRows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-white/5 hover:bg-white/5 transition-colors font-mono"
                >
                  <td className="py-2 px-2 text-text-muted">{r.id}</td>
                  <td className="py-2 px-2 font-bold text-text-primary">{r.asset}</td>
                  <td className="py-2 px-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold ${
                        r.signal === 'LONG'
                          ? 'bg-cyan-500/15 text-cyan-400'
                          : r.signal === 'SHORT'
                          ? 'bg-rose-500/15 text-rose-400'
                          : 'text-text-muted'
                      }`}
                    >
                      {r.signal}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-text-secondary">{r.score}</td>
                  <td className="py-2 px-2 text-text-primary">
                    ${r.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-2 px-2 text-text-muted">
                    {r.target > 0 ? `$${r.target.toLocaleString()}` : '$0.00'}
                  </td>
                  <td className="py-2 px-2 text-text-muted">
                    {r.stop > 0 ? `$${r.stop.toLocaleString()}` : '$0.00'}
                  </td>
                  <td className="py-2 px-2 text-right text-text-muted">{r.venues}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

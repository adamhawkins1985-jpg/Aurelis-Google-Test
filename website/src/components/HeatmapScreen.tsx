import React from 'react';
import { CoinData } from '../types';
import { formatCurrency, playHudSound } from '../services/marketData';

interface HeatmapScreenProps {
  coins: CoinData[];
  onSelectCoin: (coin: CoinData) => void;
  soundEnabled: boolean;
}

export const HeatmapScreen: React.FC<HeatmapScreenProps> = ({
  coins,
  onSelectCoin,
  soundEnabled,
}) => {
  // Find key coins or fall back to available coins
  const btc = coins.find((c) => c.symbol === 'BTC') || coins[0];
  const eth = coins.find((c) => c.symbol === 'ETH') || coins[1];
  const usdt = coins.find((c) => c.symbol === 'USDT') || coins[2];
  const bnb = coins.find((c) => c.symbol === 'BNB') || coins[3];
  const usdc = coins.find((c) => c.symbol === 'USDC') || coins[4];
  const sol = coins.find((c) => c.symbol === 'SOL') || coins[5];
  const xrp = coins.find((c) => c.symbol === 'XRP') || coins[6];
  const doge = coins.find((c) => c.symbol === 'DOGE') || coins[7];

  const getTileStyle = (change: number) => {
    if (change >= 0) {
      return {
        bg: 'bg-[#00DF89]',
        text: 'text-[#06090e]',
        shadow: 'hover:shadow-[0_0_15px_rgba(0,223,137,0.4)]',
      };
    } else {
      return {
        bg: 'bg-[#FF4D4F]',
        text: 'text-white',
        shadow: 'hover:shadow-[0_0_15px_rgba(255,77,79,0.4)]',
      };
    }
  };

  const handleTileClick = (coin?: CoinData) => {
    if (!coin) return;
    if (soundEnabled) playHudSound('switch');
    onSelectCoin(coin);
  };

  const btcStyle = getTileStyle(btc?.change24h ?? 0.12);
  const ethStyle = getTileStyle(eth?.change24h ?? -0.21);
  const usdtStyle = getTileStyle(usdt?.change24h ?? -0.01);
  const bnbStyle = getTileStyle(bnb?.change24h ?? -0.54);
  const usdcStyle = getTileStyle(usdc?.change24h ?? -0.01);
  const solStyle = getTileStyle(sol?.change24h ?? -2.47);
  const xrpStyle = getTileStyle(xrp?.change24h ?? 1.65);
  const dogeStyle = getTileStyle(doge?.change24h ?? 1.02);

  return (
    <section id="section-heatmap" className="flex flex-col gap-2 w-full select-none">
      {/* Header with legends */}
      <div className="flex items-center justify-between pb-1 border-b border-white/5 text-[11px] font-mono">
        <div className="flex items-center gap-1.5 font-headline font-bold text-text-primary">
          <span>Market Treemap</span>
          <span className="text-[9px] font-mono text-text-secondary px-1.5 py-0.5 bg-surface-panel rounded border border-white/5">
            Top 100 Vol
          </span>
        </div>
        <div className="flex items-center gap-2 text-[9px]">
          <span className="flex items-center gap-1 text-emerald-active font-bold">
            <span className="w-2 h-2 rounded-sm bg-[#00DF89]" />
            Bull
          </span>
          <span className="flex items-center gap-1 text-status-error font-bold">
            <span className="w-2 h-2 rounded-sm bg-[#FF4D4F]" />
            Bear
          </span>
        </div>
      </div>

      {/* Proportional Tile Treemap matching Image 4 */}
      <div className="grid grid-cols-12 gap-1.5 h-[280px] w-full rounded-xl overflow-hidden font-headline select-none">
        {/* LEFT DOMINANT BLOCK: BTC (Col 6) */}
        {btc && (
          <div
            onClick={() => handleTileClick(btc)}
            className={`col-span-6 ${btcStyle.bg} ${btcStyle.text} p-3 rounded-lg flex flex-col items-center justify-center font-bold cursor-pointer hover:opacity-95 transition-all active:scale-[0.98] ${btcStyle.shadow}`}
            title={`View ${btc.name} Chart`}
          >
            <span className="text-[28px] tracking-tight font-headline font-extrabold leading-tight">
              {btc.symbol}
            </span>
            <span className="font-mono text-[14px] font-bold">
              {btc.change24h >= 0 ? '+' : ''}
              {btc.change24h.toFixed(2)}%
            </span>
            <span className="font-mono text-[10px] opacity-85 mt-1 font-semibold">
              {formatCurrency(btc.price)}
            </span>
          </div>
        )}

        {/* RIGHT SIDE SUB-GRID (Col 6) */}
        <div className="col-span-6 grid grid-rows-12 gap-1.5">
          {/* Top Row: ETH and USDT (Row 6) */}
          <div className="row-span-6 grid grid-cols-2 gap-1.5">
            {/* ETH Tile */}
            {eth && (
              <div
                onClick={() => handleTileClick(eth)}
                className={`${ethStyle.bg} ${ethStyle.text} p-2 rounded-lg flex flex-col items-center justify-center font-bold cursor-pointer hover:opacity-95 transition-all active:scale-[0.97] ${ethStyle.shadow}`}
                title={`View ${eth.name} Chart`}
              >
                <span className="text-[16px] font-extrabold leading-none">{eth.symbol}</span>
                <span className="font-mono text-[11px] font-semibold mt-0.5">
                  {eth.change24h >= 0 ? '+' : ''}
                  {eth.change24h.toFixed(2)}%
                </span>
                <span className="font-mono text-[9px] opacity-75 mt-0.5">
                  {formatCurrency(eth.price)}
                </span>
              </div>
            )}

            {/* USDT Tile */}
            {usdt && (
              <div
                onClick={() => handleTileClick(usdt)}
                className={`${usdtStyle.bg} ${usdtStyle.text} p-2 rounded-lg flex flex-col items-center justify-center font-bold cursor-pointer hover:opacity-95 transition-all active:scale-[0.97] ${usdtStyle.shadow}`}
                title={`View ${usdt.name} Chart`}
              >
                <span className="text-[14px] font-extrabold leading-none">{usdt.symbol}</span>
                <span className="font-mono text-[10px] font-semibold mt-0.5">
                  {usdt.change24h >= 0 ? '+' : ''}
                  {usdt.change24h.toFixed(2)}%
                </span>
                <span className="font-mono text-[9px] opacity-75 mt-0.5">$1.00</span>
              </div>
            )}
          </div>

          {/* Bottom Row: Multi-token breakdown (Row 6) */}
          <div className="row-span-6 grid grid-cols-3 gap-1.5">
            {/* BNB */}
            {bnb && (
              <div
                onClick={() => handleTileClick(bnb)}
                className={`${bnbStyle.bg} ${bnbStyle.text} p-1 rounded-lg flex flex-col items-center justify-center text-center cursor-pointer hover:opacity-95 transition-all ${bnbStyle.shadow}`}
                title={`View ${bnb.name} Chart`}
              >
                <span className="text-[11px] font-bold leading-none">{bnb.symbol}</span>
                <span className="font-mono text-[9px] mt-0.5">
                  {bnb.change24h >= 0 ? '+' : ''}
                  {bnb.change24h.toFixed(2)}%
                </span>
              </div>
            )}

            {/* USDC */}
            {usdc && (
              <div
                onClick={() => handleTileClick(usdc)}
                className={`${usdcStyle.bg} ${usdcStyle.text} p-1 rounded-lg flex flex-col items-center justify-center text-center cursor-pointer hover:opacity-95 transition-all ${usdcStyle.shadow}`}
                title={`View ${usdc.name} Chart`}
              >
                <span className="text-[11px] font-bold leading-none">{usdc.symbol}</span>
                <span className="font-mono text-[9px] mt-0.5">
                  {usdc.change24h >= 0 ? '+' : ''}
                  {usdc.change24h.toFixed(2)}%
                </span>
              </div>
            )}

            {/* SOL */}
            {sol && (
              <div
                onClick={() => handleTileClick(sol)}
                className={`${solStyle.bg} ${solStyle.text} p-1 rounded-lg flex flex-col items-center justify-center text-center cursor-pointer hover:opacity-95 transition-all ${solStyle.shadow}`}
                title={`View ${sol.name} Chart`}
              >
                <span className="text-[11px] font-bold leading-none">{sol.symbol}</span>
                <span className="font-mono text-[9px] mt-0.5">
                  {sol.change24h >= 0 ? '+' : ''}
                  {sol.change24h.toFixed(2)}%
                </span>
              </div>
            )}

            {/* XRP (Col 2) */}
            {xrp && (
              <div
                onClick={() => handleTileClick(xrp)}
                className={`col-span-2 ${xrpStyle.bg} ${xrpStyle.text} p-1.5 rounded-lg flex items-center justify-between px-2 font-bold cursor-pointer hover:opacity-95 transition-all ${xrpStyle.shadow}`}
                title={`View ${xrp.name} Chart`}
              >
                <span className="text-[11px] font-bold">{xrp.symbol}</span>
                <span className="font-mono text-[10px]">
                  {xrp.change24h >= 0 ? '+' : ''}
                  {xrp.change24h.toFixed(2)}%
                </span>
              </div>
            )}

            {/* DOGE */}
            {doge && (
              <div
                onClick={() => handleTileClick(doge)}
                className={`${dogeStyle.bg} ${dogeStyle.text} p-1.5 rounded-lg flex flex-col items-center justify-center text-center cursor-pointer hover:opacity-95 transition-all ${dogeStyle.shadow}`}
                title={`View ${doge.name} Chart`}
              >
                <span className="text-[10px] font-bold leading-none">{doge.symbol}</span>
                <span className="font-mono text-[8px] mt-0.5">
                  {doge.change24h >= 0 ? '+' : ''}
                  {doge.change24h.toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Caption footer */}
      <div className="text-[9px] font-mono text-text-muted flex items-center justify-between pt-0.5">
        <span>Tile area scaled to market capitalization</span>
        <span className="text-oracle-synced">Live 60s Rebalance</span>
      </div>
    </section>
  );
};

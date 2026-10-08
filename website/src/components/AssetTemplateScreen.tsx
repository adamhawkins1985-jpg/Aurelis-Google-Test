import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowLeftRight, Copy, ExternalLink, Send, Download, Star, TrendingUp, Activity, Wallet } from 'lucide-react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { CoinIcon } from './CoinIcon';
import { NetworkIcon } from './NetworkIcon';
import { CoinData, WalletHolding, NavigationTab, Timeframe } from '../types';
import { fetchLiveOHLC, generateTechnicalChartData } from '../services/marketData';

interface AssetTemplateScreenProps {
  coin: CoinData;
  holding: WalletHolding;
  address?: string;
  onBack: () => void;
  onOpenTrade?: (coin: CoinData) => void;
  onNavigate?: (tab: NavigationTab) => void;
}

export const AssetTemplateScreen: React.FC<AssetTemplateScreenProps> = ({
  coin,
  holding,
  address = '',
  onBack,
  onOpenTrade,
  onNavigate,
}) => {
  const price = Number(coin.price || holding.price || 0);
  const change24h = Number(coin.change24h ?? holding.change24h ?? 0);
  const valueUsd = Number(holding.amount || 0) * price;
  const network = holding.chain || coin.symbol;
  const networkLabel = (() => {
    const raw = String(network || '').toLowerCase();
    if (raw === 'base') return 'Base';
    if (raw === 'arbitrum') return 'Arbitrum';
    if (raw === 'ethereum') return 'Ethereum';
    if (raw === 'optimism') return 'Optimism';
    if (raw === 'polygon') return 'Polygon';
    return String(network || '');
  })();
  const assetDisplayName = coin.symbol.toUpperCase() === 'ETH' && networkLabel
    ? `${networkLabel} ETH`
    : coin.name;

  const [timeframe, setTimeframe] = useState<Timeframe>('24H');
  const [realOHLC, setRealOHLC] = useState<any>(null);
  const [isLoadingChart, setIsLoadingChart] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [sendRecipient, setSendRecipient] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendStatus, setSendStatus] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    setIsLoadingChart(true);
    fetchLiveOHLC(coin.symbol, timeframe)
      .then((data) => {
        if (!active) return;
        setRealOHLC(data);
        setIsLoadingChart(false);
      })
      .catch(() => {
        if (!active) return;
        setRealOHLC(null);
        setIsLoadingChart(false);
      });
    return () => { active = false; };
  }, [coin.symbol, timeframe]);

  useEffect(() => {
    if (!showReceive && !showSend) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = oldOverflow; };
  }, [showReceive, showSend]);

  useEffect(() => {
    const w = window as any;
    const previous = w.aurelisEmbeddedApprovalResult;
    w.aurelisEmbeddedApprovalResult = (raw: string) => {
      let result: any = null;
      try { result = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { result = null; }
      if (result?.status === 'approved') {
        setSendStatus('Approved. Opening secure wallet send...');
        setShowSend(false);
        const bridge = w.AurelisNative;
        if (bridge && typeof bridge.openNativeScreen === 'function') bridge.openNativeScreen('send');
      } else if (result?.status === 'denied') {
        setSendStatus('Send denied.');
      } else if (result?.error) {
        setSendStatus(String(result.error));
      }
    };
    return () => { w.aurelisEmbeddedApprovalResult = previous; };
  }, []);

  const chartData = useMemo(() => {
    if (realOHLC?.points?.length) return realOHLC;
    return generateTechnicalChartData(coin, timeframe);
  }, [realOHLC, coin, timeframe]);

  const chartPath = useMemo(() => {
    const points = chartData?.points || [];
    if (!points.length) return '';
    const width = 420;
    const height = 150;
    const min = Number(chartData.minPrice ?? Math.min(...points.map((p: any) => p.price)));
    const max = Number(chartData.maxPrice ?? Math.max(...points.map((p: any) => p.price)));
    const range = max - min || 1;
    return points.map((point: any, index: number) => {
      const x = (index / Math.max(1, points.length - 1)) * width;
      const y = height - ((point.price - min) / range) * height;
      return (index === 0 ? 'M ' : 'L ') + x + ' ' + y;
    }).join(' ');
  }, [chartData]);

  const statRows = [
    ['24H HIGH', Number(coin.high24h ?? price).toLocaleString(undefined, { style: 'currency', currency: 'USD' })],
    ['24H LOW', Number(coin.low24h ?? price).toLocaleString(undefined, { style: 'currency', currency: 'USD' })],
    ['VOLUME', '$' + Number(coin.volume24h || 0).toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 })],
    ['MARKET CAP', '$' + Number(coin.marketCap || 0).toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 })],
  ];

  const copyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const submitSend = () => {
    if (!sendRecipient.trim() || !sendAmount.trim()) return;
    setSendStatus('Waiting for approval...');
    const w = window as any;
    w.__aurelisPendingSend = {
      assetId: holding.assetId || '',
      symbol: coin.symbol,
      network,
      recipient: sendRecipient.trim(),
      amount: sendAmount.trim(),
    };
    const bridge = w.AurelisNative;
    if (bridge && typeof bridge.requestTradeApproval === 'function') {
      bridge.requestTradeApproval(JSON.stringify({
        action: 'send',
        asset: coin.symbol,
        amount: sendAmount,
        recipient: sendRecipient.trim(),
        details: { network },
      }));
    }
  };

  return (
    <div className="w-full text-text-primary font-mono">
      <main className="space-y-2.5">
          <div className="flex items-center justify-between">
            <button onClick={onBack} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-panel border border-white/10 text-[11px] font-bold text-text-secondary">
              <ArrowLeft className="w-3.5 h-3.5 text-primary-container" /> Back
            </button>
            <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-panel border border-white/10 text-[10px] text-text-secondary">
              <NetworkIcon network={network} size="xs" /> {networkLabel}
            </span>
          </div>

          <section className="rounded-xl bg-surface-panel/85 border border-white/10 p-3 sm:p-4 shadow-[0_10px_28px_rgba(0,0,0,0.28)]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <CoinIcon
                  symbol={coin.symbol}
                  name={coin.name}
                  color={coin.color}
                  iconSymbol={coin.iconSymbol}
                  imageUrl={coin.imageUrl}
                  size="xl"
                  className="shadow-[0_0_16px_rgba(0,245,160,0.14)]"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="font-headline font-bold text-lg sm:text-xl text-text-primary truncate">{assetDisplayName}</h1>
                    <span className="text-[10px] text-cyan-400 font-bold">{coin.symbol}/USD</span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="font-mono font-bold text-2xl sm:text-3xl tracking-tight">
                      {price.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                    </span>
                    <span className={'text-[11px] font-bold ' + (change24h >= 0 ? 'text-oracle-synced' : 'text-status-error')}>
                      {change24h >= 0 ? '▲ +' : '▼ '}{Math.abs(change24h).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
              <button className="p-2 rounded-lg bg-surface-container border border-white/10 text-primary-container">
                <Star className="w-4 h-4 fill-primary-container" />
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1 bg-surface-canvas/80 p-0.5 rounded-md border border-white/5 text-[10px]">
                {(['15m','1H','24H','7D'] as Timeframe[]).map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setTimeframe(tf)}
                    className={'px-2 py-1 rounded transition-all cursor-pointer ' + (timeframe === tf ? 'bg-primary-container text-surface-canvas font-bold' : 'text-text-muted hover:text-text-primary')}
                  >
                    {tf}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-[9px] text-text-muted">
                <span>Historical OHLC</span>
                <span className="text-white/20">·</span>
                <span>{timeframe}</span>
              </div>
            </div>
            <div className="mt-2 relative h-[190px] bg-surface-canvas rounded-xl border border-white/5 overflow-hidden">
              <div className="absolute inset-0 opacity-20 bg-[linear-gradient(to_right,#ffffff12_1px,transparent_1px),linear-gradient(to_bottom,#ffffff12_1px,transparent_1px)] bg-[size:44px_44px]" />
              <div className="absolute top-2 left-3 z-10 text-[9px] bg-surface-container-high/90 px-2 py-0.5 rounded border border-white/10 text-text-muted">
                LIVE PRICE <span className="text-primary-container font-bold">{price.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</span>
              </div>
              {isLoadingChart && (
                <div className="absolute top-2 right-3 z-10 text-[9px] text-text-muted">Loading {timeframe}…</div>
              )}
              <svg viewBox="0 0 420 150" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
                <defs>
                  <linearGradient id="assetLiveFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00f5a0" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#00f5a0" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={chartPath ? chartPath + ' L 420 150 L 0 150 Z' : ''} fill="url(#assetLiveFill)" />
                <path d={chartPath} fill="none" stroke="#00f5a0" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
          </section>
          <section className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-2.5">
            <div className="rounded-xl bg-surface-panel/85 border border-white/10 p-3 sm:p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-[9px] text-text-muted uppercase tracking-wider">Your Position</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl sm:text-2xl font-bold">
                      {holding.amount.toLocaleString(undefined, { maximumFractionDigits: 8 })} {coin.symbol}
                    </span>
                    <span className="text-[11px] text-text-secondary">
                      {valueUsd.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                    </span>
                  </div>
                </div>
                <Wallet className="w-5 h-5 text-primary-container" />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                {[
                  ['PRICE', price.toLocaleString(undefined, { style: 'currency', currency: 'USD' })],
                  ['24H', (change24h >= 0 ? '+' : '') + change24h.toFixed(1) + '%'],
                  ['BALANCE', holding.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })],
                  ['NETWORK', network],
                ].map(([label,value]) => (
                  <div key={label} className="rounded-lg bg-surface-canvas/80 border border-white/5 p-2.5">
                    <div className="text-[9px] text-text-muted">{label}</div>
                    <div className={'text-[12px] font-bold mt-1 ' + (label === '24H' ? (change24h >= 0 ? 'text-oracle-synced' : 'text-status-error') : '')}>{value}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button onClick={() => {
                  const bridge = (window as any).AurelisNative;
                  if (bridge && typeof bridge.openNativeScreen === 'function') {
                    bridge.openNativeScreen('receive');
                    return;
                  }
                  setShowReceive(true);
                }} className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-primary-container text-on-primary-container font-bold text-[11px]">
                  <Download className="w-3.5 h-3.5" /> Receive
                </button>
                <button onClick={() => {
                  const bridge = (window as any).AurelisNative;
                  if (bridge && typeof bridge.openNativeScreen === 'function') {
                    bridge.openNativeScreen('send');
                    return;
                  }
                  setShowSend(true);
                }} className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-surface-container border border-primary-container/40 text-primary-container font-bold text-[11px]">
                  <Send className="w-3.5 h-3.5" /> Send
                </button>
                <button onClick={() => {
                  const bridge = (window as any).AurelisNative;
                  if (bridge && typeof bridge.openNativeScreen === 'function') {
                    bridge.openNativeScreen('swap');
                    return;
                  }
                  onOpenTrade?.(coin);
                }} className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-surface-container border border-white/10 text-text-primary font-bold text-[11px]">
                  <ArrowLeftRight className="w-3.5 h-3.5" /> Swap
                </button>
                <button onClick={() => onOpenTrade?.(coin)} className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-surface-container border border-white/10 text-text-primary font-bold text-[11px]">
                  <TrendingUp className="w-3.5 h-3.5" /> Trade
                </button>
              </div>
              <div className="mt-3 rounded-lg bg-surface-canvas/70 border border-white/5 p-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[9px] text-text-muted uppercase">Wallet Address</div>
                  <div className="text-[10px] sm:text-[11px] text-text-secondary truncate mt-1">{address || 'Address unavailable'}</div>
                </div>
                <button onClick={copyAddress} className="p-2 rounded-md text-primary-container shrink-0">
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="rounded-xl bg-surface-panel/85 border border-white/10 p-3 sm:p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <Activity className="w-4 h-4 text-cyan-400" />
                <span className="font-headline font-bold text-sm">Market Stats</span>
              </div>
              <div className="space-y-2">
                {statRows.map(([label,value]) => (
                  <div key={label} className="flex items-center justify-between border-b border-white/5 pb-2 last:border-0">
                    <span className="text-[9px] text-text-muted">{label}</span>
                    <span className="text-[11px] text-text-primary font-bold">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className="rounded-xl bg-surface-panel/85 border border-white/10 p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-headline font-bold text-sm">Asset Status</span>
                <div className="text-[10px] text-text-muted mt-1">Native {networkLabel} balance · live market pricing · {timeframe} historical chart</div>
              </div>
              <span className="text-[9px] px-2 py-1 rounded bg-primary-container/10 border border-primary-container/20 text-primary-container">SYNCED</span>
            </div>
          </section>

          <section className="rounded-xl bg-surface-panel/85 border border-white/10 p-3 sm:p-4 flex items-center justify-between">
            <div>
              <div className="font-headline font-bold text-sm">About {assetDisplayName}</div>
              <p className="text-[10px] sm:text-[11px] text-text-secondary mt-1.5 leading-relaxed max-w-3xl">
                Live asset detail using the existing AURELIS card system, wallet balance, market price feed, and historical chart data.
              </p>
            </div>
            <ExternalLink className="w-4 h-4 text-text-muted shrink-0" />
          </section>
        </main>

      {showReceive && createPortal(
        <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowReceive(false)}>
          <div className="w-full max-w-sm bg-surface-panel border border-white/15 rounded-2xl p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-headline font-bold text-base">Receive {coin.symbol}</h3>
              <button onClick={() => setShowReceive(false)} className="text-text-muted hover:text-text-primary text-lg">×</button>
            </div>
            <div className="flex justify-center bg-white rounded-xl p-3 w-fit mx-auto">
              {address ? <QRCodeSVG value={address} size={150} level="M" /> : null}
            </div>
            <div className="text-[10px] text-text-muted text-center">{network}</div>
            <div className="p-3 rounded-lg bg-surface-canvas border border-white/10 text-[10px] break-all text-text-secondary">{address || 'Address unavailable'}</div>
            <button disabled={!address} onClick={copyAddress} className="w-full py-2.5 rounded-lg bg-primary-container text-on-primary-container font-bold text-[11px] disabled:opacity-40">
              {copied ? 'Copied' : 'Copy Address'}
            </button>
          </div>
        </div>,
        document.body
      )}
      {showSend && createPortal(
        <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowSend(false)}>
          <div className="w-full max-w-sm bg-surface-panel border border-white/15 rounded-2xl p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-headline font-bold text-base">Send {coin.symbol}</h3>
              <button onClick={() => setShowSend(false)} className="text-text-muted hover:text-text-primary text-lg">×</button>
            </div>
            <div className="rounded-lg bg-surface-canvas border border-white/10 p-3">
              <div className="text-[9px] text-text-muted">AVAILABLE</div>
              <div className="text-sm font-bold mt-1">{holding.amount.toLocaleString(undefined, { maximumFractionDigits: 8 })} {coin.symbol}</div>
              <div className="text-[9px] text-text-muted mt-1">{network}</div>
            </div>
            <label className="block text-[10px] text-text-muted">
              Recipient
              <input value={sendRecipient} onChange={(e) => setSendRecipient(e.target.value)} className="mt-1 w-full bg-surface-canvas border border-white/10 rounded-lg px-3 py-2 text-[11px] text-text-primary outline-none focus:border-primary-container/50" placeholder="Wallet address" />
            </label>
            <label className="block text-[10px] text-text-muted">
              Amount
              <input value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} className="mt-1 w-full bg-surface-canvas border border-white/10 rounded-lg px-3 py-2 text-[11px] text-text-primary outline-none focus:border-primary-container/50" placeholder={'0.00 ' + coin.symbol} />
            </label>
            <button onClick={submitSend} disabled={!sendRecipient.trim() || !sendAmount.trim()} className="w-full py-2.5 rounded-lg bg-primary-container text-on-primary-container font-bold text-[11px] disabled:opacity-40">
              Review Send
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

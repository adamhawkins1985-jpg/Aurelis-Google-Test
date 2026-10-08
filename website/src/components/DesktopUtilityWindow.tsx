import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Send, X } from 'lucide-react';
import { CoinData } from '../types';
import { getLatestWalletPortfolio } from '../services/walletApi';

interface Props {
  kind: 'chat' | 'notes' | 'livebet';
  coins: CoinData[];
  selectedCoin: CoinData;
}

export const DesktopUtilityWindow: React.FC<Props> = ({ kind, coins, selectedCoin }) => {
  const [notes, setNotes] = useState(() => localStorage.getItem('aurelis_quick_notes') || '');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [positions, setPositions] = useState<any[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (kind === 'notes') localStorage.setItem('aurelis_quick_notes', notes);
  }, [kind, notes]);

  const loadLive = async () => {
    setLiveLoading(true);
    try {
      const r = await fetch('/api/kraken/live-status', { cache: 'no-store', credentials: 'include' });
      const d = await r.json();
      if (r.ok && d?.ok && Array.isArray(d.positions)) setPositions(d.positions);
    } finally {
      setLiveLoading(false);
    }
  };

  useEffect(() => {
    if (kind !== 'livebet') return;
    loadLive();
    const t = window.setInterval(loadLive, 5000);
    return () => window.clearInterval(t);
  }, [kind]);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setInput('');
    setLoading(true);
    try {
      const r = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: q,
          coinSymbol: selectedCoin.symbol,
          coinName: selectedCoin.name,
          currentPrice: selectedCoin.price,
          change24h: selectedCoin.change24h,
          timeframe: '1H',
          marketUniverse: coins,
          history: messages,
        }),
      });
      const d = await r.json();
      let reply = d?.reply || 'No response.';
      if (d?.action?.kind === 'swap_plan') {
        try {
          const sourceSymbol = String(d.action.sourceSymbol || '').toUpperCase();
          const targetSymbol = String(d.action.targetSymbol || '').toUpperCase();
          const portfolio = await getLatestWalletPortfolio();
          const sourceHoldings = portfolio.filter((holding) => holding.symbol.toUpperCase() === sourceSymbol && Number(holding.amount) > 0);
          const sourceChains = [...new Set(sourceHoldings.map((holding) => String(holding.chain || '').toLowerCase()).filter(Boolean))];
          if (sourceChains.length > 1 && !d.action.targetChain) {
            reply += `\n\nYour ${sourceSymbol} is on multiple networks. Pick one destination network for the ${targetSymbol} balance: Ethereum, Base, or Arbitrum. I will not split the destination across networks.`;
            setMessages((m) => [...m, { role: 'model', text: reply }]);
            return;
          }
          const actionableHoldings = sourceSymbol === targetSymbol && d.action.targetChain
            ? sourceHoldings.filter((holding) => String(holding.chain || '').toLowerCase() !== String(d.action.targetChain).toLowerCase())
            : sourceHoldings;
          const legs = await Promise.all(actionableHoldings.map(async (holding) => {
            const sourceChain = String(holding.chain || '').toLowerCase();
            const balance = Number(holding.amount);
            let gasReserve: number | null = sourceSymbol === 'ETH' ? null : 0;
            if (sourceSymbol === 'ETH' && ['ethereum','base','arbitrum'].includes(sourceChain)) {
              try {
                const gasResponse = await fetch('/api/wallet/native-gas-reserve?chain=' + encodeURIComponent(sourceChain), { cache:'no-store' });
                const gasData = await gasResponse.json();
                if (gasResponse.ok && gasData?.ok) gasReserve = Number(gasData.reserveEth || 0);
              } catch {}
            }
            return {
              sourceSymbol,
              targetSymbol,
              sourceChain,
              targetChain: d.action.targetChain || null,
              assetId: holding.assetId || '',
              balance,
              gasReserve,
              spendableBalance: gasReserve === null ? null : Math.max(0, balance - gasReserve),
              amountMode: 'all_spendable',
              providerPreference: sourceSymbol === 'ETH' ? 'changenow' : 'best',
            };
          }));
          if (legs.length) {
            const plan = {
              id: 'ai-swap-' + Date.now(),
              sourceSymbol,
              targetSymbol,
              targetChain: d.action.targetChain || null,
              amountMode: 'all_spendable',
              requiresReview: true,
              createdAt: Date.now(),
              legs,
            };
            localStorage.setItem('aurelis_ai_swap_plan', JSON.stringify(plan));
            reply += `\n\nPrepared ${legs.length} wallet leg${legs.length === 1 ? '' : 's'} and sent all ${legs.length} to Trade & Swap.`;
            const bridge = (window as any).AurelisDesktop;
            if (bridge?.navigateMain) await bridge.navigateMain({ tab:'trade', action:'ai-swap-plan', plan });
          } else {
            reply += `\n\nI could not find a spendable ${sourceSymbol} balance in the connected wallet.`;
          }
        } catch (error:any) {
          reply += `\n\nI understood the swap command, but the wallet portfolio could not be loaded: ${error?.message || 'unknown error'}.`;
        }
      }
      setMessages((m) => [...m, { role: 'model', text: reply }]);
    } catch {
      setMessages((m) => [...m, { role: 'model', text: 'AI connection unavailable.' }]);
    } finally {
      setLoading(false);
    }
  };

  const closePosition = async (txid: string) => {
    if (!window.confirm('Close this Kraken margin position at market now?')) return;
    setBusy(txid);
    try {
      const r = await fetch('/api/kraken/close-position', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txid }),
      });
      const d = await r.json();
      if (!r.ok || !d?.ok) throw new Error(d?.error || 'Close failed');
      await loadLive();
    } catch (e: any) {
      window.alert(e?.message || 'Close failed');
    } finally {
      setBusy('');
    }
  };

  const title = useMemo(() => kind === 'chat' ? 'AURELIS AI' : kind === 'notes' ? 'AURELIS Notes' : 'Live Bet', [kind]);
  const isAndroidEmbed =
    new URLSearchParams(window.location.search).get('embed') === 'android' ||
    Boolean((window as any).__AURELIS_ANDROID_APP__) ||
    window.localStorage.getItem('aurelis_android_active_utility') === kind;
  const [viewportHeight, setViewportHeight] = useState(() =>
    Math.max(1, Math.round(window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 1)),
  );

  useEffect(() => {
    const updateViewportHeight = () => {
      setViewportHeight(
        Math.max(1, Math.round(window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 1)),
      );
    };
    window.addEventListener('resize', updateViewportHeight);
    window.visualViewport?.addEventListener('resize', updateViewportHeight);
    return () => {
      window.removeEventListener('resize', updateViewportHeight);
      window.visualViewport?.removeEventListener('resize', updateViewportHeight);
    };
  }, []);

  return (
    <main
      style={isAndroidEmbed ? { height: viewportHeight, minHeight: viewportHeight } : undefined}
      className="h-screen bg-surface-canvas text-text-primary font-mono flex flex-col overflow-hidden"
    >
      <header className="h-11 px-3 flex items-center justify-between border-b border-white/10 bg-surface-panel shrink-0">
        <div>
          <div className="text-[11px] font-black tracking-wider text-primary-container">{title}</div>
          <div className="text-[9px] text-text-muted">{kind === 'livebet' ? 'Kraken positions' : kind === 'notes' ? 'Autosaves locally' : selectedCoin.symbol + ' context'}</div>
        </div>
        <div className="flex items-center gap-2">
          {isAndroidEmbed && (
            <button
              type="button"
              onClick={() => {
                window.localStorage.removeItem('aurelis_android_active_utility');
                if (window.history.length > 1) {
                  window.history.back();
                  return;
                }
                const url = new URL(window.location.href);
                url.searchParams.delete('utility');
                url.searchParams.delete('embed');
                window.history.replaceState({}, '', url.pathname + url.search + url.hash);
                window.dispatchEvent(new CustomEvent('aurelis:close-utility'));
              }}
              className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[9px] font-bold text-text-secondary"
            >
              BACK
            </button>
          )}
          {kind === 'livebet' && (
            <button onClick={loadLive} className="p-1.5 rounded-lg hover:bg-white/5 text-text-muted">
              <RefreshCw className={`w-4 h-4 ${liveLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </header>

      {kind === 'notes' && (
        <div className="flex-1 p-3 min-h-0">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full h-full resize-none rounded-xl border border-white/10 bg-surface-panel p-3 outline-none text-[12px] leading-relaxed text-text-primary"
            placeholder="Type notes here..."
          />
        </div>
      )}

      {kind === 'chat' && (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
            {messages.length === 0 && (
              <div className="h-full flex items-center justify-center text-center text-[10px] text-text-muted px-6">
                Ask about markets, Trade Radar, wallet assets, or an open trade.
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[92%] rounded-xl px-3 py-2.5 text-[10.5px] leading-relaxed whitespace-pre-wrap break-words ${
                  m.role === 'user'
                    ? 'ml-auto bg-primary-container/15 border border-primary-container/20'
                    : 'mr-auto bg-surface-panel border border-white/5'
                }`}
              >
                {m.text}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-[10px] text-text-muted">
                <Loader2 className="w-3 h-3 animate-spin" />
                Thinking…
              </div>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="p-3 border-t border-white/10 bg-surface-panel"
          >
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-surface-base px-3 py-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1 min-w-0 bg-transparent outline-none text-[11px]"
                placeholder="Ask AURELIS AI…"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="p-1.5 rounded-lg bg-primary-container text-on-primary-container disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </>
      )}

      {kind === 'livebet' && (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
          {positions.length === 0 && !liveLoading && (
            <div className="h-full flex items-center justify-center text-[10px] text-text-muted">
              No open Kraken positions.
            </div>
          )}
          {positions.map((p: any) => (
            <div key={p.txid} className="rounded-xl border border-white/10 bg-surface-panel p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <strong className="text-[12px]">{p.pair}</strong>
                    <span className={`text-[9px] font-bold ${p.side === 'buy' ? 'text-primary-container' : 'text-red-400'}`}>
                      {p.side === 'buy' ? 'LONG' : 'SHORT'}
                    </span>
                  </div>
                  <div className={`mt-1 text-[15px] font-bold ${Number(p.pnl) >= 0 ? 'text-primary-container' : 'text-red-400'}`}>
                    {Number(p.pnl) >= 0 ? '+' : ''}{Number(p.pnl || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })}
                  </div>
                </div>
                <button
                  onClick={() => closePosition(p.txid)}
                  disabled={busy === p.txid}
                  className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-[9px] font-bold disabled:opacity-40"
                >
                  {busy === p.txid ? 'CLOSING…' : 'CLOSE'}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                {[
                  ['SIZE', Number(p.remaining || 0).toLocaleString('en-US', { maximumFractionDigits: 8 })],
                  ['MARGIN', Number(p.margin || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })],
                  ['VALUE', Number(p.value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-surface-base border border-white/5 p-2">
                    <div className="text-[8px] text-text-muted">{label}</div>
                    <div className="text-[9px]">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
};

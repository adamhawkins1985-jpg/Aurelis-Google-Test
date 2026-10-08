import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Loader2, Send, Sparkles, X } from 'lucide-react';
import { CoinData } from '../types';
import { playHudSound } from '../services/marketData';

interface MobileAiChatBarProps {
  coins: CoinData[];
  selectedCoin: CoinData;
  soundEnabled: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
}

export const MobileAiChatBar: React.FC<MobileAiChatBarProps> = ({
  coins,
  selectedCoin,
  soundEnabled,
}) => {
  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [viewport, setViewport] = useState(() => ({
    top: window.visualViewport?.offsetTop || 0,
    height: window.visualViewport?.height || window.innerHeight,
  }));
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    const updateViewport = () => setViewport({
      top: vv?.offsetTop || 0,
      height: vv?.height || window.innerHeight,
    });
    updateViewport();
    vv?.addEventListener('resize', updateViewport);
    vv?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    return () => {
      vv?.removeEventListener('resize', updateViewport);
      vv?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  useEffect(() => {
    if (expanded) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, loading, expanded]);
  const send = async () => {
    const query = input.trim();
    if (!query || loading) return;
    if (soundEnabled) playHudSound('click');

    const userMessage: ChatMessage = {
      id: 'u-' + Date.now(),
      role: 'user',
      text: query,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setExpanded(true);
    setLoading(true);

    try {
      const response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          coinSymbol: selectedCoin.symbol,
          coinName: selectedCoin.name,
          currentPrice: selectedCoin.price,
          change24h: selectedCoin.change24h,
          timeframe: '1H',
          marketUniverse: coins
            .filter((c) => Number(c.volume24h || 0) > 0)
            .map((c) => ({
              symbol: c.symbol,
              name: c.name,
              price: c.price,
              change24h: c.change24h,
              volume24h: c.volume24h,
              marketCap: c.marketCap,
            })),
          history: messages.map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const data = await response.json();
      const reply = data?.reply || 'AURELIS AI did not return a response.';
      setMessages((prev) => [
        ...prev,
        { id: 'a-' + Date.now(), role: 'model', text: reply },
      ]);
      if (soundEnabled) playHudSound('ping');
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: 'e-' + Date.now(), role: 'model', text: 'AI connection unavailable.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const inputRow = (
    <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl border border-white/10 bg-surface-base">
      <Sparkles className="w-3.5 h-3.5 text-primary-container shrink-0" />
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onFocus={() => setExpanded(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') send();
        }}
        placeholder="Ask AURELIS AI…"
        className="flex-1 min-w-0 bg-transparent outline-none text-[11px] font-mono text-text-primary placeholder:text-text-muted"
      />
      <button
        type="button"
        onClick={send}
        disabled={!input.trim() || loading}
        className="p-1.5 rounded-lg bg-primary-container text-on-primary-container disabled:opacity-40"
        title="Send"
      >
        <Send className="w-3 h-3" />
      </button>
    </div>
  );
  return (
    <div className="md:hidden fixed left-0 right-0 bottom-[64px] z-[10020] w-full px-3 pointer-events-none">
      <div className="max-w-md mx-auto pointer-events-auto">
        {!expanded && (
          <div
            onClick={() => setExpanded(true)}
            className="rounded-xl bg-surface-panel/98 shadow-[0_-4px_18px_rgba(0,0,0,0.55)]"
          >
            {inputRow}
          </div>
        )}

        {expanded && createPortal(
          <div
            className="md:hidden fixed left-3 right-3 z-[10050] rounded-2xl border border-white/10 bg-[#0b0f14] shadow-[0_18px_60px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden"
            style={{
              top: `${Math.max(8, viewport.top + 8)}px`,
              height: `${Math.max(260, viewport.height - 88)}px`,
            }}
          >
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-white/10 bg-surface-panel shrink-0">
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary-container/12 border border-primary-container/30 text-primary-container text-[10px] font-bold"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="w-3.5 h-3.5 text-primary-container shrink-0" />
                <span className="text-[10px] font-mono font-bold truncate">AURELIS AI</span>
              </div>
              <button
                type="button"
                onClick={() => setMessages([])}
                className="p-1.5 text-text-muted hover:text-text-primary"
                title="Clear conversation"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2.5">
              {messages.length === 0 && (
                <div className="min-h-[180px] flex items-center justify-center text-center px-5 text-[10.5px] leading-relaxed text-text-muted">
                  Ask about markets, Trade Radar, Live Bet, wallet assets, or current buying pressure.
                </div>
              )}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[92%] text-[10.5px] leading-relaxed rounded-xl px-3 py-2.5 break-words whitespace-pre-wrap ${
                    message.role === 'user'
                      ? 'ml-auto bg-primary-container/12 text-text-primary border border-primary-container/15'
                      : 'mr-auto bg-surface-panel text-text-secondary border border-white/5'
                  }`}
                >
                  {message.text}
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-[10px] text-text-muted">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Checking live AURELIS data…
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div className="p-2.5 border-t border-white/10 bg-surface-panel shrink-0">
              {inputRow}
            </div>
          </div>,
          document.body,
        )}
      </div>
    </div>
  );
};

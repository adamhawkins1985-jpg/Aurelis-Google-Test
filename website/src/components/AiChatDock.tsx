import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Send, Sparkles, X, NotepadText, Globe2, ArrowLeft, ArrowRight, RefreshCw, Minus, Maximize2, Minimize2, ExternalLink, ChartNoAxesCombined, Radar } from 'lucide-react';
import { CoinData, NavigationTab, WalletHolding } from '../types';
import { playHudSound } from '../services/marketData';

type Geometry = {
  railLeft: number;
  railTop: number;
  drawerLeft: number;
  drawerTop: number;
  drawerHeight: number;
  drawerWidth: number;
};

interface AiChatDockProps {
  coins: CoinData[];
  selectedCoin: CoinData;
  soundEnabled: boolean;
  holdings?: WalletHolding[];
  onNavigate?: (tab: NavigationTab) => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
}

function useLeftDockGeometry(): Geometry | null {
  const [geometry, setGeometry] = useState<Geometry | null>(null);

  useEffect(() => {
    const update = () => {
      const hud = document.getElementById('hudWidget');
      const isDesktopApp = Boolean((window as any).AurelisDesktop?.isDesktop);
      if (!hud || (!isDesktopApp && window.innerWidth < 1100)) {
        setGeometry(null);
        return;
      }

      const rect = hud.getBoundingClientRect();
      const railLeft = Math.max(8, Math.round(rect.left - 48));
      const drawerRight = railLeft - 8;
      const available = drawerRight - 16;
      const drawerWidth = isDesktopApp ? Math.min(360, Math.max(300, Math.floor(rect.width - 32))) : Math.min(360, Math.floor(available));
      const drawerLeft = isDesktopApp ? Math.round(rect.left + 16) : Math.max(16, drawerRight - drawerWidth);

      if (!isDesktopApp && drawerWidth < 250) {
        setGeometry(null);
        return;
      }

      setGeometry({
        railLeft,
        railTop: Math.max(16, Math.round(rect.top)) + 78,
        drawerLeft,
        drawerTop: Math.max(16, Math.min(Math.round(rect.top + 78), window.innerHeight - 436)),
        drawerHeight: 420,
        drawerWidth,
      });
    };

    update();
    window.addEventListener('resize', update);
    const hud = document.getElementById('hudWidget');
    const observer = hud && 'ResizeObserver' in window ? new ResizeObserver(update) : null;
    if (hud && observer) observer.observe(hud);

    return () => {
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, []);

  return geometry;
}

export const AiChatDock: React.FC<AiChatDockProps> = ({ coins, selectedCoin, soundEnabled, holdings = [], onNavigate }) => {
  const geometry = useLeftDockGeometry();
  const [open, setOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('aurelis_quick_notes') || '';
  });
  const [browserOpen, setBrowserOpen] = useState(false);
  const [browserMaximized, setBrowserMaximized] = useState(false);
  const [browserUrlInput, setBrowserUrlInput] = useState('https://www.google.com');
  const [browserHistory, setBrowserHistory] = useState<string[]>(['https://www.google.com']);
  const [browserHistoryIndex, setBrowserHistoryIndex] = useState(0);
  const [browserRefreshKey, setBrowserRefreshKey] = useState(0);
  const [browserRect, setBrowserRect] = useState({ left: 90, top: 90, width: 860, height: 620 });
  const dragState = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [chatPos, setChatPos] = useState<{left:number;top:number}|null>(null);
  const [notesPos, setNotesPos] = useState<{left:number;top:number}|null>(null);
  const [livePos, setLivePos] = useState<{left:number;top:number}|null>(null);
  const popupDrag = useRef<{kind:'chat'|'notes'|'live';x:number;y:number;left:number;top:number}|null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [liveBetCount, setLiveBetCount] = useState(0);
  const [liveBetPopupOpen, setLiveBetPopupOpen] = useState(false);
  const [livePositions, setLivePositions] = useState<any[]>([]);
  const [liveBetLoading, setLiveBetLoading] = useState(false);
  const [liveBetActionBusy, setLiveBetActionBusy] = useState('');
  const endRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    const move = (event: PointerEvent) => {
      const d = popupDrag.current;
      if (!d) return;
      const width = d.kind === 'live' ? 360 : (geometry?.drawerWidth || 340);
      const left = Math.max(4, Math.min(window.innerWidth - width - 4, d.left + event.clientX - d.x));
      const top = Math.max(4, Math.min(window.innerHeight - 80, d.top + event.clientY - d.y));
      const next = { left, top };
      if (d.kind === 'chat') setChatPos(next);
      else if (d.kind === 'notes') setNotesPos(next);
      else setLivePos(next);
    };
    const up = () => { popupDrag.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [geometry]);

  const loadLiveBetDock = async () => {
    setLiveBetLoading(true);
    try {
      const response = await fetch('/api/kraken/live-status', { cache: 'no-store', credentials: 'include' });
      const data = await response.json();
      if (response.ok && data?.ok && Array.isArray(data.positions)) {
        setLivePositions(data.positions);
        setLiveBetCount(data.positions.length);
      }
    } catch {} finally {
      setLiveBetLoading(false);
    }
  };

  useEffect(() => {
    loadLiveBetDock();
    const timer = window.setInterval(loadLiveBetDock, 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const openLiveBet = () => {
      const desktopBridge = (window as any).AurelisDesktop;
      if (desktopBridge?.isDesktop && typeof desktopBridge.openUtility === 'function') {
        desktopBridge.openUtility('livebet');
        return;
      }
      setOpen(false);
      setNotesOpen(false);
      setBrowserOpen(false);
      setLiveBetPopupOpen(true);
      loadLiveBetDock();
    };
    window.addEventListener('aurelis-open-livebet', openLiveBet as EventListener);
    return () => window.removeEventListener('aurelis-open-livebet', openLiveBet as EventListener);
  }, []);

  const closeDockPosition = async (txid:string) => {
    if (!window.confirm('Close this Kraken margin position at market now?')) return;
    setLiveBetActionBusy(txid);
    try {
      const response = await fetch('/api/kraken/close-position', {
        method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({txid})
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Close failed');
      await loadLiveBetDock();
      if (soundEnabled) playHudSound('trade');
    } catch {} finally {
      setLiveBetActionBusy('');
    }
  };

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, loading, open]);

  useEffect(() => {
    try { localStorage.setItem('aurelis_quick_notes', notes); } catch {}
  }, [notes]);

  const normalizeBrowserUrl = (raw: string) => {
    const value = raw.trim();
    if (!value) return '';
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
      return parsed.toString();
    } catch {
      return '';
    }
  };

  const navigateBrowser = (raw: string) => {
    const next = normalizeBrowserUrl(raw);
    if (!next) return;
    setBrowserHistory((current) => [...current.slice(0, browserHistoryIndex + 1), next]);
    setBrowserHistoryIndex((current) => current + 1);
    setBrowserUrlInput(next);
    setBrowserRefreshKey((value) => value + 1);
  };

  const goBrowserBack = () => {
    if (browserHistoryIndex <= 0) return;
    const nextIndex = browserHistoryIndex - 1;
    setBrowserHistoryIndex(nextIndex);
    setBrowserUrlInput(browserHistory[nextIndex]);
  };

  const goBrowserForward = () => {
    if (browserHistoryIndex >= browserHistory.length - 1) return;
    const nextIndex = browserHistoryIndex + 1;
    setBrowserHistoryIndex(nextIndex);
    setBrowserUrlInput(browserHistory[nextIndex]);
  };

  const startBrowserDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (browserMaximized) return;
    const target = event.target as HTMLElement;
    if (target.closest('button,input,a')) return;
    dragState.current = { x: event.clientX, y: event.clientY, left: browserRect.left, top: browserRect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveBrowserDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current || browserMaximized) return;
    const dx = event.clientX - dragState.current.x;
    const dy = event.clientY - dragState.current.y;
    const width = browserRect.width;
    const height = browserRect.height;
    setBrowserRect((rect) => ({
      ...rect,
      left: Math.max(8, Math.min(window.innerWidth - Math.min(180, width), dragState.current!.left + dx)),
      top: Math.max(8, Math.min(window.innerHeight - 80, dragState.current!.top + dy)),
    }));
  };

  const endBrowserDrag = () => {
    dragState.current = null;
  };

  const send = async () => {
    const query = input.trim();
    if (!query || loading) return;
    if (soundEnabled) playHudSound('click');

    const userMessage: ChatMessage = { id: `u-${Date.now()}`, role: 'user', text: query };
    setMessages((current) => [...current, userMessage]);
    setInput('');
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
            .filter((coin) => Number(coin.volume24h || 0) > 0)
            .map((coin) => ({
              symbol: coin.symbol,
              name: coin.name,
              price: coin.price,
              change24h: coin.change24h,
              volume24h: coin.volume24h,
              marketCap: coin.marketCap,
            })),
          history: messages.map((message) => ({ role: message.role, text: message.text })),
        }),
      });
      const data = await response.json();
      let reply = data?.reply || 'AURELIS AI did not return a response.';
      if (data?.action?.kind === 'swap_plan') {
        const sourceSymbol = String(data.action.sourceSymbol || '').toUpperCase();
        const targetSymbol = String(data.action.targetSymbol || '').toUpperCase();
        const sourceHoldings = holdings.filter((holding) => holding.symbol.toUpperCase() === sourceSymbol && Number(holding.amount) > 0);
        const sourceChains = [...new Set(sourceHoldings.map((holding) => String(holding.chain || '').toLowerCase()).filter(Boolean))];
        if (sourceChains.length > 1 && !data.action.targetChain) {
          reply += `\n\nYour ${sourceSymbol} is on multiple networks. Pick one destination network for the ${targetSymbol} balance: Ethereum, Base, or Arbitrum. I will not split the destination across networks.`;
          setMessages((current) => [...current, { id: `a-${Date.now()}`, role: 'model', text: reply }]);
          if (soundEnabled) playHudSound('ping');
          return;
        }
        const actionableHoldings = sourceSymbol === targetSymbol && data.action.targetChain
          ? sourceHoldings.filter((holding) => String(holding.chain || '').toLowerCase() !== String(data.action.targetChain).toLowerCase())
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
            targetChain: data.action.targetChain || null,
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
            targetChain: data.action.targetChain || null,
            amountMode: 'all_spendable',
            requiresReview: true,
            createdAt: Date.now(),
            legs,
          };
          localStorage.setItem('aurelis_ai_swap_plan', JSON.stringify(plan));
          window.dispatchEvent(new CustomEvent('aurelis-ai-swap-plan', { detail: { plan } }));
          reply += `\n\nPrepared ${legs.length} wallet leg${legs.length === 1 ? '' : 's'}. Opening all ${legs.length} in Trade & Swap for review.`;
          onNavigate?.('trade');
        } else {
          reply += `\n\nI could not find a spendable ${sourceSymbol} balance in the connected wallet.`;
        }
      }
      setMessages((current) => [...current, { id: `a-${Date.now()}`, role: 'model', text: reply }]);
      if (soundEnabled) playHudSound('ping');
    } catch {
      setMessages((current) => [...current, { id: `e-${Date.now()}`, role: 'model', text: 'AI connection unavailable.' }]);
    } finally {
      setLoading(false);
    }
  };

  if (!geometry) return null;

  return (
    <>
      <aside
        className="fixed z-[80] flex flex-col gap-2"
        style={{ left: geometry.railLeft, top: geometry.railTop }}
        aria-label="AURELIS utility launchers"
      >
        <button
          type="button"
          onClick={() => {
            if (soundEnabled) playHudSound('click');
            const desktopBridge = (window as any).AurelisDesktop;
            if (desktopBridge?.isDesktop && typeof desktopBridge.openUtility === 'function') {
              desktopBridge.openUtility('chat', selectedCoin.symbol);
              return;
            }
            setNotesOpen(false);
            setOpen((value) => !value);
          }}
          title="AURELIS AI Chat"
          className={`group relative w-10 h-10 rounded-xl border bg-surface-panel/95 backdrop-blur-xl shadow-lg flex items-center justify-center transition-all hover:-translate-y-0.5 ${open ? 'border-white/70' : 'border-white/25'}`}
        >
          <img src="/aurelis-icon.svg" alt="" className="w-6 h-6 object-contain" />
          <span className="pointer-events-none absolute left-full ml-2 px-2 py-1 rounded-md bg-surface-canvas border border-white/10 text-text-primary text-[10px] font-medium whitespace-nowrap opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
            AURELIS AI Chat
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (soundEnabled) playHudSound('click');
            const desktopBridge = (window as any).AurelisDesktop;
            if (desktopBridge?.isDesktop && typeof desktopBridge.openUtility === 'function') {
              desktopBridge.openUtility('notes');
              return;
            }
            setOpen(false);
            setNotesOpen((value) => !value);
          }}
          title="AURELIS Notes"
          className={`group relative w-10 h-10 rounded-xl border bg-surface-panel/95 backdrop-blur-xl shadow-lg flex items-center justify-center transition-all hover:-translate-y-0.5 ${notesOpen ? 'border-white/70' : 'border-white/25'}`}
        >
          <NotepadText className="w-5 h-5 text-text-primary" />
          <span className="pointer-events-none absolute left-full ml-2 px-2 py-1 rounded-md bg-surface-canvas border border-white/10 text-text-primary text-[10px] font-medium whitespace-nowrap opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
            AURELIS Notes
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (soundEnabled) playHudSound('click');
            setOpen(false);
            setNotesOpen(false);
            const desktopBridge = (window as any).AurelisDesktop;
            if (desktopBridge && typeof desktopBridge.openBrowser === 'function') {
              desktopBridge.openBrowser(browserHistory[browserHistoryIndex] || browserUrlInput);
              return;
            }
            setBrowserOpen(true);
          }}
          title="AURELIS Browser"
          className={`group relative w-10 h-10 rounded-xl border bg-surface-panel/95 backdrop-blur-xl shadow-lg flex items-center justify-center transition-all hover:-translate-y-0.5 ${browserOpen ? 'border-white/70' : 'border-white/25'}`}
        >
          <Globe2 className="w-5 h-5 text-text-primary" />
          <span className="pointer-events-none absolute left-full ml-2 px-2 py-1 rounded-md bg-surface-canvas border border-white/10 text-text-primary text-[10px] font-medium whitespace-nowrap opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
            AURELIS Browser
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (soundEnabled) playHudSound('click');
            setOpen(false);
            setNotesOpen(false);
            setBrowserOpen(false);
            if (onNavigate) onNavigate('stocks');
          }}
          title="Stocks"
          className="group relative w-10 h-10 rounded-xl border border-white/25 bg-surface-panel/95 backdrop-blur-xl shadow-lg flex items-center justify-center transition-all hover:-translate-y-0.5"
        >
          <ChartNoAxesCombined className="w-5 h-5 text-text-primary" />
          <span className="pointer-events-none absolute left-full ml-2 px-2 py-1 rounded-md bg-surface-canvas border border-white/10 text-text-primary text-[10px] font-medium whitespace-nowrap opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
            Stocks
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (soundEnabled) playHudSound('switch');
            try { sessionStorage.setItem('aurelis_focus_equity_hunter', '1'); } catch {}
            setOpen(false);
            setNotesOpen(false);
            setBrowserOpen(false);
            if (onNavigate) onNavigate('stocks');
            window.setTimeout(() => {
              document.getElementById('equity-hunter-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 120);
          }}
          title="Equity Hunter"
          className="group relative w-10 h-10 rounded-xl border border-primary-container/25 bg-surface-panel/95 backdrop-blur-xl shadow-lg flex items-center justify-center transition-all hover:-translate-y-0.5 hover:border-primary-container/60"
        >
          <Radar className="w-5 h-5 text-primary-container" />
          <span className="pointer-events-none absolute left-full ml-2 px-2 py-1 rounded-md bg-surface-canvas border border-white/10 text-text-primary text-[10px] font-medium whitespace-nowrap opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
            Equity Hunter
          </span>
        </button>
      </aside>

      {open && (
        <section
          className="fixed z-[10090] rounded-2xl overflow-hidden bg-white border border-black/10 shadow-[0_24px_70px_rgba(0,0,0,.5)] animate-in slide-in-from-right-3 fade-in duration-200 flex flex-col"
          style={{
            left: chatPos?.left ?? geometry.drawerLeft,
            top: chatPos?.top ?? geometry.drawerTop,
            height: geometry.drawerHeight,
            width: geometry.drawerWidth,
          }}
        >
          <header className="h-12 px-3 flex items-center justify-between gap-2 bg-white border-b border-black/10 shrink-0 cursor-move select-none" onPointerDown={(event)=>{ if ((event.target as HTMLElement).closest('button,a,input,textarea')) return; popupDrag.current={kind:'chat',x:event.clientX,y:event.clientY,left:chatPos?.left ?? geometry.drawerLeft,top:chatPos?.top ?? geometry.drawerTop}; }}>
            <div className="flex items-center gap-2 min-w-0">
              <img src="/aurelis-icon.svg" alt="" className="w-6 h-6 object-contain shrink-0" />
              <div className="min-w-0">
                <div className="text-[12px] font-bold text-black truncate">AURELIS AI</div>
                <div className="text-[9px] font-mono text-black/50 truncate">Always-on market assistant</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMessages([])}
                className="px-2 py-1.5 rounded-lg text-[9px] font-mono text-black/50 hover:text-black hover:bg-black/5"
                title="Clear conversation"
              >
                CLEAR
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 rounded-lg text-black/50 hover:text-black hover:bg-black/5"
                title="Close AI chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>

          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
            {messages.length === 0 && (
              <div className="min-h-[130px] flex flex-col items-center justify-center text-center px-4">
                <Sparkles className="w-5 h-5 text-primary-container mb-2" />
                <div className="text-[11px] font-bold text-black">Ask AURELIS AI</div>
                <div className="text-[10px] leading-relaxed text-black/55 mt-1">
                  Markets, Trade Radar, Live Bet, wallet assets, or whatever crypto rabbit hole we are visiting today.
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[92%] text-[10.5px] leading-relaxed rounded-xl px-3 py-2.5 break-words whitespace-pre-wrap ${message.role === 'user' ? 'ml-auto bg-emerald-50 text-black border border-emerald-200' : 'mr-auto bg-neutral-100 text-black/80 border border-black/5'}`}
              >
                {message.text}
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-[10px] text-black/50">
                <Loader2 className="w-3 h-3 animate-spin" />
                AURELIS AI is checking the data…
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
            className="p-2.5 border-t border-black/10 bg-white shrink-0"
          >
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl border border-black/10 bg-white">
              <Sparkles className="w-3.5 h-3.5 text-primary-container shrink-0" />
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask AURELIS AI…"
                className="flex-1 min-w-0 bg-transparent outline-none text-[11px] font-mono text-black placeholder:text-black/40"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="p-1.5 rounded-lg bg-primary-container text-on-primary-container disabled:opacity-40"
                title="Send"
              >
                <Send className="w-3 h-3" />
              </button>
            </div>
          </form>
        </section>
      )}

      {notesOpen && (
        <section
          className="fixed z-[10090] rounded-2xl overflow-hidden bg-white border border-black/10 shadow-[0_24px_70px_rgba(0,0,0,.5)] flex flex-col"
          style={{
            left: notesPos?.left ?? geometry.drawerLeft,
            top: notesPos?.top ?? geometry.drawerTop,
            height: geometry.drawerHeight,
            width: geometry.drawerWidth,
          }}
        >
          <header className="h-12 px-3 flex items-center justify-between gap-2 bg-white border-b border-black/10 shrink-0 cursor-move select-none" onPointerDown={(event)=>{ if ((event.target as HTMLElement).closest('button,a,input,textarea')) return; popupDrag.current={kind:'notes',x:event.clientX,y:event.clientY,left:notesPos?.left ?? geometry.drawerLeft,top:notesPos?.top ?? geometry.drawerTop}; }}>
            <div className="flex items-center gap-2">
              <NotepadText className="w-4 h-4 text-primary-container" />
              <div>
                <div className="text-[12px] font-bold text-black">AURELIS Notes</div>
                <div className="text-[9px] font-mono text-black/50">Autosaves as you type</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
              className="p-2 rounded-lg text-black/50 hover:text-black hover:bg-black/5"
              title="Close notes"
            >
              <X className="w-4 h-4" />
            </button>
          </header>
          <div className="flex-1 min-h-0 p-2.5 bg-white">
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Type anything here..."
              className="w-full h-full resize-none rounded-xl border border-black/10 bg-neutral-50 p-3 text-[11px] leading-relaxed font-mono text-black outline-none focus:border-primary-container/60"
            />
          </div>
          <div className="px-3 py-2 border-t border-black/10 bg-white text-[9px] text-black/45 font-mono">
            Saved automatically in this browser
          </div>
        </section>
      )}

      {browserOpen && (
        <section
          className={`fixed z-[10120] overflow-hidden bg-white border border-black/15 shadow-[0_28px_80px_rgba(0,0,0,.55)] flex flex-col ${browserMaximized ? 'rounded-none' : 'rounded-2xl resize'}`}
          style={browserMaximized ? {
            left: 12,
            top: 12,
            width: 'calc(100vw - 24px)',
            height: 'calc(100vh - 24px)',
          } : {
            left: browserRect.left,
            top: browserRect.top,
            width: browserRect.width,
            height: browserRect.height,
            minWidth: 480,
            minHeight: 360,
            maxWidth: 'calc(100vw - 16px)',
            maxHeight: 'calc(100vh - 16px)',
          }}
        >
          <div
            className="h-10 px-2.5 flex items-center gap-2 bg-neutral-100 border-b border-black/10 shrink-0 cursor-move select-none"
            onPointerDown={startBrowserDrag}
            onPointerMove={moveBrowserDrag}
            onPointerUp={endBrowserDrag}
            onPointerCancel={endBrowserDrag}
          >
            <div className="flex items-center gap-1 shrink-0">
              <button type="button" onClick={goBrowserBack} disabled={browserHistoryIndex <= 0} className="p-1.5 rounded-lg text-black/60 hover:text-black hover:bg-black/5 disabled:opacity-25" title="Back"><ArrowLeft className="w-4 h-4" /></button>
              <button type="button" onClick={goBrowserForward} disabled={browserHistoryIndex >= browserHistory.length - 1} className="p-1.5 rounded-lg text-black/60 hover:text-black hover:bg-black/5 disabled:opacity-25" title="Forward"><ArrowRight className="w-4 h-4" /></button>
              <button type="button" onClick={() => setBrowserRefreshKey((value) => value + 1)} className="p-1.5 rounded-lg text-black/60 hover:text-black hover:bg-black/5" title="Refresh"><RefreshCw className="w-4 h-4" /></button>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                navigateBrowser(browserUrlInput);
              }}
              className="flex-1 min-w-0"
            >
              <input
                value={browserUrlInput}
                onChange={(event) => setBrowserUrlInput(event.target.value)}
                className="w-full h-7 rounded-lg border border-black/10 bg-white px-2.5 text-[10.5px] font-mono text-black outline-none focus:border-primary-container/60"
                placeholder="Enter website address"
              />
            </form>

            <div className="flex items-center gap-0.5 shrink-0">
              <a href={browserHistory[browserHistoryIndex]} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg text-black/50 hover:text-black hover:bg-black/5" title="Open externally"><ExternalLink className="w-3.5 h-3.5" /></a>
              <button type="button" onClick={() => setBrowserOpen(false)} className="p-1.5 rounded-lg text-black/50 hover:text-black hover:bg-black/5" title="Minimize"><Minus className="w-3.5 h-3.5" /></button>
              <button type="button" onClick={() => setBrowserMaximized((value) => !value)} className="p-1.5 rounded-lg text-black/50 hover:text-black hover:bg-black/5" title={browserMaximized ? 'Restore' : 'Maximize'}>{browserMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}</button>
              <button type="button" onClick={() => setBrowserOpen(false)} className="p-1.5 rounded-lg text-black/50 hover:text-red-600 hover:bg-red-50" title="Close to icon"><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>

          <div className="flex-1 min-h-0 bg-white">
            <iframe
              key={`${browserHistoryIndex}-${browserRefreshKey}`}
              src={browserHistory[browserHistoryIndex]}
              title="AURELIS Browser"
              className="w-full h-full bg-white"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="clipboard-read; clipboard-write; fullscreen"
            />
          </div>
          <div className="h-6 px-2.5 flex items-center justify-between bg-neutral-50 border-t border-black/10 text-[8.5px] font-mono text-black/45 shrink-0">
            <span>Some websites may block embedded viewing.</span>
            <span>Drag header · resize corner</span>
          </div>
        </section>
      )}
    </>
  );
};

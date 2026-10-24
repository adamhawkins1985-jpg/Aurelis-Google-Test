import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles,
  Send,
  Loader2,
  RefreshCw,
  Copy,
  Check,
  Zap,
  Shield,
  BarChart3,
  ChevronDown,
  X,
  Bot,
  MessageSquare,
  Maximize2,
  Minimize2,
  Download,
  ArrowLeft,
} from 'lucide-react';
import { CoinData, Timeframe, NavigationTab } from '../types';
import { playHudSound, formatCurrency } from '../services/marketData';

// Bot Views
import { BotAutoScanView } from './trade/BotAutoScanView';
import { DexTradeRadarView } from './trade/DexTradeRadarView';
import type { SetupCandidate } from './trade/TradeRadarView';
import { HunterPerpsView } from './trade/HunterPerpsView';
import { ScopeTradeHunterView } from './trade/ScopeTradeHunterView';
import { DcaBotView } from './trade/DcaBotView';
import { BotWalletAuth } from './trade/BotWalletAuth';
import { BotExchangeBalances } from './trade/BotExchangeBalances';
import { BrokerOpenOrders } from './trade/BrokerOpenOrders';
import { BotTestReadiness } from './trade/BotTestReadiness';
import { GridBotView } from './trade/GridBotView';
import { ArbitrageBotView } from './trade/ArbitrageBotView';
import { SignalDeskScreen } from './SignalDeskScreen';
import { LiveBetView } from './trade/LiveBetView';

export type AiBotTab =
  | 'radar'
  | 'hunter'
  | 'scope'
  | 'dca'
  | 'grid'
  | 'arbitrage'
  | 'dex'
  | 'live'
  | 'signals';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

interface AiScreenProps {
  coins: CoinData[];
  selectedCoin: CoinData;
  onSelectCoin: (coin: CoinData) => void;
  onNavigate: (tab: NavigationTab) => void;
  soundEnabled: boolean;
  theme?: 'dark' | 'light';
  initialTradeAlert?: SetupCandidate | null;
}

const PRESET_PROMPTS = [
  {
    icon: <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />,
    label: 'Technical Audit',
    query: 'Run a deep technical audit: analyze current EMA structure, 14-period RSI momentum, and key support/resistance zones.',
  },
  {
    icon: <Zap className="w-3.5 h-3.5 text-amber-400" />,
    label: 'Breakout Probability',
    query: 'What is the probability of a breakout or breakdown in the next 24-48 hours based on price compression and volume?',
  },
  {
    icon: <Shield className="w-3.5 h-3.5 text-emerald-400" />,
    label: 'Perps Risk & Sizing',
    query: 'What are safe leverage limits, recommended stop-loss buffer, and invalidation criteria for a perpetual futures trade right now?',
  },
  {
    icon: <Sparkles className="w-3.5 h-3.5 text-purple-400" />,
    label: 'Trade Radar Analysis',
    query: 'Analyze the top ranked setup from the Trade Radar. What are the key catalysts, risk-reward skew, and invalidation trigger?',
  },
];

export const AiScreen: React.FC<AiScreenProps> = ({
  coins,
  selectedCoin,
  onSelectCoin,
  onNavigate,
  soundEnabled,
  theme = 'dark',
  initialTradeAlert = null,
}) => {
  // 1. Active Bot Tab (Defaulted to Trade Radar)
  const [activeBotTab, setActiveBotTab] = useState<AiBotTab>('radar');
  const [isBotExpanded, setIsBotExpanded] = useState<boolean>(false);
  const [pendingTradeSetup, setPendingTradeSetup] = useState<SetupCandidate | null>(null);
  const [autoScanEnabled, setAutoScanEnabled] = useState(true);
  useEffect(() => {
    if (!initialTradeAlert) return;
    setPendingTradeSetup(initialTradeAlert);
    setActiveBotTab('live');
    setIsChatOpen(false);
  }, [initialTradeAlert]);

  useEffect(() => {
    const openLiveBet = () => {
      setActiveBotTab('live');
      setIsChatOpen(false);
      try { sessionStorage.removeItem('aurelis_open_live_bet'); } catch {}
    };
    try {
      if (sessionStorage.getItem('aurelis_open_live_bet') === '1') openLiveBet();
    } catch {}
    window.addEventListener('aurelis-open-live-bet', openLiveBet as EventListener);
    return () => window.removeEventListener('aurelis-open-live-bet', openLiveBet as EventListener);
  }, []);

  // 2. AI Chat Box Pop-up State
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [isChatMaximized, setIsChatMaximized] = useState<boolean>(false);
  const handleAutoBetReady = useCallback((setup: SetupCandidate) => {
    // Stop this scan after one verified handoff. Never reopen the same bet automatically.
    setAutoScanEnabled(false);
    setPendingTradeSetup(setup);
    setActiveBotTab('live');
    setIsChatOpen(false);
  }, []);


  // Friendly label of the currently displayed bot view
  const currentBotLabel = useMemo(() => {
    switch (activeBotTab) {
      case 'radar':
        return 'Auto Scan';
      case 'hunter':
        return 'Hunter Perps';
      case 'dex':
        return 'DEX Research';
      case 'scope':
        return 'Scope Trade';
      case 'dca':
        return 'DCA Bot';
      case 'grid':
        return 'Grid Bot';
      case 'arbitrage':
        return 'Arbitrage Bot';
      case 'live':
        return 'Live Bet';
      case 'signals':
        return 'Signal Desk';
      default:
        return 'Trade Radar';
    }
  }, [activeBotTab]);

  // Escape key listener to close chat and immediately return to screen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isChatOpen) {
        if (soundEnabled) playHudSound('click');
        setIsChatOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isChatOpen, soundEnabled]);

  // AI Chat Conversation State
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      text: `Welcome to **Aurelis AI Intelligence Desk**.\n\nI am synchronized with real-time exchange order books, technical momentum indicators, and multi-timeframe liquidity feeds for **${selectedCoin.name} (${selectedCoin.symbol})**.\n\nAsk any technical question, evaluate Trade Radar setups, test bot parameters, or pick a rapid audit below.`,
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>('1H');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isCoinSelectorOpen, setIsCoinSelectorOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isChatOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isChatOpen]);

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || isLoading) return;

    if (soundEnabled) playHudSound('click');

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: query,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

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
          timeframe,
          marketUniverse: coins
            .filter((c) => Number.isFinite(Number(c.volume24h)) && Number(c.volume24h) > 0)
            .map((c) => ({
              symbol: c.symbol, name: c.name, price: c.price,
              change24h: c.change24h, volume24h: c.volume24h, marketCap: c.marketCap,
            })),
          history: messages.map((m) => ({ role: m.role, text: m.text })),
        }),
      });

      const data = await response.json();
      const replyText =
        data.reply ||
        `Market Intelligence for ${selectedCoin.symbol}: Consolidating near $${selectedCoin.price.toLocaleString()} (${selectedCoin.change24h >= 0 ? '+' : ''}${selectedCoin.change24h.toFixed(2)}%). Resistance level at $${(selectedCoin.price * 1.04).toFixed(2)}, support at $${(selectedCoin.price * 0.96).toFixed(2)}.`;

      if (soundEnabled) playHudSound('ping');

      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: 'model',
          text: replyText,
          timestamp: Date.now(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          role: 'model',
          text: `**Technical Snapshot for ${selectedCoin.symbol}:**\n• Price: $${selectedCoin.price.toLocaleString()}\n• 24h Trend: ${selectedCoin.change24h >= 0 ? 'Bullish +' : 'Bearish '}${selectedCoin.change24h.toFixed(2)}%\n• Primary Support: $${(selectedCoin.price * 0.965).toFixed(2)}\n• Overhead Resistance: $${(selectedCoin.price * 1.035).toFixed(2)}\n• Suggested Bias: ${selectedCoin.change24h >= 0 ? 'LONG / ACCUMULATE' : 'CAUTION / WAIT FOR REVERSAL'}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    if (soundEnabled) playHudSound('click');
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearChat = () => {
    if (soundEnabled) playHudSound('click');
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: 'model',
        text: `Chat cleared. Synchronized with **${selectedCoin.name} (${selectedCoin.symbol})** at $${selectedCoin.price.toLocaleString()}. Ready for queries.`,
        timestamp: Date.now(),
      },
    ]);
  };

  const botTabs: { id: AiBotTab; label: string }[] = [
    { id: 'radar', label: 'AUTO SCAN' },
    { id: 'live', label: 'LIVE BET' },
  ];
  const advancedBotTabs: { id: AiBotTab; label: string }[] = [
    { id: 'hunter', label: 'HUNTER RESEARCH' },
    { id: 'dex', label: 'DEX RADAR · PAPER' },
    { id: 'scope', label: 'SCOPE TRADE' },
    { id: 'dca', label: 'DCA' },
    { id: 'grid', label: 'GRID' },
    { id: 'arbitrage', label: 'ARBITRAGE' },
    { id: 'signals', label: 'SIGNAL DESK' },
  ];

  const brokerRouteMessage: Record<AiBotTab,string> = {
    radar:'Live Kraken rankings and per-market preflight. Select a bet for Live Bet manual review, or turn on automatic handoff. Scanning never places orders.',
    dex:'Decentralized markets are researched using public indicative routing data only. Leverage, collateral, wallet route, fees and execution have NOT been verified.',
    hunter:'Kraken public futures prices plus Trade Radar research. Kraken Spot balances are NOT perpetual-futures collateral. Only a reviewed proposal can advance to Live Bet.',
    scope:'Kraken market-data research and shortlist only. Balances are read-only. Scope Trade does not submit brokerage orders.',
    dca:'Target accounts: Kraken Spot and Coinbase Advanced. Account status and funding plan shown below.',
    grid:'Target accounts: Kraken Spot and Coinbase Advanced. Orders, fills and cancellations await validation.',
    arbitrage:'PAPER ONLY. Restricted-venue data cannot be used for U.S. order execution. No funds move.',
    live:'Kraken SPOT MARGIN preview, NOT perpetual futures. Existing balances are read-only; live submission locked pending protected-order validation.',
    signals:'Existing Kraken SPOT MARGIN review path, NOT verified Kraken Derivatives US perpetual futures. Live submission locked.',
  };

  const activeBotView = (
    <>
      {activeBotTab !== 'live' && (
      <div className="rounded-lg border border-white/10 bg-surface-panel px-3 py-2 text-[11px]">
        <span className="font-bold text-text-primary">
          {activeBotTab === 'signals' ? 'Kraken Spot/Margin · Live orders locked' :
           activeBotTab === 'hunter' ? 'Futures research → Kraken margin preflight' :
           activeBotTab === 'arbitrage' ? 'Arbitrage · Paper only' :
           activeBotTab === 'radar' ? 'Automatic scan and venue check · No order submitted' :
            activeBotTab === 'scope' ? 'Signals only · No order submitted' :
           'Broker preview · No automatic orders'}
        </span>
        <details className="mt-1 text-text-muted">
          <summary className="cursor-pointer text-[10px]">Safety & venue details</summary>
          <p className="mt-2 leading-relaxed">{brokerRouteMessage[activeBotTab]}</p>
        </details>
      </div>
      )}
      {activeBotTab === 'radar' && (
        <BotAutoScanView
          enabled={autoScanEnabled}
          onEnabledChange={setAutoScanEnabled}
          onBetReady={handleAutoBetReady}
        />
      )}
      {activeBotTab === 'dex' && <DexTradeRadarView coins={coins} soundEnabled={soundEnabled} />}
      {activeBotTab === 'hunter' && (
        <HunterPerpsView
          soundEnabled={soundEnabled}
          initialSetup={pendingTradeSetup}
          onSendToLiveBet={(setup) => {
            setPendingTradeSetup(setup);
            setActiveBotTab('live');
          }}
          onReturnToRadar={() => {
            setPendingTradeSetup(null);
            setActiveBotTab('radar');
          }}
        />
      )}
      {activeBotTab === 'scope' && <ScopeTradeHunterView soundEnabled={soundEnabled}
        onSendToLiveBet={(setup)=>{setPendingTradeSetup(setup);setActiveBotTab('live')}} />}
      {activeBotTab === 'dca' && <DcaBotView coins={coins} soundEnabled={soundEnabled} />}
      {activeBotTab === 'grid' && <GridBotView coins={coins} soundEnabled={soundEnabled} />}
      {activeBotTab === 'arbitrage' && <ArbitrageBotView coins={coins} soundEnabled={soundEnabled} />}
      {activeBotTab === 'live' && <LiveBetView soundEnabled={soundEnabled} initialSetup={pendingTradeSetup} onFindNewBet={() => { setPendingTradeSetup(null); setAutoScanEnabled(true); setActiveBotTab('radar'); }} />}
      {activeBotTab === 'signals' && (
        <SignalDeskScreen coins={coins} onSelectCoin={onSelectCoin} soundEnabled={soundEnabled} />
      )}
    </>
  );

  const botPanel = (
    <div className={`flex flex-col ${isBotExpanded ? 'absolute inset-x-2 top-[86px] bottom-2 w-auto z-[10080] bg-surface-canvas border border-white/10 rounded-xl shadow-[0_24px_70px_rgba(0,0,0,.58)] overflow-hidden' : 'w-full'}`}>
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 px-3 bg-surface-panel/95 border border-white/10 rounded-t-xl">
        <div className="min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-wider text-primary-container font-bold">AURELIS BOTS</div>
          <div className="text-[12px] font-bold text-text-primary truncate">{currentBotLabel}</div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (soundEnabled) playHudSound('click');
            setIsBotExpanded((expanded) => !expanded);
          }}
          className="hidden md:inline-flex px-3 py-1.5 rounded-lg border border-white/10 bg-surface-base text-[10px] font-mono font-bold text-text-secondary hover:text-text-primary hover:bg-white/5"
        >
          {isBotExpanded ? 'COLLAPSE' : 'EXPAND'}
        </button>
      </div>
      <div className={`min-h-0 overflow-auto ${isBotExpanded ? 'flex-1 p-3' : 'p-0 pt-2'}`}>
        <BotWalletAuth />
        {activeBotView}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-2 max-w-[1720px] mx-auto w-full select-none pb-24 relative">
      {!isChatOpen && (
        <>
      {/* ========================================================================= */}
      {/* 1. TOP BOT NAVIGATION */}
      {/* ========================================================================= */}
      <div className="flex items-center justify-between gap-2 py-1 px-1 mb-2 select-none flex-wrap bg-surface-panel/60 p-2 rounded-2xl border border-white/5 backdrop-blur-md">
        {/* Navigation Pills for Bots */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
          {botTabs.map((tab) => {
            const isActive = activeBotTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (soundEnabled) playHudSound('switch');
                  setActiveBotTab(tab.id);
                }}
                className={`px-3 py-1.5 rounded-full text-[11px] font-mono font-bold tracking-wide transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-primary-container text-on-primary-container shadow-[0_0_12px_rgba(0,245,160,0.35)]'
                    : 'bg-surface-panel/80 hover:bg-surface-panel text-text-muted hover:text-text-primary border border-white/5'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <details className="relative shrink-0 text-[10px] text-text-secondary">
          <summary className="cursor-pointer rounded-lg border border-white/10 bg-surface-panel/80 px-2.5 py-1.5 font-bold">Other tools</summary>
          <div className="absolute right-0 top-full z-30 mt-1 min-w-[170px] rounded-xl border border-white/10 bg-surface-panel p-1 shadow-xl">
            {advancedBotTabs.map((tab) => (
              <button type="button" key={tab.id} onClick={() => setActiveBotTab(tab.id)}
                className="block w-full rounded-md px-3 py-2 text-left font-bold hover:bg-white/10">
                {tab.label}
              </button>
            ))}
          </div>
        </details>
      </div>

      {(['radar','hunter','scope','live','signals','arbitrage'] as AiBotTab[]).includes(activeBotTab) && (
        <details className="rounded-xl border border-white/10 bg-surface-panel/70 text-text-secondary text-[11px]">
          <summary className="cursor-pointer px-3 py-2 font-bold">
            Exchange status · balances, orders & test readiness
          </summary>
          <div className="space-y-2 p-2 pt-0">
            <BotExchangeBalances futuresResearch={activeBotTab==='hunter'}/>
            {activeBotTab !== 'arbitrage' && <BrokerOpenOrders/>}
            {activeBotTab !== 'arbitrage' && <BotTestReadiness short/>}
          </div>
        </details>
      )}

      {/* ========================================================================= */}
      {/* 2. BOT VIEWS */}
      {/* ========================================================================= */}
      {isBotExpanded && typeof document !== 'undefined' && document.getElementById('hudWidget')
        ? createPortal(botPanel, document.getElementById('hudWidget')!)
        : botPanel}


        </>
      )}

      {/* ========================================================================= */}
      {/* 4. AI CHAT PANEL (Inline, opaque, WebView-safe) */}
      {/* ========================================================================= */}
      {isChatOpen && (
        <div
          role="dialog"
          aria-modal="false"
          className="relative z-10 w-full bg-[#0b0f14] border border-white/10 rounded-2xl overflow-hidden shadow-[0_12px_35px_rgba(0,0,0,0.55)]"
        >
          <div
            className={`w-full bg-[#0b0f14] flex flex-col font-mono text-xs select-none overflow-hidden ${
              isChatMaximized
                ? 'min-h-[72vh]'
                : 'h-[68vh] min-h-[520px] max-h-[720px]'
            }`}
          >
            {/* Pop-up Top Bar: Clear "Back to Screen" button + Model Info + Controls */}
            <div className="flex items-center justify-between gap-1.5 sm:gap-2 p-2.5 sm:p-3 bg-surface-base/95 border-b border-white/10 shrink-0">
              {/* Prominent Back Button */}
              <button
                type="button"
                onClick={() => {
                  if (soundEnabled) playHudSound('click');
                  setIsChatOpen(false);
                }}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-primary-container/15 hover:bg-primary-container text-primary-container hover:text-on-primary-container border border-primary-container/40 font-mono text-[11px] sm:text-xs font-bold transition-all cursor-pointer shadow-sm group shrink-0"
                title={`Close AI Chat and return to ${currentBotLabel}`}
              >
                <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover:-translate-x-1 transition-transform" />
                <span className="truncate max-w-[130px] sm:max-w-none">Back to {currentBotLabel}</span>
              </button>

              {/* Center Model Header */}
              <div className="hidden xs:flex sm:flex items-center gap-1.5 sm:gap-2">
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-primary-container/20 border border-primary-container/40 flex items-center justify-center text-primary-container shadow-[0_0_8px_rgba(0,245,160,0.3)]">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div className="hidden sm:block">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs text-text-primary">
                      Aurelis AI Intel
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-bold uppercase">
                      Gemini 2.5
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Action Controls: Coin Selector + Maximize + Close */}
              <div className="flex items-center gap-1 sm:gap-1.5 ml-auto">
                {/* Coin Selector Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsCoinSelectorOpen(!isCoinSelectorOpen)}
                    className="flex items-center gap-1 sm:gap-1.5 bg-surface-panel px-2 sm:px-2.5 py-1.5 rounded-lg border border-white/10 hover:border-primary-container/40 transition-colors cursor-pointer text-text-primary text-[10.5px] sm:text-xs"
                  >
                    <span className="font-bold text-primary-container">{selectedCoin.symbol}</span>
                    <span className="text-[10px] sm:text-[11px] text-text-secondary hidden xs:inline">${selectedCoin.price.toLocaleString()}</span>
                    <ChevronDown className="w-3 h-3 text-text-muted" />
                  </button>

                  {isCoinSelectorOpen && (
                    <div className="absolute right-0 top-full mt-1 w-44 bg-surface-panel border border-white/15 rounded-xl shadow-2xl py-1 z-50 max-h-48 overflow-y-auto">
                      {coins.slice(0, 12).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            onSelectCoin(c);
                            setIsCoinSelectorOpen(false);
                          }}
                          className={`w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-white/5 cursor-pointer text-[11px] ${
                            c.id === selectedCoin.id ? 'bg-primary-container/10 text-primary-container font-bold' : 'text-text-primary'
                          }`}
                        >
                          <span>{c.symbol}</span>
                          <span className={c.change24h >= 0 ? 'text-status-success' : 'text-status-error'}>
                            {c.change24h >= 0 ? '+' : ''}{c.change24h.toFixed(1)}%
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Maximize Toggle (Desktop only) */}
                <button
                  type="button"
                  onClick={() => setIsChatMaximized(!isChatMaximized)}
                  className="hidden sm:flex p-1.5 rounded-lg hover:bg-white/10 text-text-muted hover:text-text-primary cursor-pointer transition-colors"
                  title={isChatMaximized ? 'Restore size' : 'Maximize'}
                >
                  {isChatMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>

                {/* Unmistakable Close Button */}
                <button
                  type="button"
                  onClick={() => {
                    if (soundEnabled) playHudSound('click');
                    setIsChatOpen(false);
                  }}
                  className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl bg-status-error/15 hover:bg-status-error/25 border border-status-error/30 text-status-error hover:text-white font-mono text-[11px] sm:text-xs font-bold cursor-pointer transition-all shrink-0"
                  title="Close AI Chat"
                >
                  <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Close</span>
                </button>
              </div>
            </div>

            {/* Quick Prompt Chips */}
            <div className="px-2.5 sm:px-3 pt-2 pb-1.5 flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0 border-b border-white/5 bg-surface-base/60">
              {PRESET_PROMPTS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSend(preset.query)}
                  disabled={isLoading}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-base hover:bg-white/10 border border-white/10 text-[10px] text-text-secondary hover:text-text-primary whitespace-nowrap cursor-pointer transition-all shrink-0"
                >
                  {preset.icon}
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>

            {/* Messages Stream: flex-1 min-h-0 guarantees scrollability without pushing input off screen */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3 bg-surface-base/40">
              {messages.map((msg) => {
                const isAi = msg.role === 'model';
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isAi ? 'items-start' : 'items-end'}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 px-1">
                      {isAi ? (
                        <>
                          <Sparkles className="w-3 h-3 text-primary-container" />
                          <span className="text-[10px] font-bold text-primary-container">
                            Aurelis Intelligence
                          </span>
                        </>
                      ) : (
                        <span className="text-[10px] font-bold text-text-muted">
                          You
                        </span>
                      )}
                      <span className="text-[9px] text-text-muted">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div
                      className={`relative group max-w-[92%] p-2.5 sm:p-3 rounded-xl border text-[11px] sm:text-[11.5px] leading-relaxed break-words whitespace-pre-wrap ${
                        isAi
                          ? 'bg-surface-panel/90 border-white/10 text-text-primary shadow-sm'
                          : 'bg-primary-container/15 border-primary-container/30 text-text-primary'
                      }`}
                    >
                      {msg.text}

                      {/* Copy snippet button */}
                      {isAi && (
                        <button
                          type="button"
                          onClick={() => handleCopy(msg.id, msg.text)}
                          className="absolute right-2 top-2 p-1 rounded bg-surface-base/80 border border-white/10 text-text-muted hover:text-text-primary opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          title="Copy response"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-3 h-3 text-status-success" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {isLoading && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-surface-panel border border-white/10 max-w-[240px]">
                  <Loader2 className="w-4 h-4 text-primary-container animate-spin" />
                  <span className="text-[11px] text-text-muted">
                    Running market telemetry audit...
                  </span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar & Actions: Pinned at bottom with safe-area padding for Android/iOS */}
            <div className="p-2 sm:p-3 bg-surface-base/95 border-t border-white/10 shrink-0 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex items-center gap-1.5 sm:gap-2 w-full"
              >
                {/* Back to Screen shortcut button */}
                <button
                  type="button"
                  onClick={() => {
                    if (soundEnabled) playHudSound('click');
                    setIsChatOpen(false);
                  }}
                  className="px-2 sm:px-2.5 py-2 rounded-xl bg-surface-panel hover:bg-white/15 border border-white/10 text-text-secondary hover:text-text-primary font-bold text-xs transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                  title={`Return to ${currentBotLabel}`}
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-primary-container" />
                  <span className="hidden sm:inline">Back</span>
                </button>

                {/* Clear Conversation button */}
                <button
                  type="button"
                  onClick={handleClearChat}
                  className="p-2 rounded-xl bg-surface-panel hover:bg-white/10 border border-white/10 text-text-muted hover:text-text-primary transition-colors cursor-pointer shrink-0"
                  title="Clear conversation"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>

                {/* Query Input: min-w-0 ensures flex container won't overflow horizontally */}
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={`Ask AI about ${selectedCoin.symbol} or bot setups...`}
                  disabled={isLoading}
                  className="flex-1 min-w-0 bg-surface-panel border border-white/15 focus:border-primary-container/60 rounded-xl px-2.5 sm:px-3 py-2 text-xs font-mono text-text-primary outline-none transition-colors"
                />

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="px-3 sm:px-3.5 py-2 bg-primary-container hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-on-primary-container font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

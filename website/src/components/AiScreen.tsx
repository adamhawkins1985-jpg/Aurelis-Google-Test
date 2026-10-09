import React, { useState, useRef, useEffect, useMemo } from 'react';
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
import { getBotWalletConnectSession } from '../services/walletConnectService';
import { DEX_VENUES, canUseLiveOrders, canUseAutomatedFunding } from '../services/dexVenueRegistry';
import { fetchHyperliquidObservation } from '../services/hyperliquidReadOnlyAdapter';
import { fetchLighterAccountSnapshot } from '../services/lighterReadOnlyAdapter';

// Bot Views
import { TradeRadarView } from './trade/TradeRadarView';
import type { SetupCandidate } from './trade/TradeRadarView';
import { HunterPerpsView } from './trade/HunterPerpsView';
import { ScopeTradeHunterView } from './trade/ScopeTradeHunterView';
import { DcaBotView } from './trade/DcaBotView';
import { GridBotView } from './trade/GridBotView';
import { ArbitrageBotView } from './trade/ArbitrageBotView';
import { SignalDeskScreen } from './SignalDeskScreen';
import { LiveBetView } from './trade/LiveBetView';
import { DexRouteReview } from './trade/DexRouteReview';
import { DexPaperRiskReview } from './trade/DexPaperRiskReview';
import { DexIntentReview } from './trade/DexIntentReview';
import { DexHunterView } from './trade/DexHunterView';
import { DexTradeRadarView } from './trade/DexTradeRadarView';

export type AiBotTab =
  | 'radar'
  | 'hunter'
  | 'scope'
  | 'dca'
  | 'grid'
  | 'arbitrage'
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
  const [botWalletAddress,setBotWalletAddress] = useState('');
  const [botBalances,setBotBalances] = useState<{asset:string;amount:number;network:string;valueUsd:number|null}[]>([]);
  const [botBalanceLoading,setBotBalanceLoading] = useState(true);
  const [venueAccount,setVenueAccount] = useState<any>(null);
  const [lighterAccountCount,setLighterAccountCount] = useState<number|null>(null);
  const [lighterPositions,setLighterPositions] = useState<number|null>(null);
  const [lighterCollateral,setLighterCollateral] = useState<string|null>(null);
  const [lighterAccountError,setLighterAccountError] = useState('');
  const [lighterOrdersStatus,setLighterOrdersStatus] = useState('Authentication required');
  const [venueLoading,setVenueLoading] = useState(false);
  const [venueError,setVenueError] = useState('');
  const [fundingPolicy,setFundingPolicy] = useState<'manual'|'review'>('manual');
  const [controlMode,setControlMode] = useState<'paused'|'review'>('paused');
  const [venueCheckedAt,setVenueCheckedAt] = useState('');
  const loadVenueAccount=async(address:string)=>{
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {setVenueAccount(null);setVenueError('Connect Bot Wallet to check Hyperliquid.');return;}
    setVenueLoading(true);setVenueError('');
    try {
      const snapshot=await fetchHyperliquidObservation(address);
      setVenueAccount({
        perpsAccountValueUsd:snapshot.accountValueUsd ?? null,
        openPerpPositions:snapshot.openPositionCount ?? null,
        verifiedFields:snapshot.verifiedFields ?? [],
      });
      setVenueCheckedAt(new Date(snapshot.checkedAt).toLocaleTimeString());
    }catch(e:any){setVenueError(e?.message||'Venue account unavailable');setVenueAccount(null);}
    finally{setVenueLoading(false);}
  };
  const readBotAddress=async()=>{
    const active=await getBotWalletConnectSession();
    return active?.address||'';
  };
  useEffect(()=>{
    try{
      const policy=localStorage.getItem('aurelis_bot_funding_policy');
      if(policy==='manual'||policy==='review')setFundingPolicy(policy);
    }catch{}
  },[]);
  const selectFundingPolicy=(next:'manual'|'review')=>{
    setFundingPolicy(next);
    try{localStorage.setItem('aurelis_bot_funding_policy',next);}catch{}
  };
  const updateControlMode=(next:'paused'|'review')=>{
    // This controls only the UI's paper review mode, not exchange positions or other execution services.
    setControlMode(next);
  };

  const [botBalanceError,setBotBalanceError] = useState('');
  const loadBotBalances = async () => {
    setBotBalanceLoading(true);
    try {
      const active = await getBotWalletConnectSession();
      if (!active) {
        setBotWalletAddress('');setBotBalances([]);setBotBalanceError('');setVenueAccount(null);setLighterAccountCount(null);setLighterPositions(null);setLighterCollateral(null);setLighterAccountError('');setLighterOrdersStatus('Authentication required');
        return;
      }
      setBotWalletAddress(active.address);
      void loadVenueAccount(active.address);
      void fetch('/api/bots/lighter-order-monitoring-status?'+new URLSearchParams({wallet:active.address}),{cache:'no-store'})
        .then(async res=>res.ok?res.json():Promise.reject(Error('status_unavailable')))
        .then(data=>setLighterOrdersStatus(data.orderMonitoring==='configured_unverified'?'Credential configured · unverified':'Authentication required'))
        .catch(()=>setLighterOrdersStatus('Monitoring status unavailable'));
      void fetchLighterAccountSnapshot(active.address).then(s=>{setLighterAccountCount(s.accountIndices?.length??null);setLighterPositions(s.positions.length);setLighterCollateral(s.balances.map(b=>Number(b.total)).reduce((a,b)=>a+b,0).toFixed(2));setLighterAccountError('');}).catch(()=>{setLighterAccountCount(null);setLighterPositions(null);setLighterCollateral(null);setLighterAccountError('Account snapshot unavailable');});
      const res=await fetch('/api/wallet/external-evm-portfolio?'+new URLSearchParams({address:active.address}),{cache:'no-store'});
      const data=await res.json();
      if (!res.ok || !data?.ok || !Array.isArray(data.assets)) throw Error(data?.error||'Balance lookup unavailable');
      setBotBalances(data.assets.map((item:any)=>({
        asset:String(item.symbol||'').toUpperCase(),
        amount:Number(item.amount||0),
        network:String(item.chain||item.network||'EVM'),
        valueUsd:Number.isFinite(Number(item.valueUsd)) ? Number(item.valueUsd) : (Number.isFinite(Number(item.balanceUsd))?Number(item.balanceUsd):null),
      })).filter((item:any)=>item.asset && item.amount>0));
      setBotBalanceError('');
    } catch(e:any) {setBotBalanceError(e?.message||'Bot Wallet balances unavailable');setBotBalances([]);}
    finally {setBotBalanceLoading(false);}
  };
  useEffect(()=>{
    void loadBotBalances();
    const timer=window.setInterval(()=>void loadBotBalances(),60000);
    const refresh=()=>void loadBotBalances();
    window.addEventListener('aurelis:bot-wallet-connected',refresh);
    return ()=>{window.clearInterval(timer);window.removeEventListener('aurelis:bot-wallet-connected',refresh);};
  },[]);

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


  // Friendly label of the currently displayed bot view
  const currentBotLabel = useMemo(() => {
    switch (activeBotTab) {
      case 'radar':
        return 'Trade Radar';
      case 'hunter':
        return 'Hunter Perps';
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
    { id: 'radar', label: 'TRADE RADAR' },
    { id: 'hunter', label: 'HUNTER PERPS' },
    { id: 'scope', label: 'SCOPE TRADE' },
    { id: 'dca', label: 'DCA' },
    { id: 'grid', label: 'GRID' },
    { id: 'arbitrage', label: 'ARBITRAGE' },
    { id: 'live', label: 'LIVE BET' },
    { id: 'signals', label: 'SIGNAL DESK' },
  ];

  const activeBotView = (
    <>
      <DexRouteReview tab={activeBotTab} />
      <DexPaperRiskReview tab={activeBotTab} />
      <DexIntentReview tab={activeBotTab} />
      {activeBotTab === 'radar' && (
        <DexTradeRadarView
          coins={coins}
          soundEnabled={soundEnabled}
          onPlaceTrade={(setup) => {
            if (soundEnabled) playHudSound('switch');
            setPendingTradeSetup(setup);
            setActiveBotTab('hunter');
          }}
        />
      )}
      {activeBotTab === 'hunter' && (
        <DexHunterView
          soundEnabled={soundEnabled}
          initialSetup={pendingTradeSetup}
          onSendToLiveBet={(setup) => {
            setPendingTradeSetup(setup);
            setActiveBotTab('live');
          }}
        />
      )}
      {activeBotTab === 'scope' && <ScopeTradeHunterView soundEnabled={soundEnabled} />}
      {activeBotTab === 'dca' && <DcaBotView coins={coins} soundEnabled={soundEnabled} />}
      {activeBotTab === 'grid' && <GridBotView coins={coins} soundEnabled={soundEnabled} />}
      {activeBotTab === 'arbitrage' && <ArbitrageBotView coins={coins} soundEnabled={soundEnabled} />}
      {activeBotTab === 'live' && <LiveBetView soundEnabled={soundEnabled} initialSetup={pendingTradeSetup} />}
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

      </div>

      <div className="mb-2 flex min-w-0 items-center gap-2 rounded-xl border border-white/5 bg-surface-panel/45 px-3 py-2">
        <div className="shrink-0">
          <div className="text-[8px] font-mono font-bold uppercase tracking-wider text-text-muted">OneKey Agent Money</div>
          <div className="text-[9px] font-mono text-primary-container">BOT WALLET · ON-CHAIN</div>
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto scrollbar-none">
          <div className="flex min-w-max items-center gap-2">
            {botBalanceLoading && !botBalances.length ? (
              <div className="flex items-center gap-1.5 text-[9px] font-mono text-text-muted"><Loader2 className="h-3 w-3 animate-spin"/>Checking Bot Wallet</div>
            ) : botBalanceError ? (
              <div className="text-[9px] font-mono text-red-400">{botBalanceError}</div>
            ) : !botWalletAddress ? (
              <div className="text-[9px] font-mono text-text-muted">Connect Agent Money in Bots → OneKey · DEX</div>
            ) : botBalances.length ? botBalances.map((row,i) => (
              <div key={row.network+row.asset+i} className="flex items-baseline gap-1 rounded-lg border border-white/5 bg-surface-base/65 px-2 py-1.5">
                <span className="text-[9px] font-mono font-bold text-text-primary">{row.asset}</span>
                <span className="text-[9px] font-mono tabular-nums text-text-secondary">{row.amount.toLocaleString('en-US',{maximumFractionDigits:8})}</span>
                <span className="text-[8px] text-text-muted">{row.network}</span>
              </div>
            )) : (
              <div className="text-[9px] font-mono text-text-muted">No non-zero Bot Wallet balances detected</div>
            )}
          </div>
        </div>
        <button type="button" onClick={()=>void loadBotBalances()} className="shrink-0 rounded-lg border border-white/5 bg-surface-base/60 p-1.5 text-text-muted hover:text-text-primary" title="Refresh Bot Wallet balances">
          <RefreshCw className={`h-3.5 w-3.5 ${botBalanceLoading ? 'animate-spin' : ''}`}/>
        </button>
      </div>

      <section className="mb-3 rounded-xl border border-white/10 bg-surface-panel/50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-text-primary">Central Bot Trade Manager</h3>
          <span className="text-[10px] text-amber-300">LIVE EXECUTION LOCKED</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-md border border-white/10 p-2 text-xs">Bot Wallet: {botWalletAddress?'Connected':'Disconnected'}</div>
          <div className="rounded-md border border-white/10 p-2 text-xs">Hyperliquid value: {venueAccount?.perpsAccountValueUsd??'Not verified'}</div>
          <div className="rounded-md border border-white/10 p-2 text-xs">Open positions: {venueAccount?.openPerpPositions??'Not verified'}</div>
          <div className="rounded-md border border-white/10 p-2 text-xs">Other venue P/L: Not connected</div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10px] font-semibold text-text-primary">DEX network · {DEX_VENUES.length} slots</span>
          <span className="text-[10px] text-text-muted">Read-only monitoring and candidates are not live integrations</span>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5" aria-label="DEX venue account coverage">
          {DEX_VENUES.map(item => <div key={item.id} className="rounded-md border border-white/10 bg-surface-base/40 p-2">
            <p className="text-[11px] font-bold text-text-primary">{item.name}</p>
            <p className="mt-1 text-[9px] text-text-muted">{item.network}</p>
            <p className="mt-1 text-[10px] text-text-muted">{item.id==='hyperliquid' && !venueAccount ? 'Public account not checked' : item.id==='lighter' ? (lighterAccountCount!==null ? lighterAccountCount+' account(s) · '+(lighterPositions??0)+' position(s) · Orders: '+lighterOrdersStatus : lighterAccountError||'Public account discovery not checked') : item.note}</p>
            <p className="mt-1 text-[9px] text-amber-300">{canUseLiveOrders(item) ? 'Verified live order controls' : 'Live orders disabled'} · {canUseAutomatedFunding(item) ? 'Funding enabled' : 'Funding disabled'}</p>
          </div>)}
        </div>
        <p className="mt-2 text-[10px] text-text-muted">Public market-price feeds are not exchange account connections. Other DEX balances, orders, fills, P/L and cancellation remain unverified until their authenticated account adapters are integrated.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" disabled={venueLoading} onClick={()=>void readBotAddress().then(loadVenueAccount)} className="rounded-md border border-white/10 px-2 py-1 text-xs">Refresh exchange</button>
          <span className="text-[10px] text-text-muted">Hyperliquid Mainnet · {venueCheckedAt||'Not checked'}</span>
          {venueError&&<span className="text-[10px] text-red-400">{venueError}</span>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-primary">Funding preference:</span>
          <button type="button" onClick={()=>selectFundingPolicy('manual')} className="rounded border border-white/10 px-2 py-1 text-xs">Manual {fundingPolicy==='manual'?'✓':''}</button>
          <button type="button" onClick={()=>selectFundingPolicy('review')} className="rounded border border-white/10 px-2 py-1 text-xs">Review before funding {fundingPolicy==='review'?'✓':''}</button>
          <button type="button" disabled className="rounded border border-white/10 px-2 py-1 text-xs opacity-40">Stop all live orders</button>
          <button type="button" disabled className="rounded border border-white/10 px-2 py-1 text-xs opacity-40">Emergency exit</button>
        </div>
        <p className="mt-2 text-[10px] text-text-muted">Monitoring only. No automatic swaps, transfers, profit sweeps, order cancellation or emergency closes are active. Preferences do not authorize transactions.</p>
      </section>

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
+(lighterCollateral??'—')+' collateral' : lighterAccountError||'Public account discovery not checked') : item.note}</p>
            <p className="mt-1 text-[9px] text-amber-300">{canUseLiveOrders(item) ? 'Verified live order controls' : 'Live orders disabled'} · {canUseAutomatedFunding(item) ? 'Funding enabled' : 'Funding disabled'}</p>
          </div>)}
        </div>
        <p className="mt-2 text-[10px] text-text-muted">Public market-price feeds are not exchange account connections. Other DEX balances, orders, fills, P/L and cancellation remain unverified until their authenticated account adapters are integrated.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" disabled={venueLoading} onClick={()=>void readBotAddress().then(loadVenueAccount)} className="rounded-md border border-white/10 px-2 py-1 text-xs">Refresh exchange</button>
          <span className="text-[10px] text-text-muted">Hyperliquid Mainnet · {venueCheckedAt||'Not checked'}</span>
          {venueError&&<span className="text-[10px] text-red-400">{venueError}</span>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-primary">Funding preference:</span>
          <button type="button" onClick={()=>selectFundingPolicy('manual')} className="rounded border border-white/10 px-2 py-1 text-xs">Manual {fundingPolicy==='manual'?'✓':''}</button>
          <button type="button" onClick={()=>selectFundingPolicy('review')} className="rounded border border-white/10 px-2 py-1 text-xs">Review before funding {fundingPolicy==='review'?'✓':''}</button>
          <button type="button" disabled className="rounded border border-white/10 px-2 py-1 text-xs opacity-40">Stop all live orders</button>
          <button type="button" disabled className="rounded border border-white/10 px-2 py-1 text-xs opacity-40">Emergency exit</button>
        </div>
        <p className="mt-2 text-[10px] text-text-muted">Monitoring only. No automatic swaps, transfers, profit sweeps, order cancellation or emergency closes are active. Preferences do not authorize transactions.</p>
      </section>

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

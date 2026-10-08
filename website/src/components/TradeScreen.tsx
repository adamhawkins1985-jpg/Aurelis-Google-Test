import React, { useEffect, useState } from 'react';
import { CoinData, WalletHolding, ThemeMode, NavigationTab } from '../types';
import { TradeSubNav, TradeSubTab } from './trade/TradeSubNav';
import { DemoExchangeView } from './trade/DemoExchangeView';

interface TradeScreenProps {
  coins: CoinData[];
  initialPayCoin?: CoinData;
  initialReceiveCoin?: CoinData;
  initialSubTab?: TradeSubTab;
  isConnected: boolean;
  walletAddress?: string;
  holdings: WalletHolding[];
  onExecuteTrade: (
    paySymbol: string,
    payAmount: number,
    receiveSymbol: string,
    receiveAmount: number
  ) => void;
  onOpenWallet: () => void;
  onNavigate?: (tab: NavigationTab) => void;
  soundEnabled: boolean;
  theme?: ThemeMode;
}

export const TradeScreen: React.FC<TradeScreenProps> = ({
  coins,
  initialPayCoin,
  initialReceiveCoin,
  initialSubTab = 'trade',
  isConnected,
  walletAddress,
  holdings,
  onOpenWallet,
  soundEnabled,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<TradeSubTab>(() => {
    if (typeof window !== 'undefined') {
      const param = new URLSearchParams(window.location.search).get('tradeTab');
      if (param && ['buy', 'sell', 'trade'].includes(param)) return param as TradeSubTab;
    }
    return initialSubTab;
  });
  const [aiPlan, setAiPlan] = useState<any | null>(() => {
    if (typeof window === 'undefined') return null;
    try { return JSON.parse(localStorage.getItem('aurelis_ai_swap_plan') || 'null'); } catch { return null; }
  });
  const [activeLegIndex, setActiveLegIndex] = useState(0);

  useEffect(() => {
    const refreshPlan = (event?: Event) => {
      try {
        const pushedPlan = (event as CustomEvent | undefined)?.detail?.plan;
        const plan = pushedPlan && Array.isArray(pushedPlan?.legs)
          ? pushedPlan
          : JSON.parse(localStorage.getItem('aurelis_ai_swap_plan') || 'null');
        setAiPlan(plan);
        setActiveLegIndex(0);
        if (plan) setActiveSubTab('trade');
      } catch {}
    };
    window.addEventListener('aurelis-ai-swap-plan', refreshPlan as EventListener);
    return () => window.removeEventListener('aurelis-ai-swap-plan', refreshPlan as EventListener);
  }, []);

  const activeLeg = aiPlan?.legs?.[activeLegIndex] || null;

  return (
    <div className="flex flex-col gap-2 max-w-[1720px] mx-auto w-full select-none pb-24">
      <TradeSubNav activeTab={activeSubTab} onSelectTab={setActiveSubTab} soundEnabled={soundEnabled} />

      {!isConnected && (
        <button
          type="button"
          onClick={onOpenWallet}
          className="mx-auto w-full max-w-2xl rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] font-mono text-amber-200 hover:bg-amber-400/15"
        >
          Connect a wallet before submitting a transaction
        </button>
      )}

      {aiPlan && activeSubTab === 'trade' && (
        <div className="mx-auto w-full max-w-2xl rounded-xl border border-primary-container/25 bg-primary-container/5 px-3 py-3 font-mono">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-primary-container">AURELIS AI SWAP PLAN</div>
              <div className="text-[12px] font-black text-text-primary mt-0.5">{aiPlan.sourceSymbol} → {aiPlan.targetSymbol}</div>
              <div className="text-[9px] text-text-muted mt-1">
                {Array.isArray(aiPlan.legs) ? aiPlan.legs.length : 0} network leg{Array.isArray(aiPlan.legs) && aiPlan.legs.length === 1 ? '' : 's'} ready · showing leg {activeLegIndex + 1}. Wallet approval is still required for every real transaction.
              </div>
            </div>
            <button type="button" onClick={() => { localStorage.removeItem('aurelis_ai_swap_plan'); setAiPlan(null); }} className="text-[9px] text-text-muted hover:text-text-primary">Clear</button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(aiPlan.legs || []).map((leg:any, index:number) => (
              <button key={index} type="button" onClick={() => setActiveLegIndex(index)}
                className={`px-2.5 py-1.5 rounded-lg border text-[9px] font-bold ${index === activeLegIndex ? 'border-primary-container/50 bg-primary-container/15 text-primary-container' : 'border-white/10 bg-surface-panel text-text-secondary'}`}>
                {index + 1} · {String(leg.sourceChain || 'wallet').toUpperCase()} · {Number(leg.spendableBalance ?? leg.balance ?? 0).toFixed(6)} {leg.sourceSymbol}
              </button>
            ))}
          </div>
          <div className="mt-2 text-[8.5px] text-text-muted">
            {activeLeg?.gasReserve === null
              ? 'Gas reserve could not be calculated for this leg, so the amount is not auto-filled.'
              : activeLeg?.gasReserve > 0
              ? `Spendable amount already leaves about ${Number(activeLeg.gasReserve).toFixed(8)} ${activeLeg.sourceSymbol} for network gas.`
              : 'Full token balance can be used; gas is paid separately by the chain native asset.'}
          </div>
        </div>
      )}

      <DemoExchangeView
        key={activeSubTab + ':' + (aiPlan?.id || '') + ':' + activeLegIndex}
        mode={activeSubTab}
        walletAddress={walletAddress}
        soundEnabled={soundEnabled}
        marketCoins={coins}
        holdings={holdings}
        initialAssetSymbol={(initialPayCoin || initialReceiveCoin)?.symbol}
        initialFromSymbol={activeLeg?.sourceSymbol}
        initialToSymbol={activeLeg?.targetSymbol}
        initialFromNetwork={activeLeg?.sourceChain}
        initialToNetwork={activeLeg ? (aiPlan?.targetChain || activeLeg.sourceChain) : undefined}
        initialAmount={activeLeg && activeLeg.spendableBalance !== null && activeLeg.spendableBalance !== undefined ? String(activeLeg.spendableBalance) : undefined}
        forceChangeNow={Boolean(activeLeg?.providerPreference === 'changenow')}
        aiLegNumber={aiPlan && activeLeg ? activeLegIndex + 1 : undefined}
        aiLegTotal={Array.isArray(aiPlan?.legs) ? aiPlan.legs.length : undefined}
        onNextAiLeg={aiPlan && activeLegIndex < (aiPlan?.legs?.length || 0) - 1 ? () => {
          setActiveLegIndex((index) => Math.min(index + 1, (aiPlan?.legs?.length || 1) - 1));
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } : undefined}
        onOpenWalletSend={(prefill) => {
          localStorage.setItem('aurelis_web_send_prefill', JSON.stringify(prefill));
          onOpenWallet();
        }}
      />
    </div>
  );
};

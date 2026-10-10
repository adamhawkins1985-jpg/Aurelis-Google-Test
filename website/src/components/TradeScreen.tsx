import React, { useEffect, useState } from 'react';
import { ExternalLink, Wallet } from 'lucide-react';
import { CoinData, WalletHolding, ThemeMode, NavigationTab } from '../types';

// defillama-primary-v2: Main Trade page delegates quotes and swaps to DeFiLlama.
// The iframe owns its own wallet connection; no internal signing or API custody is added.
interface TradeScreenProps {
  coins: CoinData[];
  initialPayCoin?: CoinData;
  initialReceiveCoin?: CoinData;
  initialSubTab?: 'buy' | 'sell' | 'trade';
  isConnected: boolean;
  walletAddress?: string;
  holdings: WalletHolding[];
  onExecuteTrade: (
    paySymbol: string, payAmount: number,
    receiveSymbol: string, receiveAmount: number
  ) => void;
  onOpenWallet: () => void;
  onNavigate?: (tab: NavigationTab) => void;
  soundEnabled: boolean;
  theme?: ThemeMode;
}

export const TradeScreen: React.FC<TradeScreenProps> = ({
  initialPayCoin,
  initialReceiveCoin,
  initialSubTab = 'trade',
  isConnected,
  onOpenWallet,
}) => {
  const [aiPlan, setAiPlan] = useState<any | null>(() => {
    try { return JSON.parse(localStorage.getItem('aurelis_ai_swap_plan') || 'null'); }
    catch { return null; }
  });
  const [legIndex, setLegIndex] = useState(0);
  const [widgetReady, setWidgetReady] = useState(false);
  useEffect(() => {
    const refresh = (event: Event) => {
      try {
        const eventPlan = (event as CustomEvent)?.detail?.plan;
        const plan = eventPlan && Array.isArray(eventPlan.legs) ? eventPlan :
          JSON.parse(localStorage.getItem('aurelis_ai_swap_plan') || 'null');
        setAiPlan(plan);
        setLegIndex(0);
      } catch {}
    };
    window.addEventListener('aurelis-ai-swap-plan', refresh);
    return () => window.removeEventListener('aurelis-ai-swap-plan', refresh);
  }, []);

  const sourceSymbol = initialPayCoin?.symbol || initialReceiveCoin?.symbol || null;
  const legs = Array.isArray(aiPlan?.legs) ? aiPlan.legs : [];
  const selectedLeg = legs[legIndex] || null;

  return (
    <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-3 pb-24 text-text-primary" data-trade-provider="defillama">
      <section className="rounded-xl border border-white/10 bg-surface-panel px-3 py-3 sm:px-5 sm:py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest text-primary-container">Primary swap provider · DeFiLlama</div>
            <h1 className="mt-1 font-headline text-xl font-bold">Trade &amp; Swap</h1>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-text-secondary">
              LlamaSwap compares supported decentralized swap routes. Choose tokens,
              review the quote and approve each transaction in your wallet.
              DeFiLlama handles the swap interface; OneKey handles wallet approvals when connected.
            </p>
          </div>
          <button type="button" onClick={onOpenWallet}
            className="inline-flex items-center gap-2 rounded-lg border border-primary-container/40 bg-primary-container/10 px-3 py-2 text-xs font-bold text-text-primary hover:bg-primary-container/20">
            <Wallet className="h-3.5 w-3.5" /> Wallet settings
          </button>
        </div>

        <div className="mt-3 rounded-lg border border-white/10 bg-surface-canvas/60 px-3 py-2 text-[11px] text-text-secondary">
          <strong className="text-text-primary">Wallet:</strong> {isConnected ? 'AURELIS wallet connection detected.' : 'Connect your wallet to execute a swap.'}
          {' '}LlamaSwap may ask you to connect OneKey separately inside its iframe.
          The top-bar connection is not automatically shared with third-party widgets.
        </div>

        {(initialSubTab !== 'trade' || sourceSymbol) && (
          <p className="mt-2 text-[11px] text-text-muted">
            {sourceSymbol ? 'Selected asset: ' + sourceSymbol + '. Select the token and network inside LlamaSwap to continue. ' : ''}
            {initialSubTab !== 'trade' ? 'Buying or selling for USD requires a supported fiat exchange/on-ramp, not a DeFiLlama crypto swap.' : ''}
          </p>
        )}

        {legs.length > 0 && (
          <section className="mt-3 rounded-xl border border-primary-container/30 bg-primary-container/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-xs">AURELIS AI swap plan · manual execution</strong>
              <button type="button" onClick={() => {
                localStorage.removeItem('aurelis_ai_swap_plan');
                setAiPlan(null);
              }} className="rounded-md px-2 py-1 text-[10px] text-text-muted hover:text-text-primary">Clear plan</button>
            </div>
            <p className="mt-1 text-[10px] text-text-muted">
              {legs.length} planned leg{legs.length === 1 ? '' : 's'}. Each route must be entered, checked and approved separately inside LlamaSwap.
              No automated cross-chain or multi-leg execution is wired here.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {legs.map((leg: any, index: number) => (
                <button key={index} type="button" onClick={() => setLegIndex(index)}
                  className={'rounded-lg border px-2.5 py-1.5 text-[10px] font-bold ' +
                    (legIndex === index ? 'border-primary-container/60 text-primary-container bg-primary-container/10' :
                    'border-white/10 text-text-secondary')}>
                  {index + 1}. {String(leg.sourceSymbol || 'Asset')} → {String(leg.targetSymbol || aiPlan?.targetSymbol || 'Target')}
                </button>
              ))}
            </div>
            {selectedLeg && (
              <p className="mt-2 text-[10px] text-text-secondary">
                Planned: {String(selectedLeg.sourceChain || 'network not set')} · {String(selectedLeg.sourceSymbol || 'asset')}
                {' → '}{String(aiPlan?.targetChain || selectedLeg.sourceChain || 'network not set')} · {String(selectedLeg.targetSymbol || aiPlan?.targetSymbol || 'target')}.
                Verify available balance, gas, network and quoted fees in LlamaSwap before signing.
              </p>
            )}
          </section>
        )}

        <div className="relative mt-3 overflow-hidden rounded-xl border border-white/10 bg-surface-canvas">
          {!widgetReady && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-surface-panel px-4 text-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-container/20 border-t-primary-container" />
              <strong className="text-xs text-text-primary">Loading DeFiLlama LlamaSwap…</strong>
              <p className="max-w-xs text-[11px] text-text-muted">
                The provider can take a few seconds to initialize. If it does not load,
                use the direct link below.
              </p>
            </div>
          )}
          <iframe
            title="DeFiLlama LlamaSwap primary swap"
            src="https://swap.defillama.com/"
            onLoad={() => window.setTimeout(() => setWidgetReady(true), 900)}
            className="h-[690px] min-h-[560px] w-full border-0 sm:h-[760px]"
            allow="clipboard-read; clipboard-write; payment; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            loading="eager"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-text-muted">
          <span>Swap only. USD deposits and cash withdrawals need an exchange or fiat provider. No swap or wallet approval is automatic.</span>
          <a href="https://swap.defillama.com/" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-bold text-primary-container hover:underline">
            Open LlamaSwap directly <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </section>
    </div>
  );
};

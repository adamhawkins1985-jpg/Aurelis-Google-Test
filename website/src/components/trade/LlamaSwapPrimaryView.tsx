import React from 'react';
import { ExternalLink, ShieldCheck } from 'lucide-react';

// Hosted third-party app. Never pass the AURELIS WalletConnect topic or bot-wallet
// account into this cross-origin frame. LlamaSwap connects/signs independently.
export const LLAMASWAP_URL = 'https://swap.defillama.com/';

export const LlamaSwapPrimaryView: React.FC = () => (
  <section
    aria-label="Primary swap provider LlamaSwap"
    className="mx-auto w-full max-w-[1050px] overflow-hidden rounded-2xl border border-primary-container/25 bg-surface-panel shadow-sm"
  >
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-primary-container/15 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <img
          src="/provider-icons/llama.ico"
          alt=""
          className="h-9 w-9 shrink-0 rounded-lg object-contain"
        />
        <div>
          <h2 className="text-[15px] font-bold text-text-primary">LlamaSwap</h2>
          <p className="text-[11px] text-text-secondary">
            Main crypto-to-crypto swap provider · compare DEX aggregator routes
          </p>
        </div>
      </div>
      <a
        href={LLAMASWAP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-primary-container/30 bg-primary-container/10 px-3 py-2 text-[11px] font-bold text-text-primary hover:bg-primary-container/20"
      >
        Open LlamaSwap <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </header>

    <div className="flex items-start gap-2 border-b border-primary-container/10 bg-primary-container/5 px-4 py-2.5">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary-container" />
      <p className="text-[11px] leading-relaxed text-text-secondary">
        <strong className="text-text-primary">Wallet connection:</strong> LlamaSwap has its own
        Connect Wallet button. Your AURELIS top-bar connection is not automatically shared.
        Connect the same <strong className="text-text-primary">main wallet</strong> inside the
        provider, never the bot wallet. Check the network and route before approving in your
        wallet app. Availability depends on the provider and your location.
      </p>
    </div>

    <iframe
      title="LlamaSwap primary trading widget"
      src={LLAMASWAP_URL}
      className="block h-[min(780px,calc(100dvh-205px))] min-h-[550px] w-full border-0 bg-white"
      allow="clipboard-read; clipboard-write; payment"
      referrerPolicy="strict-origin-when-cross-origin"
    />

    <footer className="border-t border-primary-container/10 px-4 py-2 text-[10px] text-text-muted">
      If your browser or wallet blocks third-party frames, use Open LlamaSwap above.
      Wallet permissions and transaction signing remain with the provider and your wallet.
    </footer>
  </section>
);

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export type OneKeyAction = 'buy' | 'sell' | 'swap' | 'send' | 'receive' | 'stake' | 'borrow';
type ActionRequest = { action: OneKeyAction; fallback?: () => void };
type ActionStatus = { action: OneKeyAction; ok: boolean; message: string };
const LABEL: Record<OneKeyAction, string> = {
  buy: 'Buy', sell: 'Sell', swap: 'Swap', send: 'Send',
  receive: 'Receive', stake: 'Stake', borrow: 'Borrow',
};

export function openOneKeyAction(action: OneKeyAction, fallback?: () => void): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ActionRequest>('aurelis:onekey-action', {
    detail: { action, fallback },
  }));
  const desktop = (window as any).AurelisDesktop;
  if (desktop && typeof desktop.openOneKey === 'function') {
    Promise.resolve()
      .then(() => desktop.openOneKey(action))
      .then((response: any) => {
        const ok = Boolean(response?.ok);
        window.dispatchEvent(new CustomEvent<ActionStatus>('aurelis:onekey-action-status', {
          detail: { action, ok, message: ok
            ? 'OneKey was launched. Select ' + LABEL[action] + ' inside OneKey. The action itself has not been opened or submitted.'
            : 'OneKey could not be launched. Continue in AURELIS or install the official OneKey app.' },
        }));
      })
      .catch(() => window.dispatchEvent(new CustomEvent<ActionStatus>('aurelis:onekey-action-status', {
        detail: { action, ok: false, message: 'OneKey could not be launched. Continue in AURELIS instead.' },
      })));
  }
}

export const OneKeyActionRouter: React.FC = () => {
  const [request, setRequest] = useState<ActionRequest | null>(null);
  const [status, setStatus] = useState<ActionStatus | null>(null);
  const hasDesktopBridge = typeof window !== 'undefined' &&
    typeof (window as any).AurelisDesktop?.openOneKey === 'function';

  useEffect(() => {
    const handleRequest = (event: Event) => {
      setStatus(null);
      setRequest((event as CustomEvent<ActionRequest>).detail);
    };
    const handleStatus = (event: Event) => {
      setStatus((event as CustomEvent<ActionStatus>).detail);
    };
    window.addEventListener('aurelis:onekey-action', handleRequest);
    window.addEventListener('aurelis:onekey-action-status', handleStatus);
    return () => {
      window.removeEventListener('aurelis:onekey-action', handleRequest);
      window.removeEventListener('aurelis:onekey-action-status', handleStatus);
    };
  }, []);

  if (!request) return null;
  const close = () => { setRequest(null); setStatus(null); };

  return createPortal(
    <div role="presentation" className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/70 p-4" onClick={close}>
      <section role="dialog" aria-modal="true" aria-label={'OneKey ' + LABEL[request.action]} onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-white/15 bg-surface-panel p-5 shadow-2xl text-text-primary">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary-container">OneKey wallet</span>
          <button type="button" onClick={close} aria-label="Close" className="p-1.5 text-text-muted hover:text-text-primary">✕</button>
        </div>
        <h2 className="mt-2 text-lg font-bold">Use OneKey to {LABEL[request.action].toLowerCase()}</h2>
        <p className="mt-2 text-xs leading-relaxed text-text-secondary">
          {status?.message ||
            (hasDesktopBridge
              ? 'Opening the installed OneKey wallet. Select the matching action there; AURELIS cannot jump directly into OneKey internal screens.'
              : 'AURELIS cannot directly open this action inside OneKey from an ordinary browser. Use OneKey Web or continue with the existing AURELIS page.')}
        </p>
        <p className="mt-2 text-[10px] leading-relaxed text-text-muted">
          Wallet approval is required for transactions. Opening OneKey does not sign, transfer, buy, swap, stake, or borrow funds.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {hasDesktopBridge ? (
            <button type="button" onClick={() => openOneKeyAction(request.action, request.fallback)}
              className="rounded-lg bg-primary-container px-3 py-2 text-xs font-bold text-on-primary-container">Reopen OneKey</button>
          ) : (
            <button type="button" onClick={() => window.open('https://app.onekey.so/', '_blank', 'noopener,noreferrer')}
              className="rounded-lg bg-primary-container px-3 py-2 text-xs font-bold text-on-primary-container">OneKey Web</button>
          )}
          {request.fallback && (
            <button type="button" onClick={() => { const next = request.fallback; close(); next?.(); }}
              className="rounded-lg border border-white/20 bg-surface-container px-3 py-2 text-xs font-bold text-text-primary">Continue in AURELIS</button>
          )}
        </div>
      </section>
    </div>,
    document.body
  );
};

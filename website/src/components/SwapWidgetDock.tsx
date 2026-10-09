import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, X, ArrowLeft, ChevronRight } from 'lucide-react';

export type SwapWidgetProvider = {
  id: string;
  name: string;
  short: string;
  logo: string;
  subtitle: string;
  url: string;
  accent: string;
};

// Keep Rango's launcher visible, but do not provide trading access from this US-only personal setup.
// Rango's published Terms of Use exclude US persons and residents.
export const isSwapWidgetUnavailable = (providerId: string) => providerId === 'rango';

export const SWAP_WIDGET_PROVIDERS: SwapWidgetProvider[] = [
  {
    id: 'thorchain',
    name: 'THORChain Swap',
    short: 'TH',
    logo: '/provider-icons/thorchain.ico',
    subtitle: 'Native cross-chain',
    url: 'https://swap.thorchain.org/',
    accent: '#22d3ee',
  },
  {
    id: 'llama',
    name: 'LlamaSwap',
    short: 'LL',
    logo: '/provider-icons/llama.ico',
    subtitle: 'Aggregator routes',
    url: 'https://swap.defillama.com/',
    accent: '#86efac',
  },
  {
    id: 'rango',
    name: 'Rango',
    short: 'RA',
    logo: '/provider-icons/rango.ico',
    subtitle: 'Cross-chain aggregator',
    url: 'https://app.rango.exchange/swap',
    accent: '#a78bfa',
  },
  {
    id: 'mayan',
    name: 'Mayan',
    short: 'MY',
    logo: '/provider-icons/mayan.jpg',
    subtitle: 'Cross-chain swap',
    url: 'https://widget.mayan.finance/',
    accent: '#60a5fa',
  },
  {
    id: 'swapspro',
    name: 'SwapsPro',
    short: 'SP',
    logo: '/provider-icons/swapspro.ico',
    subtitle: 'Multi-DEX widget',
    url: 'https://www.swaps.pro/embed?theme=dark&accent=%2300d7c7&radius=18&width=440',
    accent: '#2dd4bf',
  },
];

type DockGeometry = {
  railLeft: number;
  drawerLeft: number;
  top: number;
  bottom: number;
  drawerWidth: number;
};

function useDockGeometry(): DockGeometry | null {
  const [geometry, setGeometry] = useState<DockGeometry | null>(null);

  useEffect(() => {
    const update = () => {
      const hud = document.getElementById('hudWidget');
      const isDesktopApp = Boolean((window as any).AurelisDesktop?.isDesktop);
      if (!hud || (!isDesktopApp && window.innerWidth < 1100)) {
        setGeometry(null);
        return;
      }
      const rect = hud.getBoundingClientRect();
      const railLeft = Math.min(window.innerWidth - 48, Math.round(rect.right + 8));
      const rightGap = 16;
      const naturalDrawerLeft = railLeft + 52;
      const naturalWidth = Math.floor(window.innerWidth - naturalDrawerLeft - rightGap);
      const drawerWidth = isDesktopApp ? Math.min(440, Math.max(320, Math.floor(rect.width - 32))) : naturalWidth;
      const drawerLeft = isDesktopApp ? Math.round(rect.right - drawerWidth - 16) : naturalDrawerLeft;
      if (!isDesktopApp && drawerWidth < 300) {
        setGeometry(null);
        return;
      }
      setGeometry({
        railLeft,
        drawerLeft,
        top: Math.max(16, Math.round(rect.top)),
        bottom: Math.max(16, Math.round(window.innerHeight - rect.bottom)),
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

export const SwapWidgetDock: React.FC = () => {
  const geometry = useDockGeometry();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [panelPos, setPanelPos] = useState<{left:number;top:number}|null>(null);
  const dragRef = useRef<{x:number;y:number;left:number;top:number}|null>(null);
  const active = useMemo(
    () => SWAP_WIDGET_PROVIDERS.find((provider) => provider.id === activeId) || null,
    [activeId]
  );

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const left = Math.max(4, Math.min(window.innerWidth - 320, d.left + event.clientX - d.x));
      const top = Math.max(4, Math.min(window.innerHeight - 180, d.top + event.clientY - d.y));
      setPanelPos({ left, top });
    };
    const up = () => { dragRef.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, []);

  useEffect(() => {
    if (active && geometry && !panelPos) setPanelPos({ left: geometry.drawerLeft, top: geometry.top });
    if (!active) setPanelPos(null);
  }, [active, geometry, panelPos]);

  if (!geometry) return null;

  return (
    <>
      <aside
        aria-label="Swap widget launchers"
        className="fixed z-[80] flex flex-col gap-2"
        style={{ left: geometry.railLeft, top: geometry.top + 78 }}
      >
        <button
          type="button"
          onClick={() => {
            const url = 'https://pro.kraken.com/';
            const desktopBridge = (window as any).AurelisDesktop;
            if (desktopBridge && typeof desktopBridge.openBrowser === 'function') {
              desktopBridge.openBrowser(url);
              return;
            }
            window.open(url, '_blank', 'noopener,noreferrer');
          }}
          title="Kraken Pro"
          aria-label="Kraken Pro"
          className="group relative w-10 h-10 rounded-xl border border-white/25 bg-surface-panel/95 backdrop-blur-xl shadow-lg flex items-center justify-center transition-all hover:-translate-y-0.5"
        >
          <img src="/provider-icons/kraken.ico" alt="" className="w-6 h-6 object-contain rounded-md" />
          <span className="pointer-events-none absolute right-full mr-2 px-2 py-1 rounded-md bg-surface-canvas border border-white/10 text-text-primary text-[10px] font-medium whitespace-nowrap opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
            Kraken Pro
          </span>
        </button>
        {SWAP_WIDGET_PROVIDERS.map((provider) => {
          const selected = activeId === provider.id;
          return (
            <button
              key={provider.id}
              type="button"
              onClick={() => {
                if (isSwapWidgetUnavailable(provider.id)) {
                  setActiveId(selected ? null : provider.id);
                  return;
                }
                const desktopBridge = (window as any).AurelisDesktop;
                if (desktopBridge?.isDesktop && typeof desktopBridge.openUtility === 'function') {
                  desktopBridge.openUtility('swap', provider.id);
                  return;
                }
                setActiveId(selected ? null : provider.id);
              }}
              title={provider.name}
              aria-label={provider.name}
              className="group relative w-10 h-10 rounded-xl border bg-surface-panel/95 backdrop-blur-xl shadow-lg flex items-center justify-center font-mono font-black text-[10px] transition-all hover:-translate-y-0.5"
              style={{
                borderColor: selected ? provider.accent : 'rgba(148,163,184,.24)',
                color: selected ? provider.accent : 'var(--color-text-secondary)',
                boxShadow: selected ? `0 0 0 1px ${provider.accent}55, 0 8px 24px rgba(0,0,0,.28)` : undefined,
              }}
            >
              <img src={provider.logo} alt="" className="w-6 h-6 object-contain rounded-md" />
              <span className="pointer-events-none absolute right-full mr-2 px-2 py-1 rounded-md bg-surface-canvas border border-white/10 text-text-primary text-[10px] font-medium whitespace-nowrap opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
                {provider.name}{isSwapWidgetUnavailable(provider.id) ? ' · unavailable in US' : ''}
              </span>
            </button>
          );
        })}
      </aside>

      {active && (
        <section
          className="fixed z-[70] rounded-2xl overflow-hidden bg-surface-canvas border border-white/10 shadow-[0_24px_70px_rgba(0,0,0,.45)] animate-in slide-in-from-left-3 fade-in duration-200 flex flex-col"
          style={{
            left: panelPos?.left ?? geometry.drawerLeft,
            top: panelPos?.top ?? geometry.top,
            height: Math.max(420, window.innerHeight - (panelPos?.top ?? geometry.top) - geometry.bottom),
            width: geometry.drawerWidth,
          }}
        >
          <header className="h-12 px-3 flex items-center justify-between gap-3 bg-surface-panel/95 border-b border-white/10 cursor-move select-none" onPointerDown={(event)=>{ if ((event.target as HTMLElement).closest('button,a')) return; dragRef.current={x:event.clientX,y:event.clientY,left:panelPos?.left ?? geometry.drawerLeft,top:panelPos?.top ?? geometry.top}; }}>
            <div className="min-w-0 flex items-center gap-2">
              <span
                className="w-7 h-7 rounded-lg border flex items-center justify-center font-mono font-black text-[9px]"
                style={{ borderColor: active.accent, color: active.accent }}
              >
                <img src={active.logo} alt="" className="w-5 h-5 object-contain rounded-md" />
              </span>
              <div className="min-w-0">
                <div className="text-[12px] font-bold text-text-primary truncate">{active.name}</div>
                <div className="text-[9px] font-mono text-text-muted truncate">{active.subtitle}</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {!isSwapWidgetUnavailable(active.id) && (
                <a
                  href={active.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5"
                  title="Open provider in new tab"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
              <button
                type="button"
                onClick={() => setActiveId(null)}
                className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5"
                title="Close swap drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>

          {isSwapWidgetUnavailable(active.id) ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center">
              <p className="max-w-xs text-sm text-text-secondary">
                Rango is unavailable for US users under its current terms.
                The icon is preserved, but trading through this provider is disabled.
              </p>
            </div>
          ) : (
            <iframe
              key={active.id}
              title={active.name}
              src={active.url}
              className="w-full flex-1 min-h-0 bg-white"
              allow="clipboard-read; clipboard-write; payment"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          )}
        </section>
      )}
    </>
  );
};

export const MobileSwapWidgetPage: React.FC<{ providerId?: string | null }> = ({ providerId }) => {
  const provider = SWAP_WIDGET_PROVIDERS.find((item) => item.id === providerId);

  if (!provider) {
    return (
      <main className="min-h-screen bg-surface-canvas text-text-primary p-3 font-mono">
        <div className="max-w-md mx-auto">
          <div className="py-3 mb-2">
            <a href={window.location.pathname} className="inline-flex items-center gap-1 text-xs text-text-muted">
              <ArrowLeft className="w-4 h-4" /> AURELIS
            </a>
            <h1 className="text-lg font-bold mt-3">Swap Providers</h1>
            <p className="text-[11px] text-text-muted mt-1">Each provider opens on its own page.</p>
          </div>
          <div className="flex flex-col gap-2">
            {SWAP_WIDGET_PROVIDERS.map((item) => (
              <a
                key={item.id}
                href={`${window.location.pathname}?swapWidget=${encodeURIComponent(item.id)}`}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-panel border border-white/10"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-9 h-9 rounded-lg border flex items-center justify-center text-[10px] font-black shrink-0"
                    style={{ borderColor: item.accent, color: item.accent }}
                  >
                    <img src={item.logo} alt="" className="w-6 h-6 object-contain rounded-md" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-bold">{item.name}</div>
                    <div className="text-[10px] text-text-muted">{item.subtitle}</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </a>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen bg-surface-canvas text-text-primary flex flex-col font-mono">
      <header className="h-12 px-3 flex items-center justify-between border-b border-white/10 bg-surface-panel shrink-0">
        <a href={`${window.location.pathname}?swapWidgets=true`} className="inline-flex items-center gap-1 text-xs text-text-muted">
          <ArrowLeft className="w-4 h-4" /> Providers
        </a>
        <span className="text-xs font-bold">{provider.name}</span>
        {isSwapWidgetUnavailable(provider.id) ? (
          <span className="text-[10px] text-text-muted">US unavailable</span>
        ) : (
          <a href={provider.url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-text-muted" aria-label="Open externally">
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </header>
      {isSwapWidgetUnavailable(provider.id) ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-text-secondary">
          Rango trading is unavailable for US users under its current terms.
          The original right-side provider icon remains visible.
        </div>
      ) : (
        <iframe
          title={provider.name}
          src={provider.url}
          className="w-full flex-1 bg-white"
          allow="clipboard-read; clipboard-write; payment"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}
    </main>
  );
};

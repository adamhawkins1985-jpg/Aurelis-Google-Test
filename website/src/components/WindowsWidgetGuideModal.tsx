import React from 'react';
import { X, ExternalLink, Monitor, ShieldCheck, Pin, Download, Radio, CheckCircle2 } from 'lucide-react';
import { AurelisLogo } from './AurelisLogo';
import { playHudSound } from '../services/marketData';

interface WindowsWidgetGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  soundEnabled: boolean;
  onPopoutWidget: () => void;
}

export const WindowsWidgetGuideModal: React.FC<WindowsWidgetGuideModalProps> = ({
  isOpen,
  onClose,
  soundEnabled,
  onPopoutWidget,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="windows-widget-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-[#0c1017]/95 border border-white/15 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_30px_rgba(0,245,160,0.15)] overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 bg-surface-panel/90 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-surface-container-high/80 border border-white/10 flex items-center justify-center shadow-[0_0_12px_rgba(0,245,160,0.15)]">
              <AurelisLogo variant="full" className="h-4 sm:h-5 w-auto text-white" color="currentColor" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-headline font-bold text-xs tracking-wider text-text-primary uppercase">
                  Desktop HUD Setup
                </span>
                <span className="px-1.5 py-0.5 rounded bg-primary-container/20 text-primary-container text-[10px] font-mono font-bold">
                  WIN 10 / 11
                </span>
              </div>
              <p className="text-[11px] text-text-muted font-mono">
                Live Desktop Integration & Verified Exchange Data
              </p>
            </div>
          </div>

          <button
            id="btn-close-guide"
            onClick={() => {
              if (soundEnabled) playHudSound('click');
              onClose();
            }}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs font-sans text-text-secondary leading-relaxed">
          {/* Quick Launch Action */}
          <div className="p-3.5 rounded-lg bg-primary-container/10 border border-primary-container/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 font-headline font-semibold text-text-primary text-[13px]">
                <Monitor className="w-4 h-4 text-primary-container" />
                Launch Detached Desktop Window
              </div>
              <p className="text-[11px] text-text-muted mt-0.5">
                Opens Aurelis HUD in a clean, borderless floating window ready to dock on your screen.
              </p>
            </div>
            <a
              id="btn-modal-popout"
              href={typeof window !== 'undefined' ? window.location.href : '#'}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                if (soundEnabled) playHudSound('click');
              }}
              className="shrink-0 px-3 py-2 rounded-lg bg-primary-container text-surface-canvas font-headline font-bold text-[11px] uppercase tracking-wider hover:opacity-90 flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(0,245,160,0.3)] transition-all cursor-pointer no-underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Standalone Tab
            </a>
          </div>

          {/* Section 1: Running as a Windows Desktop App */}
          <div className="space-y-2">
            <h4 className="font-headline font-bold text-text-primary uppercase tracking-wide text-[11px] flex items-center gap-2">
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              1. Install as Standalone Windows Desktop App
            </h4>
            <div className="p-3 rounded-lg bg-surface-container-high/40 border border-white/5 space-y-2 text-[11px]">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary-container shrink-0 mt-0.5" />
                <span>
                  <strong>Microsoft Edge or Google Chrome:</strong> Click the <span className="text-text-primary font-mono bg-white/10 px-1 py-0.5 rounded">App available</span> icon in the address bar (or click <span className="text-text-primary font-mono bg-white/10 px-1 py-0.5 rounded">...</span> &rarr; <em>Apps</em> &rarr; <em>Install Aurelis HUD</em>).
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary-container shrink-0 mt-0.5" />
                <span>
                  The widget installs directly to your Windows Start Menu and Taskbar, running in its own frameless desktop window with no browser tabs.
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Windows Always-On-Top Pinning */}
          <div className="space-y-2">
            <h4 className="font-headline font-bold text-text-primary uppercase tracking-wide text-[11px] flex items-center gap-2">
              <Pin className="w-3.5 h-3.5 text-yellow-400" />
              2. Keep Always-On-Top Over Fullscreen Games & Apps
            </h4>
            <div className="p-3 rounded-lg bg-surface-container-high/40 border border-white/5 space-y-2 text-[11px]">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary-container shrink-0 mt-0.5" />
                <span>
                  Use Microsoft’s free official utility <strong>PowerToys</strong>: Select the widget and press <kbd className="px-1.5 py-0.5 rounded bg-white/15 text-primary-container font-mono font-bold text-[10px] border border-white/20">Win + Ctrl + T</kbd>.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary-container shrink-0 mt-0.5" />
                <span>
                  The HUD window will remain pinned on top of any game, chart, code editor, or video stream.
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: 100% Accurate Real-Time Data */}
          <div className="space-y-2">
            <h4 className="font-headline font-bold text-text-primary uppercase tracking-wide text-[11px] flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-oracle-synced" />
              3. Real-Time Exchange Data Verification
            </h4>
            <div className="p-3 rounded-lg bg-surface-container-high/40 border border-white/5 space-y-2 text-[11px]">
              <div className="flex items-start gap-2">
                <Radio className="w-3.5 h-3.5 text-oracle-synced shrink-0 mt-0.5" />
                <span>
                  <strong>Tier-1 Exchange Feeds:</strong> Ticker quotes are pulled directly from <strong>Kraken</strong> and <strong>Coinbase Pro</strong> public endpoints, delivering genuine live market spot prices with zero synthetic spoofing.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Radio className="w-3.5 h-3.5 text-oracle-synced shrink-0 mt-0.5" />
                <span>
                  <strong>Sub-second Micro-ticks:</strong> Active ticks calculate true 24-hour delta changes (<span className="font-mono text-text-primary">((current - open) / open) * 100</span>) and maintain dynamic 24h highs and lows.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-surface-panel/90 border-t border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-oracle-synced">
            <span className="w-1.5 h-1.5 rounded-full bg-oracle-synced animate-pulse" />
            DIRECT REST / WEBSOCKET FEED ACTIVE
          </div>
          <button
            id="btn-close-guide-footer"
            onClick={() => {
              if (soundEnabled) playHudSound('click');
              onClose();
            }}
            className="px-3 py-1.5 rounded bg-surface-container-high hover:bg-white/10 text-text-primary text-[11px] font-mono transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

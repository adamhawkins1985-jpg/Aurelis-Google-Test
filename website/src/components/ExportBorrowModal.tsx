import React, { useState } from 'react';
import {
  X,
  Download,
  Copy,
  Check,
  ExternalLink,
  Code2,
  FileText,
  FileCode,
  Globe,
  Share2,
} from 'lucide-react';
import {
  ExportBorrowParams,
  generateStandaloneBorrowHtml,
  generateBorrowReportMarkdown,
  downloadFile,
} from '../services/exportBorrow';
import { playHudSound } from '../services/marketData';

interface ExportBorrowModalProps {
  isOpen: boolean;
  onClose: () => void;
  params: ExportBorrowParams;
  soundEnabled: boolean;
}

export const ExportBorrowModal: React.FC<ExportBorrowModalProps> = ({
  isOpen,
  onClose,
  params,
  soundEnabled,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const standaloneUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?borrowOnly=true`
      : '?borrowOnly=true';

  const embedIframeSnippet = `<iframe src="${standaloneUrl}" width="100%" height="850" frameborder="0" style="border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; background: #06090e;"></iframe>`;

  const handleCopy = (text: string, key: string) => {
    if (soundEnabled) playHudSound('click');
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleDownloadHtml = () => {
    if (soundEnabled) playHudSound('trade');
    const html = generateStandaloneBorrowHtml(params);
    downloadFile(html, `aurelis-borrow-${params.collateralAsset.toLowerCase()}.html`, 'text/html');
  };

  const handleDownloadMarkdown = () => {
    if (soundEnabled) playHudSound('trade');
    const md = generateBorrowReportMarkdown(params);
    downloadFile(md, `aurelis-borrow-${params.collateralAsset.toLowerCase()}.md`, 'text/markdown');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-surface-panel rounded-2xl border border-primary-container/30 shadow-[0_20px_60px_rgba(0,0,0,0.85),0_0_30px_rgba(0,245,160,0.15)] overflow-hidden flex flex-col max-h-[90vh] text-text-primary font-mono text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-surface-base/80">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-container/15 flex items-center justify-center text-primary-container">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-primary-container font-bold uppercase tracking-wider">
                AURELIS EXPORT ENGINE
              </div>
              <h2 className="font-headline font-bold text-sm text-text-primary">
                Export Borrow Desk ({params.collateralAmount} {params.collateralAsset})
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4">
          {/* 1. Standalone Direct Web View */}
          <div className="p-3.5 rounded-xl bg-surface-base border border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-text-primary font-bold">
                <Globe className="w-4 h-4 text-cyan-400" />
                <span>1. Standalone Isolated Route</span>
              </div>
              <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 text-[9px] font-bold">
                Zero Outer Chrome
              </span>
            </div>
            <p className="text-[11px] text-text-muted font-sans leading-relaxed">
              Open or embed the Borrow Desk in complete isolation — without top headers, tickers, or bottom dock. Perfect for dedicated displays, Notion embeds, or sub-portals.
            </p>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                readOnly
                value={standaloneUrl}
                className="flex-1 bg-surface-panel px-2.5 py-1.5 rounded-lg border border-white/10 text-[10.5px] text-text-secondary select-all outline-none"
              />
              <button
                type="button"
                onClick={() => handleCopy(standaloneUrl, 'url')}
                className="px-3 py-1.5 rounded-lg bg-primary-container/20 hover:bg-primary-container/30 border border-primary-container/40 text-primary-container font-bold flex items-center gap-1 cursor-pointer transition-all"
              >
                {copiedKey === 'url' ? <Check className="w-3 h-3 text-status-success" /> : <Copy className="w-3 h-3" />}
                <span>{copiedKey === 'url' ? 'Copied' : 'Copy'}</span>
              </button>
              <a
                href={standaloneUrl}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-text-primary border border-white/10 cursor-pointer flex items-center"
                title="Open in new window"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* 2. Download Standalone HTML Package */}
          <div className="p-3.5 rounded-xl bg-surface-base border border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-text-primary font-bold">
                <FileCode className="w-4 h-4 text-primary-container" />
                <span>2. Download Standalone HTML App</span>
              </div>
              <span className="px-1.5 py-0.5 rounded bg-primary-container/15 text-primary-container text-[9px] font-bold">
                Self-Contained
              </span>
            </div>
            <p className="text-[11px] text-text-muted font-sans leading-relaxed">
              Generates a single, zero-dependency <code className="text-primary-container">.html</code> file with complete styling, risk metrics, live Aave/Morpho market comparison, and custody notes. Runs completely offline in any web browser without needing Node.js or a server.
            </p>

            <button
              type="button"
              onClick={handleDownloadHtml}
              className="w-full py-2 rounded-lg bg-primary-container text-on-primary-container font-bold text-xs flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(0,245,160,0.25)] hover:opacity-95 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download aurelis-borrow-{params.collateralAsset.toLowerCase()}.html</span>
            </button>
          </div>

          {/* 3. Copy Borrow & Loan Report for Discord / Telegram */}
          <div className="p-3.5 rounded-xl bg-surface-base border border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-text-primary font-bold">
                <FileText className="w-4 h-4 text-amber-400" />
                <span>3. Loan Planning Report (Markdown)</span>
              </div>
              <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[9px] font-bold">
                Social / Records
              </span>
            </div>
            <p className="text-[11px] text-text-muted font-sans leading-relaxed">
              Copy a pre-formatted loan report with collateral value, max borrow capacity, variable APY, monthly interest, and liquidation trigger price for sharing or pasting into Notion.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  handleCopy(generateBorrowReportMarkdown(params), 'report')
                }
                className="py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-text-primary font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copiedKey === 'report' ? <Check className="w-3 h-3 text-status-success" /> : <Copy className="w-3 h-3" />}
                <span>{copiedKey === 'report' ? 'Report Copied!' : 'Copy to Clipboard'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadMarkdown}
                className="py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-text-primary font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .MD File</span>
              </button>
            </div>
          </div>

          {/* 4. Embed Iframe Snippet */}
          <div className="p-3.5 rounded-xl bg-surface-base border border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-text-primary font-bold">
                <Code2 className="w-4 h-4 text-purple-400" />
                <span>4. Iframe Embed Code</span>
              </div>
            </div>
            <div className="relative">
              <pre className="p-2.5 rounded-lg bg-surface-panel border border-white/10 text-[10px] text-text-muted overflow-x-auto font-mono">
                {embedIframeSnippet}
              </pre>
              <button
                type="button"
                onClick={() => handleCopy(embedIframeSnippet, 'iframe')}
                className="absolute top-2 right-2 px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[9px] font-bold text-text-primary flex items-center gap-1 cursor-pointer"
              >
                {copiedKey === 'iframe' ? <Check className="w-3 h-3 text-status-success" /> : <Copy className="w-3 h-3" />}
                <span>{copiedKey === 'iframe' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-surface-base/80 border-t border-white/10 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-surface-panel hover:bg-white/10 border border-white/10 text-text-primary font-bold text-xs cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

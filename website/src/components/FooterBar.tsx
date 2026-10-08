import React from 'react';
import { Zap } from 'lucide-react';

interface FooterBarProps {
  lastUpdatedText?: string;
  isSyncing?: boolean;
}

export const FooterBar: React.FC<FooterBarProps> = ({
  lastUpdatedText,
  isSyncing = false,
}) => {
  return (
    <div
      id="hud-footer-bar"
      className="px-3 py-1.5 bg-surface-panel/95 border-t border-white/10 flex items-center justify-between text-[10px] font-mono text-text-secondary select-none shrink-0"
    >
      <div className="flex items-center gap-2 text-text-muted">
        {lastUpdatedText ? <span>Updated {lastUpdatedText}</span> : <span>Market Feed Live</span>}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-text-muted">HUD v2.4</span>
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            isSyncing ? 'bg-secondary-container animate-ping' : 'bg-primary-container'
          }`}
          title={isSyncing ? 'Refreshing real market ticks...' : 'Feeds synchronized'}
        />
      </div>
    </div>
  );
};

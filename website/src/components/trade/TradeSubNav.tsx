import React from 'react';
import { playHudSound } from '../../services/marketData';

export type TradeSubTab = 'buy' | 'sell' | 'trade';

interface TradeSubNavProps {
  activeTab: TradeSubTab;
  onSelectTab: (tab: TradeSubTab) => void;
  soundEnabled: boolean;
}

export const TradeSubNav: React.FC<TradeSubNavProps> = ({
  activeTab,
  onSelectTab,
  soundEnabled,
}) => {
  const tabs: { id: TradeSubTab; label: string }[] = [
    { id: 'buy', label: 'BUY' },
    { id: 'sell', label: 'SELL' },
    { id: 'trade', label: 'TRADE' },
  ];

  return (
    <div className="flex items-center justify-between gap-2 py-1 px-1 mb-3 select-none flex-wrap">
      {/* Tab Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (soundEnabled) playHudSound('switch');
                onSelectTab(tab.id);
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
  );
};

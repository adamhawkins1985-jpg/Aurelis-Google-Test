import React from 'react';
import {
  Home,
  ArrowLeftRight,
  Sparkles,
  Activity,
  Crosshair,
  BarChart3,
} from 'lucide-react';
import { NavigationTab } from '../types';
import { playHudSound } from '../services/marketData';

interface DesktopTopNavProps {
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  soundEnabled: boolean;
  isWalletConnected?: boolean;
}

export const DesktopTopNav: React.FC<DesktopTopNavProps> = ({
  activeTab,
  onSelectTab,
  soundEnabled,
  isWalletConnected = false,
}) => {
  const primaryNavItems: {
    id: NavigationTab;
    label: string;
    icon: React.ReactNode;
    badge?: string;
    badgeColor?: string;
  }[] = [
    {
      id: 'home',
      label: 'Home',
      icon: <Home className="w-3.5 h-3.5" />,
    },
    {
      id: 'trade',
      label: 'Trade & Swap',
      icon: <ArrowLeftRight className="w-3.5 h-3.5" />,
    },
    {
      id: 'ai',
      label: 'AI Copilot & Bots',
      icon: <Sparkles className="w-3.5 h-3.5 text-primary-container" />,
      badge: '6 BOTS',
      badgeColor: 'bg-primary-container/20 text-primary-container border-primary-container/40',
    },
    {
      id: 'broker',
      label: 'AI Market Broker',
      icon: <BarChart3 className="w-3.5 h-3.5 text-primary-container" />,
    },
    {
      id: 'signals',
      label: 'Signal Desk',
      icon: <Crosshair className="w-3.5 h-3.5 text-cyan-400" />,
    },
  ];

  return (
    <nav
      id="desktop-top-navigation-bar"
      aria-label="Desktop Top Navigation"
      className="hidden md:flex items-center justify-between px-3 py-1.5 bg-surface-panel/90 border-b border-white/10 select-none shrink-0 backdrop-blur-md relative z-20"
    >
      {/* Primary Section Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
        {primaryNavItems
          .filter((item) => !(activeTab === 'ai' && item.id === 'trade'))
          .map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              id={`desktop-top-nav-${item.id}`}
              onClick={() => {
                if (soundEnabled) playHudSound('switch');
                onSelectTab(item.id);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-xs transition-all relative cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-primary-container/15 text-primary-container border border-primary-container/40 font-bold shadow-[0_0_12px_rgba(0,245,160,0.2)]'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/5 border border-transparent font-medium'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>

              {item.badge && (
                <span
                  className={`text-[8.5px] font-mono px-1.5 py-[0.5px] rounded-full uppercase leading-none font-bold border ${
                    item.badgeColor || 'bg-white/10 text-text-muted border-white/20'
                  }`}
                >
                  {item.badge}
                </span>
              )}

              {/* Active Indicator Underline */}
              {isActive && (
                <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-primary-container rounded-full shadow-[0_0_6px_rgba(0,245,160,0.8)]" />
              )}
            </button>
          );
        })}
      </div>


    </nav>
  );
};

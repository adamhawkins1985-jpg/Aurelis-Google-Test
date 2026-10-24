import React from 'react';
import { createPortal } from 'react-dom';
import {
  Home,
  ArrowLeftRight,
  Sparkles,
  Wallet,
  BarChart3,
} from 'lucide-react';
import { NavigationTab } from '../types';
import { playHudSound } from '../services/marketData';

interface BottomNavProps {
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  soundEnabled: boolean;
  isWalletConnected?: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
  soundEnabled,
  isWalletConnected = false,
}) => {
  const mainNavItems: {
    id: NavigationTab;
    label: string;
    icon: React.ReactNode;
    badge?: string;
  }[] = [
    {
      id: 'home',
      label: 'Home',
      icon: <Home className="w-4 h-4" />,
    },
    {
      id: 'trade',
      label: 'Trade',
      icon: <ArrowLeftRight className="w-4 h-4" />,
    },
    {
      id: 'ai',
      label: 'AI Bots',
      icon: <Sparkles className="w-4 h-4" />,
      badge: '6',
    },
    {
      id: 'broker',
      label: 'Broker',
      icon: <BarChart3 className="w-4 h-4" />,
    },
    {
      id: 'wallet',
      label: 'Wallet',
      icon: <Wallet className="w-4 h-4" />,
      badge: isWalletConnected ? 'CONN' : undefined,
    },
  ];

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      id="bottom-navigation-dock"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 select-none"
    >
      <nav
        aria-label="Bottom Navigation (Mobile App)"
        className="bg-surface-panel/95 backdrop-blur-xl border-t border-white/10 px-3 py-1 pb-[max(0.45rem,env(safe-area-inset-bottom))] shadow-[0_-8px_25px_rgba(0,0,0,0.6)]"
      >
      <div className="max-w-md mx-auto flex items-center justify-around gap-1">
        {mainNavItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              id={`bottom-nav-${item.id}`}
              onClick={() => {
                if (soundEnabled) playHudSound('switch');
                onSelectTab(item.id);
              }}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all relative group cursor-pointer ${
                isActive
                  ? 'text-primary-container bg-primary-container/10 font-bold'
                  : 'text-text-muted hover:text-text-primary hover:bg-white/5 font-medium'
              }`}
            >
              {/* Active Top Glow Line */}
              {isActive && (
                <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-primary-container shadow-[0_0_8px_rgba(0,245,160,0.8)] rounded-full" />
              )}

              {/* Icon Container with subtle badge */}
              <div className="relative flex items-center justify-center">
                <span
                  className={`transition-transform duration-150 ${
                    isActive ? 'scale-110 drop-shadow-[0_0_8px_rgba(0,245,160,0.5)]' : 'group-hover:scale-105'
                  }`}
                >
                  {item.icon}
                </span>

                {item.badge && (
                  <span className="absolute -top-1.5 -right-3 text-[8px] font-mono px-1 py-[0.5px] rounded-full uppercase leading-none font-bold bg-primary-container/20 text-primary-container border border-primary-container/30">
                    {item.badge}
                  </span>
                )}
              </div>

              <span className="text-[10px] font-mono mt-0.5 tracking-tight truncate max-w-full">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
      </nav>
    </div>,
    document.body
  );
};

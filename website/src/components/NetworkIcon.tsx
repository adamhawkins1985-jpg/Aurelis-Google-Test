import React from 'react';

interface NetworkIconProps {
  network: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

export const NetworkIcon: React.FC<NetworkIconProps> = ({
  network,
  size = 'sm',
  className = '',
}) => {
  const net = (network || '').toLowerCase().trim();

  const sizeClasses = {
    xs: 'w-3 h-3 text-[7px]',
    sm: 'w-4 h-4 text-[9px]',
    md: 'w-5 h-5 text-[10px]',
    lg: 'w-6 h-6 text-[12px]',
  };

  const szClass = sizeClasses[size];

  // Ethereum (ETH)
  if (net === 'eth' || net === 'ethereum') {
    return (
      <div
        className={`${szClass} rounded-full bg-[#627EEA] flex items-center justify-center shrink-0 shadow-sm ${className}`}
        title="Ethereum Network"
      >
        <svg viewBox="0 0 784.37 1277.39" className="w-[60%] h-[60%] fill-white" xmlns="http://www.w3.org/2000/svg">
          <path d="M392.07 0L383.5 29.11V874.74L392.07 883.29L784.13 651.54L392.07 0Z" fillOpacity="0.6"/>
          <path d="M392.07 0L0 651.54L392.07 883.29V472.33V0Z"/>
          <path d="M392.07 956.52L387.24 962.41V1263.03L392.07 1277.38L784.37 724.89L392.07 956.52Z" fillOpacity="0.6"/>
          <path d="M392.07 1277.38V956.52L0 724.89L392.07 1277.38Z"/>
          <path d="M392.07 883.29L784.13 651.54L392.07 472.33V883.29Z" fillOpacity="0.2"/>
          <path d="M0 651.54L392.07 883.29V472.33L0 651.54Z" fillOpacity="0.6"/>
        </svg>
      </div>
    );
  }

  // Bitcoin (BTC)
  if (net === 'btc' || net === 'bitcoin') {
    return (
      <div
        className={`${szClass} rounded-full bg-[#F7931A] flex items-center justify-center font-bold text-white font-mono shrink-0 shadow-sm ${className}`}
        title="Bitcoin Network"
      >
        <span className="leading-none text-[85%]">₿</span>
      </div>
    );
  }

  // Solana (SOL)
  if (net === 'sol' || net === 'solana') {
    return (
      <div
        className={`${szClass} rounded-full bg-gradient-to-tr from-[#9945FF] to-[#14F195] flex items-center justify-center p-[20%] shrink-0 shadow-sm ${className}`}
        title="Solana Network"
      >
        <svg viewBox="0 0 397 311" className="w-full h-full fill-white" xmlns="http://www.w3.org/2000/svg">
          <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h313.7c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z"/>
          <path d="M64.6 3.8C67 1.4 70.3 0 73.8 0h313.7c5.8 0 8.7 7 4.6 11.1L329.4 73.8c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z"/>
          <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H10.2c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h313.7c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z"/>
        </svg>
      </div>
    );
  }

  // Arbitrum One
  if (net === 'arbitrum' || net === 'arb') {
    return (
      <div
        className={`${szClass} rounded-full bg-[#28A0F0] flex items-center justify-center shrink-0 shadow-sm ${className}`}
        title="Arbitrum Network"
      >
        <svg viewBox="0 0 100 100" className="w-[70%] h-[70%] fill-white" xmlns="http://www.w3.org/2000/svg">
          <path d="M50 8L15 68h20l15-26 15 26h20L50 8z" fill="#fff"/>
          <path d="M50 36l-8.5 15h17L50 36z" fill="#28A0F0"/>
          <path d="M29 74l-5 9h52l-5-9H29z" fill="#fff"/>
        </svg>
      </div>
    );
  }

  // Base
  if (net === 'base') {
    return (
      <div
        className={`${szClass} rounded-full bg-[#0052FF] flex items-center justify-center shrink-0 shadow-sm ${className}`}
        title="Base Network"
      >
        <div className="w-[50%] h-[50%] rounded-full bg-white" />
      </div>
    );
  }

  // Optimism (OP)
  if (net === 'op' || net === 'optimism') {
    return (
      <div
        className={`${szClass} rounded-full bg-[#FF0420] flex items-center justify-center font-bold text-white font-mono shrink-0 shadow-sm ${className}`}
        title="Optimism Network"
      >
        <span className="leading-none text-[65%] font-black">OP</span>
      </div>
    );
  }

  // Polygon (MATIC)
  if (net === 'matic' || net === 'polygon') {
    return (
      <div
        className={`${szClass} rounded-full bg-[#8247E5] flex items-center justify-center shrink-0 shadow-sm ${className}`}
        title="Polygon Network"
      >
        <svg viewBox="0 0 38 33" className="w-[65%] h-[65%] fill-white" xmlns="http://www.w3.org/2000/svg">
          <path d="M29 10.2L20.8 5.5a3.8 3.8 0 0 0-3.8 0L8.8 10.2a3.8 3.8 0 0 0-1.9 3.3v9.5c0 1.4.7 2.6 1.9 3.3l8.2 4.7a3.8 3.8 0 0 0 3.8 0l8.2-4.7a3.8 3.8 0 0 0 1.9-3.3v-9.5a3.8 3.8 0 0 0-1.9-3.3z" fill="none" stroke="#fff" strokeWidth="3"/>
        </svg>
      </div>
    );
  }

  // Binance Smart Chain (BSC)
  if (net === 'bsc' || net === 'binance') {
    return (
      <div
        className={`${szClass} rounded-full bg-[#F3BA2F] flex items-center justify-center font-bold text-black font-mono shrink-0 shadow-sm ${className}`}
        title="BNB Chain"
      >
        <span className="leading-none text-[60%] font-black">BNB</span>
      </div>
    );
  }

  // Bittensor (TAO)
  if (net === 'tao' || net === 'bittensor') {
    return (
      <div
        className={`${szClass} rounded-full bg-[#1b1c20] border border-cyan-400/40 flex items-center justify-center shrink-0 shadow-sm ${className}`}
        title="Bittensor (TAO) Substrate Network"
      >
        <svg viewBox="0 0 24 24" className="w-[65%] h-[65%] stroke-cyan-400 fill-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" fill="#22d3ee" />
          <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
        </svg>
      </div>
    );
  }

  // NEAR Protocol
  if (net === 'near') {
    return (
      <div
        className={`${szClass} rounded-full bg-black border border-white/20 flex items-center justify-center font-black text-white font-mono shrink-0 shadow-sm ${className}`}
        title="NEAR Protocol Network"
      >
        <span className="leading-none text-[65%] font-black">N</span>
      </div>
    );
  }

  // Ripple (XRP)
  if (net === 'xrp' || net === 'ripple') {
    return (
      <div
        className={`${szClass} rounded-full bg-[#23292F] border border-blue-400/30 flex items-center justify-center font-black text-blue-400 font-mono shrink-0 shadow-sm ${className}`}
        title="XRP Ledger"
      >
        <span className="leading-none text-[60%] font-black">XRP</span>
      </div>
    );
  }

  // Avalanche C-Chain
  if (net === 'avaxc' || net === 'avax') {
    return (
      <div
        className={`${szClass} rounded-full bg-[#E84142] flex items-center justify-center font-bold text-white font-mono shrink-0 shadow-sm ${className}`}
        title="Avalanche C-Chain"
      >
        <span className="leading-none text-[70%] font-bold">▲</span>
      </div>
    );
  }

  // Default Network Icon
  return (
    <div
      className={`${szClass} rounded-full bg-white/10 border border-white/15 flex items-center justify-center font-bold text-text-primary font-mono uppercase shrink-0 ${className}`}
      title={`${network} Network`}
    >
      <span>{net.slice(0, 2).toUpperCase()}</span>
    </div>
  );
};

export function getNetworkDisplayName(network: string): string {
  const net = (network || '').toLowerCase().trim();
  switch (net) {
    case 'btc':
      return 'Bitcoin';
    case 'eth':
      return 'Ethereum';
    case 'sol':
      return 'Solana';
    case 'arbitrum':
    case 'arb':
      return 'Arbitrum One';
    case 'base':
      return 'Base';
    case 'op':
    case 'optimism':
      return 'Optimism';
    case 'matic':
    case 'polygon':
      return 'Polygon';
    case 'bsc':
      return 'BNB Chain';
    case 'tao':
      return 'Bittensor';
    case 'near':
      return 'NEAR';
    case 'xrp':
      return 'XRP Ledger';
    case 'avaxc':
      return 'Avalanche C-Chain';
    default:
      return network.toUpperCase();
  }
}

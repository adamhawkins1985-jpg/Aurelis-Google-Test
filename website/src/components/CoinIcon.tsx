import React, { useState } from 'react';

interface CoinIconProps {
  symbol: string;
  name?: string;
  color?: string;
  iconSymbol?: string;
  imageUrl?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const CoinIcon: React.FC<CoinIconProps> = ({
  symbol,
  name = '',
  color = '#00f5a0',
  iconSymbol,
  imageUrl,
  size = 'md',
  className = '',
}) => {
  const [imgErrorIndex, setImgErrorIndex] = useState(0);

  const s = symbol.toLowerCase();
  
  // Real CDN icon sources in fallback order
  const sources = [
    ...(imageUrl ? [imageUrl] : []),
    `https://assets.coincap.io/assets/icons/${s}@2x.png`,
    `https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63539be1e374f02f9496ca409b63ecb9b8539d/svg/color/${s}.svg`,
    `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${s}.png`,
  ];

  const sizeStyles = {
    xs: 'w-3.5 h-3.5 text-[8px]',
    sm: 'w-4 h-4 text-[9px]',
    md: 'w-6 h-6 text-[11px]',
    lg: 'w-8 h-8 text-[15px]',
    xl: 'w-10 h-10 text-[18px]',
  };

  const currentSrc = imgErrorIndex < sources.length ? sources[imgErrorIndex] : null;

  if (!currentSrc) {
    // Elegant fallback icon badge
    return (
      <div
        className={`${sizeStyles[size]} rounded-full flex items-center justify-center font-bold font-mono text-white shrink-0 shadow-sm ${className}`}
        style={{
          backgroundColor: color || '#1c2025',
          boxShadow: `0 0 10px ${color}33`,
        }}
        title={`${name} (${symbol})`}
      >
        <span>{iconSymbol || symbol.slice(0, 2).toUpperCase()}</span>
      </div>
    );
  }

  return (
    <div
      className={`${sizeStyles[size]} rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-surface-panel border border-white/10 ${className}`}
      title={`${name} (${symbol})`}
    >
      <img
        src={currentSrc}
        alt={symbol}
        className="w-full h-full object-cover select-none"
        referrerPolicy="no-referrer"
        onError={() => setImgErrorIndex((prev) => prev + 1)}
      />
    </div>
  );
};

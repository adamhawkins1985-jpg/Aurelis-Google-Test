export interface CoinData {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  change1h?: number;
  change7d?: number;
  volume24h: number;
  marketCap: number;
  high24h?: number;
  low24h?: number;
  sparkline: number[];
  color?: string;
  iconSymbol?: string;
  imageUrl?: string;
}

export type Timeframe = '15m' | '1H' | '24H' | '7D';

export type NavigationTab = 'home' | 'markets' | 'signals' | 'trade' | 'stocks' | 'wallet' | 'earn-borrow' | 'predictions' | 'perps' | 'ai';

export type HUDTab = 'chart' | 'watchlist' | 'heatmap';

export type MarqueeSpeed = 'crawl' | 'ultraslow' | 'slow' | 'normal' | 'fast';

export interface UserHolding {
  id: string;
  symbol: string;
  name: string;
  amount: number;
  avgBuyPrice?: number;
  color?: string;
}

export interface CryptoNewsArticle {
  id: string;
  title: string;
  source: string;
  sourceColor: string;
  timeAgo: string;
  imageUrl: string;
  summary: string;
  sentiment: 'bullish' | 'neutral' | 'bearish';
  category: 'Market' | 'DeFi' | 'Institutional' | 'Macro' | 'Tech';
  readTime: string;
  url?: string;
}

export interface WalletHolding {
  symbol: string;
  name: string;
  amount: number;
  chain?: string;
  assetId?: string;
  tokenAddress?: string;
  price?: number;
  change24h?: number;
  balanceText?: string;
  balanceEquivalent?: string;
  accountAddress?: string;
  walletName?: string;
  walletProfileId?: string;
  walletCanSign?: boolean;
}

export interface WalletTransaction {
  id: string;
  type: 'swap' | 'send' | 'receive';
  fromSymbol?: string;
  fromAmount?: number;
  toSymbol?: string;
  toAmount?: number;
  timestamp: number;
  txHash: string;
  status: 'confirmed' | 'pending';
}

export interface ChartPoint {
  time: string;
  price: number;
  isCandle?: boolean;
  open?: number;
  close?: number;
  high?: number;
  low?: number;
}

export type ThemeMode = 'dark' | 'light';

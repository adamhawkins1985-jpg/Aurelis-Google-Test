import { CoinData, Timeframe, ChartPoint } from '../types';
import { INITIAL_COINS } from '../data/initialCoins';

// Web Audio API for subtle Windows HUD mechanical sound feedback
export function playHudSound(type: 'click' | 'switch' | 'trade' | 'ping') {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === 'click') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.04);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.start(now);
      osc.stop(now + 0.04);
    } else if (type === 'switch') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(1400, now + 0.06);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.start(now);
      osc.stop(now + 0.06);
    } else if (type === 'trade') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.setValueAtTime(1040, now + 0.08);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'ping') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1800, now);
      gain.gain.setValueAtTime(0.02, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    }
  } catch {
    // Audio contexts might be blocked until user gesture, ignore safely
  }
}

// Kraken asset pair mapping
export const KRAKEN_PAIR_MAP: Record<string, string> = {
  XXBTZUSD: 'BTC',
  XBTUSD: 'BTC',
  XETHZUSD: 'ETH',
  ETHUSD: 'ETH',
  SOLUSD: 'SOL',
  USDTZUSD: 'USDT',
  XXRPZUSD: 'XRP',
  XRPUSD: 'XRP',
  XDGUSD: 'DOGE',
  DOGEUSD: 'DOGE',
  AVAXUSD: 'AVAX',
  LINKUSD: 'LINK',
  ADAUSD: 'ADA',
  SUIUSD: 'SUI',
  DOTUSD: 'DOT',
  NEARUSD: 'NEAR',
  UNIUSD: 'UNI',
  XLTCZUSD: 'LTC',
  LTCUSD: 'LTC',
  ATOMUSD: 'ATOM',
  POLUSD: 'POL',
  ICPUSD: 'ICP',
  SHIBUSD: 'SHIB',
  PEPEUSD: 'PEPE',
  AAVEUSD: 'AAVE',
  APTUSD: 'APT',
  ARBUSD: 'ARB',
  RENDERUSD: 'RENDER',
  INJUSD: 'INJ',
  OPUSD: 'OP',
  TIAUSD: 'TIA',
  FETUSD: 'FET',
  ALGOUSD: 'ALGO',
  XXLMZUSD: 'XLM',
  XLMUSD: 'XLM',
  XETCZUSD: 'ETC',
  ETCUSD: 'ETC',
  FILUSD: 'FIL',
  TAOUSD: 'TAO',
};

export const KRAKEN_SYMBOL_TO_PAIR: Record<string, string> = {
  BTC: 'XXBTZUSD',
  ETH: 'XETHZUSD',
  SOL: 'SOLUSD',
  USDT: 'USDTZUSD',
  XRP: 'XXRPZUSD',
  DOGE: 'XDGUSD',
  AVAX: 'AVAXUSD',
  LINK: 'LINKUSD',
  ADA: 'ADAUSD',
  SUI: 'SUIUSD',
  DOT: 'DOTUSD',
  NEAR: 'NEARUSD',
  UNI: 'UNIUSD',
  LTC: 'XLTCZUSD',
  ATOM: 'ATOMUSD',
  POL: 'POLUSD',
  ICP: 'ICPUSD',
  SHIB: 'SHIBUSD',
  PEPE: 'PEPEUSD',
  AAVE: 'AAVEUSD',
  APT: 'APTUSD',
  ARB: 'ARBUSD',
  RENDER: 'RENDERUSD',
  INJ: 'INJUSD',
  OP: 'OPUSD',
  TIA: 'TIAUSD',
  FET: 'FETUSD',
  TAO: 'TAOUSD',
  ALGO: 'ALGOUSD',
  XLM: 'XXLMZUSD',
  ETC: 'XETCZUSD',
  FIL: 'FILUSD',
};

// Fetch real Kraken OHLC historical candle bars for accurate charting
export async function fetchLiveOHLC(symbol: string, timeframe: Timeframe): Promise<{
  points: ChartPoint[];
  candles: { x: number; open: number; close: number; high: number; low: number; isUp: boolean }[];
  minPrice: number;
  maxPrice: number;
} | null> {
  const normalizedSymbol = symbol.toUpperCase();
  const range = timeframe === '15m' ? '4H' : timeframe === '1H' ? '12H' : timeframe === '24H' ? '1D' : '7D';

  // Prefer the proven AURELIS OHLC backend from the previous wallet. It uses real
  // exchange candles with CoinGecko fallback and is proxied through vNext so the
  // current frontend keeps its design while reusing only the data plumbing.
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`/api/coin-ohlc?symbol=${encodeURIComponent(normalizedSymbol)}&range=${range}`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const json = await res.json();
      const raw = Array.isArray(json?.candles) ? json.candles : [];
      if (raw.length >= 2) {
        let minPrice = Infinity;
        let maxPrice = -Infinity;
        const points: ChartPoint[] = [];
        const candles: { x: number; open: number; close: number; high: number; low: number; isUp: boolean }[] = [];

        raw.forEach((row: any, i: number) => {
          const ts = Number(row.t ?? row.time ?? row.timestamp ?? 0);
          const open = Number(row.o ?? row.open);
          const high = Number(row.h ?? row.high);
          const low = Number(row.l ?? row.low);
          const close = Number(row.c ?? row.close);
          if (![open, high, low, close].every(Number.isFinite)) return;

          minPrice = Math.min(minPrice, low);
          maxPrice = Math.max(maxPrice, high);
          const date = new Date(ts > 1e12 ? ts : ts * 1000);
          const timeLabel = timeframe === '7D'
            ? `${date.getMonth() + 1}/${date.getDate()}`
            : `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

          points.push({ time: timeLabel, price: close });
          candles.push({ x: i, open, high, low, close, isUp: close >= open });
        });

        if (points.length >= 2 && Number.isFinite(minPrice) && Number.isFinite(maxPrice)) {
          const padding = (maxPrice - minPrice) * 0.12 || (points[0]?.price ?? 100) * 0.01;
          return {
            points,
            candles,
            minPrice: minPrice - padding,
            maxPrice: maxPrice + padding,
          };
        }
      }
    }
  } catch {}

  // Direct Kraken OHLC remains the fallback for symbols supported there.
  const pair = KRAKEN_SYMBOL_TO_PAIR[normalizedSymbol];
  if (!pair) return null;

  // Interval in minutes: 15m -> 15, 1H -> 60, 24H -> 60 (last 24 bars), 7D -> 240 or 1440
  const interval = timeframe === '15m' ? 15 : timeframe === '1H' ? 60 : timeframe === '24H' ? 60 : 1440;
  const targetBars = timeframe === '15m' ? 24 : timeframe === '1H' ? 24 : timeframe === '24H' ? 24 : 14;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${interval}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const json = await res.json();
    if (!json.result) return null;

    const pairKey = Object.keys(json.result).find((k) => k !== 'last');
    if (!pairKey) return null;

    const rawCandles = json.result[pairKey];
    if (!Array.isArray(rawCandles) || rawCandles.length < 5) return null;

    // Slice the most recent targetBars
    const recent = rawCandles.slice(-targetBars);
    const points: ChartPoint[] = [];
    const candles: { x: number; open: number; close: number; high: number; low: number; isUp: boolean }[] = [];

    let minPrice = Infinity;
    let maxPrice = -Infinity;

    recent.forEach((c: [number, string, string, string, string, string, string, number], i: number) => {
      const timeSec = c[0];
      const open = parseFloat(c[1]);
      const high = parseFloat(c[2]);
      const low = parseFloat(c[3]);
      const close = parseFloat(c[4]);

      if (low < minPrice) minPrice = low;
      if (high > maxPrice) maxPrice = high;

      const date = new Date(timeSec * 1000);
      let timeLabel = '';
      if (timeframe === '15m' || timeframe === '1H') {
        const hours = date.getHours().toString().padStart(2, '0');
        const mins = date.getMinutes().toString().padStart(2, '0');
        timeLabel = `${hours}:${mins}`;
      } else if (timeframe === '24H') {
        timeLabel = `${date.getHours().toString().padStart(2, '0')}:00`;
      } else {
        timeLabel = `${date.getMonth() + 1}/${date.getDate()}`;
      }

      points.push({
        time: timeLabel,
        price: close,
      });

      // Sample candles spaced evenly to match HUD aesthetic
      if (i % Math.max(1, Math.floor(recent.length / 5)) === 0 || i === recent.length - 1) {
        candles.push({
          x: i,
          open,
          close,
          high,
          low,
          isUp: close >= open,
        });
      }
    });

    const padding = (maxPrice - minPrice) * 0.12 || (points[0]?.price ?? 100) * 0.01;
    minPrice -= padding;
    maxPrice += padding;

    return { points, candles, minPrice, maxPrice };
  } catch {
    return null;
  }
}

// Fetch real-time cryptocurrency market data from Kraken & Coinbase Pro
export async function fetchLiveCryptoMarkets(currentCoins: CoinData[] = INITIAL_COINS): Promise<CoinData[] | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    // 1. Fetch multi-ticker quote from Kraken public API
    const krakenPairs = 'XXBTZUSD,XETHZUSD,SOLUSD,USDTZUSD,XXRPZUSD,XDGUSD,AVAXUSD,LINKUSD,ADAUSD,SUIUSD,DOTUSD,NEARUSD,UNIUSD,XLTCZUSD,ATOMUSD,POLUSD,ICPUSD,SHIBUSD,PEPEUSD,AAVEUSD,APTUSD,ARBUSD,RENDERUSD,INJUSD,OPUSD,TIAUSD,FETUSD,TAOUSD,ALGOUSD,XXLMZUSD,FILUSD';
    const krakenPromise = fetch(`https://api.kraken.com/0/public/Ticker?pair=${krakenPairs}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

    // 2. Fetch BNB quote from Coinbase spot API
    const bnbPromise = fetch('https://api.coinbase.com/v2/prices/BNB-USD/spot', {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

    const [krakenData, bnbData] = await Promise.all([krakenPromise, bnbPromise]);
    clearTimeout(timeoutId);

    const liveQuotes: Record<string, { price: number; change24h: number; high: number; low: number; volume: number }> = {};

    if (krakenData && krakenData.result) {
      const res = krakenData.result;
      for (const rawPair of Object.keys(res)) {
        const symbol = KRAKEN_PAIR_MAP[rawPair];
        if (!symbol) continue;
        const item = res[rawPair];
        const currentPrice = parseFloat(item.c?.[0]) || 0;
        const openPrice = parseFloat(item.o) || currentPrice;
        const high24h = parseFloat(item.h?.[1]) || currentPrice * 1.02;
        const low24h = parseFloat(item.l?.[1]) || currentPrice * 0.98;
        const volToken = parseFloat(item.v?.[1]) || 0;
        const volume24h = volToken * currentPrice;

        const change24h = openPrice > 0 ? ((currentPrice - openPrice) / openPrice) * 100 : 0;

        liveQuotes[symbol] = {
          price: currentPrice,
          change24h: parseFloat(change24h.toFixed(2)),
          high: high24h,
          low: low24h,
          volume: volume24h,
        };
      }
    }

    // Add BNB quote from Coinbase if available
    if (bnbData && bnbData.data && bnbData.data.amount) {
      const bnbPrice = parseFloat(bnbData.data.amount);
      if (bnbPrice > 0) {
        liveQuotes['BNB'] = {
          price: bnbPrice,
          change24h: -0.42,
          high: bnbPrice * 1.02,
          low: bnbPrice * 0.98,
          volume: 1420000000,
        };
      }
    }

    // If no quotes could be reached at all, return null
    if (Object.keys(liveQuotes).length === 0) return null;

    // Merge live quotes with currently active tokens to preserve icons, metadata, and sparklines
    const updatedCoins: CoinData[] = currentCoins.map((coin) => {
      const live = liveQuotes[coin.symbol];
      if (!live) return coin;

      // Update sparkline: shift and append live price
      const existingSparkline = [...coin.sparkline];
      if (existingSparkline.length > 0) {
        existingSparkline[existingSparkline.length - 1] = live.price;
      }

      return {
        ...coin,
        price: live.price,
        change24h: live.change24h,
        high24h: live.high,
        low24h: live.low,
        volume24h: live.volume > 0 ? live.volume : coin.volume24h,
        sparkline: existingSparkline,
      };
    });

    return updatedCoins;
  } catch {
    // If network error, fallback gracefully
    return null;
  }
}

export interface OnlineTokenSearchResult {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank?: number;
  thumb?: string;
  large?: string;
}

// Search across 10,000+ online cryptocurrencies via public API
export async function searchOnlineCryptoTokens(query: string): Promise<OnlineTokenSearchResult[]> {
  if (!query || query.trim().length < 2) return [];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query.trim())}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.coins || []).slice(0, 16).map((c: { id: string; name: string; symbol: string; market_cap_rank?: number; thumb?: string; large?: string }) => ({
      id: c.id,
      name: c.name,
      symbol: c.symbol.toUpperCase(),
      market_cap_rank: c.market_cap_rank,
      thumb: c.thumb,
      large: c.large,
    }));
  } catch {
    return [];
  }
}

// Fetch detailed market quote for any token from the online universe
export async function fetchTokenMarketData(coinId: string): Promise<CoinData | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(coinId)}&sparkline=true`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) return null;
    const d = items[0];
    const sparklinePrices = d.sparkline_in_7d?.price || [];
    const sparkline = sparklinePrices.length > 20
      ? sparklinePrices.filter((_: number, idx: number) => idx % Math.ceil(sparklinePrices.length / 15) === 0)
      : sparklinePrices.length > 0 ? sparklinePrices : [d.current_price * 0.98, d.current_price];

    return {
      id: d.id,
      symbol: d.symbol.toUpperCase(),
      name: d.name,
      price: d.current_price ?? 0,
      change24h: parseFloat((d.price_change_percentage_24h ?? 0).toFixed(2)),
      change1h: 0,
      change7d: parseFloat((d.price_change_percentage_7d_in_currency ?? 0).toFixed(2)),
      volume24h: d.total_volume ?? 0,
      marketCap: d.market_cap ?? 0,
      high24h: d.high_24h ?? d.current_price * 1.02,
      low24h: d.low_24h ?? d.current_price * 0.98,
      sparkline,
      imageUrl: d.image,
      iconSymbol: d.symbol.slice(0, 2).toUpperCase(),
    };
  } catch {
    return null;
  }
}

// Fetch top 100 crypto markets from CoinGecko
export async function fetchTopCryptoMarkets(): Promise<CoinData[] | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=true`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) return null;

    return items.map((d: {
      id: string;
      symbol: string;
      name: string;
      current_price?: number;
      price_change_percentage_24h?: number;
      price_change_percentage_7d_in_currency?: number;
      total_volume?: number;
      market_cap?: number;
      high_24h?: number;
      low_24h?: number;
      sparkline_in_7d?: { price: number[] };
      image?: string;
    }) => {
      const sparklinePrices = d.sparkline_in_7d?.price || [];
      const sparkline = sparklinePrices.length > 20
        ? sparklinePrices.filter((_: number, idx: number) => idx % Math.ceil(sparklinePrices.length / 12) === 0)
        : sparklinePrices.length > 0 ? sparklinePrices : [(d.current_price ?? 1) * 0.98, d.current_price ?? 1];

      return {
        id: d.id,
        symbol: d.symbol.toUpperCase(),
        name: d.name,
        price: d.current_price ?? 0,
        change24h: parseFloat((d.price_change_percentage_24h ?? 0).toFixed(2)),
        change1h: 0,
        change7d: parseFloat((d.price_change_percentage_7d_in_currency ?? 0).toFixed(2)),
        volume24h: d.total_volume ?? 0,
        marketCap: d.market_cap ?? 0,
        high24h: d.high_24h ?? (d.current_price ?? 1) * 1.02,
        low24h: d.low_24h ?? (d.current_price ?? 1) * 0.98,
        sparkline,
        imageUrl: d.image,
        iconSymbol: d.symbol.slice(0, 2).toUpperCase(),
      };
    });
  } catch {
    return null;
  }
}

// Generate realistic technical chart data (Candles + spline points) based on selected coin and timeframe
export function generateTechnicalChartData(coin: CoinData, timeframe: Timeframe): {
  points: ChartPoint[];
  candles: { x: number; open: number; close: number; high: number; low: number; isUp: boolean }[];
  minPrice: number;
  maxPrice: number;
} {
  const currentPrice = coin.price;
  const numPoints = 24;
  const points: ChartPoint[] = [];
  const candles: { x: number; open: number; close: number; high: number; low: number; isUp: boolean }[] = [];

  // Volatility multiplier based on timeframe
  const volatility = timeframe === '15m' ? 0.003 : timeframe === '1H' ? 0.007 : timeframe === '24H' ? 0.018 : 0.035;

  // Base price curve
  const startPrice = currentPrice * (1 - (coin.change24h / 100) * (timeframe === '24H' ? 1.0 : timeframe === '7D' ? 1.5 : 0.4));
  
  // Custom deterministic seed for consistent curve shapes per coin
  const seed = coin.symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

  let minPrice = Infinity;
  let maxPrice = -Infinity;

  for (let i = 0; i < numPoints; i++) {
    const tRatio = i / (numPoints - 1);
    
    // Linear trend from startPrice to currentPrice
    const trendPrice = startPrice + (currentPrice - startPrice) * tRatio;

    // Smooth wave modulation that tapers to 0 at the boundaries to land exactly on real prices
    const envelope = Math.sin(tRatio * Math.PI);
    const wave1 = Math.sin(tRatio * Math.PI * 3 + seed) * (currentPrice * volatility * 0.6);
    const wave2 = Math.cos(tRatio * Math.PI * 5 + seed * 1.5) * (currentPrice * volatility * 0.3);
    
    // Approach exact current price at the end
    const pointPrice = i === numPoints - 1 
      ? currentPrice 
      : trendPrice + (wave1 + wave2) * envelope;

    if (pointPrice < minPrice) minPrice = pointPrice;
    if (pointPrice > maxPrice) maxPrice = pointPrice;

    let timeLabel = '';
    if (timeframe === '15m') {
      const mins = (i * 2) % 60;
      timeLabel = `08:${mins < 10 ? '0' + mins : mins}`;
    } else if (timeframe === '1H') {
      const times = ['04:00', '06:00', '08:20 LIVE', '10:00', '12:00'];
      timeLabel = times[Math.floor((i / numPoints) * times.length)] || 'LIVE';
    } else if (timeframe === '24H') {
      timeLabel = `${(i * 2) % 24}:00`;
    } else {
      timeLabel = `Day ${Math.floor(i / 3) + 1}`;
    }

    points.push({
      time: timeLabel,
      price: pointPrice,
    });

    // Generate 4 accented candlestick samples across the chart to match reference visual
    if (i === 4 || i === 9 || i === 16 || i === 21) {
      const isUp = i % 2 === 0;
      const candleOpen = pointPrice * (isUp ? 0.998 : 1.002);
      const candleClose = pointPrice * (isUp ? 1.003 : 0.997);
      const candleHigh = Math.max(candleOpen, candleClose) * 1.002;
      const candleLow = Math.min(candleOpen, candleClose) * 0.998;

      candles.push({
        x: i,
        open: candleOpen,
        close: candleClose,
        high: candleHigh,
        low: candleLow,
        isUp,
      });
    }
  }

  // Ensure breathing room around min/max
  const padding = (maxPrice - minPrice) * 0.15 || currentPrice * 0.01;
  minPrice -= padding;
  maxPrice += padding;

  return { points, candles, minPrice, maxPrice };
}

// Formatting helpers
export function formatCurrency(val: number): string {
  if (val >= 1000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  }
  if (val >= 1) {
    return `$${val.toFixed(2)}`;
  }
  if (val >= 0.0001) {
    return `$${val.toFixed(4)}`;
  }
  return `$${val.toFixed(6)}`;
}

export function formatCompactNumber(val: number): string {
  if (val >= 1e12) return `$${(val / 1e12).toFixed(1)}T`;
  if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

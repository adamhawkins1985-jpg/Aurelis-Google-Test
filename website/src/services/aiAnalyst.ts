export interface TechnicalIndicators {
  rsi: number;
  ema20: number;
  ema50: number;
  macd?: {
    macdLine: number;
    signalLine: number;
    histogram: number;
  };
}

/**
 * Calculates standard 14-period RSI (Relative Strength Index) from price array
 */
export function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50.0;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);
  return parseFloat(rsi.toFixed(1));
}

/**
 * Calculates Exponential Moving Average (EMA)
 */
export function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  if (prices.length <= period) {
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    return parseFloat(avg.toFixed(2));
  }

  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }

  return parseFloat(ema.toFixed(2));
}

export interface AIAnalysisRequest {
  coin: {
    id: string;
    symbol: string;
    name: string;
  };
  timeframe: string;
  points: { time: string; price: number }[];
  currentPrice: number;
  change24h: number;
  high24h?: number;
  low24h?: number;
  volume24h?: number;
  rsi: number;
  ema20: number;
  ema50: number;
  mode: 'sentiment' | 'chart-deep';
}

export interface AIAnalysisResponse {
  coinSymbol: string;
  coinName: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  analysis: string;
  sources?: { title: string; uri: string }[];
  timestamp: number;
  engine?: 'gemini' | 'algorithmic-indicator';
  modelUsed?: string;
  quotaExceeded?: boolean;
  error?: string;
}

export function generateClientTechnicalReport(payload: AIAnalysisRequest): AIAnalysisResponse {
  const { coin, currentPrice, change24h, high24h, low24h, rsi, ema20, ema50, mode } = payload;
  const symbol = (coin?.symbol || 'BTC').toUpperCase();
  const price = currentPrice || 0;
  const rsiVal = rsi !== undefined ? Number(rsi) : 50;
  const ema20Val = ema20 ? Number(ema20) : price;
  const ema50Val = ema50 ? Number(ema50) : price;

  let bullishPoints = 0;
  let bearishPoints = 0;

  if (price > ema20Val) bullishPoints += 1.5;
  else bearishPoints += 1.5;

  if (ema20Val >= ema50Val) bullishPoints += 1;
  else bearishPoints += 1;

  if (change24h > 1.5) bullishPoints += 1.5;
  else if (change24h < -1.5) bearishPoints += 1.5;
  else if (change24h > 0) bullishPoints += 0.5;
  else bearishPoints += 0.5;

  if (rsiVal >= 52 && rsiVal <= 68) bullishPoints += 1.5;
  else if (rsiVal > 70) bearishPoints += 1;
  else if (rsiVal <= 48 && rsiVal >= 32) bearishPoints += 1.5;
  else if (rsiVal < 30) bullishPoints += 1;

  let sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let confidence = 65;

  if (bullishPoints >= bearishPoints + 1.5) {
    sentiment = 'BULLISH';
    confidence = Math.min(88, 65 + Math.round((bullishPoints - bearishPoints) * 5));
  } else if (bearishPoints >= bullishPoints + 1.5) {
    sentiment = 'BEARISH';
    confidence = Math.min(88, 65 + Math.round((bearishPoints - bullishPoints) * 5));
  } else {
    sentiment = 'NEUTRAL';
    confidence = 60;
  }

  const resTarget = high24h && high24h > price ? high24h : Number((price * 1.035).toFixed(2));
  const supTarget = low24h && low24h < price ? low24h : Number((price * 0.965).toFixed(2));

  if (mode === 'chart-deep') {
    const analysis = `1. BIAS: ${sentiment === 'BULLISH' ? 'BULLISH (LONG)' : sentiment === 'BEARISH' ? 'BEARISH (SHORT)' : 'NEUTRAL (CONSOLIDATION)'}
2. CONFIDENCE: ${confidence}%
3. KEY LEVELS:
   - Immediate Resistance / Target: $${Number(resTarget).toLocaleString()}
   - Key Support / Invalidation Stop: $${Number(supTarget).toLocaleString()}
4. TECHNICAL SIGNALS:
   - RSI(14) is currently at ${rsiVal}, indicating ${rsiVal > 70 ? 'overbought reading (pullback risk)' : rsiVal < 30 ? 'oversold exhaustion (bounce potential)' : rsiVal >= 50 ? 'bullish momentum sustaining above midpoint' : 'bearish momentum below midpoint'}.
   - Price is ${price >= ema20Val ? 'holding ABOVE' : 'submerged BELOW'} the 20 EMA ($${Number(ema20Val).toLocaleString()}).
   - Moving average structure shows ${ema20Val >= ema50Val ? 'positive momentum curve (EMA20 > EMA50)' : 'corrective compression (EMA20 < EMA50)'}.
5. MARKET CATALYST & SUMMARY:
   ${symbol} is trading at $${Number(price).toLocaleString()} (${change24h >= 0 ? '+' : ''}${change24h}% 24h). ${sentiment === 'BULLISH' ? `Long setup offers favorable risk/reward targeting $${Number(resTarget).toLocaleString()} with invalidation below $${Number(supTarget).toLocaleString()}.` : sentiment === 'BEARISH' ? `Downside pressure favors Short setups with support target at $${Number(supTarget).toLocaleString()}.` : `Consolidation zone detected. Wait for a breakout confirmation.`}`;

    return {
      coinSymbol: symbol,
      coinName: coin.name || symbol,
      sentiment,
      analysis,
      sources: [],
      timestamp: Date.now(),
      engine: 'algorithmic-indicator',
      quotaExceeded: true,
    };
  } else {
    const analysis = `1. SENTIMENT: ${sentiment}
2. SUMMARY: ${symbol} displays a ${sentiment.toLowerCase()} technical posture with RSI at ${rsiVal} and price ${price >= ema20Val ? 'above' : 'below'} the EMA-20 ($${Number(ema20Val).toLocaleString()}). ${sentiment === 'BULLISH' ? `Upside continuation toward $${Number(resTarget).toLocaleString()} holds higher probability while above $${Number(supTarget).toLocaleString()}.` : sentiment === 'BEARISH' ? `Elevated risk of retesting support at $${Number(supTarget).toLocaleString()}.` : `Consolidation detected; monitor for volume breakout.`}`;

    return {
      coinSymbol: symbol,
      coinName: coin.name || symbol,
      sentiment,
      analysis,
      sources: [],
      timestamp: Date.now(),
      engine: 'algorithmic-indicator',
      quotaExceeded: true,
    };
  }
}

/**
 * Request market/chart analysis from server-side Gemini API
 */
export async function requestAIAnalysis(payload: AIAnalysisRequest): Promise<AIAnalysisResponse> {
  try {
    const res = await fetch('/api/ai/analyze-market', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      return await res.json();
    }
    
    // If backend returned non-ok (e.g. 500/429), parse or fallback
    const errBody = await res.json().catch(() => ({}));
    console.warn('Backend API returned error, falling back to algorithmic report:', errBody);
    return generateClientTechnicalReport(payload);
  } catch (err) {
    console.warn('Network call failed, using client-side technical fallback:', err);
    return generateClientTechnicalReport(payload);
  }
}

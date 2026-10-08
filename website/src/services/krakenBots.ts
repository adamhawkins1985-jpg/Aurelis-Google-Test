export interface KrakenRadarCandidate {
  asset: string;
  market?: string;
  direction: 'LONG' | 'SHORT' | 'NO_TRADE';
  score: number;
  price: number;
  entry?: number;
  target?: number;
  invalidation?: number;
  structure?: any;
  flow?: any;
  economics?: any;
  reasons?: string[];
  contradictions?: string[];
}

export interface KrakenFutureTicker {
  symbol: string;
  pair: string;
  asset: string;
  markPrice: number;
  indexPrice: number;
  bid: number;
  ask: number;
  volumeQuote: number;
  openInterest: number;
  fundingRate: number;
  fundingRatePrediction: number;
  change24h: number;
}

export async function fetchKrakenRadar(): Promise<{ candidates: KrakenRadarCandidate[]; scannedMarkets: number; deepAnalyzed: number }> {
  const res = await fetch('/api/trade-radar', { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok || !data?.ok || !Array.isArray(data.candidates)) {
    throw new Error(data?.error || 'Kraken Trade Radar unavailable');
  }
  return {
    candidates: data.candidates,
    scannedMarkets: Number(data.scannedMarkets || data.requestedUniverse || 0),
    deepAnalyzed: Number(data.deepAnalyzed || data.candidates.length || 0),
  };
}

export async function fetchKrakenFutures(): Promise<KrakenFutureTicker[]> {
  const res = await fetch('/api/kraken/futures', { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok || !data?.ok || !Array.isArray(data.tickers)) {
    throw new Error(data?.error || 'Kraken Futures unavailable');
  }
  return data.tickers;
}

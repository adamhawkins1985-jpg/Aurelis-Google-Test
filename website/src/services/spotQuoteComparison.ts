/** Conservative comparison of two indicative spot quotes; never a trading signal. */
export interface SpotQuote {
  venue: string;
  chain: string;
  sellToken: string;
  buyToken: string;
  inputAmount: string;
  outputAmount: string;
  checkedAt: string;
}
export interface SpotComparison {
  status: 'comparable' | 'incomparable';
  reason: string;
  betterVenue: string | null;
  grossOutputDifference: string | null;
  profitable: false;
  netProfit: null;
}
const amount = (s: string) => /^[0-9]+$/.test(s) && BigInt(s) > 0n;
export function compareIndicativeSpotQuotes(a: SpotQuote,b: SpotQuote, now=Date.now()): SpotComparison {
  const blocked=(reason:string):SpotComparison=>({
    status:'incomparable',reason,betterVenue:null,grossOutputDifference:null,profitable:false,netProfit:null
  });
  if(a.venue===b.venue) return blocked('same_venue');
  if(a.chain!==b.chain || a.sellToken.toLowerCase()!==b.sellToken.toLowerCase() ||
    a.buyToken.toLowerCase()!==b.buyToken.toLowerCase() ||
    a.inputAmount!==b.inputAmount) return blocked('market_mismatch');
  if(![a.inputAmount,a.outputAmount,b.outputAmount].every(amount)) return blocked('invalid_amount');
  const t1=Date.parse(a.checkedAt),t2=Date.parse(b.checkedAt);
  if(!Number.isFinite(t1)||!Number.isFinite(t2)||t1>now||t2>now||
    now-t1>30_000||now-t2>30_000||Math.abs(t1-t2)>10_000) return blocked('stale_or_unsynced');
  const x=BigInt(a.outputAmount),y=BigInt(b.outputAmount);
  return {status:'comparable',reason:'indicative_only_costs_unknown',
    betterVenue:x===y?null:x>y?a.venue:b.venue,
    grossOutputDifference:(x>y?x-y:y-x).toString(),
    profitable:false,netProfit:null};
}

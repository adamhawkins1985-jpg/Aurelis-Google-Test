import { fetchCowIndicativeQuote } from './cowReadOnlyAdapter';
import { readUniswapV3PoolQuote } from './uniswapV3PoolReadOnly';
import { indicativeSlippageReserve } from './spotRiskBounds';

/** Two sequential *indicative* legs, never simultaneous executable prices or verified profit.
 * Forward uses a Uniswap v3 pool; reverse uses CoW spot. All returns are denominated in starting token base units.
 */
export async function observeSpotRoundTrip(input: {
  wallet:string;startToken:string;middleToken:string;startAmount:string;
  forwardFee:500|3000|10000;slippageBasisPoints:number;
}, signal?:AbortSignal) {
  const forward=await readUniswapV3PoolQuote({
    sellToken:input.startToken,buyToken:input.middleToken,amountIn:input.startAmount,fee:input.forwardFee
  },signal);
  const forwardReserve=indicativeSlippageReserve(forward.outputAmount,input.slippageBasisPoints);
  const conservativeMiddle=(BigInt(forward.outputAmount)-BigInt(forwardReserve.reserveBaseUnits)).toString();
  if(BigInt(conservativeMiddle)<=0n)throw Error('insufficient_intermediate_quote');
  const reverse=await fetchCowIndicativeQuote({
    network:'mainnet',wallet:input.wallet,sellToken:input.middleToken,
    buyToken:input.startToken,sellAmountBeforeFee:conservativeMiddle
  },signal);
  const reverseReserve=indicativeSlippageReserve(reverse.buyAmount,input.slippageBasisPoints);
  const conservativeReturn=(BigInt(reverse.buyAmount)-BigInt(reverseReserve.reserveBaseUnits)).toString();
  const grossReturnDifference=(BigInt(reverse.buyAmount)-BigInt(input.startAmount)).toString();
  const afterSlippageDifference=(BigInt(conservativeReturn)-BigInt(input.startAmount)).toString();
  const timestamps=[Date.parse(forward.checkedAt),Date.parse(reverse.checkedAt)];
  const fresh=timestamps.every(t=>Number.isFinite(t)&&t<=Date.now()&&Date.now()-t<=30000) &&
    Math.abs(timestamps[0]-timestamps[1])<=10000;
  return {
    status:fresh?'indicative_round_trip':'stale_quotes',
    forwardVenue:'uniswap-v3-pool',reverseVenue:'cow',chain:'mainnet',
    startAmount:input.startAmount,forwardOutput:forward.outputAmount,
    reverseInput:conservativeMiddle,reverseOutput:reverse.buyAmount,
    conservativeReturn,forwardSlippageReserve:forwardReserve.reserveBaseUnits,
    reverseSlippageReserve:reverseReserve.reserveBaseUnits,
    grossReturnDifference,afterSlippageDifference,
    netProfit:null,profitVerified:false as const,
    gasCost:'unknown' as const,executionEligibility:'unverified' as const,
    executable:false as const,ordersEnabled:false as const
  };
}

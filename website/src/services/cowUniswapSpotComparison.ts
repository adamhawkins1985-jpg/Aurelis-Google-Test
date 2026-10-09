import { estimateIndicativeNetDifference, type ExecutionCostInputs } from './indicativeNetDifference';
import { fetchCowIndicativeQuote } from './cowReadOnlyAdapter';
import { readUniswapV3PoolQuote } from './uniswapV3PoolReadOnly';
import { compareIndicativeSpotQuotes } from './spotQuoteComparison';

/** Compare indicative Ethereum WETH->USDC CoW output against one Uniswap v3 fee-tier pool. */
export async function compareCowAndUniswapPool(input:{
  wallet:string;sellToken:string;buyToken:string;amount:string;fee:500|3000|10000;
  estimatedCosts?:ExecutionCostInputs;
},signal?:AbortSignal) {
  const [cow,uniswap]=await Promise.all([
    fetchCowIndicativeQuote({network:'mainnet',wallet:input.wallet,sellToken:input.sellToken,
      buyToken:input.buyToken,sellAmountBeforeFee:input.amount},signal),
    readUniswapV3PoolQuote({sellToken:input.sellToken,buyToken:input.buyToken,
      amountIn:input.amount,fee:input.fee},signal)
  ]);
  const compared=compareIndicativeSpotQuotes({
    venue:'cow',chain:'mainnet',sellToken:input.sellToken,buyToken:input.buyToken,
    inputAmount:input.amount,outputAmount:cow.buyAmount,checkedAt:cow.checkedAt,
  },uniswap);
  const costScenario=estimateIndicativeNetDifference(compared.grossOutputDifference,
    input.estimatedCosts ?? {gasCostBuyTokenUnits:null,slippageReserveBuyTokenUnits:null,additionalFeesBuyTokenUnits:null});
  return { ...compared,costScenario,venueA:'cow',venueB:'uniswap-v3-pool',
    quoteScope:'indicative_only' as const,gasAndExecutionCosts:'unknown' as const,
    ordersEnabled:false as const};
}

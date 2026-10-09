import { indicativeSlippageReserve, assessRoundTripReadiness } from './spotRiskBounds';
import { readEthereumGasPrice, estimateGasUsdcBaseUnits } from './ethereumGasEstimate';
import { estimateIndicativeNetDifference, type ExecutionCostInputs } from './indicativeNetDifference';
import { fetchCowIndicativeQuote } from './cowReadOnlyAdapter';
import { readUniswapV3PoolQuote } from './uniswapV3PoolReadOnly';
import { compareIndicativeSpotQuotes } from './spotQuoteComparison';

/** Compare indicative Ethereum WETH->USDC CoW output against one Uniswap v3 fee-tier pool. */
export async function compareCowAndUniswapPool(input:{
  wallet:string;sellToken:string;buyToken:string;amount:string;fee:500|3000|10000;
  estimatedCosts?:ExecutionCostInputs;
  assumedGasUnits?:number;
  slippageBasisPoints?:number;
},signal?:AbortSignal) {
  const [cow,uniswap,gas]=await Promise.all([
    fetchCowIndicativeQuote({network:'mainnet',wallet:input.wallet,sellToken:input.sellToken,
      buyToken:input.buyToken,sellAmountBeforeFee:input.amount},signal),
    readUniswapV3PoolQuote({sellToken:input.sellToken,buyToken:input.buyToken,
      amountIn:input.amount,fee:input.fee},signal),
    readEthereumGasPrice(signal).catch(()=>null)
  ]);
  const compared=compareIndicativeSpotQuotes({
    venue:'cow',chain:'mainnet',sellToken:input.sellToken,buyToken:input.buyToken,
    inputAmount:input.amount,outputAmount:cow.buyAmount,checkedAt:cow.checkedAt,
  },uniswap);
  const measuredGasCost=gas && input.assumedGasUnits !== undefined &&
    input.sellToken.toLowerCase()==='0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' &&
    input.buyToken.toLowerCase()==='0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' &&
    Date.now()-Date.parse(gas.checkedAt)<=30000
      ? estimateGasUsdcBaseUnits(gas.gasPriceWei,input.assumedGasUnits,input.amount,cow.buyAmount) : null;
  const slippage=input.slippageBasisPoints===undefined?null:
    indicativeSlippageReserve(compared.betterVenue==='cow'?cow.buyAmount:uniswap.outputAmount,input.slippageBasisPoints);
  const roundTrip=assessRoundTripReadiness({forwardQuote:true,reverseQuote:false,
    returnAmount:null,startAmount:input.amount,costsVerified:false});
  const costs={...input.estimatedCosts,
    gasCostBuyTokenUnits:measuredGasCost?.estimatedUsdcBaseUnits??null,
    slippageReserveBuyTokenUnits:slippage?.reserveBaseUnits??input.estimatedCosts?.slippageReserveBuyTokenUnits??null,
    additionalFeesBuyTokenUnits:input.estimatedCosts?.additionalFeesBuyTokenUnits??null};
  const costScenario=estimateIndicativeNetDifference(compared.grossOutputDifference,costs);
  return { ...compared,costScenario,slippageScenario:slippage,roundTrip,venueA:'cow',venueB:'uniswap-v3-pool',
    gasObservation:gas?.checkedAt??null,gasEstimate:measuredGasCost,
    quoteScope:'indicative_only' as const,gasAndExecutionCosts:'not_verified' as const,
    ordersEnabled:false as const};
}

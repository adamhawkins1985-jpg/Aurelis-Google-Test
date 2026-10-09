import { classifySpotRouteGas } from './spotRouteCostEvidence';
import { summarizeCowSellQuoteCosts } from './cowFeeAccounting';
import { fetchCowIndicativeQuote } from './cowReadOnlyAdapter';
import { readUniswapV3PoolQuote } from './uniswapV3PoolReadOnly';
import { indicativeSlippageReserve } from './spotRiskBounds';
import { readEthereumGasPrice } from './ethereumGasEstimate';

/** Two sequential *indicative* legs, never simultaneous executable prices or verified profit.
 * Forward uses a Uniswap v3 pool; reverse uses CoW spot. All returns are denominated in starting token base units.
 */
export async function observeSpotRoundTrip(input: {
  wallet:string;startToken:string;middleToken:string;startAmount:string;
  forwardFee:500|3000|10000;slippageBasisPoints:number;
  direction?:'uniswap-cow'|'cow-uniswap';assumedGasUnitsPerLeg?:number;
  assumedUniswapGasUnits?:number;assumedCowGasUnits?:number;
}, signal?:AbortSignal) {
  const direction=input.direction??'uniswap-cow';
  if(direction!=='uniswap-cow'&&direction!=='cow-uniswap')throw Error('invalid_round_trip_direction');
  const forward=direction==='uniswap-cow'
    ?await readUniswapV3PoolQuote({sellToken:input.startToken,buyToken:input.middleToken,amountIn:input.startAmount,fee:input.forwardFee},signal)
    :await fetchCowIndicativeQuote({network:'mainnet',wallet:input.wallet,sellToken:input.startToken,buyToken:input.middleToken,sellAmountBeforeFee:input.startAmount},signal);
  const forwardOutput='outputAmount' in forward?forward.outputAmount:forward.buyAmount;
  const forwardReserve=indicativeSlippageReserve(forwardOutput,input.slippageBasisPoints);
  const conservativeMiddle=(BigInt(forwardOutput)-BigInt(forwardReserve.reserveBaseUnits)).toString();
  if(BigInt(conservativeMiddle)<=0n)throw Error('insufficient_intermediate_quote');
  const reverse=direction==='uniswap-cow'
    ?await fetchCowIndicativeQuote({network:'mainnet',wallet:input.wallet,sellToken:input.middleToken,buyToken:input.startToken,sellAmountBeforeFee:conservativeMiddle},signal)
    :await readUniswapV3PoolQuote({sellToken:input.middleToken,buyToken:input.startToken,amountIn:conservativeMiddle,fee:input.forwardFee},signal);
  const reverseOutput='outputAmount' in reverse?reverse.outputAmount:reverse.buyAmount;
  const uniswapLeg=direction==='uniswap-cow'?forward:reverse;
  const cowLeg=direction==='uniswap-cow'?reverse:forward;
  const cowFeeAccounting='feeAmount' in cowLeg && 'sellAmount' in cowLeg
    ? summarizeCowSellQuoteCosts({grossSellAmount:direction==='uniswap-cow'?conservativeMiddle:input.startAmount,
      sellAmount:cowLeg.sellAmount,feeAmount:cowLeg.feeAmount,buyAmount:cowLeg.buyAmount}) : null;
  const reverseReserve=indicativeSlippageReserve(reverseOutput,input.slippageBasisPoints);
  const conservativeReturn=(BigInt(reverseOutput)-BigInt(reverseReserve.reserveBaseUnits)).toString();
  const grossReturnDifference=(BigInt(reverseOutput)-BigInt(input.startAmount)).toString();
  const afterSlippageDifference=(BigInt(conservativeReturn)-BigInt(input.startAmount)).toString();
  const timestamps=[Date.parse(forward.checkedAt),Date.parse(reverse.checkedAt)];
  const fresh=timestamps.every(t=>Number.isFinite(t)&&t<=Date.now()&&Date.now()-t<=30000) &&
    Math.abs(timestamps[0]-timestamps[1])<=10000;
  const assumed=input.assumedGasUnitsPerLeg;
  const uniswapUnits=input.assumedUniswapGasUnits??assumed;
  const cowUnits=input.assumedCowGasUnits??assumed;
  if([uniswapUnits,cowUnits].some(v=>v!==undefined&&(!Number.isSafeInteger(v)||v<=0||v>2000000)))throw Error('invalid_gas_assumption');
  const gas=uniswapUnits!==undefined&&cowUnits!==undefined?await readEthereumGasPrice(signal).catch(()=>null):null;
  const uniswapGasCostWei=gas&&uniswapUnits!==undefined?(BigInt(gas.gasPriceWei)*BigInt(uniswapUnits)).toString():null;
  const cowGasCostWei=gas&&cowUnits!==undefined?(BigInt(gas.gasPriceWei)*BigInt(cowUnits)).toString():null;
  const gasCostWei=uniswapGasCostWei!==null&&cowGasCostWei!==null?(BigInt(uniswapGasCostWei)+BigInt(cowGasCostWei)).toString():null;
  const afterGasDifference=gasCostWei===null?null:(BigInt(conservativeReturn)-BigInt(input.startAmount)-BigInt(gasCostWei)).toString();
  const costEvidence=classifySpotRouteGas({
    uniswapQuoterGasUnits:'quoterGasEstimate' in uniswapLeg?uniswapLeg.quoterGasEstimate:null,
    assumedUniswapGasUnits:uniswapUnits??null,assumedCowGasUnits:cowUnits??null,
    cowQuoteFeeSellTokenUnits:'feeAmount' in cowLeg?cowLeg.feeAmount:null
  });
  return {
    costEvidence,
    status:fresh?'indicative_round_trip':'stale_quotes',
    forwardVenue:direction==='uniswap-cow'?'uniswap-v3-pool':'cow',reverseVenue:direction==='uniswap-cow'?'cow':'uniswap-v3-pool',chain:'mainnet',
    startAmount:input.startAmount,forwardOutput:forwardOutput,
    reverseInput:conservativeMiddle,reverseOutput:reverseOutput,
    conservativeReturn,forwardSlippageReserve:forwardReserve.reserveBaseUnits,
    reverseSlippageReserve:reverseReserve.reserveBaseUnits,
    grossReturnDifference,afterSlippageDifference,gasCostWei,afterGasDifference,
    uniswapGasCostWei,cowGasCostWei,gasPriceCheckedAt:gas?.checkedAt??null,
    uniswapQuoterGasUnits:'quoterGasEstimate' in uniswapLeg?uniswapLeg.quoterGasEstimate:null,
    uniswapQuoterGasIsExecutionEstimate:false as const,
    cowQuoteFeeSellTokenUnits:'feeAmount' in cowLeg?cowLeg.feeAmount:null,
    cowFeeAccounting,cowExecutionGasUnits:null,
    routeGasVerified:false as const,
    indicativeCandidate:gasCostWei!==null && fresh && BigInt(afterGasDifference!)>0n,
    gasUnitsPerLegAssumed:assumed??null,
    assumedUniswapGasUnits:uniswapUnits??null,assumedCowGasUnits:cowUnits??null,
    netProfit:null,profitVerified:false as const,
    gasCost:'assumed_units_only' as const,executionEligibility:'unverified' as const,
    executable:false as const,ordersEnabled:false as const
  };
}

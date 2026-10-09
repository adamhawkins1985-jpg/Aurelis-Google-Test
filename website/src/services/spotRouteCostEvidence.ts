/** Evidence-based classifications. QuoterV2 gas is a quoter signal, not swap execution gas. */
export function classifySpotRouteGas(input:{
  uniswapQuoterGasUnits:string|null;
  assumedUniswapGasUnits:number|null;
  assumedCowGasUnits:number|null;
  cowQuoteFeeSellTokenUnits:string|null;
}) {
  const valid=(value:string|null)=>value!==null&&/^[0-9]+$/.test(value);
  if(input.uniswapQuoterGasUnits!==null&&!valid(input.uniswapQuoterGasUnits))
    throw Error('invalid_uniswap_quoter_gas');
  if(input.cowQuoteFeeSellTokenUnits!==null&&!valid(input.cowQuoteFeeSellTokenUnits))
    throw Error('invalid_cow_fee_metadata');
  return {
    uniswapQuoterGasUnits:input.uniswapQuoterGasUnits,
    uniswapGasSource:input.assumedUniswapGasUnits===null?'unknown' as const:'scenario_assumption' as const,
    cowGasSource:input.assumedCowGasUnits===null?'unknown' as const:'scenario_assumption' as const,
    cowQuoteFeeAlreadyInSellAmount:input.cowQuoteFeeSellTokenUnits!==null,
    quoterGasUsableAsExecutionGas:false as const,
    executionGasVerified:false as const,
    settlementFeesVerified:false as const
  };
}

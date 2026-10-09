/** Gross quote differences are not arbitrage profits. All amounts use buy-token base units. */
export interface ExecutionCostInputs {
  gasCostBuyTokenUnits: string | null;
  slippageReserveBuyTokenUnits: string | null;
  additionalFeesBuyTokenUnits: string | null;
}
export function estimateIndicativeNetDifference(grossDifference: string | null, costs: ExecutionCostInputs) {
  const valid=(s:unknown):s is string=>typeof s==='string' && /^[0-9]+$/.test(s);
  if(grossDifference===null || !valid(grossDifference)) return {
    status:'unavailable' as const,netDifference:null,reason:'no_comparable_quotes',profitVerified:false as const
  };
  if(!valid(costs.gasCostBuyTokenUnits)||!valid(costs.slippageReserveBuyTokenUnits)||
     !valid(costs.additionalFeesBuyTokenUnits))return {
    status:'unavailable' as const,netDifference:null,reason:'missing_execution_costs',profitVerified:false as const
  };
  const sum=BigInt(costs.gasCostBuyTokenUnits)+BigInt(costs.slippageReserveBuyTokenUnits)+
    BigInt(costs.additionalFeesBuyTokenUnits);
  return {status:'scenario_only' as const,netDifference:(BigInt(grossDifference)-sum).toString(),
    reason:'estimated_costs_not_execution_guarantee',profitVerified:false as const};
}

/** Explicit slippage reserve, not a measured execution bound. Buy-token base units. */
export function indicativeSlippageReserve(outputAmount:string, basisPoints:number) {
  if(!/^[0-9]+$/.test(outputAmount)||BigInt(outputAmount)<=0n||
     !Number.isSafeInteger(basisPoints)||basisPoints<0||basisPoints>10000)
    throw Error('invalid_slippage_scenario');
  return {reserveBaseUnits:((BigInt(outputAmount)*BigInt(basisPoints)+9999n)/10000n).toString(),
    basisPoints,verified:false as const};
}
/** A spread between two sell routes is not a completed buy/sell cycle. */
export function assessRoundTripReadiness(input:{forwardQuote:boolean;reverseQuote:boolean;
  returnAmount:string|null;startAmount:string;costsVerified:boolean}) {
  const valid=(x:string|null):x is string=>typeof x==='string'&&/^[0-9]+$/.test(x)&&BigInt(x)>0n;
  if(!input.forwardQuote||!input.reverseQuote||!valid(input.returnAmount)||!valid(input.startAmount))
    return {status:'incomplete' as const,netProfit:null,reason:'missing_round_trip_leg' as const};
  if(!input.costsVerified) return {status:'unverified' as const,netProfit:null,reason:'execution_costs_unknown' as const};
  return {status:'scenario_only' as const,netProfit:null,reason:'quotes_not_executable' as const};
}

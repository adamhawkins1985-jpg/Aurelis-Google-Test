/** Cost classifications for non-executable CoW indicative sell quotes.
 * CoW feeAmount is denominated in the sell token and accounted for in the
 * gross sell amount. Do not subtract it again from buy output or gas.
 */
export function summarizeCowSellQuoteCosts(input:{
  grossSellAmount:string;sellAmount:string;feeAmount:string;buyAmount:string;
}) {
  const integer=(v:string)=>/^[0-9]+$/.test(v);
  if(![input.grossSellAmount,input.sellAmount,input.feeAmount,input.buyAmount].every(integer)||
    BigInt(input.grossSellAmount)<=0n||BigInt(input.buyAmount)<=0n||
    BigInt(input.sellAmount)<=0n||
    BigInt(input.sellAmount)+BigInt(input.feeAmount)>BigInt(input.grossSellAmount))
    throw Error('invalid_cow_fee_accounting');
  return {
    quotedFeeSellTokenUnits:input.feeAmount,
    alreadyIncludedInGrossSell:true as const,
    separatelyDeductFromBuyOutput:false as const,
    settlementGasEstimate:null,
    executionGasVerified:false as const,
    executionEligibilityVerified:false as const
  };
}

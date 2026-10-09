import { observeSpotRoundTrip } from './spotRoundTripReadOnly';

export const SPOT_SCAN_FEE_TIERS=[500,3000,10000] as const;
export const SPOT_SCAN_AMOUNTS_WEI=['10000000000000000','50000000000000000','100000000000000000'] as const;

/** Bounded, sequential, read-only scan. Failed pools are reported, never silently classified as profitable. */
export async function scanSpotRoundTrips(input:{
  wallet:string;startToken:string;middleToken:string;
  amounts?:readonly string[];fees?:readonly (500|3000|10000)[];
  slippageBasisPoints?:number;assumedGasUnitsPerLeg?:number;
},signal?:AbortSignal) {
  const amounts=input.amounts??SPOT_SCAN_AMOUNTS_WEI;
  const fees=input.fees??SPOT_SCAN_FEE_TIERS;
  if(amounts.length<1||amounts.length>3||fees.length<1||fees.length>3||
    !amounts.every(a=>/^[0-9]+$/.test(a)&&BigInt(a)>0n))
    throw Error('invalid_spot_scan_scope');
  const results=[];
  for(const amount of amounts) for(const fee of fees)
    for(const direction of ['uniswap-cow','cow-uniswap'] as const) {
      if(signal?.aborted)throw Error('spot_scan_aborted');
      try {
        const quote=await observeSpotRoundTrip({
          wallet:input.wallet,startToken:input.startToken,middleToken:input.middleToken,
          startAmount:amount,forwardFee:fee,direction,
          slippageBasisPoints:input.slippageBasisPoints??50,
          assumedGasUnitsPerLeg:input.assumedGasUnitsPerLeg??200000
        },signal);
        results.push({amount,fee,direction,status:quote.status,
          afterGasDifference:quote.afterGasDifference,
          candidate:quote.indicativeCandidate,verifiedProfit:false as const});
      } catch(error) {
        results.push({amount,fee,direction,status:'quote_unavailable',
          afterGasDifference:null,candidate:false,verifiedProfit:false as const,
          reason:error instanceof Error?error.message:'unknown_error'});
      }
    }
  return {results,checked:results.length,
    candidates:results.filter(r=>r.candidate).length,
    verifiedProfits:0 as const,ordersEnabled:false as const};
}

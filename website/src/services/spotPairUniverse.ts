import { scanSpotRoundTrips } from './spotRoundTripScanner';

const WETH='0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC='0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const DAI='0x6B175474E89094C44Da98b954EedeAC495271d0F';
export const READ_ONLY_PAIR_UNIVERSE=Object.freeze([
  {id:'WETH-USDC',startToken:WETH,middleToken:USDC},
  {id:'WETH-DAI',startToken:WETH,middleToken:DAI}
] as const);

/** Run a small allowlisted Ethereum pair universe; no transfers or orders. */
export async function scanSpotPairUniverse(input:{
  wallet:string;slippageBasisPoints?:number;assumedGasUnitsPerLeg?:number;
},signal?:AbortSignal) {
  const pairs=[];
  for(const pair of READ_ONLY_PAIR_UNIVERSE) {
    if(signal?.aborted)throw Error('pair_scan_aborted');
    const scan=await scanSpotRoundTrips({
      wallet:input.wallet,startToken:pair.startToken,middleToken:pair.middleToken,
      amounts:['10000000000000000'],fees:[500,3000],
      slippageBasisPoints:input.slippageBasisPoints??50,
      assumedGasUnitsPerLeg:input.assumedGasUnitsPerLeg??200000
    },signal);
    pairs.push({id:pair.id,checked:scan.checked,candidates:scan.candidates,
      unavailable:scan.results.filter(r=>r.status==='quote_unavailable').length,
      results:scan.results});
  }
  return {pairs,checked:pairs.reduce((n,p)=>n+p.checked,0),
    candidates:pairs.reduce((n,p)=>n+p.candidates,0),
    verifiedProfits:0 as const,ordersEnabled:false as const};
}

import { scanSpotRoundTrips } from '../src/services/spotRoundTripScanner';
import { readFileSync } from 'node:fs';

async function main() {
  const source=readFileSync('src/services/walletConnectService.ts','utf8');
  const wallet=source.match(/BOT_AGENT_ADDRESS = '(0x[a-fA-F0-9]{40})'/)?.[1];
  if(!wallet)throw Error('public_bot_address_missing');
  const scan=await scanSpotRoundTrips({
    wallet,startToken:'0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    middleToken:'0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    amounts:['10000000000000000','50000000000000000'],fees:[500,3000],
    slippageBasisPoints:50,assumedGasUnitsPerLeg:200000
  });
  console.log(JSON.stringify(scan));
  if(scan.checked!==8||scan.verifiedProfits!==0||scan.ordersEnabled!==false)throw Error('unsafe_spot_scan');
  if(!scan.results.some(r=>r.status==='indicative_round_trip'))throw Error('no_live_round_trip_quotes');
}
main().catch(e=>{console.error(e);process.exitCode=1});

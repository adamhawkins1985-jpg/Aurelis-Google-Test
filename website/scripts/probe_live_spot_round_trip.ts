import { observeSpotRoundTrip } from '../src/services/spotRoundTripReadOnly';
import { readFileSync } from 'node:fs';

async function main() {
  const source=readFileSync('src/services/walletConnectService.ts','utf8');
  const wallet=source.match(/BOT_AGENT_ADDRESS = '(0x[a-fA-F0-9]{40})'/)?.[1];
  if (!wallet) throw Error('public bot address not configured');
  for (const direction of ['uniswap-cow','cow-uniswap'] as const) {
    const result=await observeSpotRoundTrip({
      wallet,startToken:'0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      middleToken:'0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      startAmount:'10000000000000000',forwardFee:500,slippageBasisPoints:50,
      direction,assumedGasUnitsPerLeg:200000
    });
    console.log(JSON.stringify({direction,...result}));
    if(result.status!=='indicative_round_trip'||result.netProfit!==null||
      result.profitVerified!==false||result.ordersEnabled!==false||result.executable!==false||
      result.gasCostWei===null||result.afterGasDifference===null)
      throw Error('unexpected round-trip safety state: '+direction);
  }
}
main().catch(e=>{console.error(e);process.exitCode=1});

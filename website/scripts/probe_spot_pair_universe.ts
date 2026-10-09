import { scanSpotPairUniverse } from '../src/services/spotPairUniverse';
import { readFileSync } from 'node:fs';
async function main(){
  const source=readFileSync('src/services/walletConnectService.ts','utf8');
  const wallet=source.match(/BOT_AGENT_ADDRESS = '(0x[a-fA-F0-9]{40})'/)?.[1];
  if(!wallet)throw Error('public_address_unavailable');
  const result=await scanSpotPairUniverse({wallet,slippageBasisPoints:50,assumedGasUnitsPerLeg:200000});
  const summary=result.pairs.map(pair=>({
    id:pair.id,checked:pair.checked,unavailable:pair.unavailable,candidates:pair.candidates,
    routes:pair.results.map(r=>({fee:r.fee,direction:r.direction,status:r.status,
      afterGasDifference:r.afterGasDifference,reason:'reason' in r?r.reason:null}))
  }));
  console.log(JSON.stringify({checked:result.checked,verifiedProfits:result.verifiedProfits,ordersEnabled:result.ordersEnabled,pairs:summary}));
  if(result.checked!==8||result.ordersEnabled!==false||result.verifiedProfits!==0)
    throw Error('invalid_scan_safety_state');
}
main().catch(e=>{console.error(e);process.exitCode=1});

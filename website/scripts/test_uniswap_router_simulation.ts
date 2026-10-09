import assert from 'node:assert/strict';
import { estimateUniswapV3RouterGas } from '../src/services/uniswapV3RouterGasSimulation';
const original=globalThis.fetch;
const wallet='0x'+'c'.repeat(40);
const input={wallet,tokenIn:'0x'+'a'.repeat(40),tokenOut:'0x'+'b'.repeat(40),
 fee:500 as const,amountIn:'10000000000000000',amountOutMinimum:'1000'};
async function main(){
  await assert.rejects(estimateUniswapV3RouterGas({...input,tokenIn:'bad'}),/invalid_uniswap_simulation_input/);
  globalThis.fetch=async (_url,opts)=>{
    const body=JSON.parse(String(opts?.body));
    assert.equal(body.method,'eth_estimateGas');
    assert.equal(body.params[0].from,wallet);
    assert.equal(body.params[0].to.toLowerCase(),'0xe592427a0aece92de3edee1f18e0157c05861564');
    assert.equal(body.params[0].data.slice(0,10),'0x414bf389');
    return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:'0x249f0'}),{status:200});
  };
  const ok=await estimateUniswapV3RouterGas(input);
  assert.equal(ok.estimatedGasUnits,'150000');
  assert.equal(ok.gasEstimateVerifiedForExecution,false);
  assert.equal(ok.transactionSubmitted,false);
  globalThis.fetch=async ()=>new Response(JSON.stringify({jsonrpc:'2.0',id:1,error:{code:3,message:'execution reverted'}}),{status:200});
  const reverted=await estimateUniswapV3RouterGas(input);
  assert.equal(reverted.status,'simulation_unavailable');
  assert.equal(reverted.estimatedGasUnits,null);
  assert.equal(reverted.ordersEnabled,false);
  console.log('Uniswap router unsigned simulation regression passed');
}
main().finally(()=>{globalThis.fetch=original}).catch(e=>{console.error(e);process.exitCode=1});

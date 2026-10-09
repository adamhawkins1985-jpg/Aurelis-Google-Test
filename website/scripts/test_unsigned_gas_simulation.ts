import assert from 'node:assert/strict';
import { observeUnsignedGasEstimate } from '../src/services/unsignedGasSimulation';
const original=globalThis.fetch;
async function main(){
  await assert.rejects(observeUnsignedGasEstimate({to:'bad',data:'0x12345678'}),/invalid_unsigned_gas_simulation/);
  await assert.rejects(observeUnsignedGasEstimate({to:'0x'+'a'.repeat(40),data:'0x'}),/invalid_unsigned_gas_simulation/);
  globalThis.fetch=async (_url,init)=>{
    const call=JSON.parse(String(init?.body));
    assert.equal(call.method,'eth_estimateGas');
    assert.equal(call.params[0].to,'0x'+'a'.repeat(40));
    return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:'0x249f0'}),{status:200});
  };
  const result=await observeUnsignedGasEstimate({to:'0x'+'a'.repeat(40),data:'0x12345678'});
  assert.equal(result.estimatedGasUnits,'150000');
  assert.equal(result.transactionSubmitted,false);
  assert.equal(result.executionGuaranteed,false);
  console.log('unsigned gas simulation safety tests passed');
}
main().finally(()=>{globalThis.fetch=original}).catch(e=>{console.error(e);process.exitCode=1});

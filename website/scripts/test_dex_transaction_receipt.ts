import assert from 'node:assert/strict';
import { observeDexTransactionReceipt } from '../src/services/dexTransactionReceipt';
const hash='0x'+'a'.repeat(64);
const original=globalThis.fetch;
async function main(){
  await assert.rejects(observeDexTransactionReceipt({hash:'bad'}),/invalid_dex_transaction_hash/);
  globalThis.fetch=async (_url,init)=>{
    const req=JSON.parse(String(init?.body));
    if(req.method==='eth_getTransactionReceipt')return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:{
      transactionHash:hash,blockNumber:'0x64',status:'0x1'
    }}),{status:200});
    assert.equal(req.method,'eth_blockNumber');
    return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:'0x65'}),{status:200});
  };
  const ok=await observeDexTransactionReceipt({hash,minConfirmations:2});
  assert.equal(ok.confirmations,2);
  assert.equal(ok.status,'succeeded');
  assert.equal(ok.confirmed,true);
  assert.equal(ok.transactionSubmittedByAurelis,false);
  globalThis.fetch=async ()=>new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:null}),{status:200});
  const pending=await observeDexTransactionReceipt({hash});
  assert.equal(pending.status,'pending');
  assert.equal(pending.confirmed,false);
  console.log('DEX receipt monitoring safety tests passed');
}
main().finally(()=>{globalThis.fetch=original}).catch(e=>{console.error(e);process.exitCode=1});

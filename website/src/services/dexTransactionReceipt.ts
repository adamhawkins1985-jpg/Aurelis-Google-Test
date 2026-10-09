/** Public Ethereum receipt observation; never signs, broadcasts, or changes balances. */
export async function observeDexTransactionReceipt(input:{hash:string;minConfirmations?:number},signal?:AbortSignal){
  if(!/^0x[a-fA-F0-9]{64}$/.test(input.hash))throw Error('invalid_dex_transaction_hash');
  const min=input.minConfirmations??2;
  if(!Number.isSafeInteger(min)||min<1||min>64)throw Error('invalid_confirmation_requirement');
  const call=async(method:string,params:unknown[])=>{
    const response=await fetch('https://ethereum-rpc.publicnode.com',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),
      signal:signal??AbortSignal.timeout(12000)
    });
    if(!response.ok)throw Error('receipt_rpc_http_'+response.status);
    const data=await response.json();
    if(data?.error||!('result' in data))throw Error('receipt_rpc_unavailable');
    return data.result;
  };
  const receipt=await call('eth_getTransactionReceipt',[input.hash]);
  if(receipt===null)return {status:'pending' as const,confirmations:0,confirmed:false,transactionSubmittedByAurelis:false};
  if(!receipt||String(receipt.transactionHash).toLowerCase()!==input.hash.toLowerCase()||
    !/^0x[0-9a-fA-F]+$/.test(receipt.blockNumber)||!['0x0','0x1'].includes(receipt.status))
    throw Error('invalid_transaction_receipt');
  const tip=await call('eth_blockNumber',[]);
  if(typeof tip!=='string'||!/^0x[0-9a-fA-F]+$/.test(tip))throw Error('invalid_chain_tip');
  const count=BigInt(tip)-BigInt(receipt.blockNumber)+1n;
  if(count<=0n)throw Error('receipt_block_ahead_of_tip');
  const confirmations=Number(count>100000n?100000n:count);
  return {status:receipt.status==='0x1'?'succeeded' as const:'reverted' as const,
    confirmations,confirmed:confirmations>=min,transactionSubmittedByAurelis:false};
}

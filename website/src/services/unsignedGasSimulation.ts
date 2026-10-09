/** Validate unsigned eth_estimateGas observations. Never constructs, signs or submits an order. */
export async function observeUnsignedGasEstimate(input:{
  to:string;data:string;from?:string;value?:string;
},signal?:AbortSignal) {
  const address=/^0x[0-9a-fA-F]{40}$/;
  if(!address.test(input.to)||
    (input.from!==undefined&&!address.test(input.from))||
    !/^0x(?:[0-9a-fA-F]{2})*$/.test(input.data)||
    input.data.length<10||input.data.length>20002||
    (input.value!==undefined&&!/^0x[0-9a-fA-F]+$/.test(input.value)))
    throw Error('invalid_unsigned_gas_simulation');
  const transaction={to:input.to,data:input.data,
    ...(input.from?{from:input.from}:{}),
    ...(input.value?{value:input.value}:{})};
  const response=await fetch('https://ethereum-rpc.publicnode.com',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_estimateGas',params:[transaction]}),
    signal:signal??AbortSignal.timeout(12000)
  });
  if(!response.ok)throw Error('unsigned_gas_rpc_http_'+response.status);
  const payload=await response.json();
  if(payload?.error||!/^0x[0-9a-fA-F]+$/.test(payload?.result??''))
    throw Error('unsigned_gas_simulation_unavailable');
  const amount=BigInt(payload.result);
  if(amount<=0n||amount>2000000n)throw Error('unsigned_gas_out_of_range');
  return {estimatedGasUnits:amount.toString(),
    source:'rpc_unsigned_simulation' as const, transactionSubmitted:false as const,
    executionGuaranteed:false as const,checkedAt:new Date().toISOString()};
}

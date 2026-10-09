/** Read-only Ethereum gas-price observation. Gas units are route assumptions, not measured here. */
export async function readEthereumGasPrice(signal?:AbortSignal) {
  const response=await fetch('https://ethereum-rpc.publicnode.com',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_gasPrice',params:[]}),
    signal:signal??AbortSignal.timeout(12000)
  });
  if(!response.ok)throw Error('gas_rpc_http_'+response.status);
  const data=await response.json();
  if(data?.error || typeof data?.result!=='string' || !/^0x[0-9a-fA-F]+$/.test(data.result))
    throw Error('invalid_gas_price');
  const wei=BigInt(data.result);
  if(wei<=0n || wei>1000000000000n)throw Error('unreasonable_gas_price');
  return {gasPriceWei:wei.toString(),checkedAt:new Date().toISOString(),readOnly:true as const};
}
/** ETH->USDC price derived from an indicative WETH/USDC quote; 6 decimals for USDC. */
export function estimateGasUsdcBaseUnits(gasPriceWei:string,gasUnits:number,ethSellWei:string,usdcQuoteBaseUnits:string) {
  const valid=(v:string)=>/^[0-9]+$/.test(v)&&BigInt(v)>0n;
  if(!valid(gasPriceWei)||!valid(ethSellWei)||!valid(usdcQuoteBaseUnits)||
    !Number.isSafeInteger(gasUnits)||gasUnits<=0||gasUnits>2000000)
    throw Error('invalid_gas_conversion_inputs');
  const ethCost=BigInt(gasPriceWei)*BigInt(gasUnits);
  const estimatedUsdc=(ethCost*BigInt(usdcQuoteBaseUnits)+BigInt(ethSellWei)-1n)/BigInt(ethSellWei);
  return {estimatedUsdcBaseUnits:estimatedUsdc.toString(),gasUnitsAssumed:gasUnits,
    gasPriceObserved:true as const,executionGasUnverified:true as const};
}

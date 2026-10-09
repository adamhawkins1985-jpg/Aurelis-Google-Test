import { Interface } from 'ethers';

/** One Ethereum Uniswap v3 pool quote, read via eth_call. No key, signatures, transactions, or router execution. */
const abi = new Interface(['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)']);
const quoter='0x61fFE014bA17989E743c5F6cB21bF9697530B21e';
const rpc='https://ethereum-rpc.publicnode.com';
const validAddress=/^0x[a-fA-F0-9]{40}$/;
export async function readUniswapV3PoolQuote(input:{
  sellToken:string;buyToken:string;amountIn:string;fee:500|3000|10000;
},signal?:AbortSignal) {
  if(!validAddress.test(input.sellToken)||!validAddress.test(input.buyToken)||
    input.sellToken.toLowerCase()===input.buyToken.toLowerCase()||
    !/^[0-9]+$/.test(input.amountIn)||BigInt(input.amountIn)<=0n||
    ![500,3000,10000].includes(input.fee)) throw Error('invalid_uniswap_pool_quote');
  const data=abi.encodeFunctionData('quoteExactInputSingle',[{
    tokenIn:input.sellToken,tokenOut:input.buyToken,amountIn:BigInt(input.amountIn),
    fee:input.fee,sqrtPriceLimitX96:0
  }]);
  const response=await fetch(rpc,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_call',params:[{to:quoter,data},'latest']}),
    signal:signal??AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('uniswap_rpc_http_'+response.status);
  const payload=await response.json();
  if(payload?.error||typeof payload?.result!=='string')throw Error('uniswap_pool_quote_unavailable');
  const decoded=abi.decodeFunctionResult('quoteExactInputSingle',payload.result);
  const output=decoded[0] as bigint;
  const quoterGasEstimate=decoded[3] as bigint;
  if(output<=0n||quoterGasEstimate<=0n||quoterGasEstimate>2000000n)throw Error('uniswap_pool_quote_invalid');
  return {venue:'uniswap-v3-pool',chain:'mainnet',sellToken:input.sellToken,buyToken:input.buyToken,
    inputAmount:input.amountIn,outputAmount:output.toString(),checkedAt:new Date().toISOString(),
    feeTier:input.fee,quoterGasEstimate:quoterGasEstimate.toString(),
    quoterGasIsExecutionEstimate:false as const,
    indicative:true as const,executable:false as const};
}

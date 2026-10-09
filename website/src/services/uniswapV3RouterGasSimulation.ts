import { Interface } from 'ethers';
import { observeUnsignedGasEstimate } from './unsignedGasSimulation';

const router='0xE592427A0AEce92De3Edee1F18E0157C05861564';
const abi=new Interface(['function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)']);
const address=/^0x[a-fA-F0-9]{40}$/;

/** Unsigned router simulation only. Requires real wallet allowance/balance, so reverts are normal.
 * Never assumes gas is known if the RPC simulation fails.
 */
export async function estimateUniswapV3RouterGas(input:{
  wallet:string;tokenIn:string;tokenOut:string;fee:500|3000|10000;
  amountIn:string;amountOutMinimum:string;
},signal?:AbortSignal) {
  if(![input.wallet,input.tokenIn,input.tokenOut].every(v=>address.test(v))||
    input.tokenIn.toLowerCase()===input.tokenOut.toLowerCase()||
    ![500,3000,10000].includes(input.fee)||
    !/^[0-9]+$/.test(input.amountIn)||BigInt(input.amountIn)<=0n||
    !/^[0-9]+$/.test(input.amountOutMinimum)||BigInt(input.amountOutMinimum)<=0n)
    throw Error('invalid_uniswap_simulation_input');
  const data=abi.encodeFunctionData('exactInputSingle',[{
    tokenIn:input.tokenIn,tokenOut:input.tokenOut,fee:input.fee,
    recipient:input.wallet,deadline:Math.floor(Date.now()/1000)+600,
    amountIn:BigInt(input.amountIn),amountOutMinimum:BigInt(input.amountOutMinimum),
    sqrtPriceLimitX96:0
  }]);
  try {
    const result=await observeUnsignedGasEstimate({to:router,from:input.wallet,data},signal);
    return {status:'rpc_estimate_available' as const,estimatedGasUnits:result.estimatedGasUnits,
      gasEstimateVerifiedForExecution:false as const,
      ordersEnabled:false as const,transactionSubmitted:false as const};
  } catch(error) {
    if(signal?.aborted)throw error;
    return {status:'simulation_unavailable' as const,estimatedGasUnits:null,
      reason:error instanceof Error?error.message:'rpc_unavailable',
      gasEstimateVerifiedForExecution:false as const,
      ordersEnabled:false as const,transactionSubmitted:false as const};
  }
}

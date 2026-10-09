import { estimateUniswapV3RouterGas } from '../src/services/uniswapV3RouterGasSimulation';
import { readUniswapV3PoolQuote } from '../src/services/uniswapV3PoolReadOnly';
import { readFileSync } from 'node:fs';

async function main() {
  const source=readFileSync('src/services/walletConnectService.ts','utf8');
  const wallet=source.match(/BOT_AGENT_ADDRESS = '(0x[a-fA-F0-9]{40})'/)?.[1];
  if(!wallet)throw Error('public_bot_address_missing');
  const tokenIn='0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  const tokenOut='0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const quote=await readUniswapV3PoolQuote({sellToken:tokenIn,buyToken:tokenOut,
    amountIn:'10000000000000000',fee:500});
  const minimum=((BigInt(quote.outputAmount)*9950n)/10000n).toString();
  const gas=await estimateUniswapV3RouterGas({wallet,tokenIn,tokenOut,fee:500,
    amountIn:'10000000000000000',amountOutMinimum:minimum});
  console.log(JSON.stringify({quoterGasUnits:quote.quoterGasEstimate,
    simulatedRouterGasUnits:gas.estimatedGasUnits,status:gas.status,
    failureReason:'reason' in gas?gas.reason:null,
    transactionSubmitted:gas.transactionSubmitted,ordersEnabled:gas.ordersEnabled,
    verifiedExecutionGas:gas.gasEstimateVerifiedForExecution}));
  if(gas.ordersEnabled!==false||gas.transactionSubmitted!==false||
    gas.gasEstimateVerifiedForExecution!==false)throw Error('simulation_safety_violation');
}
main().catch(e=>{console.error(e);process.exitCode=1});

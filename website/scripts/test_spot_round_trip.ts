import assert from 'node:assert/strict';
import { observeSpotRoundTrip } from '../src/services/spotRoundTripReadOnly';

const original = globalThis.fetch;
try {
  globalThis.fetch = async (url, init) => {
    const body=JSON.parse(String(init?.body));
    if(body.method==='eth_gasPrice') return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:'0x3b9aca00'}),{status:200});
    if (String(url).includes('cow.fi')) {
      const request=body;
      return new Response(JSON.stringify({quote:{
        sellToken:request.sellToken,buyToken:request.buyToken,
        sellAmount:request.sellAmountBeforeFee,
        buyAmount:request.sellToken.toLowerCase()==='0x'+'a'.repeat(40)?'300000000':'99000000000000000',feeAmount:'0'
      }}),{status:200});
    }
    const isReverse=String(body.params?.[0]?.data||'').toLowerCase().includes('b'.repeat(40));
    return new Response(JSON.stringify({jsonrpc:'2.0',id:1,
      result:'0x'+(isReverse?99000000000000000n:300000000n).toString(16).padStart(64,'0')+'0'.repeat(192)}),{status:200});
  };
  const result=await observeSpotRoundTrip({
    wallet:'0x'+'c'.repeat(40),startToken:'0x'+'a'.repeat(40),
    middleToken:'0x'+'b'.repeat(40),startAmount:'100000000000000000',
    forwardFee:500,slippageBasisPoints:50
  });
  assert.equal(result.reverseInput,'298500000');
  assert.equal(result.profitVerified,false);
  assert.equal(result.netProfit,null);
  assert.equal(result.ordersEnabled,false);
  for(const direction of ['uniswap-cow','cow-uniswap'] as const){
    const both=await observeSpotRoundTrip({wallet:'0x'+'c'.repeat(40),startToken:'0x'+'a'.repeat(40),middleToken:'0x'+'b'.repeat(40),startAmount:'100000000000000000',forwardFee:500,slippageBasisPoints:50,direction,assumedGasUnitsPerLeg:200000});
    assert.equal(both.gasCostWei,'400000000000000');
    assert.equal(both.netProfit,null);
    assert.equal(both.profitVerified,false);
    assert.equal(both.ordersEnabled,false);
  }
  console.log('round trip both-direction mocked tests passed');
} finally {globalThis.fetch=original;}

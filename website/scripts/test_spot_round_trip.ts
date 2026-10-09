import assert from 'node:assert/strict';
import { observeSpotRoundTrip } from '../src/services/spotRoundTripReadOnly';

const original = globalThis.fetch;
try {
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('cow.fi')) {
      const request=JSON.parse(String(init?.body));
      return new Response(JSON.stringify({quote:{
        sellToken:request.sellToken,buyToken:request.buyToken,
        sellAmount:request.sellAmountBeforeFee,buyAmount:'99000000000000000',feeAmount:'0'
      }}),{status:200});
    }
    return new Response(JSON.stringify({jsonrpc:'2.0',id:1,
      result:'0x'+(300000000n).toString(16).padStart(64,'0')+'0'.repeat(192)}),{status:200});
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
  console.log('round trip read-only mocked test passed');
} finally {globalThis.fetch=original;}

import { summarizeCowSellQuoteCosts } from '../src/services/cowFeeAccounting';
import { scanSpotPairUniverse } from '../src/services/spotPairUniverse';
import { scanSpotRoundTrips } from '../src/services/spotRoundTripScanner';
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
    const tokenIn=String(body.params?.[0]?.data||'').slice(10,74).slice(-40).toLowerCase();
    const isReverse=tokenIn==='b'.repeat(40);
    return new Response(JSON.stringify({jsonrpc:'2.0',id:1,
      result:'0x'+(isReverse?99000000000000000n:300000000n).toString(16).padStart(64,'0')+'0'.repeat(128)+(120000n).toString(16).padStart(64,'0')}),{status:200});
  };
  const result=await observeSpotRoundTrip({
    wallet:'0x'+'c'.repeat(40),startToken:'0x'+'a'.repeat(40),
    middleToken:'0x'+'b'.repeat(40),startAmount:'100000000000000000',
    forwardFee:500,slippageBasisPoints:50
  });
  const accounting=summarizeCowSellQuoteCosts({grossSellAmount:'100',sellAmount:'95',feeAmount:'5',buyAmount:'200'});
  assert.equal(accounting.separatelyDeductFromBuyOutput,false);
  assert.equal(accounting.executionGasVerified,false);
  assert.throws(()=>summarizeCowSellQuoteCosts({grossSellAmount:'100',sellAmount:'99',feeAmount:'5',buyAmount:'200'}),/invalid_cow_fee_accounting/);
  assert.equal(result.reverseInput,'298500000');
  assert.equal(result.cowFeeAccounting?.separatelyDeductFromBuyOutput,false);
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
  const scanned=await scanSpotRoundTrips({wallet:'0x'+'c'.repeat(40),startToken:'0x'+'a'.repeat(40),middleToken:'0x'+'b'.repeat(40),amounts:['100000000000000000'],fees:[500],assumedGasUnitsPerLeg:200000});
  assert.equal(scanned.checked,2);
  assert.equal(scanned.verifiedProfits,0);
  assert.equal(scanned.ordersEnabled,false);
  assert.equal(scanned.results.every(row=>row.verifiedProfit===false),true);
  const universe=await scanSpotPairUniverse({wallet:'0x'+'c'.repeat(40),assumedGasUnitsPerLeg:200000});
  assert.equal(universe.pairs.length,2);
  assert.equal(universe.checked,8);
  assert.equal(universe.verifiedProfits,0);
  assert.equal(universe.ordersEnabled,false);
  console.log('round trip multi-pair scanner tests passed');
} finally {globalThis.fetch=original;}

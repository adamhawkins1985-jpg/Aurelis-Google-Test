import { parseCowQuote } from './cowQuoteParser';

/** Indicative spot pricing only. No wallet signature, order, approval or transfer. */
export async function fetchCowIndicativeQuote(input: {
  network: 'mainnet' | 'base' | 'arbitrum_one';
  wallet: string;
  sellToken: string;
  buyToken: string;
  sellAmountBeforeFee: string;
}, signal?: AbortSignal) {
  const address=/^0x[a-fA-F0-9]{40}$/;
  if (!['mainnet','base','arbitrum_one'].includes(input.network) ||
      ![input.wallet,input.sellToken,input.buyToken].every(a=>address.test(a)) ||
      input.sellToken.toLowerCase()===input.buyToken.toLowerCase() ||
      !/^[0-9]+$/.test(input.sellAmountBeforeFee) ||
      BigInt(input.sellAmountBeforeFee)<=0n) throw Error('invalid_cow_quote_input');
  const response=await fetch('https://api.cow.fi/'+input.network+'/api/v1/quote',{
    method:'POST', signal:signal ?? AbortSignal.timeout(12000),
    headers:{'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify({from:input.wallet,sellToken:input.sellToken,buyToken:input.buyToken,
      sellAmountBeforeFee:input.sellAmountBeforeFee,kind:'sell',priceQuality:'fast'})
  });
  if(!response.ok)throw Error('cow_quote_http_'+response.status);
  const result=parseCowQuote(await response.json(),input.sellToken,input.buyToken);
  if(BigInt(result.sellAmount)+BigInt(result.feeAmount)>BigInt(input.sellAmountBeforeFee))
    throw Error('cow_quote_invalid_fee');
  return {...result,network:input.network,checkedAt:new Date().toISOString()};
}

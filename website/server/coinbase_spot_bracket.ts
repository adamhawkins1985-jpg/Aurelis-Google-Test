import crypto from 'crypto';
import fs from 'fs';

export interface SpotBracketRequest {
  asset: string;
  direction: string;
  entry: number;
  stop: number;
  target: number;
  notionalUsd: number;
  leverage: number;
  quoteCurrency?: 'USD' | 'USDC';
}
export interface SpotBracketPlan {
  productId: string;
  quoteCurrency: 'USD' | 'USDC';
  quoteSize: string;
  side: 'BUY';
  order_configuration: { market_market_ioc: { quote_size: string } };
  attached_order_configuration: { trigger_bracket_gtc: { limit_price: string; stop_trigger_price: string } };
}
export type CoinbaseBracketProduct = {
  product_id?:string;product_type?:string;is_disabled?:boolean;trading_disabled?:boolean;
  cancel_only?:boolean;limit_only?:boolean;auction_mode?:boolean;view_only?:boolean;
  best_ask_price?:string;price?:string;price_increment?:string;
  quote_min_size?:string;quote_max_size?:string;quote_currency_id?:string;
};
const legalPrice = (value: number) => Number.isFinite(value) && value > 0 && value < 1e10;
const fixedPrice = (value: number, increment: string) => {
  const decimals = (increment.split('.')[1] || '').length;
  if (!/^0?\.\d*[1-9]\d*$|^[1-9]\d*(?:\.\d+)?$/.test(increment) || decimals>10) throw new Error('coinbase_product_increment_unverified');
  const scale = 10**decimals;
  const inc = Math.round(Number(increment)*scale);
  const raw = value*scale;
  const scaled = Math.round(raw);
  // Never silently round a stop or target to another price.
  if (!Number.isFinite(raw)||Math.abs(raw-scaled)>1e-7||
      !Number.isSafeInteger(scaled) || !Number.isSafeInteger(inc) || inc <= 0 || scaled%inc !== 0)
    throw new Error('coinbase_bracket_price_increment_invalid');
  return value.toFixed(decimals);
};

/** Actual connected-account execution is spot BUY at 1x only, never synthetic short/perp. */
export function buildCoinbaseSpotBracket(
  candidate: SpotBracketRequest,
  product: CoinbaseBracketProduct,
  nowAsk: number,
): SpotBracketPlan {
  const asset=String(candidate.asset || '').toUpperCase();
  if (!/^[A-Z0-9]{2,15}$/.test(asset)) throw new Error('coinbase_asset_invalid');
  if (candidate.direction !== 'LONG' || candidate.leverage !== 1) throw new Error('coinbase_only_spot_long_1x_supported');
  if (candidate.notionalUsd !== 10) throw new Error('coinbase_first_test_exactly_10_usd');
  const quoteCurrency=candidate.quoteCurrency || 'USD';
  if (quoteCurrency!=='USD'&&quoteCurrency!=='USDC')throw new Error('coinbase_unsupported_quote_currency');
  const quoteSize=quoteCurrency==='USDC'?'9.50':'10.00';
  const {entry,stop,target}=candidate;
  if (![entry,stop,target,nowAsk].every(legalPrice) || !(stop<nowAsk&&nowAsk<target) || !(stop<entry&&entry<target))
    throw new Error('coinbase_bracket_invalid_or_stale');
  if ((nowAsk-stop)/nowAsk>0.05) throw new Error('coinbase_max_stop_distance_5_percent');
  if (Math.abs(nowAsk/entry-1)>0.01) throw new Error('coinbase_research_price_drift_exceeds_1_percent');
  if (product.product_id!==asset+'-'+quoteCurrency||String(product.product_type).toUpperCase()!=='SPOT'
    || product.quote_currency_id!==quoteCurrency||product.is_disabled||product.trading_disabled||
    product.cancel_only||product.limit_only||product.auction_mode||product.view_only)
    throw new Error('coinbase_spot_pair_not_verified_tradeable');
  if (!legalPrice(Number(product.best_ask_price)) || Math.abs(Number(product.best_ask_price)/nowAsk-1)>0.002)
    throw new Error('coinbase_executable_quote_changed');
  if (!legalPrice(Number(product.quote_min_size)) || Number(quoteSize)<Number(product.quote_min_size)
    || (legalPrice(Number(product.quote_max_size))&&Number(quoteSize)>Number(product.quote_max_size)))
    throw new Error('coinbase_10_usd_product_size_not_supported');
  const increment=String(product.price_increment || '');
  return {
    productId:asset+'-'+quoteCurrency,quoteCurrency,quoteSize,side:'BUY',
    order_configuration:{market_market_ioc:{quote_size:quoteSize}},
    attached_order_configuration:{trigger_bracket_gtc:{
      limit_price:fixedPrice(target,increment),
      stop_trigger_price:fixedPrice(stop,increment),
    }},
  };
}

export function ensureCoinbaseBracketPreview(data:any): {previewId:string;fees:string;quote:string} {
  if (!data || !Array.isArray(data.errs) || data.errs.length!==0)
    throw new Error('coinbase_bracket_preview_rejected:' + String(data?.errs?.[0] || 'missing_preview_validation'));
  if (Array.isArray(data.warning)&&data.warning.length)
    throw new Error('coinbase_bracket_preview_has_unreviewed_warnings');
  const previewId=String(data.preview_id||'');
  if (!/^[a-zA-Z0-9-]{10,120}$/.test(previewId)) throw new Error('coinbase_validated_preview_id_missing');
  if (!data.pnl_configuration?.trigger_bracket_pnl)
    throw new Error('coinbase_attached_exit_preview_unconfirmed');
  const q=Number(data.best_ask);
  if (!legalPrice(q)) throw new Error('coinbase_preview_quote_missing');
  const fees=String(data.commission_total||'');
  if (!fees||!Number.isFinite(Number(fees))||Number(fees)<0)throw new Error('coinbase_preview_commission_missing');
  return {previewId,fees,quote:String(q)};
}

const LEGACY_CDP_CONFIGURATION='/opt/aurelis/arbitrage/.env';

/** Read an already provisioned VPS credential in place. No key is copied to the browser or GitHub. */
function credentialPair(env:NodeJS.ProcessEnv) {
  const directName=String(env.COINBASE_ADVANCED_API_KEY_NAME||env.COINBASE_API_KEY_NAME||'');
  const directKey=String(env.COINBASE_ADVANCED_PRIVATE_KEY||env.COINBASE_PRIVATE_KEY||'').replace(/\\n/g,'\n');
  if(directName&&directKey)return {kid:directName,pem:directKey};
  if(env!==process.env)return {kid:directName,pem:directKey};
  try{
    const info=fs.statSync(LEGACY_CDP_CONFIGURATION);
    if(!info.isFile()||(info.mode&0o022)!==0) return {kid:'',pem:''};
    const entries:Record<string,string>={};
    for(const line of fs.readFileSync(LEGACY_CDP_CONFIGURATION,'utf8').split(/\r?\n/)){
      const match=line.match(/^\s*(COINBASE_API_KEY|COINBASE_API_SECRET)=(.*)$/);
      if(!match)continue;
      let value=match[2].trim();
      if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))
        value=value.slice(1,-1);
      entries[match[1]]=value.replace(/\\n/g,'\n');
    }
    return {kid:String(entries.COINBASE_API_KEY||''),pem:String(entries.COINBASE_API_SECRET||'')};
  }catch{return {kid:'',pem:''}}
}

export function coinbaseTradingCredentialsConfigured(env:NodeJS.ProcessEnv=process.env):boolean {
  const {kid,pem}=credentialPair(env);
  return Boolean(kid&&pem);
}

/** Require an exchange-derived stablecoin USD rate before authorizing a USDC-denominated order. */
export async function verifiedUsdcUsdRate():Promise<number> {
  const response=await fetch('https://api.coinbase.com/v2/exchange-rates?currency=USDC',{
    headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000),
  });
  if(!response.ok)throw new Error('coinbase_usdc_conversion_rate_unavailable');
  const data:any=await response.json();
  const rate=Number(data?.data?.rates?.USD);
  if(!Number.isFinite(rate)||rate<0.95||rate>1.05)
    throw new Error('coinbase_usdc_usd_reference_unverified');
  // 9.50 USDC * 1.05 USD/USDC stays below the hard $10 test notional ceiling.
  if(9.5*rate>=10)throw new Error('coinbase_usdc_notional_exceeds_first_test_cap');
  return rate;
}

/** CoinBase CDP JWT. Only server-side env signing keys; never expose the token to browsers. */
export function signedCoinbaseJwt(method:'GET'|'POST',path:string,env:NodeJS.ProcessEnv=process.env):string {
  const {kid,pem}=credentialPair(env);
  if (!kid || !pem) throw new Error('coinbase_write_credentials_unavailable');
  let key:crypto.KeyObject;
  if (pem.trim().startsWith('-----BEGIN')) key=crypto.createPrivateKey(pem);
  else {
    const bytes=Buffer.from(pem,'base64');
    if(bytes.length!==32&&bytes.length!==64) throw new Error('coinbase_key_invalid');
    key=crypto.createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),bytes.subarray(0,32)]),format:'der',type:'pkcs8'});
  }
  if(!['ec','ed25519'].includes(String(key.asymmetricKeyType)))throw new Error('coinbase_key_algorithm_invalid');
  const ts=Math.floor(Date.now()/1000);
  const enc=(value:any)=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const alg=key.asymmetricKeyType==='ed25519'?'EdDSA':'ES256';
  const header=enc({alg,typ:'JWT',kid,nonce:crypto.randomBytes(16).toString('hex')});
  const payload=enc({sub:kid,iss:'cdp',nbf:ts,exp:ts+100,uri:method+' api.coinbase.com'+path});
  const unsigned=header+'.'+payload;
  const signature=crypto.sign(alg==='EdDSA'?null:'sha256',Buffer.from(unsigned),
    alg==='EdDSA'?key:{key,dsaEncoding:'ieee-p1363'}).toString('base64url');
  return unsigned+'.'+signature;
}

export async function coinbaseAuthenticated(path:string,method:'GET'|'POST'='GET',body?:any):Promise<any> {
  if (!/^\/api\/v3\/brokerage\/[a-zA-Z0-9/_-]+$/.test(path)) throw new Error('coinbase_api_path_invalid');
  const jwt=signedCoinbaseJwt(method,path);
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try {
    const response=await fetch('https://api.coinbase.com'+path,{
      method,
      headers:{Authorization:'Bearer '+jwt,Accept:'application/json','Content-Type':'application/json'},
      body:method==='POST'?JSON.stringify(body):undefined,signal:controller.signal,
    });
    const json:any=await response.json().catch(()=>({}));
    if(!response.ok || json?.error)
      throw new Error(response.status===401||response.status===403?'coinbase_account_or_trade_permission_denied':
        'coinbase_api_'+response.status+':'+String(json?.message||json?.error||'unknown').slice(0,160));
    return json;
  }finally{clearTimeout(timeout)}
}

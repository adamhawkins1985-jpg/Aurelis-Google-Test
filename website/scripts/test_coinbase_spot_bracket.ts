import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {
  buildCoinbaseSpotBracket,ensureCoinbaseBracketPreview,signedCoinbaseJwt,coinbaseAuthenticated
} from '../server/coinbase_spot_bracket';

const product={
  product_id:'NEAR-USD',product_type:'SPOT',quote_currency_id:'USD',
  price_increment:'0.0001',best_ask_price:'4.4400',
  quote_min_size:'1',quote_max_size:'50000',
  is_disabled:false,trading_disabled:false,cancel_only:false,limit_only:false,auction_mode:false,view_only:false
};
const candidate={asset:'NEAR',direction:'LONG',entry:4.44,stop:4.35,target:4.55,notionalUsd:10,leverage:1};
const plan=buildCoinbaseSpotBracket(candidate,product,4.44);
assert.equal(plan.productId,'NEAR-USD');
assert.deepEqual(plan.order_configuration,{market_market_ioc:{quote_size:'10.00'}});
assert.deepEqual(plan.attached_order_configuration,{
  trigger_bracket_gtc:{limit_price:'4.5500',stop_trigger_price:'4.3500'}
},'single Coinbase parent with two native attached exit levels, not separate synthetic exit orders');
for(const changed of [
  {...candidate,direction:'SHORT'},
  {...candidate,leverage:2},
  {...candidate,notionalUsd:100},
  {...candidate,stop:4.20},
  {...candidate,target:4.39},
  {...candidate,entry:3.50},
  {...candidate,stop:4.35,target:4.55001},
]){
  assert.throws(()=>buildCoinbaseSpotBracket(changed,product,4.44));
}
assert.throws(()=>buildCoinbaseSpotBracket(candidate,{...product,product_type:'FUTURE'},4.44));
assert.throws(()=>buildCoinbaseSpotBracket(candidate,{...product,best_ask_price:'4.9'},4.44));
assert.throws(()=>buildCoinbaseSpotBracket(candidate,{...product,price_increment:'0.03'},4.44));
assert.throws(()=>buildCoinbaseSpotBracket(candidate,{...product,quote_min_size:'20'},4.44));
assert.throws(()=>buildCoinbaseSpotBracket(candidate,{...product,trading_disabled:true},4.44));
assert.throws(()=>ensureCoinbaseBracketPreview({errs:['INSUFFICIENT_FUNDS'],preview_id:'valid-long-id'}));
assert.throws(()=>ensureCoinbaseBracketPreview({errs:[],preview_id:'valid-long-id',best_ask:'4.44',commission_total:'0.05'}),
  /attached_exit_preview_unconfirmed/);
const valid=ensureCoinbaseBracketPreview({errs:[],warning:[],preview_id:'valid-long-id',
  best_ask:'4.44',commission_total:'0.05',pnl_configuration:{trigger_bracket_pnl:{take_profit_pnl:'1',stop_loss_pnl:'-1'}}});
assert.equal(valid.previewId,'valid-long-id');

const {privateKey}=generateKeyPairSync('ed25519');
const pem=privateKey.export({format:'pem',type:'pkcs8'}).toString();
const env={COINBASE_ADVANCED_API_KEY_NAME:'organizations/test/apiKeys/test',COINBASE_ADVANCED_PRIVATE_KEY:pem};
const jwt=signedCoinbaseJwt('POST','/api/v3/brokerage/orders/preview',env);
const [head,payload]=jwt.split('.').slice(0,2).map(s=>JSON.parse(Buffer.from(s,'base64url').toString()));
assert.equal(head.alg,'EdDSA');
assert.equal(payload.uri,'POST api.coinbase.com/api/v3/brokerage/orders/preview');
assert.throws(()=>signedCoinbaseJwt('POST','/api/v3/brokerage/orders/preview',{}),/credentials_unavailable/);

const originalFetch=globalThis.fetch;
try {
  globalThis.fetch=async(url:any,init:any)=>{
    assert.equal(url,'https://api.coinbase.com/api/v3/brokerage/orders/preview');
    assert.equal(init.method,'POST');
    assert.ok(String(init.headers.Authorization).startsWith('Bearer '));
    assert.deepEqual(JSON.parse(String(init.body)),{product_id:'NEAR-USD',side:'BUY',
      order_configuration:plan.order_configuration,attached_order_configuration:plan.attached_order_configuration});
    return new Response(JSON.stringify({errs:[],preview_id:'valid-long-id'}),{status:200});
  };
  // The connector needs genuine server credentials; pass a test-only env to
  // the process without sending or logging any real API secret.
  const saved={...process.env};
  process.env.COINBASE_ADVANCED_API_KEY_NAME=env.COINBASE_ADVANCED_API_KEY_NAME;
  process.env.COINBASE_ADVANCED_PRIVATE_KEY=pem;
  try{
    const data=await coinbaseAuthenticated('/api/v3/brokerage/orders/preview','POST',{
      product_id:'NEAR-USD',side:'BUY',order_configuration:plan.order_configuration,
      attached_order_configuration:plan.attached_order_configuration,
    });
    assert.deepEqual(data,{errs:[],preview_id:'valid-long-id'});
  }finally{
    for(const key of ['COINBASE_ADVANCED_API_KEY_NAME','COINBASE_ADVANCED_PRIVATE_KEY']){
      if(saved[key]===undefined) delete process.env[key];else process.env[key]=saved[key];
    }
  }
} finally {globalThis.fetch=originalFetch}
console.log('PASS: Coinbase native bracket exact $10 spot BUY 1x, protection, invalid cases, signed preview transport.');

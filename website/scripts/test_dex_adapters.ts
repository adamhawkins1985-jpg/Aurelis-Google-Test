import assert from 'node:assert/strict';
import { observeBotDexVenues } from '../src/services/botDexMonitoring';
import { reconcileDexObservations } from '../src/services/dexMonitoringReconciliation';
import { authorizeBotMonitoring } from '../server/bot_monitor_access';
import { readLighterActiveOrders } from '../server/lighter_active_order_read';
import { lighterMonitoringState } from '../src/services/lighterMonitoringState';
import { parseLighterOrders } from '../src/services/lighterOrderNormalizer';
import { DEX_VENUES, canUseAutomatedFunding, canUseEmergencyClose, canUseLiveOrders } from '../src/services/dexVenueRegistry';
import { observeDexAccount, registerDexAccountAdapter } from '../src/services/dexAccountAdapters';
import { fetchHyperliquidObservation } from '../src/services/hyperliquidReadOnlyAdapter';
import { fetchLighterObservation, fetchLighterAccountSnapshot } from '../src/services/lighterReadOnlyAdapter';

async function test(): Promise<void> {
  assert.equal(DEX_VENUES.length, 10);
  assert.equal(new Set(DEX_VENUES.map(v => v.id)).size, 10);
  for (const v of DEX_VENUES) {
    assert.equal(canUseLiveOrders(v), false, v.id);
    assert.equal(canUseAutomatedFunding(v), false, v.id);
    assert.equal(canUseEmergencyClose(v), false, v.id);
    assert.equal(v.capabilities.placeOrders, false, v.id);
    assert.equal(v.capabilities.funding, false, v.id);
  }
  await assert.rejects(observeDexAccount('dydx', 'any'), /dex_account_adapter_unavailable/);
  assert.throws(() => registerDexAccountAdapter({venue:'dydx',observe:async()=>{throw Error('unexpected');}}), /dex_account_adapter_not_verified/);
  let invoked = false;
  registerDexAccountAdapter({venue:'hyperliquid',observe:async(wallet)=>{invoked=true;return {
    venue:'hyperliquid',wallet,checkedAt:new Date(0).toISOString(),balances:[],positions:[],orders:[],fills:[],orderMonitoring:'unavailable',fillMonitoring:'unavailable',
  };}});
  assert.throws(() => registerDexAccountAdapter({venue:'hyperliquid',observe:async()=>{throw Error('unexpected');}}), /dex_account_adapter_duplicate/);
  await assert.rejects(observeDexAccount('hyperliquid','not-a-wallet'), /invalid_bot_wallet_address/);
  assert.equal(invoked,false);
  const wallet='0x'+'a'.repeat(40);
  const snapshot=await observeDexAccount('hyperliquid',wallet);
  assert.equal(snapshot.venue,'hyperliquid');
  assert.equal(snapshot.orderMonitoring,'unavailable');
  assert.equal(invoked,true);
  const priorFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({
      ok:true,perpsAccountValueUsd:'105.20',openPerpPositions:2,
    }), {status:200,headers:{'Content-Type':'application/json'}});
    const read=await fetchHyperliquidObservation(wallet);
    assert.equal(read.accountValueUsd,'105.20');
    assert.equal(read.openPositionCount,2);
    assert.deepEqual(read.verifiedFields,['accountValueUsd','openPositionCount']);
    assert.deepEqual(read.orders,[]);
    globalThis.fetch = async () => new Response(JSON.stringify({ok:false,error:'unavailable'}),{status:502});
    await assert.rejects(fetchHyperliquidObservation(wallet),/hyperliquid_observation_http_502/);
    await assert.rejects(fetchHyperliquidObservation('bad'),/invalid_bot_wallet_address/);
  } finally { globalThis.fetch = priorFetch; }
  const previous=globalThis.fetch;
  try {
    globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,wallet,complete:true,accountIndices:[12,34],checkedAt:new Date(0).toISOString()}),{status:200});
    const lighter=await fetchLighterObservation(wallet);
    assert.deepEqual(lighter.accountIndices,[12,34]);
    assert.deepEqual(lighter.balances,[]);
    globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,wallet,complete:true,accountIndices:['invalid'],checkedAt:new Date(0).toISOString()}),{status:200});
    await assert.rejects(fetchLighterObservation(wallet),/lighter_discovery_invalid/);
    globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,wallet,complete:false,accountIndices:[12],checkedAt:new Date(0).toISOString()}),{status:200});
    await assert.rejects(fetchLighterObservation(wallet),/lighter_discovery_invalid/);
    await assert.rejects(fetchLighterObservation('bad'),/invalid_bot_wallet_address/);
  } finally {globalThis.fetch=previous;}
  const fetchBeforeSnapshot=globalThis.fetch;
  try {
    globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,complete:true,wallet,checkedAt:new Date(0).toISOString(),accounts:[
      {accountIndex:3,collateral:'12.50',available:'5.00',positions:[{accountIndex:3,market:'ETH',side:'long',size:'0.02'}]},
      {accountIndex:4,collateral:'2.00',available:'2.00',positions:[]}
    ]}),{status:200});
    const snap=await fetchLighterAccountSnapshot(wallet);
    assert.equal(snap.balances.length,2);
    assert.equal(snap.positions.length,1);
    assert.equal(snap.orderMonitoring,'auth-required');
    assert.equal(snap.fillMonitoring,'auth-required');
    assert.deepEqual(snap.accountIndices,[3,4]);
    globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,complete:true,wallet,checkedAt:new Date(0).toISOString(),accounts:[
      {accountIndex:3,collateral:'12.50',available:'5.00',positions:[]},
      {accountIndex:3,collateral:'12.50',available:'5.00',positions:[]}
    ]}),{status:200});
    await assert.rejects(fetchLighterAccountSnapshot(wallet),/lighter_snapshot_invalid/);
  } finally {globalThis.fetch=fetchBeforeSnapshot;}
  assert.deepEqual(parseLighterOrders({code:200,orders:[{order_index:12,symbol:'ETH',status:'open',account_index:3}]},3,'active'),[
    {id:'12',market:'ETH',status:'open',accountIndex:3},
  ]);
  assert.throws(()=>parseLighterOrders({code:200,orders:[{order_index:12,symbol:'ETH',status:'filled'}]},3,'active'),/lighter_order_status_mismatch/);
  assert.throws(()=>parseLighterOrders({code:200,orders:[],next_cursor:'more'},3,'active'),/lighter_orders_incomplete/);
  assert.throws(()=>parseLighterOrders({code:200,orders:[{order_index:12,symbol:'ETH',status:'open',account_index:9}]},3,'active'),/lighter_orders_account_mismatch/);
  assert.equal(lighterMonitoringState(wallet,wallet,'1234567890123456'),'configured-unverified');
  assert.equal(lighterMonitoringState(wallet,wallet.toUpperCase().replace('0X','0x'),'1234567890123456'),'configured-unverified');
  assert.equal(lighterMonitoringState(wallet,'0x'+'b'.repeat(40),'1234567890123456'),'auth-required');
  assert.equal(lighterMonitoringState(wallet,wallet,undefined),'auth-required');
  assert.equal(lighterMonitoringState(wallet,wallet,'short'),'auth-required');
  assert.throws(()=>lighterMonitoringState('wrong',wallet,'1234567890123456'),/invalid_wallet_address/);
  const beforeOrdersFetch=globalThis.fetch;
  try {
    globalThis.fetch=async(_url,options)=> {
      assert.equal((options as RequestInit).method,'GET');
      assert.equal((options as RequestInit).headers && (options as Record<string,any>).headers.authorization,'0123456789abcdef');
      return new Response(JSON.stringify({code:200,orders:[{id:'one'}]}),{status:200});
    };
    assert.deepEqual(await readLighterActiveOrders(2,'0123456789abcdef'),{accountIndex:2,count:1});
    globalThis.fetch=async()=>new Response(JSON.stringify({code:200,orders:[],next_cursor:'more'}),{status:200});
    await assert.rejects(readLighterActiveOrders(2,'0123456789abcdef'),/lighter_order_observation_incomplete/);
    globalThis.fetch=async()=>new Response(JSON.stringify({code:200,orders:[{id:'same'},{id:'same'}]}),{status:200});
    await assert.rejects(readLighterActiveOrders(2,'0123456789abcdef'),/lighter_order_duplicate/);
    globalThis.fetch=async()=>new Response(JSON.stringify({code:200,orders:[{id:'one',account_index:3}]}),{status:200});
    await assert.rejects(readLighterActiveOrders(2,'0123456789abcdef'),/lighter_order_account_mismatch/);
    await assert.rejects(readLighterActiveOrders(2,'short'),/lighter_monitor_authorization_missing/);
  } finally {globalThis.fetch=beforeOrdersFetch;}
  const internalKey='A'.repeat(40);
  assert.equal(authorizeBotMonitoring(internalKey,internalKey),true);
  assert.equal(authorizeBotMonitoring('B'.repeat(40),internalKey),false);
  assert.equal(authorizeBotMonitoring(undefined,internalKey),false);
  assert.equal(authorizeBotMonitoring(internalKey,undefined),false);
  assert.equal(authorizeBotMonitoring('short','short'),false);
  const reconciled=reconcileDexObservations([{
    venue:'hyperliquid',wallet,checkedAt:new Date(0).toISOString(),
    balances:[],positions:[],orders:[],fills:[],orderMonitoring:'unavailable',fillMonitoring:'unavailable',
    accountValueUsd:'42.75',openPositionCount:0,verifiedFields:['accountValueUsd','openPositionCount'],
  }]);
  assert.equal(reconciled.length,10);
  assert.equal(reconciled.find(v=>v.venue==='hyperliquid')?.openPositionCount,0);
  assert.equal(reconciled.find(v=>v.venue==='hyperliquid')?.activeOrders,null);
  assert.equal(reconciled.find(v=>v.venue==='lighter')?.status,'unavailable');
  assert.equal(reconciled.find(v=>v.venue==='lighter')?.openPositionCount,null);
  assert.throws(()=>reconcileDexObservations([{
    venue:'hyperliquid',wallet,checkedAt:new Date(0).toISOString(),
    balances:[],positions:[],orders:[],fills:[],orderMonitoring:'unavailable',fillMonitoring:'unavailable',
  },{
    venue:'hyperliquid',wallet,checkedAt:new Date(0).toISOString(),
    balances:[],positions:[],orders:[],fills:[],orderMonitoring:'unavailable',fillMonitoring:'unavailable',
  }]),/dex_reconciliation_duplicate_or_unknown/);
  assert.throws(()=>reconcileDexObservations([
    {venue:'hyperliquid',wallet,checkedAt:new Date(0).toISOString(),balances:[],positions:[],orders:[],fills:[],orderMonitoring:'unavailable',fillMonitoring:'unavailable'},
    {venue:'lighter',wallet:'0x'+'b'.repeat(40),checkedAt:new Date(0).toISOString(),balances:[],positions:[],orders:[],fills:[],orderMonitoring:'auth-required',fillMonitoring:'auth-required'},
  ]),/dex_reconciliation_wallet_mismatch/);
  assert.equal(reconcileDexObservations([
    {venue:'hyperliquid',wallet,checkedAt:new Date(0).toISOString(),balances:[],positions:[],orders:[],fills:[],orderMonitoring:'unavailable',fillMonitoring:'unavailable'},
    {venue:'lighter',wallet:wallet.toUpperCase().replace('0X','0x'),checkedAt:new Date(0).toISOString(),balances:[],positions:[],orders:[],fills:[],orderMonitoring:'auth-required',fillMonitoring:'auth-required'},
  ]).length,10);
  const beforeCycle=globalThis.fetch;
  try {
    globalThis.fetch=async (url) => String(url).includes('hyperliquid-account')
      ? new Response(JSON.stringify({ok:true,perpsAccountValueUsd:'51',openPerpPositions:1}),{status:200})
      : new Response(JSON.stringify({ok:false,error:'offline'}),{status:502});
    const cycle=await observeBotDexVenues(wallet);
    assert.equal(cycle.length,10);
    assert.equal(cycle.find(v=>v.venue==='hyperliquid')?.accountValueUsd,'51');
    assert.equal(cycle.find(v=>v.venue==='lighter')?.status,'unavailable');
    assert.equal(cycle.find(v=>v.venue==='lighter')?.error,'observation_failed');
    assert.equal(cycle.find(v=>v.venue==='dydx')?.activeOrders,null);
    await assert.rejects(observeBotDexVenues('not-a-wallet'),/invalid_bot_wallet_address/);
  } finally {globalThis.fetch=beforeCycle;}
  console.log('DEX registry and read-only adapter checks passed');
}
test().catch(error=>{console.error(error);process.exitCode=1;});

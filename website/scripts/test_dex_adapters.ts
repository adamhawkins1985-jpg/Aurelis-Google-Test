import assert from 'node:assert/strict';
import { DEX_VENUES, canUseAutomatedFunding, canUseEmergencyClose, canUseLiveOrders } from '../src/services/dexVenueRegistry';
import { observeDexAccount, registerDexAccountAdapter } from '../src/services/dexAccountAdapters';

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
    venue:'hyperliquid',wallet,checkedAt:new Date(0).toISOString(),balances:[],positions:[],orders:[],fills:[],
  };}});
  assert.throws(() => registerDexAccountAdapter({venue:'hyperliquid',observe:async()=>{throw Error('unexpected');}}), /dex_account_adapter_duplicate/);
  await assert.rejects(observeDexAccount('hyperliquid','not-a-wallet'), /invalid_bot_wallet_address/);
  assert.equal(invoked,false);
  const wallet='0x'+'a'.repeat(40);
  const snapshot=await observeDexAccount('hyperliquid',wallet);
  assert.equal(snapshot.venue,'hyperliquid');
  assert.equal(invoked,true);
  console.log('DEX registry and read-only adapter checks passed');
}
test().catch(error=>{console.error(error);process.exitCode=1;});

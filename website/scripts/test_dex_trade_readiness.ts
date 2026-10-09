import assert from 'node:assert/strict';
import { assessDexTradeReadiness } from '../src/services/dexTradeReadiness';
const base={venue:'cow' as const,wallet:'0x'+'a'.repeat(40),walletOwnershipVerified:true,
  regionEligible:true,executionCostsVerified:true,settlementTrackingVerified:true,
  stopControlVerified:true,userApproved:true};
const blocked=assessDexTradeReadiness(base);
assert.equal(blocked.ready,false);
assert.ok(blocked.blockers.includes('venue_order_adapter_unverified'));
assert.equal(blocked.ordersSubmitted,0);
const restricted=assessDexTradeReadiness({...base,venue:'lighter'});
assert.ok(restricted.blockers.includes('venue_restricted'));
const unverified=assessDexTradeReadiness({...base,regionEligible:null,walletOwnershipVerified:false});
assert.ok(unverified.blockers.includes('region_eligibility_unverified'));
assert.ok(unverified.blockers.includes('wallet_ownership_unverified'));
assert.ok(!unverified.ready);
for(const venue of ['hyperliquid','paradex'] as const){
  const check=assessDexTradeReadiness({...base,venue});
  assert.ok(check.blockers.includes('venue_restricted'));
  assert.equal(check.ready,false);
}
console.log('DEX trade readiness fail-closed tests passed');

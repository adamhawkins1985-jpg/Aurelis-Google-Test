import assert from 'node:assert/strict';
import { reviewDexBotIntent } from '../src/services/dexBotIntentReview';
const now=Date.parse('2026-10-09T18:00:00.000Z');
const intent={id:'review_12345678',venue:'cow' as const,wallet:'0x'+'a'.repeat(40),
  amountBaseUnits:'100000000',network:'eip155:1',
  createdAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+60000).toISOString()};
const flags={walletOwnershipVerified:true,regionEligible:true,executionCostsVerified:true,
  settlementTrackingVerified:true,stopControlVerified:true,userApproved:true,tradingStopped:false};
const check=reviewDexBotIntent({intent,...flags},now);
assert.equal(check.status,'blocked');
assert.ok(check.blockers.includes('venue_order_adapter_unverified'));
assert.equal(reviewDexBotIntent({intent,...flags,tradingStopped:true},now).status,'stopped');
assert.equal(reviewDexBotIntent({intent,...flags},now+61000).status,'expired');
assert.ok(reviewDexBotIntent({intent:{...intent,amountBaseUnits:'0'},...flags},now).blockers.includes('invalid_amount'));
assert.ok(reviewDexBotIntent({intent:{...intent,network:'eip155:bad'},...flags},now).blockers.includes('invalid_network'));
console.log('DEX bot intent review tests passed');

import { assessDexTradeReadiness } from './dexTradeReadiness';
import type { DexVenueId } from './dexVenueRegistry';

export type DexBotIntent={id:string;venue:DexVenueId;wallet:string;
  createdAt:string;expiresAt:string;amountBaseUnits:string;network:string};
export type DexBotReview={intent:DexBotIntent;status:'blocked'|'review_required'|'expired'|'stopped';blockers:string[]};

/** Pure fail-closed review. Preparing an intent cannot place or sign orders. */
export function reviewDexBotIntent(input:{
  intent:DexBotIntent;walletOwnershipVerified:boolean;regionEligible:boolean|null;
  executionCostsVerified:boolean;settlementTrackingVerified:boolean;
  stopControlVerified:boolean;userApproved:boolean;
  tradingStopped:boolean;
}, now=Date.now()):DexBotReview {
  const {intent}=input;
  const blockers:string[]=[];
  if(!/^[a-zA-Z0-9_-]{8,80}$/.test(intent.id))blockers.push('invalid_intent_id');
  if(!/^[0-9]+$/.test(intent.amountBaseUnits)||BigInt(intent.amountBaseUnits)<=0n)
    blockers.push('invalid_amount');
  const created=Date.parse(intent.createdAt),expires=Date.parse(intent.expiresAt);
  if(!Number.isFinite(created)||!Number.isFinite(expires)||created>now+30000||expires<=created||expires-created>300000)
    blockers.push('invalid_intent_timing');
  const expired=!Number.isFinite(expires)||expires<=now;
  if(expired)blockers.push('intent_expired');
  if(input.tradingStopped)blockers.push('trading_stopped');
  if(!/^eip155:[0-9]+$/.test(intent.network))blockers.push('invalid_network');
  const gate=assessDexTradeReadiness({
    venue:intent.venue,wallet:intent.wallet,
    walletOwnershipVerified:input.walletOwnershipVerified,
    regionEligible:input.regionEligible,
    executionCostsVerified:input.executionCostsVerified,
    settlementTrackingVerified:input.settlementTrackingVerified,
    stopControlVerified:input.stopControlVerified,
    userApproved:input.userApproved
  });
  blockers.push(...gate.blockers);
  return {intent,status:input.tradingStopped?'stopped':expired?'expired':blockers.length?'blocked':'review_required',
    blockers};
}

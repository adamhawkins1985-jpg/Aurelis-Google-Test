import { DEX_VENUES, canUseLiveOrders, type DexVenueId } from './dexVenueRegistry';

/** A fail-closed gate for new DEX Bot trading, not an order execution adapter. */
export function assessDexTradeReadiness(input:{
  venue:DexVenueId;wallet:string;walletOwnershipVerified:boolean;
  regionEligible:boolean|null;executionCostsVerified:boolean;
  settlementTrackingVerified:boolean;userApproved:boolean;
  stopControlVerified:boolean;
}) {
  const venue=DEX_VENUES.find(v=>v.id===input.venue);
  const blockers:string[]=[];
  if(!venue)blockers.push('venue_unknown');
  else {
    if(venue.lifecycle==='restricted')blockers.push('venue_restricted');
    if(!canUseLiveOrders(venue))blockers.push('venue_order_adapter_unverified');
  }
  if(!/^0x[a-fA-F0-9]{40}$/.test(input.wallet))blockers.push('wallet_address_invalid');
  if(!input.walletOwnershipVerified)blockers.push('wallet_ownership_unverified');
  if(input.regionEligible!==true)blockers.push(input.regionEligible===false?'region_ineligible':'region_eligibility_unverified');
  if(!input.executionCostsVerified)blockers.push('execution_costs_unverified');
  if(!input.settlementTrackingVerified)blockers.push('settlement_tracking_unverified');
  if(!input.stopControlVerified)blockers.push('stop_control_unverified');
  if(!input.userApproved)blockers.push('user_approval_required');
  return {venue:input.venue,ready:blockers.length===0,blockers,
    mode:'preflight_only' as const,ordersSubmitted:0 as const};
}

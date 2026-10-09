/**
 * Central Bot Trade Manager venue registry.
 * Coverage is conservative: an advertised public quote feed is NOT an account adapter.
 * All trading and funding capabilities remain false until verified end-to-end.
 */
export type DexVenueId =
  | 'hyperliquid' | 'dydx' | 'lighter' | 'paradex' | 'extended'
  | 'gmx' | 'drift' | 'aevo' | 'ostium' | 'cow';

export type VenueLifecycle = 'read-only' | 'market-data' | 'candidate' | 'restricted';
export interface DexVenueCapabilities {
  publicQuotes: boolean;
  accountAggregates: boolean;
  accountBalances: boolean;
  positions: boolean;
  orders: boolean;
  fills: boolean;
  placeOrders: boolean;
  cancelOrders: boolean;
  funding: boolean;
  emergencyClose: boolean;
}
export interface DexVenue {
  id: DexVenueId;
  name: string;
  lifecycle: VenueLifecycle;
  network: string;
  note: string;
  capabilities: Readonly<DexVenueCapabilities>;
}
const none: Readonly<DexVenueCapabilities> = Object.freeze({
  publicQuotes: false,
  accountAggregates: false,
  accountBalances: false,
  positions: false,
  orders: false,
  fills: false,
  placeOrders: false,
  cancelOrders: false,
  funding: false,
  emergencyClose: false,
});
const market = (publicQuotes: boolean): Readonly<DexVenueCapabilities> =>
  Object.freeze({ ...none, publicQuotes });

export const DEX_VENUES: readonly DexVenue[] = Object.freeze([
  { id: 'hyperliquid', name: 'Hyperliquid', lifecycle: 'restricted', network: 'Hyperliquid', note: 'US interface restricted; retain public market observations only, never enable trading', capabilities: Object.freeze({ ...market(true), accountAggregates: true }) },
  { id: 'dydx', name: 'dYdX', lifecycle: 'restricted', network: 'dYdX Chain', note: 'Perpetuals and dYdX frontend restricted in US; public data only, no trading', capabilities: market(true) },
  { id: 'lighter', name: 'Lighter', lifecycle: 'restricted', network: 'Lighter', note: 'Restricted for this user; account monitoring and trading disabled', capabilities: none },
  { id: 'paradex', name: 'Paradex', lifecycle: 'restricted', network: 'Paradex', note: 'US persons explicitly restricted; trading blocked', capabilities: none },
  { id: 'extended', name: 'Extended', lifecycle: 'candidate', network: 'Starknet', note: 'Account and market feeds not verified', capabilities: none },
  { id: 'gmx', name: 'GMX', lifecycle: 'candidate', network: 'Arbitrum / Avalanche', note: 'Adapter not implemented', capabilities: none },
  { id: 'drift', name: 'Drift', lifecycle: 'candidate', network: 'Solana', note: 'Requires a separate Solana wallet/account path', capabilities: none },
  { id: 'aevo', name: 'Aevo', lifecycle: 'candidate', network: 'Aevo', note: 'Availability and integration not verified', capabilities: none },
  { id: 'ostium', name: 'Ostium', lifecycle: 'candidate', network: 'Arbitrum', note: 'Market and integration eligibility to be verified', capabilities: none },
  { id: 'cow', name: 'CoW Protocol (spot)', lifecycle: 'candidate', network: 'Ethereum / Base / Arbitrum', note: 'Spot-only candidate; read-only API evaluation pending. US access eligibility and execution unverified', capabilities: none },
]);

/** Live control activation must be an explicit, verified opt-in, never inferred from wallet visibility. */
export const canUseLiveOrders = (venue: DexVenue): boolean =>
  venue.capabilities.placeOrders && venue.capabilities.cancelOrders &&
  venue.capabilities.orders && venue.capabilities.fills;

export const canUseAutomatedFunding = (venue: DexVenue): boolean =>
  canUseLiveOrders(venue) && venue.capabilities.funding;

export const canUseEmergencyClose = (venue: DexVenue): boolean =>
  canUseLiveOrders(venue) && venue.capabilities.emergencyClose;

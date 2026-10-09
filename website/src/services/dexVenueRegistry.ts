/**
 * Central Bot Trade Manager venue registry.
 * Coverage is conservative: an advertised public quote feed is NOT an account adapter.
 * All trading and funding capabilities remain false until verified end-to-end.
 */
export type DexVenueId =
  | 'hyperliquid' | 'dydx' | 'lighter' | 'paradex' | 'extended'
  | 'gmx' | 'drift' | 'aevo' | 'ostium' | 'reserve';

export type VenueLifecycle = 'read-only' | 'market-data' | 'candidate';
export interface DexVenueCapabilities {
  publicQuotes: boolean;
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
  { id: 'hyperliquid', name: 'Hyperliquid', lifecycle: 'read-only', network: 'Hyperliquid', note: 'Aggregate account lookup only; balances, orders and fills unverified', capabilities: Object.freeze({ ...market(true), accountBalances: false, positions: false }) },
  { id: 'dydx', name: 'dYdX', lifecycle: 'market-data', network: 'dYdX Chain', note: 'Public quotes only; deployment eligibility must be reviewed before account connection', capabilities: market(true) },
  { id: 'lighter', name: 'Lighter', lifecycle: 'market-data', network: 'Lighter', note: 'Public market quotes only', capabilities: market(true) },
  { id: 'paradex', name: 'Paradex', lifecycle: 'candidate', network: 'Paradex', note: 'Account and market feeds not verified', capabilities: none },
  { id: 'extended', name: 'Extended', lifecycle: 'candidate', network: 'Starknet', note: 'Account and market feeds not verified', capabilities: none },
  { id: 'gmx', name: 'GMX', lifecycle: 'candidate', network: 'Arbitrum / Avalanche', note: 'Adapter not implemented', capabilities: none },
  { id: 'drift', name: 'Drift', lifecycle: 'candidate', network: 'Solana', note: 'Requires a separate Solana wallet/account path', capabilities: none },
  { id: 'aevo', name: 'Aevo', lifecycle: 'candidate', network: 'Aevo', note: 'Availability and integration not verified', capabilities: none },
  { id: 'ostium', name: 'Ostium', lifecycle: 'candidate', network: 'Arbitrum', note: 'Market and integration eligibility to be verified', capabilities: none },
  { id: 'reserve', name: 'DEX #10', lifecycle: 'candidate', network: 'To be selected', note: 'Reserve slot; no exchange selected', capabilities: none },
]);

/** Live control activation must be an explicit, verified opt-in, never inferred from wallet visibility. */
export const canUseLiveOrders = (venue: DexVenue): boolean =>
  venue.capabilities.placeOrders && venue.capabilities.cancelOrders &&
  venue.capabilities.orders && venue.capabilities.fills;

export const canUseAutomatedFunding = (venue: DexVenue): boolean =>
  canUseLiveOrders(venue) && venue.capabilities.funding;

export const canUseEmergencyClose = (venue: DexVenue): boolean =>
  canUseLiveOrders(venue) && venue.capabilities.emergencyClose;

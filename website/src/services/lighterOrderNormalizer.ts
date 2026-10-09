/**
 * Pure normalization for authenticated Lighter account order results.
 * This module never creates credentials, queries exchanges or sends trades.
 */
export interface LighterOrderRecord {
  id: string;
  market: string;
  status: string;
  accountIndex: number;
}
const safeId = (x:unknown):string => {
  if ((typeof x!=='string' && typeof x!=='number') || !/^[A-Za-z0-9_.:-]{1,100}$/.test(String(x)))
    throw new Error('lighter_order_id_invalid');
  return String(x);
};
const safeMarket = (x:unknown):string => {
  if (typeof x!=='string' || !/^[A-Za-z0-9_:/.-]{1,40}$/.test(x))
    throw new Error('lighter_order_market_invalid');
  return x;
};
const safeStatus = (x:unknown):string => {
  if (typeof x!=='string' || !/^[A-Za-z_]{1,32}$/.test(x))
    throw new Error('lighter_order_status_invalid');
  return x;
};
/** Fails closed: no data is returned if the API response is incomplete, ambiguous or malformed. */
export function parseLighterOrders(
  payload:unknown, accountIndex:number, expectedStatus:'active'|'inactive',
):readonly LighterOrderRecord[] {
  if (!Number.isSafeInteger(accountIndex) || accountIndex<0 ||
      !payload || typeof payload!=='object' || Array.isArray(payload)) throw Error('lighter_orders_invalid');
  const raw=payload as Record<string,unknown>;
  if (raw.code!==200 || !Array.isArray(raw.orders) || raw.next_cursor || raw.cursor)
    throw Error('lighter_orders_incomplete');
  if (raw.orders.length>10000) throw Error('lighter_orders_limit_exceeded');
  const result:LighterOrderRecord[]=[];
  const ids=new Set<string>();
  for (const record of raw.orders) {
    if (!record || typeof record!=='object' || Array.isArray(record)) throw Error('lighter_orders_invalid');
    const o=record as Record<string,unknown>;
    const index=o.account_index===undefined?accountIndex:Number(o.account_index);
    if (index!==accountIndex) throw Error('lighter_orders_account_mismatch');
    const id=safeId(o.order_index ?? o.id);
    if (ids.has(id)) throw Error('lighter_orders_duplicate');
    ids.add(id);
    const status=safeStatus(o.status);
    // Do not silently classify cancelled/filled orders as open.
    if (expectedStatus==='active' && !['open','pending','active','partially_filled'].includes(status.toLowerCase()))
      throw Error('lighter_order_status_mismatch');
    result.push({id,market:safeMarket(o.symbol),status,accountIndex});
  }
  return result;
}

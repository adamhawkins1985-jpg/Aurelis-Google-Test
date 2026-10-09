/** Server-only read of Lighter active orders, never imports wallet signing functionality. */
export interface LighterActiveOrderRead {
  accountIndex: number;
  count: number;
}
const endpoint='https://mainnet.zklighter.elliot.ai/api/v1/accountActiveOrders';
export async function readLighterActiveOrders(
  accountIndex:number, authorization:string, signal?:AbortSignal,
):Promise<LighterActiveOrderRead> {
  if(!Number.isSafeInteger(accountIndex)||accountIndex<0) throw Error('lighter_invalid_account_index');
  if(typeof authorization!=='string'||authorization.trim().length<16 || /[\r\n]/.test(authorization))
    throw Error('lighter_monitor_authorization_missing');
  const url=endpoint+'?'+new URLSearchParams({account_index:String(accountIndex)});
  const response=await fetch(url,{method:'GET',signal,
    headers:{authorization,Accept:'application/json'},cache:'no-store'});
  if(!response.ok) throw Error('lighter_order_observation_http_'+response.status);
  const data:unknown=await response.json();
  if(!data||typeof data!=='object'||Array.isArray(data)) throw Error('lighter_order_observation_invalid');
  const body=data as Record<string,unknown>;
  if(body.code!==200||!Array.isArray(body.orders)||body.next_cursor||body.cursor)
    throw Error('lighter_order_observation_incomplete');
  if(body.orders.length>10000) throw Error('lighter_order_observation_limit');
  // A count can be trusted only if every record is well-formed and belongs to
  // the requested account. Do not report a fabricated zero on malformed data.
  const seen=new Set<string>();
  for(const value of body.orders) {
    if(!value || typeof value!=='object' || Array.isArray(value))
      throw Error('lighter_order_record_invalid');
    const order=value as Record<string,unknown>;
    if(order.account_index !== undefined && order.account_index !== accountIndex)
      throw Error('lighter_order_account_mismatch');
    const id=order.order_index ?? order.id;
    if((typeof id!=='number' && typeof id!=='string') ||
       !/^[A-Za-z0-9_.:-]{1,100}$/.test(String(id)))
      throw Error('lighter_order_id_invalid');
    if(seen.has(String(id))) throw Error('lighter_order_duplicate');
    seen.add(String(id));
  }
  return {accountIndex,count:body.orders.length};
}

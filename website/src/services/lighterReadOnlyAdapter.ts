import { registerDexAccountAdapter, type DexAccountSnapshot } from './dexAccountAdapters';
const evm = /^0x[a-fA-F0-9]{40}$/;

/** Lighter public L1-to-account discovery. Account indices are not balances. */
export async function fetchLighterObservation(wallet:string, signal?:AbortSignal):Promise<DexAccountSnapshot> {
  if (!evm.test(wallet) || /^0x0{40}$/i.test(wallet)) throw new Error('invalid_bot_wallet_address');
  const response=await fetch('/api/bots/lighter-accounts?'+new URLSearchParams({wallet}),{signal,cache:'no-store'});
  if (!response.ok) throw new Error('lighter_discovery_http_'+response.status);
  const data=await response.json();
  if (data?.ok!==true || String(data.wallet).toLowerCase()!==wallet.toLowerCase() ||
      data.complete!==true || !Array.isArray(data.accountIndices) ||
      data.accountIndices.length>20 || new Set(data.accountIndices).size!==data.accountIndices.length ||
      !data.accountIndices.every((id:unknown)=>typeof id==='number' && Number.isSafeInteger(id) && id>=0) ||
      Number.isNaN(Date.parse(data.checkedAt))) throw new Error('lighter_discovery_invalid');
  return {venue:'lighter',wallet,checkedAt:data.checkedAt,balances:[],positions:[],orders:[],fills:[],orderMonitoring:'auth-required',fillMonitoring:'auth-required',
    verifiedFields:['accountIndices'],accountIndices:data.accountIndices};
}
export function enableLighterReadOnlyAdapter():void {
  registerDexAccountAdapter({venue:'lighter',observe:fetchLighterAccountSnapshot});
}

/** Independently validates normalized balance/position snapshots from the Bot-only server route. */
export async function fetchLighterAccountSnapshot(wallet:string, signal?:AbortSignal):Promise<DexAccountSnapshot> {
  if (!evm.test(wallet) || /^0x0{40}$/i.test(wallet)) throw new Error('invalid_bot_wallet_address');
  const response=await fetch('/api/bots/lighter-snapshot?'+new URLSearchParams({wallet}),{cache:'no-store',signal});
  if (!response.ok) throw new Error('lighter_snapshot_http_'+response.status);
  const body=await response.json();
  if (body?.ok!==true || body.complete!==true || String(body.wallet).toLowerCase()!==wallet.toLowerCase() ||
      !Array.isArray(body.accounts) || body.accounts.length>20 || Number.isNaN(Date.parse(body.checkedAt))) throw Error('lighter_snapshot_invalid');
  const valid=(n:unknown)=>typeof n==='string' && /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(n);
  const balances:DexAccountSnapshot['balances'][number][]=[];
  const positions:DexAccountSnapshot['positions'][number][]=[];
  const indices:number[]=[];
  for (const a of body.accounts) {
    if (!Number.isSafeInteger(a.accountIndex) || a.accountIndex<0 || indices.includes(a.accountIndex) ||
        !valid(a.collateral) || !valid(a.available) || !Array.isArray(a.positions)) throw Error('lighter_snapshot_invalid');
    indices.push(a.accountIndex);
    balances.push({symbol:'USD collateral #'+a.accountIndex,total:a.collateral,available:a.available});
    for (const p of a.positions) {
      if (p.accountIndex!==a.accountIndex || typeof p.market!=='string' || !/^[A-Za-z0-9_:/.-]{1,40}$/.test(p.market) ||
          !['long','short'].includes(p.side) || !valid(p.size)) throw Error('lighter_position_invalid');
      positions.push({market:p.market,side:p.side,size:p.size});
    }
  }
  return {venue:'lighter',wallet,checkedAt:body.checkedAt,balances,positions,orders:[],fills:[],orderMonitoring:'auth-required',fillMonitoring:'auth-required',
    accountIndices:indices,openPositionCount:positions.length,verifiedFields:['accountIndices','balances','positions']};
}

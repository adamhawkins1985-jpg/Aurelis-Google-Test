import { registerDexAccountAdapter, type DexAccountSnapshot } from './dexAccountAdapters';
const evm = /^0x[a-fA-F0-9]{40}$/;

/** Lighter public L1-to-account discovery. Account indices are not balances. */
export async function fetchLighterObservation(wallet:string, signal?:AbortSignal):Promise<DexAccountSnapshot> {
  if (!evm.test(wallet)) throw new Error('invalid_bot_wallet_address');
  const response=await fetch('/api/bots/lighter-accounts?'+new URLSearchParams({wallet}),{signal,cache:'no-store'});
  if (!response.ok) throw new Error('lighter_discovery_http_'+response.status);
  const data=await response.json();
  if (data?.ok!==true || String(data.wallet).toLowerCase()!==wallet.toLowerCase() ||
      !Array.isArray(data.accountIndices) ||
      !data.accountIndices.every((id:unknown)=>typeof id==='number' && Number.isSafeInteger(id) && id>=0) ||
      Number.isNaN(Date.parse(data.checkedAt))) throw new Error('lighter_discovery_invalid');
  return {venue:'lighter',wallet,checkedAt:data.checkedAt,balances:[],positions:[],orders:[],fills:[],
    verifiedFields:['accountIndices'],accountIndices:data.accountIndices};
}
export function enableLighterReadOnlyAdapter():void {
  registerDexAccountAdapter({venue:'lighter',observe:fetchLighterObservation});
}

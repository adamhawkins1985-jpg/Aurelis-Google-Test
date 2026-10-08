import React, { useEffect, useState } from 'react';
import { disconnectBotWalletConnect, getBotWalletConnectSession, startBotWalletConnectPairing, waitForBotWalletConnectApproval, testOneKeyTypedDataCapability } from '../../services/walletConnectService';
import { QRCodeSVG } from 'qrcode.react';

const bots: Record<string,string> = {radar:'trade_radar',hunter:'hunter',scope:'hunter',dca:'dca',grid:'grid',arbitrage:'arbitrage',live:'live_bet',signals:'signal_desk'};
const venues = ['hyperliquid','dydx','lighter','paradex','extended'];
const addressOk = (value:string) => /^0x[a-fA-F0-9]{40}$/.test(value.trim());

export function DexIntentReview({tab}:{tab:string}) {
  const [venue,setVenue]=useState('hyperliquid');
  const [asset,setAsset]=useState('BTC');
  const [side,setSide]=useState('long');
  const [publicAddress,setPublicAddress]=useState('');
  const [agentAddress,setAgentAddress]=useState('');
  const [connected,setConnected]=useState(false);
  const [pairingUri,setPairingUri]=useState('');
  const [walletSession,setWalletSession]=useState<{address:string;chainId:number;session:any}|null>(null);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [result,setResult]=useState<{kind:string; data:any}|null>(null);
  const [advanced,setAdvanced]=useState(false);
  const [accountReview,setAccountReview]=useState<any>(null);
  const [registryReview,setRegistryReview]=useState<Record<string,any>>({});
  const [reviewErrors,setReviewErrors]=useState<Record<string,string>>({});

  const refreshWallet=async()=>{
    setError('');
    try {
      const current=await getBotWalletConnectSession();
      setWalletSession(current);
      setConnected(Boolean(current));
      if(current?.address) setPublicAddress(current.address);
    } catch(e:any) {setConnected(false);setWalletSession(null);setError(e?.message||'Wallet session unavailable')}
  };
  useEffect(()=>{void refreshWallet();const onAuth=()=>void refreshWallet();window.addEventListener('aurelis:bot-wallet-connected',onAuth);return ()=>window.removeEventListener('aurelis:bot-wallet-connected',onAuth)},[]);

  const connectBot=async()=>{
    setBusy('pair');setError('');setResult(null);setPairingUri('');
    try {
      const {uri}=await startBotWalletConnectPairing();
      setPairingUri(uri);
      const active=await waitForBotWalletConnectApproval();
      setPairingUri('');
      setWalletSession(active);
      setPublicAddress(active.address);
      setConnected(true);
    } catch(e:any) {setError(e?.message||'Bot WalletConnect pairing failed');}
    finally {setBusy('');}
  };
  const disconnectBot=async()=>{
    setBusy('disconnect');setError('');
    try {await disconnectBotWalletConnect();setConnected(false);setWalletSession(null);setPairingUri('');}
    catch(e:any){setError(e?.message||'Could not disconnect Bot WalletConnect');}
    finally{setBusy('');}
  };
  const request=async(kind:string,path:string,params:Record<string,string>)=>{
    setBusy(kind);setError('');setResult(null);
    try {
      const response=await fetch(path+'?'+new URLSearchParams(params),{cache:'no-store'});
      const data=await response.json();
      if(!response.ok) throw Error(data.error||'Review unavailable');
      setResult({kind,data});
    }catch(e:any){setError(e?.message||'Review unavailable')}
    finally{setBusy('')}
  };
  const inspectHyperliquid=async()=>{
    const address=publicAddress.trim();
    if(!addressOk(address)){setError('Connect the Bot Wallet or enter a valid public address.');return;}
    setBusy('Hyperliquid account and agents');setError('');setAccountReview(null);setRegistryReview({});setReviewErrors({});
    const tasks=[
      {key:'account',url:'/api/bots/hyperliquid-account?'+new URLSearchParams({wallet:address})},
      {key:'Mainnet',url:'/api/bots/hyperliquid-agent-registry?'+new URLSearchParams({master:address,network:'Mainnet'})},
      {key:'Testnet',url:'/api/bots/hyperliquid-agent-registry?'+new URLSearchParams({master:address,network:'Testnet'})},
    ];
    try {
      const responses=await Promise.all(tasks.map(async task=>{
        try {
          const res=await fetch(task.url,{cache:'no-store'});
          const body=await res.json();
          if(!res.ok||body?.ok===false) throw Error(body?.error||'Public lookup failed');
          return {key:task.key,data:body};
        }catch(e:any){return {key:task.key,error:e?.message||'Unavailable'};}
      }));
      const errors:Record<string,string>={};const registries:Record<string,any>={};
      for(const response of responses){
        if('error' in response) errors[response.key]=String(response.error);
        else if(response.key==='account')setAccountReview(response.data);
        else registries[response.key]=response.data;
      }
      setRegistryReview(registries);setReviewErrors(errors);
    } finally {setBusy('');}
  };
  const intent=()=>request('intent','/api/bots/dex-intent',{bot:bots[tab]||'hunter',venue,asset,side,notional:'25'});
  const account=()=>request('account','/api/bots/hyperliquid-account',{wallet:publicAddress.trim()});
  const registry=()=>request('registry','/api/bots/hyperliquid-agent-registry',{master:publicAddress.trim(),network:'Testnet'});
  const signer=()=>request('signer','/api/bots/hyperliquid-readiness',{bot:bots[tab]||'hunter',asset,side});
  const preflight=()=>request('preflight','/api/bots/hyperliquid-agent-preflight',{bot:bots[tab]||'hunter',master:publicAddress.trim(),...(agentAddress.trim()?{agent:agentAddress.trim()}:{})});
  const approval=()=>request('approval','/api/bots/hyperliquid-agent-signing-preview',{master:publicAddress.trim(),agent:agentAddress.trim(),name:'AURELIS',nonce:String(Date.now())});
  const testSignature=async()=>{
    setBusy('sign');setError('');setResult(null);
    try {
      if (!walletSession) throw new Error('Connect Bot Wallet before testing signing.');
      const signed=await testOneKeyTypedDataCapability(walletSession);
      setResult({kind:'sign',data:{address:signed.address,chainId:signed.chainId}});
    }catch(e:any){setError(e?.message||'OneKey signature test failed')}
    finally{setBusy('')}
  };

  const field='rounded-md border px-2.5 py-2 text-sm bg-white text-slate-900 border-slate-300 dark:bg-slate-950 dark:text-slate-100 dark:border-slate-700';
  const button='rounded-md border px-3 py-2 text-xs font-semibold bg-white text-slate-900 border-slate-300 hover:bg-slate-100 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600 dark:hover:bg-slate-700';
  const disabled=Boolean(busy);
  return <section className="rounded-xl border border-slate-300 bg-white p-4 text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
    <div className="flex items-center justify-between gap-3">
      <div><h3 className="text-sm font-bold">OneKey · DEX</h3><p className="text-xs text-slate-600 dark:text-slate-400">Wallet connection, DEX account and trading authorization</p></div>
      <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">REVIEW ONLY</span>
    </div>
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>1. Dedicated Bot Wallet</strong>
        <span className={'rounded-full px-2 py-1 text-[10px] font-bold '+(connected?'bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100':'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200')}>{connected?'BOT WALLET CONNECTED':'BOT WALLET DISCONNECTED'}</span>
      </div>
      <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Main Wallet is for balances, sending, receiving and swaps. Bot Wallet connects OneKey Agent Money separately for signing tests and future bot operations. Connecting or disconnecting Bots does not disconnect Main Wallet.</p>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Two connections to the same account do not separate funds or keys. Trading-agent approval and live orders are still disabled.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={disabled || connected} onClick={()=>void connectBot()} className={button}>Connect Bot Wallet</button>
        <button type="button" disabled={disabled} onClick={()=>void refreshWallet()} className={button}>Refresh Bot Status</button>
        <button type="button" disabled={disabled || !connected} onClick={()=>void disconnectBot()} className={button}>Disconnect Bot Only</button>
      </div>
      {pairingUri&&<div className="mt-3 inline-flex flex-col items-center gap-2 rounded-lg bg-white p-3 text-slate-900">
        <QRCodeSVG value={pairingUri} size={196} />
        <span className="text-xs font-semibold">Scan with OneKey Agent Money</span>
        <span className="text-[11px]">Approve the separate Bot WalletConnect connection on your phone.</span>
      </div>}
      <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{connected?'Active signing session: OneKey Agent Money':'No dedicated Bot signing session. Main Wallet addresses are not treated as Bot connections.'}</p>
      <label className="mt-2 block text-xs">Public address for DEX read-only checks
        <input aria-label="Bot public wallet address" value={publicAddress} onChange={e=>{setPublicAddress(e.target.value);setConnected(false);setWalletSession(null)}} placeholder="Bot connection fills this automatically; public address may be entered for read-only checks" className={'mt-1 w-full font-mono '+field}/>
      </label>
    </div>
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
      <strong>2. DEX account</strong>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-xs">Venue<select className={'mt-1 block '+field} value={venue} onChange={e=>{setVenue(e.target.value);setResult(null)}}>{venues.map(v=><option key={v}>{v}</option>)}</select></label>
        <label className="text-xs">Asset<select className={'mt-1 block '+field} value={asset} onChange={e=>setAsset(e.target.value)}>{['BTC','ETH','SOL'].map(a=><option key={a}>{a}</option>)}</select></label>
        <label className="text-xs">Side<select className={'mt-1 block '+field} value={side} onChange={e=>setSide(e.target.value)}><option value="long">LONG</option><option value="short">SHORT</option></select></label>
        <button className={button} disabled={disabled} onClick={()=>void intent()}>Review DEX</button>
        {venue==='hyperliquid'&&<button className={button} disabled={disabled||!addressOk(publicAddress)} onClick={()=>void inspectHyperliquid()}>Check Hyperliquid account + agents</button>}
      </div>
    </div>
    {venue==='hyperliquid'&&<div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900">
      <strong>Hyperliquid account and agent verification</strong>
      <p className="mt-1 text-slate-600 dark:text-slate-300">Read-only public queries. Account observation and Mainnet/Testnet agent registries are shown separately. A connected wallet does not mean Hyperliquid trading is authorized.</p>
      {accountReview&&<p className="mt-2">Account observation (upstream default network): Value ${String(accountReview.perpsAccountValueUsd??'unavailable')} · Withdrawable ${String(accountReview.perpsWithdrawableUsd??'unavailable')} · Open positions {String(accountReview.openPerpPositions??'unavailable')}</p>}
      {['Mainnet','Testnet'].map(network=><p key={network} className="mt-2">{network} registered agents: {registryReview[network]?String(registryReview[network].agentCount??'Not reported'):reviewErrors[network]?'Lookup failed: '+reviewErrors[network]:'Not checked yet'}. {registryReview[network]?'Registry checked, but agent trading permissions are not assumed.':''}</p>)}
      {reviewErrors.account&&<p className="mt-1 text-red-600 dark:text-red-400">Account lookup failed: {reviewErrors.account}</p>}
      {accountReview&&<p className="mt-1 text-slate-600 dark:text-slate-300">This public observation does not prove balances on a different network.</p>}
    </div>}
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
      <strong>3. Trading authorization</strong>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">No trading agent is authorized by this screen. Signing approvals and live orders remain disabled.</p>
      {venue==='hyperliquid'&&<div className="mt-2 flex flex-wrap gap-2">
        <button className={button} disabled={disabled||!addressOk(publicAddress)} onClick={()=>void registry()}>Check testnet agents</button>
        <button className={button} disabled={disabled||!connected} onClick={()=>void testSignature()}>Test OneKey signing</button>
      </div>}
      <details className="mt-3" open={advanced} onToggle={e=>setAdvanced(e.currentTarget.open)}>
        <summary className="cursor-pointer text-xs font-semibold">Advanced technical checks</summary>
        {venue==='hyperliquid'&&<div className="mt-2 space-y-2">
          <label className="block text-xs">Dedicated agent public address<input value={agentAddress} onChange={e=>setAgentAddress(e.target.value)} placeholder="0x…" className={'mt-1 w-full font-mono '+field}/></label>
          <div className="flex flex-wrap gap-2">
            <button className={button} disabled={disabled} onClick={()=>void signer()}>Signer readiness</button>
            <button className={button} disabled={disabled||!addressOk(publicAddress)} onClick={()=>void preflight()}>Testnet preflight</button>
            <button className={button} disabled={disabled||!addressOk(publicAddress)||!addressOk(agentAddress)} onClick={()=>void approval()}>Unsigned approval preview</button>
          </div>
        </div>}
      </details>
    </div>
    {busy&&<p className="mt-2 text-xs">Checking {busy}…</p>}
    {error&&<p role="alert" className="mt-2 text-xs font-semibold text-red-700 dark:text-red-400">{error}</p>}
    {result&&<div className="mt-3 rounded-lg border border-slate-300 bg-white p-3 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
      <strong>{({intent:'DEX review',account:'Public account',registry:'Testnet agent registry',signer:'Signer readiness',preflight:'Testnet setup',approval:'Unsigned approval',sign:'EIP-712 capability'} as Record<string,string>)[result.kind]}</strong>
      {result.kind==='intent'&&<p className="mt-1">{result.data.venue} · {result.data.network} · ${result.data.notionalUsd} proposal · execution disabled. {result.data.signingRequirements}</p>}
      {result.kind==='account'&&<p className="mt-1">Account value: ${result.data.perpsAccountValueUsd??'Unknown'} · Withdrawable: ${result.data.perpsWithdrawableUsd??'Unknown'} · Positions: {result.data.openPerpPositions??'Unknown'}</p>}
      {result.kind==='registry'&&<p className="mt-1">Registered testnet agents: {result.data.agentCount}. Authorization to sign is not assumed.</p>}
      {result.kind==='signer'&&<p className="mt-1">Signing adapter: {result.data.signatureImplementation} · Agent authorization unverified</p>}
      {result.kind==='preflight'&&<p className="mt-1">Remaining requirements: {result.data.remainingRequirements??'Unknown'}. No authorization requested.</p>}
      {result.kind==='approval'&&<p className="mt-1">Unsigned EIP-712 approval for {result.data.agentAddress}; nonce {result.data.nonce}. Nothing was signed or submitted.</p>}
      {result.kind==='sign'&&<p className="mt-1">OneKey signed a harmless capability message on chain {result.data.chainId}. No trading permission granted.</p>}
    </div>}
  </section>;
}

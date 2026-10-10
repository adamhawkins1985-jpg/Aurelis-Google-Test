import React,{useEffect,useState} from 'react';
import { ShieldCheck, Wallet, RefreshCw } from 'lucide-react';
import { getReusableWalletConnectSession, verifyWalletConnectSession } from '../../services/walletConnectService';

type AuthStatus={ok:boolean;ownerConfigured:boolean;verified:boolean;reason:string};
export const BotWalletAuth:React.FC=()=>{
  const [status,setStatus]=useState<AuthStatus|null>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const read=async()=>{
    try{
      const response=await fetch('/api/bots/auth/status',{credentials:'same-origin',cache:'no-store'});
      const info=await response.json();
      if(!response.ok||!info.ok)throw Error(info.error||'auth_unavailable');
      setStatus(info);
    }catch{setStatus(null);setNotice('Bot authorization status unavailable.')}
  };
  useEffect(()=>{
    void read();
    const onVerified=()=>void read();
    window.addEventListener('aurelis:wallet-authenticated',onVerified);
    return ()=>window.removeEventListener('aurelis:wallet-authenticated',onVerified);
  },[]);
  const verify=async()=>{
    setBusy(true);setNotice('');
    try{
      const active=await getReusableWalletConnectSession('onekey');
      if(!active)throw Error('No reusable OneKey Agent Money connection. Open Wallet, connect OneKey, then return here.');
      await verifyWalletConnectSession(active.address,active.chainId,active.session,'bots');
      setNotice('Bot Wallet ownership verified. No transaction was signed.');
      await read();
    }catch(e:any){setNotice(String(e?.message||'Verification failed.'))}
    finally{setBusy(false)}
  };
  return <div className="mb-2 px-3 py-2.5 rounded-xl bg-surface-panel/95 border border-white/10 flex flex-wrap items-center justify-between gap-2 text-[10px]">
    <div className="flex items-center gap-2">
      {status?.verified ? <ShieldCheck className="w-4 h-4 text-primary-container"/> : <Wallet className="w-4 h-4 text-amber-400"/>}
      <div>
        <strong>OneKey Bot Wallet</strong>
        <div className={status?.verified?'text-primary-container':'text-text-muted'}>
          {status?.verified?'Verified owner · Kraken account access authorized':status?.ownerConfigured?'Verify ownership to view bot balances and trade':'Owner wallet not configured'}
        </div>
        {notice && <div className="text-amber-400 mt-1">{notice}</div>}
      </div>
    </div>
    <button type="button" disabled={busy || !!status?.verified} onClick={verify}
      className="px-3 py-1.5 rounded-lg border border-primary-container/40 text-primary-container bg-primary-container/10 disabled:opacity-45 inline-flex items-center gap-1.5">
      <RefreshCw size={12} className={busy?'animate-spin':''}/>
      {status?.verified?'BOT WALLET VERIFIED':busy?'AWAITING ONEKEY SIGNATURE':'VERIFY BOT WALLET'}
    </button>
  </div>;
};

import SignClient from '@walletconnect/sign-client';
import { verifyTypedData } from 'ethers';
import { selectSafeEvmAccount } from './walletConnectAccountGuard';

let client: any = null;
let pendingApproval: null | (() => Promise<any>) = null;
let pendingBotApproval: null | (() => Promise<any>) = null;
const BOT_TOPIC_KEY = 'aurelis:bot-walletconnect-topic';
const BOT_AGENT_ADDRESS = '0xd2919c82e5fecbb0c4be7a7c37bfc066579f233e';
const botTopic = () => { try { return window.localStorage.getItem(BOT_TOPIC_KEY) || ''; } catch { return ''; } };

async function getClient() {
  if (client) return client;

  const configRes = await fetch('/api/walletconnect/config', { cache: 'no-store' });
  const config = await configRes.json();
  if (!configRes.ok || !config?.ok || !config?.projectId) {
    throw new Error('WalletConnect is not configured');
  }

  client = await SignClient.init({
    projectId: config.projectId,
    metadata: {
      name: 'AURELIS',
      description: 'AURELIS web wallet connection',
      url: window.location.origin,
      icons: [new URL('/aurelis-icon.svg', window.location.origin).href],
    },
  });

  return client;
}


function parseEvmSession(session: any): { address: string; chainId: number; session: any } | null {
  const accounts: string[] = session?.namespaces?.eip155?.accounts || [];
  const account = accounts.find((item) => /^eip155:\d+:0x[a-fA-F0-9]{40}$/.test(item)) || '';
  if (!account) return null;

  const parts = account.split(':');
  const address = parts[2] || '';
  const chainId = Number(parts[1] || 1);
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return null;
  if (!Number.isFinite(chainId)) return null;

  return { address, chainId, session };
}

export async function getReusableWalletConnectSession(walletId?: string): Promise<{
  address: string;
  chainId: number;
  session: any;
} | null> {
  const signClient = await getClient();
  const now = Math.floor(Date.now() / 1000);
  const sessions: any[] = signClient?.session?.getAll?.() || [];

  const candidates = sessions
    .filter((session) => (!session?.expiry || Number(session.expiry) > now + 30) && session?.topic !== botTopic())
    .sort((a, b) => Number(b?.expiry || 0) - Number(a?.expiry || 0));

  const wanted = String(walletId || '').toLowerCase();
  for (const session of candidates) {
    if (wanted && wanted !== 'walletconnect') {
      const peerName = String(session?.peer?.metadata?.name || '').toLowerCase();
      const peerUrl = String(session?.peer?.metadata?.url || '').toLowerCase();
      const haystack = `${peerName} ${peerUrl}`;
      const matches =
        wanted === 'onekey' ? haystack.includes('onekey') :
        wanted === 'safepal' ? haystack.includes('safepal') :
        wanted === 'tangem' ? haystack.includes('tangem') :
        true;
      if (!matches) continue;
    }
    const parsed = parseEvmSession(session);
    if (parsed && parsed.address.toLowerCase() !== BOT_AGENT_ADDRESS) return parsed;
  }

  return null;
}

// Bot WalletConnect is a separate pairing topic, never a fallback to the main wallet.
export async function getBotWalletConnectSession(): Promise<{address:string;chainId:number;session:any}|null> {
  const topic = botTopic();
  if (!topic) return null;
  const signClient = await getClient();
  const session = (signClient.session.getAll() as any[]).find(s => s.topic === topic);
  if (!session || (session.expiry && Number(session.expiry) <= Date.now()/1000 + 30)) return null;
  const parsed = parseEvmSession(session);
  if (!parsed || parsed.address.toLowerCase() !== BOT_AGENT_ADDRESS) return null;
  return parsed;
}

export async function startBotWalletConnectPairing(): Promise<{uri:string}> {
  const signClient = await getClient();
  const {uri,approval} = await signClient.connect({
    requiredNamespaces: {eip155: {
      methods:['personal_sign','eth_signTypedData_v4'],
      chains:['eip155:1'],
      events:['accountsChanged','chainChanged'],
    }},
  });
  if (!uri) throw new Error('OneKey did not return a Bot WalletConnect pairing URI');
  pendingBotApproval = approval;
  return {uri};
}

export async function waitForBotWalletConnectApproval(): Promise<{address:string;chainId:number;session:any}> {
  if (!pendingBotApproval) throw new Error('No Bot WalletConnect pairing is pending');
  const approval = pendingBotApproval;
  pendingBotApproval = null;
  const session = await approval();
  const parsed = parseEvmSession(session);
  if (!parsed || parsed.address.toLowerCase() !== BOT_AGENT_ADDRESS) {
    // Never save another wallet as the Agent Money bot identity.
    try { await (await getClient()).disconnect({topic:session.topic,reason:{code:6000,message:'Wrong bot wallet account'}}); } catch {}
    throw new Error('Bot wallet must be OneKey Agent Money. Select the Agent Money account on your phone.');
  }
  const name = String(session?.peer?.metadata?.name || '').toLowerCase();
  const url = String(session?.peer?.metadata?.url || '').toLowerCase();
  if (!(name+' '+url).includes('onekey')) {
    try { await (await getClient()).disconnect({topic:session.topic,reason:{code:6000,message:'Not OneKey'}}); } catch {}
    throw new Error('Connect the Bot Wallet using OneKey.');
  }
  window.localStorage.setItem(BOT_TOPIC_KEY,session.topic);
  window.dispatchEvent(new Event('aurelis:bot-wallet-connected'));
  return parsed;
}

export async function disconnectBotWalletConnect(): Promise<void> {
  const topic=botTopic();
  window.localStorage.removeItem(BOT_TOPIC_KEY);
  if (topic) {
    const signClient=await getClient();
    if ((signClient.session.getAll() as any[]).some(s=>s.topic===topic)) {
      await signClient.disconnect({topic,reason:{code:6000,message:'Bot wallet disconnected by user'}});
    }
  }
  window.dispatchEvent(new Event('aurelis:bot-wallet-connected'));
}

// User-triggered, non-authorizing EIP-712 capability test. Never returns the signature.
export async function testOneKeyTypedDataCapability(selectedSession?: {address: string; chainId: number; session: any}): Promise<{address: string; chainId: number; supported: boolean}> {
  const active = selectedSession || await getBotWalletConnectSession();
  if (!active) throw new Error('No dedicated Bot WalletConnect session found. Connect Bot Wallet above.');
  const signClientForValidation = await getClient();
  const liveSession = signClientForValidation?.session?.get?.(active.session?.topic);
  if (!liveSession || (liveSession.expiry && Number(liveSession.expiry) <= Date.now()/1000 + 30)) {
    throw new Error('OneKey WalletConnect session expired or was disconnected. Reconnect it from Wallet.');
  }
  if (!parseEvmSession(liveSession)?.address || parseEvmSession(liveSession)!.address.toLowerCase() !== active.address.toLowerCase()) {
    throw new Error('OneKey WalletConnect account changed. Refresh the connection before signing.');
  }
  const namespace = active.session?.namespaces?.eip155;
  if (!Array.isArray(namespace?.methods) || !namespace.methods.includes('eth_signTypedData_v4')) {
    throw new Error('This OneKey session does not permit EIP-712 signing. Reconnect OneKey with typed-data permissions.');
  }
  const allowedChains: string[] = namespace?.chains || [];
  const allowedAccounts: string[] = namespace?.accounts || [];
  const chain = 'eip155:' + active.chainId;
  if (!allowedAccounts.some(x => x.toLowerCase() === (chain + ':' + active.address).toLowerCase())
      || (allowedChains.length && !allowedChains.includes(chain))) throw new Error('Wallet session does not authorize its selected chain.');
  const nonce = Date.now().toString();
  const data = {
    domain: { name: 'AURELIS Capability Check', version: '1', chainId: active.chainId },
    primaryType: 'CapabilityCheck',
    types: {
      EIP712Domain: [{name:'name',type:'string'},{name:'version',type:'string'},{name:'chainId',type:'uint256'}],
      CapabilityCheck: [{name:'purpose',type:'string'},{name:'nonce',type:'string'}],
    },
    message: { purpose: 'Test wallet support only. This does not authorize Hyperliquid trading.', nonce },
  };
  const signClient = await getClient();
  const signature = await signClient.request({
    topic: active.session.topic, chainId: chain,
    request: {method:'eth_signTypedData_v4',params:[active.address, JSON.stringify(data)]},
  });
  if (typeof signature !== 'string' || !/^0x[a-fA-F0-9]{130}$/.test(signature)) throw new Error('Wallet returned an invalid EIP-712 signature');
  const recovered = verifyTypedData(data.domain, {CapabilityCheck: data.types.CapabilityCheck}, data.message, signature);
  if (recovered.toLowerCase() !== active.address.toLowerCase()) throw new Error('Wallet signature does not match the connected OneKey address');
  // Do not log, store or transmit this signature.
  return {address:active.address,chainId:active.chainId,supported:true};
}

export async function startWalletConnectPairing(options?: {
  walletId?: string
  chainId?: number
}): Promise<{ uri: string }> {
  const signClient = await getClient();
  const events = ['accountsChanged', 'chainChanged'];
  const walletId = String(options?.walletId || '').toLowerCase();
  const requestedChainId = Number(options?.chainId || 1);
  const requestedChain = `eip155:${Number.isFinite(requestedChainId) ? requestedChainId : 1}`;

  // SafePal is much less tolerant of broad WalletConnect namespace proposals.
  // Start with one EVM chain and the two methods AURELIS actually needs.
  // Extra chains are paired on demand instead of making the initial QR fail.
  const safePalProfile = walletId === 'safepal';
  const methods = safePalProfile
    ? ['personal_sign', 'eth_sendTransaction']
    : ['personal_sign', 'eth_sendTransaction', 'eth_signTypedData_v4'];

  const connectParams: any = {
    requiredNamespaces: {
      eip155: {
        methods,
        chains: [requestedChain],
        events,
      },
    },
  };

  if (!safePalProfile && requestedChainId === 1) {
    connectParams.optionalNamespaces = {
      eip155: {
        methods,
        chains: ['eip155:42161', 'eip155:8453', 'eip155:10', 'eip155:137'],
        events,
      },
    };
  }

  const { uri, approval } = await signClient.connect(connectParams);

  if (!uri) throw new Error('WalletConnect did not return a pairing URI');
  pendingApproval = approval;
  return { uri };
}

export async function waitForWalletConnectApproval(): Promise<{
  address: string;
  chainId: number;
  session: any;
}> {
  if (!pendingApproval) throw new Error('No WalletConnect pairing is pending');

  const session = await pendingApproval();
  pendingApproval = null;

  const parsed = parseEvmSession(session);
  if (!parsed) throw new Error('WalletConnect returned no EVM account');
  return parsed;
}

export async function verifyWalletConnectSession(
  address: string,
  chainId: number,
  session: any,
  purpose: 'web' | 'bots' = 'web',
): Promise<void> {
  const challengeRes = await fetch('/api/auth/challenge', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, chainId, purpose }),
  });

  const challenge = await challengeRes.json();
  if (!challengeRes.ok || !challenge?.ok || !challenge?.message) {
    throw new Error(challenge?.error || 'wallet_auth_challenge_failed');
  }

  const signClient = await getClient();
  const signature = await signClient.request({
    topic: session.topic,
    chainId: `eip155:${chainId}`,
    request: {
      method: 'personal_sign',
      params: [challenge.message, address],
    },
  });

  const verifyRes = await fetch('/api/auth/verify', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: challenge.message,
      signature,
      address,
      chainId,
    }),
  });

  const verified = await verifyRes.json();
  if (!verifyRes.ok || !verified?.verified) {
    throw new Error(verified?.error || 'wallet_auth_verify_failed');
  }

  window.dispatchEvent(
    new CustomEvent('aurelis:wallet-authenticated', { detail: verified }),
  );
}


function decimalToAtomicUnits(value: string, decimals: number): bigint {
  const clean = String(value || '').trim()
  if (!/^\d+(?:\.\d+)?$/.test(clean)) throw new Error('Invalid token amount')
  const [whole, fraction = ''] = clean.split('.')
  if (fraction.length > decimals) throw new Error('Token amount has too many decimal places')
  const padded = fraction.padEnd(decimals, '0')
  return BigInt((whole || '0') + padded)
}

function encodeErc20Transfer(recipient: string, amount: bigint): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) throw new Error('Invalid EVM recipient')
  const addressWord = recipient.slice(2).toLowerCase().padStart(64, '0')
  const amountWord = amount.toString(16).padStart(64, '0')
  return '0xa9059cbb' + addressWord + amountWord
}

export async function sendWalletConnectErc20Transfer(params: {
  chainId: number
  tokenContract: string
  decimals: number
  recipient: string
  amount: string
  expectedFrom?: string
}): Promise<{ txHash: string; from: string }> {
  const signClient = await getClient()
  const now = Math.floor(Date.now() / 1000)
  const sessions: any[] = signClient?.session?.getAll?.() || []
  const targetChain = `eip155:${params.chainId}`

  for (const session of sessions) {
    if (session?.topic === botTopic()) continue
    if (session?.expiry && Number(session.expiry) <= now + 30) continue
    const ns = session?.namespaces?.eip155
    if (!Array.isArray(ns?.methods) || !ns.methods.includes('eth_sendTransaction')) continue

    const from = selectSafeEvmAccount(ns?.accounts, targetChain, params.expectedFrom, BOT_AGENT_ADDRESS)
    if (!from) continue
    if (!/^0x[a-fA-F0-9]{40}$/.test(params.tokenContract)) {
      throw new Error('Invalid token contract')
    }

    const atomic = decimalToAtomicUnits(params.amount, params.decimals)
    if (atomic <= 0n) throw new Error('Token amount must be greater than zero')
    const data = encodeErc20Transfer(params.recipient, atomic)

    const result = await signClient.request({
      topic: session.topic,
      chainId: targetChain,
      request: {
        method: 'eth_sendTransaction',
        params: [{
          from,
          to: params.tokenContract,
          value: '0x0',
          data,
        }],
      },
    })

    const txHash = String(result || '')
    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      throw new Error('Wallet approved the request but did not return a transaction hash')
    }
    return { txHash, from }
  }

  throw new Error('No connected WalletConnect session supports Base transaction sending')
}



export async function sendWalletConnectNativeTransfer(params: {
  chainId: number
  recipient: string
  amount: string
  expectedFrom?: string
}): Promise<{ txHash: string; from: string }> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(params.recipient)) {
    throw new Error('Invalid EVM recipient')
  }

  const atomic = decimalToAtomicUnits(params.amount, 18)
  if (atomic <= 0n) throw new Error('ETH amount must be greater than zero')

  const signClient = await getClient()
  const now = Math.floor(Date.now() / 1000)
  const sessions: any[] = signClient?.session?.getAll?.() || []
  const targetChain = `eip155:${params.chainId}`

  for (const session of sessions) {
    if (session?.topic === botTopic()) continue
    if (session?.expiry && Number(session.expiry) <= now + 30) continue
    const ns = session?.namespaces?.eip155
    if (!Array.isArray(ns?.methods) || !ns.methods.includes('eth_sendTransaction')) continue

    const from = selectSafeEvmAccount(ns?.accounts, targetChain, params.expectedFrom, BOT_AGENT_ADDRESS)
    if (!from) continue

    const result = await signClient.request({
      topic: session.topic,
      chainId: targetChain,
      request: {
        method: 'eth_sendTransaction',
        params: [{
          from,
          to: params.recipient,
          value: '0x' + atomic.toString(16),
        }],
      },
    })

    const txHash = String(result || '')
    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      throw new Error('Wallet approved the request but did not return a transaction hash')
    }
    return { txHash, from }
  }

  throw new Error('No connected wallet session can send on this network. Reconnect the wallet and approve this network.')
}


function normalizeEvmNetworkName(value: string): { network: string; chainId: number } | null {
  const network = String(value || '').trim().toLowerCase()
  if (network === 'ethereum' || network === 'eth' || network === 'mainnet') return { network:'ethereum', chainId:1 }
  if (network === 'arbitrum' || network === 'arb') return { network:'arbitrum', chainId:42161 }
  if (network === 'base') return { network:'base', chainId:8453 }
  if (network === 'optimism' || network === 'op') return { network:'optimism', chainId:10 }
  if (network === 'polygon' || network === 'matic') return { network:'polygon', chainId:137 }
  return null
}

function tokenContractFromAsset(assetId: string, symbol: string, network: string): string {
  const match = String(assetId || '').match(/0x[a-fA-F0-9]{40}/)
  if (match) return match[0]

  if (String(symbol || '').toUpperCase() === 'USDC') {
    const contracts: Record<string,string> = {
      ethereum:'0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      arbitrum:'0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      base:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    }
    return contracts[network] || ''
  }
  return ''
}

export async function sendWalletConnectAssetTransfer(params: {
  network: string
  assetId?: string
  symbol: string
  recipient: string
  amount: string
  expectedFrom?: string
}): Promise<{ txHash: string; from: string }> {
  const evm = normalizeEvmNetworkName(params.network)
  if (!evm) throw new Error('This asset network is not supported by the web sender yet')

  const symbol = String(params.symbol || '').toUpperCase()
  const contract = tokenContractFromAsset(params.assetId || '', symbol, evm.network)

  if (symbol === 'ETH' && !contract) {
    return sendWalletConnectNativeTransfer({
      chainId: evm.chainId,
      recipient: params.recipient,
      amount: params.amount,
      expectedFrom: params.expectedFrom,
    })
  }

  if (!contract) {
    throw new Error('This token is missing its contract address, so AURELIS cannot safely build the transfer')
  }

  const metaRes = await fetch(
    '/api/wallet/erc20-decimals?network=' + encodeURIComponent(evm.network) +
    '&contract=' + encodeURIComponent(contract),
    { cache:'no-store', credentials:'same-origin' },
  )
  const meta = await metaRes.json()
  if (!metaRes.ok || !meta?.ok || !Number.isInteger(Number(meta.decimals))) {
    throw new Error(meta?.error || 'Token metadata could not be verified')
  }

  return sendWalletConnectErc20Transfer({
    chainId: evm.chainId,
    tokenContract: contract,
    decimals: Number(meta.decimals),
    recipient: params.recipient,
    amount: params.amount,
    expectedFrom: params.expectedFrom,
  })
}

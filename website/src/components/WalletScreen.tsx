import { openOneKeyAction } from './OneKeyActionRouter';
import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Wallet,
  ArrowUpRight,
  Copy,
  Check,
  QrCode,
  LogOut,
  X,
  Info,
  Grid,
  Lock,
  CheckCircle2,
  Network,
  ChevronDown,
} from 'lucide-react';
import { CoinData, WalletHolding, WalletTransaction, ThemeMode, NavigationTab } from '../types';
import { QRCodeSVG } from 'qrcode.react';
import { formatCurrency, playHudSound } from '../services/marketData';
import {
  getReusableWalletConnectSession,
  startWalletConnectPairing,
  waitForWalletConnectApproval,
  verifyWalletConnectSession,
  sendWalletConnectAssetTransfer,
} from '../services/walletConnectService';
import { getNativeWalletAddresses, getWalletReceiveOptions, WalletAddressMap } from '../services/walletApi';
import { CoinIcon } from './CoinIcon';

type ExternalWalletOption = {
  id: 'onekey' | 'safepal' | 'tangem' | 'ledger' | 'walletconnect';
  name: string;
  logo: string;
  hint: string;
};

const EXTERNAL_WALLET_OPTIONS: ExternalWalletOption[] = [
  { id: 'onekey', name: 'OneKey Phone', logo: '/wallet-icons/walletconnect.ico', hint: 'Scan with OneKey mobile app to approve from your phone' },
  { id: 'safepal', name: 'SafePal', logo: '/wallet-icons/safepal.ico', hint: 'Scan with SafePal mobile, hardware wallet, or extension' },
  { id: 'tangem', name: 'Tangem', logo: '/wallet-icons/tangem.ico', hint: 'Scan the QR code in Tangem Wallet' },
  { id: 'ledger', name: 'Ledger', logo: '/wallet-icons/walletconnect.ico', hint: 'Use Ledger Live or any Ledger WalletConnect flow' },
  { id: 'walletconnect', name: 'Other Wallet', logo: '/wallet-icons/walletconnect.ico', hint: 'Any WalletConnect-compatible wallet' },
];


function openOneKeyNativeReceive(): boolean {
  if (typeof window === 'undefined') return false;
  const message = JSON.stringify({ source: 'aurelis-web', type: 'open-onekey-receive' });
  const rnWebView = (window as any).ReactNativeWebView;
  if (rnWebView && typeof rnWebView.postMessage === 'function') {
    rnWebView.postMessage(message);
    return true;
  }
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(message, '*');
    return true;
  }
  return false;
}

interface WalletScreenProps {
  coins: CoinData[];
  isConnected: boolean;
  onConnect: (address?: string, provider?: string) => void;
  onDisconnect: () => void;
  walletAddress: string;
  holdings: WalletHolding[];
  transactions: WalletTransaction[];
  onOpenTrade?: (coin?: CoinData) => void;
  onOpenAsset?: (coin: CoinData, holding: WalletHolding) => void;
  onNavigate?: (tab: NavigationTab) => void;
  soundEnabled: boolean;
  theme?: ThemeMode;
  isStandalone?: boolean;
}

export const WalletScreen: React.FC<WalletScreenProps> = ({
  coins = [],
  isConnected = false,
  onConnect,
  onDisconnect,
  walletAddress = '',
  holdings = [],
  transactions = [],
  onOpenTrade,
  onOpenAsset,
  onNavigate,
  soundEnabled,
  theme = 'dark',
  isStandalone = false,
}) => {
  const [showReceiveModal, setShowReceiveModal] = useState<boolean>(false);
  const [showSendModal, setShowSendModal] = useState<boolean>(false);
  const [nativeAddresses, setNativeAddresses] = useState<WalletAddressMap>({});
  const [receiveNetwork, setReceiveNetwork] = useState<string>('ETH');
  const [receivePickerOpen, setReceivePickerOpen] = useState(false);
  const [receiveAddressError, setReceiveAddressError] = useState<string | null>(null);
  const [sendAssetKey, setSendAssetKey] = useState<string>('');
  const [sendPickerOpen, setSendPickerOpen] = useState(false);
  const [sendAmount, setSendAmount] = useState<string>('');
  const [sendRecipient, setSendRecipient] = useState<string>('');
  const [sendSuccess, setSendSuccess] = useState<boolean>(false);
  const [sendTxHash, setSendTxHash] = useState<string>('');
  const [isSendingWebTx, setIsSendingWebTx] = useState<boolean>(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<boolean>(false);
  const [connectedWalletName, setConnectedWalletName] = useState<string>('AURELIS Wallet');
  const [arcNotice, setArcNotice] = useState<string | null>(null);

  const [showWalletPicker, setShowWalletPicker] = useState(false);
  const [showWalletConnectModal, setShowWalletConnectModal] = useState(false);
  const [walletConnectBrand, setWalletConnectBrand] = useState<ExternalWalletOption>(EXTERNAL_WALLET_OPTIONS[0]);
  const [wcSession, setWcSession] = useState<{ uri: string }>({ uri: '' });
  const [wcPairingStatus, setWcPairingStatus] = useState<'idle' | 'starting' | 'waiting' | 'connected' | 'error'>('idle');
  const [wcPairingError, setWcPairingError] = useState<string | null>(null);
  const [copiedWcUri, setCopiedWcUri] = useState(false);

  useEffect(() => {
    if (!showWalletConnectModal) return;

    let active = true;
    setWcPairingStatus('starting');
    setWcPairingError(null);
    setWcSession({ uri: '' });

    const reusableSessionPromise = getReusableWalletConnectSession(walletConnectBrand.id);

    reusableSessionPromise
      .then(async (existing) => {
        if (!active) return;

        let approved = existing;
        if (approved) {
          setWcPairingStatus('waiting');
          setArcNotice('Reusing your existing wallet connection…');
        } else {
          const pairing = await Promise.race([
            startWalletConnectPairing({ walletId: walletConnectBrand.id, chainId: 1 }),
            new Promise<never>((_, reject) => {
              window.setTimeout(() => reject(new Error('WalletConnect pairing is taking too long. Try Retry, then scan with OneKey Phone.')), 15000);
            }),
          ]);
          if (!active) return;
          setWcSession(pairing);
          setWcPairingStatus('waiting');
          if (walletConnectBrand.id === 'onekey') {
            setArcNotice('OneKey Phone QR ready. Scan it in OneKey to approve from your phone.');
          } else if (walletConnectBrand.id === 'safepal') {
            setArcNotice('SafePal QR ready. AURELIS is requesting Ethereum only for the initial connection.');
          }
          approved = await waitForWalletConnectApproval();
          if (!active) return;
        }

        // OneKey sessions must resolve to the pinned Agent Money account.
        // Never silently use another OneKey account or wallet.
        if (walletConnectBrand.id === 'onekey' && approved.address.toLowerCase() !== '0xd2919c82e5fecbb0c4be7a7c37bfc066579f233e') {
          throw new Error('OneKey connected to a different account. Select Agent Money in OneKey and retry.');
        }

        // Mark the wallet connected immediately after WalletConnect approval.
        // OneKey sometimes completes the session approval but delays or suppresses
        // the follow-up personal_sign request, so do not hold the UI hostage here.
        setConnectedWalletName(walletConnectBrand.name);
        onConnect(approved.address, walletConnectBrand.name);
        setWcPairingStatus('connected');
        setShowWalletConnectModal(false);
        setArcNotice(existing ? 'Existing wallet connection restored.' : 'Wallet connected. Loading live balances…');
        window.dispatchEvent(new CustomEvent('aurelis:wallet-refresh'));

        try {
          await Promise.race([
            verifyWalletConnectSession(
              approved.address,
              approved.chainId,
              approved.session,
              'web',
            ),
            new Promise<never>((_, reject) => {
              window.setTimeout(() => reject(new Error('Wallet connected, but login signature timed out. You can keep using the connected wallet and retry signing later.')), 20000);
            }),
          ]);
          if (!active) return;
          setArcNotice('Wallet verified. Loading live balances…');
          window.dispatchEvent(new CustomEvent('aurelis:wallet-authenticated'));
          window.dispatchEvent(new CustomEvent('aurelis:wallet-refresh'));
        } catch (verifyError: any) {
          if (!active) return;
          setArcNotice(verifyError?.message || 'Wallet connected. Login signature can be retried later.');
        }

        window.setTimeout(() => setArcNotice(null), 4500);
      })
      .catch((error: any) => {
        if (!active) return;
        setWcPairingStatus('error');
        setWcPairingError(error?.message || 'WalletConnect pairing failed');
      });

    return () => {
      active = false;
    };
  }, [showWalletConnectModal, walletConnectBrand]);

  // Address display formatting
  const displayAddress = walletAddress;
  const shortAddress =
    displayAddress.length > 14
      ? `${displayAddress.slice(0, 6)}...${displayAddress.slice(-4)}`
      : displayAddress;

  const receiveOptions = useMemo(
    () => getWalletReceiveOptions(nativeAddresses, displayAddress),
    [nativeAddresses, displayAddress]
  );

  useEffect(() => {
    if (receiveOptions.length && !receiveOptions.some((item) => item.key === receiveNetwork)) {
      setReceiveNetwork(receiveOptions[0].key);
    }
  }, [receiveOptions, receiveNetwork]);

  const selectedReceiveAddress =
    receiveOptions.find((item) => item.key === receiveNetwork)?.address ||
    displayAddress;

  const oneKeyMobileConnectUrl = useMemo(() => {
    if (!wcSession.uri) return '';
    return `https://app.onekey.so/wc/connect/wc?uri=${encodeURIComponent(wcSession.uri)}`;
  }, [wcSession.uri]);

  const retryWalletConnectPairing = () => {
    setShowWalletConnectModal(false);
    window.setTimeout(() => setShowWalletConnectModal(true), 25);
  };

  useEffect(() => {
    let active = true;
    getNativeWalletAddresses()
      .then((addresses) => {
        if (!active) return;
        setNativeAddresses(addresses);
        setReceiveAddressError(null);
      })
      .catch((error: any) => {
        if (!active) return;
        setReceiveAddressError(error?.message || 'Wallet addresses unavailable');
      });
    return () => {
      active = false;
    };
  }, []);

  // Real AURELIS wallet balances, enriched with live market prices when available.
  const portfolioTokens = useMemo(() => {
    return holdings.map((item) => {
      const matchCoin = coins.find((c) => c.symbol.toUpperCase() === item.symbol.toUpperCase());
      const spotPrice = Number(matchCoin?.price ?? item.price ?? 0);
      const change24h = Number(matchCoin?.change24h ?? item.change24h ?? 0);
      return {
        symbol: item.symbol,
        name: item.name,
        amount: item.amount,
        network: item.chain || 'AURELIS',
        price: Number.isFinite(spotPrice) ? spotPrice : 0,
        change24h: Number.isFinite(change24h) ? change24h : 0,
        value: item.amount * (Number.isFinite(spotPrice) ? spotPrice : 0),
        color: matchCoin?.color || '#64748b',
        assetId: item.assetId || '',
        tokenAddress: item.tokenAddress || '',
        accountAddress: item.accountAddress || '',
        walletName: item.walletName || '',
        walletProfileId: item.walletProfileId || '',
        walletCanSign: Boolean(item.walletCanSign),
      };
    });
  }, [coins, holdings]);

  const totalPortfolioValue = useMemo(() => {
    return portfolioTokens.reduce((acc, curr) => acc + curr.value, 0);
  }, [portfolioTokens]);

  const sendAssetOptions = useMemo(() => {
    const seen = new Set<string>();
    return portfolioTokens
      .filter((item) => Number(item.amount) > 0)
      .map((item) => {
        const network = String(item.network || 'AURELIS');
        const key = `${item.symbol.toUpperCase()}::${network.toUpperCase()}`;
        return { ...item, key, network };
      })
      .filter((item) => {
        if (seen.has(item.key)) return false;
        seen.add(item.key);
        return true;
      });
  }, [portfolioTokens]);

  useEffect(() => {
    if (!sendAssetOptions.length) {
      setSendAssetKey('');
      return;
    }
    if (!sendAssetOptions.some((item) => item.key === sendAssetKey)) {
      setSendAssetKey(sendAssetOptions[0].key);
    }
  }, [sendAssetOptions, sendAssetKey]);

  const selectedSendAsset =
    sendAssetOptions.find((item) => item.key === sendAssetKey) || sendAssetOptions[0];

  const sendCoinSymbol = selectedSendAsset?.symbol || '';


  useEffect(() => {
    if (!sendAssetOptions.length) return;
    const raw = localStorage.getItem('aurelis_web_send_prefill');
    if (!raw) return;
    try {
      const prefill = JSON.parse(raw);
      const symbol = String(prefill?.symbol || '').toUpperCase();
      const network = String(prefill?.network || '').toUpperCase();
      const krakenFunding=String(prefill?.destinationSource||'')==='kraken';
      const botWalletAddress='0xd2919c82e5fecbb0c4be7a7c37bfc066579f233e';
      const match = sendAssetOptions.find((item) => {
        const itemNetwork = String(item.network || '').toUpperCase();
        const sameNetwork=itemNetwork===network || itemNetwork.includes(network) || network.includes(itemNetwork);
        // Funding must never select an asset from the Home wallet or another wallet profile.
        const ownerOk=!krakenFunding || String(item.accountAddress||'').toLowerCase()===botWalletAddress;
        return item.symbol.toUpperCase() === symbol && sameNetwork && ownerOk;
      }) || (krakenFunding ? undefined :
        sendAssetOptions.find((item) => item.symbol.toUpperCase() === symbol));
      if (krakenFunding && !match) {
        setSendError('The OneKey Bot Wallet must have USDC on the selected network. No transfer has been prepared; a different wallet will not be used.');
        localStorage.removeItem('aurelis_web_send_prefill');
        return;
      }
      if (match) setSendAssetKey(match.key);
      setSendRecipient(String(prefill?.recipient || ''));
      setSendAmount(String(prefill?.amount || ''));
      setSendSuccess(false);
      setSendTxHash('');
      setSendError(null);
      setShowSendModal(true);
      localStorage.removeItem('aurelis_web_send_prefill');
    } catch {
      localStorage.removeItem('aurelis_web_send_prefill');
    }
  }, [sendAssetOptions]);

  const handleCopyAddress = () => {
    if (soundEnabled) playHudSound('click');
    if (!selectedReceiveAddress) return;
    navigator.clipboard.writeText(selectedReceiveAddress);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2500);
  };

  const handleOpenWalletConnect = () => {
    if (soundEnabled) playHudSound('trade');
    setShowWalletPicker(true);
  };

  const handleSelectExternalWallet = (wallet: ExternalWalletOption) => {
    if (soundEnabled) playHudSound('click');
    setWalletConnectBrand(wallet);
    setShowWalletPicker(false);
    setShowWalletConnectModal(true);
  };

  const handleCopyWcUri = () => {
    if (soundEnabled) playHudSound('click');
    navigator.clipboard.writeText(wcSession.uri);
    setCopiedWcUri(true);
    setTimeout(() => setCopiedWcUri(false), 2000);
  };

  const handleDisconnectWallet = () => {
    if (soundEnabled) playHudSound('switch');
    onDisconnect();
  };

  const isOneKeyHost = typeof window !== 'undefined' && (() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('walletHost') === 'onekey' || params.get('desktop') === '1';
  })();

  const handleReceiveClick = () => {
    if (soundEnabled) playHudSound('switch');
    openOneKeyAction('receive', () => {
      if (isOneKeyHost && openOneKeyNativeReceive()) return;
      if (!isOneKeyHost) {
        const bridge = (window as any).AurelisNative;
        if (bridge && typeof bridge.openNativeScreen === 'function') {
          bridge.openNativeScreen('receive');
          return;
        }
      }
      setShowReceiveModal(true);
    });
  };

  const handleSendClick = () => {
    if (soundEnabled) playHudSound('switch');
    openOneKeyAction('send', () => {
      if (isOneKeyHost) {
        setSendError('OneKey signing is not connected to AURELIS Send. Complete the transfer inside OneKey.');
        setShowSendModal(true);
        return;
      }
      const bridge = (window as any).AurelisNative;
      if (bridge && typeof bridge.openNativeScreen === 'function') {
        bridge.openNativeScreen('send');
        return;
      }
      setShowSendModal(true);
    });
  };

  const handleAddWatchAddress = () => {
    if (soundEnabled) playHudSound('click');
    const profileName = (window.prompt('Wallet profile name: SafePal, Tangem, Ledger, OneKey, or another label.', 'SafePal') || '').trim();
    if (!profileName) return;
    const profileId = profileName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'wallet-profile';
    const supported = 'EVM, BTC, LTC, DOGE, ZEC, SOL, XRP, NEAR';
    const alias: Record<string, string> = {
      ETH: 'evm', EVM: 'evm', ADDRESS: 'evm', EIP155: 'evm',
      BITCOIN: 'btc', BTC: 'btc',
      LITECOIN: 'ltc', LTC: 'ltc',
      DOGECOIN: 'doge', DOGE: 'doge',
      ZCASH: 'zec', ZEC: 'zec',
      SOLANA: 'sol', SOL: 'sol',
      RIPPLE: 'xrp', XRP: 'xrp',
      NEAR: 'near',
    };
    try {
      const rawProfiles = JSON.parse(localStorage.getItem('aurelis_wallet_profiles') || '[]');
      const profiles = Array.isArray(rawProfiles) ? rawProfiles : [];
      const existing = profiles.find((item: any) => String(item?.id || '').toLowerCase() === profileId || String(item?.name || '').toLowerCase() === profileName.toLowerCase());
      const existingAddresses = existing && existing.addresses && typeof existing.addresses === 'object' ? existing.addresses : {};
      const defaultText = ['EVM','BTC','LTC','DOGE','ZEC','SOL','XRP','NEAR']
        .map((key) => `${key}=${String(existingAddresses[alias[key] || key.toLowerCase()] || '')}`)
        .join('\n');
      const profileText = (window.prompt(
        `${profileName} wallet profile. Paste public receive addresses only. Supported: ${supported}.\n\nFormat:\nEVM=0x...\nBTC=bc1...\nZEC=t1...\nSOL=...\nXRP=...\nNEAR=...\n\nNever paste a seed phrase or private key.`,
        defaultText
      ) || '').trim();
      if (!profileText) return;
      const addresses: Record<string, string> = { ...existingAddresses };
      let saved = 0;
      for (const rawLine of profileText.split(/[\n;,]+/)) {
        const line = rawLine.trim();
        if (!line) continue;
        const match = line.match(/^([A-Za-z0-9_-]+)\s*[:=]\s*(.+)$/);
        if (!match) continue;
        const asset = match[1].trim().toUpperCase();
        const address = match[2].trim();
        if (!address || /seed|private\s*key|mnemonic/i.test(asset) || /seed phrase|private key|mnemonic/i.test(address)) continue;
        const chain = alias[asset] || asset.toLowerCase();
        addresses[chain] = address;
        saved += 1;
      }
      if (!saved && !Object.keys(addresses).length) {
        setArcNotice('No usable wallet profile addresses found. Use lines like EVM=0x... or ZEC=t1...');
        return;
      }
      const nextProfile = { id: profileId, name: profileName, provider: profileName, addresses, updatedAt: Date.now() };
      const nextProfiles = [...profiles.filter((item: any) => String(item?.id || '').toLowerCase() !== profileId && String(item?.name || '').toLowerCase() !== profileName.toLowerCase()), nextProfile];
      localStorage.setItem('aurelis_wallet_profiles', JSON.stringify(nextProfiles));
      localStorage.setItem('aurelis_active_wallet_profile', profileId);
      if (/^0x[a-fA-F0-9]{40}$/.test(addresses.evm || '')) {
        onConnect(addresses.evm, profileName);
      }
      setArcNotice(`${profileName} profile saved. AURELIS will include it in total wallet balances and use it as the active wallet target.`);
      window.dispatchEvent(new CustomEvent('aurelis:wallet-refresh'));
    } catch {
      setArcNotice('Could not save that wallet profile.');
    }
  };

  return (
    <div className="flex flex-col gap-4 p-2 sm:p-4 max-w-[1720px] mx-auto w-full select-none pb-24 text-text-primary text-xs font-mono animate-in fade-in duration-200">
      {/* Toast Notice */}
      {arcNotice && (
        <div className="p-3 bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 rounded-xl text-xs font-mono flex items-center justify-between animate-in slide-in-from-top-2 shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-cyan-400" />
            <span>{arcNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setArcNotice(null)}
            className="text-text-muted hover:text-text-primary cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. SECTION: CONNECTED WALLET BALANCE (#aurelis-connected-balance) */}
      {/* ========================================================================= */}
      <section
        id="aurelis-connected-balance"
        data-balance-state={isConnected ? 'ready' : 'loading'}
        className="rounded-2xl bg-surface-panel/90 border border-white/10 p-4 sm:p-5 shadow-lg space-y-4"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-white/5">
          <div>
            <span className="font-mono text-[10px] text-primary-container uppercase tracking-widest font-bold block mb-0.5">
              CONNECTED WALLET
            </span>
            <h3 className="font-headline text-lg sm:text-xl font-bold text-text-primary">
              Wallet balance
            </h3>
            <p className="font-sans text-xs text-text-secondary mt-0.5">
              Live balances from the connected AURELIS wallet across supported chains. Read-only.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              type="button"
              onClick={handleReceiveClick}
              className="px-3 py-1.5 rounded-lg bg-surface-base border border-white/10 text-text-secondary hover:text-text-primary text-[11px] font-mono font-bold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <QrCode className="w-3.5 h-3.5 text-cyan-400" />
              <span>Receive</span>
            </button>

            <button
              type="button"
              onClick={handleSendClick}
              className="px-3 py-1.5 rounded-lg bg-surface-base border border-white/10 text-text-secondary hover:text-text-primary text-[11px] font-mono font-bold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <ArrowUpRight className="w-3.5 h-3.5 text-primary-container" />
              <span>Send</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={handleOpenWalletConnect}
            className="rounded-xl border border-primary-container/25 bg-primary-container/10 hover:bg-primary-container/15 px-3 py-3 text-left transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2 text-text-primary font-headline font-bold text-sm">
              <QrCode className="w-4 h-4 text-primary-container" />
              Connect Wallet
            </span>
            <span className="block mt-1 text-[11px] text-text-muted font-mono">Pick SafePal / Tangem / Ledger / OneKey</span>
          </button>
          <button
            type="button"
            onClick={handleReceiveClick}
            className="rounded-xl border border-cyan-400/25 bg-cyan-500/10 hover:bg-cyan-500/15 px-3 py-3 text-left transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2 text-text-primary font-headline font-bold text-sm">
              <Wallet className="w-4 h-4 text-cyan-300" />
              Receive Address
            </span>
            <span className="block mt-1 text-[11px] text-text-muted font-mono">Show the connected address</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (soundEnabled) playHudSound('trade');
              if (onNavigate) onNavigate('trade');
            }}
            className="rounded-xl border border-white/15 bg-white/[0.04] hover:bg-white/[0.07] px-3 py-3 text-left transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2 text-text-primary font-headline font-bold text-sm">
              <Grid className="w-4 h-4 text-primary-container" />
              Open Swap
            </span>
            <span className="block mt-1 text-[11px] text-text-muted font-mono">DeFiLlama swap · wallet approval required</span>
          </button>
          <button
            type="button"
            onClick={handleAddWatchAddress}
            className="rounded-xl border border-amber-300/25 bg-amber-300/10 hover:bg-amber-300/15 px-3 py-3 text-left transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2 text-text-primary font-headline font-bold text-sm">
              <Wallet className="w-4 h-4 text-amber-300" />
              Wallet Manager
            </span>
            <span className="block mt-1 text-[11px] text-text-muted font-mono">SafePal / Tangem / Ledger / OneKey</span>
          </button>
        </div>

        {/* Info Grid Cards: Connected Wallet & Connected Address */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl bg-surface-base border border-white/5">
            <span className="text-text-muted text-[10.5px] uppercase font-mono block">Connected wallet</span>
            <strong
              id="aurelis-balance-wallet-name"
              className="block mt-1 text-text-primary text-sm sm:text-base font-bold"
            >
              {connectedWalletName}
            </strong>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-base border border-white/5">
            <span className="text-text-muted text-[10.5px] uppercase font-mono block">Connected address</span>
            <div className="flex items-center justify-between gap-1 mt-1">
              <strong
                id="aurelis-balance-address"
                className="block font-mono text-text-primary text-xs sm:text-sm font-semibold truncate"
              >
                {isConnected ? displayAddress : '—'}
              </strong>
              {isConnected && (
                <button
                  type="button"
                  onClick={handleCopyAddress}
                  className="p-1 rounded text-text-muted hover:text-text-primary cursor-pointer shrink-0"
                  title="Copy address"
                >
                  {copiedAddress ? <Check className="w-3.5 h-3.5 text-primary-container" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-base border border-white/5">
            <span className="text-text-muted text-[10.5px] uppercase font-mono block">Total Net Worth</span>
            <strong className="block mt-1 font-mono text-primary-container text-sm sm:text-base font-bold">
              ${totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </strong>
          </div>
        </div>

        {/* Portfolio List (#aurelis-wallet-portfolio-list) */}
        <div id="aurelis-wallet-portfolio-list" className="aurelis-wallet-portfolio-list overflow-x-auto">
          {!isConnected ? (
            <div className="aurelis-wallet-portfolio-state p-6 rounded-xl bg-surface-base/50 border border-white/5 text-center text-text-muted font-sans text-xs">
              <p>Loading wallet balances… Connect your wallet above to sync real-time portfolio holdings.</p>
            </div>
          ) : (
            <table className="w-full text-left text-[11px] border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-text-muted text-[9.5px] uppercase">
                  <th className="py-2.5 px-3">Asset</th>
                  <th className="py-2.5 px-3">Network</th>
                  <th className="py-2.5 px-3">Balance</th>
                  <th className="py-2.5 px-3">Spot Price</th>
                  <th className="py-2.5 px-3 text-right">Value (USD)</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {portfolioTokens.map((item) => (
                  <tr
                    key={`${item.walletProfileId || 'wallet'}-${item.network}-${item.symbol}-${item.accountAddress || item.assetId}`}
                    onClick={() => {
                      const matchCoin = coins.find((c) => c.symbol.toUpperCase() === item.symbol.toUpperCase());
                      if (matchCoin && onOpenAsset) {
                        onOpenAsset(matchCoin, {
                          symbol: item.symbol,
                          name: item.name,
                          amount: item.amount,
                          chain: item.network,
                          price: item.price,
                          change24h: item.change24h,
                          accountAddress: item.accountAddress,
                          walletName: item.walletName,
                          walletProfileId: item.walletProfileId,
                          walletCanSign: item.walletCanSign,
                        });
                      }
                    }}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <td className="py-2.5 px-3 font-bold text-text-primary whitespace-nowrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <CoinIcon
                          symbol={item.symbol}
                          name={item.name}
                          color={item.color}
                          className="w-6 h-6 rounded-full shrink-0"
                        />
                        <div className="min-w-0">
                          <span className="block truncate">{item.symbol.toUpperCase() === 'ETH' ? `${String(item.network || '').charAt(0).toUpperCase()}${String(item.network || '').slice(1)} ETH` : item.symbol}</span>
                          <span className="text-[9.5px] text-text-muted block font-normal truncate">{item.walletName ? `${item.walletName} • ${item.name}` : item.name}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-[10.5px] text-text-secondary whitespace-nowrap capitalize">
                      <span className="px-2 py-0.5 rounded bg-surface-base border border-white/10">
                        {item.network}
                      </span>
                      {item.walletName && (
                        <span className="ml-1 px-2 py-0.5 rounded bg-amber-300/10 border border-amber-300/20 text-amber-200 normal-case">
                          {item.walletName}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-text-primary whitespace-nowrap">
                      {item.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} {item.symbol}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-text-secondary whitespace-nowrap">
                      ${item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-primary-container text-right whitespace-nowrap">
                      ${item.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          if (soundEnabled) playHudSound('trade');
                          const matchCoin = coins.find((c) => c.symbol.toUpperCase() === item.symbol.toUpperCase());
                          try {
                            const target = {
                              walletName: item.walletName || 'Connected Wallet',
                              walletProfileId: item.walletProfileId || '',
                              address: item.accountAddress || '',
                              symbol: item.symbol,
                              chain: item.network,
                              canSign: Boolean(item.walletCanSign),
                              updatedAt: Date.now(),
                            };
                            localStorage.setItem('aurelis_trade_wallet_target', JSON.stringify(target));
                            if (item.walletProfileId) localStorage.setItem('aurelis_active_wallet_profile', item.walletProfileId);
                            if (item.walletCanSign && /^0x[a-fA-F0-9]{40}$/.test(item.accountAddress || '')) {
                              localStorage.setItem('aurelis_wallet_address', item.accountAddress || '');
                              localStorage.setItem('aurelis_wallet_provider', item.walletName || 'external');
                              localStorage.setItem('aurelis_wallet_connected', 'true');
                            }
                          } catch {}
                          if (!item.walletCanSign && !/^evm|ethereum|base|arbitrum|optimism|bsc|polygon|avalanche/i.test(String(item.network || ''))) {
                            setArcNotice(`${item.walletName || 'This wallet'} ${item.symbol} is watch-only right now. Buy/receive routing can use this address; sell/swap needs chain-specific signing.`);
                          }
                          if (onOpenTrade) onOpenTrade(matchCoin);
                        }}
                        className="px-2.5 py-1 rounded bg-primary-container/15 hover:bg-primary-container/25 border border-primary-container/30 text-primary-container text-[10px] font-bold cursor-pointer transition-colors"
                      >
                        Trade
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. SECTION: WALLET AUTH CARD (#wallet-auth-card) */}
      {/* ========================================================================= */}
      <section
        id="wallet-auth-card"
        className="relative rounded-3xl bg-surface-panel p-5 sm:p-7 md:p-8 overflow-hidden shadow-2xl border border-white/10"
      >
        {/* Ambient Backing Glows matching exact requested markup */}
        <div className="absolute -top-40 right-10 w-[540px] h-[540px] bg-primary-container/15 rounded-full blur-[110px] pointer-events-none" />
        <div className="absolute -bottom-36 left-20 w-[420px] h-[420px] bg-cyan-500/10 rounded-full blur-[90px] pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Column (7 cols): Connection Status & Connect Buttons */}
          <div className="lg:col-span-7 flex flex-col justify-between gap-6">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] text-text-muted tracking-widest uppercase bg-surface-base px-2.5 py-1 rounded-full border border-white/5 font-bold">
                  Wallet Connections
                </span>
                <span
                  id="wallet-auth-badge"
                  className={`font-mono text-[10px] px-2.5 py-1 rounded-full font-bold uppercase transition-all ${
                    isConnected
                      ? 'bg-primary-container/20 border border-primary-container/40 text-primary-container shadow-[0_0_8px_rgba(0,245,160,0.3)]'
                      : 'bg-primary-container/10 border border-primary-container/20 text-primary-container'
                  }`}
                >
                  {isConnected ? 'VERIFIED' : 'STARTING'}
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <h2
                  id="wallet-auth-title"
                  className="font-headline text-2xl sm:text-3xl text-text-primary leading-tight tracking-tight font-bold"
                >
                  {isConnected ? 'Wallet ownership verified' : 'Preparing secure wallet sign-in'}
                </h2>

                <p
                  id="wallet-auth-copy"
                  className="font-sans text-xs sm:text-sm text-text-secondary max-w-2xl leading-relaxed"
                >
                  {isConnected
                    ? 'AURELIS Web verified the wallet signature. No transaction permission was granted.'
                    : 'AURELIS is checking this browser session.'}
                </p>

                <p
                  id="wallet-auth-detail"
                  className="font-mono text-xs sm:text-[13px] text-primary-container min-h-[20px] flex items-center gap-2"
                >
                  {isConnected ? (
                    <>
                      <span className="font-bold">{shortAddress}</span>
                      <span className="text-text-muted">•</span>
                      <span>Verified Session via EIP-4361 (SIWE)</span>
                      <button
                        type="button"
                        onClick={handleCopyAddress}
                        className="p-1 rounded hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors cursor-pointer ml-1"
                        title="Copy full address"
                      >
                        {copiedAddress ? (
                          <Check className="w-3.5 h-3.5 text-primary-container" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </>
                  ) : (
                    <span className="text-text-muted font-sans text-xs">
                      Ready to pair with phone-approved wallet.
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Web wallet connection */}
            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              {!isConnected ? (
                <button
                  id="walletconnect-button"
                  type="button"
                  onClick={handleOpenWalletConnect}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-3 rounded-full bg-primary-container text-on-primary-container font-mono text-xs sm:text-[13px] font-bold hover:brightness-110 transition-all cursor-pointer"
                >
                  <QrCode className="w-4 h-4" />
                  <span>Connect Wallet</span>
                </button>
              ) : (
                <button
                  id="wallet-disconnect-button"
                  type="button"
                  onClick={handleDisconnectWallet}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-3 rounded-xl bg-surface-base border border-white/10 text-text-muted hover:border-status-error/40 hover:text-status-error font-mono text-xs font-semibold transition-all cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Disconnect</span>
                </button>
              )}
            </div>
          </div>

          <div className="lg:col-span-5 rounded-2xl bg-surface-base/80 border border-white/10 p-5 flex flex-col justify-between gap-4">
            <div>
              <span className="font-mono text-[10px] text-text-muted uppercase tracking-widest font-bold">Web wallet access</span>
              <h3 className="font-headline text-base sm:text-lg font-bold text-text-primary mt-1">WalletConnect session</h3>
            </div>
            <div className="text-[11px] text-text-muted leading-relaxed font-sans space-y-2">
              <p>Connect a wallet, approve the pairing request, then sign the AURELIS login message.</p>
              <p>The login proves wallet ownership. It does not move funds or approve a trade.</p>
            </div>
            <div className="mt-auto pt-3 border-t border-white/5 flex items-center gap-2 text-text-secondary text-[11px]">
              <Lock className="w-4 h-4 text-primary-container shrink-0" />
              <span>Wallet actions still require their own approval.</span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. MODALS: RECEIVE & SEND */}
      {/* ========================================================================= */}
      {showReceiveModal && createPortal(
        <div className="fixed inset-0 z-[10040] bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-surface-panel border border-white/15 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="font-headline font-bold text-base text-text-primary">Receive Assets</h3>
              <button
                type="button"
                onClick={() => setShowReceiveModal(false)}
                className="text-text-muted hover:text-text-primary cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative">
              <label className="text-[11px] text-text-muted font-mono block mb-1">Asset / Network</label>
              <button
                type="button"
                onClick={() => setReceivePickerOpen((open) => !open)}
                className="w-full bg-surface-base px-3 py-2.5 rounded-xl border border-white/10 text-text-primary font-mono text-xs flex items-center justify-between gap-3"
              >
                <span className="truncate text-left">
                  {receiveOptions.find((item) => item.key === receiveNetwork)?.label || 'Select network'}
                </span>
                <ChevronDown className={`w-4 h-4 text-text-muted shrink-0 transition-transform ${receivePickerOpen ? 'rotate-180' : ''}`} />
              </button>
              {receivePickerOpen && (
                <div className="absolute left-0 right-0 mt-1.5 z-[10060] max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-[#090d12] shadow-[0_18px_45px_rgba(0,0,0,0.85)] p-1.5">
                  {receiveOptions.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setReceiveNetwork(item.key);
                        setCopiedAddress(false);
                        setReceivePickerOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left font-mono text-[11px] ${item.key === receiveNetwork ? 'bg-primary-container/10 text-primary-container' : 'text-text-primary hover:bg-white/5'}`}
                    >
                      <span>{item.label}</span>
                      <span className="text-[9px] text-text-muted">{item.key}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col items-center gap-3 py-2">
              {selectedReceiveAddress ? (
                <div className="p-3 bg-white rounded-xl shadow-inner">
                  <QRCodeSVG value={selectedReceiveAddress} size={144} level="M" />
                </div>
              ) : (
                <div className="w-36 h-36 rounded-xl bg-surface-base border border-white/10 flex items-center justify-center text-text-muted text-center p-3">
                  Wallet address unavailable
                </div>
              )}

              <div className="w-full">
                <div className="text-[10px] uppercase tracking-wide text-primary-container font-mono mb-1">
                  {receiveOptions.find((item) => item.key === receiveNetwork)?.label || receiveNetwork}
                </div>
                <p className="font-mono text-xs text-center text-text-secondary break-all bg-surface-base p-2.5 rounded-lg border border-white/5 w-full">
                  {selectedReceiveAddress || 'Address unavailable'}
                </p>
              </div>

              {receiveAddressError && (
                <p className="text-[10px] text-red-400 font-mono text-center">{receiveAddressError}</p>
              )}

              <button
                type="button"
                onClick={handleCopyAddress}
                disabled={!selectedReceiveAddress}
                className="w-full py-2.5 rounded-xl bg-primary-container text-on-primary-container font-mono font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {copiedAddress ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedAddress ? 'Address Copied!' : 'Copy Address'}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {showSendModal && createPortal(
        <div className="fixed inset-0 z-[10040] bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-surface-panel border border-white/15 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="font-headline font-bold text-base text-text-primary">Send Crypto</h3>
              <button
                type="button"
                onClick={() => {
                  setShowSendModal(false);
                  setSendSuccess(false);
                }}
                className="text-text-muted hover:text-text-primary cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {sendSuccess ? (
              <div className="py-6 flex flex-col items-center gap-2 text-center">
                <CheckCircle2 className="w-10 h-10 text-primary-container" />
                <strong className="text-sm font-bold text-text-primary">Transfer Dispatched</strong>
                <p className="text-xs text-text-secondary">
                  Sent {sendAmount} {sendCoinSymbol} to recipient.
                </p>
                {sendTxHash && (
                  <p className="text-[10px] text-primary-container break-all font-mono">
                    Tx: {sendTxHash}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3 font-sans">
              {isOneKeyHost && (
                <div className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-[10px] text-amber-100 font-mono leading-relaxed">
                  Send is disabled in the OneKey-hosted shell for now. Use OneKey native Send until AURELIS is wired into OneKey signing.
                </div>
              )}
                <div className="relative">
                  <label className="text-[11px] text-text-muted font-mono block mb-1">Asset</label>
                  <button
                    type="button"
                    disabled={!sendAssetOptions.length}
                    onClick={() => setSendPickerOpen((open) => !open)}
                    className="w-full bg-surface-base px-3 py-2.5 rounded-xl border border-white/10 text-text-primary font-mono text-xs flex items-center justify-between gap-3 disabled:opacity-50"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {selectedSendAsset && <CoinIcon symbol={selectedSendAsset.symbol} className="w-5 h-5 shrink-0" />}
                      <span className="truncate text-left">
                        {selectedSendAsset ? `${selectedSendAsset.symbol} · ${selectedSendAsset.network}` : 'No wallet assets available'}
                      </span>
                    </span>
                    <ChevronDown className={`w-4 h-4 text-text-muted shrink-0 transition-transform ${sendPickerOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {sendPickerOpen && (
                    <div className="absolute left-0 right-0 mt-1.5 z-[10060] max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-[#090d12] shadow-[0_18px_45px_rgba(0,0,0,0.85)] p-1.5">
                      {sendAssetOptions.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => {
                            setSendAssetKey(item.key);
                            setSendPickerOpen(false);
                          }}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left font-mono ${item.key === selectedSendAsset?.key ? 'bg-primary-container/10 text-primary-container' : 'text-text-primary hover:bg-white/5'}`}
                        >
                          <CoinIcon symbol={item.symbol} className="w-6 h-6 shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[11px] font-bold truncate">{item.symbol}</span>
                            <span className="block text-[9px] text-text-muted truncate">{item.network}</span>
                          </span>
                          <span className="text-[10px] text-text-secondary tabular-nums">
                            {item.amount.toLocaleString(undefined, { maximumFractionDigits: 8 })}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedSendAsset && (
                  <div className="flex items-center justify-between text-[10px] font-mono px-1 -mt-1">
                    <span className="text-text-muted">Available</span>
                    <span className="text-text-secondary">
                      {selectedSendAsset.amount.toLocaleString(undefined, { maximumFractionDigits: 8 })} {selectedSendAsset.symbol}
                    </span>
                  </div>
                )}
                <div>
                  <label className="text-[11px] text-text-muted font-mono block mb-1">Recipient Address</label>
                  <input
                    type="text"
                    placeholder="0x... or ENS domain"
                    value={sendRecipient}
                    onChange={(e) => setSendRecipient(e.target.value)}
                    className="w-full bg-surface-base px-3 py-2 rounded-xl border border-white/10 text-text-primary font-mono text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-text-muted font-mono block mb-1">Amount</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={sendAmount}
                    onChange={(e) => setSendAmount(e.target.value)}
                    className="w-full bg-surface-base px-3 py-2 rounded-xl border border-white/10 text-text-primary font-mono text-xs outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (soundEnabled) playHudSound('trade');
                    if (!selectedSendAsset || isSendingWebTx) return;

                    const nativeBridge = (window as any).AurelisNative;
                    if (nativeBridge && typeof nativeBridge.openNativeScreen === 'function' && selectedSendAsset.assetId) {
                      nativeBridge.openNativeScreen(
                        'send-prefill:' + JSON.stringify({
                          assetId: selectedSendAsset.assetId,
                          recipient: sendRecipient,
                          amount: sendAmount,
                        }),
                      );
                      setArcNotice('AURELIS Send opened with the asset, recipient, and amount prefilled.');
                      return;
                    }

                    setIsSendingWebTx(true);
                    setSendError(null);
                    try {
                      const sent = await sendWalletConnectAssetTransfer({
                        network: selectedSendAsset.network,
                        assetId: selectedSendAsset.assetId || selectedSendAsset.tokenAddress,
                        symbol: selectedSendAsset.symbol,
                        recipient: sendRecipient,
                        amount: sendAmount,
                      });
                      setSendTxHash(sent.txHash);
                      setSendSuccess(true);
                      setArcNotice('Transaction broadcast. Waiting for the network to update the wallet balance.');
                      window.dispatchEvent(new CustomEvent('aurelis:wallet-refresh'));
                    } catch (error: any) {
                      const message = error?.message || 'Transaction was not broadcast.';
                      setSendError(message);
                      if (/No connected wallet session/i.test(message)) {
                        setArcNotice('Wallet connection needs this network. Reconnect it, then submit this transfer again.');
                        setShowWalletConnectModal(true);
                      }
                    } finally {
                      setIsSendingWebTx(false);
                    }
                  }}
                  disabled={isOneKeyHost || !sendRecipient || !sendAmount || isSendingWebTx}
                  className="w-full mt-2 py-2.5 rounded-xl bg-primary-container text-on-primary-container font-mono font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-95"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>{isOneKeyHost ? 'Use OneKey Send For Now' : isSendingWebTx ? 'Waiting for Wallet Approval…' : 'Approve & Send'}</span>
                </button>
                {sendError && (
                  <div className="text-[10px] text-status-error px-1">{sendError}</div>
                )}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}


      {/* Wallet selector */}
      {showWalletPicker && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowWalletPicker(false);
          }}
        >
          <div className="w-full max-w-sm bg-surface-panel border border-white/15 rounded-2xl shadow-2xl p-5 space-y-4 font-mono">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h3 className="font-headline font-bold text-sm text-text-primary">Connect Wallet</h3>
                <p className="text-[10px] text-text-muted mt-1">Choose the phone wallet AURELIS should pair with</p>
              </div>
              <button type="button" onClick={() => setShowWalletPicker(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-text-muted hover:text-text-primary">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {EXTERNAL_WALLET_OPTIONS.map((wallet) => (
                <button
                  key={wallet.id}
                  type="button"
                  onClick={() => handleSelectExternalWallet(wallet)}
                  className="w-full flex items-center gap-3 rounded-xl border border-white/10 bg-surface-base px-3 py-3 text-left hover:bg-white/5 hover:border-white/20 transition-colors"
                >
                  <span className="w-9 h-9 shrink-0 rounded-lg bg-white/95 border border-white/10 flex items-center justify-center overflow-hidden">
                    <img src={wallet.logo} alt="" className="w-6 h-6 object-contain" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block text-[12px] text-text-primary font-bold">{wallet.name}</strong>
                    <span className="block text-[10px] text-text-muted mt-0.5 truncate">{wallet.hint}</span>
                  </span>
                  <ChevronDown className="w-4 h-4 text-text-muted -rotate-90" />
                </button>
              ))}
            </div>

            <p className="text-[9px] text-text-muted text-center leading-relaxed">
              Private keys remain in your wallet. AURELIS only requests a connection and signature approval.
            </p>
          </div>
        </div>
      )}

      {/* WalletConnect pairing */}
      {showWalletConnectModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowWalletConnectModal(false);
          }}
        >
          <div className="w-full max-w-sm bg-surface-panel border border-white/15 rounded-2xl shadow-2xl p-5 space-y-4 font-mono">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h3 className="font-headline font-bold text-sm text-text-primary">Connect Wallet</h3>
                <p className="text-[10px] text-text-muted mt-1">{walletConnectBrand.name} · WalletConnect</p>
              </div>
              <button
                type="button"
                onClick={() => setShowWalletConnectModal(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-text-muted hover:text-text-primary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 self-stretch rounded-xl border border-white/10 bg-surface-base px-3 py-2">
                <span className="w-7 h-7 rounded-lg bg-white flex items-center justify-center overflow-hidden">
                  <img src={walletConnectBrand.logo} alt="" className="w-5 h-5 object-contain" />
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-text-primary">{walletConnectBrand.name}</div>
                  <div className="text-[9px] text-text-muted truncate">{walletConnectBrand.hint}</div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white text-black shadow-inner">
                {wcSession.uri ? (
                  <QRCodeSVG value={wcSession.uri} size={180} level="M" />
                ) : (
                  <div className="w-[180px] h-[180px] flex items-center justify-center text-neutral-500 text-[11px] text-center px-4">
                    {wcPairingStatus === 'error' ? 'Unable to create pairing' : 'Creating secure pairing…'}
                  </div>
                )}
              </div>

              {walletConnectBrand.id === 'onekey' && wcSession.uri && (
                <a
                  href={oneKeyMobileConnectUrl}
                  className="w-full py-2.5 rounded-xl bg-primary-container text-on-primary-container font-mono font-bold text-xs flex items-center justify-center gap-1.5 hover:opacity-95"
                >
                  Open in OneKey Phone
                </a>
              )}

              {wcPairingError && (
                <div className="w-full text-[10px] text-status-error bg-status-error/10 border border-status-error/20 rounded-lg p-2.5 text-center space-y-2">
                  <div>{wcPairingError}</div>
                  <button
                    type="button"
                    onClick={retryWalletConnectPairing}
                    className="px-3 py-1.5 rounded-lg bg-surface-base border border-white/10 text-text-primary font-bold"
                  >
                    Retry pairing
                  </button>
                </div>
              )}

              {wcSession.uri && (
                <div className="w-full flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={wcSession.uri}
                    className="flex-1 min-w-0 bg-surface-base px-2.5 py-2 rounded-lg border border-white/10 text-[10px] text-text-muted truncate outline-none select-all"
                  />
                  <button
                    type="button"
                    onClick={handleCopyWcUri}
                    className="px-3 py-2 rounded-lg bg-surface-base border border-white/10 text-[11px] text-text-primary flex items-center gap-1.5 shrink-0"
                  >
                    {copiedWcUri ? <Check className="w-3.5 h-3.5 text-primary-container" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedWcUri ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              )}

              <p className="text-[10px] text-text-muted text-center leading-relaxed">
                Scan this QR in {walletConnectBrand.name}, then approve the AURELIS login message on your phone.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

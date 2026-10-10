import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Landmark,
  ShieldCheck,
  ShieldAlert,
  TrendingUp,
  Percent,
  CheckCircle2,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  ChevronDown,
  Layers,
  Sparkles,
  ExternalLink,
  Info,
  Clock,
  Zap,
  Wallet,
  Check,
  Download,
  Share2,
} from 'lucide-react';
import { CoinData, NavigationTab } from '../types';
import { playHudSound, formatCurrency } from '../services/marketData';
import { CoinIcon } from './CoinIcon';
import { ExportBorrowModal } from './ExportBorrowModal';
import { openOneKeyAction } from './OneKeyActionRouter';

interface EarnBorrowScreenProps {
  soundEnabled: boolean;
  coins?: CoinData[];
  isWalletConnected?: boolean;
  walletAddress?: string;
  onConnectWallet?: () => void;
  onNavigate?: (tab: NavigationTab) => void;
  isStandalone?: boolean;
}

interface BorrowRoute {
  id: string;
  provider: 'Aave v3' | 'Aave v4' | 'Morpho Blue';
  network: string;
  collateral: string;
  borrow: string;
  borrowApy: number;
  maxLtv: number;
  liquidationThreshold: number;
  termFees: string;
  collateralHandling: string;
  collateralPrice?: number;
}

interface ActiveLoan {
  id: string;
  provider: string;
  network: string;
  collateralAsset: string;
  collateralAmount: number;
  debtAsset: string;
  debtAmount: number;
  apr: number;
}

export const EarnBorrowScreen: React.FC<EarnBorrowScreenProps> = ({
  soundEnabled,
  coins = [],
  isWalletConnected = false,
  walletAddress = '',
  onConnectWallet,
  onNavigate,
}) => {
  // Collateral Form State
  const [collateralSearch, setCollateralSearch] = useState('ETH');
  const [collateralAmount, setCollateralAmount] = useState('1.5');
  const [receiveAsset, setReceiveAsset] = useState('USDC');
  const [loanDays, setLoanDays] = useState('90');

  // Filter State
  const [providerFilter, setProviderFilter] = useState<'All' | 'Aave' | 'Morpho'>('All');
  const [networkFilter, setNetworkFilter] = useState<'All' | 'Ethereum' | 'Arbitrum' | 'Base'>('All');

  // Live Aave/Morpho route state
  const [borrowRoutes, setBorrowRoutes] = useState<BorrowRoute[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<BorrowRoute | null>(null);
  const [borrowLoading, setBorrowLoading] = useState(false);
  const [borrowError, setBorrowError] = useState<string | null>(null);
  const [previewApproved, setPreviewApproved] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [repayAmount, setRepayAmount] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeLoans, setActiveLoans] = useState<ActiveLoan[]>([]);

  const loadBorrowRoutes = useCallback(async () => {
    setBorrowLoading(true);
    setBorrowError(null);
    try {
      const collateralInput = collateralSearch.trim().toUpperCase();
      const borrowInput = receiveAsset.trim().toUpperCase();
      const collateralAliases = collateralInput === 'BTC'
        ? new Set(['BTC', 'WBTC', 'CBBTC'])
        : collateralInput === 'ETH'
        ? new Set(['ETH', 'WETH'])
        : new Set([collateralInput]);
      const aaveCollateralSymbol = collateralInput === 'BTC' ? 'WBTC' : collateralInput === 'ETH' ? 'WETH' : collateralInput;

      const [catalogRes, collateralDetailRes, borrowDetailRes] = await Promise.all([
        fetch('/api/borrow/catalog', { cache: 'no-store' }),
        fetch('/api/borrow/aave/details?symbol=' + encodeURIComponent(aaveCollateralSymbol), { cache: 'no-store' }),
        fetch('/api/borrow/aave/details?symbol=' + encodeURIComponent(borrowInput), { cache: 'no-store' }),
      ]);
      const [catalog, collateralDetails, borrowDetails] = await Promise.all([
        catalogRes.json(),
        collateralDetailRes.json(),
        borrowDetailRes.json(),
      ]);

      const liveRoutes: BorrowRoute[] = [];
      if (catalogRes.ok && catalog?.ok && Array.isArray(catalog.morpho)) {
        for (const row of catalog.morpho) {
          const collateralSymbol = String(row.collateral || '').toUpperCase();
          const borrowSymbol = String(row.borrow || '').toUpperCase();
          const apy = Number(row.netBorrowApyPct ?? row.borrowApyPct);
          const maxLtv = Number(row.maxLtvPct);
          const liquidation = Number(row.liquidationThresholdPct ?? row.maxLtvPct);
          if (!collateralAliases.has(collateralSymbol) || borrowSymbol !== borrowInput) continue;
          if (![apy, maxLtv, liquidation].every(Number.isFinite) || maxLtv <= 0) continue;
          liveRoutes.push({
            id: 'morpho-' + String(row.marketId || row.chainId || liveRoutes.length),
            provider: 'Morpho Blue',
            network: String(row.network || row.chainId || 'Unknown'),
            collateral: collateralInput,
            borrow: borrowInput,
            borrowApy: apy,
            maxLtv,
            liquidationThreshold: liquidation,
            termFees: 'Variable · Morpho Blue market',
            collateralHandling: 'Isolated non-custodial market',
            collateralPrice: Number(row.collateralPriceUsd || 0),
          });
        }
      }

      if (collateralDetailRes.ok && borrowDetailRes.ok && Array.isArray(collateralDetails?.details) && Array.isArray(borrowDetails?.details)) {
        const borrowByMarket = new Map<string, any>();
        for (const item of borrowDetails.details) {
          const key = String(item.marketKey || item.market || '') + ':' + String(item.chainId || '');
          borrowByMarket.set(key, item);
        }
        const networkNames: Record<number, string> = {
          1: 'Ethereum', 10: 'Optimism', 137: 'Polygon', 8453: 'Base', 42161: 'Arbitrum', 43114: 'Avalanche', 534352: 'Scroll', 59144: 'Linea', 324: 'zkSync Era',
        };
        for (const collateral of collateralDetails.details) {
          const key = String(collateral.marketKey || collateral.market || '') + ':' + String(collateral.chainId || '');
          const debt = borrowByMarket.get(key);
          if (!debt) continue;
          const apy = Number(debt.borrowApyPct);
          const maxLtv = Number(collateral.maxLtvPct);
          const liquidation = Number(collateral.liquidationThresholdPct);
          if (!collateral.canBeCollateral || collateral.isPaused || collateral.isFrozen || debt.isPaused || debt.borrowCapReached) continue;
          if (![apy, maxLtv, liquidation].every(Number.isFinite) || maxLtv <= 0) continue;
          liveRoutes.push({
            id: 'aave-' + key,
            provider: String(collateral.protocolVersion || '').toUpperCase() === 'V4' ? 'Aave v4' : 'Aave v3',
            network: networkNames[Number(collateral.chainId)] || String(collateral.chainId || 'Unknown'),
            collateral: collateralInput,
            borrow: borrowInput,
            borrowApy: apy,
            maxLtv,
            liquidationThreshold: liquidation,
            termFees: 'Variable · Aave market',
            collateralHandling: 'Aave pooled collateral',
            collateralPrice: Number(collateral.priceUsd || 0),
          });
        }
      }

      liveRoutes.sort((a, b) => a.borrowApy - b.borrowApy || b.maxLtv - a.maxLtv);
      const unique = liveRoutes.filter((route, index, rows) => rows.findIndex((r) => r.id === route.id) === index).slice(0, 25);
      setBorrowRoutes(unique);
      setSelectedRoute((current) => current && unique.some((route) => route.id === current.id) ? current : (unique[0] || null));
      if (!unique.length) setBorrowError('No live Aave or Morpho route is available for this collateral / borrow pair.');
    } catch (error: any) {
      setBorrowRoutes([]);
      setSelectedRoute(null);
      setBorrowError(error?.message || 'Borrow markets unavailable');
    } finally {
      setBorrowLoading(false);
    }
  }, [collateralSearch, receiveAsset]);

  useEffect(() => {
    const timer = window.setTimeout(loadBorrowRoutes, 250);
    return () => window.clearTimeout(timer);
  }, [loadBorrowRoutes]);

  useEffect(() => {
    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      setActiveLoans([]);
      return;
    }
    fetch('/api/borrow/positions?address=' + encodeURIComponent(walletAddress), { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (!data?.ok || !Array.isArray(data.positions)) return setActiveLoans([]);
        setActiveLoans(data.positions.map((position: any, index: number) => ({
          id: String(position.marketId || index),
          provider: String(position.provider || 'Morpho'),
          network: String(position.network || position.chainId || 'Unknown'),
          collateralAsset: String(position.collateralAsset || ''),
          collateralAmount: Number(position.collateralAmount || 0),
          debtAsset: String(position.debtAsset || ''),
          debtAmount: Number(position.debtAmount || 0),
          apr: 0,
        })).filter((loan: ActiveLoan) => loan.debtAsset && Number.isFinite(loan.debtAmount) && loan.debtAmount > 0));
      })
      .catch(() => setActiveLoans([]));
  }, [walletAddress]);

  // Collateral Price Lookup
  const collateralPrice = useMemo(() => {
    const sym = collateralSearch.toUpperCase();
    const found = coins.find((c) => c.symbol.toUpperCase() === sym);
    if (found) return found.price;
    if (selectedRoute?.collateralPrice && Number.isFinite(selectedRoute.collateralPrice)) {
      return selectedRoute.collateralPrice;
    }
    return 0;
  }, [coins, collateralSearch, selectedRoute]);

  // Financial Computations
  const numCollateral = parseFloat(collateralAmount) || 0;
  const collateralValue = numCollateral * collateralPrice;
  const activeLtv = selectedRoute ? selectedRoute.maxLtv / 100 : 0.8;
  const maxBorrow = collateralValue * activeLtv;
  const saferBorrow = collateralValue * 0.5; // 50% conservative target
  const borrowApr = selectedRoute ? selectedRoute.borrowApy : 4.5;
  const monthlyInterest = (saferBorrow * (borrowApr / 100)) / 12;
  const liquidationPrice =
    numCollateral > 0 && selectedRoute
      ? saferBorrow / (numCollateral * (selectedRoute.liquidationThreshold / 100))
      : 0;
  const dropToLiquidation =
    collateralPrice > 0 ? ((collateralPrice - liquidationPrice) / collateralPrice) * 100 : 0;

  // Filtered Routes
  const filteredRoutes = useMemo(() => {
    return borrowRoutes.filter((r) => {
      const matchProvider =
        providerFilter === 'All' ||
        (providerFilter === 'Aave' && r.provider.includes('Aave')) ||
        (providerFilter === 'Morpho' && r.provider.includes('Morpho'));

      const matchNetwork = networkFilter === 'All' || r.network === networkFilter;
      return matchProvider && matchNetwork;
    });
  }, [providerFilter, networkFilter, borrowRoutes]);

  const handleSelectPopular = (sym: string) => {
    if (soundEnabled) playHudSound('switch');
    setCollateralSearch(sym);
    const matching = borrowRoutes.find((r) => r.collateral.toUpperCase() === sym.toUpperCase());
    if (matching) setSelectedRoute(matching);
  };

  const handleApproveRoute = () => {
    if (soundEnabled) playHudSound('trade');
    setPreviewApproved(true);
    setToastMessage(`Live route selected. No loan has been submitted yet.`);
    setTimeout(() => {
      setPreviewApproved(false);
      setToastMessage(null);
    }, 4500);
  };

  const handleRepay = () => {
    if (soundEnabled) playHudSound('trade');
    setToastMessage(`Repayment has not been submitted. Native repayment execution is not wired on this screen yet.`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  return (
    <div className="flex flex-col gap-4 p-2 sm:p-4 max-w-[1720px] mx-auto w-full select-none pb-24 text-text-primary text-xs font-mono animate-in fade-in duration-200">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="p-3 bg-primary-container/20 border border-primary-container/40 text-primary-container rounded-xl text-xs font-mono flex items-center gap-2 animate-in slide-in-from-top-2 shadow-lg">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. HERO SECTION: AURELIS DEFI / BORROW */}
      {/* ========================================================================= */}
      <section className="p-3.5 sm:p-5 rounded-xl bg-surface-panel/95 border border-white/10 shadow-lg flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
            <span className="text-[10px] text-primary-container uppercase font-bold tracking-widest">
              AURELIS DEFI
            </span>
          </div>
          <h1 className="text-lg sm:text-2xl font-headline font-bold text-text-primary">
            Borrow
          </h1>
          <p className="text-text-muted text-[11px] font-sans mt-0.5 max-w-2xl">
            Plan a collateral-backed loan before anything is sent to your wallet. Compare live Aave and Morpho market rates with real-time risk simulation.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
          <button type="button" onClick={() => openOneKeyAction('stake')}
            className="rounded-lg border border-primary-container/30 px-2.5 py-2 text-[10px] font-bold text-text-primary hover:bg-primary-container/10">
            Open OneKey for Stake
          </button>
          <button type="button" onClick={() => openOneKeyAction('borrow')}
            className="rounded-lg border border-primary-container/30 px-2.5 py-2 text-[10px] font-bold text-text-primary hover:bg-primary-container/10">
            Open OneKey for Borrow
          </button>
          {/* Export Desk Button */}
          <button
            type="button"
            onClick={() => {
              if (soundEnabled) playHudSound('click');
              setShowExportModal(true);
            }}
            className="p-1.5 px-2.5 rounded-lg bg-primary-container/15 hover:bg-primary-container/25 border border-primary-container/40 text-primary-container text-[10px] font-bold flex items-center gap-1.5 cursor-pointer shadow-[0_0_8px_rgba(0,245,160,0.15)] transition-all h-[38px]"
            title="Export Borrow Desk (Standalone HTML, Embed, or Loan Report)"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export Desk</span>
          </button>

          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-surface-base/90 border border-white/10 shadow-sm text-xs font-mono">
            <span className="relative flex h-2 w-2">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isWalletConnected ? 'bg-primary-container' : 'bg-amber-400'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isWalletConnected ? 'bg-primary-container' : 'bg-amber-400'
                }`}
              />
            </span>
            <div className="flex flex-col text-left">
              <span className="text-[8.5px] uppercase tracking-wider text-text-muted font-bold leading-none mb-0.5">
                SECURITY PROTOCOL
              </span>
              <span
                className={`text-[11px] font-bold flex items-center gap-1 leading-none ${
                  isWalletConnected ? 'text-primary-container' : 'text-amber-300'
                }`}
              >
                {isWalletConnected ? (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5 text-primary-container shrink-0" />
                    <span>Wallet Verified</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Approval Required</span>
                  </>
                )}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. WALLET AUTH CARD */}
      {/* ========================================================================= */}
      <section className="p-3.5 rounded-xl bg-surface-panel/90 border border-white/10 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-surface-base border border-white/10 flex items-center justify-center text-primary-container">
            <Wallet className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[9.5px] font-bold text-primary-container uppercase">
                {isWalletConnected ? 'CONNECTED' : 'WALLET AUTH'}
              </span>
              <strong className="text-xs text-text-primary">
                {isWalletConnected ? 'Aurelis Verified Wallet' : 'Connect AURELIS Wallet'}
              </strong>
            </div>
            <p className="text-[10.5px] text-text-muted font-sans mt-0.5">
              {isWalletConnected
                ? `${walletAddress ? walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4) : 'AURELIS Wallet'} (native wallet)`
                : 'Connect a wallet to view supported holdings and positions. This screen only previews borrowing routes; it does not execute loans.'}
            </p>
          </div>
        </div>

        <div>
          {!isWalletConnected ? (
            <button
              type="button"
              onClick={() => {
                if (soundEnabled) playHudSound('click');
                if (onConnectWallet) onConnectWallet();
              }}
              className="px-4 py-2 rounded-xl bg-primary-container text-on-primary-container font-mono font-bold text-xs shadow-[0_0_12px_rgba(0,245,160,0.3)] hover:opacity-95 cursor-pointer whitespace-nowrap"
            >
              Connect AURELIS Wallet
            </button>
          ) : (
            <span className="px-3 py-1.5 rounded-lg bg-status-success/20 text-status-success text-[10px] font-bold flex items-center gap-1 border border-status-success/30">
              <Check className="w-3.5 h-3.5" />
              <span>Synced & Ready</span>
            </span>
          )}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. TWO-COLUMN GRID: FIND YOUR LOAN OPTIONS & YOUR LOAN RISK DASHBOARD */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* LEFT: FIND YOUR LOAN OPTIONS (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-3.5">
          <div className="p-3.5 sm:p-4 rounded-xl bg-surface-panel/95 border border-white/10 shadow-lg space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div>
                <h2 className="font-headline font-bold text-sm text-text-primary">
                  Find Your Loan Options
                </h2>
                <p className="text-[10.5px] text-text-muted font-sans">
                  Enter the crypto you already own. Compare live Aave and Morpho market rates.
                </p>
              </div>
              <span className="px-2 py-0.5 rounded bg-surface-base text-cyan-400 text-[9px] font-bold border border-white/5">
                Live Market Search
              </span>
            </div>

            {/* Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Your Collateral */}
              <div className="p-2.5 rounded-lg bg-surface-base border border-white/10 flex flex-col justify-between">
                <span className="text-[9px] text-text-muted uppercase mb-1">YOUR COLLATERAL</span>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-primary-container/20 flex items-center justify-center text-primary-container font-bold text-[9px]">
                    {collateralSearch.slice(0, 3)}
                  </div>
                  <input
                    type="text"
                    value={collateralSearch}
                    onChange={(e) => setCollateralSearch(e.target.value)}
                    placeholder="BTC, ETH, SOL…"
                    className="w-full bg-transparent text-text-primary font-bold text-xs outline-none"
                  />
                </div>
                <span className="text-[9px] text-text-muted mt-1">
                  ${collateralPrice.toLocaleString()} / unit
                </span>
              </div>

              {/* Amount */}
              <div className="p-2.5 rounded-lg bg-surface-base border border-white/10 flex flex-col justify-between">
                <span className="text-[9px] text-text-muted uppercase mb-1">AMOUNT (COLLATERAL)</span>
                <div className="flex items-center justify-between">
                  <input
                    type="number"
                    value={collateralAmount}
                    onChange={(e) => setCollateralAmount(e.target.value)}
                    className="w-full bg-transparent text-text-primary font-bold text-xs outline-none"
                    placeholder="1.0"
                  />
                  <span className="text-[10px] text-text-muted">{collateralSearch.toUpperCase()}</span>
                </div>
                <span className="text-[9px] text-primary-container font-bold mt-1">
                  ≈ ${formatCurrency(collateralValue)}
                </span>
              </div>

              {/* Receive Asset */}
              <div className="p-2.5 rounded-lg bg-surface-base border border-white/10 flex flex-col justify-between">
                <span className="text-[9px] text-text-muted uppercase mb-1">RECEIVE (BORROW)</span>
                <div className="flex items-center gap-2">
                  <select
                    value={receiveAsset}
                    onChange={(e) => setReceiveAsset(e.target.value)}
                    className="w-full bg-transparent text-text-primary font-bold text-xs outline-none cursor-pointer"
                  >
                    <option value="USDC" className="bg-surface-base">USDC (USD Coin)</option>
                    <option value="USDT" className="bg-surface-base">USDT (Tether)</option>
                    <option value="DAI" className="bg-surface-base">DAI (MakerDAO)</option>
                    <option value="ETH" className="bg-surface-base">ETH (Ethereum)</option>
                  </select>
                </div>
                <span className="text-[9px] text-text-muted mt-1">Stables or Crypto</span>
              </div>
            </div>

            {/* Popular Collateral Chips */}
            <div className="flex items-center gap-1.5 pt-1 overflow-x-auto no-scrollbar">
              <span className="text-[9.5px] text-text-muted uppercase shrink-0">Popular:</span>
              {['BTC', 'ETH', 'SOL', 'HYPE', 'stETH', 'AVAX'].map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => handleSelectPopular(sym)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                    collateralSearch.toUpperCase() === sym
                      ? 'bg-primary-container text-on-primary-container shadow-[0_0_8px_rgba(0,245,160,0.3)]'
                      : 'bg-surface-base border border-white/5 text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {sym}
                </button>
              ))}
            </div>

            {/* Explainer Note */}
            <div className="p-2.5 rounded-lg bg-surface-base/80 border border-white/5 text-[11px] font-sans text-text-secondary leading-relaxed">
              <span className="text-primary-container font-mono font-bold block mb-0.5">
                Aurelis DeFi Intelligence:
              </span>
              Enter the crypto you want to use as collateral. AURELIS automatically queries live Aave v3 pools and Morpho Blue isolated vaults to find the highest LTV and lowest borrowing interest rate.
            </div>
          </div>
        </div>

        {/* RIGHT: YOUR LOAN RISK & MATH (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-3.5">
          <div className="p-3.5 sm:p-4 rounded-xl bg-surface-panel/95 border border-white/10 shadow-lg space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <h2 className="font-headline font-bold text-sm text-text-primary">Your Loan</h2>
              <span className="px-2 py-0.5 rounded bg-primary-container/20 text-primary-container text-[9.5px] font-bold border border-primary-container/30">
                {collateralValue > 0 ? 'HEALTHY' : 'WAIT'}
              </span>
            </div>

            {/* 6-Grid Risk & Financial Matrix */}
            <div className="grid grid-cols-2 gap-2 text-[10.5px]">
              <div className="p-2.5 rounded-lg bg-surface-base border border-white/5">
                <span className="text-[9px] text-text-muted block">COLLATERAL VALUE</span>
                <strong className="text-xs font-bold text-text-primary font-mono">
                  ${collateralValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </div>

              <div className="p-2.5 rounded-lg bg-surface-base border border-white/5">
                <span className="text-[9px] text-text-muted block">YOU CAN BORROW UP TO</span>
                <strong className="text-xs font-bold text-primary-container font-mono">
                  ${maxBorrow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </div>

              <div className="p-2.5 rounded-lg bg-surface-base border border-white/5">
                <span className="text-[9px] text-text-muted block">BORROW RATE</span>
                <strong className="text-xs font-bold text-cyan-400 font-mono">
                  {borrowApr.toFixed(2)}% APY
                </strong>
              </div>

              <div className="p-2.5 rounded-lg bg-surface-base border border-white/5">
                <span className="text-[9px] text-text-muted block">EST. INTEREST / MONTH</span>
                <strong className="text-xs font-bold text-amber-400 font-mono">
                  ${monthlyInterest.toFixed(2)} / mo
                </strong>
              </div>

              <div className="p-2.5 rounded-lg bg-surface-base border border-white/5">
                <span className="text-[9px] text-text-muted block">SAFER PAYMENT TARGET</span>
                <strong className="text-xs font-bold text-oracle-synced font-mono">
                  ${saferBorrow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </div>

              <div className="p-2.5 rounded-lg bg-surface-base border border-white/5">
                <span className="text-[9px] text-text-muted block">LIQUIDATION LEVEL</span>
                <strong className="text-xs font-bold text-status-error font-mono">
                  ${liquidationPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (-{dropToLiquidation.toFixed(1)}%)
                </strong>
              </div>
            </div>

            {/* Quick Health Meter */}
            <div className="p-2 rounded-lg bg-surface-base border border-white/5 space-y-1">
              <div className="flex justify-between text-[9px] text-text-muted">
                <span>Health Factor Target</span>
                <span className="font-bold text-status-success">2.14 (Safe)</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden flex">
                <div className="h-full bg-status-success" style={{ width: '70%' }} />
                <div className="h-full bg-amber-400" style={{ width: '15%' }} />
                <div className="h-full bg-status-error" style={{ width: '15%' }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. YOUR OPTIONS (Live Aave & Morpho Market Table) */}
      {/* ========================================================================= */}
      <section className="p-3.5 sm:p-4 rounded-xl bg-surface-panel/95 border border-white/10 shadow-lg space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-white/5">
          <div>
            <h2 className="font-headline font-bold text-sm text-text-primary">
              Your Options
            </h2>
            <p className="text-[10.5px] text-text-muted font-sans">
              Live variable-rate markets. Projected interest assumes today’s rate stays constant; fees and final repayment require a provider quote.
            </p>
          </div>

          {/* Provider Filter Bar */}
          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            {(['All', 'Aave', 'Morpho'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => {
                  if (soundEnabled) playHudSound('switch');
                  setProviderFilter(filter);
                }}
                className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                  providerFilter === filter
                    ? 'bg-primary-container text-on-primary-container shadow-[0_0_8px_rgba(0,245,160,0.3)]'
                    : 'bg-surface-base border border-white/5 text-text-muted hover:text-text-primary'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {/* Market Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-text-muted text-[9.5px] uppercase">
                <th className="py-2 px-2.5">Provider</th>
                <th className="py-2 px-2.5">Route</th>
                <th className="py-2 px-2.5">Borrow APY</th>
                <th className="py-2 px-2.5">Borrow Up To</th>
                <th className="py-2 px-2.5">Monthly Cost</th>
                <th className="py-2 px-2.5">Term / Fees</th>
                <th className="py-2 px-2.5">Collateral Handling</th>
                <th className="py-2 px-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRoutes.map((route) => {
                const routeMax = collateralValue * (route.maxLtv / 100);
                const isSelected = selectedRoute?.id === route.id;

                return (
                  <tr
                    key={route.id}
                    onClick={() => {
                      if (soundEnabled) playHudSound('switch');
                      setSelectedRoute(route);
                    }}
                    className={`border-b border-white/5 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-primary-container/10 border-primary-container/30'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    {/* Provider */}
                    <td className="py-2.5 px-2.5 font-bold text-text-primary whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-primary-container" />
                        <span>{route.provider}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-text-muted font-normal">
                          {route.network}
                        </span>
                      </div>
                    </td>

                    {/* Route */}
                    <td className="py-2.5 px-2.5 font-bold text-cyan-400 whitespace-nowrap">
                      {route.collateral} → {route.borrow}
                    </td>

                    {/* APY */}
                    <td className="py-2.5 px-2.5 font-bold text-primary-container whitespace-nowrap">
                      {route.borrowApy.toFixed(2)}%
                    </td>

                    {/* Max Borrow */}
                    <td className="py-2.5 px-2.5 font-mono text-text-primary whitespace-nowrap">
                      ${routeMax.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>

                    {/* Monthly Cost */}
                    <td className="py-2.5 px-2.5 font-mono text-text-secondary whitespace-nowrap">
                      ${((routeMax * (route.borrowApy / 100)) / 12).toFixed(1)}/mo
                    </td>

                    {/* Term / Fees */}
                    <td className="py-2.5 px-2.5 text-[10px] text-text-muted whitespace-nowrap">
                      {route.termFees}
                    </td>

                    {/* Collateral Handling */}
                    <td className="py-2.5 px-2.5 text-[10px] text-text-secondary whitespace-nowrap">
                      {route.collateralHandling}
                    </td>

                    {/* Action */}
                    <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (soundEnabled) playHudSound('switch');
                          setSelectedRoute(route);
                        }}
                        className={`px-3 py-1 rounded-md text-[10.5px] font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-primary-container text-on-primary-container shadow-[0_0_8px_rgba(0,245,160,0.3)]'
                            : 'bg-surface-base border border-white/10 text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        {isSelected ? 'Selected' : 'Select'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 5. LOAN PREVIEW SECTION (Appears when route is selected) */}
      {/* ========================================================================= */}
      {selectedRoute && (
        <section className="p-3.5 sm:p-4 rounded-xl bg-surface-panel/95 border border-primary-container/30 shadow-[0_4px_25px_rgba(0,245,160,0.1)] space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-white/5">
            <div>
              <h2 className="font-headline font-bold text-sm text-text-primary">
                Loan Preview
              </h2>
              <p className="text-[10.5px] text-text-muted font-sans">
                Review the selected route before anything is sent to your phone.
              </p>
            </div>
            <span className="px-2 py-0.5 rounded bg-primary-container/20 text-primary-container text-[9px] font-bold border border-primary-container/30">
              REVIEW
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-[10.5px]">
            <div className="p-2.5 rounded-lg bg-surface-base border border-white/5">
              <span className="text-[9px] text-text-muted block">PROVIDER / NETWORK</span>
              <strong className="text-text-primary font-bold">{selectedRoute.provider} · {selectedRoute.network}</strong>
            </div>

            <div className="p-2.5 rounded-lg bg-surface-base border border-white/5">
              <span className="text-[9px] text-text-muted block">COLLATERAL ROUTE</span>
              <strong className="text-cyan-400 font-bold">{selectedRoute.collateral} → {selectedRoute.borrow}</strong>
            </div>

            <div className="p-2.5 rounded-lg bg-surface-base border border-white/5">
              <span className="text-[9px] text-text-muted block">SUGGESTED BORROW</span>
              <strong className="text-primary-container font-bold font-mono">
                ${saferBorrow.toLocaleString(undefined, { maximumFractionDigits: 0 })} {selectedRoute.borrow}
              </strong>
            </div>

            <div className="p-2.5 rounded-lg bg-surface-base border border-white/5">
              <span className="text-[9px] text-text-muted block">BORROW APY</span>
              <strong className="text-text-primary font-bold">{selectedRoute.borrowApy.toFixed(2)}%</strong>
            </div>

            <div className="p-2.5 rounded-lg bg-surface-base border border-white/5">
              <span className="text-[9px] text-text-muted block">MAX LTV</span>
              <strong className="text-oracle-synced font-bold">{selectedRoute.maxLtv}%</strong>
            </div>

            <div className="p-2.5 rounded-lg bg-surface-base border border-white/5">
              <span className="text-[9px] text-text-muted block">LIQUIDATION THRESHOLD</span>
              <strong className="text-status-error font-bold">{selectedRoute.liquidationThreshold}%</strong>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-surface-base/80 border border-white/5 text-[11px] font-sans text-text-secondary leading-relaxed">
            Projected monthly cost: <strong className="text-text-primary font-mono">${monthlyInterest.toFixed(2)}</strong>. Collateral will remain in non-custodial smart contracts and can be unlocked at any time by paying off the principal debt.
          </div>

          <button
            type="button"
            onClick={handleApproveRoute}
            disabled={previewApproved}
            className="w-full py-2.5 rounded-xl bg-primary-container text-on-primary-container font-mono font-bold text-xs transition-all shadow-[0_0_14px_rgba(0,245,160,0.35)] hover:opacity-95 cursor-pointer flex items-center justify-center gap-2"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{previewApproved ? 'Loan Route Selected' : 'Select Route (Preview Only)'}</span>
          </button>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 6. OTHER LENDING PRODUCTS (CeFi & Institutional Lenders) */}
      {/* ========================================================================= */}
      <section className="p-3.5 sm:p-4 rounded-xl bg-surface-panel/95 border border-white/10 shadow-lg space-y-3">
        <div>
          <h2 className="font-headline font-bold text-sm text-text-primary">
            Other Lending Products
          </h2>
          <p className="text-[10.5px] text-text-muted font-sans">
            These lenders require their own account or an integration. They are not available for direct in-app borrowing yet.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {[
            {
              name: 'Coinbase',
              sub: 'Fixed or variable · USDC · account required',
              desc: 'Processing and possible platform fees; fixed loans have a maturity date. Account integration needed.',
            },
            {
              name: 'GalaxyOne',
              sub: 'Advertised 8.99% variable APR · no origination fee',
              desc: 'BTC / ETH / SOL portfolio line · account and state eligibility required ↗',
            },
            {
              name: 'Figure',
              sub: 'Fixed-rate loan · BTC / ETH / SOL',
              desc: 'APR varies with LTV and fees. Account integration needed.',
            },
            {
              name: 'Ledn',
              sub: 'BTC-backed term loan',
              desc: 'Rate depends on loan size and eligibility. Account integration needed.',
            },
            {
              name: 'Compound III',
              sub: 'Onchain variable-rate markets',
              desc: 'Market integration pending on Ethereum and Arbitrum.',
            },
            {
              name: 'SparkLend',
              sub: 'Onchain variable-rate borrowing',
              desc: 'MakerDAO/Sky liquidity engine. Market integration pending.',
            },
          ].map((lender) => (
            <div
              key={lender.name}
              className="p-3 rounded-lg bg-surface-base border border-white/5 hover:border-white/15 transition-all flex flex-col justify-between gap-1.5"
            >
              <div>
                <strong className="text-xs font-bold text-text-primary block">{lender.name}</strong>
                <span className="text-[10px] text-cyan-400 block mt-0.5">{lender.sub}</span>
              </div>
              <small className="text-[10px] text-text-muted font-sans leading-relaxed">
                {lender.desc}
              </small>
            </div>
          ))}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 7. MY LOANS & REPAYMENT PLANNER */}
      {/* ========================================================================= */}
      <section className="p-3.5 sm:p-4 rounded-xl bg-surface-panel/95 border border-white/10 shadow-lg space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-white/5">
          <div>
            <h2 className="font-headline font-bold text-sm text-text-primary">
              My Loans
            </h2>
            <p className="text-[10.5px] text-text-muted font-sans">
              Open Morpho positions and Aave loans opened here appear below. Repayments use the asset you borrowed.
            </p>
          </div>
          <span className="px-2 py-0.5 rounded bg-surface-base text-primary-container text-[9px] font-bold border border-white/5">
            {activeLoans.length} OPEN
          </span>
        </div>

        {activeLoans.length > 0 ? (
          <div className="space-y-2">
            {activeLoans.map((loan) => (
              <div
                key={loan.id}
                className="p-3 rounded-lg bg-surface-base border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <strong className="text-xs text-text-primary">{loan.provider}</strong>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-text-muted">
                      {loan.network}
                    </span>
                  </div>
                  <div className="text-[10.5px] text-text-secondary mt-0.5">
                    {loan.collateralAmount} {loan.collateralAsset} collateral · <span className="text-status-error font-bold">{loan.debtAmount.toLocaleString()} {loan.debtAsset} owed</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={repayAmount}
                    onChange={(e) => setRepayAmount(e.target.value)}
                    placeholder="Repay amount…"
                    className="w-32 bg-surface-panel px-2.5 py-1.5 rounded-lg border border-white/10 text-xs text-text-primary outline-none focus:border-primary-container"
                  />
                  <div className="flex items-center gap-1">
                    {[0.25, 0.5, 1].map((frac) => (
                      <button
                        key={frac}
                        type="button"
                        onClick={() => setRepayAmount((loan.debtAmount * frac).toFixed(2))}
                        className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[9.5px] font-bold text-text-secondary cursor-pointer"
                      >
                        {frac === 1 ? 'Full' : `${frac * 100}%`}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleRepay}
                    className="px-3 py-1.5 rounded-lg bg-primary-container text-on-primary-container font-bold text-xs shadow-[0_0_8px_rgba(0,245,160,0.3)] hover:opacity-95 cursor-pointer whitespace-nowrap"
                  >
                    Repay
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-text-muted text-[11px] font-sans">
            {isWalletConnected ? 'No open Morpho borrow positions found.' : 'Connect AURELIS Wallet to load open Morpho positions.'}
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* 8. FOOTNOTE & RISK DISCLAIMER */}
      {/* ========================================================================= */}
      <section className="p-3 rounded-xl bg-surface-base border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10.5px] text-text-muted font-sans">
        <div className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-primary-container shrink-0" />
          <span>Rates are market-driven and can change at any time. Paying down principal reduces interest cost and liquidation risk.</span>
        </div>
        <span className="text-primary-container font-mono font-bold cursor-pointer hover:underline whitespace-nowrap">
          Learn more about borrowing →
        </span>
      </section>

      {/* ========================================================================= */}
      {/* EXPORT BORROW MODAL (Standalone HTML, Embed, Markdown Report) */}
      {/* ========================================================================= */}
      <ExportBorrowModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        params={{
          collateralAsset: collateralSearch.toUpperCase(),
          collateralAmount: numCollateral,
          collateralPrice,
          collateralValue,
          receiveAsset,
          provider: selectedRoute ? selectedRoute.provider : 'Morpho Blue',
          network: selectedRoute ? selectedRoute.network : 'Base',
          borrowApr,
          maxBorrow,
          saferBorrow,
          monthlyInterest,
          liquidationPrice,
          dropToLiquidation,
          maxLtv: selectedRoute ? selectedRoute.maxLtv : 80,
          liquidationThreshold: selectedRoute ? selectedRoute.liquidationThreshold : 82.5,
        }}
        soundEnabled={soundEnabled}
      />
    </div>
  );
};

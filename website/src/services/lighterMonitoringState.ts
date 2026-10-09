/**
 * Bot-only Lighter monitoring state.
 * Merely configuring environment variables cannot verify an API connection.
 * Never return secret values or account data to an unverified caller.
 */
export type MonitoringState = 'auth-required' | 'configured-unverified';
export function lighterMonitoringState(
  wallet: string,
  configuredWallet: string | undefined,
  token: string | undefined,
): MonitoringState {
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) throw Error('invalid_wallet_address');
  if (!configuredWallet || !/^0x[a-fA-F0-9]{40}$/.test(configuredWallet) ||
      configuredWallet.toLowerCase()!==wallet.toLowerCase() ||
      !token || token.trim().length<16) return 'auth-required';
  return 'configured-unverified';
}

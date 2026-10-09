// Pure account selection for AURELIS main-wallet sends.
// Does not fall back to a different account when an explicit sender was chosen.
const evmAddress = /^0x[a-fA-F0-9]{40}$/;

export function selectSafeEvmAccount(
  accounts: unknown,
  targetChain: string,
  expectedFrom?: string,
  excludedAddress?: string,
): string | null {
  if (!Array.isArray(accounts) || !/^eip155:\d+$/.test(targetChain)) return null;
  if (expectedFrom !== undefined && !evmAddress.test(expectedFrom)) return null;
  const target = targetChain.toLowerCase();
  for (const candidate of accounts) {
    if (typeof candidate !== 'string') continue;
    const parts = candidate.split(':');
    if (parts.length !== 3 || (parts[0] + ':' + parts[1]).toLowerCase() !== target) continue;
    const address = parts[2];
    if (!evmAddress.test(address)) continue;
    if (excludedAddress && address.toLowerCase() === excludedAddress.toLowerCase()) continue;
    if (expectedFrom && address.toLowerCase() !== expectedFrom.toLowerCase()) continue;
    return address;
  }
  return null;
}

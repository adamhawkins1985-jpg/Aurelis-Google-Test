import { timingSafeEqual } from 'node:crypto';

/**
 * Service-to-service guard for private Bot order observations.
 * A wallet address does not authenticate the caller.
 * The key must be distinct from any exchange credential or wallet secret.
 */
export function authorizeBotMonitoring(
  supplied: unknown,
  expected: string | undefined,
): boolean {
  if (typeof supplied !== 'string' || typeof expected !== 'string' ||
      supplied.length < 32 || expected.length < 32 ||
      supplied.length > 512 || expected.length > 512) return false;
  const a = Buffer.from(supplied, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a,b);
}

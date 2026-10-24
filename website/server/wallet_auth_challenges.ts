/**
 * Per-browser-session SIWE challenge store. Requests can overlap (e.g. wallet
 * auth and Bot Wallet auth); a newer challenge must not replace one still
 * awaiting a wallet signature.
 *
 * Each signed message is single use. Keeping used messages until expiry means
 * replayed signatures are explicitly rejected even after a successful verify.
 */
export type WalletChallenge = {
  message: string;
  expiresAt: number; // Unix seconds
  used: boolean;
};

export class WalletChallengeStore<T extends WalletChallenge> {
  private readonly sessions = new Map<string, Map<string,T>>();
  constructor(private readonly maxPerSession = 8, private readonly maxSessions = 2000) {}

  issue(sid: string, challenge: T, now = Date.now()/1000): void {
    this.prune(now);
    let pending = this.sessions.get(sid);
    if (!pending) {
      pending = new Map();
      this.sessions.set(sid,pending);
    }
    // Re-insertion updates order, with bounded memory per browser session.
    pending.delete(challenge.message);
    while (pending.size >= this.maxPerSession) {
      const oldest = pending.keys().next().value;
      if (oldest === undefined) break;
      pending.delete(oldest);
    }
    pending.set(challenge.message,challenge);
    // Never mutate a challenge in another browser session.
    while (this.sessions.size > this.maxSessions) {
      const oldest = this.sessions.keys().next().value;
      if (oldest === undefined) break;
      this.sessions.delete(oldest);
    }
  }

  consume(sid: string, message: string, now = Date.now()/1000): T {
    const match = this.sessions.get(sid)?.get(message);
    if (!match) throw new Error('challenge_missing_or_superseded');
    if (match.used) throw new Error('challenge_replayed');
    // Mark used synchronously before any signature or database work.
    match.used = true;
    if (now >= match.expiresAt) throw new Error('challenge_expired');
    return match;
  }

  prune(now = Date.now()/1000): void {
    for (const [sid, pending] of this.sessions) {
      for (const [message, challenge] of pending) {
        if (now >= challenge.expiresAt) pending.delete(message);
      }
      if (!pending.size) this.sessions.delete(sid);
    }
  }
}

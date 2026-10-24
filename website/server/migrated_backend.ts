import type { Express, Request, Response } from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { getAddress, verifyMessage } from 'ethers';
import { WalletChallengeStore } from './wallet_auth_challenges';
import { assessKrakenProtection, assessKrakenMarginHandoff, krakenExecutablePrice } from './kraken_protection_review';
import { auditKrakenMarginProtection, krakenLiveExecutionPermitted, KRAKEN_LINKED_OCO_LIFECYCLE_VERIFIED } from './kraken_position_protection';

const APP_ROOT = path.resolve(process.cwd());
const DATA_DIR = path.join(APP_ROOT, 'data');
const ALERT_DB = path.join(DATA_DIR, 'aurelis.sqlite3');
const AUTH_DB = path.join(DATA_DIR, 'wallet-auth.sqlite3');
const AUTH_COOKIE_NAME = 'aurelis_wallet_auth';
const AUTH_CHALLENGE_TTL = 300;
const AUTH_SESSION_TTL = 43200;
const ALLOWED_CHAIN_IDS = new Set([1, 10, 137, 8453, 42161]);

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(ALERT_DB);
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS mobile_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  alert_type TEXT NOT NULL DEFAULT 'aurelis_guard',
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  target_token_hash TEXT
);
CREATE TABLE IF NOT EXISTS guard_devices (
  token_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS alert_dedupe (
  alert_key TEXT PRIMARY KEY,
  last_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mobile_approvals (
  request_id TEXT PRIMARY KEY,
  target_token_hash TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  action TEXT NOT NULL,
  asset TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  result_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS guard_portfolios (
  token_hash TEXT NOT NULL,
  asset_key TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  balance_text TEXT NOT NULL DEFAULT '',
  price_usd REAL,
  change_24h REAL,
  account_address TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(token_hash, asset_key)
);
CREATE TABLE IF NOT EXISTS guard_wallet_addresses (
  token_hash TEXT NOT NULL,
  chain_key TEXT NOT NULL,
  address TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(token_hash, chain_key)
);
`);

const authDb = new Database(AUTH_DB);
authDb.pragma('journal_mode = WAL');
authDb.exec(`
CREATE TABLE IF NOT EXISTS wallet_auth_sessions (
  session_id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  origin TEXT NOT NULL,
  purpose TEXT NOT NULL,
  verified_at REAL NOT NULL,
  expires_at REAL NOT NULL
);
`);

type Challenge = {
  message: string;
  address: string;
  chainId: number;
  origin: string;
  purpose: string;
  expiresAt: number;
  used: boolean;
};

const challenges = new WalletChallengeStore<Challenge>();

function parseCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function sessionId(req: Request, res: Response): string {
  const current = parseCookies(req)[AUTH_COOKIE_NAME] || '';
  if (/^[A-Za-z0-9_-]{20,128}$/.test(current)) return current;
  const value = crypto.randomBytes(32).toString('base64url');
  const secure = String(process.env.AURELIS_WEB_ORIGIN || '').startsWith('https://');
  res.setHeader(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=${value}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${AUTH_SESSION_TTL}${secure ? '; Secure' : ''}`
  );
  return value;
}

function authOrigin(req: Request): string {
  const configured = String(process.env.AURELIS_WEB_ORIGIN || '').trim();
  if (configured) return new URL(configured).origin;
  const host = String(req.headers.host || '').trim();
  if (!host) throw new Error('auth_origin_not_configured');
  const hostname = host.split(':')[0].replace(/^\[|\]$/g, '').toLowerCase();
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) throw new Error('auth_origin_not_configured');
  return `http://${host}`;
}

function normalizeAddress(value: string): string {
  try {
    return getAddress(String(value || '').trim());
  } catch {
    throw new Error('invalid_address');
  }
}

function getVerifiedSession(req: Request, res: Response, purpose?: 'bots'): any | null {
  const sid = sessionId(req, res);
  // Bot permissions are stored separately from general wallet sign-in so a
  // simultaneous/repeated Web login cannot silently revoke bot authorization.
  // Legacy unsuffixed bot sessions remain recognized until they expire.
  const keys = purpose === 'bots' ? [sid + ':bots', sid] : [sid, sid + ':bots'];
  for (const key of keys) {
    const row = authDb.prepare(
      'SELECT address,chain_id,origin,purpose,verified_at,expires_at FROM wallet_auth_sessions WHERE session_id=?'
    ).get(key) as any;
    if (!row) continue;
    if (Date.now() / 1000 >= Number(row.expires_at || 0)) {
      authDb.prepare('DELETE FROM wallet_auth_sessions WHERE session_id=?').run(key);
      continue;
    }
    if (purpose === 'bots' && row.purpose !== 'bots') continue;
    return {
      address: row.address,
      chainId: Number(row.chain_id),
      origin: row.origin,
      purpose: row.purpose,
      verifiedAt: Number(row.verified_at),
      expiresAt: Number(row.expires_at),
    };
  }
  return null;
}

export function getVerifiedWalletAddress(req: Request, res: Response): string | null {
  const verified = getVerifiedSession(req, res);
  return verified?.address ? String(verified.address) : null;
}

function saveVerifiedSession(sid: string, value: any) {
  const key = value.purpose === 'bots' ? sid + ':bots' : sid;
  authDb.prepare(`
    INSERT INTO wallet_auth_sessions(session_id,address,chain_id,origin,purpose,verified_at,expires_at)
    VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(session_id) DO UPDATE SET
      address=excluded.address,chain_id=excluded.chain_id,origin=excluded.origin,
      purpose=excluded.purpose,verified_at=excluded.verified_at,expires_at=excluded.expires_at
  `).run(
    key,
    value.address,
    value.chainId,
    value.origin,
    value.purpose,
    value.verifiedAt,
    value.expiresAt
  );
}

function requireVerified(req: Request, res: Response): any | null {
  const verified = getVerifiedSession(req, res);
  if (!verified) {
    res.status(401).json({ ok: false, error: 'wallet_auth_required' });
    return null;
  }
  return verified;
}

function bearerToken(req: Request): string {
  const raw = String(req.headers.authorization || '');
  return raw.toLowerCase().startsWith('bearer ') ? raw.slice(7).trim() : '';
}

function bearerHash(req: Request): string {
  const token = bearerToken(req);
  return token ? crypto.createHash('sha256').update(token).digest('hex') : '';
}

function mobileAiAuthorized(req: Request): boolean {
  const expected = String(process.env.AURELIS_AI_MOBILE_DEVICE_SHA256 || '').trim().toLowerCase();
  const actual = bearerHash(req);
  return !!expected && !!actual && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function mobileGuardAuthorized(req: Request): boolean {
  const hash = bearerHash(req);
  if (!hash) return false;
  const row = db.prepare('SELECT token_hash FROM guard_devices WHERE token_hash=?').get(hash) as any;
  if (!row) return false;
  db.prepare('UPDATE guard_devices SET last_seen=? WHERE token_hash=?').run(Math.floor(Date.now() / 1000), hash);
  return true;
}

function resolveTokenHashForWallet(address: string): string | null {
  const lower = address.toLowerCase();
  const row = db.prepare(
    'SELECT token_hash,MAX(updated_at) AS u FROM guard_wallet_addresses WHERE lower(address)=? GROUP BY token_hash ORDER BY u DESC LIMIT 1'
  ).get(lower) as any;
  if (row?.token_hash) return String(row.token_hash);
  const row2 = db.prepare(
    'SELECT token_hash,MAX(updated_at) AS u FROM guard_portfolios WHERE lower(account_address)=? GROUP BY token_hash ORDER BY u DESC LIMIT 1'
  ).get(lower) as any;
  return row2?.token_hash ? String(row2.token_hash) : null;
}

function safeJson(text: any, fallback: any = {}) {
  try { return JSON.parse(String(text || '')); } catch { return fallback; }
}

function finiteNumber(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseBalanceText(v: any): number {
  const raw = String(v ?? '').replace(/,/g, '').trim();
  const m = raw.match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
  const n = m ? Number(m[0]) : 0;
  return Number.isFinite(n) ? n : 0;
}

function sendNoStore(res: Response, body: any, status = 200) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 12000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    const data = safeJson(text, null);
    if (!response.ok) {
      const err = new Error(`HTTP_${response.status}`);
      (err as any).status = response.status;
      (err as any).data = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function makeChallenge(address: string, chainId: number, origin: string, purpose: string) {
  const normalizedAddress = normalizeAddress(address);
  if (!ALLOWED_CHAIN_IDS.has(chainId)) throw new Error('unsupported_chain');
  const now = new Date();
  const expires = new Date(now.getTime() + AUTH_CHALLENGE_TTL * 1000);
  const nonce = crypto.randomBytes(8).toString('hex');
  const requestId = crypto.randomBytes(16).toString('hex');
  const domain = new URL(origin).host;
  const normalizedPurpose = String(purpose || '').toLowerCase() === 'bots' ? 'bots' : 'web';
  const purposeLine = normalizedPurpose === 'bots'
    ? 'Sign in to AURELIS Bots. This request does not authorize transactions.\n\n'
    : 'Sign in to AURELIS Web. This request does not authorize transactions.\n\n';
  const message =
    `${domain} wants you to sign in with your Ethereum account:\n` +
    `${normalizedAddress}\n\n` +
    purposeLine +
    `URI: ${origin}\n` +
    'Version: 1\n' +
    `Chain ID: ${chainId}\n` +
    `Nonce: ${nonce}\n` +
    `Issued At: ${now.toISOString().replace('.000Z','Z')}\n` +
    `Expiration Time: ${expires.toISOString().replace('.000Z','Z')}\n` +
    `Request ID: ${requestId}`;
  return {
    message,
    address: normalizedAddress,
    chainId,
    origin,
    purpose: normalizedPurpose,
    expiresAt: Date.now() / 1000 + AUTH_CHALLENGE_TTL,
    used: false,
  } satisfies Challenge;
}

function registerAuthRoutes(app: Express) {
  app.post('/api/auth/challenge', (req, res) => {
    try {
      const sid = sessionId(req, res);
      const origin = authOrigin(req);
      const challenge = makeChallenge(
        String(req.body?.address || ''),
        Number(req.body?.chainId),
        origin,
        String(req.body?.purpose || 'web')
      );
      challenges.issue(sid, challenge);
      return sendNoStore(res, {
        ok: true,
        message: challenge.message,
        address: challenge.address,
        chainId: challenge.chainId,
        expiresIn: AUTH_CHALLENGE_TTL,
      });
    } catch (e: any) {
      return sendNoStore(res, { ok: false, error: e?.message || 'invalid_request' }, 400);
    }
  });

  app.post('/api/auth/verify', async (req, res) => {
    const sid = sessionId(req, res);
    try {
      // Match the specific signed message. Concurrent wallet/UI requests must not
      // overwrite each other, and each challenge can be consumed only once.
      const message = String(req.body?.message || '');
      const challenge = challenges.consume(sid, message);
      const origin = authOrigin(req);
      const address = normalizeAddress(String(req.body?.address || ''));
      const chainId = Number(req.body?.chainId);
      const signature = String(req.body?.signature || '');
      if (message !== challenge.message) throw new Error('message_mismatch');
      if (address !== challenge.address) throw new Error('address_mismatch');
      if (chainId !== challenge.chainId) throw new Error('chain_mismatch');
      if (origin !== challenge.origin) throw new Error('origin_mismatch');
      const recovered = normalizeAddress(verifyMessage(message, signature));
      if (recovered !== challenge.address) throw new Error('invalid_signature');
      const now = Date.now() / 1000;
      saveVerifiedSession(sid, {
        address,
        chainId,
        origin,
        purpose: challenge.purpose,
        verifiedAt: now,
        expiresAt: now + AUTH_SESSION_TTL,
      });
      return sendNoStore(res, { ok: true, verified: true, address, chainId });
    } catch (e: any) {
      return sendNoStore(res, { ok: false, verified: false, error: e?.message || 'invalid_signature' }, 401);
    }
  });

  app.post('/api/auth/native-session', (req, res) => {
    if (!mobileAiAuthorized(req)) return sendNoStore(res, { ok: false, error: 'native_auth_required' }, 401);
    try {
      const sid = sessionId(req, res);
      const origin = authOrigin(req);
      const address = normalizeAddress(String(req.body?.walletAddress || req.body?.address || ''));
      const chainId = Number(req.body?.chainId || 1);
      if (!ALLOWED_CHAIN_IDS.has(chainId)) throw new Error('unsupported_chain');
      const now = Date.now() / 1000;
      saveVerifiedSession(sid, {
        address, chainId, origin, purpose: 'bots', verifiedAt: now, expiresAt: now + AUTH_SESSION_TTL,
      });
      return sendNoStore(res, { ok: true, verified: true, native: true, address, chainId, purpose: 'bots' });
    } catch (e: any) {
      return sendNoStore(res, { ok: false, error: e?.message || 'invalid_request' }, 400);
    }
  });

}

const EVM_NATIVE_RPCS: Record<string,string> = {
  ethereum: 'https://ethereum-rpc.publicnode.com',
  base: 'https://base-rpc.publicnode.com',
  arbitrum: 'https://arbitrum-one-rpc.publicnode.com',
  optimism: 'https://optimism-rpc.publicnode.com',
  bsc: 'https://bsc-rpc.publicnode.com',
  polygon: 'https://polygon-bor-rpc.publicnode.com',
  avalanche: 'https://avalanche-c-chain-rpc.publicnode.com',
};

const EVM_NATIVE_META: Record<string,{symbol:string; name:string; coinbase?: string; fallbackPrice?: number}> = {
  ethereum: { symbol: 'ETH', name: 'Ethereum', coinbase: 'ETH-USD' },
  base: { symbol: 'ETH', name: 'Base ETH', coinbase: 'ETH-USD' },
  arbitrum: { symbol: 'ETH', name: 'Arbitrum ETH', coinbase: 'ETH-USD' },
  optimism: { symbol: 'ETH', name: 'Optimism ETH', coinbase: 'ETH-USD' },
  bsc: { symbol: 'BNB', name: 'BNB Smart Chain', coinbase: 'BNB-USD' },
  polygon: { symbol: 'MATIC', name: 'Polygon', coinbase: 'POL-USD' },
  avalanche: { symbol: 'AVAX', name: 'Avalanche C-Chain', coinbase: 'AVAX-USD' },
};

const EVM_USDC_CONTRACTS: Record<string,string> = {
  ethereum: '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  optimism: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  bsc: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
  polygon: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  avalanche: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
};

async function fetchNativeEthBalance(address:string, rpc:string): Promise<number|null> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'eth_getBalance', params:[address,'latest'] }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body:any = await response.json();
    const hex = String(body?.result || '');
    if (!/^0x[0-9a-f]+$/i.test(hex)) return null;
    return Number(BigInt(hex)) / 1e18;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}



let cachedEthUsdPrice: { price: number; updatedAt: number } | null = null;

async function fetchEthUsdPrice(): Promise<number> {
  const now = Date.now();
  if (cachedEthUsdPrice && now - cachedEthUsdPrice.updatedAt < 60000) return cachedEthUsdPrice.price;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot', {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (response.ok) {
      const body:any = await response.json();
      const price = Number(body?.data?.amount || 0);
      if (Number.isFinite(price) && price > 0) {
        cachedEthUsdPrice = { price, updatedAt: now };
        return price;
      }
    }
  } catch {}
  finally {
    clearTimeout(timeout);
  }
  return cachedEthUsdPrice?.price || 0;
}


let cachedSpotUsdPrices: Record<string,{ price:number; updatedAt:number }> = {};

async function fetchSpotUsdPrice(pair:string, fallback=0): Promise<number> {
  const key = String(pair || '').toUpperCase();
  const now = Date.now();
  const cached = cachedSpotUsdPrices[key];
  if (cached && now - cached.updatedAt < 60000) return cached.price;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(`https://api.coinbase.com/v2/prices/${encodeURIComponent(key)}/spot`, {
      headers: { Accept: 'application/json', 'User-Agent': 'AURELIS-Wallet' },
      signal: controller.signal,
    });
    if (response.ok) {
      const body:any = await response.json();
      const price = Number(body?.data?.amount || 0);
      if (Number.isFinite(price) && price > 0) {
        cachedSpotUsdPrices[key] = { price, updatedAt: now };
        return price;
      }
    }
  } catch {}
  finally {
    clearTimeout(timeout);
  }
  return cached?.price || fallback || 0;
}

function normalizeWatchQuery(value:any): string[] {
  const raw = Array.isArray(value) ? value : (value ? [value] : []);
  return Array.from(new Set(raw.flatMap((item:any) => String(item || '').split(',')).map((item:string) => item.trim()).filter(Boolean))).slice(0, 20);
}

function isZcashTransparentAddress(address:string): boolean {
  return /^t[13][A-Za-z0-9]{25,}$/.test(String(address || '').trim());
}

async function fetchZcashTransparentBalance(address:string): Promise<number|null> {
  const clean = String(address || '').trim();
  if (!isZcashTransparentAddress(clean)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(`https://api.zecblock.com/v1/addresses/${encodeURIComponent(clean)}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'AURELIS-Wallet' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body:any = await response.json();
    const data = body?.data || body;
    const zat = Number(data?.balanceZat ?? data?.balance ?? 0);
    if (Number.isFinite(zat) && zat > 0) return zat / 1e8;
    const zec = Number(data?.balanceZec ?? data?.amountZec ?? 0);
    return Number.isFinite(zec) && zec > 0 ? zec : 0;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}


type WatchAssetMeta = { symbol:string; name:string; chain:string; coinbase?: string; fallbackPrice?: number; decimals?: number };

const WATCH_ASSET_META: Record<string, WatchAssetMeta> = {
  btc: { symbol: 'BTC', name: 'Bitcoin', chain: 'bitcoin', coinbase: 'BTC-USD', decimals: 8 },
  ltc: { symbol: 'LTC', name: 'Litecoin', chain: 'litecoin', coinbase: 'LTC-USD', decimals: 8 },
  doge: { symbol: 'DOGE', name: 'Dogecoin', chain: 'dogecoin', coinbase: 'DOGE-USD', decimals: 8 },
  zec: { symbol: 'ZEC', name: 'Zcash', chain: 'zcash', coinbase: 'ZEC-USD', decimals: 8 },
  sol: { symbol: 'SOL', name: 'Solana', chain: 'solana', coinbase: 'SOL-USD', decimals: 9 },
  xrp: { symbol: 'XRP', name: 'XRP', chain: 'xrp', coinbase: 'XRP-USD', decimals: 6 },
  near: { symbol: 'NEAR', name: 'NEAR', chain: 'near', coinbase: 'NEAR-USD', decimals: 24 },
};

const WATCH_ALIASES: Record<string,string> = {
  bitcoin: 'btc', litecoin: 'ltc', dogecoin: 'doge', zcash: 'zec', solana: 'sol', ripple: 'xrp'
};

function formatAssetBalance(value:number, symbol:string, decimals=8): string {
  const fixed = value.toFixed(Math.min(Math.max(decimals, 2), 8)).replace(/0+$/,'').replace(/\.$/,'');
  return (fixed || '0') + ' ' + symbol;
}

async function fetchBlockcypherBalance(network:'btc'|'ltc'|'doge', address:string): Promise<number|null> {
  const clean = String(address || '').trim();
  if (!clean || clean.length < 20 || clean.length > 120) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(`https://api.blockcypher.com/v1/${network}/main/addrs/${encodeURIComponent(clean)}/balance`, {
      headers: { Accept: 'application/json', 'User-Agent': 'AURELIS-Wallet' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body:any = await response.json();
    const atomic = Number(body?.final_balance ?? body?.balance ?? 0);
    return Number.isFinite(atomic) && atomic > 0 ? atomic / 1e8 : 0;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSolanaBalance(address:string): Promise<number|null> {
  const clean = String(address || '').trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(clean)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'getBalance', params:[clean] }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body:any = await response.json();
    const lamports = Number(body?.result?.value ?? 0);
    return Number.isFinite(lamports) && lamports > 0 ? lamports / 1e9 : 0;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchXrpBalance(address:string): Promise<number|null> {
  const clean = String(address || '').trim();
  if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(clean)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(`https://api.xrpscan.com/api/v1/account/${encodeURIComponent(clean)}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'AURELIS-Wallet' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body:any = await response.json();
    const xrp = Number(body?.xrpBalance ?? 0);
    if (Number.isFinite(xrp) && xrp > 0) return xrp;
    const drops = Number(body?.Balance ?? 0);
    return Number.isFinite(drops) && drops > 0 ? drops / 1e6 : 0;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchNearBalance(address:string): Promise<number|null> {
  const clean = String(address || '').trim().toLowerCase();
  if (!/^(([a-z0-9_-]+\.)*near|[a-f0-9]{64})$/.test(clean)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch('https://rpc.mainnet.near.org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ jsonrpc:'2.0', id:'aurelis', method:'query', params:{ request_type:'view_account', finality:'final', account_id:clean } }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body:any = await response.json();
    const amount = String(body?.result?.amount || '0');
    if (!/^\d+$/.test(amount)) return null;
    return Number(BigInt(amount)) / 1e24;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWatchAssetBalance(symbol:string, address:string): Promise<number|null> {
  const key = WATCH_ALIASES[symbol.toLowerCase()] || symbol.toLowerCase();
  if (key === 'zec') return fetchZcashTransparentBalance(address);
  if (key === 'btc' || key === 'ltc' || key === 'doge') return fetchBlockcypherBalance(key as 'btc'|'ltc'|'doge', address);
  if (key === 'sol') return fetchSolanaBalance(address);
  if (key === 'xrp') return fetchXrpBalance(address);
  if (key === 'near') return fetchNearBalance(address);
  return null;
}

async function fetchErc20Balance(address:string, rpc:string, contract:string, decimals:number): Promise<number|null> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address) || !/^0x[a-fA-F0-9]{40}$/.test(contract)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const addressWord = address.slice(2).toLowerCase().padStart(64, '0');
    const data = '0x70a08231' + addressWord;
    const response = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'eth_call', params:[{to:contract,data},'latest'] }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body:any = await response.json();
    const hex = String(body?.result || '');
    if (!/^0x[0-9a-f]+$/i.test(hex)) return null;
    return Number(BigInt(hex)) / (10 ** decimals);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}


async function fetchErc20Decimals(rpc:string, contract:string): Promise<number|null> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(contract)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        jsonrpc:'2.0',
        id:1,
        method:'eth_call',
        params:[{ to:contract, data:'0x313ce567' }, 'latest'],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body:any = await response.json();
    const hex = String(body?.result || '');
    if (!/^0x[0-9a-f]+$/i.test(hex)) return null;
    const decimals = Number(BigInt(hex));
    return Number.isInteger(decimals) && decimals >= 0 && decimals <= 36 ? decimals : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function registerWalletRoutes(app: Express) {
  app.get('/api/wallet/erc20-decimals', async (req, res) => {
    const verified = requireVerified(req, res);
    if (!verified) return;
    const networkRaw = String(req.query.network || '').toLowerCase();
    const network =
      networkRaw === 'eth' || networkRaw === 'mainnet' ? 'ethereum' :
      networkRaw === 'arb' ? 'arbitrum' :
      networkRaw;
    const contract = String(req.query.contract || '');
    const rpc = EVM_NATIVE_RPCS[network];
    if (!rpc || !/^0x[a-fA-F0-9]{40}$/.test(contract)) {
      return sendNoStore(res, { ok:false, error:'unsupported_token_network' }, 400);
    }
    const decimals = await fetchErc20Decimals(rpc, contract);
    if (decimals === null) return sendNoStore(res, { ok:false, error:'token_decimals_unavailable' }, 502);
    return sendNoStore(res, { ok:true, network, contract, decimals });
  });

  app.get('/api/wallet/external-evm-portfolio', async (req, res) => {
    const address = String(req.query.address || '').trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return sendNoStore(res, { ok: false, error: 'invalid_external_wallet_address' }, 400);
    }

    const assets:any[] = [];
    const skipEvm = String(req.query.skipEvm || '').toLowerCase() === '1';
    const ethUsdPrice = skipEvm ? 0 : await fetchEthUsdPrice();
    const nativePriceCache: Record<string, number> = {};
    if (!skipEvm) await Promise.all(Object.entries(EVM_NATIVE_RPCS).map(async ([chain, rpc]) => {
      const live = await fetchNativeEthBalance(address, rpc);
      if (live !== null && live > 0) {
        const meta = EVM_NATIVE_META[chain] || { symbol: 'ETH', name: 'Ethereum', coinbase: 'ETH-USD' };
        const nativePrice = nativePriceCache[chain] ?? await fetchSpotUsdPrice(meta.coinbase || 'ETH-USD', meta.symbol === 'ETH' ? ethUsdPrice : 0);
        nativePriceCache[chain] = nativePrice;
        assets.push({
          assetId: chain,
          chain,
          symbol: meta.symbol || 'ETH',
          name: meta.name || (chain === 'ethereum' ? 'Ethereum' : chain.charAt(0).toUpperCase() + chain.slice(1) + ' ETH'),
          balance: live,
          amount: live,
          balanceText: (live.toFixed(8).replace(/0+$/,'').replace(/\.$/,'') || '0') + ' ' + (meta.symbol || 'ETH'),
          priceUsd: nativePrice,
          change24h: 0,
          accountAddress: address,
          updatedAt: Math.floor(Date.now()/1000),
        });
      }

      const usdcContract = EVM_USDC_CONTRACTS[chain];
      if (usdcContract) {
        const usdc = await fetchErc20Balance(address, rpc, usdcContract, 6);
        if (usdc !== null && usdc > 0) {
          assets.push({
            assetId: chain + '_usdc',
            chain,
            symbol: 'USDC',
            name: 'USD Coin',
            balance: usdc,
            amount: usdc,
            balanceText: usdc.toFixed(6).replace(/0+$/,'').replace(/\.$/,'') + ' USDC',
            priceUsd: 1,
            change24h: 0,
            accountAddress: address,
            updatedAt: Math.floor(Date.now()/1000),
          });
        }
      }
    }));

    const watchTasks: Promise<void>[] = [];
    for (const [rawKey, meta] of Object.entries(WATCH_ASSET_META)) {
      const aliasValues = Object.entries(WATCH_ALIASES)
        .filter(([, canonical]) => canonical === rawKey)
        .map(([alias]) => req.query[alias]);
      const watchAddresses = normalizeWatchQuery([req.query[rawKey], ...aliasValues].flat());
      if (!watchAddresses.length) continue;
      const pricePromise = meta.coinbase ? fetchSpotUsdPrice(meta.coinbase, meta.fallbackPrice || 0) : Promise.resolve(meta.fallbackPrice || 0);
      for (const watchAddress of watchAddresses) {
        watchTasks.push((async () => {
          const [balance, priceUsd] = await Promise.all([
            fetchWatchAssetBalance(rawKey, watchAddress),
            pricePromise,
          ]);
          if (balance !== null && balance > 0) {
            assets.push({
              assetId: `${meta.chain}_${watchAddress.slice(0, 10)}`,
              chain: meta.chain,
              symbol: meta.symbol,
              name: meta.name,
              balance,
              amount: balance,
              balanceText: formatAssetBalance(balance, meta.symbol, meta.decimals || 8),
              priceUsd,
              change24h: 0,
              accountAddress: watchAddress,
              source: 'watch_only_' + rawKey,
              updatedAt: Math.floor(Date.now()/1000),
            });
          }
        })());
      }
    }
    await Promise.all(watchTasks);

    return sendNoStore(res, { ok: true, address, assets, source: 'external_wallet_watch_rpc' });
  });

  app.get('/api/wallet/native-addresses', (req, res) => {
    const verified = requireVerified(req, res);
    if (!verified) return;
    const tokenHash = resolveTokenHashForWallet(verified.address);
    if (!tokenHash) return sendNoStore(res, { ok: true, addresses: {}, source: 'native_guard' });
    const rows = db.prepare(
      'SELECT chain_key,address,updated_at FROM guard_wallet_addresses WHERE token_hash=? ORDER BY chain_key'
    ).all(tokenHash) as any[];
    const addresses: Record<string,string> = {};
    let updatedAt = 0;
    for (const row of rows) {
      addresses[String(row.chain_key)] = String(row.address);
      addresses[String(row.chain_key).toLowerCase()] = String(row.address);
      updatedAt = Math.max(updatedAt, Number(row.updated_at || 0));
    }
    return sendNoStore(res, { ok: true, addresses, updatedAt, source: 'native_guard' });
  });

  const portfolioHandler = async (req: Request, res: Response) => {
    const verified = requireVerified(req, res);
    if (!verified) return;
    const tokenHash = resolveTokenHashForWallet(verified.address);
    if (!tokenHash) console.log('external wallet live portfolio', verified.address);
    const rows = db.prepare(
      'SELECT asset_key,symbol,name,balance_text,price_usd,change_24h,account_address,updated_at FROM guard_portfolios WHERE token_hash=? ORDER BY symbol'
    ).all(tokenHash) as any[];
    const assets:any[] = rows.map((row) => {
      const assetId = String(row.asset_key || '');
      const key = assetId.toLowerCase();
      const chain =
        key.startsWith('ethereum') ? 'ethereum' :
        key.startsWith('arbitrum') ? 'arbitrum' :
        key.startsWith('base') ? 'base' :
        key.startsWith('near') ? 'near' :
        key.startsWith('xrp') ? 'xrp' :
        (key.split('_')[0] || '');
      return {
        assetId,
        chain,
        symbol: String(row.symbol || '').toUpperCase(),
        name: row.name || row.symbol,
        balance: parseBalanceText(row.balance_text),
        amount: parseBalanceText(row.balance_text),
        balanceText: row.balance_text,
        priceUsd: finiteNumber(row.price_usd) ?? 0,
        change24h: finiteNumber(row.change_24h) ?? 0,
        accountAddress: row.account_address || '',
        updatedAt: row.updated_at,
      };
    });

    if (!tokenHash && /^0x[a-fA-F0-9]{40}$/.test(String(verified.address || ''))) {
      await Promise.all(Object.entries(EVM_NATIVE_RPCS).map(async ([chain, rpc]) => {
        const live = await fetchNativeEthBalance(String(verified.address), rpc);
        if (live === null || live <= 0) return;
        const existing = assets.find((asset:any) => asset.symbol === 'ETH' && String(asset.chain || '').toLowerCase() === chain);
        if (existing) return;
        assets.push({
          assetId: chain,
          chain,
          symbol: EVM_NATIVE_META[chain]?.symbol || 'ETH',
          name: EVM_NATIVE_META[chain]?.name || (chain === 'ethereum' ? 'Ethereum' : chain.charAt(0).toUpperCase() + chain.slice(1) + ' ETH'),
          balance: live,
          amount: live,
          balanceText: (live.toFixed(8).replace(/0+$/,'').replace(/\.$/,'') || '0') + ' ETH',
          priceUsd: 0,
          change24h: 0,
          accountAddress: String(verified.address),
          updatedAt: Math.floor(Date.now()/1000),
          isGasReserve: false,
        });
      }));
    }

    await Promise.all(assets.map(async (asset:any) => {
      if (asset.symbol !== 'ETH') return;
      const rpc = EVM_NATIVE_RPCS[String(asset.chain || '').toLowerCase()];
      if (!rpc || !asset.accountAddress) return;
      const live = await fetchNativeEthBalance(String(asset.accountAddress), rpc);
      if (live === null) return;
      asset.balance = live;
      asset.amount = live;
      const text = live.toFixed(8).replace(/0+$/,'').replace(/\.$/,'') || '0';
      asset.balanceText = text + ' ETH';
      asset.updatedAt = Math.floor(Date.now()/1000);
      asset.isGasReserve = live * Number(asset.priceUsd || 0) < 0.25;
    }));

    const evmAddressByChain: Record<string,string> = {};
    if (/^0x[a-fA-F0-9]{40}$/.test(String(verified.address || ''))) {
      for (const chain of Object.keys(EVM_NATIVE_RPCS)) evmAddressByChain[chain] = String(verified.address);
    }
    for (const asset of assets) {
      const chain = String(asset.chain || '').toLowerCase();
      if (EVM_NATIVE_RPCS[chain] && asset.accountAddress && !evmAddressByChain[chain]) {
        evmAddressByChain[chain] = String(asset.accountAddress);
      }
    }

    await Promise.all(Object.entries(EVM_USDC_CONTRACTS).map(async ([chain, contract]) => {
      const rpc = EVM_NATIVE_RPCS[chain];
      const accountAddress = evmAddressByChain[chain];
      if (!rpc || !accountAddress) return;
      const live = await fetchErc20Balance(accountAddress, rpc, contract, 6);
      if (live === null) return;
      const existing = assets.find((asset:any) => asset.symbol === 'USDC' && String(asset.chain || '').toLowerCase() === chain);
      if (existing) {
        existing.balance = live;
        existing.amount = live;
        existing.balanceText = live.toFixed(6).replace(/0+$/,'').replace(/\.$/,'') + ' USDC';
        existing.priceUsd = 1;
        existing.updatedAt = Math.floor(Date.now()/1000);
      } else if (live > 0) {
        assets.push({
          assetId: chain + '_usdc',
          chain,
          symbol: 'USDC',
          name: 'USD Coin',
          balance: live,
          amount: live,
          balanceText: live.toFixed(6).replace(/0+$/,'').replace(/\.$/,'') + ' USDC',
          priceUsd: 1,
          change24h: 0,
          accountAddress,
          updatedAt: Math.floor(Date.now()/1000),
        });
      }
    }));

    const visibleAssets = assets.filter((x:any) => {
      if (!x.symbol || !(Number(x.amount) > 0)) return false;
      if (x.symbol === 'ETH' && x.isGasReserve) return false;
      if (x.symbol === 'USDC' && Number(x.amount) < 0.50) return false;
      return true;
    });
    return sendNoStore(res, { ok: true, address: verified.address, assets: visibleAssets, source: tokenHash ? 'native_guard+live_rpc+live_usdc' : 'external_wallet+live_rpc+live_usdc' });
  };

  app.get('/api/wallet/portfolio', portfolioHandler);
  app.get('/api/wallet/portfolio-latest', portfolioHandler);
}

function enqueueAlert(title: string, body: string, type='aurelis_guard', data:any={}, targetTokenHash:string|null=null) {
  const now = Math.floor(Date.now()/1000);
  const info = db.prepare(
    'INSERT INTO mobile_alerts(title,body,alert_type,data_json,created_at,target_token_hash) VALUES(?,?,?,?,?,?)'
  ).run(title, body, type, JSON.stringify(data || {}), now, targetTokenHash);
  return Number(info.lastInsertRowid);
}

function registerAlertRoutes(app: Express) {
  app.get('/api/alerts/recent', (req, res) => {
    const verified = requireVerified(req, res);
    if (!verified) return;
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 30) || 30));
    const tokenHash = resolveTokenHashForWallet(verified.address);
    const rows = tokenHash
      ? db.prepare(
          'SELECT id,title,body,alert_type,data_json,created_at FROM mobile_alerts WHERE target_token_hash IS NULL OR target_token_hash=? ORDER BY id DESC LIMIT ?'
        ).all(tokenHash, limit * 4) as any[]
      : db.prepare(
          'SELECT id,title,body,alert_type,data_json,created_at FROM mobile_alerts WHERE target_token_hash IS NULL ORDER BY id DESC LIMIT ?'
        ).all(limit * 4) as any[];
    const seen = new Set<string>();
    const alerts:any[] = [];
    for (const row of rows) {
      const data = safeJson(row.data_json, {});
      if (row.alert_type === 'bets_found') {
        const bets = Array.isArray(data?.bets) ? data.bets : [];
        const key = bets.map((x:any)=>`${String(x?.symbol||'').toUpperCase()}:${String(x?.direction||'').toUpperCase()}`).sort().join('|');
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
      }
      alerts.push({ id: row.id, title: row.title, body: row.body, type: row.alert_type, data, createdAt: row.created_at });
      if (alerts.length >= limit) break;
    }
    return sendNoStore(res, { ok: true, alerts });
  });

  app.post('/api/mobile/alerts/register', (req, res) => {
    if (!mobileAiAuthorized(req)) return sendNoStore(res, { ok:false, error:'unauthorized' }, 401);
    const tokenHash = String(req.body?.tokenHash || '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(tokenHash)) return sendNoStore(res, { ok:false, error:'invalid_guard_token' }, 400);
    const now = Math.floor(Date.now()/1000);
    db.prepare(
      'INSERT INTO guard_devices(token_hash,created_at,last_seen) VALUES(?,?,?) ON CONFLICT(token_hash) DO UPDATE SET last_seen=excluded.last_seen'
    ).run(tokenHash, now, now);
    return sendNoStore(res, { ok:true, registered:true });
  });

  app.get('/api/mobile/alerts/stream', (req, res) => {
    if (!mobileGuardAuthorized(req)) return sendNoStore(res, { ok:false, error:'unauthorized' }, 401);
    const tokenHash = bearerHash(req);
    let lastId = Math.max(0, Number(req.query.since || 0) || 0);
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    let alive = true;
    req.on('close', () => { alive = false; });
    const tick = () => {
      if (!alive) return;
      const rows = db.prepare(
        'SELECT id,title,body,alert_type,data_json,created_at FROM mobile_alerts WHERE id>? AND (target_token_hash IS NULL OR target_token_hash=?) ORDER BY id ASC LIMIT 100'
      ).all(lastId, tokenHash) as any[];
      if (rows.length) {
        for (const row of rows) {
          const packet = { id:row.id,title:row.title,body:row.body,type:row.alert_type,data:safeJson(row.data_json,{}),createdAt:row.created_at };
          res.write('data: ' + JSON.stringify(packet) + '\n\n');
          lastId = Number(row.id);
        }
      } else {
        res.write(': heartbeat\n\n');
      }
    };
    tick();
    const timer = setInterval(tick, 10000);
    setTimeout(() => { clearInterval(timer); if (alive) res.end(); }, 55000);
  });

  app.post('/api/mobile/alerts/test', (req, res) => {
    if (!mobileGuardAuthorized(req)) return sendNoStore(res,{ok:false,error:'unauthorized'},401);
    const alertId = enqueueAlert(
      'AURELIS Guard connected',
      'Wallet protection and opportunity alerts are ready on this phone.',
      'aurelis_guard',
      { screen:'wallet', kind:'transport_test' },
      bearerHash(req)
    );
    return sendNoStore(res,{ok:true,alertId});
  });

  app.post('/api/mobile/guard/portfolio', (req, res) => {
    if (!mobileGuardAuthorized(req)) return sendNoStore(res,{ok:false,error:'unauthorized'},401);
    const tokenHash = bearerHash(req);
    const assetsRaw = Array.isArray(req.body?.assets) ? req.body.assets.slice(0,500) : [];
    const addressesRaw = req.body?.addresses && typeof req.body.addresses === 'object' ? req.body.addresses : {};
    const assets:any[] = [];
    const seen = new Set<string>();
    for (const raw of assetsRaw) {
      if (!raw || typeof raw !== 'object') continue;
      const symbol = String(raw.symbol || '').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,24);
      const assetId = String(raw.assetId || '').trim().slice(0,220);
      if (!symbol || !assetId || seen.has(assetId)) continue;
      seen.add(assetId);
      assets.push({
        assetId,
        symbol,
        name:String(raw.name || symbol).trim().slice(0,120),
        balance:String(raw.balance || '').trim().slice(0,120),
        priceUsd:finiteNumber(raw.priceUsd),
        change24h:finiteNumber(raw.change24h),
        accountAddress:String(raw.accountAddress || '').trim().slice(0,180),
      });
    }
    const addresses:Record<string,string> = {};
    for (const [k,v] of Object.entries(addressesRaw).slice(0,100)) {
      const key = String(k).replace(/[^A-Za-z0-9_-]/g,'').slice(0,64);
      const value = String(v || '').trim().slice(0,220);
      if (key && value) addresses[key] = value;
    }
    const now = Math.floor(Date.now()/1000);
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM guard_portfolios WHERE token_hash=?').run(tokenHash);
      db.prepare('DELETE FROM guard_wallet_addresses WHERE token_hash=?').run(tokenHash);
      const ia = db.prepare('INSERT INTO guard_wallet_addresses(token_hash,chain_key,address,updated_at) VALUES(?,?,?,?)');
      for (const [key,value] of Object.entries(addresses)) ia.run(tokenHash,key,value,now);
      const ip = db.prepare(
        'INSERT INTO guard_portfolios(token_hash,asset_key,symbol,name,balance_text,price_usd,change_24h,account_address,updated_at) VALUES(?,?,?,?,?,?,?,?,?)'
      );
      for (const item of assets) {
        ip.run(tokenHash,item.assetId,item.symbol,item.name,item.balance,item.priceUsd,item.change24h,item.accountAddress,now);
      }
    });
    tx();
    return sendNoStore(res,{ok:true,assets:assets.length,addresses:Object.keys(addresses).length,updatedAt:now});
  });

  app.post('/api/mobile/approval/respond', (req, res) => {
    if (!mobileGuardAuthorized(req)) return sendNoStore(res,{ok:false,error:'unauthorized'},401);
    const requestId = String(req.body?.requestId || '').trim();
    const decision = String(req.body?.decision || '').trim().toLowerCase();
    if (!/^[A-Za-z0-9_-]{16,80}$/.test(requestId) || !['approve','deny'].includes(decision)) {
      return sendNoStore(res,{ok:false,error:'invalid_approval_response'},400);
    }
    const status = decision === 'approve' ? 'approved' : 'denied';
    const result = JSON.stringify({decision,authorizedOnPhone:decision==='approve'});
    const info = db.prepare(
      "UPDATE mobile_approvals SET status=?,result_json=?,updated_at=? WHERE request_id=? AND target_token_hash=? AND status='pending'"
    ).run(status,result,Math.floor(Date.now()/1000),requestId,bearerHash(req));
    if (!info.changes) return sendNoStore(res,{ok:false,error:'approval_not_pending'},409);
    return sendNoStore(res,{ok:true,requestId,status});
  });
}

const ohlcCache = new Map<string,{at:number,payload:any}>();
const knownCoinIds:Record<string,string> = {
  BTC:'bitcoin',ETH:'ethereum',SOL:'solana',XRP:'ripple',BNB:'binancecoin',DOGE:'dogecoin',
  ADA:'cardano',AVAX:'avalanche-2',DOT:'polkadot',LTC:'litecoin',LINK:'chainlink',TRX:'tron',
  SUI:'sui',XLM:'stellar',HBAR:'hedera-hashgraph',BCH:'bitcoin-cash',TON:'the-open-network',
  UNI:'uniswap',SHIB:'shiba-inu',PEPE:'pepe',AAVE:'aave',NEAR:'near',APT:'aptos',ARB:'arbitrum',
  OP:'optimism',XMR:'monero',TAO:'bittensor'
};

async function coinOhlc(symbol:string, rangeKey:string) {
  const key = symbol + ':' + rangeKey;
  const cached = ohlcCache.get(key);
  if (cached && Date.now()-cached.at < 25000) return cached.payload;
  const conf:any = { '4H':['5m',48], '12H':['15m',48], '1D':['30m',48], '7D':['4h',42] }[rangeKey];
  if (!conf) throw new Error('invalid_request');
  try {
    const raw = await fetchJson(
      'https://api.mexc.com/api/v3/klines?' + new URLSearchParams({symbol:symbol+'USDT',interval:conf[0],limit:String(conf[1])}),
      { headers:{Accept:'application/json','User-Agent':'AURELIS-Web/1.0'} }, 7000
    );
    const candles = (Array.isArray(raw)?raw:[]).map((row:any[])=>({
      t:Number(row?.[0]),o:Number(row?.[1]),h:Number(row?.[2]),l:Number(row?.[3]),c:Number(row?.[4]),v:Number(row?.[5])
    })).filter((x:any)=>[x.t,x.o,x.h,x.l,x.c].every(Number.isFinite));
    if (candles.length) {
      const payload={ok:true,symbol,range:rangeKey,source:'mexc_ohlc',interval:conf[0],candles};
      ohlcCache.set(key,{at:Date.now(),payload}); return payload;
    }
  } catch {}
  let coinId=knownCoinIds[symbol];
  if (!coinId) {
    const search=await fetchJson('https://api.coingecko.com/api/v3/search?query='+encodeURIComponent(symbol),{headers:{Accept:'application/json'}},6000);
    const matches=(search?.coins||[]).filter((x:any)=>String(x.symbol||'').toUpperCase()===symbol)
      .sort((a:any,b:any)=>(a.market_cap_rank||1e9)-(b.market_cap_rank||1e9));
    coinId=matches?.[0]?.id;
  }
  if (!coinId) throw new Error('coin_not_found');
  const days=rangeKey==='7D'?'7':'1';
  const raw=await fetchJson(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/ohlc?vs_currency=usd&days=${days}`,{headers:{Accept:'application/json'}},8000);
  let candles=(Array.isArray(raw)?raw:[]).map((row:any[])=>({t:Number(row?.[0]),o:Number(row?.[1]),h:Number(row?.[2]),l:Number(row?.[3]),c:Number(row?.[4])}))
    .filter((x:any)=>[x.t,x.o,x.h,x.l,x.c].every(Number.isFinite));
  if (['4H','12H'].includes(rangeKey) && candles.length) {
    const cutoff=candles[candles.length-1].t-(rangeKey==='4H'?4:12)*3600000;
    candles=candles.filter((x:any)=>x.t>=cutoff);
  }
  const payload={ok:true,symbol,range:rangeKey,source:'coingecko_ohlc',candles};
  ohlcCache.set(key,{at:Date.now(),payload}); return payload;
}

async function krakenTicker(symbol:string) {
  const aliases:Record<string,string>={BTC:'XBT',DOGE:'XDG'};
  const base=aliases[symbol]||symbol;
  const pairs=await fetchJson('https://api.kraken.com/0/public/AssetPairs?execution_venue=bitnomial_exchange',{headers:{Accept:'application/json'}},10000);
  const rows=pairs?.result||{};
  let match:any=null;
  for (const [pairId,info0] of Object.entries(rows)) {
    const info:any=info0;
    const alt=String(info?.altname||pairId).toUpperCase();
    const ws=String(info?.wsname||'').toUpperCase();
    const wanted=new Set([`${base}USD:BTNL`,`${symbol}/USD:BTNL`,`${base}/USD:BTNL`].map(x=>x.toUpperCase()));
    if (wanted.has(alt)||wanted.has(ws)) { match={pairId,...info}; break; }
  }
  if (!match) {
    const normalPair=(symbol==='BTC'?'XBT':symbol)+'USD';
    const ticker=await fetchJson('https://api.kraken.com/0/public/Ticker?pair='+encodeURIComponent(normalPair),{headers:{Accept:'application/json'}},10000);
    const row:any=Object.values(ticker?.result||{})[0];
    if (!row) throw new Error('kraken_ticker_unavailable');
    return { mark:Number(row.c?.[0]), pair:{pairId:normalPair,altname:normalPair,wsname:symbol+'/USD',lot_decimals:8,pair_decimals:5,leverage_buy:[],leverage_sell:[]}, ticker:row };
  }
  const ticker=await fetchJson('https://api.kraken.com/0/public/Ticker?pair='+encodeURIComponent(match.altname),{headers:{Accept:'application/json'}},10000);
  const row:any=Object.values(ticker?.result||{})[0];
  if (!row) throw new Error('kraken_ticker_unavailable');
  return { mark:Number(row.c?.[0]), pair:match, ticker:row };
}

let krakenNonce=0n;
function krakenCreds() {
  const key=String(process.env.KRAKEN_API_KEY||'').trim();
  const secret=String(process.env.KRAKEN_API_SECRET||'').trim();
  if(!key||!secret) throw new Error('kraken_not_configured');
  return {key,secret};
}
// One Kraken API key is shared by balance/status/preview endpoints.
// Serialize ALL signed calls so nonce N+1 cannot arrive before nonce N.
// Do not move this lock into an individual route: different routes share the key.
let krakenPrivateTail:Promise<void>=Promise.resolve();
function krakenPrivate(route:string,payload:Record<string,any>={}):Promise<any>{
  const work=async()=>{
    const {key,secret}=krakenCreds();
    const candidate=BigInt(Date.now())*1000000n+process.hrtime.bigint()%1000000n;
    krakenNonce=candidate>krakenNonce?candidate:krakenNonce+1n;
    const nonce=krakenNonce.toString();
    const body=new URLSearchParams({...Object.fromEntries(Object.entries(payload).map(([k,v])=>[k,String(v)])),nonce}).toString();
    const digest=crypto.createHash('sha256').update(nonce+body).digest();
    const sig=crypto.createHmac('sha512',Buffer.from(secret,'base64')).update(Buffer.concat([Buffer.from(route),digest])).digest('base64');
    const response=await fetch('https://api.kraken.com'+route,{
      method:'POST',
      headers:{'API-Key':key,'API-Sign':sig,'Content-Type':'application/x-www-form-urlencoded','User-Agent':'AURELIS-vNext/1.0'},
      body,signal:AbortSignal.timeout(16000)
    });
    const data:any=await response.json();
    if(!response.ok || (Array.isArray(data?.error)&&data.error.length))
      throw new Error('kraken_api_error:'+(data?.error||[]).join(';'));
    return data?.result;
  };
  const result=krakenPrivateTail.then(work,work);
  krakenPrivateTail=result.then(()=>undefined,()=>undefined);
  return result;
}


// AURELIS CEX funding assistant: owner-scoped, READ-ONLY accounts and review-only orders.
// A signed Bots wallet does not automatically authorize reading the owner's exchange balances.
function requireBotAccountOwner(req:Request,res:Response):boolean {
  const session=getVerifiedSession(req,res,'bots');
  if(!session){
    sendNoStore(res,{ok:false,error:'wallet_auth_required',next:'verify_bot_wallet'},401);
    return false;
  }
  const owner=String(process.env.AURELIS_BOTS_OWNER_WALLET_ADDRESS||'').trim().toLowerCase();
  if(!owner || session.purpose!=='bots' || String(session.address||'').toLowerCase()!==owner){
    sendNoStore(res,{ok:false,error:'bot_account_owner_not_authorized'},403);
    return false;
  }
  return true;
}

type CexStatus = {
  name:string; connected:boolean; reason:string; configured:boolean;
  balanceKind:string; balances:Record<string,string>|null;
  accountType:string; orderSubmissionVerified:boolean; liveOrdersEnabled:boolean;
  autoFundingEnabled:boolean;
};
const brokerStatuses:{at:number,data:any|null}={at:0,data:null};
function cexMoney(value:any):string | null {
  const n=Number(value);
  if(!Number.isFinite(n) || n<0)return null;
  return n.toFixed(2);
}
function cleanBrokerError(error:any):string {
  const e=String(error?.message||error||'').toLowerCase();
  if(e.includes('invalid key')||e.includes('invalid signature')||e.includes('unauthorized')||e.includes('authentication'))return 'authentication_failed';
  if(e.includes('permission')||e.includes('403')||e.includes('forbidden'))return 'insufficient_permission';
  if(e.includes('timeout')||e.includes('fetch failed')||e.includes('network'))return 'network_unavailable';
  return 'connection_unverified';
}
async function probeKrakenSpot():Promise<CexStatus>{
  const configured=Boolean((process.env.KRAKEN_SPOT_API_KEY||process.env.KRAKEN_API_KEY) &&
    (process.env.KRAKEN_SPOT_API_SECRET||process.env.KRAKEN_API_SECRET));
  const base:CexStatus={name:'Kraken Spot',connected:false,configured,
    reason:configured?'connection_unverified':'api_not_configured',
    balanceKind:'unavailable',balances:null,accountType:'Kraken Spot',
    orderSubmissionVerified:false,liveOrdersEnabled:false,autoFundingEnabled:false};
  if(!configured)return base;
  try{
    // Existing krakenPrivate targets KRAKEN_API_KEY: don't silently swap credential identities.
    if(!(process.env.KRAKEN_API_KEY&&process.env.KRAKEN_API_SECRET)){
      return {...base,reason:'legacy_key_only_unverified'};
    }
    const raw:any=await krakenPrivate('/0/private/Balance',{});
    const balances={
      USD:cexMoney(raw?.ZUSD??raw?.USD??0) || '0.00',
      USDC:cexMoney(raw?.USDC??0) || '0.00',
      USDT:cexMoney(raw?.USDT??0) || '0.00'
    };
    return {...base,connected:true,reason:'balance_read_ok',balanceKind:'total_holdings',balances};
  }catch(error){return {...base,reason:cleanBrokerError(error)}}
}
// Connect read-only to the existing Coinbase service on loopback.
// Credentials never pass to this web server or the browser.
async function probeCoinbaseLocalBridge():Promise<CexStatus>{
 const base:CexStatus={name:'Coinbase Advanced',connected:false,configured:true,
   reason:'local_service_unavailable',balanceKind:'unavailable',balances:null,
   accountType:'Coinbase Advanced portfolio',orderSubmissionVerified:false,
   liveOrdersEnabled:false,autoFundingEnabled:false};
 try{
   const token=fs.readFileSync('/home/ubuntu/.config/aurelis/coinbase-bridge.token','utf8').trim();
   if(!token)return {...base,configured:false,reason:'local_bridge_unconfigured'};
   const response=await fetch('http://127.0.0.1:8894/private/coinbase/accounts',{
     headers:{Authorization:'Bearer '+token,Accept:'application/json'},
     signal:AbortSignal.timeout(13000)});
   if(!response.ok)return {...base,reason:response.status===401?'local_service_unauthorized':'local_service_unavailable'};
   const result:any=await response.json();
   if(!result?.ok||!result?.connected||!result?.balances)
     return {...base,reason:String(result?.reason||'connection_unverified').slice(0,60)};
   const a=result.balances;
   if([a.USD,a.USDC,a.USDT].some(v=>cexMoney(v)===null))return {...base,reason:'invalid_balance_response'};
   return {...base,connected:true,reason:'balance_read_ok',balanceKind:'available_balance',
     balances:{USD:cexMoney(a.USD)||'0.00',USDC:cexMoney(a.USDC)||'0.00',USDT:cexMoney(a.USDT)||'0.00'}};
 }catch{return {...base,reason:'local_service_unavailable'}}
}

function coinbaseAdvancedConfigured():boolean{
 return Boolean((process.env.COINBASE_ADVANCED_API_KEY_NAME||process.env.COINBASE_API_KEY_NAME) &&
   (process.env.COINBASE_ADVANCED_PRIVATE_KEY||process.env.COINBASE_PRIVATE_KEY));
}
async function probeCoinbaseAdvanced():Promise<CexStatus>{
 if(!coinbaseAdvancedConfigured())return probeCoinbaseLocalBridge();
 const configured=true;
 const base:CexStatus={name:'Coinbase Advanced',connected:false,configured,
   reason:configured?'connection_unverified':'api_not_configured',
   balanceKind:'unavailable',balances:null,accountType:'Coinbase Advanced portfolio',
   orderSubmissionVerified:false,liveOrdersEnabled:false,autoFundingEnabled:false};
 if(!configured)return base;
 try{
   const kid=String(process.env.COINBASE_ADVANCED_API_KEY_NAME||process.env.COINBASE_API_KEY_NAME||'');
   const pem=String(process.env.COINBASE_ADVANCED_PRIVATE_KEY||process.env.COINBASE_PRIVATE_KEY||'').replace(/\\n/g,'\n');
   let key:ReturnType<typeof crypto.createPrivateKey>;
   if(pem.trim().startsWith('-----BEGIN')){
     key=crypto.createPrivateKey(pem);
   }else{
     const bytes=Buffer.from(pem,'base64');
     if(bytes.length!==32&&bytes.length!==64)return {...base,reason:'invalid_ed25519_key'};
     const seed=bytes.subarray(0,32);
     key=crypto.createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),seed]),format:'der',type:'pkcs8'});
     if(bytes.length===64){
       const pub=crypto.createPublicKey(key).export({format:'der',type:'spki'});
       if(!crypto.timingSafeEqual(pub.subarray(-32),bytes.subarray(32)))return {...base,reason:'invalid_ed25519_key'};
     }
   }
   const keyType=key.asymmetricKeyType;
   if(!['ec','ed25519'].includes(String(keyType)))return {...base,reason:'unsupported_key_type'};
   const nonce=crypto.randomBytes(14).toString('hex');
   const ts=Math.floor(Date.now()/1000);
   const header={alg:keyType==='ed25519'?'EdDSA':'ES256',typ:'JWT',kid,nonce};
   const message={sub:kid,iss:'cdp',nbf:ts,exp:ts+110,uri:'GET api.coinbase.com/api/v3/brokerage/accounts'};
   const enc=(input:any)=>Buffer.from(JSON.stringify(input)).toString('base64url');
   const unsigned=enc(header)+'.'+enc(message);
   const signature=crypto.sign(keyType==='ed25519'?null:'sha256',Buffer.from(unsigned),
      keyType==='ed25519'?key:{key,dsaEncoding:'ieee-p1363'}).toString('base64url');
   const token=unsigned+'.'+signature;
   const url='https://api.coinbase.com/api/v3/brokerage/accounts?limit=100';
   const response=await fetch(url,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},
     signal:AbortSignal.timeout(9000)});
   if(!response.ok) return {...base,reason:response.status===401?'authentication_failed':response.status===403?'insufficient_permission':'connection_unverified'};
   const body:any=await response.json();
   if(body.has_next) return {...base,reason:'pagination_not_verified'};
   const sums:Record<string,number>={USD:0,USDC:0,USDT:0};
   for(const row of Array.isArray(body.accounts)?body.accounts:[]){
     const currency=String(row?.currency||'').toUpperCase();
     if(!(currency in sums))continue;
     const n=Number(row?.available_balance?.value??0);
     if(Number.isFinite(n)&&n>=0)sums[currency]+=n;
   }
   return {...base,connected:true,reason:'balance_read_ok',balanceKind:'available_balance',
     balances:{USD:cexMoney(sums.USD)||'0.00',USDC:cexMoney(sums.USDC)||'0.00',USDT:cexMoney(sums.USDT)||'0.00'}};
 }catch(error){return {...base,reason:cleanBrokerError(error)}}
}
async function readBrokerStatuses(refresh=false):Promise<any>{
 if(!refresh && brokerStatuses.data && Date.now()-brokerStatuses.at<30000)return brokerStatuses.data;
 const [kraken,coinbase]=await Promise.all([probeKrakenSpot(),probeCoinbaseAdvanced()]);
 const response={ok:true,mode:'read_only',updatedAt:Date.now(),accounts:{kraken,coinbase},
   usFutures:{name:'Kraken Derivatives US',connected:false,accountVerified:false,
     ordersEnabled:false,reason:'derivatives_api_not_verified'},
   transfersEnabled:false,ordersEnabled:false};
 brokerStatuses.data=response;brokerStatuses.at=Date.now();return response;
}

type KrakenConfirmation={
  preview:any,expiresAt:number,used:boolean,clientOrderId:string,
  validatedAt?:number,validating?:boolean
};
const krakenConfirmations=new Map<string,KrakenConfirmation>();
const KRAKEN_CONFIRM_TTL_MS=10*60*1000;

async function prepareKrakenOrder(payload:any) {
  const asset=String(payload?.asset||payload?.symbol||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const direction=String(payload?.direction||'').toUpperCase();
  const amount=Number(payload?.amount), leverage=Number(payload?.leverage), stop=Number(payload?.stopLoss), target=Number(payload?.takeProfit);
  // A Hunter entry is a research quote. Compare against the appropriate Kraken ask/bid.
  const proposedEntry=Number(payload?.setupEntry||payload?.entry||0);
  if(!asset) throw new Error('invalid_asset');
  if(!['LONG','SHORT'].includes(direction)) throw new Error('invalid_direction');
  if(![amount,leverage,stop,target].every(x=>Number.isFinite(x)&&x>0)) throw new Error('invalid_order_values');
  const market=await krakenTicker(asset);
  const {pair}=market;
  const mark=krakenExecutablePrice(market,direction as 'LONG'|'SHORT');
  if(!Number.isFinite(mark)||mark<=0) throw new Error('kraken_live_margin_quote_unavailable');
  const buys=(pair.leverage_buy||[]).map(Number), sells=(pair.leverage_sell||[]).map(Number);
  const allowed=direction==='LONG'?buys:sells;
  if(!allowed.includes(leverage)) throw new Error('kraken_leverage_not_supported');
  // Reject stale setups; never silently move stop-loss or take-profit levels.
  const protection=assessKrakenProtection({
    direction:direction as 'LONG'|'SHORT',proposedEntry,liveQuote:mark,
    stop,target,pair:String(pair.altname||asset)
  });
  if(!protection.ok)throw new Error(protection.message);
  const maxNotional=Number(process.env.AURELIS_KRAKEN_MAX_NOTIONAL_USD||1000);
  const maxLev=Number(process.env.AURELIS_KRAKEN_MAX_LEVERAGE||10);
  // Manual test limits, independent of deployment flags.
  // This is a NOTIONAL cap (not a margin/deposit cap).
  if(amount>10 || amount<10)throw new Error('manual_test_notional_must_be_exactly_10_usd');
  if(leverage>2)throw new Error('manual_test_maximum_leverage_2x');
  if((direction==='LONG'?Math.abs(mark-stop)/mark:Math.abs(stop-mark)/mark)>0.05)
    throw new Error('manual_test_stop_must_be_within_5_percent');
  if(amount>maxNotional) throw new Error('kraken_notional_limit');
  if(leverage>maxLev) throw new Error('kraken_leverage_limit');
  const trade=await krakenPrivate('/0/private/TradeBalance',{asset:'ZUSD'});
  const free=Number(trade?.mf||0), margin=amount/leverage;
  if(free<margin) throw new Error(`kraken_insufficient_free_margin:requires_${margin.toFixed(2)}_USD:available_${free.toFixed(2)}_USD`);
  const lotDecimals=Number(pair.lot_decimals||8), pairDecimals=Number(pair.pair_decimals||5);
  // Rounding DOWN avoids exceeding $10 at the quoted price.
  const scale=10**Math.min(12,Math.max(0,lotDecimals));
  const quantity=(Math.floor((amount/mark)*scale)/scale).toFixed(lotDecimals);
  if(Number(quantity)<=0 || (Number(pair.ordermin||0)>0&&Number(quantity)<Number(pair.ordermin)))
    throw new Error('kraken_10_usd_test_below_minimum_coin_quantity_choose_different_pair');
  const costMin=Number(pair.costmin||0);
  const estimatedCost=Number(quantity)*mark;
  if(Number.isFinite(costMin)&&costMin>0&&estimatedCost<costMin)
    throw new Error('kraken_10_usd_test_below_exchange_cost_minimum_choose_different_pair');
  if(pair.status && String(pair.status)!=='online')
    throw new Error('kraken_margin_pair_not_currently_open_for_trading');
  const preview={
    symbol:pair.altname, pairId:pair.pairId, asset,direction,markPrice:String(mark),
    positionValueUsd:String(amount),estimatedMarginUsd:String(margin),freeMarginUsd:String(free),
    quoteSource:direction==='LONG'?'Kraken BTNL buy ask':'Kraken BTNL sell bid',
    quantity,leverage:String(Math.trunc(leverage)),stopLoss:stop.toFixed(pairDecimals),
    takeProfit:target.toFixed(pairDecimals),orderMinimum:pair.ordermin||null,
    exchangeMinimumCost:pair.costmin||null,estimatedEntryNotionalUsd:estimatedCost.toFixed(2),
    lotDecimals,pairDecimals,broker:'Kraken Spot Margin (NOT US Futures)',
    conditionalClose:{orderType:'stop-loss',triggerPrice:stop.toFixed(pairDecimals),activation:'after_primary_fill'},
    protectionType:'kraken_conditional_stop_only',
    takeProfitIsEstimateOnly:true
  };
  const token=crypto.randomBytes(32).toString('base64url');
  krakenConfirmations.set(token,{
    preview,expiresAt:Date.now()+90000,used:false,
    clientOrderId:'aur'+crypto.randomBytes(7).toString('hex').slice(0,14)
  });
  return {ok:true,provider:'KRAKEN_MARGIN',preview,signal:payload?.signal||{},confirmation:{token,expiresInSeconds:90},execution:{configured:true,readOnlyPreview:!krakenLiveExecutionPermitted(process.env.AURELIS_KRAKEN_MARGIN_EXECUTION_ENABLED),
    conditionalStopRequestedOnSubmission:true,takeProfitOrderSubmitted:false,maxNotionalUsd:String(maxNotional),maxLeverage:String(maxLev)}};
}

// Kraken REST AddOrder with validate=true checks exchange order parameters
// WITHOUT placing a trade. Use identical protected parameters at eventual submission.
function krakenProtectedOrderPayload(item:KrakenConfirmation):Record<string,string>{
  const p=item.preview;
  const value=Number(p.positionValueUsd),lev=Number(p.leverage);
  if(!Number.isFinite(value)||value!==10||!Number.isFinite(lev)||lev<1||lev>2)
    throw new Error('manual_test_risk_limit_exceeded');
  const stop=Number(p?.conditionalClose?.triggerPrice);
  if(p?.conditionalClose?.orderType!=='stop-loss'||!Number.isFinite(stop)||stop<=0)
    throw new Error('conditional_stop_missing');
  if(!Number.isFinite(Number(p.quantity))||Number(p.quantity)<=0)
    throw new Error('kraken_order_quantity_invalid');
  if(!/^aur[a-f0-9]{14}$/.test(item.clientOrderId))
    throw new Error('kraken_order_client_id_invalid');
  return {
    ordertype:'market',type:p.direction==='LONG'?'buy':'sell',
    volume:String(p.quantity),pair:String(p.symbol),leverage:String(p.leverage),
    'close[ordertype]':'stop-loss','close[price]':String(p.conditionalClose.triggerPrice),
    cl_ord_id:item.clientOrderId
  };
}

// The signed owner calls this only after reviewing a fresh Kraken preview.
// 'validate=true' is sent to Kraken; neither AURELIS nor Kraken creates an order.
async function validateKrakenPreparedOrder(payload:any){
  const token=String(payload?.confirmationToken||'');
  const item=krakenConfirmations.get(token);
  if(!item||Date.now()>item.expiresAt)throw new Error('trade_confirmation_expired');
  if(item.used)throw new Error('trade_confirmation_used');
  if(item.validating)throw new Error('kraken_validation_already_in_progress');
  item.validating=true;
  item.validatedAt=undefined;
  try{
    const order=krakenProtectedOrderPayload(item);
    const mark=krakenExecutablePrice(await krakenTicker(item.preview.asset),item.preview.direction);
    const original=Number(item.preview.markPrice);
    if(!Number.isFinite(mark)||!Number.isFinite(original)||original<=0 ||
       Math.abs(mark/original-1)*100>1)
      throw new Error('kraken_price_moved_repreview');
    const stop=Number(item.preview.conditionalClose.triggerPrice);
    if((item.preview.direction==='LONG'&&stop>=mark)||
       (item.preview.direction==='SHORT'&&stop<=mark))
      throw new Error('kraken_stop_not_protective_at_current_mark');
    const result:any=await krakenPrivate('/0/private/AddOrder',{...order,validate:'true'});
    // Kraken validation usually returns a description but no order ID.
    if(result?.txid?.length)throw new Error('unexpected_order_id_from_validate_only');
    // The signed preview might expire while Kraken's API is answering.
    if(Date.now()>item.expiresAt)throw new Error('trade_confirmation_expired_during_validation');
    item.validatedAt=Date.now();
    return {
      ok:true,validated:true,orderPlaced:false,krakenValidationOnly:true,
      validatedAt:item.validatedAt,expiresAt:Math.min(item.expiresAt,item.validatedAt+30000),
      exchangeDescription: {
        entry:String(result?.descr?.order||'Kraken validated market entry parameters'),
        conditionalStop:String(result?.descr?.close||'Conditional stop requested')
      },
      manualApprovalStillRequired:true,
      takeProfitOrderPlaced:false,
      warning:'Kraken validated parameters without placing any trade. This does not verify a fill or an activated protective stop.'
    };
  }finally{item.validating=false}
}

async function submitKrakenOrder(payload:any) {
  // Broker entry orders do not automatically install protective stop/target orders.
  // Keep submission disabled until a protected, owner-authorized order lifecycle is verified.
  // A flag alone cannot activate REST entries while stop + target lifecycle
  // is still unverified. This is a hard code gate, not a deployment toggle.
  if (!KRAKEN_LINKED_OCO_LIFECYCLE_VERIFIED)
    throw new Error('kraken_linked_stop_target_lifecycle_unverified');
  if(process.env.AURELIS_KRAKEN_MARGIN_EXECUTION_ENABLED!=='1'){
    throw new Error('kraken_margin_execution_unverified_disabled');
  }

  if(payload?.acknowledgeLiveTest!==true)throw new Error('manual_live_test_approval_required');
  const token=String(payload?.confirmationToken||'');
  const item=krakenConfirmations.get(token);
  if(!item || Date.now()>item.expiresAt) throw new Error('trade_confirmation_expired');
  if(item.used) throw new Error('trade_confirmation_used');
  if(!item.validatedAt||Date.now()-item.validatedAt>30000)
    throw new Error('kraken_validation_required_or_expired');
  item.used=true;
  const p=item.preview;
  if(Number(p.positionValueUsd)>10||Number(p.positionValueUsd)<10||Number(p.leverage)>2)
    throw new Error('manual_test_risk_limit_exceeded');
  const side=p.direction==='LONG'?'buy':'sell';
  // Refuse to submit an entry unless a Kraken-side OTO stop was included at preparation.
  if(p?.conditionalClose?.orderType!=='stop-loss' ||
    !Number.isFinite(Number(p.conditionalClose.triggerPrice)) ||
    Number(p.conditionalClose.triggerPrice)<=0) throw new Error('conditional_stop_missing');
  // A fresh market price check prevents execution after a stale recommendation.
  const current=await krakenTicker(p.asset);
  const newMark=krakenExecutablePrice(current,p.direction);
  const oldMark=Number(p.markPrice);
  const maxDrift=Number(process.env.AURELIS_KRAKEN_MAX_MARK_DRIFT_PCT||1.0);
  if(!Number.isFinite(newMark)||!Number.isFinite(oldMark)||oldMark<=0 ||
     Math.abs(newMark/oldMark-1)*100>maxDrift)throw new Error('kraken_price_moved_repreview');
  const stopPrice=Number(p.conditionalClose.triggerPrice);
  if((p.direction==='LONG' && stopPrice>=newMark)||
     (p.direction==='SHORT' && stopPrice<=newMark))throw new Error('stop_price_invalid_at_execution');
  const exactProtectedOrder=krakenProtectedOrderPayload(item);
  // Revalidate the EXACT protected order at Kraken immediately before entry.
  // Future activation stays blocked by AURELIS_KRAKEN_MARGIN_EXECUTION_ENABLED.
  const checked:any=await krakenPrivate('/0/private/AddOrder',{...exactProtectedOrder,validate:'true'});
  if(checked?.txid?.length)throw new Error('unexpected_order_id_from_validate_only');
  const entry=await krakenPrivate('/0/private/AddOrder',exactProtectedOrder);
  return {ok:true,provider:'KRAKEN_MARGIN',entry,preview:p,
    protection:'Kraken conditional stop requested, activated after primary fill; monitor live order status.',
    takeProfitOrderPlaced:false,submittedAt:Date.now()};
}

const AAVE_MCP_DEFAULT_ENDPOINT='https://mcp.aave.com';
const AAVE_MCP_TIMEOUT_MS=12000;
let aaveToolCache:{at:number,names:Set<string>,raw:any}|null=null;

export function isAaveAgentEnabled():boolean {
  return ['1','true','yes','on'].includes(String(process.env.AURELIS_AAVE_AGENT_ENABLED||'').trim().toLowerCase());
}

function aaveEndpoint():string {
  const configured=String(process.env.AURELIS_AAVE_MCP_URL||AAVE_MCP_DEFAULT_ENDPOINT).trim();
  return configured||AAVE_MCP_DEFAULT_ENDPOINT;
}

async function aaveFetch(endpoint:string,headers:Record<string,string>,payload:any,timeoutMs=AAVE_MCP_TIMEOUT_MS) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response=await fetch(endpoint,{
      method:'POST',
      headers,
      body:JSON.stringify(payload),
      signal:controller.signal,
    });
    const text=await response.text();
    const body=safeJson(text,{});
    if(response.status===429) throw new Error('aave_mcp_rate_limited');
    if(response.status===401) throw new Error('aave_mcp_unauthorized');
    if(!response.ok) throw new Error(String(body?.error?.message||body?.error||'aave_mcp_http_'+response.status));
    return {response,body};
  } catch(e:any) {
    if(e?.name==='AbortError') throw new Error('aave_mcp_timeout');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function aaveSession() {
  const endpoint=aaveEndpoint();
  const headers:Record<string,string>={
    Accept:'application/json, text/event-stream',
    'Content-Type':'application/json',
    'User-Agent':'AURELIS-vNext/1.0'
  };
  const {response,body}=await aaveFetch(endpoint,headers,{
    jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'AURELIS-vNext',version:'1.0'}}
  });
  const sid=response.headers.get('mcp-session-id');
  if(!sid||!body?.result) throw new Error('aave_mcp_init_failed');
  headers['mcp-session-id']=sid;
  await aaveFetch(endpoint,headers,{jsonrpc:'2.0',method:'notifications/initialized',params:{}},5000).catch(()=>{});
  return {endpoint,headers};
}

async function aaveTools(session:any,force=false) {
  if(!force&&aaveToolCache&&Date.now()-aaveToolCache.at<300000)return aaveToolCache;
  const {body}=await aaveFetch(session.endpoint,session.headers,{jsonrpc:'2.0',id:2,method:'tools/list',params:{}});
  const tools=Array.isArray(body?.result?.tools)?body.result.tools:[];
  const cache={at:Date.now(),names:new Set<string>(tools.map((t:any)=>String(t?.name||'')).filter(Boolean)),raw:tools};
  aaveToolCache=cache;
  return cache;
}

async function aaveTool(session:any,name:string,args:any,id:number) {
  const capabilities=await aaveTools(session);
  if(!capabilities.names.has(name))throw new Error('aave_mcp_tool_unavailable:'+name);
  const {body:env}=await aaveFetch(session.endpoint,session.headers,{jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}});
  if(env?.error) throw new Error(String(env.error?.message||env.error));
  const result=env?.result||{};
  if(result.isError) {
    const text=(result.content||[]).map((x:any)=>x?.text).filter(Boolean).join(' ');
    throw new Error(text||'aave_mcp_tool_error');
  }
  if(result.structuredContent && typeof result.structuredContent==='object') return result.structuredContent;
  for(const item of result.content||[]) if(item?.type==='text') { const v=safeJson(item.text,null); if(v) return v; }
  throw new Error('aave_mcp_no_data');
}

export async function getAaveAgentCapabilities() {
  if(!isAaveAgentEnabled())return {enabled:false,endpoint:aaveEndpoint(),tools:[]};
  const session=await aaveSession();
  const tools=await aaveTools(session,true);
  return {
    enabled:true,
    endpoint:aaveEndpoint(),
    tools:Array.from(tools.names).sort(),
    readOnlyByDefault:true,
    signing:'external-wallet-required',
    submissionEnabled:false,
  };
}

function aaveRequestedSymbols(message:string):string[] {
  const known=['USDC','USDT','DAI','GHO','ETH','WETH','WBTC','BTC','AAVE','LINK','UNI','LDO','CRV','USDE','PYUSD','EURC'];
  const raw=String(message||'');
  const upper=raw.toUpperCase();
  return known.filter(sym=>{
    if(!new RegExp('\b'+sym+'\b').test(upper))return false;
    if(sym!=='AAVE')return true;
    return /\$AAVE|AAVE\s+TOKEN|(?:SUPPLY|DEPOSIT|LEND|BORROW|WITHDRAW|REPAY)\s+(?:ANOTHER\s+)?(?:[0-9.,]+\s+)?AAVE/i.test(raw);
  }).slice(0,4);
}

function aaveRequestedChainId(message:string):number|undefined {
  const s=String(message||'').toLowerCase();
  const pairs:[RegExp,number][]=[
    [/\\bethereum\\b|\\bmainnet\\b/,1],
    [/\\barbitrum\\b/,42161],
    [/\\bbase\\b/,8453],
    [/\\bavalanche\\b|\\bavax\\b/,43114],
    [/\\boptimism\\b/,10],
    [/\\bpolygon\\b/,137],
    [/\\barc\\b/,5042],
  ];
  return pairs.find(([re])=>re.test(s))?.[1];
}

function aaveActionRequest(message:string):{action:'supply'|'borrow'|'withdraw'|'repay';amount?:string;symbol?:string;max?:boolean}|null {
  const s=String(message||'').trim();
  const m=s.match(/\\b(supply|deposit|lend|borrow|withdraw|repay)\\b/i);
  if(!m)return null;
  const raw=m[1].toLowerCase();
  const action=raw==='deposit'||raw==='lend'?'supply':raw as 'supply'|'borrow'|'withdraw'|'repay';
  const max=/\\b(all|max|maximum|entire)\\b/i.test(s);
  const after=s.slice((m.index||0)+m[0].length);
  const amountMatch=after.match(/(?:another\\s+)?([0-9][0-9,]*(?:\\.[0-9]+)?)/i);
  const amount=amountMatch?amountMatch[1].replace(/,/g,''):undefined;
  const symbols=aaveRequestedSymbols(s);
  return {action,amount,symbol:symbols[0],max};
}

function flattenAaveMarkets(payload:any):any[] {
  const data=payload?.data||payload||{};
  const rows:any[]=[];
  for(const version of ['v4','v3']) {
    const section=data?.[version];
    for(const market of section?.markets||[]) {
      if(version==='v4') rows.push({...market,version});
      else {
        for(const reserve of market?.reserves||[]) rows.push({...reserve,version,market:market?.market,chainId:market?.chainId});
      }
    }
  }
  return rows;
}

function aaveCapacity(row:any,action:string):number {
  if(action==='supply') return Number(row?.suppliable ?? row?.availableLiquidity ?? 0);
  if(action==='borrow') return Number(row?.borrowable ?? row?.availableLiquidity ?? 0);
  return Number.POSITIVE_INFINITY;
}

export async function runAaveAgentQuery(message:string,walletAddress?:string|null) {
  const text=String(message||'').trim();
  if(!text)return null;
  const lower=text.toLowerCase();
  const namesAave=/\baave\b/i.test(text);
  const protocolIntent=/health factor|lending rate|borrow rate|supply rate|\bapy\b|\byield\b|\bliquidity\b|\bborrow\b|\bsupply\b|\bdeposit\b|\blend\b|\bwithdraw\b|\brepay\b|\bposition(?:s)?\b|\bdebt\b|\bcollateral\b/i.test(text);
  const asksAave=(namesAave&&protocolIntent)||/health factor|aave position|aave debt|aave collateral/i.test(text);
  const action=namesAave?aaveActionRequest(text):null;
  if(!asksAave)return null;

  const session=await aaveSession();
  let id=2;
  const chainId=aaveRequestedChainId(text);
  const symbols=aaveRequestedSymbols(text);

  if(/health factor|health|position|positions|debt|collateral|net worth/i.test(lower)) {
    if(!walletAddress)return {ok:false,kind:'wallet_required',message:'Connect or authenticate the AURELIS wallet to inspect Aave positions.'};
    const [summary,positions]=await Promise.all([
      aaveTool(session,'get_user_summary',{user:walletAddress,version:'all',...(chainId?{chainId}:{})},id++),
      aaveTool(session,'get_user_positions',{user:walletAddress,version:'all',...(chainId?{chainId}:{})},id++),
    ]);
    return {ok:true,kind:'position',source:'Aave MCP',wallet:walletAddress,summary,positions};
  }

  if(action) {
    if(!walletAddress)return {ok:false,kind:'wallet_required',message:'Connect or authenticate the AURELIS wallet before simulating or preparing an Aave action.'};
    if(!action.symbol)return {ok:false,kind:'needs_asset',message:`Specify the asset for the Aave ${action.action} action.`};
    if(!action.amount && !action.max)return {ok:false,kind:'needs_amount',message:`Specify an amount for the Aave ${action.action} action.`};

    if(action.action==='withdraw'||action.action==='repay') {
      const positions=await aaveTool(session,'get_user_positions',{user:walletAddress,version:'all',...(chainId?{chainId}:{})},id++);
      return {
        ok:true,
        kind:'position_selection_required',
        source:'Aave MCP',
        action:action.action,
        requested:action,
        positions,
        message:'Aave requires the reserveId from the wallet position for withdraw/repay. The agent has loaded the positions but will not guess which spoke/reserve to exit.',
      };
    }

    const markets=await aaveTool(session,'get_markets',{version:'all',symbols:[action.symbol],user:walletAddress,...(chainId?{chainId}:{})},id++);
    let candidates=flattenAaveMarkets(markets).filter((row:any)=>{
      const can=action.action==='supply'?row?.canSupply!==false:row?.canBorrow!==false;
      const amount=Number(action.amount||0);
      const symbolMatches=String(row?.symbol||'').toUpperCase()===String(action.symbol||'').toUpperCase();
      return symbolMatches && can && (!chainId||Number(row?.chainId)===chainId) && (!amount||aaveCapacity(row,action.action)>=amount);
    });

    candidates=candidates.slice(0,20);
    if(candidates.length!==1) {
      return {
        ok:true,
        kind:'reserve_selection_required',
        source:'Aave MCP',
        action:action.action,
        requested:action,
        candidates,
        message:candidates.length
          ? 'Multiple valid Aave reserves match this request. Choose the chain/spoke before simulation or preparation.'
          : 'No Aave reserve currently matches the requested asset, chain, amount, and action.',
      };
    }

    const row=candidates[0];
    const selector=row.version==='v4'
      ? {version:'v4',reserveId:String(row.reserveId)}
      : {version:'v3',market:String(row.market),token:String(row.underlyingToken||row.token||row.address),chainId:Number(row.chainId)};
    const args:any={
      action:action.action,
      sender:walletAddress,
      ...(action.max?{max:true}:{amount:String(action.amount)}),
      ...selector,
    };
    const preview=await aaveTool(session,'preview_action',args,id++);
    const wantsPrepare=/\\bprepare|build|ready to sign|unsigned transaction|transaction\\b/i.test(lower);
    const prepared=wantsPrepare?await aaveTool(session,'prepare_action',args,id++):null;
    return {ok:true,kind:prepared?'prepared_action':'preview_action',source:'Aave MCP',requested:action,reserve:row,preview,prepared};
  }

  const marketArgs:any={version:'all'};
  if(symbols.length)marketArgs.symbols=symbols;
  if(chainId)marketArgs.chainId=chainId;
  if(walletAddress && /can i|my wallet|available to me|balance/i.test(lower))marketArgs.user=walletAddress;
  const markets=await aaveTool(session,'get_markets',marketArgs,id++);
  return {ok:true,kind:'markets',source:'Aave MCP',markets};
}

async function morphoMarkets(chains:number[]) {
  const gql=`query BorrowMarkets($chains:[Int!]) {
    markets(first: 1000, orderBy: SupplyAssetsUsd, orderDirection: Desc, where: {listed: true, chainId_in: $chains}) {
      items { marketId chain { id network } lltv loanAsset { address symbol decimals price { usd timestamp } }
      collateralAsset { address symbol decimals price { usd timestamp } }
      state { borrowApy avgBorrowApy avgNetBorrowApy liquidityAssets liquidityAssetsUsd utilization } }
    }
  }`;
  const payload=await fetchJson('https://api.morpho.org/graphql',{
    method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},
    body:JSON.stringify({query:gql,variables:{chains}})
  },15000);
  return payload?.data?.markets?.items||[];
}

const chainNames:Record<number,string>={1:'Ethereum',10:'Optimism',56:'BNB Chain',100:'Gnosis',130:'Unichain',137:'Polygon',143:'Monad',146:'Sonic',196:'X Layer',999:'HyperEVM',1088:'Metis',1868:'Soneium',42220:'Celo',42161:'Arbitrum',43114:'Avalanche',4663:'Robinhood Chain',5000:'Mantle',8453:'Base',324:'zkSync Era',4326:'MegaETH',5042:'Arc',9745:'Plasma',57073:'Ink',534352:'Scroll',59144:'Linea',747474:'Katana'};

async function buildBorrowCatalog() {
  const errors:any[]=[];
  let morpho:any[]=[];
  let aave:any[]=[];
  try {
    const rows=await morphoMarkets([1,10,130,137,143,999,4663,5042,8453,42161,747474]);
    morpho=rows.map((item:any)=>({
      provider:'Morpho',chainId:Number(item?.chain?.id||0),marketId:item.marketId,
      collateral:item?.collateralAsset?.symbol,borrow:item?.loanAsset?.symbol,
      borrowApy:item?.state?.borrowApy,liquidityUsd:item?.state?.liquidityAssetsUsd,
      liquidityAssets:item?.state?.liquidityAssets,utilization:item?.state?.utilization,
      lltv:item?.lltv,source:'morpho_api'
    }));
  } catch(e:any){errors.push({provider:'Morpho',error:String(e?.message||e).slice(0,180)})}
  try {
    const s=await aaveSession(); let id=2;
    const chains=await aaveTool(s,'get_chains',{version:'v3'},id++);
    const rows=chains?.data?.v3||chains?.v3||[];
    for(const ch of rows.slice(0,25)) {
      const chainId=Number(ch?.chainId); if(!chainId) continue;
      const response=await aaveTool(s,'get_markets',{version:'v3',chainId},id++);
      const root=response?.data||response; const section=root?.v3||{};
      for(const market of section?.markets||[]) for(const reserve of market?.reserves||[]) {
        aave.push({
          provider:'Aave',version:'V3',chainId:Number(market?.chainId||chainId),
          market:market?.market,collateral:reserve?.symbol,borrow:reserve?.symbol,
          canUseAsCollateral:!!reserve?.canUseAsCollateral,canSupply:reserve?.canSupply!==false,
          canBorrow:!!reserve?.canBorrow,isFrozen:!!reserve?.isFrozen,isPaused:!!reserve?.isPaused,
          borrowCapReached:!!reserve?.borrowCapReached,source:'aave_mcp'
        });
      }
    }
  } catch(e:any){errors.push({provider:'Aave',error:String(e?.message||e).slice(0,180)})}
  for(const row of [...morpho,...aave]) row.network=chainNames[Number(row.chainId)]||String(row.chainId||'Unknown');
  const collateral=new Map<string,any>(), borrow=new Map<string,any>();
  const add=(map:Map<string,any>,sym:string,provider:string,network:string)=>{
    if(!sym)return; if(!map.has(sym))map.set(sym,{symbol:sym,providers:new Set<string>(),networks:new Set<string>()});
    const e=map.get(sym); e.providers.add(provider); if(network)e.networks.add(network);
  };
  for(const row of morpho){add(collateral,row.collateral,'Morpho',row.network);add(borrow,row.borrow,'Morpho',row.network)}
  for(const row of aave){
    if(row.collateral && row.canSupply && !row.isFrozen && !row.isPaused)add(collateral,row.collateral,'Aave',row.network);
    if(row.borrow && row.canBorrow && !row.isPaused && !row.borrowCapReached)add(borrow,row.borrow,'Aave',row.network);
  }
  const clean=(m:Map<string,any>)=>Array.from(m.values()).map((x:any)=>({symbol:x.symbol,providers:Array.from(x.providers).sort(),networks:Array.from(x.networks).sort()})).sort((a,b)=>a.symbol.localeCompare(b.symbol));
  return {ok:!!(morpho.length||aave.length),generatedAt:Date.now(),providers:{Aave:{marketRows:aave.length,source:'Official Aave MCP'},Morpho:{marketRows:morpho.length,source:'Official Morpho API'}},collateralAssets:clean(collateral),borrowAssets:clean(borrow),aave,morpho,errors};
}

let borrowCache:{at:number,payload:any}|null=null;

function registerMarketAndBotRoutes(app:Express) {
  app.get('/api/crypto-news', async (_req,res)=>{
    const feeds:[string,string][]=[
      ['Cointelegraph','https://cointelegraph.com/rss'],
      ['Decrypt','https://decrypt.co/feed'],
      ['CryptoSlate','https://cryptoslate.com/feed/'],
      ['NewsBTC','https://www.newsbtc.com/feed/'],
      ['Bitcoin Magazine','https://bitcoinmagazine.com/.rss/full/'],
      ['BeInCrypto','https://beincrypto.com/feed/'],
      ['The Defiant','https://thedefiant.io/api/feed'],
      ['Crypto Briefing','https://cryptobriefing.com/feed/'],
      ['CoinDesk','https://www.coindesk.com/arc/outboundfeeds/rss/'],
    ];
    const articles:any[]=[];
    const clean=(s:string)=>String(s||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
    for(const [source,url] of feeds){
      try{
        const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),10000);
        const response=await fetch(url,{headers:{'User-Agent':'AURELIS-vNext/1.0'},signal:controller.signal}); clearTimeout(timer);
        if(!response.ok)continue; const xml=await response.text();
        const items=xml.match(/<item\b[\s\S]*?<\/item>/gi)||[];
        for(const item of items.slice(0,8)){
          const pick=(tag:string)=>{const m=item.match(new RegExp('<'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+tag+'>','i'));return clean(m?.[1]||'')};
          const title=pick('title'),link=pick('link'),published=pick('pubDate');
          const imageMatch=item.match(/<(?:media:content|media:thumbnail|enclosure)\b[^>]*\burl=["']([^"']+)["'][^>]*>/i);
          if(title&&link)articles.push({title,url:link,source,published,image:imageMatch?.[1]||null});
        }
      }catch{}
    }
    if(articles.length){
      articles.sort((a:any,b:any)=>Number(new Date(b.published||0))-Number(new Date(a.published||0)));
      const seen=new Set<string>();
      const deduped=articles.filter((a:any)=>{
        const key=String(a.url||a.title||'').toLowerCase().replace(/[#?].*$/,'');
        if(!key||seen.has(key))return false; seen.add(key); return true;
      });
      return res.json(deduped.slice(0,36));
    }
    return sendNoStore(res,{ok:false,error:'crypto_news_unavailable'},502);
  });

  app.get('/api/coin-ohlc', async (req,res)=>{
    const symbol=String(req.query.symbol||'BTC').toUpperCase().trim();
    const range=String(req.query.range||'1D').toUpperCase().trim();
    if(!/^[A-Z0-9]{1,24}$/.test(symbol)||!['4H','12H','1D','7D'].includes(range))return sendNoStore(res,{ok:false,error:'invalid_request'},400);
    try{return res.json(await coinOhlc(symbol,range))}catch(e:any){return sendNoStore(res,{ok:false,error:'ohlc_unavailable',detail:e?.message||String(e)},503)}
  });


  app.get('/api/bots/auth/status',(req,res)=>{
    const session=getVerifiedSession(req,res,'bots');
    const owner=String(process.env.AURELIS_BOTS_OWNER_WALLET_ADDRESS||'').trim().toLowerCase();
    const isOwner=Boolean(owner&&session?.purpose==='bots'&&String(session?.address||'').toLowerCase()===owner);
    return sendNoStore(res,{ok:true,ownerConfigured:Boolean(owner),verified:isOwner,
      purpose:session?.purpose||null,reason:isOwner?'authorized':
        !owner?'owner_not_configured':session?'different_wallet_or_purpose':'wallet_signature_required'});
  });

  app.get('/api/bots/exchange-accounts',async(req,res)=>{
    if(!requireBotAccountOwner(req,res))return;
    try{return sendNoStore(res,await readBrokerStatuses(req.query.refresh==='1'))}
    catch{return sendNoStore(res,{ok:false,error:'broker_status_unavailable'},502)}
  });
  // Exchange-verified deposit destinations. Only existing addresses are read: never auto-create.
  const oneKeyFundingNetworks:Record<string,{method:string;chainId:number;token:string}> = {
    ethereum:{method:'USDC - Ethereum (Unified)',chainId:1,token:'0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'},
    base:{method:'USDC - Base (Unified)',chainId:8453,token:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'}
  };
  app.get('/api/bots/kraken-deposit-destination',async(req,res)=>{
    if(!requireBotAccountOwner(req,res))return;
    const network=String(req.query.network||'').toLowerCase();
    const item=oneKeyFundingNetworks[network];
    if(!item)return sendNoStore(res,{ok:false,error:'unsupported_funding_network'},400);
    try{
      const methods:any[]=await krakenPrivate('/0/private/DepositMethods',{asset:'USDC'});
      if(!Array.isArray(methods)||!methods.some(m=>m?.method===item.method))
        return sendNoStore(res,{ok:false,error:'kraken_usdc_network_unavailable'},409);
      // new=false prevents silently generating unreviewed exchange deposit addresses.
      const addresses:any[]=await krakenPrivate('/0/private/DepositAddresses',
        {asset:'USDC',method:item.method,new:'false'});
      const candidate=Array.isArray(addresses)?addresses.find(r=>
        /^0x[a-f0-9]{40}$/i.test(String(r?.address||'')) && !r?.expiretm):null;
      const fallback=Array.isArray(addresses)?addresses.find(r=>
        /^0x[a-f0-9]{40}$/i.test(String(r?.address||'')) &&
        (!Number(r?.expiretm)||Number(r.expiretm)>Math.floor(Date.now()/1000)+3600)):null;
      const address=candidate?.address||fallback?.address;
      if(!address)return sendNoStore(res,{ok:false,error:'no_existing_kraken_deposit_address',
        next:'Create a USDC deposit address for the selected network in Kraken, then refresh.'},409);
      return sendNoStore(res,{ok:true,venue:'kraken',asset:'USDC',network,
        method:item.method,chainId:item.chainId,tokenContract:item.token,decimals:6,
        address,existingAddress:true,source:'Kraken authenticated deposit API',
        requiresUserSignature:true,transferSubmitted:false,
        warning:'Match network and token exactly. Send a small test amount first. Kraken may impose deposit minimums or hold periods.'});
    }catch(error){return sendNoStore(res,{ok:false,error:'kraken_deposit_address_unavailable',
        detail:cleanBrokerError(error)},502)}
  });
  // Both brokers' real open orders, account owner only. GET cannot change orders.
  app.get('/api/bots/open-orders',async(req,res)=>{
    if(!requireBotAccountOwner(req,res))return;
    const makeUnverified=(error:string)=>({ok:false,error,orders:[] as any[]});
    const [kraken,coinbase]=await Promise.all([
      (async()=>{
        try{
          const raw:any=await krakenPrivate('/0/private/OpenOrders',{});
          const rows=Object.entries(raw?.open||{}).slice(0,30).map(([id,row0])=>{
            const r:any=row0, info=r.descr||{};
            return {id,symbol:String(info.pair||''),side:String(info.type||''),
              type:String(info.ordertype||''),status:String(r.status||'open'),
              amount:Number(r.vol||0),filled:Number(r.vol_exec||0),
              remaining:Math.max(0,Number(r.vol||0)-Number(r.vol_exec||0)),
              price:Number(info.price||0),createdAt:Number(r.opentm||0)*1000};
          });
          return {ok:true,orders:rows};
        }catch{return makeUnverified('kraken_orders_unavailable')}
      })(),
      (async()=>{
        try{
          const token=fs.readFileSync('/home/ubuntu/.config/aurelis/coinbase-bridge.token','utf8').trim();
          if(!token)return makeUnverified('coinbase_bridge_unconfigured');
          const upstream=await fetch('http://127.0.0.1:8894/private/coinbase/open-orders',{
            headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
          if(!upstream.ok)return makeUnverified('coinbase_orders_unavailable');
          const response:any=await upstream.json();
          if(!response?.ok || !Array.isArray(response?.orders))
            return makeUnverified(String(response?.error||'coinbase_orders_unavailable').slice(0,60));
          return {ok:true,orders:response.orders.slice(0,30)};
        }catch{return makeUnverified('coinbase_orders_unavailable')}
      })()
    ]);
    return sendNoStore(res,{ok:true,mode:'read_only',updatedAt:Date.now(),
      venues:{kraken,coinbase},countByVenue:{kraken:kraken.orders.length,coinbase:coinbase.orders.length},
      note:'Open orders only, not completed trade history. A canceled order may already be partially filled.'});
  });

  app.get('/api/bots/kraken-deposit-history',async(req,res)=>{
    if(!requireBotAccountOwner(req,res))return;
    try{
      const raw:any[]=await krakenPrivate('/0/private/DepositStatus',{asset:'USDC'});
      const rows=(Array.isArray(raw)?raw:[]).slice(0,15).map(r=>({
        amount:Number(r.amount||0),status:String(r.status||'unknown'),
        time:Number(r.time||0),method:String(r.method||'unknown')
      }));
      return sendNoStore(res,{ok:true,asset:'USDC',rows,updatedAt:Date.now()});
    }catch(error){return sendNoStore(res,{ok:false,error:'deposit_status_unavailable',
      detail:cleanBrokerError(error)},502)}
  });

  app.get('/api/bots/funding-plan',async(req,res)=>{
    if(!requireBotAccountOwner(req,res))return;
    const required=Number(req.query.requiredUsd||100);
    if(!Number.isFinite(required)||required<5||required>10000)
      return sendNoStore(res,{ok:false,error:'invalid_required_usd'},400);
    const info=await readBrokerStatuses();
    const rows=(['kraken','coinbase'] as const).map(venue=>{
      const a:CexStatus=info.accounts[venue];
      if(!a.connected)return {venue,state:'needs_connection',shortfallUsd:null};
      // Total Kraken balances and available Coinbase balances cannot be directly equated
      // to exchange buying power or transferable assets.
      const observed=Number(a.balances?.USD||0)+Number(a.balances?.USDC||0);
      return {venue,state:'balance_review',observedUsdPlusUsdc:observed.toFixed(2),
        indicativeShortfallUsd:Math.max(0,required-observed).toFixed(2),shortfallUsd:null};
    });
    return sendNoStore(res,{ok:true,mode:'planning_only',requiredUsd:required,
      transfersEnabled:false,recommendations:rows,
      warning:'Indicative balances only. No guaranteed available trading collateral or verified deposit destination.'});
  });
  app.post('/api/bots/cex-order/preview',async(req,res)=>{
    if(!requireBotAccountOwner(req,res))return;
    const venue=String(req.body?.venue||'').toLowerCase();
    const strategy=String(req.body?.strategy||'').toLowerCase();
    const asset=String(req.body?.asset||'').toUpperCase();
    const quoteUsd=Number(req.body?.quoteUsd);
    if(!['kraken','coinbase'].includes(venue)||!['dca','grid'].includes(strategy)||
      !/^[A-Z0-9]{2,12}$/.test(asset)||!Number.isFinite(quoteUsd)||
      quoteUsd<5||quoteUsd>5000)
      return sendNoStore(res,{ok:false,error:'invalid_preview_request'},400);
    const info=await readBrokerStatuses();
    return sendNoStore(res,{ok:true,venue,strategy,asset,quoteUsd,connected:info.accounts[venue].connected,
      provider:info.accounts[venue].name,canSubmit:false,orderSubmitted:false,
      reason:'order_execution_not_yet_verified',mode:'preview_only',
      note:'No order sent. Grid requires live fill tracking, cancellation, and risk controls before enabling.'});
  });

  // Public, read-only market compatibility gate for Hunter -> Live Bet.
  // Does NOT query private balances, create a review token or place an order.
  app.get('/api/bots/kraken-margin-handoff/:asset', async(req,res)=>{
    const asset=String(req.params.asset||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    const direction=String(req.query.direction||'').toUpperCase();
    const entry=Number(req.query.entry),stop=Number(req.query.stop),
      target=Number(req.query.target),leverage=Number(req.query.leverage);
    if(!/^[A-Z0-9]{2,15}$/.test(asset)||!['LONG','SHORT'].includes(direction)||
       ![entry,stop,target,leverage].every(v=>Number.isFinite(v)&&v>0)||
       leverage>2||leverage<1)
      return sendNoStore(res,{ok:false,compatible:false,
        error:'invalid_hunter_margin_handoff_values'},400);
    try{
      const market=await krakenTicker(asset);
      const pair=market.pair||{};
      const pairName=String(pair.altname||pair.pairId||'');
      const allowed=(direction==='LONG'?pair.leverage_buy:pair.leverage_sell)||[];
      const permitted=allowed.map(Number).filter((x:number)=>Number.isFinite(x)&&x>0);
      // No ticker last-trade fallback. Real market entries require a live side quote.
      const bid=Number(market.ticker?.b?.[0]),ask=Number(market.ticker?.a?.[0]);
      const result=assessKrakenMarginHandoff({
        asset,pair:pairName,direction:direction as 'LONG'|'SHORT',
        setupEntry:entry,stop,target,bid,ask,leverage,
        allowedLeverages:permitted,
        marketStatus:String(pair.status||''),
        minimumBase:Number(pair.ordermin||0),
        minimumCost:Number(pair.costmin||0),
        lotDecimals:Number(pair.lot_decimals??8)
      });
      return sendNoStore(res,{
        ok:true,compatible:result.ok,code:result.code,reason:result.message,
        asset,pair:pairName,direction,venue:'Kraken US Spot/Margin BTNL',
        bid:Number.isFinite(bid)&&bid>0?bid:null,
        ask:Number.isFinite(ask)&&ask>0?ask:null,
        executableQuote:direction==='LONG'?(ask>0?ask:null):(bid>0?bid:null),
        quoteType:direction==='LONG'?'buy ask':'sell bid',
        proposedEntry:entry,stop,target,leverage,
        marketStatus:String(pair.status||'unknown'),checkedAt:Date.now(),
        eligibleExecutionVenue:/:BTNL$/i.test(pairName),
        supportsSelectedLeverage:permitted.includes(leverage),
        source:'kraken_public_market_data_only',
        orderPlaced:false
      });
    }catch(_error){
      return sendNoStore(res,{ok:false,compatible:false,
        error:'kraken_us_margin_handoff_quote_unavailable',
        message:'Kraken U.S. Spot/Margin quote could not be checked. No trade was sent.'},502);
    }
  });

  app.get('/api/trade-radar', async (req,res)=>{
    try {
      const q=new URLSearchParams({mode:String(req.query.mode||'all'),limit:String(req.query.limit||5),force:String(req.query.force||0)});
      const data=await fetchJson('http://127.0.0.1:8792/api/radar?'+q.toString(),{headers:{Accept:'application/json'}},55000);
      return sendNoStore(res,data);
    } catch(e:any){return sendNoStore(res,{ok:false,error:'trade_radar_unavailable',detail:e?.message||String(e)},502)}
  });

  app.get('/api/kraken/live-status', async (req,res)=>{
    if(!requireBotAccountOwner(req,res))return;
    try {
      const positionsRaw=await krakenPrivate('/0/private/OpenPositions',{docalcs:'true'});
      const ordersRaw=await krakenPrivate('/0/private/OpenOrders',{});
      const positions=Object.entries(positionsRaw||{}).map(([txid,row]:any)=>{
        const vol=Number(row?.vol||0),closed=Number(row?.vol_closed||0);
        return {
          txid,pair:String(row?.pair||'').split(':')[0],rawPair:String(row?.pair||''),side:String(row?.type||'').toLowerCase(),
          volume:vol,remaining:Math.max(0,vol-closed),cost:Number(row?.cost||0),
          margin:Number(row?.margin||0),value:Number(row?.value||0),pnl:Number(row?.net||0),
          openingPrice:Number(row?.cost||0)/(vol||1),rolloverTime:Number(row?.rollovertm||0),
          posstatus:String(row?.posstatus||'open')
        };
      }).filter((x:any)=>x.remaining>0);
      const open=ordersRaw?.open||{};
      const orders=Object.entries(open).map(([txid,row]:any)=>({
        txid,status:String(row?.status||'open'),pair:String(row?.descr?.pair||''),
        side:String(row?.descr?.type||''),orderType:String(row?.descr?.ordertype||''),
        price:Number(row?.descr?.price||0),volume:Number(row?.vol||0),
        filled:Number(row?.vol_exec||0),openedAt:Number(row?.opentm||0)
      }));
      const protection=auditKrakenMarginProtection(positions,orders);
      return sendNoStore(res,{ok:true,positions,orders,protection,updatedAt:Date.now()});
    } catch(e:any){return sendNoStore(res,{ok:false,error:e?.message||String(e)},502)}
  });

  app.post('/api/kraken/cancel-order', async (req,res)=>{
    if(!requireBotAccountOwner(req,res))return;
    const txid=String(req.body?.txid||'').trim();
    if(!txid)return sendNoStore(res,{ok:false,error:'invalid_order_id'},400);
    try {
      const result=await krakenPrivate('/0/private/CancelOrder',{txid});
      return sendNoStore(res,{ok:true,txid,result});
    } catch(e:any){return sendNoStore(res,{ok:false,error:e?.message||String(e)},409)}
  });

  app.post('/api/kraken/close-position', async (req,res)=>{
    if(!requireBotAccountOwner(req,res))return;
    const txid=String(req.body?.txid||'').trim();
    if(!txid)return sendNoStore(res,{ok:false,error:'invalid_position_id'},400);
    try {
      const positions:any=await krakenPrivate('/0/private/OpenPositions',{txid,docalcs:'true'});
      const row=positions?.[txid];
      if(!row)return sendNoStore(res,{ok:true,txid,alreadyClosed:true,message:'Position is no longer open.'});
      const vol=Number(row?.vol||0),closed=Number(row?.vol_closed||0);
      const remaining=Math.max(0,vol-closed);
      if(!(remaining>0))return sendNoStore(res,{ok:true,txid,alreadyClosed:true,message:'Position is already closed.'});
      const side=String(row?.type||'').toLowerCase()==='buy'?'sell':'buy';
      const pair=String(row?.pair||'').trim();
      if(!pair)return sendNoStore(res,{ok:false,error:'invalid_position_pair'},400);
      try {
        const result=await krakenPrivate('/0/private/AddOrder',{
          ordertype:'market',type:side,volume:String(remaining),pair,
          leverage:'2',reduce_only:'true',
          cl_ord_id:('aurclose'+Date.now().toString().slice(-8)).slice(0,18)
        });
        return sendNoStore(res,{ok:true,txid,pair,side,volume:remaining,result,submittedAt:Date.now()});
      } catch(orderError:any) {
        const message=String(orderError?.message||orderError);
        if(message.includes('Reduce only:Non-ECP') && !pair.includes(':BTNL')) {
          const retailPair=pair+':BTNL';
          const retry=await krakenPrivate('/0/private/AddOrder',{ordertype:'market',type:side,volume:String(remaining),pair:retailPair,leverage:'2',reduce_only:'true',cl_ord_id:('aurclose'+Date.now().toString().slice(-8)).slice(0,18)});
          return sendNoStore(res,{ok:true,txid,pair:retailPair,side,volume:remaining,result:retry,submittedAt:Date.now(),route:'BTNL'});
        }
        if(message.includes('Invalid position')) {
          const live:any=await krakenPrivate('/0/private/OpenPositions',{docalcs:'true'});
          if(!live?.[txid]) {
            return sendNoStore(res,{ok:true,txid,alreadyClosed:true,message:'Position closed before Kraken processed the follow-up request.'});
          }
        }
        throw orderError;
      }
    } catch(e:any){return sendNoStore(res,{ok:false,error:e?.message||String(e)},409)}
  });

  // Account-level execution readiness. READ ONLY. No order creation or validation.
  app.get('/api/bots/kraken-test-readiness',async(req,res)=>{
    if(!requireBotAccountOwner(req,res))return;
    try{
      const checks=await Promise.allSettled([
        krakenPrivate('/0/private/TradeBalance',{asset:'ZUSD'}),
        krakenPrivate('/0/private/OpenPositions',{docalcs:'true'}),
        krakenPrivate('/0/private/OpenOrders',{})
      ]);
      const names=['trade_balance','open_positions','open_orders'] as const;
      const checked=Object.fromEntries(checks.map((x,i)=>[
        names[i],{
          ok:x.status==='fulfilled',
          error:x.status==='rejected'
            ?String(x.reason?.message||x.reason||'').includes('Invalid nonce')
              ?'invalid_nonce':cleanBrokerError(x.reason):null
        }
      ]));
      const balance=checks[0].status==='fulfilled'?checks[0].value:null;
      const positions=checks[1].status==='fulfilled'?checks[1].value:null;
      const orders=checks[2].status==='fulfilled'?checks[2].value:null;
      const availableMargin=balance?Number(balance?.mf||0):NaN;
      const positionCount=positions?Object.keys(positions||{}).length:null;
      const openOrderCount=orders?Object.keys(orders?.open||{}).length:null;
      const allSucceeded=checks.every(x=>x.status==='fulfilled');
      return sendNoStore(res,{
        ok:true,venue:'Kraken Spot/Margin',checked,
        freeMarginAvailable:Number.isFinite(availableMargin)&&availableMargin>=0,
        freeMarginUsd:Number.isFinite(availableMargin)?availableMargin:null,
        freeMarginSufficientForTenDollarTest:Number.isFinite(availableMargin)&&availableMargin>=10,
        openMarginPositions:positionCount,openOrders:openOrderCount,
        testNotionalMaximumUsd:10,maxTestLeverage:2,
        accountClearForFirstTest:allSucceeded&&positionCount===0&&openOrderCount===0&&Number.isFinite(availableMargin)&&availableMargin>=10,
        liveOrdersEnabled:krakenLiveExecutionPermitted(process.env.AURELIS_KRAKEN_MARGIN_EXECUTION_ENABLED),
        linkedStopTargetVerified:KRAKEN_LINKED_OCO_LIFECYCLE_VERIFIED,
        executionBlockedReason:KRAKEN_LINKED_OCO_LIFECYCLE_VERIFIED?null:'linked_stop_target_lifecycle_unverified',
        usPerpsAccountVerified:false
      });
    }catch(error){
      return sendNoStore(res,{ok:false,error:'kraken_margin_readiness_unavailable',
        reason:cleanBrokerError(error)},502);
    }
  });

  app.get('/api/bots/kraken-execution-capability',async(req,res)=>{
    if(!requireBotAccountOwner(req,res))return;
    const enabled=krakenLiveExecutionPermitted(process.env.AURELIS_KRAKEN_MARGIN_EXECUTION_ENABLED);
    return sendNoStore(res,{ok:true,provider:'Kraken Spot/Margin',enabled,
      instrument:'spot_margin',usPerpetualsConnected:false,
      marketEntryWithConditionalStop:true,takeProfitAutomaticallyPlaced:false,
      linkedStopTargetVerified:KRAKEN_LINKED_OCO_LIFECYCLE_VERIFIED,
      blockedReason:enabled?null:'linked_stop_target_lifecycle_unverified',
      manualApprovalRequired:true,ordersTriggered:false});
  });

  app.post('/api/signal-desk/order/prepare', async (req,res)=>{
    if(!requireBotAccountOwner(req,res))return;
    try{return sendNoStore(res,await prepareKrakenOrder({...req.body,provider:'KRAKEN'}))}
    catch(e:any){const msg=e?.message||String(e);return sendNoStore(res,{ok:false,error:msg},msg.startsWith('invalid_')||msg.includes('leverage_not_supported')?400:409)}
  });
  app.post('/api/signal-desk/order/validate', async (req,res)=>{
    if(!requireBotAccountOwner(req,res))return;
    try{return sendNoStore(res,await validateKrakenPreparedOrder(req.body))}
    catch(e:any){return sendNoStore(res,{
      ok:false,validated:false,orderPlaced:false,error:String(e?.message||e)
    },409)}
  });
  app.post('/api/signal-desk/order/submit', async (req,res)=>{
    if(!requireBotAccountOwner(req,res))return;
    try{return sendNoStore(res,await submitKrakenOrder(req.body))}
    catch(e:any){return sendNoStore(res,{ok:false,error:e?.message||String(e)},409)}
  });

  app.get('/api/borrow/catalog', async (req,res)=>{
    try {
      const force=['1','true','yes'].includes(String(req.query.refresh||'').toLowerCase());
      if(borrowCache&&!force&&Date.now()-borrowCache.at<60000)return sendNoStore(res,borrowCache.payload);
      const payload=await buildBorrowCatalog(); if(payload.ok)borrowCache={at:Date.now(),payload};
      return sendNoStore(res,payload,payload.ok?200:502);
    }catch(e:any){return sendNoStore(res,{ok:false,error:'borrow_catalog_unavailable',detail:e?.message||String(e)},502)}
  });

  app.get('/api/borrow/positions', async (req,res)=>{
    const address=String(req.query.address||'').trim();
    if(!/^0x[a-fA-F0-9]{40}$/.test(address))return sendNoStore(res,{ok:false,error:'invalid_address'},400);
    const chainIds=[1,10,130,137,143,999,4663,5042,8453,42161,747474];
    const positions:any[]=[],errors:any[]=[];
    const gql=`query UserBorrowPositions($address:String!,$chainId:Int!){ userByAddress(address:$address,chainId:$chainId){ marketPositions{ market{marketId loanAsset{address symbol decimals} collateralAsset{address symbol decimals}} state{borrowAssets borrowAssetsUsd collateral collateralUsd} } } }`;
    for(const chainId of chainIds){
      try{
        const payload=await fetchJson('https://api.morpho.org/graphql',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({query:gql,variables:{address,chainId}})},12000);
        for(const item of payload?.data?.userByAddress?.marketPositions||[]){
          const state=item?.state||{}; if(Number(state.borrowAssets||0)<=0)continue;
          positions.push({provider:'Morpho',chainId,network:chainNames[chainId]||String(chainId),marketId:item?.market?.marketId,collateralAsset:item?.market?.collateralAsset?.symbol,collateralAmount:state.collateral,collateralUsd:state.collateralUsd,debtAsset:item?.market?.loanAsset?.symbol,debtAmount:state.borrowAssets,debtUsd:state.borrowAssetsUsd,source:'morpho_api'});
        }
      }catch(e:any){errors.push({provider:'Morpho',chainId,error:String(e?.message||e).slice(0,160)})}
    }
    return sendNoStore(res,{ok:true,address,positions,errors,generatedAt:Date.now()});
  });

  app.get('/api/borrow/aave/details', async (req,res)=>{
    const symbol=String(req.query.symbol||'').trim();
    if(!symbol||symbol.length>48)return sendNoStore(res,{ok:false,error:'invalid_symbol'},400);
    try{
      const s=await aaveSession(); let id=2; const details:any[]=[];
      const chains=await aaveTool(s,'get_chains',{version:'v3'},id++);
      const rows=chains?.data?.v3||chains?.v3||[];
      for(const ch of rows.slice(0,25)){
        const chainId=Number(ch?.chainId); if(!chainId)continue;
        const markets=await aaveTool(s,'get_markets',{version:'v3',chainId,symbols:[symbol]},id++);
        const root=markets?.data||markets; const section=root?.v3||{};
        for(const market of section?.markets||[]) for(const reserve of market?.reserves||[]){
          if(String(reserve?.symbol||'').toUpperCase()!==symbol.toUpperCase())continue;
          const detail=await aaveTool(s,'get_reserve_details',{version:'v3',market:market.market,token:reserve.underlyingToken,chainId:market.chainId||chainId},id++);
          const d=detail?.data||detail; if(d&&typeof d==='object')details.push({...d,protocolVersion:'V3',marketKey:market.market});
        }
      }
      return sendNoStore(res,{ok:true,symbol,details});
    }catch(e:any){return sendNoStore(res,{ok:false,error:'aave_unavailable',detail:String(e?.message||e).slice(0,180)},502)}
  });

}

function stableStringify(value:any):string {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+stableStringify(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function registerMobileCompatibilityRoutes(app:Express) {
  app.get('/api/phone/fiat/quotes',(_req,res)=>sendNoStore(res,{ok:false,error:'direct_fiat_buy_disabled'},410));

  app.post('/api/mobile/live-bet/execute',async(req,res)=>{
    if(!mobileAiAuthorized(req))return sendNoStore(res,{ok:false,error:'ai_device_auth_required'},401);
    const token=String(req.body?.token||'').trim();
    if(!token||token.length>256)return sendNoStore(res,{ok:false,error:'invalid_confirmation_token'},400);
    try{
      const consumed=await fetchJson('http://127.0.0.1:8792/api/live-bet/toobit-consume',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})},8000);
      if(!consumed?.ok)return sendNoStore(res,{ok:false,error:consumed?.error||'live_bet_confirmation_invalid',message:consumed?.message||'Live Bet confirmation is invalid or expired.'},409);
      const preview=consumed?.preview||{},claimed=String(consumed?.fingerprint||'');
      const fingerprint=crypto.createHash('sha256').update(stableStringify(preview)).digest('hex');
      if(!claimed||fingerprint!==claimed)throw new Error('live_bet_integrity_failed');
      const symbol=String(preview?.symbol||'').toUpperCase(),asset=symbol.replace(/-SWAP-USDT$/,'').replace(/USDT$/,'').replace(/USD$/,'');
      const direction=String(preview?.direction||'').toUpperCase();
      if(!/^[A-Z0-9._-]{2,24}$/.test(asset)||!['LONG','SHORT'].includes(direction))throw new Error('invalid_live_bet_preview');
      const amount=Math.max(1,Number(preview?.requestedPositionValueUSDT||preview?.valueQuantity||10));
      const side=direction==='LONG'?'YES':'NO';
      const kalshiUrl='/kalshi.html?'+new URLSearchParams({source:'live-bet',asset,side,amount:String(amount),duration:'15m'}).toString();
      return sendNoStore(res,{ok:true,venue:'KALSHI',asset,side,amount,kalshiUrl,message:'Live Bet imported. Opening the matching Kalshi crypto market for final review.',writePerformed:false});
    }catch(e:any){return sendNoStore(res,{ok:false,error:e?.message||'live_bet_confirmation_consume_failed',message:'Could not verify the locked Live Bet confirmation. Nothing was submitted.'},409)}
  });
}

export function registerMigratedBackend(app:Express) {
  registerAuthRoutes(app);
  registerWalletRoutes(app);
  registerAlertRoutes(app);
  registerMarketAndBotRoutes(app);
  registerMobileCompatibilityRoutes(app);
}

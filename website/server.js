// server.ts
import express from "express";
import crypto2 from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import path2 from "path";
import { fileURLToPath } from "url";

// server/exchange_routes.ts
import { Router } from "express";

// server/exchange_models.ts
var CANONICAL_ASSETS = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    changenowCurrency: "btc",
    changenowNetwork: "btc",
    chainId: "btc",
    internalChain: "bitcoin",
    logoURI: "https://content-api.changenow.io/uploads/btc_1_527dc9ec3c.svg",
    enabled: true,
    supportsMemo: false
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    changenowCurrency: "eth",
    changenowNetwork: "eth",
    chainId: "1",
    internalChain: "ethereum",
    logoURI: "https://content-api.changenow.io/uploads/eth_f4ebb54ec0.svg",
    enabled: true,
    supportsMemo: false
  },
  {
    symbol: "SOL",
    name: "Solana",
    changenowCurrency: "sol",
    changenowNetwork: "sol",
    chainId: "solana",
    internalChain: "solana",
    logoURI: "https://content-api.changenow.io/uploads/sol_88ceb9c78f.svg",
    enabled: true,
    supportsMemo: false
  },
  {
    symbol: "TAO",
    name: "Bittensor",
    changenowCurrency: "tao",
    changenowNetwork: "tao",
    chainId: "bittensor",
    internalChain: "bittensor",
    logoURI: "https://content-api.changenow.io/uploads/tao_61c0c66042.svg",
    enabled: true,
    supportsMemo: false
  },
  {
    symbol: "NEAR",
    name: "NEAR Protocol",
    changenowCurrency: "near",
    changenowNetwork: "near",
    chainId: "near",
    internalChain: "near",
    logoURI: "https://content-api.changenow.io/uploads/near_62e622f9db.svg",
    enabled: true,
    supportsMemo: false
  },
  {
    symbol: "USDC",
    name: "USD Coin (Ethereum)",
    changenowCurrency: "usdc",
    changenowNetwork: "eth",
    chainId: "1",
    internalChain: "ethereum",
    logoURI: "https://content-api.changenow.io/uploads/usd_coin_e5aa76326e.svg",
    enabled: true,
    supportsMemo: false
  },
  {
    symbol: "USDC",
    name: "USD Coin (Arbitrum)",
    changenowCurrency: "usdc",
    changenowNetwork: "arbitrum",
    chainId: "42161",
    internalChain: "arbitrum",
    logoURI: "https://content-api.changenow.io/uploads/usd_coin_e5aa76326e.svg",
    enabled: true,
    supportsMemo: false
  },
  {
    symbol: "USDC",
    name: "USD Coin (Base)",
    changenowCurrency: "usdc",
    changenowNetwork: "base",
    chainId: "8453",
    internalChain: "base",
    logoURI: "https://content-api.changenow.io/uploads/usd_coin_e5aa76326e.svg",
    enabled: true,
    supportsMemo: false
  },
  {
    symbol: "USDC",
    name: "USD Coin (Solana)",
    changenowCurrency: "usdc",
    changenowNetwork: "sol",
    chainId: "solana",
    internalChain: "solana",
    logoURI: "https://content-api.changenow.io/uploads/usd_coin_e5aa76326e.svg",
    enabled: true,
    supportsMemo: false
  },
  {
    symbol: "XRP",
    name: "Ripple",
    changenowCurrency: "xrp",
    changenowNetwork: "xrp",
    chainId: "xrp",
    internalChain: "ripple",
    logoURI: "https://content-api.changenow.io/uploads/xrp_3f5b722d32.svg",
    enabled: true,
    supportsMemo: true
  }
];

// server/changenow_service.ts
var CHANGENOW_BASE_V2 = "https://api.changenow.io/v2";
var CHANGENOW_BASE_V1 = "https://api.changenow.io/v1";
function getApiKey() {
  return process.env.CHANGENOW_API_KEY?.trim() || void 0;
}
var cachedCurrencies = null;
var lastCurrenciesFetch = 0;
var CACHE_TTL_MS = 1e3 * 60 * 30;
var ChangeNowService = class {
  /**
   * Fetch all supported currencies and networks, normalized into ExchangeAsset catalog
   */
  static async getCurrencies() {
    const now = Date.now();
    if (cachedCurrencies && now - lastCurrenciesFetch < CACHE_TTL_MS) {
      return cachedCurrencies;
    }
    try {
      const res = await fetch(`${CHANGENOW_BASE_V2}/exchange/currencies`, {
        headers: {
          Accept: "application/json",
          ...getApiKey() ? { "x-changenow-api-key": getApiKey() } : {}
        }
      });
      if (!res.ok) {
        throw new Error(`Currencies endpoint returned status ${res.status}`);
      }
      const list = await res.json();
      if (!Array.isArray(list)) {
        return CANONICAL_ASSETS;
      }
      const catalog = list.filter((c) => c && c.ticker && !c.isFiat).map((c) => {
        const tickerUpper = String(c.ticker).toUpperCase();
        const netLower = String(c.network || c.ticker).toLowerCase();
        return {
          symbol: tickerUpper,
          name: c.name || tickerUpper,
          changenowCurrency: String(c.ticker).toLowerCase(),
          changenowNetwork: netLower,
          chainId: netLower,
          internalChain: netLower,
          logoURI: c.image || void 0,
          enabled: Boolean(c.buy && c.sell),
          supportsMemo: Boolean(c.hasExternalId || c.isExtraIdSupported)
        };
      });
      const canonicalKeys = new Set(
        CANONICAL_ASSETS.map((a) => `${a.changenowCurrency}:${a.changenowNetwork}`)
      );
      const otherAssets = catalog.filter(
        (a) => !canonicalKeys.has(`${a.changenowCurrency}:${a.changenowNetwork}`)
      );
      cachedCurrencies = [...CANONICAL_ASSETS, ...otherAssets];
      lastCurrenciesFetch = now;
      return cachedCurrencies;
    } catch (err) {
      console.warn("Failed to fetch full ChangeNOW currencies catalog, using canonical assets:", err?.message);
      return CANONICAL_ASSETS;
    }
  }
  /**
   * Fetch real minimum deposit amount for a specific asset pair from ChangeNOW
   */
  static async getMinimum(fromCurrency, fromNetwork, toCurrency, toNetwork) {
    const fromCur = fromCurrency.toLowerCase();
    const fromNet = fromNetwork.toLowerCase();
    const toCur = toCurrency.toLowerCase();
    const toNet = toNetwork.toLowerCase();
    const url = `${CHANGENOW_BASE_V2}/exchange/min-amount?fromCurrency=${fromCur}&toCurrency=${toCur}&fromNetwork=${fromNet}&toNetwork=${toNet}&flow=standard`;
    const headers = { Accept: "application/json" };
    const apiKey = getApiKey();
    if (apiKey) {
      headers["x-changenow-api-key"] = apiKey;
    }
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`ChangeNOW minimum error (${res.status}): ${errText}`);
    }
    const data = await res.json();
    const minVal = Number(data.minAmount);
    return {
      minAmount: isNaN(minVal) ? 0 : minVal,
      raw: data
    };
  }
  /**
   * Fetch estimated swap quote from ChangeNOW
   * Uses ChangeNOW v2 estimated-amount when API key is provided, with robust v1 fallback.
   */
  static async getQuote(fromCurrency, fromNetwork, toCurrency, toNetwork, amountStr) {
    const fromCur = fromCurrency.toLowerCase();
    const fromNet = fromNetwork.toLowerCase();
    const toCur = toCurrency.toLowerCase();
    const toNet = toNetwork.toLowerCase();
    const numAmount = parseFloat(amountStr);
    if (isNaN(numAmount) || numAmount <= 0) {
      return {
        ok: false,
        code: "BELOW_MINIMUM",
        message: "Enter a valid amount greater than 0"
      };
    }
    let minAmount = 0;
    try {
      const minData = await this.getMinimum(fromCur, fromNet, toCur, toNet);
      minAmount = minData.minAmount;
      if (numAmount < minAmount) {
        return {
          ok: false,
          code: "BELOW_MINIMUM",
          minimumAmount: String(minAmount),
          message: `Amount ${amountStr} ${fromCurrency.toUpperCase()} is below the minimum required ${minAmount} ${fromCurrency.toUpperCase()}`
        };
      }
    } catch (minErr) {
      const errMsg = minErr?.message || "";
      if (errMsg.includes("pair_is_inactive") || errMsg.includes("not found") || errMsg.includes("unavailable")) {
        return {
          ok: false,
          code: "PAIR_UNAVAILABLE",
          message: `Trading pair ${fromCurrency.toUpperCase()} (${fromNet}) -> ${toCurrency.toUpperCase()} (${toNet}) is currently unavailable on ChangeNOW.`,
          details: errMsg
        };
      }
    }
    const apiKey = getApiKey();
    if (apiKey) {
      try {
        const v2Url = `${CHANGENOW_BASE_V2}/exchange/estimated-amount?fromCurrency=${fromCur}&toCurrency=${toCur}&fromAmount=${amountStr}&fromNetwork=${fromNet}&toNetwork=${toNet}&flow=standard`;
        const v2Res = await fetch(v2Url, {
          headers: {
            Accept: "application/json",
            "x-changenow-api-key": apiKey
          }
        });
        if (v2Res.ok) {
          const v2Data = await v2Res.json();
          return {
            ok: true,
            fromAmount: String(amountStr),
            toAmount: String(v2Data.toAmount || v2Data.estimatedAmount),
            fromCurrency: fromCurrency.toUpperCase(),
            toCurrency: toCurrency.toUpperCase(),
            fromNetwork: fromNet,
            toNetwork: toNet,
            minimumAmount: String(minAmount || v2Data.minAmount || "0"),
            rateId: v2Data.rateId || "",
            flow: "standard",
            expiresAt: v2Data.validUntil || null,
            rawProvider: "ChangeNOW"
          };
        }
      } catch (e) {
      }
    }
    try {
      const v1Url = `${CHANGENOW_BASE_V1}/exchange-amount/${amountStr}/${fromCur}_${toCur}`;
      const v1Res = await fetch(v1Url, {
        headers: { Accept: "application/json" }
      });
      if (!v1Res.ok) {
        const v1Err = await v1Res.text();
        return {
          ok: false,
          code: "QUOTE_FAILED",
          minimumAmount: String(minAmount),
          message: `ChangeNOW could not quote this pair: ${v1Err}`
        };
      }
      const v1Data = await v1Res.json();
      const estimated = v1Data.estimatedAmount;
      if (estimated === void 0 || estimated === null) {
        return {
          ok: false,
          code: "QUOTE_FAILED",
          message: v1Data.message || "ChangeNOW returned an empty estimate for this pair"
        };
      }
      return {
        ok: true,
        fromAmount: String(amountStr),
        toAmount: String(estimated),
        fromCurrency: fromCurrency.toUpperCase(),
        toCurrency: toCurrency.toUpperCase(),
        fromNetwork: fromNet,
        toNetwork: toNet,
        minimumAmount: String(minAmount),
        rateId: "",
        flow: "standard",
        expiresAt: null,
        rawProvider: "ChangeNOW"
      };
    } catch (quoteErr) {
      return {
        ok: false,
        code: "PROVIDER_UNAVAILABLE",
        message: `ChangeNOW quote service communication failure: ${quoteErr?.message || String(quoteErr)}`
      };
    }
  }
  /**
   * Create an exchange on ChangeNOW (v2 endpoint)
   * POST https://api.changenow.io/v2/exchange
   */
  static async createExchange(params) {
    const fromCur = params.fromAsset.currency.toLowerCase();
    const fromNet = (params.fromAsset.network || params.fromAsset.currency).toLowerCase();
    const toCur = params.toAsset.currency.toLowerCase();
    const toNet = (params.toAsset.network || params.toAsset.currency).toLowerCase();
    const amountStr = String(params.amount);
    if (!params.destinationAddress?.trim()) {
      return {
        ok: false,
        code: "INVALID_ADDRESS",
        message: "Destination wallet address is required to create a swap"
      };
    }
    try {
      const minData = await this.getMinimum(fromCur, fromNet, toCur, toNet);
      const numAmt = parseFloat(amountStr);
      if (numAmt < minData.minAmount) {
        return {
          ok: false,
          code: "BELOW_MINIMUM",
          minimumAmount: String(minData.minAmount),
          message: `Amount ${amountStr} is below minimum required ${minData.minAmount}`
        };
      }
    } catch (e) {
      console.warn("Could not verify minimum prior to exchange creation:", e?.message);
    }
    const apiKey = getApiKey();
    if (!apiKey) {
      return {
        ok: false,
        code: "PROVIDER_UNAVAILABLE",
        message: "CHANGENOW_API_KEY environment variable is not configured on the server. ChangeNOW requires an API key to create live deposit exchanges."
      };
    }
    const payload = {
      fromCurrency: fromCur,
      toCurrency: toCur,
      fromNetwork: fromNet,
      toNetwork: toNet,
      fromAmount: amountStr,
      address: params.destinationAddress.trim(),
      flow: "standard"
    };
    if (params.destinationExtraId?.trim()) {
      payload.extraId = params.destinationExtraId.trim();
    }
    if (params.refundAddress?.trim()) {
      payload.refundAddress = params.refundAddress.trim();
    }
    if (params.refundExtraId?.trim()) {
      payload.refundExtraId = params.refundExtraId.trim();
    }
    if (params.rateId?.trim()) {
      payload.rateId = params.rateId.trim();
    }
    try {
      const res = await fetch(`${CHANGENOW_BASE_V2}/exchange`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-changenow-api-key": apiKey
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        const errorText = data.message || data.error || JSON.stringify(data);
        return {
          ok: false,
          code: "EXCHANGE_CREATE_FAILED",
          message: `ChangeNOW exchange rejected: ${errorText}`,
          details: data
        };
      }
      return {
        ok: true,
        exchangeId: data.id,
        provider: "ChangeNOW",
        fromCurrency: params.fromAsset.currency.toUpperCase(),
        toCurrency: params.toAsset.currency.toUpperCase(),
        fromNetwork: fromNet,
        toNetwork: toNet,
        fromAmount: String(data.fromAmount || amountStr),
        expectedToAmount: String(data.toAmount || data.expectedToAmount || "0"),
        depositAddress: data.payinAddress || data.depositAddress,
        depositExtraId: data.payinExtraId || data.depositExtraId || "",
        destinationAddress: params.destinationAddress,
        refundAddress: params.refundAddress || "",
        status: "waiting",
        rawStatus: data.status
      };
    } catch (err) {
      return {
        ok: false,
        code: "EXCHANGE_CREATE_FAILED",
        message: `Network error creating ChangeNOW exchange: ${err?.message || String(err)}`
      };
    }
  }
  /**
   * Get transaction status from ChangeNOW
   * Normalizes statuses: waiting, confirming, exchanging, sending, finished, failed, refunded, action_required, unknown
   */
  static async getExchangeStatus(exchangeId) {
    const apiKey = getApiKey();
    const headers = { Accept: "application/json" };
    if (apiKey) {
      headers["x-changenow-api-key"] = apiKey;
    }
    try {
      const res = await fetch(`${CHANGENOW_BASE_V2}/exchange/by-id?id=${encodeURIComponent(exchangeId)}`, {
        headers
      });
      if (!res.ok) {
        const errText = await res.text();
        return {
          ok: false,
          exchangeId,
          status: "unknown",
          providerStatus: `HTTP_${res.status}`,
          payinHash: null,
          payoutHash: null,
          fromAmount: "0",
          toAmount: "0",
          error: `ChangeNOW status error (${res.status}): ${errText}`
        };
      }
      const data = await res.json();
      const rawStatus = String(data.status || "").toLowerCase();
      let normalizedStatus = "unknown";
      if (rawStatus === "waiting" || rawStatus === "new") {
        normalizedStatus = "waiting";
      } else if (rawStatus === "confirming") {
        normalizedStatus = "confirming";
      } else if (rawStatus === "exchanging") {
        normalizedStatus = "exchanging";
      } else if (rawStatus === "sending") {
        normalizedStatus = "sending";
      } else if (rawStatus === "finished") {
        normalizedStatus = "finished";
      } else if (rawStatus === "failed" || rawStatus === "expired") {
        normalizedStatus = "failed";
      } else if (rawStatus === "refunded") {
        normalizedStatus = "refunded";
      } else if (rawStatus === "verifying" || rawStatus === "action_required") {
        normalizedStatus = "action_required";
      }
      return {
        ok: true,
        exchangeId: data.id || exchangeId,
        status: normalizedStatus,
        providerStatus: data.status || "unknown",
        payinHash: data.payinHash || null,
        payoutHash: data.payoutHash || null,
        fromAmount: String(data.fromAmount || data.amountSend || "0"),
        toAmount: String(data.toAmount || data.amountReceive || "0")
      };
    } catch (err) {
      return {
        ok: false,
        exchangeId,
        status: "unknown",
        providerStatus: "CONNECTION_ERROR",
        payinHash: null,
        payoutHash: null,
        fromAmount: "0",
        toAmount: "0",
        error: err?.message || String(err)
      };
    }
  }
};

// server/exchange_routes.ts
var exchangeRouter = Router();
exchangeRouter.get("/currencies", async (_req, res) => {
  try {
    const catalog = await ChangeNowService.getCurrencies();
    return res.json({ ok: true, catalog, count: catalog.length });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      code: "PROVIDER_UNAVAILABLE",
      message: err?.message || "Failed to retrieve currency catalog"
    });
  }
});
exchangeRouter.post("/quote", async (req, res) => {
  try {
    const { fromAsset, toAsset, amount } = req.body;
    if (!fromAsset?.currency || !toAsset?.currency) {
      return res.status(400).json({
        ok: false,
        code: "UNSUPPORTED_ASSET",
        message: "Both fromAsset and toAsset with currency are required"
      });
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({
        ok: false,
        code: "BELOW_MINIMUM",
        message: "A valid numeric amount greater than 0 is required"
      });
    }
    const fromNet = fromAsset.network || fromAsset.currency;
    const toNet = toAsset.network || toAsset.currency;
    const result = await ChangeNowService.getQuote(
      fromAsset.currency,
      fromNet,
      toAsset.currency,
      toNet,
      String(amount)
    );
    if (!result.ok) {
      const statusCode = result.code === "BELOW_MINIMUM" ? 400 : 422;
      return res.status(statusCode).json(result);
    }
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      code: "QUOTE_FAILED",
      message: err?.message || "Unexpected quote processing failure"
    });
  }
});
exchangeRouter.post("/create", async (req, res) => {
  try {
    const body = req.body;
    if (!body?.fromAsset?.currency || !body?.toAsset?.currency) {
      return res.status(400).json({
        ok: false,
        code: "UNSUPPORTED_ASSET",
        message: "fromAsset and toAsset are required"
      });
    }
    if (!body?.destinationAddress?.trim()) {
      return res.status(400).json({
        ok: false,
        code: "INVALID_ADDRESS",
        message: "Destination wallet address is required"
      });
    }
    const result = await ChangeNowService.createExchange(body);
    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      code: "EXCHANGE_CREATE_FAILED",
      message: err?.message || "Unexpected failure creating exchange"
    });
  }
});
exchangeRouter.get("/status/:exchangeId", async (req, res) => {
  try {
    const { exchangeId } = req.params;
    if (!exchangeId?.trim()) {
      return res.status(400).json({
        ok: false,
        code: "EXCHANGE_NOT_FOUND",
        message: "Exchange ID is required"
      });
    }
    const result = await ChangeNowService.getExchangeStatus(exchangeId);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      code: "PROVIDER_UNAVAILABLE",
      message: err?.message || "Failed to query exchange status"
    });
  }
});

// server/migrated_backend.ts
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { getAddress, verifyMessage } from "ethers";
var APP_ROOT = path.resolve(process.cwd());
var DATA_DIR = path.join(APP_ROOT, "data");
var ALERT_DB = path.join(DATA_DIR, "aurelis.sqlite3");
var AUTH_DB = path.join(DATA_DIR, "wallet-auth.sqlite3");
var AUTH_COOKIE_NAME = "aurelis_wallet_auth";
var AUTH_CHALLENGE_TTL = 300;
var AUTH_SESSION_TTL = 43200;
var ALLOWED_CHAIN_IDS = /* @__PURE__ */ new Set([1, 10, 137, 8453, 42161]);
fs.mkdirSync(DATA_DIR, { recursive: true });
var db = new Database(ALERT_DB);
db.pragma("journal_mode = WAL");
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
var authDb = new Database(AUTH_DB);
authDb.pragma("journal_mode = WAL");
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
var challenges = /* @__PURE__ */ new Map();
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}
function sessionId(req, res) {
  const current = parseCookies(req)[AUTH_COOKIE_NAME] || "";
  if (/^[A-Za-z0-9_-]{20,128}$/.test(current)) return current;
  const value = crypto.randomBytes(32).toString("base64url");
  const secure = String(process.env.AURELIS_WEB_ORIGIN || "").startsWith("https://");
  res.setHeader(
    "Set-Cookie",
    `${AUTH_COOKIE_NAME}=${value}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${AUTH_SESSION_TTL}${secure ? "; Secure" : ""}`
  );
  return value;
}
function authOrigin(req) {
  const configured = String(process.env.AURELIS_WEB_ORIGIN || "").trim();
  if (configured) return new URL(configured).origin;
  const host2 = String(req.headers.host || "").trim();
  if (!host2) throw new Error("auth_origin_not_configured");
  const hostname = host2.split(":")[0].replace(/^\[|\]$/g, "").toLowerCase();
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) throw new Error("auth_origin_not_configured");
  return `http://${host2}`;
}
function normalizeAddress(value) {
  try {
    return getAddress(String(value || "").trim());
  } catch {
    throw new Error("invalid_address");
  }
}
function getVerifiedSession(req, res) {
  const sid = sessionId(req, res);
  const row = authDb.prepare(
    "SELECT address,chain_id,origin,purpose,verified_at,expires_at FROM wallet_auth_sessions WHERE session_id=?"
  ).get(sid);
  if (!row) return null;
  if (Date.now() / 1e3 >= Number(row.expires_at || 0)) {
    authDb.prepare("DELETE FROM wallet_auth_sessions WHERE session_id=?").run(sid);
    return null;
  }
  return {
    address: row.address,
    chainId: Number(row.chain_id),
    origin: row.origin,
    purpose: row.purpose,
    verifiedAt: Number(row.verified_at),
    expiresAt: Number(row.expires_at)
  };
}
function getVerifiedWalletAddress(req, res) {
  const verified = getVerifiedSession(req, res);
  return verified?.address ? String(verified.address) : null;
}
function saveVerifiedSession(sid, value) {
  authDb.prepare(`
    INSERT INTO wallet_auth_sessions(session_id,address,chain_id,origin,purpose,verified_at,expires_at)
    VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(session_id) DO UPDATE SET
      address=excluded.address,chain_id=excluded.chain_id,origin=excluded.origin,
      purpose=excluded.purpose,verified_at=excluded.verified_at,expires_at=excluded.expires_at
  `).run(
    sid,
    value.address,
    value.chainId,
    value.origin,
    value.purpose,
    value.verifiedAt,
    value.expiresAt
  );
}
function requireVerified(req, res) {
  const verified = getVerifiedSession(req, res);
  if (!verified) {
    res.status(401).json({ ok: false, error: "wallet_auth_required" });
    return null;
  }
  return verified;
}
function bearerToken(req) {
  const raw = String(req.headers.authorization || "");
  return raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : "";
}
function bearerHash(req) {
  const token = bearerToken(req);
  return token ? crypto.createHash("sha256").update(token).digest("hex") : "";
}
function mobileAiAuthorized(req) {
  const expected = String(process.env.AURELIS_AI_MOBILE_DEVICE_SHA256 || "").trim().toLowerCase();
  const actual = bearerHash(req);
  return !!expected && !!actual && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
function mobileGuardAuthorized(req) {
  const hash = bearerHash(req);
  if (!hash) return false;
  const row = db.prepare("SELECT token_hash FROM guard_devices WHERE token_hash=?").get(hash);
  if (!row) return false;
  db.prepare("UPDATE guard_devices SET last_seen=? WHERE token_hash=?").run(Math.floor(Date.now() / 1e3), hash);
  return true;
}
function resolveTokenHashForWallet(address) {
  const lower = address.toLowerCase();
  const row = db.prepare(
    "SELECT token_hash,MAX(updated_at) AS u FROM guard_wallet_addresses WHERE lower(address)=? GROUP BY token_hash ORDER BY u DESC LIMIT 1"
  ).get(lower);
  if (row?.token_hash) return String(row.token_hash);
  const row2 = db.prepare(
    "SELECT token_hash,MAX(updated_at) AS u FROM guard_portfolios WHERE lower(account_address)=? GROUP BY token_hash ORDER BY u DESC LIMIT 1"
  ).get(lower);
  return row2?.token_hash ? String(row2.token_hash) : null;
}
function safeJson(text, fallback = {}) {
  try {
    return JSON.parse(String(text || ""));
  } catch {
    return fallback;
  }
}
function finiteNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function parseBalanceText(v) {
  const raw = String(v ?? "").replace(/,/g, "").trim();
  const m = raw.match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
  const n = m ? Number(m[0]) : 0;
  return Number.isFinite(n) ? n : 0;
}
function sendNoStore(res, body, status = 200) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}
async function fetchJson(url, init = {}, timeoutMs = 12e3) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    const data = safeJson(text, null);
    if (!response.ok) {
      const err = new Error(`HTTP_${response.status}`);
      err.status = response.status;
      err.data = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}
function makeChallenge(address, chainId, origin, purpose) {
  const normalizedAddress = normalizeAddress(address);
  if (!ALLOWED_CHAIN_IDS.has(chainId)) throw new Error("unsupported_chain");
  const now = /* @__PURE__ */ new Date();
  const expires = new Date(now.getTime() + AUTH_CHALLENGE_TTL * 1e3);
  const nonce = crypto.randomBytes(8).toString("hex");
  const requestId = crypto.randomBytes(16).toString("hex");
  const domain = new URL(origin).host;
  const normalizedPurpose = String(purpose || "").toLowerCase() === "bots" ? "bots" : "web";
  const purposeLine = normalizedPurpose === "bots" ? "Sign in to AURELIS Bots. This request does not authorize transactions.\n\n" : "Sign in to AURELIS Web. This request does not authorize transactions.\n\n";
  const message = `${domain} wants you to sign in with your Ethereum account:
${normalizedAddress}

` + purposeLine + `URI: ${origin}
Version: 1
Chain ID: ${chainId}
Nonce: ${nonce}
Issued At: ${now.toISOString().replace(".000Z", "Z")}
Expiration Time: ${expires.toISOString().replace(".000Z", "Z")}
Request ID: ${requestId}`;
  return {
    message,
    address: normalizedAddress,
    chainId,
    origin,
    purpose: normalizedPurpose,
    expiresAt: Date.now() / 1e3 + AUTH_CHALLENGE_TTL,
    used: false
  };
}
function registerAuthRoutes(app2) {
  app2.post("/api/auth/challenge", (req, res) => {
    try {
      const sid = sessionId(req, res);
      const origin = authOrigin(req);
      const challenge = makeChallenge(
        String(req.body?.address || ""),
        Number(req.body?.chainId),
        origin,
        String(req.body?.purpose || "web")
      );
      challenges.set(sid, challenge);
      return sendNoStore(res, {
        ok: true,
        message: challenge.message,
        address: challenge.address,
        chainId: challenge.chainId,
        expiresIn: AUTH_CHALLENGE_TTL
      });
    } catch (e) {
      return sendNoStore(res, { ok: false, error: e?.message || "invalid_request" }, 400);
    }
  });
  app2.post("/api/auth/verify", async (req, res) => {
    const sid = sessionId(req, res);
    try {
      const challenge = challenges.get(sid);
      if (!challenge) throw new Error("challenge_missing");
      if (challenge.used) throw new Error("challenge_replayed");
      challenge.used = true;
      if (Date.now() / 1e3 >= challenge.expiresAt) throw new Error("challenge_expired");
      const origin = authOrigin(req);
      const address = normalizeAddress(String(req.body?.address || ""));
      const chainId = Number(req.body?.chainId);
      const message = String(req.body?.message || "");
      const signature = String(req.body?.signature || "");
      if (message !== challenge.message) throw new Error("message_mismatch");
      if (address !== challenge.address) throw new Error("address_mismatch");
      if (chainId !== challenge.chainId) throw new Error("chain_mismatch");
      if (origin !== challenge.origin) throw new Error("origin_mismatch");
      const recovered = normalizeAddress(verifyMessage(message, signature));
      if (recovered !== challenge.address) throw new Error("invalid_signature");
      const now = Date.now() / 1e3;
      saveVerifiedSession(sid, {
        address,
        chainId,
        origin,
        purpose: challenge.purpose,
        verifiedAt: now,
        expiresAt: now + AUTH_SESSION_TTL
      });
      challenges.delete(sid);
      return sendNoStore(res, { ok: true, verified: true, address, chainId });
    } catch (e) {
      return sendNoStore(res, { ok: false, verified: false, error: e?.message || "invalid_signature" }, 401);
    }
  });
  app2.post("/api/auth/native-session", (req, res) => {
    if (!mobileAiAuthorized(req)) return sendNoStore(res, { ok: false, error: "native_auth_required" }, 401);
    try {
      const sid = sessionId(req, res);
      const origin = authOrigin(req);
      const address = normalizeAddress(String(req.body?.walletAddress || req.body?.address || ""));
      const chainId = Number(req.body?.chainId || 1);
      if (!ALLOWED_CHAIN_IDS.has(chainId)) throw new Error("unsupported_chain");
      const now = Date.now() / 1e3;
      saveVerifiedSession(sid, {
        address,
        chainId,
        origin,
        purpose: "bots",
        verifiedAt: now,
        expiresAt: now + AUTH_SESSION_TTL
      });
      return sendNoStore(res, { ok: true, verified: true, native: true, address, chainId, purpose: "bots" });
    } catch (e) {
      return sendNoStore(res, { ok: false, error: e?.message || "invalid_request" }, 400);
    }
  });
}
var EVM_NATIVE_RPCS = {
  ethereum: "https://ethereum-rpc.publicnode.com",
  base: "https://base-rpc.publicnode.com",
  arbitrum: "https://arbitrum-one-rpc.publicnode.com",
  optimism: "https://optimism-rpc.publicnode.com",
  bsc: "https://bsc-rpc.publicnode.com",
  polygon: "https://polygon-bor-rpc.publicnode.com",
  avalanche: "https://avalanche-c-chain-rpc.publicnode.com"
};
var EVM_NATIVE_META = {
  ethereum: { symbol: "ETH", name: "Ethereum", coinbase: "ETH-USD" },
  base: { symbol: "ETH", name: "Base ETH", coinbase: "ETH-USD" },
  arbitrum: { symbol: "ETH", name: "Arbitrum ETH", coinbase: "ETH-USD" },
  optimism: { symbol: "ETH", name: "Optimism ETH", coinbase: "ETH-USD" },
  bsc: { symbol: "BNB", name: "BNB Smart Chain", coinbase: "BNB-USD" },
  polygon: { symbol: "MATIC", name: "Polygon", coinbase: "POL-USD" },
  avalanche: { symbol: "AVAX", name: "Avalanche C-Chain", coinbase: "AVAX-USD" }
};
var EVM_USDC_CONTRACTS = {
  ethereum: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  bsc: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
  polygon: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  avalanche: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E"
};
async function fetchNativeEthBalance(address, rpc) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }),
      signal: controller.signal
    });
    if (!response.ok) return null;
    const body = await response.json();
    const hex = String(body?.result || "");
    if (!/^0x[0-9a-f]+$/i.test(hex)) return null;
    return Number(BigInt(hex)) / 1e18;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
var cachedEthUsdPrice = null;
async function fetchEthUsdPrice() {
  const now = Date.now();
  if (cachedEthUsdPrice && now - cachedEthUsdPrice.updatedAt < 6e4) return cachedEthUsdPrice.price;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (response.ok) {
      const body = await response.json();
      const price = Number(body?.data?.amount || 0);
      if (Number.isFinite(price) && price > 0) {
        cachedEthUsdPrice = { price, updatedAt: now };
        return price;
      }
    }
  } catch {
  } finally {
    clearTimeout(timeout);
  }
  return cachedEthUsdPrice?.price || 0;
}
var cachedSpotUsdPrices = {};
async function fetchSpotUsdPrice(pair, fallback = 0) {
  const key = String(pair || "").toUpperCase();
  const now = Date.now();
  const cached = cachedSpotUsdPrices[key];
  if (cached && now - cached.updatedAt < 6e4) return cached.price;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(`https://api.coinbase.com/v2/prices/${encodeURIComponent(key)}/spot`, {
      headers: { Accept: "application/json", "User-Agent": "AURELIS-Wallet" },
      signal: controller.signal
    });
    if (response.ok) {
      const body = await response.json();
      const price = Number(body?.data?.amount || 0);
      if (Number.isFinite(price) && price > 0) {
        cachedSpotUsdPrices[key] = { price, updatedAt: now };
        return price;
      }
    }
  } catch {
  } finally {
    clearTimeout(timeout);
  }
  return cached?.price || fallback || 0;
}
function normalizeWatchQuery(value) {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return Array.from(new Set(raw.flatMap((item) => String(item || "").split(",")).map((item) => item.trim()).filter(Boolean))).slice(0, 20);
}
function isZcashTransparentAddress(address) {
  return /^t[13][A-Za-z0-9]{25,}$/.test(String(address || "").trim());
}
async function fetchZcashTransparentBalance(address) {
  const clean = String(address || "").trim();
  if (!isZcashTransparentAddress(clean)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(`https://api.zecblock.com/v1/addresses/${encodeURIComponent(clean)}`, {
      headers: { Accept: "application/json", "User-Agent": "AURELIS-Wallet" },
      signal: controller.signal
    });
    if (!response.ok) return null;
    const body = await response.json();
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
var WATCH_ASSET_META = {
  btc: { symbol: "BTC", name: "Bitcoin", chain: "bitcoin", coinbase: "BTC-USD", decimals: 8 },
  ltc: { symbol: "LTC", name: "Litecoin", chain: "litecoin", coinbase: "LTC-USD", decimals: 8 },
  doge: { symbol: "DOGE", name: "Dogecoin", chain: "dogecoin", coinbase: "DOGE-USD", decimals: 8 },
  zec: { symbol: "ZEC", name: "Zcash", chain: "zcash", coinbase: "ZEC-USD", decimals: 8 },
  sol: { symbol: "SOL", name: "Solana", chain: "solana", coinbase: "SOL-USD", decimals: 9 },
  xrp: { symbol: "XRP", name: "XRP", chain: "xrp", coinbase: "XRP-USD", decimals: 6 },
  near: { symbol: "NEAR", name: "NEAR", chain: "near", coinbase: "NEAR-USD", decimals: 24 }
};
var WATCH_ALIASES = {
  bitcoin: "btc",
  litecoin: "ltc",
  dogecoin: "doge",
  zcash: "zec",
  solana: "sol",
  ripple: "xrp"
};
function formatAssetBalance(value, symbol, decimals = 8) {
  const fixed = value.toFixed(Math.min(Math.max(decimals, 2), 8)).replace(/0+$/, "").replace(/\.$/, "");
  return (fixed || "0") + " " + symbol;
}
async function fetchBlockcypherBalance(network, address) {
  const clean = String(address || "").trim();
  if (!clean || clean.length < 20 || clean.length > 120) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(`https://api.blockcypher.com/v1/${network}/main/addrs/${encodeURIComponent(clean)}/balance`, {
      headers: { Accept: "application/json", "User-Agent": "AURELIS-Wallet" },
      signal: controller.signal
    });
    if (!response.ok) return null;
    const body = await response.json();
    const atomic = Number(body?.final_balance ?? body?.balance ?? 0);
    return Number.isFinite(atomic) && atomic > 0 ? atomic / 1e8 : 0;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
async function fetchSolanaBalance(address) {
  const clean = String(address || "").trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(clean)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch("https://api.mainnet-beta.solana.com", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [clean] }),
      signal: controller.signal
    });
    if (!response.ok) return null;
    const body = await response.json();
    const lamports = Number(body?.result?.value ?? 0);
    return Number.isFinite(lamports) && lamports > 0 ? lamports / 1e9 : 0;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
async function fetchXrpBalance(address) {
  const clean = String(address || "").trim();
  if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(clean)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(`https://api.xrpscan.com/api/v1/account/${encodeURIComponent(clean)}`, {
      headers: { Accept: "application/json", "User-Agent": "AURELIS-Wallet" },
      signal: controller.signal
    });
    if (!response.ok) return null;
    const body = await response.json();
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
async function fetchNearBalance(address) {
  const clean = String(address || "").trim().toLowerCase();
  if (!/^(([a-z0-9_-]+\.)*near|[a-f0-9]{64})$/.test(clean)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch("https://rpc.mainnet.near.org", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "aurelis", method: "query", params: { request_type: "view_account", finality: "final", account_id: clean } }),
      signal: controller.signal
    });
    if (!response.ok) return null;
    const body = await response.json();
    const amount = String(body?.result?.amount || "0");
    if (!/^\d+$/.test(amount)) return null;
    return Number(BigInt(amount)) / 1e24;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
async function fetchWatchAssetBalance(symbol, address) {
  const key = WATCH_ALIASES[symbol.toLowerCase()] || symbol.toLowerCase();
  if (key === "zec") return fetchZcashTransparentBalance(address);
  if (key === "btc" || key === "ltc" || key === "doge") return fetchBlockcypherBalance(key, address);
  if (key === "sol") return fetchSolanaBalance(address);
  if (key === "xrp") return fetchXrpBalance(address);
  if (key === "near") return fetchNearBalance(address);
  return null;
}
async function fetchErc20Balance(address, rpc, contract, decimals) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address) || !/^0x[a-fA-F0-9]{40}$/.test(contract)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const addressWord = address.slice(2).toLowerCase().padStart(64, "0");
    const data = "0x70a08231" + addressWord;
    const response = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: contract, data }, "latest"] }),
      signal: controller.signal
    });
    if (!response.ok) return null;
    const body = await response.json();
    const hex = String(body?.result || "");
    if (!/^0x[0-9a-f]+$/i.test(hex)) return null;
    return Number(BigInt(hex)) / 10 ** decimals;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
async function fetchErc20Decimals(rpc, contract) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(contract)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: contract, data: "0x313ce567" }, "latest"]
      }),
      signal: controller.signal
    });
    if (!response.ok) return null;
    const body = await response.json();
    const hex = String(body?.result || "");
    if (!/^0x[0-9a-f]+$/i.test(hex)) return null;
    const decimals = Number(BigInt(hex));
    return Number.isInteger(decimals) && decimals >= 0 && decimals <= 36 ? decimals : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
function registerWalletRoutes(app2) {
  app2.get("/api/wallet/erc20-decimals", async (req, res) => {
    const verified = requireVerified(req, res);
    if (!verified) return;
    const networkRaw = String(req.query.network || "").toLowerCase();
    const network = networkRaw === "eth" || networkRaw === "mainnet" ? "ethereum" : networkRaw === "arb" ? "arbitrum" : networkRaw;
    const contract = String(req.query.contract || "");
    const rpc = EVM_NATIVE_RPCS[network];
    if (!rpc || !/^0x[a-fA-F0-9]{40}$/.test(contract)) {
      return sendNoStore(res, { ok: false, error: "unsupported_token_network" }, 400);
    }
    const decimals = await fetchErc20Decimals(rpc, contract);
    if (decimals === null) return sendNoStore(res, { ok: false, error: "token_decimals_unavailable" }, 502);
    return sendNoStore(res, { ok: true, network, contract, decimals });
  });
  app2.get("/api/wallet/external-evm-portfolio", async (req, res) => {
    const address = String(req.query.address || "").trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return sendNoStore(res, { ok: false, error: "invalid_external_wallet_address" }, 400);
    }
    const assets = [];
    const skipEvm = String(req.query.skipEvm || "").toLowerCase() === "1";
    const ethUsdPrice = skipEvm ? 0 : await fetchEthUsdPrice();
    const nativePriceCache = {};
    if (!skipEvm) await Promise.all(Object.entries(EVM_NATIVE_RPCS).map(async ([chain, rpc]) => {
      const live = await fetchNativeEthBalance(address, rpc);
      if (live !== null && live > 0) {
        const meta = EVM_NATIVE_META[chain] || { symbol: "ETH", name: "Ethereum", coinbase: "ETH-USD" };
        const nativePrice = nativePriceCache[chain] ?? await fetchSpotUsdPrice(meta.coinbase || "ETH-USD", meta.symbol === "ETH" ? ethUsdPrice : 0);
        nativePriceCache[chain] = nativePrice;
        assets.push({
          assetId: chain,
          chain,
          symbol: meta.symbol || "ETH",
          name: meta.name || (chain === "ethereum" ? "Ethereum" : chain.charAt(0).toUpperCase() + chain.slice(1) + " ETH"),
          balance: live,
          amount: live,
          balanceText: (live.toFixed(8).replace(/0+$/, "").replace(/\.$/, "") || "0") + " " + (meta.symbol || "ETH"),
          priceUsd: nativePrice,
          change24h: 0,
          accountAddress: address,
          updatedAt: Math.floor(Date.now() / 1e3)
        });
      }
      const usdcContract = EVM_USDC_CONTRACTS[chain];
      if (usdcContract) {
        const usdc = await fetchErc20Balance(address, rpc, usdcContract, 6);
        if (usdc !== null && usdc > 0) {
          assets.push({
            assetId: chain + "_usdc",
            chain,
            symbol: "USDC",
            name: "USD Coin",
            balance: usdc,
            amount: usdc,
            balanceText: usdc.toFixed(6).replace(/0+$/, "").replace(/\.$/, "") + " USDC",
            priceUsd: 1,
            change24h: 0,
            accountAddress: address,
            updatedAt: Math.floor(Date.now() / 1e3)
          });
        }
      }
    }));
    const watchTasks = [];
    for (const [rawKey, meta] of Object.entries(WATCH_ASSET_META)) {
      const aliasValues = Object.entries(WATCH_ALIASES).filter(([, canonical]) => canonical === rawKey).map(([alias]) => req.query[alias]);
      const watchAddresses = normalizeWatchQuery([req.query[rawKey], ...aliasValues].flat());
      if (!watchAddresses.length) continue;
      const pricePromise = meta.coinbase ? fetchSpotUsdPrice(meta.coinbase, meta.fallbackPrice || 0) : Promise.resolve(meta.fallbackPrice || 0);
      for (const watchAddress of watchAddresses) {
        watchTasks.push((async () => {
          const [balance, priceUsd] = await Promise.all([
            fetchWatchAssetBalance(rawKey, watchAddress),
            pricePromise
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
              source: "watch_only_" + rawKey,
              updatedAt: Math.floor(Date.now() / 1e3)
            });
          }
        })());
      }
    }
    await Promise.all(watchTasks);
    return sendNoStore(res, { ok: true, address, assets, source: "external_wallet_watch_rpc" });
  });
  app2.get("/api/wallet/native-addresses", (req, res) => {
    const verified = requireVerified(req, res);
    if (!verified) return;
    const tokenHash = resolveTokenHashForWallet(verified.address);
    if (!tokenHash) return sendNoStore(res, { ok: true, addresses: {}, source: "native_guard" });
    const rows = db.prepare(
      "SELECT chain_key,address,updated_at FROM guard_wallet_addresses WHERE token_hash=? ORDER BY chain_key"
    ).all(tokenHash);
    const addresses = {};
    let updatedAt = 0;
    for (const row of rows) {
      addresses[String(row.chain_key)] = String(row.address);
      addresses[String(row.chain_key).toLowerCase()] = String(row.address);
      updatedAt = Math.max(updatedAt, Number(row.updated_at || 0));
    }
    return sendNoStore(res, { ok: true, addresses, updatedAt, source: "native_guard" });
  });
  const portfolioHandler = async (req, res) => {
    const verified = requireVerified(req, res);
    if (!verified) return;
    const tokenHash = resolveTokenHashForWallet(verified.address);
    if (!tokenHash) console.log("external wallet live portfolio", verified.address);
    const rows = db.prepare(
      "SELECT asset_key,symbol,name,balance_text,price_usd,change_24h,account_address,updated_at FROM guard_portfolios WHERE token_hash=? ORDER BY symbol"
    ).all(tokenHash);
    const assets = rows.map((row) => {
      const assetId = String(row.asset_key || "");
      const key = assetId.toLowerCase();
      const chain = key.startsWith("ethereum") ? "ethereum" : key.startsWith("arbitrum") ? "arbitrum" : key.startsWith("base") ? "base" : key.startsWith("near") ? "near" : key.startsWith("xrp") ? "xrp" : key.split("_")[0] || "";
      return {
        assetId,
        chain,
        symbol: String(row.symbol || "").toUpperCase(),
        name: row.name || row.symbol,
        balance: parseBalanceText(row.balance_text),
        amount: parseBalanceText(row.balance_text),
        balanceText: row.balance_text,
        priceUsd: finiteNumber(row.price_usd) ?? 0,
        change24h: finiteNumber(row.change_24h) ?? 0,
        accountAddress: row.account_address || "",
        updatedAt: row.updated_at
      };
    });
    if (!tokenHash && /^0x[a-fA-F0-9]{40}$/.test(String(verified.address || ""))) {
      await Promise.all(Object.entries(EVM_NATIVE_RPCS).map(async ([chain, rpc]) => {
        const live = await fetchNativeEthBalance(String(verified.address), rpc);
        if (live === null || live <= 0) return;
        const existing = assets.find((asset) => asset.symbol === "ETH" && String(asset.chain || "").toLowerCase() === chain);
        if (existing) return;
        assets.push({
          assetId: chain,
          chain,
          symbol: EVM_NATIVE_META[chain]?.symbol || "ETH",
          name: EVM_NATIVE_META[chain]?.name || (chain === "ethereum" ? "Ethereum" : chain.charAt(0).toUpperCase() + chain.slice(1) + " ETH"),
          balance: live,
          amount: live,
          balanceText: (live.toFixed(8).replace(/0+$/, "").replace(/\.$/, "") || "0") + " ETH",
          priceUsd: 0,
          change24h: 0,
          accountAddress: String(verified.address),
          updatedAt: Math.floor(Date.now() / 1e3),
          isGasReserve: false
        });
      }));
    }
    await Promise.all(assets.map(async (asset) => {
      if (asset.symbol !== "ETH") return;
      const rpc = EVM_NATIVE_RPCS[String(asset.chain || "").toLowerCase()];
      if (!rpc || !asset.accountAddress) return;
      const live = await fetchNativeEthBalance(String(asset.accountAddress), rpc);
      if (live === null) return;
      asset.balance = live;
      asset.amount = live;
      const text = live.toFixed(8).replace(/0+$/, "").replace(/\.$/, "") || "0";
      asset.balanceText = text + " ETH";
      asset.updatedAt = Math.floor(Date.now() / 1e3);
      asset.isGasReserve = live * Number(asset.priceUsd || 0) < 0.25;
    }));
    const evmAddressByChain = {};
    if (/^0x[a-fA-F0-9]{40}$/.test(String(verified.address || ""))) {
      for (const chain of Object.keys(EVM_NATIVE_RPCS)) evmAddressByChain[chain] = String(verified.address);
    }
    for (const asset of assets) {
      const chain = String(asset.chain || "").toLowerCase();
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
      const existing = assets.find((asset) => asset.symbol === "USDC" && String(asset.chain || "").toLowerCase() === chain);
      if (existing) {
        existing.balance = live;
        existing.amount = live;
        existing.balanceText = live.toFixed(6).replace(/0+$/, "").replace(/\.$/, "") + " USDC";
        existing.priceUsd = 1;
        existing.updatedAt = Math.floor(Date.now() / 1e3);
      } else if (live > 0) {
        assets.push({
          assetId: chain + "_usdc",
          chain,
          symbol: "USDC",
          name: "USD Coin",
          balance: live,
          amount: live,
          balanceText: live.toFixed(6).replace(/0+$/, "").replace(/\.$/, "") + " USDC",
          priceUsd: 1,
          change24h: 0,
          accountAddress,
          updatedAt: Math.floor(Date.now() / 1e3)
        });
      }
    }));
    const visibleAssets = assets.filter((x) => {
      if (!x.symbol || !(Number(x.amount) > 0)) return false;
      if (x.symbol === "ETH" && x.isGasReserve) return false;
      if (x.symbol === "USDC" && Number(x.amount) < 0.5) return false;
      return true;
    });
    return sendNoStore(res, { ok: true, address: verified.address, assets: visibleAssets, source: tokenHash ? "native_guard+live_rpc+live_usdc" : "external_wallet+live_rpc+live_usdc" });
  };
  app2.get("/api/wallet/portfolio", portfolioHandler);
  app2.get("/api/wallet/portfolio-latest", portfolioHandler);
}
function enqueueAlert(title, body, type = "aurelis_guard", data = {}, targetTokenHash = null) {
  const now = Math.floor(Date.now() / 1e3);
  const info = db.prepare(
    "INSERT INTO mobile_alerts(title,body,alert_type,data_json,created_at,target_token_hash) VALUES(?,?,?,?,?,?)"
  ).run(title, body, type, JSON.stringify(data || {}), now, targetTokenHash);
  return Number(info.lastInsertRowid);
}
function registerAlertRoutes(app2) {
  app2.get("/api/alerts/recent", (req, res) => {
    const verified = requireVerified(req, res);
    if (!verified) return;
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 30) || 30));
    const tokenHash = resolveTokenHashForWallet(verified.address);
    const rows = tokenHash ? db.prepare(
      "SELECT id,title,body,alert_type,data_json,created_at FROM mobile_alerts WHERE target_token_hash IS NULL OR target_token_hash=? ORDER BY id DESC LIMIT ?"
    ).all(tokenHash, limit * 4) : db.prepare(
      "SELECT id,title,body,alert_type,data_json,created_at FROM mobile_alerts WHERE target_token_hash IS NULL ORDER BY id DESC LIMIT ?"
    ).all(limit * 4);
    const seen = /* @__PURE__ */ new Set();
    const alerts = [];
    for (const row of rows) {
      const data = safeJson(row.data_json, {});
      if (row.alert_type === "bets_found") {
        const bets = Array.isArray(data?.bets) ? data.bets : [];
        const key = bets.map((x) => `${String(x?.symbol || "").toUpperCase()}:${String(x?.direction || "").toUpperCase()}`).sort().join("|");
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
      }
      alerts.push({ id: row.id, title: row.title, body: row.body, type: row.alert_type, data, createdAt: row.created_at });
      if (alerts.length >= limit) break;
    }
    return sendNoStore(res, { ok: true, alerts });
  });
  app2.post("/api/mobile/alerts/register", (req, res) => {
    if (!mobileAiAuthorized(req)) return sendNoStore(res, { ok: false, error: "unauthorized" }, 401);
    const tokenHash = String(req.body?.tokenHash || "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(tokenHash)) return sendNoStore(res, { ok: false, error: "invalid_guard_token" }, 400);
    const now = Math.floor(Date.now() / 1e3);
    db.prepare(
      "INSERT INTO guard_devices(token_hash,created_at,last_seen) VALUES(?,?,?) ON CONFLICT(token_hash) DO UPDATE SET last_seen=excluded.last_seen"
    ).run(tokenHash, now, now);
    return sendNoStore(res, { ok: true, registered: true });
  });
  app2.get("/api/mobile/alerts/stream", (req, res) => {
    if (!mobileGuardAuthorized(req)) return sendNoStore(res, { ok: false, error: "unauthorized" }, 401);
    const tokenHash = bearerHash(req);
    let lastId = Math.max(0, Number(req.query.since || 0) || 0);
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    let alive = true;
    req.on("close", () => {
      alive = false;
    });
    const tick = () => {
      if (!alive) return;
      const rows = db.prepare(
        "SELECT id,title,body,alert_type,data_json,created_at FROM mobile_alerts WHERE id>? AND (target_token_hash IS NULL OR target_token_hash=?) ORDER BY id ASC LIMIT 100"
      ).all(lastId, tokenHash);
      if (rows.length) {
        for (const row of rows) {
          const packet = { id: row.id, title: row.title, body: row.body, type: row.alert_type, data: safeJson(row.data_json, {}), createdAt: row.created_at };
          res.write("data: " + JSON.stringify(packet) + "\n\n");
          lastId = Number(row.id);
        }
      } else {
        res.write(": heartbeat\n\n");
      }
    };
    tick();
    const timer = setInterval(tick, 1e4);
    setTimeout(() => {
      clearInterval(timer);
      if (alive) res.end();
    }, 55e3);
  });
  app2.post("/api/mobile/alerts/test", (req, res) => {
    if (!mobileGuardAuthorized(req)) return sendNoStore(res, { ok: false, error: "unauthorized" }, 401);
    const alertId = enqueueAlert(
      "AURELIS Guard connected",
      "Wallet protection and opportunity alerts are ready on this phone.",
      "aurelis_guard",
      { screen: "wallet", kind: "transport_test" },
      bearerHash(req)
    );
    return sendNoStore(res, { ok: true, alertId });
  });
  app2.post("/api/mobile/guard/portfolio", (req, res) => {
    if (!mobileGuardAuthorized(req)) return sendNoStore(res, { ok: false, error: "unauthorized" }, 401);
    const tokenHash = bearerHash(req);
    const assetsRaw = Array.isArray(req.body?.assets) ? req.body.assets.slice(0, 500) : [];
    const addressesRaw = req.body?.addresses && typeof req.body.addresses === "object" ? req.body.addresses : {};
    const assets = [];
    const seen = /* @__PURE__ */ new Set();
    for (const raw of assetsRaw) {
      if (!raw || typeof raw !== "object") continue;
      const symbol = String(raw.symbol || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
      const assetId = String(raw.assetId || "").trim().slice(0, 220);
      if (!symbol || !assetId || seen.has(assetId)) continue;
      seen.add(assetId);
      assets.push({
        assetId,
        symbol,
        name: String(raw.name || symbol).trim().slice(0, 120),
        balance: String(raw.balance || "").trim().slice(0, 120),
        priceUsd: finiteNumber(raw.priceUsd),
        change24h: finiteNumber(raw.change24h),
        accountAddress: String(raw.accountAddress || "").trim().slice(0, 180)
      });
    }
    const addresses = {};
    for (const [k, v] of Object.entries(addressesRaw).slice(0, 100)) {
      const key = String(k).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
      const value = String(v || "").trim().slice(0, 220);
      if (key && value) addresses[key] = value;
    }
    const now = Math.floor(Date.now() / 1e3);
    const tx = db.transaction(() => {
      db.prepare("DELETE FROM guard_portfolios WHERE token_hash=?").run(tokenHash);
      db.prepare("DELETE FROM guard_wallet_addresses WHERE token_hash=?").run(tokenHash);
      const ia = db.prepare("INSERT INTO guard_wallet_addresses(token_hash,chain_key,address,updated_at) VALUES(?,?,?,?)");
      for (const [key, value] of Object.entries(addresses)) ia.run(tokenHash, key, value, now);
      const ip = db.prepare(
        "INSERT INTO guard_portfolios(token_hash,asset_key,symbol,name,balance_text,price_usd,change_24h,account_address,updated_at) VALUES(?,?,?,?,?,?,?,?,?)"
      );
      for (const item of assets) {
        ip.run(tokenHash, item.assetId, item.symbol, item.name, item.balance, item.priceUsd, item.change24h, item.accountAddress, now);
      }
    });
    tx();
    return sendNoStore(res, { ok: true, assets: assets.length, addresses: Object.keys(addresses).length, updatedAt: now });
  });
  app2.post("/api/mobile/approval/respond", (req, res) => {
    if (!mobileGuardAuthorized(req)) return sendNoStore(res, { ok: false, error: "unauthorized" }, 401);
    const requestId = String(req.body?.requestId || "").trim();
    const decision = String(req.body?.decision || "").trim().toLowerCase();
    if (!/^[A-Za-z0-9_-]{16,80}$/.test(requestId) || !["approve", "deny"].includes(decision)) {
      return sendNoStore(res, { ok: false, error: "invalid_approval_response" }, 400);
    }
    const status = decision === "approve" ? "approved" : "denied";
    const result = JSON.stringify({ decision, authorizedOnPhone: decision === "approve" });
    const info = db.prepare(
      "UPDATE mobile_approvals SET status=?,result_json=?,updated_at=? WHERE request_id=? AND target_token_hash=? AND status='pending'"
    ).run(status, result, Math.floor(Date.now() / 1e3), requestId, bearerHash(req));
    if (!info.changes) return sendNoStore(res, { ok: false, error: "approval_not_pending" }, 409);
    return sendNoStore(res, { ok: true, requestId, status });
  });
}
var ohlcCache = /* @__PURE__ */ new Map();
var knownCoinIds = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  XRP: "ripple",
  BNB: "binancecoin",
  DOGE: "dogecoin",
  ADA: "cardano",
  AVAX: "avalanche-2",
  DOT: "polkadot",
  LTC: "litecoin",
  LINK: "chainlink",
  TRX: "tron",
  SUI: "sui",
  XLM: "stellar",
  HBAR: "hedera-hashgraph",
  BCH: "bitcoin-cash",
  TON: "the-open-network",
  UNI: "uniswap",
  SHIB: "shiba-inu",
  PEPE: "pepe",
  AAVE: "aave",
  NEAR: "near",
  APT: "aptos",
  ARB: "arbitrum",
  OP: "optimism",
  XMR: "monero",
  TAO: "bittensor"
};
async function coinOhlc(symbol, rangeKey) {
  const key = symbol + ":" + rangeKey;
  const cached = ohlcCache.get(key);
  if (cached && Date.now() - cached.at < 25e3) return cached.payload;
  const conf = { "4H": ["5m", 48], "12H": ["15m", 48], "1D": ["30m", 48], "7D": ["4h", 42] }[rangeKey];
  if (!conf) throw new Error("invalid_request");
  try {
    const raw2 = await fetchJson(
      "https://api.mexc.com/api/v3/klines?" + new URLSearchParams({ symbol: symbol + "USDT", interval: conf[0], limit: String(conf[1]) }),
      { headers: { Accept: "application/json", "User-Agent": "AURELIS-Web/1.0" } },
      7e3
    );
    const candles2 = (Array.isArray(raw2) ? raw2 : []).map((row) => ({
      t: Number(row?.[0]),
      o: Number(row?.[1]),
      h: Number(row?.[2]),
      l: Number(row?.[3]),
      c: Number(row?.[4]),
      v: Number(row?.[5])
    })).filter((x) => [x.t, x.o, x.h, x.l, x.c].every(Number.isFinite));
    if (candles2.length) {
      const payload2 = { ok: true, symbol, range: rangeKey, source: "mexc_ohlc", interval: conf[0], candles: candles2 };
      ohlcCache.set(key, { at: Date.now(), payload: payload2 });
      return payload2;
    }
  } catch {
  }
  let coinId = knownCoinIds[symbol];
  if (!coinId) {
    const search = await fetchJson("https://api.coingecko.com/api/v3/search?query=" + encodeURIComponent(symbol), { headers: { Accept: "application/json" } }, 6e3);
    const matches = (search?.coins || []).filter((x) => String(x.symbol || "").toUpperCase() === symbol).sort((a, b) => (a.market_cap_rank || 1e9) - (b.market_cap_rank || 1e9));
    coinId = matches?.[0]?.id;
  }
  if (!coinId) throw new Error("coin_not_found");
  const days = rangeKey === "7D" ? "7" : "1";
  const raw = await fetchJson(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/ohlc?vs_currency=usd&days=${days}`, { headers: { Accept: "application/json" } }, 8e3);
  let candles = (Array.isArray(raw) ? raw : []).map((row) => ({ t: Number(row?.[0]), o: Number(row?.[1]), h: Number(row?.[2]), l: Number(row?.[3]), c: Number(row?.[4]) })).filter((x) => [x.t, x.o, x.h, x.l, x.c].every(Number.isFinite));
  if (["4H", "12H"].includes(rangeKey) && candles.length) {
    const cutoff = candles[candles.length - 1].t - (rangeKey === "4H" ? 4 : 12) * 36e5;
    candles = candles.filter((x) => x.t >= cutoff);
  }
  const payload = { ok: true, symbol, range: rangeKey, source: "coingecko_ohlc", candles };
  ohlcCache.set(key, { at: Date.now(), payload });
  return payload;
}
async function krakenTicker(symbol) {
  const aliases = { BTC: "XBT", DOGE: "XDG" };
  const base = aliases[symbol] || symbol;
  const pairs = await fetchJson("https://api.kraken.com/0/public/AssetPairs?execution_venue=bitnomial_exchange", { headers: { Accept: "application/json" } }, 1e4);
  const rows = pairs?.result || {};
  let match = null;
  for (const [pairId, info0] of Object.entries(rows)) {
    const info = info0;
    const alt = String(info?.altname || pairId).toUpperCase();
    const ws = String(info?.wsname || "").toUpperCase();
    const wanted = new Set([`${base}USD:BTNL`, `${symbol}/USD:BTNL`, `${base}/USD:BTNL`].map((x) => x.toUpperCase()));
    if (wanted.has(alt) || wanted.has(ws)) {
      match = { pairId, ...info };
      break;
    }
  }
  if (!match) {
    const normalPair = (symbol === "BTC" ? "XBT" : symbol) + "USD";
    const ticker2 = await fetchJson("https://api.kraken.com/0/public/Ticker?pair=" + encodeURIComponent(normalPair), { headers: { Accept: "application/json" } }, 1e4);
    const row2 = Object.values(ticker2?.result || {})[0];
    if (!row2) throw new Error("kraken_ticker_unavailable");
    return { mark: Number(row2.c?.[0]), pair: { pairId: normalPair, altname: normalPair, wsname: symbol + "/USD", lot_decimals: 8, pair_decimals: 5, leverage_buy: [], leverage_sell: [] }, ticker: row2 };
  }
  const ticker = await fetchJson("https://api.kraken.com/0/public/Ticker?pair=" + encodeURIComponent(match.altname), { headers: { Accept: "application/json" } }, 1e4);
  const row = Object.values(ticker?.result || {})[0];
  if (!row) throw new Error("kraken_ticker_unavailable");
  return { mark: Number(row.c?.[0]), pair: match, ticker: row };
}
var krakenNonce = 0;
function krakenCreds() {
  const key = String(process.env.KRAKEN_API_KEY || "").trim();
  const secret = String(process.env.KRAKEN_API_SECRET || "").trim();
  if (!key || !secret) throw new Error("kraken_not_configured");
  return { key, secret };
}
async function krakenPrivate(route, payload = {}) {
  const { key, secret } = krakenCreds();
  const nonce = String(Math.max(Date.now(), ++krakenNonce));
  krakenNonce = Number(nonce);
  const body = new URLSearchParams({ ...Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, String(v)])), nonce }).toString();
  const digest = crypto.createHash("sha256").update(nonce + body).digest();
  const sig = crypto.createHmac("sha512", Buffer.from(secret, "base64")).update(Buffer.concat([Buffer.from(route), digest])).digest("base64");
  const response = await fetch("https://api.kraken.com" + route, {
    method: "POST",
    headers: { "API-Key": key, "API-Sign": sig, "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "AURELIS-vNext/1.0" },
    body
  });
  const data = await response.json();
  if (!response.ok || Array.isArray(data?.error) && data.error.length) throw new Error("kraken_api_error:" + (data?.error || []).join(";"));
  return data?.result;
}
var krakenConfirmations = /* @__PURE__ */ new Map();
var KRAKEN_CONFIRM_TTL_MS = 10 * 60 * 1e3;
async function prepareKrakenOrder(payload) {
  const asset = String(payload?.asset || payload?.symbol || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const direction = String(payload?.direction || "").toUpperCase();
  const amount = Number(payload?.amount), leverage = Number(payload?.leverage), stop = Number(payload?.stopLoss), target = Number(payload?.takeProfit);
  if (!asset) throw new Error("invalid_asset");
  if (!["LONG", "SHORT"].includes(direction)) throw new Error("invalid_direction");
  if (![amount, leverage, stop, target].every((x) => Number.isFinite(x) && x > 0)) throw new Error("invalid_order_values");
  const { mark, pair } = await krakenTicker(asset);
  const buys = (pair.leverage_buy || []).map(Number), sells = (pair.leverage_sell || []).map(Number);
  const allowed = direction === "LONG" ? buys : sells;
  if (!allowed.includes(leverage)) throw new Error("kraken_leverage_not_supported");
  if (direction === "LONG" && !(stop < mark && mark < target)) throw new Error("invalid_long_protection");
  if (direction === "SHORT" && !(target < mark && mark < stop)) throw new Error("invalid_short_protection");
  const maxNotional = Number(process.env.AURELIS_KRAKEN_MAX_NOTIONAL_USD || 1e3);
  const maxLev = Number(process.env.AURELIS_KRAKEN_MAX_LEVERAGE || 10);
  if (amount > maxNotional) throw new Error("kraken_notional_limit");
  if (leverage > maxLev) throw new Error("kraken_leverage_limit");
  const trade = await krakenPrivate("/0/private/TradeBalance", { asset: "ZUSD" });
  const free = Number(trade?.mf || 0), margin = amount / leverage;
  if (free < margin) throw new Error(`kraken_insufficient_free_margin:requires_${margin.toFixed(2)}_USD:available_${free.toFixed(2)}_USD`);
  const lotDecimals = Number(pair.lot_decimals || 8), pairDecimals = Number(pair.pair_decimals || 5);
  const quantity = (amount / mark).toFixed(lotDecimals);
  const preview = {
    symbol: pair.altname,
    pairId: pair.pairId,
    asset,
    direction,
    markPrice: String(mark),
    positionValueUsd: String(amount),
    estimatedMarginUsd: String(margin),
    freeMarginUsd: String(free),
    quantity,
    leverage: String(Math.trunc(leverage)),
    stopLoss: stop.toFixed(pairDecimals),
    takeProfit: target.toFixed(pairDecimals),
    orderMinimum: pair.ordermin || null,
    lotDecimals,
    pairDecimals,
    broker: "Kraken Derivatives US"
  };
  const token = crypto.randomBytes(32).toString("base64url");
  krakenConfirmations.set(token, { preview, expiresAt: Date.now() + 9e4, used: false });
  return { ok: true, provider: "KRAKEN_MARGIN", preview, signal: payload?.signal || {}, confirmation: { token, expiresInSeconds: 90 }, execution: { configured: true, readOnlyPreview: false, maxNotionalUsd: String(maxNotional), maxLeverage: String(maxLev) } };
}
async function submitKrakenOrder(payload) {
  const token = String(payload?.confirmationToken || "");
  const item = krakenConfirmations.get(token);
  if (!item || Date.now() > item.expiresAt) throw new Error("trade_confirmation_expired");
  if (item.used) throw new Error("trade_confirmation_used");
  item.used = true;
  const p = item.preview;
  const side = p.direction === "LONG" ? "buy" : "sell";
  const entry = await krakenPrivate("/0/private/AddOrder", {
    ordertype: "market",
    type: side,
    volume: p.quantity,
    pair: p.symbol,
    leverage: p.leverage,
    cl_ord_id: ("aur" + Date.now().toString().slice(-8) + token.replace(/[^A-Za-z0-9]/g, "").slice(0, 5)).slice(0, 18)
  });
  return { ok: true, provider: "KRAKEN_MARGIN", entry, preview: p, submittedAt: Date.now() };
}
var AAVE_MCP_DEFAULT_ENDPOINT = "https://mcp.aave.com";
var AAVE_MCP_TIMEOUT_MS = 12e3;
var aaveToolCache = null;
function aaveEndpoint() {
  const configured = String(process.env.AURELIS_AAVE_MCP_URL || AAVE_MCP_DEFAULT_ENDPOINT).trim();
  return configured || AAVE_MCP_DEFAULT_ENDPOINT;
}
async function aaveFetch(endpoint, headers, payload, timeoutMs = AAVE_MCP_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const text = await response.text();
    const body = safeJson(text, {});
    if (response.status === 429) throw new Error("aave_mcp_rate_limited");
    if (response.status === 401) throw new Error("aave_mcp_unauthorized");
    if (!response.ok) throw new Error(String(body?.error?.message || body?.error || "aave_mcp_http_" + response.status));
    return { response, body };
  } catch (e) {
    if (e?.name === "AbortError") throw new Error("aave_mcp_timeout");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
async function aaveSession() {
  const endpoint = aaveEndpoint();
  const headers = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    "User-Agent": "AURELIS-vNext/1.0"
  };
  const { response, body } = await aaveFetch(endpoint, headers, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "AURELIS-vNext", version: "1.0" } }
  });
  const sid = response.headers.get("mcp-session-id");
  if (!sid || !body?.result) throw new Error("aave_mcp_init_failed");
  headers["mcp-session-id"] = sid;
  await aaveFetch(endpoint, headers, { jsonrpc: "2.0", method: "notifications/initialized", params: {} }, 5e3).catch(() => {
  });
  return { endpoint, headers };
}
async function aaveTools(session, force = false) {
  if (!force && aaveToolCache && Date.now() - aaveToolCache.at < 3e5) return aaveToolCache;
  const { body } = await aaveFetch(session.endpoint, session.headers, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const tools = Array.isArray(body?.result?.tools) ? body.result.tools : [];
  const cache = { at: Date.now(), names: new Set(tools.map((t) => String(t?.name || "")).filter(Boolean)), raw: tools };
  aaveToolCache = cache;
  return cache;
}
async function aaveTool(session, name, args, id) {
  const capabilities = await aaveTools(session);
  if (!capabilities.names.has(name)) throw new Error("aave_mcp_tool_unavailable:" + name);
  const { body: env } = await aaveFetch(session.endpoint, session.headers, { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
  if (env?.error) throw new Error(String(env.error?.message || env.error));
  const result = env?.result || {};
  if (result.isError) {
    const text = (result.content || []).map((x) => x?.text).filter(Boolean).join(" ");
    throw new Error(text || "aave_mcp_tool_error");
  }
  if (result.structuredContent && typeof result.structuredContent === "object") return result.structuredContent;
  for (const item of result.content || []) if (item?.type === "text") {
    const v = safeJson(item.text, null);
    if (v) return v;
  }
  throw new Error("aave_mcp_no_data");
}
function aaveRequestedSymbols(message) {
  const known = ["USDC", "USDT", "DAI", "GHO", "ETH", "WETH", "WBTC", "BTC", "AAVE", "LINK", "UNI", "LDO", "CRV", "USDE", "PYUSD", "EURC"];
  const raw = String(message || "");
  const upper = raw.toUpperCase();
  return known.filter((sym) => {
    if (!new RegExp("\b" + sym + "\b").test(upper)) return false;
    if (sym !== "AAVE") return true;
    return /\$AAVE|AAVE\s+TOKEN|(?:SUPPLY|DEPOSIT|LEND|BORROW|WITHDRAW|REPAY)\s+(?:ANOTHER\s+)?(?:[0-9.,]+\s+)?AAVE/i.test(raw);
  }).slice(0, 4);
}
function aaveRequestedChainId(message) {
  const s = String(message || "").toLowerCase();
  const pairs = [
    [/\\bethereum\\b|\\bmainnet\\b/, 1],
    [/\\barbitrum\\b/, 42161],
    [/\\bbase\\b/, 8453],
    [/\\bavalanche\\b|\\bavax\\b/, 43114],
    [/\\boptimism\\b/, 10],
    [/\\bpolygon\\b/, 137],
    [/\\barc\\b/, 5042]
  ];
  return pairs.find(([re]) => re.test(s))?.[1];
}
function aaveActionRequest(message) {
  const s = String(message || "").trim();
  const m = s.match(/\\b(supply|deposit|lend|borrow|withdraw|repay)\\b/i);
  if (!m) return null;
  const raw = m[1].toLowerCase();
  const action = raw === "deposit" || raw === "lend" ? "supply" : raw;
  const max = /\\b(all|max|maximum|entire)\\b/i.test(s);
  const after = s.slice((m.index || 0) + m[0].length);
  const amountMatch = after.match(/(?:another\\s+)?([0-9][0-9,]*(?:\\.[0-9]+)?)/i);
  const amount = amountMatch ? amountMatch[1].replace(/,/g, "") : void 0;
  const symbols = aaveRequestedSymbols(s);
  return { action, amount, symbol: symbols[0], max };
}
function flattenAaveMarkets(payload) {
  const data = payload?.data || payload || {};
  const rows = [];
  for (const version of ["v4", "v3"]) {
    const section = data?.[version];
    for (const market of section?.markets || []) {
      if (version === "v4") rows.push({ ...market, version });
      else {
        for (const reserve of market?.reserves || []) rows.push({ ...reserve, version, market: market?.market, chainId: market?.chainId });
      }
    }
  }
  return rows;
}
function aaveCapacity(row, action) {
  if (action === "supply") return Number(row?.suppliable ?? row?.availableLiquidity ?? 0);
  if (action === "borrow") return Number(row?.borrowable ?? row?.availableLiquidity ?? 0);
  return Number.POSITIVE_INFINITY;
}
async function runAaveAgentQuery(message, walletAddress) {
  const text = String(message || "").trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  const namesAave = /\baave\b/i.test(text);
  const protocolIntent = /health factor|lending rate|borrow rate|supply rate|\bapy\b|\byield\b|\bliquidity\b|\bborrow\b|\bsupply\b|\bdeposit\b|\blend\b|\bwithdraw\b|\brepay\b|\bposition(?:s)?\b|\bdebt\b|\bcollateral\b/i.test(text);
  const asksAave = namesAave && protocolIntent || /health factor|aave position|aave debt|aave collateral/i.test(text);
  const action = namesAave ? aaveActionRequest(text) : null;
  if (!asksAave) return null;
  const session = await aaveSession();
  let id = 2;
  const chainId = aaveRequestedChainId(text);
  const symbols = aaveRequestedSymbols(text);
  if (/health factor|health|position|positions|debt|collateral|net worth/i.test(lower)) {
    if (!walletAddress) return { ok: false, kind: "wallet_required", message: "Connect or authenticate the AURELIS wallet to inspect Aave positions." };
    const [summary, positions] = await Promise.all([
      aaveTool(session, "get_user_summary", { user: walletAddress, version: "all", ...chainId ? { chainId } : {} }, id++),
      aaveTool(session, "get_user_positions", { user: walletAddress, version: "all", ...chainId ? { chainId } : {} }, id++)
    ]);
    return { ok: true, kind: "position", source: "Aave MCP", wallet: walletAddress, summary, positions };
  }
  if (action) {
    if (!walletAddress) return { ok: false, kind: "wallet_required", message: "Connect or authenticate the AURELIS wallet before simulating or preparing an Aave action." };
    if (!action.symbol) return { ok: false, kind: "needs_asset", message: `Specify the asset for the Aave ${action.action} action.` };
    if (!action.amount && !action.max) return { ok: false, kind: "needs_amount", message: `Specify an amount for the Aave ${action.action} action.` };
    if (action.action === "withdraw" || action.action === "repay") {
      const positions = await aaveTool(session, "get_user_positions", { user: walletAddress, version: "all", ...chainId ? { chainId } : {} }, id++);
      return {
        ok: true,
        kind: "position_selection_required",
        source: "Aave MCP",
        action: action.action,
        requested: action,
        positions,
        message: "Aave requires the reserveId from the wallet position for withdraw/repay. The agent has loaded the positions but will not guess which spoke/reserve to exit."
      };
    }
    const markets2 = await aaveTool(session, "get_markets", { version: "all", symbols: [action.symbol], user: walletAddress, ...chainId ? { chainId } : {} }, id++);
    let candidates = flattenAaveMarkets(markets2).filter((row2) => {
      const can = action.action === "supply" ? row2?.canSupply !== false : row2?.canBorrow !== false;
      const amount = Number(action.amount || 0);
      const symbolMatches = String(row2?.symbol || "").toUpperCase() === String(action.symbol || "").toUpperCase();
      return symbolMatches && can && (!chainId || Number(row2?.chainId) === chainId) && (!amount || aaveCapacity(row2, action.action) >= amount);
    });
    candidates = candidates.slice(0, 20);
    if (candidates.length !== 1) {
      return {
        ok: true,
        kind: "reserve_selection_required",
        source: "Aave MCP",
        action: action.action,
        requested: action,
        candidates,
        message: candidates.length ? "Multiple valid Aave reserves match this request. Choose the chain/spoke before simulation or preparation." : "No Aave reserve currently matches the requested asset, chain, amount, and action."
      };
    }
    const row = candidates[0];
    const selector = row.version === "v4" ? { version: "v4", reserveId: String(row.reserveId) } : { version: "v3", market: String(row.market), token: String(row.underlyingToken || row.token || row.address), chainId: Number(row.chainId) };
    const args = {
      action: action.action,
      sender: walletAddress,
      ...action.max ? { max: true } : { amount: String(action.amount) },
      ...selector
    };
    const preview = await aaveTool(session, "preview_action", args, id++);
    const wantsPrepare = /\\bprepare|build|ready to sign|unsigned transaction|transaction\\b/i.test(lower);
    const prepared = wantsPrepare ? await aaveTool(session, "prepare_action", args, id++) : null;
    return { ok: true, kind: prepared ? "prepared_action" : "preview_action", source: "Aave MCP", requested: action, reserve: row, preview, prepared };
  }
  const marketArgs = { version: "all" };
  if (symbols.length) marketArgs.symbols = symbols;
  if (chainId) marketArgs.chainId = chainId;
  if (walletAddress && /can i|my wallet|available to me|balance/i.test(lower)) marketArgs.user = walletAddress;
  const markets = await aaveTool(session, "get_markets", marketArgs, id++);
  return { ok: true, kind: "markets", source: "Aave MCP", markets };
}
async function morphoMarkets(chains) {
  const gql = `query BorrowMarkets($chains:[Int!]) {
    markets(first: 1000, orderBy: SupplyAssetsUsd, orderDirection: Desc, where: {listed: true, chainId_in: $chains}) {
      items { marketId chain { id network } lltv loanAsset { address symbol decimals price { usd timestamp } }
      collateralAsset { address symbol decimals price { usd timestamp } }
      state { borrowApy avgBorrowApy avgNetBorrowApy liquidityAssets liquidityAssetsUsd utilization } }
    }
  }`;
  const payload = await fetchJson("https://api.morpho.org/graphql", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ query: gql, variables: { chains } })
  }, 15e3);
  return payload?.data?.markets?.items || [];
}
var chainNames = { 1: "Ethereum", 10: "Optimism", 56: "BNB Chain", 100: "Gnosis", 130: "Unichain", 137: "Polygon", 143: "Monad", 146: "Sonic", 196: "X Layer", 999: "HyperEVM", 1088: "Metis", 1868: "Soneium", 42220: "Celo", 42161: "Arbitrum", 43114: "Avalanche", 4663: "Robinhood Chain", 5e3: "Mantle", 8453: "Base", 324: "zkSync Era", 4326: "MegaETH", 5042: "Arc", 9745: "Plasma", 57073: "Ink", 534352: "Scroll", 59144: "Linea", 747474: "Katana" };
async function buildBorrowCatalog() {
  const errors = [];
  let morpho = [];
  let aave = [];
  try {
    const rows = await morphoMarkets([1, 10, 130, 137, 143, 999, 4663, 5042, 8453, 42161, 747474]);
    morpho = rows.map((item) => ({
      provider: "Morpho",
      chainId: Number(item?.chain?.id || 0),
      marketId: item.marketId,
      collateral: item?.collateralAsset?.symbol,
      borrow: item?.loanAsset?.symbol,
      borrowApy: item?.state?.borrowApy,
      liquidityUsd: item?.state?.liquidityAssetsUsd,
      liquidityAssets: item?.state?.liquidityAssets,
      utilization: item?.state?.utilization,
      lltv: item?.lltv,
      source: "morpho_api"
    }));
  } catch (e) {
    errors.push({ provider: "Morpho", error: String(e?.message || e).slice(0, 180) });
  }
  try {
    const s = await aaveSession();
    let id = 2;
    const chains = await aaveTool(s, "get_chains", { version: "v3" }, id++);
    const rows = chains?.data?.v3 || chains?.v3 || [];
    for (const ch of rows.slice(0, 25)) {
      const chainId = Number(ch?.chainId);
      if (!chainId) continue;
      const response = await aaveTool(s, "get_markets", { version: "v3", chainId }, id++);
      const root = response?.data || response;
      const section = root?.v3 || {};
      for (const market of section?.markets || []) for (const reserve of market?.reserves || []) {
        aave.push({
          provider: "Aave",
          version: "V3",
          chainId: Number(market?.chainId || chainId),
          market: market?.market,
          collateral: reserve?.symbol,
          borrow: reserve?.symbol,
          canUseAsCollateral: !!reserve?.canUseAsCollateral,
          canSupply: reserve?.canSupply !== false,
          canBorrow: !!reserve?.canBorrow,
          isFrozen: !!reserve?.isFrozen,
          isPaused: !!reserve?.isPaused,
          borrowCapReached: !!reserve?.borrowCapReached,
          source: "aave_mcp"
        });
      }
    }
  } catch (e) {
    errors.push({ provider: "Aave", error: String(e?.message || e).slice(0, 180) });
  }
  for (const row of [...morpho, ...aave]) row.network = chainNames[Number(row.chainId)] || String(row.chainId || "Unknown");
  const collateral = /* @__PURE__ */ new Map(), borrow = /* @__PURE__ */ new Map();
  const add = (map, sym, provider, network) => {
    if (!sym) return;
    if (!map.has(sym)) map.set(sym, { symbol: sym, providers: /* @__PURE__ */ new Set(), networks: /* @__PURE__ */ new Set() });
    const e = map.get(sym);
    e.providers.add(provider);
    if (network) e.networks.add(network);
  };
  for (const row of morpho) {
    add(collateral, row.collateral, "Morpho", row.network);
    add(borrow, row.borrow, "Morpho", row.network);
  }
  for (const row of aave) {
    if (row.collateral && row.canSupply && !row.isFrozen && !row.isPaused) add(collateral, row.collateral, "Aave", row.network);
    if (row.borrow && row.canBorrow && !row.isPaused && !row.borrowCapReached) add(borrow, row.borrow, "Aave", row.network);
  }
  const clean = (m) => Array.from(m.values()).map((x) => ({ symbol: x.symbol, providers: Array.from(x.providers).sort(), networks: Array.from(x.networks).sort() })).sort((a, b) => a.symbol.localeCompare(b.symbol));
  return { ok: !!(morpho.length || aave.length), generatedAt: Date.now(), providers: { Aave: { marketRows: aave.length, source: "Official Aave MCP" }, Morpho: { marketRows: morpho.length, source: "Official Morpho API" } }, collateralAssets: clean(collateral), borrowAssets: clean(borrow), aave, morpho, errors };
}
var borrowCache = null;
function registerMarketAndBotRoutes(app2) {
  app2.get("/api/crypto-news", async (_req, res) => {
    const feeds = [
      ["Cointelegraph", "https://cointelegraph.com/rss"],
      ["Decrypt", "https://decrypt.co/feed"],
      ["CryptoSlate", "https://cryptoslate.com/feed/"],
      ["NewsBTC", "https://www.newsbtc.com/feed/"],
      ["Bitcoin Magazine", "https://bitcoinmagazine.com/.rss/full/"],
      ["BeInCrypto", "https://beincrypto.com/feed/"],
      ["The Defiant", "https://thedefiant.io/api/feed"],
      ["Crypto Briefing", "https://cryptobriefing.com/feed/"],
      ["CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"]
    ];
    const articles = [];
    const clean = (s) => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
    for (const [source, url] of feeds) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1e4);
        const response = await fetch(url, { headers: { "User-Agent": "AURELIS-vNext/1.0" }, signal: controller.signal });
        clearTimeout(timer);
        if (!response.ok) continue;
        const xml = await response.text();
        const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
        for (const item of items.slice(0, 8)) {
          const pick = (tag) => {
            const m = item.match(new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/" + tag + ">", "i"));
            return clean(m?.[1] || "");
          };
          const title = pick("title"), link = pick("link"), published = pick("pubDate");
          const imageMatch = item.match(/<(?:media:content|media:thumbnail|enclosure)\b[^>]*\burl=["']([^"']+)["'][^>]*>/i);
          if (title && link) articles.push({ title, url: link, source, published, image: imageMatch?.[1] || null });
        }
      } catch {
      }
    }
    if (articles.length) {
      articles.sort((a, b) => Number(new Date(b.published || 0)) - Number(new Date(a.published || 0)));
      const seen = /* @__PURE__ */ new Set();
      const deduped = articles.filter((a) => {
        const key = String(a.url || a.title || "").toLowerCase().replace(/[#?].*$/, "");
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return res.json(deduped.slice(0, 36));
    }
    return sendNoStore(res, { ok: false, error: "crypto_news_unavailable" }, 502);
  });
  app2.get("/api/coin-ohlc", async (req, res) => {
    const symbol = String(req.query.symbol || "BTC").toUpperCase().trim();
    const range = String(req.query.range || "1D").toUpperCase().trim();
    if (!/^[A-Z0-9]{1,24}$/.test(symbol) || !["4H", "12H", "1D", "7D"].includes(range)) return sendNoStore(res, { ok: false, error: "invalid_request" }, 400);
    try {
      return res.json(await coinOhlc(symbol, range));
    } catch (e) {
      return sendNoStore(res, { ok: false, error: "ohlc_unavailable", detail: e?.message || String(e) }, 503);
    }
  });
  app2.get("/api/trade-radar", async (req, res) => {
    try {
      const q = new URLSearchParams({ mode: String(req.query.mode || "all"), limit: String(req.query.limit || 5), force: String(req.query.force || 0) });
      const data = await fetchJson("http://127.0.0.1:8792/api/radar?" + q.toString(), { headers: { Accept: "application/json" } }, 55e3);
      return sendNoStore(res, data);
    } catch (e) {
      return sendNoStore(res, { ok: false, error: "trade_radar_unavailable", detail: e?.message || String(e) }, 502);
    }
  });
  app2.get("/api/kraken/live-status", async (_req, res) => {
    try {
      const positionsRaw = await krakenPrivate("/0/private/OpenPositions", { docalcs: "true" });
      const ordersRaw = await krakenPrivate("/0/private/OpenOrders", {});
      const positions = Object.entries(positionsRaw || {}).map(([txid, row]) => {
        const vol = Number(row?.vol || 0), closed = Number(row?.vol_closed || 0);
        return {
          txid,
          pair: String(row?.pair || "").split(":")[0],
          rawPair: String(row?.pair || ""),
          side: String(row?.type || "").toLowerCase(),
          volume: vol,
          remaining: Math.max(0, vol - closed),
          cost: Number(row?.cost || 0),
          margin: Number(row?.margin || 0),
          value: Number(row?.value || 0),
          pnl: Number(row?.net || 0),
          openingPrice: Number(row?.cost || 0) / (vol || 1),
          rolloverTime: Number(row?.rollovertm || 0),
          posstatus: String(row?.posstatus || "open")
        };
      }).filter((x) => x.remaining > 0);
      const open = ordersRaw?.open || {};
      const orders = Object.entries(open).map(([txid, row]) => ({
        txid,
        status: String(row?.status || "open"),
        pair: String(row?.descr?.pair || ""),
        side: String(row?.descr?.type || ""),
        orderType: String(row?.descr?.ordertype || ""),
        price: Number(row?.descr?.price || 0),
        volume: Number(row?.vol || 0),
        filled: Number(row?.vol_exec || 0),
        openedAt: Number(row?.opentm || 0)
      }));
      return sendNoStore(res, { ok: true, positions, orders, updatedAt: Date.now() });
    } catch (e) {
      return sendNoStore(res, { ok: false, error: e?.message || String(e) }, 502);
    }
  });
  app2.post("/api/kraken/cancel-order", async (req, res) => {
    if (!requireVerified(req, res)) return;
    const txid = String(req.body?.txid || "").trim();
    if (!txid) return sendNoStore(res, { ok: false, error: "invalid_order_id" }, 400);
    try {
      const result = await krakenPrivate("/0/private/CancelOrder", { txid });
      return sendNoStore(res, { ok: true, txid, result });
    } catch (e) {
      return sendNoStore(res, { ok: false, error: e?.message || String(e) }, 409);
    }
  });
  app2.post("/api/kraken/close-position", async (req, res) => {
    if (!requireVerified(req, res)) return;
    const txid = String(req.body?.txid || "").trim();
    if (!txid) return sendNoStore(res, { ok: false, error: "invalid_position_id" }, 400);
    try {
      const positions = await krakenPrivate("/0/private/OpenPositions", { txid, docalcs: "true" });
      const row = positions?.[txid];
      if (!row) return sendNoStore(res, { ok: true, txid, alreadyClosed: true, message: "Position is no longer open." });
      const vol = Number(row?.vol || 0), closed = Number(row?.vol_closed || 0);
      const remaining = Math.max(0, vol - closed);
      if (!(remaining > 0)) return sendNoStore(res, { ok: true, txid, alreadyClosed: true, message: "Position is already closed." });
      const side = String(row?.type || "").toLowerCase() === "buy" ? "sell" : "buy";
      const pair = String(row?.pair || "").trim();
      if (!pair) return sendNoStore(res, { ok: false, error: "invalid_position_pair" }, 400);
      try {
        const result = await krakenPrivate("/0/private/AddOrder", {
          ordertype: "market",
          type: side,
          volume: String(remaining),
          pair,
          leverage: "2",
          reduce_only: "true",
          cl_ord_id: ("aurclose" + Date.now().toString().slice(-8)).slice(0, 18)
        });
        return sendNoStore(res, { ok: true, txid, pair, side, volume: remaining, result, submittedAt: Date.now() });
      } catch (orderError) {
        const message = String(orderError?.message || orderError);
        if (message.includes("Reduce only:Non-ECP") && !pair.includes(":BTNL")) {
          const retailPair = pair + ":BTNL";
          const retry = await krakenPrivate("/0/private/AddOrder", { ordertype: "market", type: side, volume: String(remaining), pair: retailPair, leverage: "2", reduce_only: "true", cl_ord_id: ("aurclose" + Date.now().toString().slice(-8)).slice(0, 18) });
          return sendNoStore(res, { ok: true, txid, pair: retailPair, side, volume: remaining, result: retry, submittedAt: Date.now(), route: "BTNL" });
        }
        if (message.includes("Invalid position")) {
          const live = await krakenPrivate("/0/private/OpenPositions", { docalcs: "true" });
          if (!live?.[txid]) {
            return sendNoStore(res, { ok: true, txid, alreadyClosed: true, message: "Position closed before Kraken processed the follow-up request." });
          }
        }
        throw orderError;
      }
    } catch (e) {
      return sendNoStore(res, { ok: false, error: e?.message || String(e) }, 409);
    }
  });
  app2.post("/api/signal-desk/order/prepare", async (req, res) => {
    if (!requireVerified(req, res)) return;
    try {
      return sendNoStore(res, await prepareKrakenOrder({ ...req.body, provider: "KRAKEN" }));
    } catch (e) {
      const msg = e?.message || String(e);
      return sendNoStore(res, { ok: false, error: msg }, msg.startsWith("invalid_") || msg.includes("leverage_not_supported") ? 400 : 409);
    }
  });
  app2.post("/api/signal-desk/order/submit", async (req, res) => {
    if (!requireVerified(req, res)) return;
    try {
      return sendNoStore(res, await submitKrakenOrder(req.body));
    } catch (e) {
      return sendNoStore(res, { ok: false, error: e?.message || String(e) }, 409);
    }
  });
  app2.get("/api/borrow/catalog", async (req, res) => {
    try {
      const force = ["1", "true", "yes"].includes(String(req.query.refresh || "").toLowerCase());
      if (borrowCache && !force && Date.now() - borrowCache.at < 6e4) return sendNoStore(res, borrowCache.payload);
      const payload = await buildBorrowCatalog();
      if (payload.ok) borrowCache = { at: Date.now(), payload };
      return sendNoStore(res, payload, payload.ok ? 200 : 502);
    } catch (e) {
      return sendNoStore(res, { ok: false, error: "borrow_catalog_unavailable", detail: e?.message || String(e) }, 502);
    }
  });
  app2.get("/api/borrow/positions", async (req, res) => {
    const address = String(req.query.address || "").trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return sendNoStore(res, { ok: false, error: "invalid_address" }, 400);
    const chainIds = [1, 10, 130, 137, 143, 999, 4663, 5042, 8453, 42161, 747474];
    const positions = [], errors = [];
    const gql = `query UserBorrowPositions($address:String!,$chainId:Int!){ userByAddress(address:$address,chainId:$chainId){ marketPositions{ market{marketId loanAsset{address symbol decimals} collateralAsset{address symbol decimals}} state{borrowAssets borrowAssetsUsd collateral collateralUsd} } } }`;
    for (const chainId of chainIds) {
      try {
        const payload = await fetchJson("https://api.morpho.org/graphql", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ query: gql, variables: { address, chainId } }) }, 12e3);
        for (const item of payload?.data?.userByAddress?.marketPositions || []) {
          const state = item?.state || {};
          if (Number(state.borrowAssets || 0) <= 0) continue;
          positions.push({ provider: "Morpho", chainId, network: chainNames[chainId] || String(chainId), marketId: item?.market?.marketId, collateralAsset: item?.market?.collateralAsset?.symbol, collateralAmount: state.collateral, collateralUsd: state.collateralUsd, debtAsset: item?.market?.loanAsset?.symbol, debtAmount: state.borrowAssets, debtUsd: state.borrowAssetsUsd, source: "morpho_api" });
        }
      } catch (e) {
        errors.push({ provider: "Morpho", chainId, error: String(e?.message || e).slice(0, 160) });
      }
    }
    return sendNoStore(res, { ok: true, address, positions, errors, generatedAt: Date.now() });
  });
  app2.get("/api/borrow/aave/details", async (req, res) => {
    const symbol = String(req.query.symbol || "").trim();
    if (!symbol || symbol.length > 48) return sendNoStore(res, { ok: false, error: "invalid_symbol" }, 400);
    try {
      const s = await aaveSession();
      let id = 2;
      const details = [];
      const chains = await aaveTool(s, "get_chains", { version: "v3" }, id++);
      const rows = chains?.data?.v3 || chains?.v3 || [];
      for (const ch of rows.slice(0, 25)) {
        const chainId = Number(ch?.chainId);
        if (!chainId) continue;
        const markets = await aaveTool(s, "get_markets", { version: "v3", chainId, symbols: [symbol] }, id++);
        const root = markets?.data || markets;
        const section = root?.v3 || {};
        for (const market of section?.markets || []) for (const reserve of market?.reserves || []) {
          if (String(reserve?.symbol || "").toUpperCase() !== symbol.toUpperCase()) continue;
          const detail = await aaveTool(s, "get_reserve_details", { version: "v3", market: market.market, token: reserve.underlyingToken, chainId: market.chainId || chainId }, id++);
          const d = detail?.data || detail;
          if (d && typeof d === "object") details.push({ ...d, protocolVersion: "V3", marketKey: market.market });
        }
      }
      return sendNoStore(res, { ok: true, symbol, details });
    } catch (e) {
      return sendNoStore(res, { ok: false, error: "aave_unavailable", detail: String(e?.message || e).slice(0, 180) }, 502);
    }
  });
}
function stableStringify(value) {
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}
function registerMobileCompatibilityRoutes(app2) {
  app2.get("/api/phone/fiat/quotes", (_req, res) => sendNoStore(res, { ok: false, error: "direct_fiat_buy_disabled" }, 410));
  app2.post("/api/mobile/live-bet/execute", async (req, res) => {
    if (!mobileAiAuthorized(req)) return sendNoStore(res, { ok: false, error: "ai_device_auth_required" }, 401);
    const token = String(req.body?.token || "").trim();
    if (!token || token.length > 256) return sendNoStore(res, { ok: false, error: "invalid_confirmation_token" }, 400);
    try {
      const consumed = await fetchJson("http://127.0.0.1:8792/api/live-bet/toobit-consume", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }, 8e3);
      if (!consumed?.ok) return sendNoStore(res, { ok: false, error: consumed?.error || "live_bet_confirmation_invalid", message: consumed?.message || "Live Bet confirmation is invalid or expired." }, 409);
      const preview = consumed?.preview || {}, claimed = String(consumed?.fingerprint || "");
      const fingerprint = crypto.createHash("sha256").update(stableStringify(preview)).digest("hex");
      if (!claimed || fingerprint !== claimed) throw new Error("live_bet_integrity_failed");
      const symbol = String(preview?.symbol || "").toUpperCase(), asset = symbol.replace(/-SWAP-USDT$/, "").replace(/USDT$/, "").replace(/USD$/, "");
      const direction = String(preview?.direction || "").toUpperCase();
      if (!/^[A-Z0-9._-]{2,24}$/.test(asset) || !["LONG", "SHORT"].includes(direction)) throw new Error("invalid_live_bet_preview");
      const amount = Math.max(1, Number(preview?.requestedPositionValueUSDT || preview?.valueQuantity || 10));
      const side = direction === "LONG" ? "YES" : "NO";
      const kalshiUrl = "/kalshi.html?" + new URLSearchParams({ source: "live-bet", asset, side, amount: String(amount), duration: "15m" }).toString();
      return sendNoStore(res, { ok: true, venue: "KALSHI", asset, side, amount, kalshiUrl, message: "Live Bet imported. Opening the matching Kalshi crypto market for final review.", writePerformed: false });
    } catch (e) {
      return sendNoStore(res, { ok: false, error: e?.message || "live_bet_confirmation_consume_failed", message: "Could not verify the locked Live Bet confirmation. Nothing was submitted." }, 409);
    }
  });
}
function registerMigratedBackend(app2) {
  registerAuthRoutes(app2);
  registerWalletRoutes(app2);
  registerAlertRoutes(app2);
  registerMarketAndBotRoutes(app2);
  registerMobileCompatibilityRoutes(app2);
}

// server.ts
dotenv.config();
dotenv.config({ path: path2.resolve(process.cwd(), ".env.runtime-secrets") });
var __filename = fileURLToPath(import.meta.url);
var __dirname = path2.dirname(__filename);
var app = express();
function getArg(name) {
  const index = process.argv.indexOf(name);
  if (index !== -1 && index + 1 < process.argv.length) {
    return process.argv[index + 1];
  }
  return void 0;
}
var port = Number(getArg("--port") || process.env.PORT || 3e3);
var host = getArg("--host") || process.env.HOST || "0.0.0.0";
app.use(express.json({ limit: "12mb" }));
registerMigratedBackend(app);
app.use("/api/exchange", exchangeRouter);
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
});
app.get("/api/walletconnect/config", (_req, res) => {
  const projectId = process.env.AURELIS_REOWN_PROJECT_ID || "";
  res.json({ ok: Boolean(projectId), projectId: projectId || null });
});
var alpacaConfig = (accountType = "live") => {
  const account = String(accountType || "live").toLowerCase() === "ira" ? "ira" : "live";
  const prefix = account === "ira" ? "ALPACA_IRA" : "ALPACA_LIVE";
  const key = process.env[prefix + "_API_KEY"] || "";
  const secret = process.env[prefix + "_API_SECRET"] || "";
  const explicitBase = process.env.ALPACA_BASE_URL || process.env.APCA_API_BASE_URL || "";
  const paper = String(process.env.ALPACA_ENV || "").toLowerCase() === "paper" || explicitBase.includes("paper-api");
  const baseUrl = explicitBase || (paper ? "https://paper-api.alpaca.markets" : "https://api.alpaca.markets");
  return { account, key, secret, baseUrl, paper, configured: Boolean(key && secret) };
};
async function alpacaRequest(accountType, pathname, init = {}) {
  const cfg = alpacaConfig(accountType);
  if (!cfg.configured) throw new Error("alpaca_not_configured");
  const response = await fetch(cfg.baseUrl + pathname, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "APCA-API-KEY-ID": cfg.key,
      "APCA-API-SECRET-KEY": cfg.secret,
      ...init.headers || {}
    }
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const detail = body?.message || body?.error || "Alpaca HTTP " + response.status;
    const error = new Error(detail);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}
app.get("/api/alpaca/overview", async (req, res) => {
  const accountType = String(req.query.account || "live").toLowerCase() === "ira" ? "ira" : "live";
  const cfg = alpacaConfig(accountType);
  res.setHeader("Cache-Control", "no-store");
  if (!cfg.configured) return res.json({ ok: true, configured: false, accountType, environment: cfg.paper ? "PAPER" : "LIVE", account: null, positions: [], orders: [] });
  try {
    const [account, positions, orders] = await Promise.all([
      alpacaRequest(accountType, "/v2/account"),
      alpacaRequest(accountType, "/v2/positions"),
      alpacaRequest(accountType, "/v2/orders?status=all&limit=20&direction=desc")
    ]);
    return res.json({ ok: true, configured: true, accountType, environment: cfg.paper ? "PAPER" : "LIVE", account, positions: Array.isArray(positions) ? positions : [], orders: Array.isArray(orders) ? orders : [] });
  } catch (error) {
    return res.status(error?.status || 502).json({ ok: false, configured: true, accountType, environment: cfg.paper ? "PAPER" : "LIVE", error: "alpaca_unavailable", detail: error?.message || String(error) });
  }
});
app.post("/api/alpaca/orders", async (req, res) => {
  const accountType = String(req.body?.account || "live").toLowerCase() === "ira" ? "ira" : "live";
  const cfg = alpacaConfig(accountType);
  res.setHeader("Cache-Control", "no-store");
  if (!cfg.configured) return res.status(409).json({ ok: false, error: "alpaca_not_configured", accountType });
  if (req.body?.confirm !== true) return res.status(400).json({ ok: false, error: "confirmation_required" });
  const symbol = String(req.body?.symbol || "").trim().toUpperCase();
  const side = String(req.body?.side || "").toLowerCase();
  const type = String(req.body?.type || "market").toLowerCase();
  const notional = Number(req.body?.notional || 0);
  const limitPrice = Number(req.body?.limitPrice || 0);
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) return res.status(400).json({ ok: false, error: "invalid_symbol" });
  if (!["buy", "sell"].includes(side)) return res.status(400).json({ ok: false, error: "invalid_side" });
  if (!["market", "limit"].includes(type)) return res.status(400).json({ ok: false, error: "invalid_order_type" });
  if (!Number.isFinite(notional) || notional <= 0 || notional > 1e6) return res.status(400).json({ ok: false, error: "invalid_notional" });
  if (type === "limit" && (!Number.isFinite(limitPrice) || limitPrice <= 0)) return res.status(400).json({ ok: false, error: "invalid_limit_price" });
  try {
    const payload = { symbol, side, type, time_in_force: "day", notional: String(notional) };
    if (type === "limit") payload.limit_price = String(limitPrice);
    const order = await alpacaRequest(accountType, "/v2/orders", { method: "POST", body: JSON.stringify(payload) });
    return res.status(201).json({ ok: true, accountType, environment: cfg.paper ? "PAPER" : "LIVE", order });
  } catch (error) {
    return res.status(error?.status || 502).json({ ok: false, error: "alpaca_order_rejected", accountType, detail: error?.message || String(error) });
  }
});
async function alpacaMarketDataRequest(accountType, pathname) {
  const cfg = alpacaConfig(accountType);
  if (!cfg.configured) throw new Error("alpaca_not_configured");
  const response = await fetch("https://data.alpaca.markets" + pathname, {
    headers: {
      Accept: "application/json",
      "APCA-API-KEY-ID": cfg.key,
      "APCA-API-SECRET-KEY": cfg.secret
    }
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(body?.message || body?.error || "Alpaca market data HTTP " + response.status);
    error.status = response.status;
    throw error;
  }
  return body;
}
var EQUITY_HUNTER_CACHE = { at: 0, account: "", payload: null };
function equityEma(values, period) {
  if (!values.length) return 0;
  const k = 2 / (period + 1);
  let out = values[0];
  for (let i = 1; i < values.length; i++) out = values[i] * k + out * (1 - k);
  return out;
}
function equityRsi(values, period = 14) {
  if (values.length < period + 1) return 50;
  let up = 0, down = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    if (d > 0) up += d;
    else down -= d;
  }
  if (down === 0) return 100;
  const rs = up / period / (down / period);
  return 100 - 100 / (1 + rs);
}
function equityClamp(v, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, v));
}
async function secTickerMap() {
  const r = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: { "User-Agent": "AURELIS research contact admin@ahconceptsai.com", Accept: "application/json" }
  });
  if (!r.ok) return {};
  const j = await r.json();
  const out = {};
  for (const row of Object.values(j || {})) {
    const t = String(row?.ticker || "").toUpperCase();
    if (t) out[t] = { cik: String(row?.cik_str || "").padStart(10, "0"), title: row?.title || t };
  }
  return out;
}
async function secContext(symbol, map) {
  const meta = map?.[symbol];
  if (!meta?.cik) return { available: false };
  try {
    const r = await fetch("https://data.sec.gov/submissions/CIK" + meta.cik + ".json", {
      headers: { "User-Agent": "AURELIS research contact admin@ahconceptsai.com", Accept: "application/json" }
    });
    if (!r.ok) return { available: false, company: meta.title };
    const j = await r.json();
    const recent = j?.filings?.recent || {};
    const forms = Array.isArray(recent.form) ? recent.form : [];
    const dates = Array.isArray(recent.filingDate) ? recent.filingDate : [];
    const filings = forms.slice(0, 30).map((form, i) => ({ form, date: dates[i] })).filter((x) => ["10-K", "10-Q", "8-K"].includes(x.form)).slice(0, 5);
    return { available: true, company: j?.name || meta.title, filings };
  } catch {
    return { available: false, company: meta.title };
  }
}
app.get("/api/equity-hunter", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const accountType = String(req.query.account || "live").toLowerCase() === "ira" ? "ira" : "live";
  const force = String(req.query.force || "0") === "1";
  const now = Date.now();
  if (!force && EQUITY_HUNTER_CACHE.payload && EQUITY_HUNTER_CACHE.account === accountType && now - EQUITY_HUNTER_CACHE.at < 3e4) {
    return res.json({ ...EQUITY_HUNTER_CACHE.payload, cacheAgeSeconds: Math.round((now - EQUITY_HUNTER_CACHE.at) / 1e3) });
  }
  try {
    const [actives, movers, spy, qqq] = await Promise.all([
      alpacaMarketDataRequest(accountType, "/v1beta1/screener/stocks/most-actives?top=100&by=volume"),
      alpacaMarketDataRequest(accountType, "/v1beta1/screener/stocks/movers?top=50"),
      alpacaMarketDataRequest(accountType, "/v2/stocks/SPY/snapshot?feed=iex"),
      alpacaMarketDataRequest(accountType, "/v2/stocks/QQQ/snapshot?feed=iex")
    ]);
    const symbols = /* @__PURE__ */ new Set();
    for (const row of actives?.most_actives || actives?.mostActives || []) if (row?.symbol) symbols.add(String(row.symbol).toUpperCase());
    for (const side of ["gainers", "losers"]) for (const row of movers?.[side] || []) if (row?.symbol) symbols.add(String(row.symbol).toUpperCase());
    ["AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA", "AMD", "AVGO", "NFLX", "JPM", "XOM", "LLY", "WMT", "COST", "ORCL", "CRM", "PLTR", "MU", "INTC"].forEach((x) => symbols.add(x));
    const universe = [...symbols].slice(0, 220);
    const snapshots = {};
    for (let i = 0; i < universe.length; i += 100) {
      const chunk = universe.slice(i, i + 100);
      const qs = new URLSearchParams({ symbols: chunk.join(","), feed: "iex" });
      const body = await alpacaMarketDataRequest(accountType, "/v2/stocks/snapshots?" + qs.toString());
      Object.assign(snapshots, body?.snapshots || body || {});
    }
    const benchMove = (snap) => {
      const p = Number(snap?.latestTrade?.p || snap?.minuteBar?.c || snap?.dailyBar?.c || 0);
      const prev = Number(snap?.prevDailyBar?.c || 0);
      return prev > 0 && p > 0 ? (p / prev - 1) * 100 : 0;
    };
    const spyMove = benchMove(spy), qqqMove = benchMove(qqq);
    const scan = [];
    for (const symbol of universe) {
      const snap = snapshots?.[symbol];
      if (!snap) continue;
      const price = Number(snap?.latestTrade?.p || snap?.minuteBar?.c || snap?.dailyBar?.c || 0);
      const prev = Number(snap?.prevDailyBar?.c || 0);
      const volume = Number(snap?.dailyBar?.v || 0);
      const bid = Number(snap?.latestQuote?.bp || 0), ask = Number(snap?.latestQuote?.ap || 0);
      if (!(price > 0 && prev > 0 && volume > 0)) continue;
      const changePct = (price / prev - 1) * 100;
      const spreadBps = bid > 0 && ask > 0 ? (ask - bid) / ((ask + bid) / 2) * 1e4 : 50;
      const dollarVolume = price * volume;
      const relStrength = changePct - (spyMove + qqqMove) / 2;
      const preScore = equityClamp(50 + Math.min(18, Math.abs(changePct) * 3) + Math.min(14, Math.log10(Math.max(1, dollarVolume)) - 6) * 3 + Math.min(12, Math.abs(relStrength) * 2) - Math.min(18, spreadBps * 0.8));
      scan.push({ symbol, price, changePct, volume, dollarVolume, spreadBps, relStrength, preScore });
    }
    scan.sort((a, b) => b.preScore - a.preScore);
    const metadataPairs = await Promise.all(scan.slice(0, 60).map(async (row) => {
      try {
        return [row.symbol, await alpacaRequest(accountType, "/v2/assets/" + encodeURIComponent(row.symbol))];
      } catch {
        return [row.symbol, null];
      }
    }));
    const metadata = Object.fromEntries(metadataPairs);
    const isPlainEquity = (row) => {
      const meta = metadata?.[row.symbol] || {};
      const name = String(meta?.name || "").toLowerCase();
      if (meta?.tradable === false) return false;
      if (String(meta?.class || "us_equity") !== "us_equity") return false;
      if (/etf|fund|etn|trust|2x|3x|ultra|inverse|leveraged/.test(name)) return false;
      return true;
    };
    const shortlist = scan.filter(isPlainEquity).slice(0, 20).map((row) => ({ ...row, name: metadata?.[row.symbol]?.name || row.symbol, fractionable: metadata?.[row.symbol]?.fractionable !== false, shortable: Boolean(metadata?.[row.symbol]?.shortable) }));
    const deepSeeds = shortlist.slice(0, 10);
    const deep = await Promise.all(deepSeeds.map(async (seed) => {
      const end = /* @__PURE__ */ new Date(), start = new Date(end.getTime() - 1e3 * 60 * 60 * 24 * 12);
      const qs = new URLSearchParams({ timeframe: "15Min", start: start.toISOString(), end: end.toISOString(), limit: "1000", adjustment: "all", feed: "iex", sort: "asc" });
      const [barsBody, newsBody] = await Promise.all([
        alpacaMarketDataRequest(accountType, "/v2/stocks/" + encodeURIComponent(seed.symbol) + "/bars?" + qs.toString()),
        alpacaMarketDataRequest(accountType, "/v1beta1/news?symbols=" + encodeURIComponent(seed.symbol) + "&limit=8&sort=desc")
      ]);
      const bars = Array.isArray(barsBody?.bars) ? barsBody.bars : [];
      const closes = bars.map((b) => Number(b.c || 0)).filter(Number.isFinite);
      const vols = bars.map((b) => Number(b.v || 0)).filter(Number.isFinite);
      if (closes.length < 30) return null;
      const e20 = equityEma(closes.slice(-80), 20), e50 = equityEma(closes.slice(-120), 50);
      const rr = equityRsi(closes, 14), last = closes.at(-1) || seed.price;
      const volNow = vols.slice(-4).reduce((a, b) => a + b, 0);
      const volBase = vols.slice(-24).reduce((a, b) => a + b, 0) / Math.max(1, vols.slice(-24).length) * 4;
      const relVol = volBase > 0 ? volNow / volBase : 1;
      const direction = last > e20 && e20 > e50 ? "BUY" : last < e20 && e20 < e50 ? "AVOID" : seed.changePct >= 0 ? "BUY" : "AVOID";
      const technical = equityClamp(50 + (direction === "BUY" ? 18 : -8) + Math.min(15, Math.abs(seed.changePct) * 2) + (rr > 45 && rr < 72 ? 8 : rr >= 78 ? -8 : 0));
      const relative = equityClamp(50 + seed.relStrength * 8);
      const volumeScore = equityClamp(42 + Math.min(45, relVol * 24));
      const liquidity = equityClamp(100 - Math.min(65, seed.spreadBps * 2.2));
      const marketAlignment = equityClamp(50 + (direction === "BUY" ? 1 : -1) * ((spyMove + qqqMove) / 2) * 8);
      const news = Array.isArray(newsBody?.news) ? newsBody.news : [];
      const catalyst = equityClamp(45 + Math.min(35, news.length * 5));
      const risk = equityClamp(88 - Math.min(28, Math.abs(seed.changePct) * 3) - Math.min(20, seed.spreadBps));
      const readiness = equityClamp(technical * 0.24 + relative * 0.18 + volumeScore * 0.16 + liquidity * 0.14 + marketAlignment * 0.12 + catalyst * 0.08 + risk * 0.08);
      return { ...seed, direction, readiness: +readiness.toFixed(1), scores: { technical: +technical.toFixed(1), relativeStrength: +relative.toFixed(1), volume: +volumeScore.toFixed(1), liquidity: +liquidity.toFixed(1), marketAlignment: +marketAlignment.toFixed(1), catalyst: +catalyst.toFixed(1), risk: +risk.toFixed(1) }, indicators: { ema20: e20, ema50: e50, rsi: rr, relativeVolume: relVol }, news: news.slice(0, 5).map((n) => ({ headline: n?.headline || "", source: n?.source || "", created_at: n?.created_at || "" })) };
    }));
    const candidates = deep.filter(Boolean).sort((a, b) => b.readiness - a.readiness);
    const secMap = await secTickerMap();
    for (const row of candidates.slice(0, 5)) row.sec = await secContext(row.symbol, secMap);
    const payload = { ok: true, source: ["ALPACA_IEX", "ALPACA_NEWS", "SEC_EDGAR"], executionProvider: "ALPACA", scanned: scan.length, shortlisted: shortlist.length, deepAnalyzed: candidates.length, benchmarks: { SPY: +spyMove.toFixed(2), QQQ: +qqqMove.toFixed(2) }, candidates: candidates.slice(0, 10), generatedAt: Date.now() };
    EQUITY_HUNTER_CACHE.at = Date.now();
    EQUITY_HUNTER_CACHE.account = accountType;
    EQUITY_HUNTER_CACHE.payload = payload;
    return res.json(payload);
  } catch (error) {
    return res.status(error?.status || 502).json({ ok: false, error: "equity_hunter_unavailable", detail: error?.message || String(error) });
  }
});
app.get("/api/alpaca/market/:symbol", async (req, res) => {
  const accountType = String(req.query.account || "live").toLowerCase() === "ira" ? "ira" : "live";
  const symbol = String(req.params.symbol || "").trim().toUpperCase();
  const range = ["1D", "5D", "1M", "1Y"].includes(String(req.query.range || "1D").toUpperCase()) ? String(req.query.range || "1D").toUpperCase() : "1D";
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) return res.status(400).json({ ok: false, error: "invalid_symbol" });
  const now = /* @__PURE__ */ new Date();
  const start = new Date(now);
  let timeframe = "5Min";
  if (range === "1D") start.setUTCDate(start.getUTCDate() - 2);
  if (range === "5D") {
    start.setUTCDate(start.getUTCDate() - 8);
    timeframe = "30Min";
  }
  if (range === "1M") {
    start.setUTCMonth(start.getUTCMonth() - 1);
    timeframe = "2Hour";
  }
  if (range === "1Y") {
    start.setUTCFullYear(start.getUTCFullYear() - 1);
    timeframe = "1Day";
  }
  const qs = new URLSearchParams({ timeframe, start: start.toISOString(), end: now.toISOString(), limit: "1000", adjustment: "all", feed: "iex", sort: "asc" });
  try {
    const [snapshot, barsResult] = await Promise.all([
      alpacaMarketDataRequest(accountType, "/v2/stocks/" + encodeURIComponent(symbol) + "/snapshot?feed=iex"),
      alpacaMarketDataRequest(accountType, "/v2/stocks/" + encodeURIComponent(symbol) + "/bars?" + qs.toString())
    ]);
    const bars = Array.isArray(barsResult?.bars) ? barsResult.bars : [];
    const filtered = range === "1D" && bars.length ? bars.filter((b) => String(b?.t || "").slice(0, 10) === String(bars[bars.length - 1]?.t || "").slice(0, 10)) : bars;
    return res.json({ ok: true, symbol, range, feed: "IEX", snapshot, bars: filtered });
  } catch (error) {
    return res.status(error?.status || 502).json({ ok: false, error: "alpaca_market_data_unavailable", detail: error?.message || String(error) });
  }
});
async function analyzeLiveBetWithGemini(image) {
  const match = image.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!match || !apiKey) return null;
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: [{
      role: "user",
      parts: [
        { text: "Read this trading bet screenshot. Return one JSON object with exactly these keys: asset, direction, entry, current_price, stop_loss, take_profit, leverage. Use a short asset ticker such as LTC. direction must be LONG, SHORT, or null. Use numbers for visible prices and leverage, and null for any value that is missing or unreadable. Do not infer or invent values, and do not include markdown or explanation." },
        { inlineData: { mimeType: match[1].toLowerCase(), data: match[2] } }
      ]
    }],
    config: { responseMimeType: "application/json", temperature: 0 }
  });
  const raw = String(response.text || "").trim();
  const jsonText = raw.replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/, "");
  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("gemini_invalid_json");
  return parsed;
}
var liveBetOcrWorkerPromise = null;
function extractLiveBetFromOcrText(text) {
  const clean = String(text || "").replace(/\r/g, "\n");
  const upper = clean.toUpperCase();
  const readAfter = (label) => {
    const match = upper.match(new RegExp(label.source + "[\\s:=_-]{0,12}\\$?\\s*([0-9]+(?:[.,][0-9]+)?)", label.flags));
    if (!match?.[1]) return null;
    const value = Number(match[1].replace(",", "."));
    return Number.isFinite(value) ? value : null;
  };
  const marketMatch = upper.match(/\b([A-Z]{2,12})(?:USD|USDT)\b/);
  const standalone = upper.match(/^\s*([A-Z]{2,8})\b/m);
  const asset = String(marketMatch?.[1] || standalone?.[1] || "").replace(/[^A-Z0-9]/g, "") || null;
  const direction = /\bSHORT\b/.test(upper) ? "SHORT" : /\bLONG\b/.test(upper) ? "LONG" : null;
  const leverageMatch = upper.match(/\b([1-9][0-9]?(?:\.[0-9]+)?)\s*[X×]\b/);
  const leverage = leverageMatch ? Number(leverageMatch[1]) : null;
  return {
    asset,
    direction,
    entry: readAfter(/ENTRY/i),
    current_price: readAfter(/MARK/i),
    stop_loss: readAfter(/STOP\s*LOSS/i),
    take_profit: readAfter(/TAKE\s*PROFIT/i),
    leverage: Number.isFinite(leverage) ? leverage : null
  };
}
async function structureLiveBetOcr(text) {
  const deterministic = extractLiveBetFromOcrText(text);
  const baseUrl = String(process.env.AURELIS_AI_BASE_URL || "").trim().replace(/\/$/, "");
  const token = String(process.env.AURELIS_AI_TOKEN || "").trim();
  if (!baseUrl) return deterministic;
  try {
    const prompt = [
      "Convert OCR text from a crypto/perpetual trade card into JSON.",
      "Return only one JSON object with exactly: asset,direction,entry,current_price,stop_loss,take_profit,leverage.",
      "Use only values supported by the OCR text. Never invent a missing number.",
      "Asset must be the short ticker: ICPUSD or ICP/USD means ICP.",
      "direction must be LONG, SHORT, or null.",
      "MARK means current_price. ENTRY means entry. TAKE PROFIT means take_profit. STOP LOSS means stop_loss.",
      "Ignore PNL percentages, confidence percentages, payout odds, risk/reward ratios, and candle intervals.",
      "If leverage is not explicitly shown as something like 2x, return null.",
      "OCR TEXT:",
      String(text || "").slice(0, 6e3)
    ].join("\n");
    const response = await fetch(baseUrl + "/v1/chat/completions", {
      method: "POST",
      headers: {
        ...token ? { Authorization: "Bearer " + token } : {},
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        model: String(process.env.AURELIS_AI_ANALYST_MODEL || "@cf/qwen/qwen3-30b-a3b-fp8"),
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 300
      })
    });
    const payload = await response.json();
    if (!response.ok) return deterministic;
    const raw = String(payload?.choices?.[0]?.message?.content || "").trim();
    const cleaned = raw.replace(/^\x60\x60\x60(?:json)?\s*/i, "").replace(/\s*\x60\x60\x60$/, "");
    let parsed = null;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const a = cleaned.indexOf("{");
      const b = cleaned.lastIndexOf("}");
      if (a >= 0 && b > a) try {
        parsed = JSON.parse(cleaned.slice(a, b + 1));
      } catch {
      }
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return deterministic;
    return {
      asset: parsed.asset ?? deterministic.asset,
      direction: parsed.direction ?? deterministic.direction,
      entry: parsed.entry ?? deterministic.entry,
      current_price: parsed.current_price ?? deterministic.current_price,
      stop_loss: parsed.stop_loss ?? deterministic.stop_loss,
      take_profit: parsed.take_profit ?? deterministic.take_profit,
      leverage: parsed.leverage ?? deterministic.leverage
    };
  } catch {
    return deterministic;
  }
}
async function analyzeLiveBetWithOcr(image) {
  const match = image.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length) return null;
  try {
    if (!liveBetOcrWorkerPromise) {
      liveBetOcrWorkerPromise = import("tesseract.js").then(({ createWorker }) => createWorker("eng"));
    }
    const worker = await liveBetOcrWorkerPromise;
    const result = await worker.recognize(bytes);
    const text = String(result?.data?.text || "").trim();
    if (!text) return null;
    const trade = await structureLiveBetOcr(text);
    const useful = [trade?.asset, trade?.direction, trade?.entry, trade?.current_price, trade?.stop_loss, trade?.take_profit].filter((value) => value !== null && value !== void 0 && value !== "");
    return useful.length >= 3 ? trade : null;
  } catch (error) {
    liveBetOcrWorkerPromise = null;
    console.error("[live-bet] OCR fallback failed:", error instanceof Error ? error.message : String(error));
    return null;
  }
}
app.post("/api/live-bet/analyze", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const image = String(req.body?.image || "").trim();
  const match = image.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i);
  if (!match) return res.status(400).json({ ok: false, error: "invalid_image_type", executionEnabled: false });
  if (image.length > 11e6) return res.status(413).json({ ok: false, error: "image_too_large", executionEnabled: false });
  let upstreamError = null;
  const baseUrl = String(process.env.AURELIS_VISION_BASE_URL || "").trim().replace(/\/$/, "");
  const token = String(process.env.AURELIS_VISION_TOKEN || "").trim();
  if (baseUrl && token) {
    try {
      const upstream = await fetch(baseUrl, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ image })
      });
      const body = await upstream.text();
      let payload = null;
      try {
        payload = JSON.parse(body);
      } catch {
      }
      if (upstream.ok && payload?.ok && payload?.trade) {
        const trade = payload.trade;
        if ((trade.entry === null || trade.entry === "") && trade.current_price !== null && trade.current_price !== "") {
          trade.entry = trade.current_price;
          trade.entry_source = "VISIBLE_CURRENT_PRICE";
        } else if (trade.entry !== null && trade.entry !== "") {
          trade.entry_source = "VISIBLE_ENTRY";
        } else {
          trade.entry_source = null;
        }
        const direction = String(trade.direction || "").toUpperCase();
        trade.direction = ["LONG", "SHORT"].includes(direction) ? direction : null;
        return res.json({ ok: true, trade, model: payload?.model || "aurelis-vision", executionEnabled: false });
      }
      upstreamError = payload?.detail || payload?.error || "vision_service_invalid_response";
    } catch (error) {
      upstreamError = error?.message || String(error);
    }
  } else {
    upstreamError = "aurelis_vision_not_configured";
  }
  try {
    const parsed = await analyzeLiveBetWithGemini(image);
    if (parsed) {
      const direction = String(parsed.direction || "").toUpperCase();
      const trade = {
        asset: String(parsed.asset || "").toUpperCase() || null,
        direction: ["LONG", "SHORT"].includes(direction) ? direction : null,
        entry: parsed.entry ?? null,
        current_price: parsed.current_price ?? null,
        stop_loss: parsed.stop_loss ?? null,
        take_profit: parsed.take_profit ?? null,
        leverage: parsed.leverage ?? null
      };
      if ((trade.entry === null || trade.entry === "") && trade.current_price !== null && trade.current_price !== "") {
        trade.entry = trade.current_price;
        trade.entry_source = "VISIBLE_CURRENT_PRICE";
      } else if (trade.entry !== null && trade.entry !== "") {
        trade.entry_source = "VISIBLE_ENTRY";
      }
      return res.json({ ok: true, trade, model: "gemini-3.5-flash-fallback", executionEnabled: false });
    }
  } catch (error) {
    const fallbackError = error?.message || String(error);
    console.error("[live-bet] Gemini fallback failed:", fallbackError);
    upstreamError = upstreamError ? upstreamError + "; Gemini fallback: " + fallbackError : fallbackError;
  }
  try {
    const ocrTrade = await analyzeLiveBetWithOcr(image);
    if (ocrTrade) {
      const direction = String(ocrTrade.direction || "").toUpperCase();
      ocrTrade.direction = ["LONG", "SHORT"].includes(direction) ? direction : null;
      if ((ocrTrade.entry === null || ocrTrade.entry === "") && ocrTrade.current_price !== null && ocrTrade.current_price !== "") {
        ocrTrade.entry = ocrTrade.current_price;
        ocrTrade.entry_source = "OCR_VISIBLE_CURRENT_PRICE";
      } else if (ocrTrade.entry !== null && ocrTrade.entry !== "") {
        ocrTrade.entry_source = "OCR_VISIBLE_ENTRY";
      } else {
        ocrTrade.entry_source = null;
      }
      return res.json({ ok: true, trade: ocrTrade, model: "aurelis-ocr+text-structure", executionEnabled: false });
    }
  } catch (error) {
    console.error("[live-bet] OCR recovery failed:", error?.message || String(error));
  }
  console.error("[live-bet] screenshot analysis unavailable:", upstreamError || "no_vision_provider");
  const detail = upstreamError === "invalid_model_output" ? "The screenshot reached the reader, but it could not extract a clear trade. Upload the original bet screenshot or crop the bet card so its text is larger." : "The screenshot reader is temporarily unavailable. Please try again in a moment.";
  return res.status(502).json({
    ok: false,
    error: "vision_unavailable",
    reason: upstreamError || "no_vision_provider",
    detail,
    executionEnabled: false
  });
});
var AURELIS_ARBITRAGE_INTERNAL_BASE = String(process.env.AURELIS_ARBITRAGE_INTERNAL_BASE || "http://127.0.0.1:8894").replace(/\/$/, "");
var proxyArbitrageJson = async (res, upstreamPath) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const response = await fetch(AURELIS_ARBITRAGE_INTERNAL_BASE + upstreamPath, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(35e3)
    });
    const body = await response.text();
    res.status(response.status);
    res.type("application/json");
    return res.send(body);
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: "arbitrage_engine_unavailable",
      detail: error?.message || String(error)
    });
  }
};
app.get("/api/arbitrage/scan", async (req, res) => {
  const rawTarget = Number(req.query.target || 25);
  const target = Number.isFinite(rawTarget) ? Math.max(5, Math.min(1e4, rawTarget)) : 25;
  const fresh = String(req.query.fresh || "false").toLowerCase() === "true";
  return proxyArbitrageJson(
    res,
    "/scan?target=" + encodeURIComponent(String(target)) + "&fresh=" + (fresh ? "true" : "false")
  );
});
app.get("/api/arbitrage/health", async (_req, res) => {
  return proxyArbitrageJson(res, "/health");
});
app.get("/api/arbitrage/config", async (_req, res) => {
  return proxyArbitrageJson(res, "/config");
});
app.get("/api/arbitrage/dex-scan", async (req, res) => {
  const rawTarget = Number(req.query.target || 25);
  const target = Number.isFinite(rawTarget) ? Math.max(5, Math.min(1e4, rawTarget)) : 25;
  const fresh = String(req.query.fresh || "false").toLowerCase() === "true";
  return proxyArbitrageJson(
    res,
    "/dex-scan?target=" + encodeURIComponent(String(target)) + "&fresh=" + (fresh ? "true" : "false")
  );
});
app.get("/api/arbitrage/treasury", async (_req, res) => {
  return proxyArbitrageJson(res, "/treasury");
});
app.get("/api/bots/hyperliquid-agent-signing-preview", async (req, res) => {
  const master = String(req.query.master || "");
  const agent = String(req.query.agent || "");
  const name = String(req.query.name || "AURELIS");
  const nonce = String(req.query.nonce || "");
  if (!/^0x[a-fA-F0-9]{40}$/.test(master) || !/^0x[a-fA-F0-9]{40}$/.test(agent) || !/^[A-Za-z0-9_-]{1,16}$/.test(name) || !/^[0-9]{10,15}$/.test(nonce) || Number(nonce) > Number.MAX_SAFE_INTEGER) {
    return res.status(400).json({ ok: false, error: "invalid_approval_preview" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const qs = new URLSearchParams({ master, agent, name, nonce });
    const upstream = await fetch("http://127.0.0.1:8895/hyperliquid-agent-signing-preview?" + qs, { signal: AbortSignal.timeout(1e4) });
    res.status(upstream.status).type("application/json").send(await upstream.text());
  } catch {
    res.status(502).json({ ok: false, error: "approval_preview_unavailable" });
  }
});
app.get("/api/bots/hyperliquid-agent-registry", async (req, res) => {
  const master = String(req.query.master || "");
  const network = String(req.query.network || "Testnet");
  if (!/^0x[a-fA-F0-9]{40}$/.test(master) || !["Testnet", "Mainnet"].includes(network)) {
    return res.status(400).json({ ok: false, error: "invalid_agent_registry" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const upstream = await fetch("http://127.0.0.1:8895/hyperliquid-agent-registry?" + new URLSearchParams({ master, network }), { signal: AbortSignal.timeout(12e3) });
    res.status(upstream.status).type("application/json").send(await upstream.text());
  } catch {
    res.status(502).json({ ok: false, error: "agent_registry_unavailable" });
  }
});
app.get("/api/bots/hyperliquid-agent-preflight", async (req, res) => {
  const bot = String(req.query.bot || "hunter");
  const master = String(req.query.master || "");
  const agent = String(req.query.agent || "");
  if (!["hunter", "trade_radar", "signal_desk", "live_bet", "arbitrage", "grid", "dca"].includes(bot) || !/^0x[a-fA-F0-9]{40}$/.test(master) || agent && !/^0x[a-fA-F0-9]{40}$/.test(agent)) {
    return res.status(400).json({ ok: false, error: "invalid_agent_preflight" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const params = new URLSearchParams({ bot, master, asset: "BTC", side: "long", notional: "25", network: "Testnet" });
    if (agent) params.set("agent", agent);
    const upstream = await fetch("http://127.0.0.1:8895/hyperliquid-agent-preflight?" + params, { signal: AbortSignal.timeout(1e4) });
    res.status(upstream.status).type("application/json").send(await upstream.text());
  } catch {
    res.status(502).json({ ok: false, error: "agent_preflight_unavailable" });
  }
});
app.get("/api/bots/hyperliquid-account", async (req, res) => {
  const wallet = String(req.query.wallet || "");
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) return res.status(400).json({ ok: false, error: "invalid_wallet_address" });
  res.setHeader("Cache-Control", "no-store");
  try {
    const upstream = await fetch("http://127.0.0.1:8895/hyperliquid-account-observation?" + new URLSearchParams({ wallet }), { signal: AbortSignal.timeout(18e3) });
    res.status(upstream.status).type("application/json").send(await upstream.text());
  } catch {
    res.status(502).json({ ok: false, error: "account_observation_unavailable" });
  }
});
app.get("/api/bots/hyperliquid-readiness", async (req, res) => {
  const bot = String(req.query.bot || "hunter");
  const asset = String(req.query.asset || "BTC").toUpperCase();
  const side = String(req.query.side || "long");
  if (!["hunter", "trade_radar", "signal_desk", "live_bet", "arbitrage", "grid", "dca"].includes(bot) || !/^[A-Z0-9_-]{2,20}$/.test(asset) || !["long", "short"].includes(side)) {
    return res.status(400).json({ ok: false, error: "invalid_readiness" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const qs = new URLSearchParams({ bot, asset, side, notional: "25" });
    const upstream = await fetch("http://127.0.0.1:8895/hyperliquid-signer-readiness?" + qs, { signal: AbortSignal.timeout(1e4) });
    res.status(upstream.status).type("application/json").send(await upstream.text());
  } catch {
    res.status(502).json({ ok: false, error: "readiness_unavailable" });
  }
});
app.get("/api/bots/dex-intent", async (req, res) => {
  const bot = String(req.query.bot || "hunter");
  const venue = String(req.query.venue || "hyperliquid");
  const asset = String(req.query.asset || "BTC").toUpperCase();
  const side = String(req.query.side || "long");
  const notional = String(req.query.notional || "25");
  if (!["hunter", "trade_radar", "signal_desk", "live_bet", "arbitrage", "grid", "dca"].includes(bot) || !["hyperliquid", "dydx", "lighter", "paradex", "extended"].includes(venue) || !/^[A-Z0-9_-]{2,20}$/.test(asset) || !["long", "short"].includes(side) || !/^(?:[0-9]+)(?:\.[0-9]+)?$/.test(notional) || Number(notional) <= 0 || Number(notional) > 100) {
    return res.status(400).json({ ok: false, error: "invalid_dex_intent" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const qs = new URLSearchParams({ bot, venue, asset, side, notional });
    const upstream = await fetch("http://127.0.0.1:8895/paper-dex-intent?" + qs, { signal: AbortSignal.timeout(12e3) });
    res.status(upstream.status).type("application/json").send(await upstream.text());
  } catch {
    res.status(502).json({ ok: false, error: "dex_intent_unavailable" });
  }
});
app.get("/api/bots/paper-risk", async (req, res) => {
  const bot = String(req.query.bot || "hunter");
  const venue = String(req.query.venue || "hyperliquid");
  const asset = String(req.query.asset || "BTC").toUpperCase();
  const side = String(req.query.side || "long");
  const notional = String(req.query.notional || "25");
  const entry = String(req.query.entry || "");
  const stop = String(req.query.stop || "");
  const leverage = String(req.query.leverage || "2");
  if (!["hunter", "trade_radar", "signal_desk", "live_bet", "arbitrage", "grid", "dca"].includes(bot) || !["hyperliquid", "dydx", "lighter", "paradex", "extended"].includes(venue) || !/^[A-Z0-9_-]{2,20}$/.test(asset) || !["long", "short"].includes(side) || ![notional, entry, stop, leverage].every((x) => /^(?:[0-9]+)(?:\.[0-9]+)?$/.test(x))) {
    return res.status(400).json({ ok: false, error: "invalid_paper_risk" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const qs = new URLSearchParams({ bot, venue, asset, side, notional, entry, stop, leverage });
    const response = await fetch("http://127.0.0.1:8895/paper-risk-review?" + qs, { signal: AbortSignal.timeout(1e4) });
    res.status(response.status).type("application/json").send(await response.text());
  } catch {
    res.status(502).json({ ok: false, error: "risk_service_unavailable" });
  }
});
app.get("/api/bots/dex-strategy", async (req, res) => {
  const bot = String(req.query.bot || "hunter");
  const asset = String(req.query.asset || "BTC").toUpperCase();
  const side = String(req.query.side || "long");
  if (!["hunter", "trade_radar", "signal_desk", "live_bet", "arbitrage", "grid", "dca"].includes(bot) || !/^[A-Z0-9_-]{2,20}$/.test(asset) || !["long", "short"].includes(side)) {
    return res.status(400).json({ ok: false, error: "invalid_strategy_request" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const qs = new URLSearchParams({ bot, asset, side, notional: "25" });
    const upstream = await fetch("http://127.0.0.1:8895/paper-dex-strategy?" + qs, { signal: AbortSignal.timeout(3e4) });
    res.status(upstream.status).type("application/json").send(await upstream.text());
  } catch {
    res.status(502).json({ ok: false, error: "dex_strategy_unavailable" });
  }
});
app.get("/api/bots/dex-assessment", async (req, res) => {
  const bot = String(req.query.bot || "hunter");
  const asset = String(req.query.asset || "BTC").toUpperCase();
  const side = String(req.query.side || "long");
  const notional = String(req.query.notional || "25");
  if (!["hunter", "trade_radar", "signal_desk", "live_bet", "arbitrage", "grid", "dca"].includes(bot) || !/^[A-Z0-9_-]{2,20}$/.test(asset) || !["buy", "sell", "long", "short"].includes(side) || !/^(?:[0-9]+)(?:\.[0-9]+)?$/.test(notional) || Number(notional) <= 0 || Number(notional) > 100) {
    return res.status(400).json({ ok: false, error: "invalid_dex_assessment" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const qs = new URLSearchParams({ bot, asset, side, notional });
    const upstream = await fetch("http://127.0.0.1:8895/paper-dex-assessment?" + qs, { signal: AbortSignal.timeout(3e4) });
    res.status(upstream.status).type("application/json").send(await upstream.text());
  } catch {
    res.status(502).json({ ok: false, error: "dex_assessment_unavailable" });
  }
});
app.get("/api/bots/dex-batch", async (req, res) => {
  const bot = String(req.query.bot || "hunter");
  const assets = String(req.query.assets || "BTC,ETH,SOL");
  const side = String(req.query.side || "long");
  if (!["hunter", "trade_radar"].includes(bot) || !/^[A-Z0-9_-]{2,20}(?:,[A-Z0-9_-]{2,20}){0,7}$/.test(assets) || !["long", "short"].includes(side)) {
    return res.status(400).json({ ok: false, error: "invalid_dex_batch" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const qs = new URLSearchParams({ bot, assets, side, notional: "25" });
    const upstream = await fetch("http://127.0.0.1:8895/paper-dex-batch?" + qs, { signal: AbortSignal.timeout(35e3) });
    res.status(upstream.status).type("application/json").send(await upstream.text());
  } catch {
    res.status(502).json({ ok: false, error: "dex_batch_unavailable" });
  }
});
app.get("/api/bots/dex-route", async (req, res) => {
  const bot = String(req.query.bot || "hunter");
  const asset = String(req.query.asset || "BTC").toUpperCase();
  const side = String(req.query.side || "long");
  const notional = String(req.query.notional || "25");
  if (!["hunter", "trade_radar", "signal_desk", "live_bet", "arbitrage", "grid", "dca"].includes(bot) || !/^[A-Z0-9_-]{2,20}$/.test(asset) || !["buy", "sell", "long", "short"].includes(side) || !/^(?:[0-9]+)(?:\.[0-9]+)?$/.test(notional) || Number(notional) <= 0 || Number(notional) > 100) {
    return res.status(400).json({ ok: false, error: "invalid_paper_route" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const qs = new URLSearchParams({ bot, asset, side, notional });
    const upstream = await fetch("http://127.0.0.1:8895/paper-dex-route?" + qs, { signal: AbortSignal.timeout(3e4) });
    res.status(upstream.status).type("application/json").send(await upstream.text());
  } catch {
    res.status(502).json({ ok: false, error: "dex_paper_router_unavailable" });
  }
});
app.get("/api/kraken/ohlc/:asset", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const asset = String(req.params.asset || "").trim().toUpperCase();
    const symbol = asset === "BTC" ? "XBT" : asset;
    const intervalRaw = Number(req.query.interval || 5);
    const allowed = /* @__PURE__ */ new Set([1, 5, 15, 30, 60, 240]);
    const interval = allowed.has(intervalRaw) ? intervalRaw : 5;
    const pair = symbol + "USD";
    const response = await fetch("https://api.kraken.com/0/public/OHLC?pair=" + encodeURIComponent(pair) + "&interval=" + interval);
    const body = await response.json();
    if (!response.ok || !body || Array.isArray(body.error) && body.error.length) {
      return res.status(502).json({ ok: false, error: "kraken_ohlc_unavailable", detail: body?.error || response.statusText });
    }
    const result = body.result || {};
    const key = Object.keys(result).find((k) => k !== "last");
    const rows = key ? result[key] : [];
    const bars = (Array.isArray(rows) ? rows : []).slice(-120).map((r) => ({
      time: Number(r[0]),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      vwap: Number(r[5]),
      volume: Number(r[6]),
      count: Number(r[7])
    }));
    return res.json({ ok: true, asset, pair: key || pair, interval, bars, last: result.last || null });
  } catch (error) {
    return res.status(502).json({ ok: false, error: "kraken_ohlc_unavailable", detail: error?.message || String(error) });
  }
});
app.get("/api/signal-desk/deep/:asset", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const asset = String(req.params.asset || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{2,12}$/.test(asset)) return res.status(400).json({ ok: false, error: "invalid_asset" });
    const base = asset === "BTC" ? "XBT" : asset;
    const pair = base + "USD";
    const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
    const ema = (vals, period) => {
      if (!vals.length) return 0;
      const k = 2 / (period + 1);
      let out = vals[0];
      for (let i = 1; i < vals.length; i++) out = vals[i] * k + out * (1 - k);
      return out;
    };
    const rsi = (vals, period = 14) => {
      if (vals.length < period + 1) return 50;
      let up = 0, down = 0;
      for (let i = vals.length - period; i < vals.length; i++) {
        const d = vals[i] - vals[i - 1];
        if (d > 0) up += d;
        else down -= d;
      }
      if (down === 0) return 100;
      const rs = up / period / (down / period);
      return 100 - 100 / (1 + rs);
    };
    const atr = (bars, period = 14) => {
      if (bars.length < 2) return 0;
      const trs = [];
      for (let i = 1; i < bars.length; i++) {
        const h = +bars[i][2], l = +bars[i][3], pc = +bars[i - 1][4];
        trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
      }
      const tail = trs.slice(-period);
      return tail.reduce((a, b) => a + b, 0) / Math.max(1, tail.length);
    };
    const getJson = async (url) => {
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      const j = await r.json();
      if (!r.ok || Array.isArray(j?.error) && j.error.length) throw new Error(j?.error?.join(",") || r.statusText);
      return j?.result || {};
    };
    const intervals = [1, 5, 15, 60, 240];
    const [ohlcs, depthRes, tradesRes, tickerRes] = await Promise.all([
      Promise.all(intervals.map(async (interval) => {
        const result = await getJson("https://api.kraken.com/0/public/OHLC?pair=" + encodeURIComponent(pair) + "&interval=" + interval);
        const key = Object.keys(result).find((k) => k !== "last");
        return { interval, rows: key && Array.isArray(result[key]) ? result[key].slice(-120) : [] };
      })),
      getJson("https://api.kraken.com/0/public/Depth?pair=" + encodeURIComponent(pair) + "&count=25"),
      getJson("https://api.kraken.com/0/public/Trades?pair=" + encodeURIComponent(pair)),
      getJson("https://api.kraken.com/0/public/Ticker?pair=" + encodeURIComponent(pair))
    ]);
    const tf = {};
    let directionVotes = 0;
    for (const item of ohlcs) {
      const closes = item.rows.map((r) => Number(r[4])).filter(Number.isFinite);
      const volumes = item.rows.map((r) => Number(r[6])).filter(Number.isFinite);
      const last = closes.at(-1) || 0, e20 = ema(closes.slice(-60), 20), e50 = ema(closes.slice(-100), 50);
      const rr2 = rsi(closes, 14), aa = atr(item.rows, 14);
      const volNow = volumes.at(-1) || 0, volAvg = volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.max(1, volumes.slice(-20).length);
      const mom = closes.length > 4 && closes.at(-4) ? (last / closes.at(-4) - 1) * 100 : 0;
      const trend = last > e20 && e20 > e50 ? 1 : last < e20 && e20 < e50 ? -1 : 0;
      const weight = item.interval >= 60 ? 2 : 1;
      directionVotes += trend * weight;
      tf[item.interval] = { last, ema20: e20, ema50: e50, rsi: rr2, atr: aa, volumeRatio: volAvg ? volNow / volAvg : 1, momentumPct: mom, trend };
    }
    const direction = directionVotes > 0 ? "LONG" : directionVotes < 0 ? "SHORT" : (tf[5]?.momentumPct || 0) >= 0 ? "LONG" : "SHORT";
    const depthKey = Object.keys(depthRes)[0], book = depthKey ? depthRes[depthKey] : {};
    const bids = (book?.bids || []).slice(0, 20), asks = (book?.asks || []).slice(0, 20);
    const bidNotional = bids.reduce((a, r) => a + Number(r[0]) * Number(r[1]), 0);
    const askNotional = asks.reduce((a, r) => a + Number(r[0]) * Number(r[1]), 0);
    const bookImbalance = (bidNotional - askNotional) / Math.max(1, bidNotional + askNotional);
    const tradesKey = Object.keys(tradesRes).find((k) => k !== "last"), trades = (tradesKey ? tradesRes[tradesKey] : []).slice(-150);
    let buy = 0, sell = 0;
    for (const t of trades) {
      const notional = Number(t[0]) * Number(t[1]);
      if (String(t[3]).toLowerCase() === "b") buy += notional;
      else sell += notional;
    }
    const tapeImbalance = (buy - sell) / Math.max(1, buy + sell);
    const tickerKey = Object.keys(tickerRes)[0], ticker = tickerKey ? tickerRes[tickerKey] : {};
    const bid = Number(ticker?.b?.[0] || 0), ask = Number(ticker?.a?.[0] || 0), spreadBps = bid && ask ? (ask - bid) / ((ask + bid) / 2) * 1e4 : 0;
    const current = Number(ticker?.c?.[0] || tf[5]?.last || 0);
    const alignedTfs = intervals.filter((i) => tf[i]?.trend === (direction === "LONG" ? 1 : -1)).length;
    const oppositeTfs = intervals.filter((i) => tf[i]?.trend === (direction === "LONG" ? -1 : 1)).length;
    const structure = clamp(38 + alignedTfs * 12 - oppositeTfs * 9 + Math.min(12, Math.abs(directionVotes) * 2));
    const flowSign = direction === "LONG" ? 1 : -1;
    const flow = clamp(50 + flowSign * tapeImbalance * 32 + flowSign * bookImbalance * 24 - Math.min(12, spreadBps * 1.5));
    const five = tf[5] || tf[1] || {};
    const stretched = direction === "LONG" ? Math.max(0, (five.rsi || 50) - 68) : Math.max(0, 32 - (five.rsi || 50));
    const timing = clamp(54 + flowSign * (five.momentumPct || 0) * 16 + Math.min(12, (five.volumeRatio || 1) * 5) - stretched * 1.6);
    const atrPct = current ? (five.atr || 0) / current * 100 : 0;
    const risk = clamp(82 - Math.min(38, atrPct * 16) - Math.max(0, spreadBps - 2) * 2);
    const stopDist = Math.max((five.atr || 0) * 1.6, current * 6e-3);
    const targetDist = stopDist * 2.15;
    const stop = direction === "LONG" ? current - stopDist : current + stopDist;
    const target = direction === "LONG" ? current + targetDist : current - targetDist;
    const rr = targetDist / Math.max(1e-9, stopDist);
    const payoff = clamp(50 + (rr - 1) * 24 - Math.min(15, spreadBps * 1.2));
    const contradictions = [];
    if (direction === "LONG" && tapeImbalance < -0.12) contradictions.push("Aggressive sellers are fighting the long thesis.");
    if (direction === "SHORT" && tapeImbalance > 0.12) contradictions.push("Aggressive buyers are fighting the short thesis.");
    if (direction === "LONG" && bookImbalance < -0.15) contradictions.push("Offer-side depth is heavier than bids.");
    if (direction === "SHORT" && bookImbalance > 0.15) contradictions.push("Bid-side depth is heavier than offers.");
    if (oppositeTfs >= 2) contradictions.push(oppositeTfs + " higher/lower timeframes oppose the selected direction.");
    if ((five.volumeRatio || 1) < 0.55) contradictions.push("Current volume is too light for strong confirmation.");
    if (stretched > 0) contradictions.push("Short-term momentum is stretched; entry timing is vulnerable.");
    const setup = clamp(structure * 0.45 + flow * 0.25 + risk * 0.15 + payoff * 0.15);
    const contradictionPenalty = Math.min(28, contradictions.length * 7);
    const readiness = clamp(setup * 0.28 + timing * 0.24 + flow * 0.22 + risk * 0.12 + payoff * 0.14 - contradictionPenalty);
    const label = readiness >= 80 ? "READY" : readiness >= 68 ? "NEAR READY" : readiness >= 55 ? "DEVELOPING" : "WAIT";
    const reasons = [
      alignedTfs + " of 5 timeframes align " + direction + ".",
      "Live tape imbalance " + (tapeImbalance >= 0 ? "+" : "") + (tapeImbalance * 100).toFixed(1) + "%.",
      "Order-book imbalance " + (bookImbalance >= 0 ? "+" : "") + (bookImbalance * 100).toFixed(1) + "%.",
      "5m volume " + Number(five.volumeRatio || 1).toFixed(2) + "x its recent average.",
      "Net planned reward/risk " + rr.toFixed(2) + "."
    ];
    const waitFor = readiness >= 68 ? "Conditions are executable if price remains near the reviewed entry." : direction === "LONG" ? "Wait for stronger buyer flow and a 5m hold above EMA20." : "Wait for stronger seller flow and a 5m rejection below EMA20.";
    return res.json({
      ok: true,
      asset,
      pair: tickerKey || pair,
      direction,
      label,
      readiness: +readiness.toFixed(1),
      scores: {
        setup: +setup.toFixed(1),
        structure: +structure.toFixed(1),
        timing: +timing.toFixed(1),
        flow: +flow.toFixed(1),
        risk: +risk.toFixed(1),
        payoff: +payoff.toFixed(1)
      },
      levels: { entry: current, stop, target, rr: +rr.toFixed(2) },
      micro: { tapeImbalance, bookImbalance, spreadBps, buyNotional: buy, sellNotional: sell },
      timeframes: tf,
      reasons,
      contradictions,
      waitFor,
      generatedAt: Date.now()
    });
  } catch (error) {
    return res.status(502).json({ ok: false, error: "signal_desk_deep_unavailable", detail: error?.message || String(error) });
  }
});
app.get("/api/kraken/balances", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const key = process.env.KRAKEN_SPOT_API_KEY || process.env.KRAKEN_API_KEY || "";
  const secret = process.env.KRAKEN_SPOT_API_SECRET || process.env.KRAKEN_API_SECRET || "";
  if (!key || !secret) return res.status(409).json({ ok: false, error: "kraken_not_configured" });
  try {
    const pathName = "/0/private/Balance";
    const nonce = String(Date.now() * 1e3);
    const postData = new URLSearchParams({ nonce }).toString();
    const hash = crypto2.createHash("sha256").update(nonce + postData).digest();
    const signature = crypto2.createHmac("sha512", Buffer.from(secret, "base64")).update(Buffer.concat([Buffer.from(pathName), hash])).digest("base64");
    const upstream = await fetch("https://api.kraken.com" + pathName, {
      method: "POST",
      headers: {
        "API-Key": key,
        "API-Sign": signature,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      },
      body: postData
    });
    const body = await upstream.json();
    if (!upstream.ok || Array.isArray(body?.error) && body.error.length) {
      return res.status(502).json({ ok: false, error: "kraken_balance_unavailable", detail: body?.error || upstream.statusText });
    }
    const aliases = {
      ZUSD: "USD",
      USD: "USD",
      XXBT: "BTC",
      XBT: "BTC",
      BTC: "BTC",
      XETH: "ETH",
      ETH: "ETH",
      XXRP: "XRP",
      XRP: "XRP",
      SOL: "SOL",
      DOT: "DOT",
      ADA: "ADA",
      LINK: "LINK",
      LTC: "LTC",
      USDC: "USDC",
      USDT: "USDT"
    };
    const balances = Object.entries(body?.result || {}).map(([asset, raw]) => ({ asset: aliases[asset] || asset.replace(/^[XZ]/, ""), amount: Number(raw || 0) })).filter((row) => Number.isFinite(row.amount) && Math.abs(row.amount) > 0).sort((a, b) => a.asset === "USD" ? -1 : b.asset === "USD" ? 1 : b.amount - a.amount);
    return res.json({ ok: true, balances, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
  } catch (error) {
    return res.status(502).json({ ok: false, error: "kraken_balance_unavailable", detail: error?.message || String(error) });
  }
});
app.get("/api/kraken/margin-info/:asset", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const asset = String(req.params.asset || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!asset) return res.status(400).json({ ok: false, error: "invalid_asset" });
  try {
    const pairsResp = await fetch("https://api.kraken.com/0/public/AssetPairs", { headers: { Accept: "application/json" } });
    const body = await pairsResp.json();
    const entries = Object.entries(body?.result || {});
    const match = entries.find(([id, row]) => {
      const alt = String(row?.altname || id).toUpperCase().replace(/[^A-Z0-9]/g, "");
      const ws = String(row?.wsname || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      return alt === asset + "USD" || ws === asset + "USD";
    });
    if (!match) return res.status(404).json({ ok: false, error: "kraken_pair_not_found" });
    const [pairId, pair] = match;
    const buy = (pair?.leverage_buy || []).map(Number).filter((x) => Number.isFinite(x) && x > 0);
    const sell = (pair?.leverage_sell || []).map(Number).filter((x) => Number.isFinite(x) && x > 0);
    return res.json({ ok: true, asset, symbol: pair?.altname || pairId, buy, sell });
  } catch (error) {
    return res.status(502).json({ ok: false, error: "kraken_margin_info_unavailable", detail: error?.message || String(error) });
  }
});
app.get("/api/kraken/futures", async (_req, res) => {
  try {
    const upstream = await fetch("https://futures.kraken.com/derivatives/api/v3/tickers", {
      headers: { Accept: "application/json" }
    });
    const data = await upstream.json();
    const tickers = (Array.isArray(data?.tickers) ? data.tickers : []).filter((item) => item?.tag === "perpetual" && String(item?.pair || "").endsWith(":USD")).map((item) => {
      const rawAsset = String(item.pair || "").split(":")[0];
      const asset = rawAsset === "XBT" ? "BTC" : rawAsset;
      return {
        symbol: String(item.symbol || ""),
        pair: String(item.pair || ""),
        asset,
        markPrice: Number(item.markPrice || item.last || 0),
        indexPrice: Number(item.indexPrice || 0),
        bid: Number(item.bid || 0),
        ask: Number(item.ask || 0),
        volumeQuote: Number(item.volumeQuote || 0),
        openInterest: Number(item.openInterest || 0),
        fundingRate: Number(item.fundingRate || 0),
        fundingRatePrediction: Number(item.fundingRatePrediction || 0),
        change24h: Number(item.change24h || 0)
      };
    }).filter((item) => item.asset && item.markPrice > 0).sort((a, b) => b.volumeQuote - a.volumeQuote);
    res.setHeader("Cache-Control", "no-store");
    return res.json({ ok: true, provider: "KRAKEN_FUTURES", tickers, timestamp: Date.now() });
  } catch (error) {
    return res.status(502).json({ ok: false, error: "kraken_futures_unavailable", detail: error?.message || String(error) });
  }
});
var KRAKEN_FLOW_PAIRS = {
  BTC: "XXBTZUSD",
  ETH: "XETHZUSD",
  SOL: "SOLUSD",
  XRP: "XXRPZUSD",
  DOGE: "XDGUSD",
  AVAX: "tAXUSD",
  LINK: "LINKUSD",
  ADA: "ADAUSD",
  SUI: "SUIUSD",
  DOT: "DOTUSD",
  NEAR: "NEARUSD",
  UNI: "UNIUSD",
  LTC: "XLTCZUSD",
  ATOM: "ATOMUSD",
  POL: "POLUSD",
  ICP: "ICPUSD",
  SHIB: "SHIBUSD",
  PEPE: "PEPEUSD",
  AAVE: "AAVEUSD",
  APT: "APTUSD",
  ARB: "ARBUSD",
  RENDER: "RENDERUSD",
  INJ: "INJUSD",
  OP: "OPUSD",
  TIA: "TIAUSD",
  FET: "FETUSD",
  TAO: "TAOUSD",
  ALGO: "ALGOUSD",
  XLM: "XXLMZUSD",
  ETC: "XETCZUSD",
  FIL: "FILUSD"
};
async function fetchKrakenMarketFlow(symbols, windowMinutes = 15) {
  const cutoff = Date.now() / 1e3 - windowMinutes * 60;
  const unique = [...new Set(symbols.map((s) => String(s || "").toUpperCase()))].filter((s) => KRAKEN_FLOW_PAIRS[s]).slice(0, 12);
  const rows = await Promise.all(unique.map(async (symbol) => {
    try {
      const pair = KRAKEN_FLOW_PAIRS[symbol];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const response = await fetch("https://api.kraken.com/0/public/Trades?pair=" + encodeURIComponent(pair), { signal: controller.signal, headers: { Accept: "application/json" } });
      clearTimeout(timer);
      if (!response.ok) return null;
      const data = await response.json();
      const result = data?.result || {};
      const key = Object.keys(result).find((k) => k !== "last");
      const trades = key && Array.isArray(result[key]) ? result[key] : [];
      let buyTrades = 0, sellTrades = 0, buyNotional = 0, sellNotional = 0;
      for (const trade of trades) {
        const price = Number(trade?.[0] || 0), volume = Number(trade?.[1] || 0), ts = Number(trade?.[2] || 0), side = String(trade?.[3] || "");
        if (!price || !volume || ts < cutoff) continue;
        const n = price * volume;
        if (side === "b") {
          buyTrades++;
          buyNotional += n;
        } else if (side === "s") {
          sellTrades++;
          sellNotional += n;
        }
      }
      const count = buyTrades + sellTrades;
      if (!count) return null;
      const total = buyNotional + sellNotional;
      return { symbol, trades: count, buyTrades, sellTrades, buyNotional, sellNotional, buySharePct: total > 0 ? buyNotional / total * 100 : 0, netBuyNotional: buyNotional - sellNotional, windowMinutes };
    } catch {
      return null;
    }
  }));
  return rows.filter((r) => Boolean(r)).sort((a, b) => b.buySharePct + Math.log10(Math.max(1, b.buyNotional)) - (a.buySharePct + Math.log10(Math.max(1, a.buyNotional))));
}
async function lookupLiveCryptoPrice(query) {
  const cleaned = String(query || "").trim().replace(/^\$/, "");
  if (!cleaned) return null;
  const upper = cleaned.toUpperCase();
  const krakenAliases = {
    BTC: "XBTUSD",
    XBT: "XBTUSD",
    DOGE: "XDGUSD"
  };
  const krakenPair = krakenAliases[upper] || upper + "USD";
  try {
    const tickerResponse = await fetch(
      "https://api.kraken.com/0/public/Ticker?pair=" + encodeURIComponent(krakenPair),
      { headers: { Accept: "application/json" } }
    );
    if (tickerResponse.ok) {
      const tickerData = await tickerResponse.json();
      const result = tickerData?.result || {};
      const row = result[Object.keys(result)[0]];
      const price = Number(row?.c?.[0]);
      const open24h = Number(row?.o);
      if (Number.isFinite(price) && price > 0) {
        return {
          id: upper.toLowerCase(),
          symbol: upper === "XBT" ? "BTC" : upper,
          name: upper,
          price,
          change24h: Number.isFinite(open24h) && open24h > 0 ? (price - open24h) / open24h * 100 : NaN,
          marketCap: NaN,
          source: "Kraken"
        };
      }
    }
  } catch {
  }
  try {
    const searchResponse = await fetch(
      "https://api.coingecko.com/api/v3/search?query=" + encodeURIComponent(cleaned),
      { headers: { Accept: "application/json" } }
    );
    if (!searchResponse.ok) return null;
    const searchData = await searchResponse.json();
    const candidates = Array.isArray(searchData?.coins) ? searchData.coins : [];
    const match = candidates.find((x) => String(x?.symbol || "").toUpperCase() === upper) || candidates.find((x) => String(x?.name || "").toLowerCase() === cleaned.toLowerCase()) || candidates[0];
    if (!match?.id) return null;
    const marketResponse = await fetch(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=" + encodeURIComponent(String(match.id)) + "&price_change_percentage=24h",
      { headers: { Accept: "application/json" } }
    );
    if (!marketResponse.ok) return null;
    const rows = await marketResponse.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || !Number.isFinite(Number(row.current_price))) return null;
    return {
      id: String(row.id || match.id),
      symbol: String(row.symbol || match.symbol || cleaned).toUpperCase(),
      name: String(row.name || match.name || cleaned),
      price: Number(row.current_price),
      change24h: Number(row.price_change_percentage_24h),
      marketCap: Number(row.market_cap),
      source: "CoinGecko"
    };
  } catch {
    return null;
  }
}
function extractPriceLookupSymbol(message) {
  const text = String(message || "").trim();
  const patterns = [
    /\b(?:what(?:'s| is)?|whats)\s+(?:the\s+)?([a-z0-9]{2,12})\s+price\b/i,
    /\bprice\s+(?:of|for)\s+([a-z0-9]{2,12})\b/i,
    /^\$?([a-z0-9]{2,12})\s+price\??$/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}
function formatAaveAgentReply(result, message) {
  if (!result) return "";
  if (!result.ok) return result.message || "Aave data is unavailable right now.";
  if (result.kind === "position") {
    const summary = result.summary?.data?.v4 || result.summary?.data?.v3 || {};
    const hf = summary?.lowestHealthFactor ?? summary?.healthFactor ?? null;
    const lines = [
      "**Aave position**",
      `\u2022 Supplied: **$${Number(summary?.totalSuppliedUsd || 0).toLocaleString(void 0, { maximumFractionDigits: 2 })}**`,
      `\u2022 Debt: **$${Number(summary?.totalDebtUsd || 0).toLocaleString(void 0, { maximumFractionDigits: 2 })}**`,
      `\u2022 Net worth: **$${Number(summary?.netWorthUsd || 0).toLocaleString(void 0, { maximumFractionDigits: 2 })}**`
    ];
    if (hf !== null && hf !== void 0) lines.push(`\u2022 Lowest health factor: **${Number(hf).toFixed(2)}**`);
    return lines.join("\n");
  }
  if (result.kind === "markets") {
    const data = result.markets?.data || {};
    const rows = [];
    for (const version of ["v4", "v3"]) {
      const section = data?.[version];
      for (const market of section?.markets || []) {
        if (version === "v4") rows.push({ ...market, version });
        else for (const reserve of market?.reserves || []) rows.push({ ...reserve, version, chainId: market?.chainId });
      }
    }
    const wantsBorrow = /borrow|borrow rate/i.test(message);
    const requestedSymbols = ["USDC", "USDT", "DAI", "GHO", "ETH", "WETH", "WBTC", "BTC", "LINK", "UNI", "LDO", "CRV", "USDE", "PYUSD", "EURC"].filter((sym) => new RegExp("\\b" + sym + "\\b", "i").test(message));
    const marketRows = requestedSymbols.length ? rows.filter((r) => requestedSymbols.includes(String(r?.symbol || "").toUpperCase())) : rows;
    marketRows.sort((a, b) => {
      const av = Number(wantsBorrow ? a?.borrowApyPct ?? a?.variableBorrowApy ?? 999 : a?.supplyApyPct ?? a?.supplyApy ?? 0);
      const bv = Number(wantsBorrow ? b?.borrowApyPct ?? b?.variableBorrowApy ?? 999 : b?.supplyApyPct ?? b?.supplyApy ?? 0);
      return wantsBorrow ? av - bv : bv - av;
    });
    const top = marketRows.slice(0, 5);
    if (!top.length) return "Aave returned no matching markets for that request.";
    return [
      `**Aave ${wantsBorrow ? "borrow" : "supply"} markets**`,
      ...top.map((r) => {
        const apy = Number(wantsBorrow ? r?.borrowApyPct ?? r?.variableBorrowApy ?? 0 : r?.supplyApyPct ?? r?.supplyApy ?? 0);
        const where = [r?.symbol, r?.spoke || r?.marketName, r?.hub, r?.chainId ? `chain ${r.chainId}` : null].filter(Boolean).join(" \xB7 ");
        return `\u2022 ${where}: **${apy.toFixed(2)}% APY**`;
      })
    ].join("\n");
  }
  if (result.kind === "reserve_selection_required") {
    const rows = Array.isArray(result.candidates) ? result.candidates.slice(0, 6) : [];
    return [
      `I found **${result.candidates?.length || 0}** valid Aave reserves for that ${result.action} request, so I did not guess which one to use.`,
      ...rows.map((r) => `\u2022 ${r.symbol || result.requested?.symbol} \xB7 ${r.spoke || r.marketName || "market"} \xB7 chain ${r.chainId} \xB7 supply ${Number(r.supplyApyPct || 0).toFixed(2)}% \xB7 borrow ${Number(r.borrowApyPct || 0).toFixed(2)}%`),
      "Specify the chain/spoke you want before simulation or preparation."
    ].join("\n");
  }
  if (result.kind === "position_selection_required") {
    return result.message || "Aave positions are loaded, but the exact reserve must be selected before withdraw/repay.";
  }
  if (result.kind === "preview_action") {
    return `Aave simulated the **${result.requested?.action || "action"}** successfully. Nothing was submitted or signed.`;
  }
  if (result.kind === "prepared_action") {
    return `Aave built the **unsigned ${result.requested?.action || "action"} transaction** after simulation. Nothing was signed or submitted; the wallet still has to review and sign it.`;
  }
  return result.message || "Aave data loaded successfully.";
}
var AI_SWAP_GAS_RPCS = {
  ethereum: "https://ethereum-rpc.publicnode.com",
  base: "https://mainnet.base.org",
  arbitrum: "https://arb1.arbitrum.io/rpc"
};
app.get("/api/wallet/native-gas-reserve", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const chain = String(req.query.chain || "").toLowerCase();
  const rpc = AI_SWAP_GAS_RPCS[chain];
  if (!rpc) return res.status(400).json({ ok: false, error: "unsupported_chain" });
  try {
    const response = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] })
    });
    const body = await response.json();
    const gasPrice = /^0x[0-9a-f]+$/i.test(String(body?.result || "")) ? BigInt(body.result) : 0n;
    if (gasPrice <= 0n) throw new Error("gas_price_unavailable");
    const gasUnits = chain === "ethereum" ? 50000n : 100000n;
    const reserveWei = gasPrice * gasUnits * 125n / 100n;
    return res.json({ ok: true, chain, reserveEth: Number(reserveWei) / 1e18, gasPriceWei: String(gasPrice), gasUnits: Number(gasUnits) });
  } catch (error) {
    return res.status(502).json({ ok: false, error: "gas_reserve_unavailable", detail: error?.message || String(error) });
  }
});
function parseAiWalletSwapIntent(message, universe = []) {
  const text = String(message || "").trim();
  if (!/(swap|convert|exchange|trade|move|consolidate|put)/i.test(text)) return null;
  if (!/(\ball\b|\bmax\b|everything)/i.test(text)) return null;
  const sourceMatch = text.match(/\ball\s+(?:of\s+)?(?:the\s+|my\s+)?([A-Za-z0-9]{2,12})\b/i) || text.match(/\bmax(?:imum)?\s+(?:of\s+)?(?:the\s+|my\s+)?([A-Za-z0-9]{2,12})\b/i);
  if (!sourceMatch) return null;
  const sourceSymbol = String(sourceMatch[1] || "").toUpperCase();
  const chainMatch = text.match(/\bon\s+(base|ethereum|mainnet|arbitrum|arb|optimism|polygon)\b/i);
  const chainRaw = String(chainMatch?.[1] || "").toLowerCase();
  const targetChain = chainRaw === "mainnet" ? "ethereum" : chainRaw === "arb" ? "arbitrum" : chainRaw || null;
  const targetMatches = [...text.matchAll(/\b(?:to|into|for)\s+(?:all\s+of\s+)?(?:my\s+)?([A-Za-z0-9]{2,12})\b/gi)];
  let targetSymbol = String(targetMatches.at(-1)?.[1] || "").toUpperCase();
  const known = /* @__PURE__ */ new Set([
    "BTC",
    "ETH",
    "USDC",
    "USDT",
    "SOL",
    "XRP",
    "TAO",
    "NEAR",
    "AAVE",
    "LINK",
    "AVAX",
    "ADA",
    "SUI",
    "AERO",
    ...universe.map((x) => String(x?.symbol || "").toUpperCase()).filter(Boolean)
  ]);
  if (targetChain && (!targetSymbol || !known.has(targetSymbol)) && /\b(move|consolidate|put)\b/i.test(text)) {
    targetSymbol = sourceSymbol;
  }
  if (!targetSymbol || !known.has(targetSymbol) || targetSymbol === sourceSymbol && !targetChain) {
    return { kind: "swap_target_required", sourceSymbol };
  }
  return {
    kind: "swap_plan",
    sourceSymbol,
    targetSymbol,
    targetChain,
    amountMode: "all_spendable",
    requiresReview: true
  };
}
app.post("/api/ai-chat", async (req, res) => {
  try {
    const message = String(req.body?.message || "");
    const universe = Array.isArray(req.body?.marketUniverse) ? req.body.marketUniverse.filter((x) => x && typeof x.symbol === "string").sort((a, b) => Number(b.volume24h || 0) - Number(a.volume24h || 0)) : [];
    const swapIntent = parseAiWalletSwapIntent(message, universe);
    if (swapIntent?.kind === "swap_target_required") {
      return res.json({
        ok: true,
        engine: "aurelis-wallet-actions",
        reply: `I can prepare that. Tell me which asset you want to convert all spendable ${swapIntent.sourceSymbol} into, for example USDC, BTC, or SOL. Nothing will be submitted until you review it.`,
        action: swapIntent,
        timestamp: Date.now()
      });
    }
    if (swapIntent?.kind === "swap_plan") {
      return res.json({
        ok: true,
        engine: "aurelis-wallet-actions",
        reply: `I prepared an all-spendable ${swapIntent.sourceSymbol} \u2192 ${swapIntent.targetSymbol}${swapIntent.targetChain ? ` on ${swapIntent.targetChain}` : ""} swap plan. I\u2019ll send each chain balance to Trade & Swap as a separate leg and keep final wallet approval required.`,
        action: swapIntent,
        timestamp: Date.now()
      });
    }
    try {
      const walletAddress = getVerifiedWalletAddress(req, res);
      const aaveResult = await runAaveAgentQuery(message, walletAddress);
      if (aaveResult) {
        return res.json({
          ok: true,
          engine: "aurelis-aave-mcp",
          reply: formatAaveAgentReply(aaveResult, message),
          aave: aaveResult,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      return res.status(502).json({
        ok: false,
        engine: "aurelis-aave-mcp",
        error: "aave_mcp_unavailable",
        reply: error?.message || "Aave MCP is unavailable right now."
      });
    }
    const priceLookupSymbol = extractPriceLookupSymbol(message);
    if (priceLookupSymbol) {
      const live = await lookupLiveCryptoPrice(priceLookupSymbol);
      if (live) {
        const priceText = live.price >= 1 ? live.price.toLocaleString(void 0, { style: "currency", currency: "USD", maximumFractionDigits: 4 }) : "$" + live.price.toLocaleString(void 0, { maximumSignificantDigits: 6 });
        const changeText = Number.isFinite(live.change24h) ? `${live.change24h >= 0 ? "+" : ""}${live.change24h.toFixed(2)}%` : "N/A";
        return res.json({
          ok: true,
          engine: "aurelis-live-price",
          reply: `**${live.name} (${live.symbol})** is **${priceText}** right now.

24h: **${changeText}**`,
          asset: live,
          timestamp: Date.now()
        });
      }
    }
    const flowSymbols = universe.length ? universe.map((x) => String(x.symbol).toUpperCase()) : ["BTC", "ETH", "SOL", "XRP", "DOGE", "TAO", "ADA", "AVAX", "LINK", "SUI", "NEAR", "AAVE"];
    const asksFlow = /most\s+bought|buy(?:ing)?\s+pressure|buyers?|order\s*flow|net\s+buy|buy\s*side/i.test(message);
    let flowRows = [];
    if (asksFlow) {
      flowRows = await fetchKrakenMarketFlow(flowSymbols, 15);
      if (flowRows.length) {
        const top = flowRows[0];
        const next = flowRows.slice(1, 4);
        const nextText = next.length ? `

Next strongest: ${next.map((r) => `${r.symbol} ${r.buySharePct.toFixed(1)}% buy share`).join(" \xB7 ")}` : "";
        const reply = `Among the tracked Kraken USD markets over the last ${top.windowMinutes} minutes, **${top.symbol}** has the strongest current buying pressure in the sample.

\u2022 Buy share: **${top.buySharePct.toFixed(1)}%** of traded notional
\u2022 Net buy notional: **${top.netBuyNotional >= 0 ? "+" : "-"}$${Math.abs(top.netBuyNotional).toLocaleString(void 0, { maximumFractionDigits: 0 })}**
\u2022 Recent trades sampled: **${top.trades}** (${top.buyTrades} buyer-initiated / ${top.sellTrades} seller-initiated)` + nextText + `

This measures recent exchange trade flow, not total purchases across every exchange.`;
        return res.json({
          ok: true,
          engine: "aurelis-market-flow",
          reply,
          marketFlow: flowRows.slice(0, 8),
          timestamp: Date.now()
        });
      }
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      const ai = new GoogleGenAI({ apiKey });
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: message,
          config: {
            systemInstruction: "You are AURELIS AI, a concise crypto market and wallet assistant. Use the supplied market context when relevant. Never claim to have executed a transaction unless the application explicitly confirms it.",
            temperature: 0.25
          }
        });
        const reply = response.text || "";
        if (reply) return res.json({ ok: true, reply, engine: "gemini-3.5-flash", timestamp: Date.now() });
      } catch {
      }
    }
    const fallback = generateLocalAiChatResponse({
      message,
      coinSymbol: req.body?.coinSymbol || universe[0]?.symbol || "BTC",
      coinName: req.body?.coinName || universe[0]?.name || "Bitcoin",
      currentPrice: Number(req.body?.currentPrice || universe[0]?.price || 0),
      change24h: Number(req.body?.change24h || universe[0]?.change24h || 0),
      timeframe: req.body?.timeframe || "1H",
      rsi: req.body?.rsi,
      ema20: req.body?.ema20
    });
    return res.json({ ok: true, reply: fallback, engine: "local", timestamp: Date.now() });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: "aurelis_ai_unavailable",
      reply: error?.message || "AURELIS AI backend unavailable"
    });
  }
});
function generateLocalTechnicalReport({
  coinSymbol,
  coinName,
  currentPrice,
  change24h,
  high24h,
  low24h,
  volume24h,
  rsi,
  ema20,
  ema50,
  mode,
  quotaExceeded = false
}) {
  const rsiVal = rsi !== void 0 ? Number(rsi) : 50;
  const price = currentPrice ? Number(currentPrice) : 0;
  const ema20Val = ema20 ? Number(ema20) : price;
  const ema50Val = ema50 ? Number(ema50) : price;
  let bullishPoints = 0;
  let bearishPoints = 0;
  if (price > ema20Val) bullishPoints += 1.5;
  else bearishPoints += 1.5;
  if (ema20Val >= ema50Val) bullishPoints += 1;
  else bearishPoints += 1;
  if (change24h > 1.5) bullishPoints += 1.5;
  else if (change24h < -1.5) bearishPoints += 1.5;
  else if (change24h > 0) bullishPoints += 0.5;
  else bearishPoints += 0.5;
  if (rsiVal >= 52 && rsiVal <= 68) bullishPoints += 1.5;
  else if (rsiVal > 70) bearishPoints += 1;
  else if (rsiVal <= 48 && rsiVal >= 32) bearishPoints += 1.5;
  else if (rsiVal < 30) bullishPoints += 1;
  let sentiment = "NEUTRAL";
  let confidence = 65;
  if (bullishPoints >= bearishPoints + 1.5) {
    sentiment = "BULLISH";
    confidence = Math.min(88, 65 + Math.round((bullishPoints - bearishPoints) * 5));
  } else if (bearishPoints >= bullishPoints + 1.5) {
    sentiment = "BEARISH";
    confidence = Math.min(88, 65 + Math.round((bearishPoints - bullishPoints) * 5));
  } else {
    sentiment = "NEUTRAL";
    confidence = 60;
  }
  const resTarget = high24h && high24h > price ? high24h : Number((price * 1.035).toFixed(2));
  const supTarget = low24h && low24h < price ? low24h : Number((price * 0.965).toFixed(2));
  const quotaNotice = quotaExceeded ? `[QUOTA ADVISORY: Gemini API free quota limit (429) was reached. Analysis generated seamlessly by Aurelis Algorithmic Indicator Engine.]

` : "";
  if (mode === "chart-deep") {
    const analysis = `${quotaNotice}1. BIAS: ${sentiment === "BULLISH" ? "BULLISH (LONG)" : sentiment === "BEARISH" ? "BEARISH (SHORT)" : "NEUTRAL (CONSOLIDATION)"}
2. CONFIDENCE: ${confidence}%
3. KEY LEVELS:
   - Immediate Resistance / Target: $${Number(resTarget).toLocaleString()}
   - Key Support / Invalidation Stop: $${Number(supTarget).toLocaleString()}
4. TECHNICAL SIGNALS:
   - RSI(14) is at ${rsiVal}, indicating ${rsiVal > 70 ? "overbought conditions with high retracement probability" : rsiVal < 30 ? "oversold exhaustion with upside mean-reversion potential" : rsiVal >= 50 ? "bullish momentum sustaining above the 50 median" : "bearish momentum pressing below the 50 median"}.
   - Price is currently ${price >= ema20Val ? "holding ABOVE" : "submerged BELOW"} the EMA-20 ($${Number(ema20Val).toLocaleString()}).
   - Moving average structure shows ${ema20Val >= ema50Val ? "bullish EMA-20/50 alignment supporting continuation" : "bearish EMA-20/50 compression exerting downward pressure"}.
5. MARKET CATALYST & SUMMARY:
   ${coinSymbol} trades at $${Number(price).toLocaleString()} (${change24h >= 0 ? "+" : ""}${change24h}% 24h). ${sentiment === "BULLISH" ? `Long setups offer favorable risk-to-reward targeting $${Number(resTarget).toLocaleString()} with invalidation below $${Number(supTarget).toLocaleString()}.` : sentiment === "BEARISH" ? `High selling friction favors defensive Short setups or waiting for a confirmed bounce at support near $${Number(supTarget).toLocaleString()}.` : `Chop zone detected. Recommend awaiting a clear breakout confirmation before committing directional capital.`}`;
    return {
      coinSymbol,
      coinName,
      sentiment,
      analysis,
      sources: [],
      timestamp: Date.now(),
      engine: "algorithmic-indicator",
      quotaExceeded: !!quotaExceeded
    };
  } else {
    const analysis = `${quotaNotice}1. SENTIMENT: ${sentiment}
2. SUMMARY: ${coinSymbol} displays a ${sentiment.toLowerCase()} technical setup with RSI at ${rsiVal} and price ${price >= ema20Val ? "holding above" : "slumping below"} the EMA-20 ($${Number(ema20Val).toLocaleString()}). ${sentiment === "BULLISH" ? `Upside continuation toward $${Number(resTarget).toLocaleString()} holds higher statistical probability while $${Number(supTarget).toLocaleString()} holds.` : sentiment === "BEARISH" ? `Caution advised; elevated downside risks targeting $${Number(supTarget).toLocaleString()}.` : `Consolidation phase detected; monitor for volume expansion before entry.`}`;
    return {
      coinSymbol,
      coinName,
      sentiment,
      analysis,
      sources: [],
      timestamp: Date.now(),
      engine: "algorithmic-indicator",
      quotaExceeded: !!quotaExceeded
    };
  }
}
app.post("/api/ai/analyze-market", async (req, res) => {
  const {
    coin,
    timeframe,
    points,
    candles,
    rsi,
    ema20,
    ema50,
    currentPrice,
    change24h,
    high24h,
    low24h,
    volume24h,
    mode = "sentiment"
    // 'sentiment' | 'chart-deep'
  } = req.body;
  const coinSymbol = (coin?.symbol || "BTC").toUpperCase();
  const coinName = coin?.name || coinSymbol;
  const priceStr = currentPrice ? `$${Number(currentPrice).toLocaleString()}` : "N/A";
  const changeStr = change24h !== void 0 ? `${change24h >= 0 ? "+" : ""}${change24h}%` : "N/A";
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const report = generateLocalTechnicalReport({
      coinSymbol,
      coinName,
      currentPrice,
      change24h,
      high24h,
      low24h,
      volume24h,
      rsi,
      ema20,
      ema50,
      mode,
      quotaExceeded: false
    });
    return res.json(report);
  }
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
  const recentPoints = Array.isArray(points) ? points.slice(-20) : [];
  const pointsSummary = recentPoints.map((p) => `${p.time || ""}:${p.price?.toFixed(2) || p.price}`).join(", ");
  const systemPrompt = `You are the Aurelis Cybernetic Crypto Market Intelligence Engine.
You provide precise, objective technical analysis, momentum assessment, and clear trading bias (BULLISH vs BEARISH vs NEUTRAL) for cryptocurrency assets.
Ground your reasoning in both the technical indicators provided and live crypto market search data.
Be concise, clear, and professional. Avoid conversational fluff. Return structured information.`;
  const userPrompt = mode === "chart-deep" ? `Conduct a deep technical and live price action analysis for ${coinName} (${coinSymbol}/USD).
Current Live Data:
- Live Price: ${priceStr}
- 24h Change: ${changeStr}
- 24h Range: High ${high24h ? "$" + high24h : "N/A"} / Low ${low24h ? "$" + low24h : "N/A"}
- 24h Volume: ${volume24h ? "$" + Number(volume24h).toLocaleString() : "N/A"}
- Active Timeframe: ${timeframe || "1H"}
- Calculated RSI (14-period): ${rsi !== void 0 ? rsi : "N/A"}
- EMA 20: ${ema20 ? "$" + ema20 : "N/A"} | EMA 50: ${ema50 ? "$" + ema50 : "N/A"}
- Recent Close Price Trajectory: [${pointsSummary}]

Use Google Search to cross-reference current live market conditions, breaking news, macroeconomic sentiment, or liquidation levels for ${coinSymbol}.
Answer in this structured format:
1. BIAS: State either "BULLISH (LONG)", "BEARISH (SHORT)", or "NEUTRAL (CONSOLIDATION)".
2. CONFIDENCE: Give a percentage between 50% and 95%.
3. KEY LEVELS:
   - Immediate Resistance / Target
   - Key Support / Invalidation Stop
4. TECHNICAL SIGNALS: Summarize what RSI, EMA crossover/alignment, and price structure indicate.
5. MARKET CATALYST & SUMMARY: 2 to 3 sentences explaining the primary driver and whether a Long or Short setup offers higher statistical probability.` : `Provide a quick market sentiment and direction report for ${coinName} (${coinSymbol}/USD).
Live Stats:
- Price: ${priceStr} (${changeStr})
- Timeframe: ${timeframe || "1H"}
- RSI: ${rsi !== void 0 ? rsi : "N/A"}
- EMA-20 vs Price: ${ema20 ? currentPrice > ema20 ? "Above EMA-20" : "Below EMA-20" : "N/A"}

Search for any breaking crypto market drivers or sentiment for ${coinSymbol}.
Provide:
1. SENTIMENT: "BULLISH" or "BEARISH" or "NEUTRAL"
2. SUMMARY: 2-3 concise sentences stating if market structure leans Long or Short, key trigger to watch, and risk note.`;
  const searchAttempts = [
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.8-flash"
  ];
  const directAttempts = [
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.8-flash"
  ];
  for (const modelName of searchAttempts) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          tools: [{ googleSearch: {} }],
          temperature: 0.2
        }
      });
      const analysisText = response.text || "";
      if (!analysisText) continue;
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const searchSources = groundingChunks.map((chunk) => {
        if (chunk?.web?.uri) {
          return {
            title: chunk.web.title || "Market Source",
            uri: chunk.web.uri
          };
        }
        return null;
      }).filter(Boolean).slice(0, 4);
      let sentiment = "NEUTRAL";
      const upperText = analysisText.toUpperCase();
      if (upperText.includes("BULLISH")) sentiment = "BULLISH";
      else if (upperText.includes("BEARISH")) sentiment = "BEARISH";
      return res.json({
        coinSymbol,
        coinName,
        sentiment,
        analysis: analysisText,
        sources: searchSources,
        timestamp: Date.now(),
        engine: "gemini",
        modelUsed: `${modelName} + Google Search`
      });
    } catch (err) {
      console.warn(`Search attempt with ${modelName} failed (${err?.status || err?.message})`);
    }
  }
  for (const modelName of directAttempts) {
    try {
      const directPrompt = mode === "chart-deep" ? `Conduct a deep technical analysis for ${coinName} (${coinSymbol}/USD).
Current Live Indicator & Price Action Data:
- Live Price: ${priceStr}
- 24h Change: ${changeStr}
- 24h Range: High ${high24h ? "$" + high24h : "N/A"} / Low ${low24h ? "$" + low24h : "N/A"}
- 24h Volume: ${volume24h ? "$" + Number(volume24h).toLocaleString() : "N/A"}
- Active Timeframe: ${timeframe || "1H"}
- Calculated RSI (14-period): ${rsi !== void 0 ? rsi : "N/A"}
- EMA 20: ${ema20 ? "$" + ema20 : "N/A"} | EMA 50: ${ema50 ? "$" + ema50 : "N/A"}
- Recent Close Price Trajectory: [${pointsSummary}]

Answer in this structured format:
1. BIAS: State either "BULLISH (LONG)", "BEARISH (SHORT)", or "NEUTRAL (CONSOLIDATION)".
2. CONFIDENCE: Give a percentage between 50% and 95%.
3. KEY LEVELS:
   - Immediate Resistance / Target
   - Key Support / Invalidation Stop
4. TECHNICAL SIGNALS: Summarize what RSI, EMA crossover/alignment, and price structure indicate.
5. MARKET CATALYST & SUMMARY: 2 to 3 sentences explaining the primary driver and whether a Long or Short setup offers higher statistical probability.` : `Provide a quick market sentiment and direction report for ${coinName} (${coinSymbol}/USD).
Live Stats:
- Price: ${priceStr} (${changeStr})
- Timeframe: ${timeframe || "1H"}
- RSI: ${rsi !== void 0 ? rsi : "N/A"}
- EMA-20: ${ema20 ? "$" + ema20 : "N/A"}
- EMA-20 vs Price: ${ema20 ? currentPrice > ema20 ? "Above EMA-20" : "Below EMA-20" : "N/A"}

Provide:
1. SENTIMENT: "BULLISH" or "BEARISH" or "NEUTRAL"
2. SUMMARY: 2-3 concise sentences stating if market structure leans Long or Short, key trigger to watch, and risk note.`;
      const response = await ai.models.generateContent({
        model: modelName,
        contents: directPrompt,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.2
        }
      });
      const analysisText = response.text || "";
      if (!analysisText) continue;
      let sentiment = "NEUTRAL";
      const upperText = analysisText.toUpperCase();
      if (upperText.includes("BULLISH")) sentiment = "BULLISH";
      else if (upperText.includes("BEARISH")) sentiment = "BEARISH";
      return res.json({
        coinSymbol,
        coinName,
        sentiment,
        analysis: analysisText,
        sources: [],
        timestamp: Date.now(),
        engine: "gemini",
        modelUsed: modelName
      });
    } catch (err) {
      console.warn(`Direct attempt with ${modelName} failed (${err?.status || err?.message})`);
    }
  }
  console.warn("All Gemini API attempts hit quota or failed. Falling back to Algorithmic Technical Engine.");
  const fallbackReport = generateLocalTechnicalReport({
    coinSymbol,
    coinName,
    currentPrice,
    change24h,
    high24h,
    low24h,
    volume24h,
    rsi,
    ema20,
    ema50,
    mode,
    quotaExceeded: true
  });
  return res.json(fallbackReport);
});
function generateLocalAiChatResponse({
  message,
  coinSymbol,
  coinName,
  currentPrice,
  change24h,
  timeframe,
  rsi,
  ema20
}) {
  const sym = coinSymbol || "BTC";
  const name = coinName || "Crypto";
  const priceStr = currentPrice ? `$${Number(currentPrice).toLocaleString()}` : "$64,500";
  const chgStr = change24h !== void 0 ? `${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}%` : "+2.4%";
  const tf = timeframe || "1H";
  const rsiVal = rsi !== void 0 ? Number(rsi) : 52;
  const isBullish = (change24h || 0) >= 0;
  const lowerMsg = message.toLowerCase();
  if (lowerMsg.includes("target") || lowerMsg.includes("price") || lowerMsg.includes("predict") || lowerMsg.includes("where")) {
    const res = currentPrice ? (currentPrice * 1.045).toFixed(2) : "Higher";
    const sup = currentPrice ? (currentPrice * 0.965).toFixed(2) : "Lower";
    return `Based on current ${tf} momentum for ${name} (${sym} @ ${priceStr}, 24h: ${chgStr}):

\u2022 Primary Technical Target: $${res} (+4.5% upper band)
\u2022 Critical Invalidation / Support: $${sup} (-3.5% lower boundary)
\u2022 Momentum Bias: ${isBullish ? "BULLISH continuation with volume confirmation" : "BEARISH pull-back consolidation"}
\u2022 Indicator Confluence: RSI is hovering at ${rsiVal} (${rsiVal > 70 ? "overbought cooling" : rsiVal < 30 ? "oversold relief" : "neutral-to-bullish zone"}).

Actionable Note: Watch orderbook liquidity absorption around immediate resistance before adding leverage.`;
  }
  if (lowerMsg.includes("buy") || lowerMsg.includes("sell") || lowerMsg.includes("long") || lowerMsg.includes("short")) {
    return `${sym} Market Structure Analysis:
\u2022 Current Price: ${priceStr} (${chgStr} 24h)
\u2022 Relative Strength (RSI 14): ${rsiVal}
\u2022 Short-term EMA-20: ${ema20 ? `$${ema20}` : "Holding key dynamic support"}

Statistical Setup:
${isBullish ? "Long bias offers favorable risk-to-reward on dips toward key support. Trailing stops recommended." : "Cautious stance: wait for confirmed bullish candle close before opening new long exposure."}

Risk Note: Always maintain strict position sizing according to your portfolio risk parameters.`;
  }
  return `Aurelis Market Intelligence on ${name} (${sym}):
\u2022 Current Price: ${priceStr} (${chgStr} over 24h)
\u2022 Active Timeframe: ${tf}
\u2022 Market State: ${isBullish ? "Upward structural trending" : "Consolidation / Pullback"}

Regarding "${message}":
Market depth indicates active liquidity clustered around the current range. Technical indicators show ${rsiVal >= 50 ? "bullish momentum intact with buyers defending dips" : "cautious sideways accumulation"}. Key level to watch is immediate breakout confirmation above the 24h volume weighted average price.`;
}
app.post("/api/ai-chat", async (req, res) => {
  const {
    message,
    coinSymbol = "BTC",
    coinName = "Bitcoin",
    currentPrice,
    change24h,
    timeframe = "1H",
    rsi,
    ema20,
    ema50,
    history = []
  } = req.body;
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Message is required" });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const fallback2 = generateLocalAiChatResponse({
      message,
      coinSymbol,
      coinName,
      currentPrice,
      change24h,
      timeframe,
      rsi,
      ema20
    });
    return res.json({ reply: fallback2, sources: [], engine: "local" });
  }
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
  const systemPrompt = `You are Aurelis AI, the elite cybernetic cryptocurrency trading and market intelligence copilot.
You assist traders with technical analysis, price target projections, risk management, support/resistance levels, and breaking crypto catalyst context.
Active Asset: ${coinName} (${coinSymbol})
Current Live Price: $${currentPrice || "N/A"} (24h Change: ${change24h !== void 0 ? change24h + "%" : "N/A"})
Active Timeframe: ${timeframe}
RSI (14): ${rsi !== void 0 ? rsi : "N/A"} | EMA-20: ${ema20 || "N/A"} | EMA-50: ${ema50 || "N/A"}

Guidelines:
- Deliver direct, high-value, crisp insights without fluff.
- Use clear bullet points and bold headers when quoting price targets or support/resistance levels.
- Always include an objective bias (Bullish, Bearish, or Neutral) and key invalidation price.`;
  const chatAttempts = [
    "gemini-3.1-flash-lite",
    "gemini-3.8-flash"
  ];
  for (const modelName of chatAttempts) {
    try {
      const timeoutPromise = new Promise(
        (_, reject) => setTimeout(() => reject(new Error("AI generation timeout")), 3500)
      );
      const generatePromise = ai.models.generateContent({
        model: modelName,
        contents: [
          ...history.slice(-4).map((h) => ({
            role: h.role === "user" ? "user" : "model",
            parts: [{ text: h.text }]
          })),
          {
            role: "user",
            parts: [{ text: message }]
          }
        ],
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.3
        }
      });
      const response = await Promise.race([generatePromise, timeoutPromise]);
      const replyText = response.text || "";
      if (replyText) {
        return res.json({
          reply: replyText,
          sources: [],
          engine: "gemini",
          modelUsed: modelName,
          timestamp: Date.now()
        });
      }
    } catch (err) {
      const errMsg = err?.message || String(err);
      console.warn(`AI chat attempt with ${modelName} failed (${errMsg})`);
      if (err?.status === 429 || errMsg.includes("quota") || errMsg.includes("resource_exhausted")) {
        break;
      }
    }
  }
  const fallback = generateLocalAiChatResponse({
    message,
    coinSymbol,
    coinName,
    currentPrice,
    change24h,
    timeframe,
    rsi,
    ema20
  });
  return res.json({ reply: fallback, sources: [], engine: "local" });
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: {
        middlewareMode: true,
        host
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path2.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path2.resolve(distPath, "index.html"));
    });
  }
  app.listen(port, host, () => {
    console.log(`Server running at http://${host}:${port}`);
  });
}
startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

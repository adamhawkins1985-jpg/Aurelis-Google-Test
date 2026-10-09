import express from 'express';
import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { exchangeRouter } from './server/exchange_routes';
import { registerMigratedBackend, getVerifiedWalletAddress, runAaveAgentQuery } from './server/migrated_backend';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env.runtime-secrets') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

function getArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index !== -1 && index + 1 < process.argv.length) {
    return process.argv[index + 1];
  }
  return undefined;
}

const port = Number(getArg('--port') || process.env.PORT || 3000);
const host = getArg('--host') || process.env.HOST || '0.0.0.0';

app.use(express.json({ limit: '12mb' }));

// vNext-owned wallet/auth/alerts/market/bot/borrow backend.
// Registered before the temporary legacy proxy routes so migrated endpoints terminate here.
registerMigratedBackend(app);

// AURELIS Exchange API (ChangeNOW Layer B)
app.use('/api/exchange', exchangeRouter);

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/walletconnect/config', (_req, res) => {
  const projectId = process.env.AURELIS_REOWN_PROJECT_ID || '';
  res.json({ ok: Boolean(projectId), projectId: projectId || null });
});


const alpacaConfig = (accountType: string = 'live') => {
  const account = String(accountType || 'live').toLowerCase() === 'ira' ? 'ira' : 'live';
  const prefix = account === 'ira' ? 'ALPACA_IRA' : 'ALPACA_LIVE';
  const key = process.env[prefix + '_API_KEY'] || '';
  const secret = process.env[prefix + '_API_SECRET'] || '';
  const explicitBase = process.env.ALPACA_BASE_URL || process.env.APCA_API_BASE_URL || '';
  const paper = String(process.env.ALPACA_ENV || '').toLowerCase() === 'paper' || explicitBase.includes('paper-api');
  const baseUrl = explicitBase || (paper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets');
  return { account, key, secret, baseUrl, paper, configured: Boolean(key && secret) };
};

async function alpacaRequest(accountType: string, pathname: string, init: RequestInit = {}) {
  const cfg = alpacaConfig(accountType);
  if (!cfg.configured) throw new Error('alpaca_not_configured');
  const response = await fetch(cfg.baseUrl + pathname, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'APCA-API-KEY-ID': cfg.key,
      'APCA-API-SECRET-KEY': cfg.secret,
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!response.ok) {
    const detail = body?.message || body?.error || ('Alpaca HTTP ' + response.status);
    const error: any = new Error(detail);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

app.get('/api/alpaca/overview', async (req, res) => {
  const accountType = String(req.query.account || 'live').toLowerCase() === 'ira' ? 'ira' : 'live';
  const cfg = alpacaConfig(accountType);
  res.setHeader('Cache-Control', 'no-store');
  if (!cfg.configured) return res.json({ ok: true, configured: false, accountType, environment: cfg.paper ? 'PAPER' : 'LIVE', account: null, positions: [], orders: [] });
  try {
    const [account, positions, orders] = await Promise.all([
      alpacaRequest(accountType, '/v2/account'),
      alpacaRequest(accountType, '/v2/positions'),
      alpacaRequest(accountType, '/v2/orders?status=all&limit=20&direction=desc'),
    ]);
    return res.json({ ok: true, configured: true, accountType, environment: cfg.paper ? 'PAPER' : 'LIVE', account, positions: Array.isArray(positions) ? positions : [], orders: Array.isArray(orders) ? orders : [] });
  } catch (error: any) {
    return res.status(error?.status || 502).json({ ok: false, configured: true, accountType, environment: cfg.paper ? 'PAPER' : 'LIVE', error: 'alpaca_unavailable', detail: error?.message || String(error) });
  }
});

app.post('/api/alpaca/orders', async (req, res) => {
  const accountType = String(req.body?.account || 'live').toLowerCase() === 'ira' ? 'ira' : 'live';
  const cfg = alpacaConfig(accountType);
  res.setHeader('Cache-Control', 'no-store');
  if (!cfg.configured) return res.status(409).json({ ok: false, error: 'alpaca_not_configured', accountType });
  if (req.body?.confirm !== true) return res.status(400).json({ ok: false, error: 'confirmation_required' });
  const symbol = String(req.body?.symbol || '').trim().toUpperCase();
  const side = String(req.body?.side || '').toLowerCase();
  const type = String(req.body?.type || 'market').toLowerCase();
  const notional = Number(req.body?.notional || 0);
  const limitPrice = Number(req.body?.limitPrice || 0);
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) return res.status(400).json({ ok: false, error: 'invalid_symbol' });
  if (!['buy', 'sell'].includes(side)) return res.status(400).json({ ok: false, error: 'invalid_side' });
  if (!['market', 'limit'].includes(type)) return res.status(400).json({ ok: false, error: 'invalid_order_type' });
  if (!Number.isFinite(notional) || notional <= 0 || notional > 1000000) return res.status(400).json({ ok: false, error: 'invalid_notional' });
  if (type === 'limit' && (!Number.isFinite(limitPrice) || limitPrice <= 0)) return res.status(400).json({ ok: false, error: 'invalid_limit_price' });
  try {
    const payload: any = { symbol, side, type, time_in_force: 'day', notional: String(notional) };
    if (type === 'limit') payload.limit_price = String(limitPrice);
    const order = await alpacaRequest(accountType, '/v2/orders', { method: 'POST', body: JSON.stringify(payload) });
    return res.status(201).json({ ok: true, accountType, environment: cfg.paper ? 'PAPER' : 'LIVE', order });
  } catch (error: any) {
    return res.status(error?.status || 502).json({ ok: false, error: 'alpaca_order_rejected', accountType, detail: error?.message || String(error) });
  }
});
async function alpacaMarketDataRequest(accountType: string, pathname: string) {
  const cfg = alpacaConfig(accountType);
  if (!cfg.configured) throw new Error('alpaca_not_configured');
  const response = await fetch('https://data.alpaca.markets' + pathname, {
    headers: {
      Accept: 'application/json',
      'APCA-API-KEY-ID': cfg.key,
      'APCA-API-SECRET-KEY': cfg.secret,
    },
  });
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!response.ok) {
    const error: any = new Error(body?.message || body?.error || ('Alpaca market data HTTP ' + response.status));
    error.status = response.status;
    throw error;
  }
  return body;
}


const EQUITY_HUNTER_CACHE:any = { at: 0, account: '', payload: null };

function equityEma(values:number[], period:number) {
  if (!values.length) return 0;
  const k = 2 / (period + 1);
  let out = values[0];
  for (let i=1;i<values.length;i++) out = values[i] * k + out * (1-k);
  return out;
}
function equityRsi(values:number[], period=14) {
  if (values.length < period + 1) return 50;
  let up=0, down=0;
  for (let i=values.length-period;i<values.length;i++) {
    const d=values[i]-values[i-1]; if (d>0) up+=d; else down-=d;
  }
  if (down===0) return 100;
  const rs=(up/period)/(down/period);
  return 100-(100/(1+rs));
}
function equityClamp(v:number, lo=0, hi=100) { return Math.max(lo, Math.min(hi, v)); }

async function secTickerMap() {
  const r = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': 'AURELIS research contact admin@ahconceptsai.com', Accept: 'application/json' }
  });
  if (!r.ok) return {};
  const j:any = await r.json();
  const out:any = {};
  for (const row of Object.values(j || {}) as any[]) {
    const t=String(row?.ticker||'').toUpperCase();
    if (t) out[t] = { cik:String(row?.cik_str||'').padStart(10,'0'), title:row?.title||t };
  }
  return out;
}
async function secContext(symbol:string, map:any) {
  const meta=map?.[symbol];
  if (!meta?.cik) return { available:false };
  try {
    const r=await fetch('https://data.sec.gov/submissions/CIK'+meta.cik+'.json', {
      headers: { 'User-Agent':'AURELIS research contact admin@ahconceptsai.com', Accept:'application/json' }
    });
    if (!r.ok) return { available:false, company:meta.title };
    const j:any=await r.json();
    const recent=j?.filings?.recent||{};
    const forms=Array.isArray(recent.form)?recent.form:[];
    const dates=Array.isArray(recent.filingDate)?recent.filingDate:[];
    const filings=forms.slice(0,30).map((form:string,i:number)=>({form,date:dates[i]}))
      .filter((x:any)=>['10-K','10-Q','8-K'].includes(x.form)).slice(0,5);
    return { available:true, company:j?.name||meta.title, filings };
  } catch { return { available:false, company:meta.title }; }
}

app.get('/api/equity-hunter', async (req, res) => {
  res.setHeader('Cache-Control','no-store');
  const accountType=String(req.query.account||'live').toLowerCase()==='ira'?'ira':'live';
  const force=String(req.query.force||'0')==='1';
  const now=Date.now();
  if (!force && EQUITY_HUNTER_CACHE.payload && EQUITY_HUNTER_CACHE.account===accountType && now-EQUITY_HUNTER_CACHE.at<30000) {
    return res.json({...EQUITY_HUNTER_CACHE.payload, cacheAgeSeconds:Math.round((now-EQUITY_HUNTER_CACHE.at)/1000)});
  }
  try {
    const [actives, movers, spy, qqq] = await Promise.all([
      alpacaMarketDataRequest(accountType, '/v1beta1/screener/stocks/most-actives?top=100&by=volume'),
      alpacaMarketDataRequest(accountType, '/v1beta1/screener/stocks/movers?top=50'),
      alpacaMarketDataRequest(accountType, '/v2/stocks/SPY/snapshot?feed=iex'),
      alpacaMarketDataRequest(accountType, '/v2/stocks/QQQ/snapshot?feed=iex'),
    ]);
    const symbols=new Set<string>();
    for (const row of (actives?.most_actives||actives?.mostActives||[])) if(row?.symbol) symbols.add(String(row.symbol).toUpperCase());
    for (const side of ['gainers','losers']) for (const row of (movers?.[side]||[])) if(row?.symbol) symbols.add(String(row.symbol).toUpperCase());
    ['AAPL','MSFT','NVDA','AMZN','META','GOOGL','TSLA','AMD','AVGO','NFLX','JPM','XOM','LLY','WMT','COST','ORCL','CRM','PLTR','MU','INTC'].forEach(x=>symbols.add(x));
    const universe=[...symbols].slice(0,220);
    const snapshots:any={};
    for (let i=0;i<universe.length;i+=100) {
      const chunk=universe.slice(i,i+100);
      const qs=new URLSearchParams({symbols:chunk.join(','),feed:'iex'});
      const body=await alpacaMarketDataRequest(accountType, '/v2/stocks/snapshots?'+qs.toString());
      Object.assign(snapshots, body?.snapshots||body||{});
    }
    const benchMove=(snap:any)=>{
      const p=Number(snap?.latestTrade?.p||snap?.minuteBar?.c||snap?.dailyBar?.c||0);
      const prev=Number(snap?.prevDailyBar?.c||0);
      return prev>0&&p>0?(p/prev-1)*100:0;
    };
    const spyMove=benchMove(spy), qqqMove=benchMove(qqq);
    const scan:any[]=[];
    for (const symbol of universe) {
      const snap=snapshots?.[symbol]; if(!snap) continue;
      const price=Number(snap?.latestTrade?.p||snap?.minuteBar?.c||snap?.dailyBar?.c||0);
      const prev=Number(snap?.prevDailyBar?.c||0);
      const volume=Number(snap?.dailyBar?.v||0);
      const bid=Number(snap?.latestQuote?.bp||0), ask=Number(snap?.latestQuote?.ap||0);
      if(!(price>0&&prev>0&&volume>0)) continue;
      const changePct=(price/prev-1)*100;
      const spreadBps=bid>0&&ask>0?((ask-bid)/((ask+bid)/2))*10000:50;
      const dollarVolume=price*volume;
      const relStrength=changePct-((spyMove+qqqMove)/2);
      const preScore=equityClamp(50 + Math.min(18,Math.abs(changePct)*3) + Math.min(14,Math.log10(Math.max(1,dollarVolume))-6)*3 + Math.min(12,Math.abs(relStrength)*2) - Math.min(18,spreadBps*.8));
      scan.push({symbol,price,changePct,volume,dollarVolume,spreadBps,relStrength,preScore});
    }
    scan.sort((a,b)=>b.preScore-a.preScore);
    const metadataPairs=await Promise.all(scan.slice(0,60).map(async row=>{
      try { return [row.symbol, await alpacaRequest(accountType, '/v2/assets/'+encodeURIComponent(row.symbol))]; }
      catch { return [row.symbol, null]; }
    }));
    const metadata:any=Object.fromEntries(metadataPairs);
    const isPlainEquity=(row:any)=>{
      const meta=metadata?.[row.symbol]||{};
      const name=String(meta?.name||'').toLowerCase();
      if (meta?.tradable === false) return false;
      if (String(meta?.class||'us_equity') !== 'us_equity') return false;
      if (/etf|fund|etn|trust|2x|3x|ultra|inverse|leveraged/.test(name)) return false;
      return true;
    };
    const shortlist=scan.filter(isPlainEquity).slice(0,20).map(row=>({...row,name:metadata?.[row.symbol]?.name||row.symbol,fractionable:metadata?.[row.symbol]?.fractionable!==false,shortable:Boolean(metadata?.[row.symbol]?.shortable)}));
    const deepSeeds=shortlist.slice(0,10);
    const deep=await Promise.all(deepSeeds.map(async seed=>{
      const end=new Date(), start=new Date(end.getTime()-1000*60*60*24*12);
      const qs=new URLSearchParams({timeframe:'15Min',start:start.toISOString(),end:end.toISOString(),limit:'1000',adjustment:'all',feed:'iex',sort:'asc'});
      const [barsBody,newsBody]=await Promise.all([
        alpacaMarketDataRequest(accountType,'/v2/stocks/'+encodeURIComponent(seed.symbol)+'/bars?'+qs.toString()),
        alpacaMarketDataRequest(accountType,'/v1beta1/news?symbols='+encodeURIComponent(seed.symbol)+'&limit=8&sort=desc'),
      ]);
      const bars=Array.isArray(barsBody?.bars)?barsBody.bars:[];
      const closes=bars.map((b:any)=>Number(b.c||0)).filter(Number.isFinite);
      const vols=bars.map((b:any)=>Number(b.v||0)).filter(Number.isFinite);
      if(closes.length<30) return null;
      const e20=equityEma(closes.slice(-80),20), e50=equityEma(closes.slice(-120),50);
      const rr=equityRsi(closes,14), last=closes.at(-1)||seed.price;
      const volNow=vols.slice(-4).reduce((a:number,b:number)=>a+b,0);
      const volBase=vols.slice(-24).reduce((a:number,b:number)=>a+b,0)/Math.max(1,vols.slice(-24).length)*4;
      const relVol=volBase>0?volNow/volBase:1;
      const direction=last>e20&&e20>e50?'BUY':last<e20&&e20<e50?'AVOID':seed.changePct>=0?'BUY':'AVOID';
      const technical=equityClamp(50 + (direction==='BUY'?18:-8) + Math.min(15,Math.abs(seed.changePct)*2) + (rr>45&&rr<72?8:rr>=78?-8:0));
      const relative=equityClamp(50+seed.relStrength*8);
      const volumeScore=equityClamp(42+Math.min(45,relVol*24));
      const liquidity=equityClamp(100-Math.min(65,seed.spreadBps*2.2));
      const marketAlignment=equityClamp(50 + (direction==='BUY'?1:-1)*((spyMove+qqqMove)/2)*8);
      const news=Array.isArray(newsBody?.news)?newsBody.news:[];
      const catalyst=equityClamp(45+Math.min(35,news.length*5));
      const risk=equityClamp(88-Math.min(28,Math.abs(seed.changePct)*3)-Math.min(20,seed.spreadBps));
      const readiness=equityClamp(technical*.24+relative*.18+volumeScore*.16+liquidity*.14+marketAlignment*.12+catalyst*.08+risk*.08);
      return {...seed,direction,readiness:+readiness.toFixed(1),scores:{technical:+technical.toFixed(1),relativeStrength:+relative.toFixed(1),volume:+volumeScore.toFixed(1),liquidity:+liquidity.toFixed(1),marketAlignment:+marketAlignment.toFixed(1),catalyst:+catalyst.toFixed(1),risk:+risk.toFixed(1)},indicators:{ema20:e20,ema50:e50,rsi:rr,relativeVolume:relVol},news:news.slice(0,5).map((n:any)=>({headline:n?.headline||'',source:n?.source||'',created_at:n?.created_at||''}))};
    }));
    const candidates=deep.filter(Boolean).sort((a:any,b:any)=>b.readiness-a.readiness);
    const secMap=await secTickerMap();
    for (const row of candidates.slice(0,5) as any[]) row.sec=await secContext(row.symbol,secMap);
    const payload={ok:true,source:['ALPACA_IEX','ALPACA_NEWS','SEC_EDGAR'],executionProvider:'ALPACA',scanned:scan.length,shortlisted:shortlist.length,deepAnalyzed:candidates.length,benchmarks:{SPY:+spyMove.toFixed(2),QQQ:+qqqMove.toFixed(2)},candidates:candidates.slice(0,10),generatedAt:Date.now()};
    EQUITY_HUNTER_CACHE.at=Date.now(); EQUITY_HUNTER_CACHE.account=accountType; EQUITY_HUNTER_CACHE.payload=payload;
    return res.json(payload);
  } catch (error:any) {
    return res.status(error?.status||502).json({ok:false,error:'equity_hunter_unavailable',detail:error?.message||String(error)});
  }
});

app.get('/api/alpaca/market/:symbol', async (req, res) => {
  const accountType = String(req.query.account || 'live').toLowerCase() === 'ira' ? 'ira' : 'live';
  const symbol = String(req.params.symbol || '').trim().toUpperCase();
  const range = ['1D','5D','1M','1Y'].includes(String(req.query.range || '1D').toUpperCase()) ? String(req.query.range || '1D').toUpperCase() : '1D';
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) return res.status(400).json({ ok: false, error: 'invalid_symbol' });
  const now = new Date();
  const start = new Date(now);
  let timeframe = '5Min';
  if (range === '1D') start.setUTCDate(start.getUTCDate() - 2);
  if (range === '5D') { start.setUTCDate(start.getUTCDate() - 8); timeframe = '30Min'; }
  if (range === '1M') { start.setUTCMonth(start.getUTCMonth() - 1); timeframe = '2Hour'; }
  if (range === '1Y') { start.setUTCFullYear(start.getUTCFullYear() - 1); timeframe = '1Day'; }
  const qs = new URLSearchParams({ timeframe, start: start.toISOString(), end: now.toISOString(), limit: '1000', adjustment: 'all', feed: 'iex', sort: 'asc' });
  try {
    const [snapshot, barsResult] = await Promise.all([
      alpacaMarketDataRequest(accountType, '/v2/stocks/' + encodeURIComponent(symbol) + '/snapshot?feed=iex'),
      alpacaMarketDataRequest(accountType, '/v2/stocks/' + encodeURIComponent(symbol) + '/bars?' + qs.toString()),
    ]);
    const bars = Array.isArray(barsResult?.bars) ? barsResult.bars : [];
    const filtered = range === '1D' && bars.length ? bars.filter((b: any) => String(b?.t || '').slice(0,10) === String(bars[bars.length-1]?.t || '').slice(0,10)) : bars;
    return res.json({ ok: true, symbol, range, feed: 'IEX', snapshot, bars: filtered });
  } catch (error: any) {
    return res.status(error?.status || 502).json({ ok: false, error: 'alpaca_market_data_unavailable', detail: error?.message || String(error) });
  }
});


async function analyzeLiveBetWithGemini(image: string) {
  const match = image.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!match || !apiKey) return null;

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: [{
      role: 'user',
      parts: [
        { text: 'Read this trading bet screenshot. Return one JSON object with exactly these keys: asset, direction, entry, current_price, stop_loss, take_profit, leverage. Use a short asset ticker such as LTC. direction must be LONG, SHORT, or null. Use numbers for visible prices and leverage, and null for any value that is missing or unreadable. Do not infer or invent values, and do not include markdown or explanation.' },
        { inlineData: { mimeType: match[1].toLowerCase(), data: match[2] } },
      ],
    }],
    config: { responseMimeType: 'application/json', temperature: 0 },
  });
  const raw = String(response.text || '').trim();
  const jsonText = raw.replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/, '');
  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('gemini_invalid_json');
  return parsed;
}

let liveBetOcrWorkerPromise: Promise<any> | null = null;

function extractLiveBetFromOcrText(text: string) {
  const clean = String(text || '').replace(/\r/g, '\n');
  const upper = clean.toUpperCase();
  const readAfter = (label: RegExp) => {
    const match = upper.match(new RegExp(label.source + '[\\s:=_-]{0,12}\\$?\\s*([0-9]+(?:[.,][0-9]+)?)', label.flags));
    if (!match?.[1]) return null;
    const value = Number(match[1].replace(',', '.'));
    return Number.isFinite(value) ? value : null;
  };
  const marketMatch = upper.match(/\b([A-Z]{2,12})(?:USD|USDT)\b/);
  const standalone = upper.match(/^\s*([A-Z]{2,8})\b/m);
  const asset = String(marketMatch?.[1] || standalone?.[1] || '').replace(/[^A-Z0-9]/g, '') || null;
  const direction = /\bSHORT\b/.test(upper) ? 'SHORT' : /\bLONG\b/.test(upper) ? 'LONG' : null;
  const leverageMatch = upper.match(/\b([1-9][0-9]?(?:\.[0-9]+)?)\s*[X×]\b/);
  const leverage = leverageMatch ? Number(leverageMatch[1]) : null;
  return {
    asset,
    direction,
    entry: readAfter(/ENTRY/i),
    current_price: readAfter(/MARK/i),
    stop_loss: readAfter(/STOP\s*LOSS/i),
    take_profit: readAfter(/TAKE\s*PROFIT/i),
    leverage: Number.isFinite(leverage as number) ? leverage : null,
  };
}

async function structureLiveBetOcr(text: string) {
  const deterministic: any = extractLiveBetFromOcrText(text);
  const baseUrl = String(process.env.AURELIS_AI_BASE_URL || '').trim().replace(/\/$/, '');
  const token = String(process.env.AURELIS_AI_TOKEN || '').trim();
  if (!baseUrl) return deterministic;
  try {
    const prompt = [
      'Convert OCR text from a crypto/perpetual trade card into JSON.',
      'Return only one JSON object with exactly: asset,direction,entry,current_price,stop_loss,take_profit,leverage.',
      'Use only values supported by the OCR text. Never invent a missing number.',
      'Asset must be the short ticker: ICPUSD or ICP/USD means ICP.',
      'direction must be LONG, SHORT, or null.',
      'MARK means current_price. ENTRY means entry. TAKE PROFIT means take_profit. STOP LOSS means stop_loss.',
      'Ignore PNL percentages, confidence percentages, payout odds, risk/reward ratios, and candle intervals.',
      'If leverage is not explicitly shown as something like 2x, return null.',
      'OCR TEXT:',
      String(text || '').slice(0, 6000),
    ].join('\n');
    const response = await fetch(baseUrl + '/v1/chat/completions', {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: String(process.env.AURELIS_AI_ANALYST_MODEL || '@cf/qwen/qwen3-30b-a3b-fp8'),
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 300,
      }),
    });
    const payload: any = await response.json();
    if (!response.ok) return deterministic;
    const raw = String(payload?.choices?.[0]?.message?.content || '').trim();
    const cleaned = raw.replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\s*\x60\x60\x60$/, '');
    let parsed: any = null;
    try { parsed = JSON.parse(cleaned); } catch {
      const a = cleaned.indexOf('{');
      const b = cleaned.lastIndexOf('}');
      if (a >= 0 && b > a) try { parsed = JSON.parse(cleaned.slice(a, b + 1)); } catch {}
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return deterministic;
    return {
      asset: parsed.asset ?? deterministic.asset,
      direction: parsed.direction ?? deterministic.direction,
      entry: parsed.entry ?? deterministic.entry,
      current_price: parsed.current_price ?? deterministic.current_price,
      stop_loss: parsed.stop_loss ?? deterministic.stop_loss,
      take_profit: parsed.take_profit ?? deterministic.take_profit,
      leverage: parsed.leverage ?? deterministic.leverage,
    };
  } catch {
    return deterministic;
  }
}

async function analyzeLiveBetWithOcr(image: string) {
  const match = image.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i);
  if (!match) return null;
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length) return null;
  try {
    if (!liveBetOcrWorkerPromise) {
      liveBetOcrWorkerPromise = import('tesseract.js').then(({ createWorker }) => createWorker('eng'));
    }
    const worker = await liveBetOcrWorkerPromise;
    const result = await worker.recognize(bytes);
    const text = String(result?.data?.text || '').trim();
    if (!text) return null;
    const trade: any = await structureLiveBetOcr(text);
    const useful = [trade?.asset, trade?.direction, trade?.entry, trade?.current_price, trade?.stop_loss, trade?.take_profit]
      .filter((value) => value !== null && value !== undefined && value !== '');
    return useful.length >= 3 ? trade : null;
  } catch (error) {
    liveBetOcrWorkerPromise = null;
    console.error('[live-bet] OCR fallback failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

app.post('/api/live-bet/analyze', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const image = String(req.body?.image || '').trim();
  const match = image.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i);
  if (!match) return res.status(400).json({ ok: false, error: 'invalid_image_type', executionEnabled: false });
  if (image.length > 11_000_000) return res.status(413).json({ ok: false, error: 'image_too_large', executionEnabled: false });

  let upstreamError: any = null;
  const baseUrl = String(process.env.AURELIS_VISION_BASE_URL || '').trim().replace(/\/$/, '');
  const token = String(process.env.AURELIS_VISION_TOKEN || '').trim();
  if (baseUrl && token) {
    try {
      const upstream = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ image }),
      });
      const body = await upstream.text();
      let payload: any = null;
      try { payload = JSON.parse(body); } catch {}
      if (upstream.ok && payload?.ok && payload?.trade) {
        const trade: any = payload.trade;
        if ((trade.entry === null || trade.entry === '') && trade.current_price !== null && trade.current_price !== '') {
          trade.entry = trade.current_price;
          trade.entry_source = 'VISIBLE_CURRENT_PRICE';
        } else if (trade.entry !== null && trade.entry !== '') {
          trade.entry_source = 'VISIBLE_ENTRY';
        } else {
          trade.entry_source = null;
        }
        const direction = String(trade.direction || '').toUpperCase();
        trade.direction = ['LONG', 'SHORT'].includes(direction) ? direction : null;
        return res.json({ ok: true, trade, model: payload?.model || 'aurelis-vision', executionEnabled: false });
      }
      upstreamError = payload?.detail || payload?.error || 'vision_service_invalid_response';
    } catch (error: any) {
      upstreamError = error?.message || String(error);
    }
  } else {
    upstreamError = 'aurelis_vision_not_configured';
  }

  try {
    const parsed: any = await analyzeLiveBetWithGemini(image);
    if (parsed) {
      const direction = String(parsed.direction || '').toUpperCase();
      const trade = {
        asset: String(parsed.asset || '').toUpperCase() || null,
        direction: ['LONG', 'SHORT'].includes(direction) ? direction : null,
        entry: parsed.entry ?? null,
        current_price: parsed.current_price ?? null,
        stop_loss: parsed.stop_loss ?? null,
        take_profit: parsed.take_profit ?? null,
        leverage: parsed.leverage ?? null,
      };
      if ((trade.entry === null || trade.entry === '') && trade.current_price !== null && trade.current_price !== '') {
        trade.entry = trade.current_price;
        (trade as any).entry_source = 'VISIBLE_CURRENT_PRICE';
      } else if (trade.entry !== null && trade.entry !== '') {
        (trade as any).entry_source = 'VISIBLE_ENTRY';
      }
      return res.json({ ok: true, trade, model: 'gemini-3.5-flash-fallback', executionEnabled: false });
    }
  } catch (error: any) {
    const fallbackError = error?.message || String(error);
    console.error('[live-bet] Gemini fallback failed:', fallbackError);
    upstreamError = upstreamError ? upstreamError + '; Gemini fallback: ' + fallbackError : fallbackError;
  }
  try {
    const ocrTrade: any = await analyzeLiveBetWithOcr(image);
    if (ocrTrade) {
      const direction = String(ocrTrade.direction || '').toUpperCase();
      ocrTrade.direction = ['LONG', 'SHORT'].includes(direction) ? direction : null;
      if ((ocrTrade.entry === null || ocrTrade.entry === '') && ocrTrade.current_price !== null && ocrTrade.current_price !== '') {
        ocrTrade.entry = ocrTrade.current_price;
        ocrTrade.entry_source = 'OCR_VISIBLE_CURRENT_PRICE';
      } else if (ocrTrade.entry !== null && ocrTrade.entry !== '') {
        ocrTrade.entry_source = 'OCR_VISIBLE_ENTRY';
      } else {
        ocrTrade.entry_source = null;
      }
      return res.json({ ok: true, trade: ocrTrade, model: 'aurelis-ocr+text-structure', executionEnabled: false });
    }
  } catch (error: any) {
    console.error('[live-bet] OCR recovery failed:', error?.message || String(error));
  }

  console.error('[live-bet] screenshot analysis unavailable:', upstreamError || 'no_vision_provider');
  const detail = upstreamError === 'invalid_model_output'
    ? 'The screenshot reached the reader, but it could not extract a clear trade. Upload the original bet screenshot or crop the bet card so its text is larger.'
    : 'The screenshot reader is temporarily unavailable. Please try again in a moment.';
  return res.status(502).json({
    ok: false,
    error: 'vision_unavailable',
    reason: upstreamError || 'no_vision_provider',
    detail,
    executionEnabled: false,
  });
});


const AURELIS_ARBITRAGE_INTERNAL_BASE =
  String(process.env.AURELIS_ARBITRAGE_INTERNAL_BASE || 'http://127.0.0.1:8894').replace(/\/$/, '');

const proxyArbitrageJson = async (res: any, upstreamPath: string) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const response = await fetch(AURELIS_ARBITRAGE_INTERNAL_BASE + upstreamPath, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(35000),
    });
    const body = await response.text();
    res.status(response.status);
    res.type('application/json');
    return res.send(body);
  } catch (error: any) {
    return res.status(502).json({
      ok: false,
      error: 'arbitrage_engine_unavailable',
      detail: error?.message || String(error),
    });
  }
};

app.get('/api/arbitrage/scan', async (req, res) => {
  const rawTarget = Number(req.query.target || 25);
  const target = Number.isFinite(rawTarget) ? Math.max(5, Math.min(10000, rawTarget)) : 25;
  const fresh = String(req.query.fresh || 'false').toLowerCase() === 'true';
  return proxyArbitrageJson(
    res,
    '/scan?target=' + encodeURIComponent(String(target)) + '&fresh=' + (fresh ? 'true' : 'false'),
  );
});

app.get('/api/arbitrage/health', async (_req, res) => {
  return proxyArbitrageJson(res, '/health');
});

app.get('/api/arbitrage/config', async (_req, res) => {
  return proxyArbitrageJson(res, '/config');
});

app.get('/api/arbitrage/dex-scan', async (req, res) => {
  const rawTarget = Number(req.query.target || 25);
  const target = Number.isFinite(rawTarget) ? Math.max(5, Math.min(10000, rawTarget)) : 25;
  const fresh = String(req.query.fresh || 'false').toLowerCase() === 'true';
  return proxyArbitrageJson(
    res,
    '/dex-scan?target=' + encodeURIComponent(String(target)) + '&fresh=' + (fresh ? 'true' : 'false'),
  );
});

app.get('/api/arbitrage/treasury', async (_req, res) => {
  return proxyArbitrageJson(res, '/treasury');
});

// Display-only Hyperliquid EIP-712 approveAgent preview; no signing or exchange action.
app.get('/api/bots/hyperliquid-agent-signing-preview', async (req,res) => {
  const master=String(req.query.master || '');
  const agent=String(req.query.agent || '');
  const name=String(req.query.name || 'AURELIS');
  const nonce=String(req.query.nonce || '');
  if (!/^0x[a-fA-F0-9]{40}$/.test(master)
      || !/^0x[a-fA-F0-9]{40}$/.test(agent)
      || !/^[A-Za-z0-9_-]{1,16}$/.test(name)
      || !/^[0-9]{10,15}$/.test(nonce)
      || Number(nonce)>Number.MAX_SAFE_INTEGER) {
    return res.status(400).json({ok:false,error:'invalid_approval_preview'});
  }
  res.setHeader('Cache-Control','no-store');
  try {
    const qs=new URLSearchParams({master,agent,name,nonce});
    const upstream=await fetch('http://127.0.0.1:8895/hyperliquid-agent-signing-preview?'+qs,{signal:AbortSignal.timeout(10000)});
    res.status(upstream.status).type('application/json').send(await upstream.text());
  } catch {
    res.status(502).json({ok:false,error:'approval_preview_unavailable'});
  }
});

// Exchange-confirmed agent registry. Public read only, no signer or approvals.
app.get('/api/bots/hyperliquid-agent-registry', async (req,res) => {
  const master=String(req.query.master || '');
  const network=String(req.query.network || 'Testnet');
  if (!/^0x[a-fA-F0-9]{40}$/.test(master) || !['Testnet','Mainnet'].includes(network)) {
    return res.status(400).json({ok:false,error:'invalid_agent_registry'});
  }
  res.setHeader('Cache-Control','no-store');
  try {
    const upstream=await fetch('http://127.0.0.1:8895/hyperliquid-agent-registry?' + new URLSearchParams({master,network}),{signal:AbortSignal.timeout(12000)});
    res.status(upstream.status).type('application/json').send(await upstream.text());
  } catch {
    res.status(502).json({ok:false,error:'agent_registry_unavailable'});
  }
});

// Hyperliquid agent authorization checks only. No signature or exchange POST.
app.get('/api/bots/hyperliquid-agent-preflight', async (req,res) => {
  const bot=String(req.query.bot || 'hunter');
  const master=String(req.query.master || '');
  const agent=String(req.query.agent || '');
  if (!['hunter','trade_radar','signal_desk','live_bet','arbitrage','grid','dca'].includes(bot)
      || !/^0x[a-fA-F0-9]{40}$/.test(master)
      || (agent && !/^0x[a-fA-F0-9]{40}$/.test(agent))) {
    return res.status(400).json({ok:false,error:'invalid_agent_preflight'});
  }
  res.setHeader('Cache-Control','no-store');
  try {
    const params=new URLSearchParams({bot,master,asset:'BTC',side:'long',notional:'25',network:'Testnet'});
    if (agent) params.set('agent',agent);
    const upstream=await fetch('http://127.0.0.1:8895/hyperliquid-agent-preflight?'+params,{signal:AbortSignal.timeout(10000)});
    res.status(upstream.status).type('application/json').send(await upstream.text());
  } catch {
    res.status(502).json({ok:false,error:'agent_preflight_unavailable'});
  }
});

// Public Hyperliquid account state, no wallet signing and no trading rights.
app.get('/api/bots/hyperliquid-account', async (req,res) => {
  const wallet=String(req.query.wallet || '');
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) return res.status(400).json({ok:false,error:'invalid_wallet_address'});
  res.setHeader('Cache-Control','no-store');
  try {
    const upstream=await fetch('http://127.0.0.1:8895/hyperliquid-account-observation?'+new URLSearchParams({wallet}),{signal:AbortSignal.timeout(18000)});
    res.status(upstream.status).type('application/json').send(await upstream.text());
  } catch {
    res.status(502).json({ok:false,error:'account_observation_unavailable'});
  }
});

// Lighter public account discovery. Read-only; no signing, orders or account keys.
app.get('/api/bots/lighter-accounts', async (req,res) => {
  const wallet=String(req.query.wallet || '');
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) return res.status(400).json({ok:false,error:'invalid_wallet_address'});
  res.setHeader('Cache-Control','no-store');
  try {
    const url='https://mainnet.zklighter.elliot.ai/api/v1/accountsByL1Address?'+new URLSearchParams({l1_address:wallet});
    const upstream=await fetch(url,{signal:AbortSignal.timeout(10000),headers:{Accept:'application/json'}});
    if (!upstream.ok) return res.status(502).json({ok:false,error:'lighter_upstream_unavailable'});
    const raw=await upstream.json();
    if (!raw || !Array.isArray(raw.sub_accounts) || (raw.l1_address && String(raw.l1_address).toLowerCase()!==wallet.toLowerCase()))
      return res.status(502).json({ok:false,error:'lighter_account_response_invalid'});
    const indices=raw.sub_accounts.map((a:any)=>Number(a?.index)).filter((n:number)=>Number.isSafeInteger(n)&&n>=0);
    if (indices.length!==raw.sub_accounts.length) return res.status(502).json({ok:false,error:'lighter_account_index_invalid'});
    res.json({ok:true,wallet,accountIndices:indices,checkedAt:new Date().toISOString(),source:'public_l1_discovery'});
  } catch {
    res.status(502).json({ok:false,error:'lighter_account_discovery_unavailable'});
  }
});

// Hyperliquid signer readiness only; never requests signatures or submits orders.
app.get('/api/bots/hyperliquid-readiness', async (req, res) => {
  const bot = String(req.query.bot || 'hunter');
  const asset = String(req.query.asset || 'BTC').toUpperCase();
  const side = String(req.query.side || 'long');
  if (!['hunter','trade_radar','signal_desk','live_bet','arbitrage','grid','dca'].includes(bot)
      || !/^[A-Z0-9_-]{2,20}$/.test(asset)
      || !['long','short'].includes(side)) {
    return res.status(400).json({ok:false,error:'invalid_readiness'});
  }
  res.setHeader('Cache-Control','no-store');
  try {
    const qs = new URLSearchParams({bot,asset,side,notional:'25'});
    const upstream = await fetch('http://127.0.0.1:8895/hyperliquid-signer-readiness?' + qs, {signal:AbortSignal.timeout(10000)});
    res.status(upstream.status).type('application/json').send(await upstream.text());
  } catch {
    res.status(502).json({ok:false,error:'readiness_unavailable'});
  }
});

// Unsigned DEX venue intent. This endpoint cannot sign or submit a trade.
app.get('/api/bots/dex-intent', async (req, res) => {
  const bot = String(req.query.bot || 'hunter');
  const venue = String(req.query.venue || 'hyperliquid');
  const asset = String(req.query.asset || 'BTC').toUpperCase();
  const side = String(req.query.side || 'long');
  const notional = String(req.query.notional || '25');
  if (!['hunter','trade_radar','signal_desk','live_bet','arbitrage','grid','dca'].includes(bot)
      || !['hyperliquid','dydx','lighter','paradex','extended'].includes(venue)
      || !/^[A-Z0-9_-]{2,20}$/.test(asset)
      || !['long','short'].includes(side)
      || !/^(?:[0-9]+)(?:\.[0-9]+)?$/.test(notional)
      || Number(notional) <= 0 || Number(notional) > 100) {
    return res.status(400).json({ok:false,error:'invalid_dex_intent'});
  }
  res.setHeader('Cache-Control','no-store');
  try {
    const qs = new URLSearchParams({bot,venue,asset,side,notional});
    const upstream = await fetch('http://127.0.0.1:8895/paper-dex-intent?' + qs, {signal:AbortSignal.timeout(12000)});
    res.status(upstream.status).type('application/json').send(await upstream.text());
  } catch {
    res.status(502).json({ok:false,error:'dex_intent_unavailable'});
  }
});

// Non-executing DEX stop and leverage risk calculation.
app.get('/api/bots/paper-risk', async (req, res) => {
  const bot = String(req.query.bot || 'hunter');
  const venue = String(req.query.venue || 'hyperliquid');
  const asset = String(req.query.asset || 'BTC').toUpperCase();
  const side = String(req.query.side || 'long');
  const notional = String(req.query.notional || '25');
  const entry = String(req.query.entry || '');
  const stop = String(req.query.stop || '');
  const leverage = String(req.query.leverage || '2');
  if (!['hunter','trade_radar','signal_desk','live_bet','arbitrage','grid','dca'].includes(bot)
      || !['hyperliquid','dydx','lighter','paradex','extended'].includes(venue)
      || !/^[A-Z0-9_-]{2,20}$/.test(asset)
      || !['long','short'].includes(side)
      || ![notional,entry,stop,leverage].every(x => /^(?:[0-9]+)(?:\.[0-9]+)?$/.test(x))) {
    return res.status(400).json({ ok: false, error: 'invalid_paper_risk' });
  }
  res.setHeader('Cache-Control', 'no-store');
  try {
    const qs = new URLSearchParams({bot,venue,asset,side,notional,entry,stop,leverage});
    const response = await fetch('http://127.0.0.1:8895/paper-risk-review?' + qs, {signal: AbortSignal.timeout(10000)});
    res.status(response.status).type('application/json').send(await response.text());
  } catch {
    res.status(502).json({ ok: false, error: 'risk_service_unavailable' });
  }
});

// Conservative orderbook-imbalance observations; never exposes trading execution.
app.get('/api/bots/dex-strategy', async (req, res) => {
  const bot = String(req.query.bot || 'hunter');
  const asset = String(req.query.asset || 'BTC').toUpperCase();
  const side = String(req.query.side || 'long');
  if (!['hunter','trade_radar','signal_desk','live_bet','arbitrage','grid','dca'].includes(bot)
      || !/^[A-Z0-9_-]{2,20}$/.test(asset)
      || !['long','short'].includes(side)) {
    return res.status(400).json({ ok: false, error: 'invalid_strategy_request' });
  }
  res.setHeader('Cache-Control', 'no-store');
  try {
    const qs = new URLSearchParams({ bot, asset, side, notional: '25' });
    const upstream = await fetch('http://127.0.0.1:8895/paper-dex-strategy?' + qs, { signal: AbortSignal.timeout(30000) });
    res.status(upstream.status).type('application/json').send(await upstream.text());
  } catch {
    res.status(502).json({ ok: false, error: 'dex_strategy_unavailable' });
  }
});

// Read-only DEX risk review shared by every bot. Never forwards order instructions.
app.get('/api/bots/dex-assessment', async (req, res) => {
  const bot = String(req.query.bot || 'hunter');
  const asset = String(req.query.asset || 'BTC').toUpperCase();
  const side = String(req.query.side || 'long');
  const notional = String(req.query.notional || '25');
  if (!['hunter','trade_radar','signal_desk','live_bet','arbitrage','grid','dca'].includes(bot)
      || !/^[A-Z0-9_-]{2,20}$/.test(asset)
      || !['buy','sell','long','short'].includes(side)
      || !/^(?:[0-9]+)(?:\.[0-9]+)?$/.test(notional)
      || Number(notional) <= 0 || Number(notional) > 100) {
    return res.status(400).json({ ok: false, error: 'invalid_dex_assessment' });
  }
  res.setHeader('Cache-Control', 'no-store');
  try {
    const qs = new URLSearchParams({ bot, asset, side, notional });
    const upstream = await fetch('http://127.0.0.1:8895/paper-dex-assessment?' + qs, { signal: AbortSignal.timeout(30000) });
    res.status(upstream.status).type('application/json').send(await upstream.text());
  } catch {
    res.status(502).json({ ok: false, error: 'dex_assessment_unavailable' });
  }
});

// Bounded multi-asset DEX research for Hunter and Trade Radar, paper-only.
app.get('/api/bots/dex-batch', async (req, res) => {
  const bot = String(req.query.bot || 'hunter');
  const assets = String(req.query.assets || 'BTC,ETH,SOL');
  const side = String(req.query.side || 'long');
  if (!['hunter','trade_radar'].includes(bot) ||
      !/^[A-Z0-9_-]{2,20}(?:,[A-Z0-9_-]{2,20}){0,7}$/.test(assets) ||
      !['long','short'].includes(side)) {
    return res.status(400).json({ ok: false, error: 'invalid_dex_batch' });
  }
  res.setHeader('Cache-Control', 'no-store');
  try {
    const qs = new URLSearchParams({ bot, assets, side, notional: '25' });
    const upstream = await fetch('http://127.0.0.1:8895/paper-dex-batch?' + qs, { signal: AbortSignal.timeout(35000) });
    res.status(upstream.status).type('application/json').send(await upstream.text());
  } catch {
    res.status(502).json({ ok: false, error: 'dex_batch_unavailable' });
  }
});

// Isolated paper-only DEX routing for all seven bots; never proxies to live order endpoints.
app.get('/api/bots/dex-route', async (req, res) => {
  const bot = String(req.query.bot || 'hunter');
  const asset = String(req.query.asset || 'BTC').toUpperCase();
  const side = String(req.query.side || 'long');
  const notional = String(req.query.notional || '25');
  if (!['hunter','trade_radar','signal_desk','live_bet','arbitrage','grid','dca'].includes(bot)
      || !/^[A-Z0-9_-]{2,20}$/.test(asset)
      || !['buy','sell','long','short'].includes(side)
      || !/^(?:[0-9]+)(?:\.[0-9]+)?$/.test(notional)
      || Number(notional) <= 0 || Number(notional) > 100) {
    return res.status(400).json({ ok: false, error: 'invalid_paper_route' });
  }
  res.setHeader('Cache-Control', 'no-store');
  try {
    const qs = new URLSearchParams({ bot, asset, side, notional });
    const upstream = await fetch('http://127.0.0.1:8895/paper-dex-route?' + qs, { signal: AbortSignal.timeout(30000) });
    res.status(upstream.status).type('application/json').send(await upstream.text());
  } catch {
    res.status(502).json({ ok: false, error: 'dex_paper_router_unavailable' });
  }
});

app.get('/api/kraken/ohlc/:asset', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const asset = String(req.params.asset || '').trim().toUpperCase();
    const symbol = asset === 'BTC' ? 'XBT' : asset;
    const intervalRaw = Number(req.query.interval || 5);
    const allowed = new Set([1, 5, 15, 30, 60, 240]);
    const interval = allowed.has(intervalRaw) ? intervalRaw : 5;
    const pair = symbol + 'USD';
    const response = await fetch('https://api.kraken.com/0/public/OHLC?pair=' + encodeURIComponent(pair) + '&interval=' + interval);
    const body: any = await response.json();
    if (!response.ok || !body || (Array.isArray(body.error) && body.error.length)) {
      return res.status(502).json({ ok: false, error: 'kraken_ohlc_unavailable', detail: body?.error || response.statusText });
    }
    const result = body.result || {};
    const key = Object.keys(result).find((k) => k !== 'last');
    const rows = key ? result[key] : [];
    const bars = (Array.isArray(rows) ? rows : []).slice(-120).map((r: any[]) => ({
      time: Number(r[0]),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      vwap: Number(r[5]),
      volume: Number(r[6]),
      count: Number(r[7]),
    }));
    return res.json({ ok: true, asset, pair: key || pair, interval, bars, last: result.last || null });
  } catch (error: any) {
    return res.status(502).json({ ok: false, error: 'kraken_ohlc_unavailable', detail: error?.message || String(error) });
  }
});


app.get('/api/signal-desk/deep/:asset', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const asset = String(req.params.asset || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{2,12}$/.test(asset)) return res.status(400).json({ ok:false, error:'invalid_asset' });
    const base = asset === 'BTC' ? 'XBT' : asset;
    const pair = base + 'USD';
    const clamp = (v:number, lo=0, hi=100) => Math.max(lo, Math.min(hi, v));
    const ema = (vals:number[], period:number) => {
      if (!vals.length) return 0;
      const k=2/(period+1); let out=vals[0];
      for (let i=1;i<vals.length;i++) out=vals[i]*k+out*(1-k);
      return out;
    };
    const rsi = (vals:number[], period=14) => {
      if (vals.length < period+1) return 50;
      let up=0, down=0;
      for (let i=vals.length-period;i<vals.length;i++){ const d=vals[i]-vals[i-1]; if(d>0)up+=d; else down-=d; }
      if (down===0) return 100;
      const rs=(up/period)/(down/period); return 100-(100/(1+rs));
    };
    const atr = (bars:any[], period=14) => {
      if (bars.length < 2) return 0;
      const trs:number[]=[];
      for(let i=1;i<bars.length;i++){ const h=+bars[i][2],l=+bars[i][3],pc=+bars[i-1][4]; trs.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc))); }
      const tail=trs.slice(-period); return tail.reduce((a,b)=>a+b,0)/Math.max(1,tail.length);
    };
    const getJson = async (url:string) => {
      const r=await fetch(url,{headers:{Accept:'application/json'}});
      const j:any=await r.json();
      if(!r.ok || (Array.isArray(j?.error)&&j.error.length)) throw new Error(j?.error?.join(',')||r.statusText);
      return j?.result||{};
    };
    const intervals=[1,5,15,60,240];
    const [ohlcs,depthRes,tradesRes,tickerRes]=await Promise.all([
      Promise.all(intervals.map(async interval => {
        const result=await getJson('https://api.kraken.com/0/public/OHLC?pair='+encodeURIComponent(pair)+'&interval='+interval);
        const key=Object.keys(result).find(k=>k!=='last');
        return {interval, rows:key && Array.isArray(result[key]) ? result[key].slice(-120) : []};
      })),
      getJson('https://api.kraken.com/0/public/Depth?pair='+encodeURIComponent(pair)+'&count=25'),
      getJson('https://api.kraken.com/0/public/Trades?pair='+encodeURIComponent(pair)),
      getJson('https://api.kraken.com/0/public/Ticker?pair='+encodeURIComponent(pair)),
    ]);
    const tf:any={}; let directionVotes=0;
    for (const item of ohlcs) {
      const closes=item.rows.map((r:any[])=>Number(r[4])).filter(Number.isFinite);
      const volumes=item.rows.map((r:any[])=>Number(r[6])).filter(Number.isFinite);
      const last=closes.at(-1)||0, e20=ema(closes.slice(-60),20), e50=ema(closes.slice(-100),50);
      const rr=rsi(closes,14), aa=atr(item.rows,14);
      const volNow=volumes.at(-1)||0, volAvg=volumes.slice(-20).reduce((a:number,b:number)=>a+b,0)/Math.max(1,volumes.slice(-20).length);
      const mom=closes.length>4 && closes.at(-4) ? (last/(closes.at(-4) as number)-1)*100 : 0;
      const trend = last>e20 && e20>e50 ? 1 : last<e20 && e20<e50 ? -1 : 0;
      const weight = item.interval>=60 ? 2 : 1;
      directionVotes += trend*weight;
      tf[item.interval]={last,ema20:e20,ema50:e50,rsi:rr,atr:aa,volumeRatio:volAvg?volNow/volAvg:1,momentumPct:mom,trend};
    }
    const direction = directionVotes>0 ? 'LONG' : directionVotes<0 ? 'SHORT' : ((tf[5]?.momentumPct||0)>=0?'LONG':'SHORT');
    const depthKey=Object.keys(depthRes)[0], book=depthKey?depthRes[depthKey]:{};
    const bids=(book?.bids||[]).slice(0,20), asks=(book?.asks||[]).slice(0,20);
    const bidNotional=bids.reduce((a:number,r:any[])=>a+Number(r[0])*Number(r[1]),0);
    const askNotional=asks.reduce((a:number,r:any[])=>a+Number(r[0])*Number(r[1]),0);
    const bookImbalance=(bidNotional-askNotional)/Math.max(1,bidNotional+askNotional);
    const tradesKey=Object.keys(tradesRes).find(k=>k!=='last'), trades=(tradesKey?tradesRes[tradesKey]:[]).slice(-150);
    let buy=0,sell=0;
    for(const t of trades){ const notional=Number(t[0])*Number(t[1]); if(String(t[3]).toLowerCase()==='b') buy+=notional; else sell+=notional; }
    const tapeImbalance=(buy-sell)/Math.max(1,buy+sell);
    const tickerKey=Object.keys(tickerRes)[0], ticker=tickerKey?tickerRes[tickerKey]:{};
    const bid=Number(ticker?.b?.[0]||0), ask=Number(ticker?.a?.[0]||0), spreadBps=bid&&ask?((ask-bid)/((ask+bid)/2))*10000:0;
    const current=Number(ticker?.c?.[0]||tf[5]?.last||0);
    const alignedTfs=intervals.filter(i=>tf[i]?.trend===(direction==='LONG'?1:-1)).length;
    const oppositeTfs=intervals.filter(i=>tf[i]?.trend===(direction==='LONG'?-1:1)).length;
    const structure=clamp(38 + alignedTfs*12 - oppositeTfs*9 + Math.min(12,Math.abs(directionVotes)*2));
    const flowSign=direction==='LONG'?1:-1;
    const flow=clamp(50 + flowSign*tapeImbalance*32 + flowSign*bookImbalance*24 - Math.min(12,spreadBps*1.5));
    const five=tf[5]||tf[1]||{};
    const stretched = direction==='LONG' ? Math.max(0,(five.rsi||50)-68) : Math.max(0,32-(five.rsi||50));
    const timing=clamp(54 + flowSign*(five.momentumPct||0)*16 + Math.min(12,(five.volumeRatio||1)*5) - stretched*1.6);
    const atrPct=current?((five.atr||0)/current)*100:0;
    const risk=clamp(82 - Math.min(38,atrPct*16) - Math.max(0,spreadBps-2)*2);
    const stopDist=Math.max((five.atr||0)*1.6,current*0.006);
    const targetDist=stopDist*2.15;
    const stop=direction==='LONG'?current-stopDist:current+stopDist;
    const target=direction==='LONG'?current+targetDist:current-targetDist;
    const rr=targetDist/Math.max(1e-9,stopDist);
    const payoff=clamp(50 + (rr-1)*24 - Math.min(15,spreadBps*1.2));
    const contradictions:string[]=[];
    if(direction==='LONG' && tapeImbalance < -0.12) contradictions.push('Aggressive sellers are fighting the long thesis.');
    if(direction==='SHORT' && tapeImbalance > 0.12) contradictions.push('Aggressive buyers are fighting the short thesis.');
    if(direction==='LONG' && bookImbalance < -0.15) contradictions.push('Offer-side depth is heavier than bids.');
    if(direction==='SHORT' && bookImbalance > 0.15) contradictions.push('Bid-side depth is heavier than offers.');
    if(oppositeTfs>=2) contradictions.push(oppositeTfs+' higher/lower timeframes oppose the selected direction.');
    if((five.volumeRatio||1)<0.55) contradictions.push('Current volume is too light for strong confirmation.');
    if(stretched>0) contradictions.push('Short-term momentum is stretched; entry timing is vulnerable.');
    const setup=clamp(structure*.45 + flow*.25 + risk*.15 + payoff*.15);
    const contradictionPenalty=Math.min(28,contradictions.length*7);
    const readiness=clamp(setup*.28 + timing*.24 + flow*.22 + risk*.12 + payoff*.14 - contradictionPenalty);
    const label=readiness>=80?'READY':readiness>=68?'NEAR READY':readiness>=55?'DEVELOPING':'WAIT';
    const reasons=[
      alignedTfs+' of 5 timeframes align '+direction+'.',
      'Live tape imbalance '+(tapeImbalance>=0?'+':'')+(tapeImbalance*100).toFixed(1)+'%.',
      'Order-book imbalance '+(bookImbalance>=0?'+':'')+(bookImbalance*100).toFixed(1)+'%.',
      '5m volume '+Number(five.volumeRatio||1).toFixed(2)+'x its recent average.',
      'Net planned reward/risk '+rr.toFixed(2)+'.',
    ];
    const waitFor = readiness>=68 ? 'Conditions are executable if price remains near the reviewed entry.' :
      direction==='LONG' ? 'Wait for stronger buyer flow and a 5m hold above EMA20.' :
      'Wait for stronger seller flow and a 5m rejection below EMA20.';
    return res.json({ok:true,asset,pair:tickerKey||pair,direction,label,readiness:+readiness.toFixed(1),scores:{
      setup:+setup.toFixed(1),structure:+structure.toFixed(1),timing:+timing.toFixed(1),flow:+flow.toFixed(1),risk:+risk.toFixed(1),payoff:+payoff.toFixed(1)
    }, levels:{entry:current,stop,target,rr:+rr.toFixed(2)}, micro:{tapeImbalance,bookImbalance,spreadBps,buyNotional:buy,sellNotional:sell},
      timeframes:tf,reasons,contradictions,waitFor,generatedAt:Date.now()});
  } catch (error:any) {
    return res.status(502).json({ok:false,error:'signal_desk_deep_unavailable',detail:error?.message||String(error)});
  }
});

app.get('/api/kraken/balances', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const key = process.env.KRAKEN_SPOT_API_KEY || process.env.KRAKEN_API_KEY || '';
  const secret = process.env.KRAKEN_SPOT_API_SECRET || process.env.KRAKEN_API_SECRET || '';
  if (!key || !secret) return res.status(409).json({ ok: false, error: 'kraken_not_configured' });

  try {
    const pathName = '/0/private/Balance';
    const nonce = String(Date.now() * 1000);
    const postData = new URLSearchParams({ nonce }).toString();
    const hash = crypto.createHash('sha256').update(nonce + postData).digest();
    const signature = crypto.createHmac('sha512', Buffer.from(secret, 'base64'))
      .update(Buffer.concat([Buffer.from(pathName), hash]))
      .digest('base64');

    const upstream = await fetch('https://api.kraken.com' + pathName, {
      method: 'POST',
      headers: {
        'API-Key': key,
        'API-Sign': signature,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: postData,
    });
    const body: any = await upstream.json();
    if (!upstream.ok || (Array.isArray(body?.error) && body.error.length)) {
      return res.status(502).json({ ok: false, error: 'kraken_balance_unavailable', detail: body?.error || upstream.statusText });
    }

    const aliases: Record<string,string> = {
      ZUSD: 'USD', USD: 'USD', XXBT: 'BTC', XBT: 'BTC', BTC: 'BTC',
      XETH: 'ETH', ETH: 'ETH', XXRP: 'XRP', XRP: 'XRP',
      SOL: 'SOL', DOT: 'DOT', ADA: 'ADA', LINK: 'LINK', LTC: 'LTC',
      USDC: 'USDC', USDT: 'USDT',
    };
    const balances = Object.entries(body?.result || {})
      .map(([asset, raw]) => ({ asset: aliases[asset] || asset.replace(/^[XZ]/, ''), amount: Number(raw || 0) }))
      .filter((row) => Number.isFinite(row.amount) && Math.abs(row.amount) > 0)
      .sort((a,b) => (a.asset === 'USD' ? -1 : b.asset === 'USD' ? 1 : b.amount - a.amount));

    return res.json({ ok: true, balances, updatedAt: new Date().toISOString() });
  } catch (error: any) {
    return res.status(502).json({ ok: false, error: 'kraken_balance_unavailable', detail: error?.message || String(error) });
  }
});

app.get('/api/kraken/margin-info/:asset', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const asset = String(req.params.asset || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!asset) return res.status(400).json({ ok: false, error: 'invalid_asset' });
  try {
    const pairsResp = await fetch('https://api.kraken.com/0/public/AssetPairs', { headers: { Accept: 'application/json' } });
    const body: any = await pairsResp.json();
    const entries = Object.entries(body?.result || {}) as [string, any][];
    const match = entries.find(([id, row]) => {
      const alt = String(row?.altname || id).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const ws = String(row?.wsname || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      return alt === asset + 'USD' || ws === asset + 'USD';
    });
    if (!match) return res.status(404).json({ ok: false, error: 'kraken_pair_not_found' });
    const [pairId, pair] = match;
    const buy = (pair?.leverage_buy || []).map(Number).filter((x:number)=>Number.isFinite(x)&&x>0);
    const sell = (pair?.leverage_sell || []).map(Number).filter((x:number)=>Number.isFinite(x)&&x>0);
    return res.json({ ok: true, asset, symbol: pair?.altname || pairId, buy, sell });
  } catch (error:any) {
    return res.status(502).json({ ok: false, error: 'kraken_margin_info_unavailable', detail: error?.message || String(error) });
  }
});

app.get('/api/kraken/futures', async (_req, res) => {
  try {
    const upstream = await fetch('https://futures.kraken.com/derivatives/api/v3/tickers', {
      headers: { Accept: 'application/json' },
    });
    const data: any = await upstream.json();
    const tickers = (Array.isArray(data?.tickers) ? data.tickers : [])
      .filter((item: any) => item?.tag === 'perpetual' && String(item?.pair || '').endsWith(':USD'))
      .map((item: any) => {
        const rawAsset = String(item.pair || '').split(':')[0];
        const asset = rawAsset === 'XBT' ? 'BTC' : rawAsset;
        return {
          symbol: String(item.symbol || ''),
          pair: String(item.pair || ''),
          asset,
          markPrice: Number(item.markPrice || item.last || 0),
          indexPrice: Number(item.indexPrice || 0),
          bid: Number(item.bid || 0),
          ask: Number(item.ask || 0),
          volumeQuote: Number(item.volumeQuote || 0),
          openInterest: Number(item.openInterest || 0),
          fundingRate: Number(item.fundingRate || 0),
          fundingRatePrediction: Number(item.fundingRatePrediction || 0),
          change24h: Number(item.change24h || 0),
        };
      })
      .filter((item: any) => item.asset && item.markPrice > 0)
      .sort((a: any, b: any) => b.volumeQuote - a.volumeQuote);

    res.setHeader('Cache-Control', 'no-store');
    return res.json({ ok: true, provider: 'KRAKEN_FUTURES', tickers, timestamp: Date.now() });
  } catch (error: any) {
    return res.status(502).json({ ok: false, error: 'kraken_futures_unavailable', detail: error?.message || String(error) });
  }
});

const KRAKEN_FLOW_PAIRS: Record<string, string> = {
  BTC:'XXBTZUSD',ETH:'XETHZUSD',SOL:'SOLUSD',XRP:'XXRPZUSD',DOGE:'XDGUSD',
  AVAX:'tAXUSD',LINK:'LINKUSD',ADA:'ADAUSD',SUI:'SUIUSD',DOT:'DOTUSD',
  NEAR:'NEARUSD',UNI:'UNIUSD',LTC:'XLTCZUSD',ATOM:'ATOMUSD',POL:'POLUSD',
  ICP:'ICPUSD',SHIB:'SHIBUSD',PEPE:'PEPEUSD',AAVE:'AAVEUSD',APT:'APTUSD',
  ARB:'ARBUSD',RENDER:'RENDERUSD',INJ:'INJUSD',OP:'OPUSD',TIA:'TIAUSD',
  FET:'FETUSD',TAO:'TAOUSD',ALGO:'ALGOUSD',XLM:'XXLMZUSD',ETC:'XETCZUSD',FIL:'FILUSD'
};
type MarketFlowRow={symbol:string;trades:number;buyTrades:number;sellTrades:number;buyNotional:number;sellNotional:number;buySharePct:number;netBuyNotional:number;windowMinutes:number;};
async function fetchKrakenMarketFlow(symbols:string[],windowMinutes=15):Promise<MarketFlowRow[]>{
 const cutoff=Date.now()/1000-windowMinutes*60;
 const unique=[...new Set(symbols.map(s=>String(s||'').toUpperCase()))].filter(s=>KRAKEN_FLOW_PAIRS[s]).slice(0,12);
 const rows=await Promise.all(unique.map(async(symbol):Promise<MarketFlowRow|null>=>{
  try{
   const pair=KRAKEN_FLOW_PAIRS[symbol]; const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),3500);
   const response=await fetch('https://api.kraken.com/0/public/Trades?pair='+encodeURIComponent(pair),{signal:controller.signal,headers:{Accept:'application/json'}});
   clearTimeout(timer); if(!response.ok)return null; const data:any=await response.json(); const result=data?.result||{};
   const key=Object.keys(result).find(k=>k!=='last'); const trades:any[]=key&&Array.isArray(result[key])?result[key]:[];
   let buyTrades=0,sellTrades=0,buyNotional=0,sellNotional=0;
   for(const trade of trades){const price=Number(trade?.[0]||0),volume=Number(trade?.[1]||0),ts=Number(trade?.[2]||0),side=String(trade?.[3]||''); if(!price||!volume||ts<cutoff)continue; const n=price*volume; if(side==='b'){buyTrades++;buyNotional+=n}else if(side==='s'){sellTrades++;sellNotional+=n}}
   const count=buyTrades+sellTrades;if(!count)return null;const total=buyNotional+sellNotional;
   return {symbol,trades:count,buyTrades,sellTrades,buyNotional,sellNotional,buySharePct:total>0?(buyNotional/total)*100:0,netBuyNotional:buyNotional-sellNotional,windowMinutes};
  }catch{return null}
 }));
 return rows.filter((r):r is MarketFlowRow=>Boolean(r)).sort((a,b)=>(b.buySharePct+Math.log10(Math.max(1,b.buyNotional)))-(a.buySharePct+Math.log10(Math.max(1,a.buyNotional))));
}
async function lookupLiveCryptoPrice(query: string) {
  const cleaned = String(query || '').trim().replace(/^\$/, '');
  if (!cleaned) return null;
  const upper = cleaned.toUpperCase();

  const krakenAliases: Record<string, string> = {
    BTC: 'XBTUSD',
    XBT: 'XBTUSD',
    DOGE: 'XDGUSD',
  };
  const krakenPair = krakenAliases[upper] || upper + 'USD';
  try {
    const tickerResponse = await fetch(
      'https://api.kraken.com/0/public/Ticker?pair=' + encodeURIComponent(krakenPair),
      { headers: { Accept: 'application/json' } },
    );
    if (tickerResponse.ok) {
      const tickerData: any = await tickerResponse.json();
      const result = tickerData?.result || {};
      const row: any = result[Object.keys(result)[0]];
      const price = Number(row?.c?.[0]);
      const open24h = Number(row?.o);
      if (Number.isFinite(price) && price > 0) {
        return {
          id: upper.toLowerCase(),
          symbol: upper === 'XBT' ? 'BTC' : upper,
          name: upper,
          price,
          change24h:
            Number.isFinite(open24h) && open24h > 0
              ? ((price - open24h) / open24h) * 100
              : NaN,
          marketCap: NaN,
          source: 'Kraken',
        };
      }
    }
  } catch {}

  try {
    const searchResponse = await fetch(
      'https://api.coingecko.com/api/v3/search?query=' + encodeURIComponent(cleaned),
      { headers: { Accept: 'application/json' } },
    );
    if (!searchResponse.ok) return null;
    const searchData: any = await searchResponse.json();
    const candidates = Array.isArray(searchData?.coins) ? searchData.coins : [];
    const match =
      candidates.find((x: any) => String(x?.symbol || '').toUpperCase() === upper) ||
      candidates.find((x: any) => String(x?.name || '').toLowerCase() === cleaned.toLowerCase()) ||
      candidates[0];
    if (!match?.id) return null;

    const marketResponse = await fetch(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=' +
        encodeURIComponent(String(match.id)) +
        '&price_change_percentage=24h',
      { headers: { Accept: 'application/json' } },
    );
    if (!marketResponse.ok) return null;
    const rows: any = await marketResponse.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || !Number.isFinite(Number(row.current_price))) return null;
    return {
      id: String(row.id || match.id),
      symbol: String(row.symbol || match.symbol || cleaned).toUpperCase(),
      name: String(row.name || match.name || cleaned),
      price: Number(row.current_price),
      change24h: Number(row.price_change_percentage_24h),
      marketCap: Number(row.market_cap),
      source: 'CoinGecko',
    };
  } catch {
    return null;
  }
}

function extractPriceLookupSymbol(message: string) {
  const text = String(message || '').trim();
  const patterns = [
    /\b(?:what(?:'s| is)?|whats)\s+(?:the\s+)?([a-z0-9]{2,12})\s+price\b/i,
    /\bprice\s+(?:of|for)\s+([a-z0-9]{2,12})\b/i,
    /^\$?([a-z0-9]{2,12})\s+price\??$/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}


function formatAaveAgentReply(result: any, message: string): string {
  if (!result) return '';
  if (!result.ok) return result.message || 'Aave data is unavailable right now.';

  if (result.kind === 'position') {
    const summary = result.summary?.data?.v4 || result.summary?.data?.v3 || {};
    const hf = summary?.lowestHealthFactor ?? summary?.healthFactor ?? null;
    const lines = [
      '**Aave position**',
      `• Supplied: **$${Number(summary?.totalSuppliedUsd || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}**`,
      `• Debt: **$${Number(summary?.totalDebtUsd || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}**`,
      `• Net worth: **$${Number(summary?.netWorthUsd || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}**`,
    ];
    if (hf !== null && hf !== undefined) lines.push(`• Lowest health factor: **${Number(hf).toFixed(2)}**`);
    return lines.join('\n');
  }

  if (result.kind === 'markets') {
    const data = result.markets?.data || {};
    const rows: any[] = [];
    for (const version of ['v4', 'v3']) {
      const section = data?.[version];
      for (const market of section?.markets || []) {
        if (version === 'v4') rows.push({ ...market, version });
        else for (const reserve of market?.reserves || []) rows.push({ ...reserve, version, chainId: market?.chainId });
      }
    }
    const wantsBorrow = /borrow|borrow rate/i.test(message);
    const requestedSymbols = ['USDC','USDT','DAI','GHO','ETH','WETH','WBTC','BTC','LINK','UNI','LDO','CRV','USDE','PYUSD','EURC']
      .filter((sym) => new RegExp('\\b' + sym + '\\b', 'i').test(message));
    const marketRows = requestedSymbols.length
      ? rows.filter((r: any) => requestedSymbols.includes(String(r?.symbol || '').toUpperCase()))
      : rows;
    marketRows.sort((a, b) => {
      const av = Number(wantsBorrow ? a?.borrowApyPct ?? a?.variableBorrowApy ?? 999 : a?.supplyApyPct ?? a?.supplyApy ?? 0);
      const bv = Number(wantsBorrow ? b?.borrowApyPct ?? b?.variableBorrowApy ?? 999 : b?.supplyApyPct ?? b?.supplyApy ?? 0);
      return wantsBorrow ? av - bv : bv - av;
    });
    const top = marketRows.slice(0, 5);
    if (!top.length) return 'Aave returned no matching markets for that request.';
    return [
      `**Aave ${wantsBorrow ? 'borrow' : 'supply'} markets**`,
      ...top.map((r: any) => {
        const apy = Number(wantsBorrow ? r?.borrowApyPct ?? r?.variableBorrowApy ?? 0 : r?.supplyApyPct ?? r?.supplyApy ?? 0);
        const where = [r?.symbol, r?.spoke || r?.marketName, r?.hub, r?.chainId ? `chain ${r.chainId}` : null].filter(Boolean).join(' · ');
        return `• ${where}: **${apy.toFixed(2)}% APY**`;
      }),
    ].join('\n');
  }

  if (result.kind === 'reserve_selection_required') {
    const rows = Array.isArray(result.candidates) ? result.candidates.slice(0, 6) : [];
    return [
      `I found **${result.candidates?.length || 0}** valid Aave reserves for that ${result.action} request, so I did not guess which one to use.`,
      ...rows.map((r: any) => `• ${r.symbol || result.requested?.symbol} · ${r.spoke || r.marketName || 'market'} · chain ${r.chainId} · supply ${Number(r.supplyApyPct || 0).toFixed(2)}% · borrow ${Number(r.borrowApyPct || 0).toFixed(2)}%`),
      'Specify the chain/spoke you want before simulation or preparation.',
    ].join('\n');
  }

  if (result.kind === 'position_selection_required') {
    return result.message || 'Aave positions are loaded, but the exact reserve must be selected before withdraw/repay.';
  }

  if (result.kind === 'preview_action') {
    return `Aave simulated the **${result.requested?.action || 'action'}** successfully. Nothing was submitted or signed.`;
  }

  if (result.kind === 'prepared_action') {
    return `Aave built the **unsigned ${result.requested?.action || 'action'} transaction** after simulation. Nothing was signed or submitted; the wallet still has to review and sign it.`;
  }

  return result.message || 'Aave data loaded successfully.';
}

const AI_SWAP_GAS_RPCS: Record<string,string> = {
  ethereum: 'https://ethereum-rpc.publicnode.com',
  base: 'https://mainnet.base.org',
  arbitrum: 'https://arb1.arbitrum.io/rpc',
};

app.get('/api/wallet/native-gas-reserve', async (req, res) => {
  res.setHeader('Cache-Control','no-store');
  const chain = String(req.query.chain || '').toLowerCase();
  const rpc = AI_SWAP_GAS_RPCS[chain];
  if (!rpc) return res.status(400).json({ ok:false, error:'unsupported_chain' });
  try {
    const response = await fetch(rpc, {
      method:'POST',
      headers:{'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_gasPrice',params:[]}),
    });
    const body:any = await response.json();
    const gasPrice = /^0x[0-9a-f]+$/i.test(String(body?.result || '')) ? BigInt(body.result) : 0n;
    if (gasPrice <= 0n) throw new Error('gas_price_unavailable');
    const gasUnits = chain === 'ethereum' ? 50000n : 100000n;
    const reserveWei = gasPrice * gasUnits * 125n / 100n;
    return res.json({ ok:true, chain, reserveEth:Number(reserveWei) / 1e18, gasPriceWei:String(gasPrice), gasUnits:Number(gasUnits) });
  } catch (error:any) {
    return res.status(502).json({ ok:false, error:'gas_reserve_unavailable', detail:error?.message || String(error) });
  }
});

function parseAiWalletSwapIntent(message:string, universe:any[] = []) {
  const text = String(message || '').trim();
  if (!/(swap|convert|exchange|trade|move|consolidate|put)/i.test(text)) return null;
  if (!/(\ball\b|\bmax\b|everything)/i.test(text)) return null;

  const sourceMatch =
    text.match(/\ball\s+(?:of\s+)?(?:the\s+|my\s+)?([A-Za-z0-9]{2,12})\b/i) ||
    text.match(/\bmax(?:imum)?\s+(?:of\s+)?(?:the\s+|my\s+)?([A-Za-z0-9]{2,12})\b/i);
  if (!sourceMatch) return null;
  const sourceSymbol = String(sourceMatch[1] || '').toUpperCase();

  const chainMatch = text.match(/\bon\s+(base|ethereum|mainnet|arbitrum|arb|optimism|polygon)\b/i);
  const chainRaw = String(chainMatch?.[1] || '').toLowerCase();
  const targetChain =
    chainRaw === 'mainnet' ? 'ethereum' :
    chainRaw === 'arb' ? 'arbitrum' :
    chainRaw || null;

  const targetMatches = [...text.matchAll(/\b(?:to|into|for)\s+(?:all\s+of\s+)?(?:my\s+)?([A-Za-z0-9]{2,12})\b/gi)];
  let targetSymbol = String(targetMatches.at(-1)?.[1] || '').toUpperCase();
  const known = new Set([
    'BTC','ETH','USDC','USDT','SOL','XRP','TAO','NEAR','AAVE','LINK','AVAX','ADA','SUI','AERO',
    ...universe.map((x:any)=>String(x?.symbol||'').toUpperCase()).filter(Boolean),
  ]);
  if (targetChain && (!targetSymbol || !known.has(targetSymbol)) && /\b(move|consolidate|put)\b/i.test(text)) {
    targetSymbol = sourceSymbol;
  }
  if (!targetSymbol || !known.has(targetSymbol) || (targetSymbol === sourceSymbol && !targetChain)) {
    return { kind:'swap_target_required', sourceSymbol };
  }

  return {
    kind:'swap_plan',
    sourceSymbol,
    targetSymbol,
    targetChain,
    amountMode:'all_spendable',
    requiresReview:true,
  };
}

// Use the existing AURELIS AI service rather than the bundled demo/Gemini path.
app.post('/api/ai-chat', async (req, res) => {
  try {
    const message=String(req.body?.message||'');
    const universe=Array.isArray(req.body?.marketUniverse)?req.body.marketUniverse.filter((x:any)=>x&&typeof x.symbol==='string').sort((a:any,b:any)=>Number(b.volume24h||0)-Number(a.volume24h||0)):[];
    const swapIntent = parseAiWalletSwapIntent(message, universe);
    if (swapIntent?.kind === 'swap_target_required') {
      return res.json({
        ok:true,
        engine:'aurelis-wallet-actions',
        reply:`I can prepare that. Tell me which asset you want to convert all spendable ${swapIntent.sourceSymbol} into, for example USDC, BTC, or SOL. Nothing will be submitted until you review it.`,
        action:swapIntent,
        timestamp:Date.now(),
      });
    }
    if (swapIntent?.kind === 'swap_plan') {
      return res.json({
        ok:true,
        engine:'aurelis-wallet-actions',
        reply:`I prepared an all-spendable ${swapIntent.sourceSymbol} → ${swapIntent.targetSymbol}${swapIntent.targetChain ? ` on ${swapIntent.targetChain}` : ''} swap plan. I’ll send each chain balance to Trade & Swap as a separate leg and keep final wallet approval required.`,
        action:swapIntent,
        timestamp:Date.now(),
      });
    }
    try {
      const walletAddress = getVerifiedWalletAddress(req, res);
      const aaveResult = await runAaveAgentQuery(message, walletAddress);
      if (aaveResult) {
        return res.json({
          ok: true,
          engine: 'aurelis-aave-mcp',
          reply: formatAaveAgentReply(aaveResult, message),
          aave: aaveResult,
          timestamp: Date.now(),
        });
      }
    } catch (error: any) {
      return res.status(502).json({
        ok: false,
        engine: 'aurelis-aave-mcp',
        error: 'aave_mcp_unavailable',
        reply: error?.message || 'Aave MCP is unavailable right now.',
      });
    }
    const priceLookupSymbol = extractPriceLookupSymbol(message);
    if (priceLookupSymbol) {
      const live = await lookupLiveCryptoPrice(priceLookupSymbol);
      if (live) {
        const priceText = live.price >= 1
          ? live.price.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 })
          : '$' + live.price.toLocaleString(undefined, { maximumSignificantDigits: 6 });
        const changeText = Number.isFinite(live.change24h)
          ? `${live.change24h >= 0 ? '+' : ''}${live.change24h.toFixed(2)}%`
          : 'N/A';
        return res.json({
          ok: true,
          engine: 'aurelis-live-price',
          reply: `**${live.name} (${live.symbol})** is **${priceText}** right now.\n\n24h: **${changeText}**`,
          asset: live,
          timestamp: Date.now(),
        });
      }
    }
    const flowSymbols=universe.length?universe.map((x:any)=>String(x.symbol).toUpperCase()):['BTC','ETH','SOL','XRP','DOGE','TAO','ADA','AVAX','LINK','SUI','NEAR','AAVE'];
    const asksFlow=/most\s+bought|buy(?:ing)?\s+pressure|buyers?|order\s*flow|net\s+buy|buy\s*side/i.test(message);
    let flowRows:MarketFlowRow[]=[];
    if(asksFlow){
      flowRows=await fetchKrakenMarketFlow(flowSymbols,15);
      if (flowRows.length) {
        const top = flowRows[0];
        const next = flowRows.slice(1, 4);
        const nextText = next.length
          ? `\n\nNext strongest: ${next.map((r) => `${r.symbol} ${r.buySharePct.toFixed(1)}% buy share`).join(' · ')}`
          : '';
        const reply =
          `Among the tracked Kraken USD markets over the last ${top.windowMinutes} minutes, **${top.symbol}** has the strongest current buying pressure in the sample.\n\n` +
          `• Buy share: **${top.buySharePct.toFixed(1)}%** of traded notional\n` +
          `• Net buy notional: **${top.netBuyNotional >= 0 ? '+' : '-'}$${Math.abs(top.netBuyNotional).toLocaleString(undefined, { maximumFractionDigits: 0 })}**\n` +
          `• Recent trades sampled: **${top.trades}** (${top.buyTrades} buyer-initiated / ${top.sellTrades} seller-initiated)` +
          nextText +
          `\n\nThis measures recent exchange trade flow, not total purchases across every exchange.`;
        return res.json({
          ok: true,
          engine: 'aurelis-market-flow',
          reply,
          marketFlow: flowRows.slice(0, 8),
          timestamp: Date.now(),
        });
      }
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      const ai = new GoogleGenAI({ apiKey });
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: message,
          config: {
            systemInstruction: 'You are AURELIS AI, a concise crypto market and wallet assistant. Use the supplied market context when relevant. Never claim to have executed a transaction unless the application explicitly confirms it.',
            temperature: 0.25,
          },
        });
        const reply = response.text || '';
        if (reply) return res.json({ ok: true, reply, engine: 'gemini-3.5-flash', timestamp: Date.now() });
      } catch {}
    }
    const fallback = generateLocalAiChatResponse({
      message,
      coinSymbol: req.body?.coinSymbol || universe[0]?.symbol || 'BTC',
      coinName: req.body?.coinName || universe[0]?.name || 'Bitcoin',
      currentPrice: Number(req.body?.currentPrice || universe[0]?.price || 0),
      change24h: Number(req.body?.change24h || universe[0]?.change24h || 0),
      timeframe: req.body?.timeframe || '1H',
      rsi: req.body?.rsi,
      ema20: req.body?.ema20,
    });
    return res.json({ ok: true, reply: fallback, engine: 'local', timestamp: Date.now() });
  } catch (error: any) {
    return res.status(502).json({
      ok: false,
      error: 'aurelis_ai_unavailable',
      reply: error?.message || 'AURELIS AI backend unavailable',
    });
  }
});

// Helper: Algorithmic Technical Fallback Engine when Gemini API quota (429) is exceeded
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
  quotaExceeded = false,
}: {
  coinSymbol: string;
  coinName: string;
  currentPrice: number;
  change24h: number;
  high24h?: number;
  low24h?: number;
  volume24h?: number;
  rsi?: number;
  ema20?: number;
  ema50?: number;
  mode: 'sentiment' | 'chart-deep';
  quotaExceeded?: boolean;
}) {
  const rsiVal = rsi !== undefined ? Number(rsi) : 50;
  const price = currentPrice ? Number(currentPrice) : 0;
  const ema20Val = ema20 ? Number(ema20) : price;
  const ema50Val = ema50 ? Number(ema50) : price;

  let bullishPoints = 0;
  let bearishPoints = 0;

  // Price vs EMA-20
  if (price > ema20Val) bullishPoints += 1.5;
  else bearishPoints += 1.5;

  // EMA-20 vs EMA-50 (Golden / Death trend)
  if (ema20Val >= ema50Val) bullishPoints += 1;
  else bearishPoints += 1;

  // 24h change momentum
  if (change24h > 1.5) bullishPoints += 1.5;
  else if (change24h < -1.5) bearishPoints += 1.5;
  else if (change24h > 0) bullishPoints += 0.5;
  else bearishPoints += 0.5;

  // RSI Momentum
  if (rsiVal >= 52 && rsiVal <= 68) bullishPoints += 1.5;
  else if (rsiVal > 70) bearishPoints += 1; // Overbought
  else if (rsiVal <= 48 && rsiVal >= 32) bearishPoints += 1.5;
  else if (rsiVal < 30) bullishPoints += 1; // Oversold relief

  let sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let confidence = 65;

  if (bullishPoints >= bearishPoints + 1.5) {
    sentiment = 'BULLISH';
    confidence = Math.min(88, 65 + Math.round((bullishPoints - bearishPoints) * 5));
  } else if (bearishPoints >= bullishPoints + 1.5) {
    sentiment = 'BEARISH';
    confidence = Math.min(88, 65 + Math.round((bearishPoints - bullishPoints) * 5));
  } else {
    sentiment = 'NEUTRAL';
    confidence = 60;
  }

  const resTarget = high24h && high24h > price ? high24h : Number((price * 1.035).toFixed(2));
  const supTarget = low24h && low24h < price ? low24h : Number((price * 0.965).toFixed(2));

  const quotaNotice = quotaExceeded
    ? `[QUOTA ADVISORY: Gemini API free quota limit (429) was reached. Analysis generated seamlessly by Aurelis Algorithmic Indicator Engine.]\n\n`
    : '';

  if (mode === 'chart-deep') {
    const analysis = `${quotaNotice}1. BIAS: ${sentiment === 'BULLISH' ? 'BULLISH (LONG)' : sentiment === 'BEARISH' ? 'BEARISH (SHORT)' : 'NEUTRAL (CONSOLIDATION)'}
2. CONFIDENCE: ${confidence}%
3. KEY LEVELS:
   - Immediate Resistance / Target: $${Number(resTarget).toLocaleString()}
   - Key Support / Invalidation Stop: $${Number(supTarget).toLocaleString()}
4. TECHNICAL SIGNALS:
   - RSI(14) is at ${rsiVal}, indicating ${rsiVal > 70 ? 'overbought conditions with high retracement probability' : rsiVal < 30 ? 'oversold exhaustion with upside mean-reversion potential' : rsiVal >= 50 ? 'bullish momentum sustaining above the 50 median' : 'bearish momentum pressing below the 50 median'}.
   - Price is currently ${price >= ema20Val ? 'holding ABOVE' : 'submerged BELOW'} the EMA-20 ($${Number(ema20Val).toLocaleString()}).
   - Moving average structure shows ${ema20Val >= ema50Val ? 'bullish EMA-20/50 alignment supporting continuation' : 'bearish EMA-20/50 compression exerting downward pressure'}.
5. MARKET CATALYST & SUMMARY:
   ${coinSymbol} trades at $${Number(price).toLocaleString()} (${change24h >= 0 ? '+' : ''}${change24h}% 24h). ${sentiment === 'BULLISH' ? `Long setups offer favorable risk-to-reward targeting $${Number(resTarget).toLocaleString()} with invalidation below $${Number(supTarget).toLocaleString()}.` : sentiment === 'BEARISH' ? `High selling friction favors defensive Short setups or waiting for a confirmed bounce at support near $${Number(supTarget).toLocaleString()}.` : `Chop zone detected. Recommend awaiting a clear breakout confirmation before committing directional capital.`}`;

    return {
      coinSymbol,
      coinName,
      sentiment,
      analysis,
      sources: [],
      timestamp: Date.now(),
      engine: 'algorithmic-indicator',
      quotaExceeded: !!quotaExceeded,
    };
  } else {
    const analysis = `${quotaNotice}1. SENTIMENT: ${sentiment}
2. SUMMARY: ${coinSymbol} displays a ${sentiment.toLowerCase()} technical setup with RSI at ${rsiVal} and price ${price >= ema20Val ? 'holding above' : 'slumping below'} the EMA-20 ($${Number(ema20Val).toLocaleString()}). ${sentiment === 'BULLISH' ? `Upside continuation toward $${Number(resTarget).toLocaleString()} holds higher statistical probability while $${Number(supTarget).toLocaleString()} holds.` : sentiment === 'BEARISH' ? `Caution advised; elevated downside risks targeting $${Number(supTarget).toLocaleString()}.` : `Consolidation phase detected; monitor for volume expansion before entry.`}`;

    return {
      coinSymbol,
      coinName,
      sentiment,
      analysis,
      sources: [],
      timestamp: Date.now(),
      engine: 'algorithmic-indicator',
      quotaExceeded: !!quotaExceeded,
    };
  }
}

// Gemini AI Market & Live Chart Analysis endpoint
app.post('/api/ai/analyze-market', async (req, res) => {
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
    mode = 'sentiment', // 'sentiment' | 'chart-deep'
  } = req.body;

  const coinSymbol = (coin?.symbol || 'BTC').toUpperCase();
  const coinName = coin?.name || coinSymbol;
  const priceStr = currentPrice ? `$${Number(currentPrice).toLocaleString()}` : 'N/A';
  const changeStr = change24h !== undefined ? `${change24h >= 0 ? '+' : ''}${change24h}%` : 'N/A';

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // If no key is set yet, gracefully serve the algorithmic technical analysis
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
      quotaExceeded: false,
    });
    return res.json(report);
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Prepare sampled chart points
  const recentPoints = Array.isArray(points) ? points.slice(-20) : [];
  const pointsSummary = recentPoints.map((p: any) => `${p.time || ''}:${p.price?.toFixed(2) || p.price}`).join(', ');

  // System instruction: rigorous technical analysis + Google Search web grounding
  const systemPrompt = `You are the Aurelis Cybernetic Crypto Market Intelligence Engine.
You provide precise, objective technical analysis, momentum assessment, and clear trading bias (BULLISH vs BEARISH vs NEUTRAL) for cryptocurrency assets.
Ground your reasoning in both the technical indicators provided and live crypto market search data.
Be concise, clear, and professional. Avoid conversational fluff. Return structured information.`;

  const userPrompt = mode === 'chart-deep'
    ? `Conduct a deep technical and live price action analysis for ${coinName} (${coinSymbol}/USD).
Current Live Data:
- Live Price: ${priceStr}
- 24h Change: ${changeStr}
- 24h Range: High ${high24h ? '$' + high24h : 'N/A'} / Low ${low24h ? '$' + low24h : 'N/A'}
- 24h Volume: ${volume24h ? '$' + Number(volume24h).toLocaleString() : 'N/A'}
- Active Timeframe: ${timeframe || '1H'}
- Calculated RSI (14-period): ${rsi !== undefined ? rsi : 'N/A'}
- EMA 20: ${ema20 ? '$' + ema20 : 'N/A'} | EMA 50: ${ema50 ? '$' + ema50 : 'N/A'}
- Recent Close Price Trajectory: [${pointsSummary}]

Use Google Search to cross-reference current live market conditions, breaking news, macroeconomic sentiment, or liquidation levels for ${coinSymbol}.
Answer in this structured format:
1. BIAS: State either "BULLISH (LONG)", "BEARISH (SHORT)", or "NEUTRAL (CONSOLIDATION)".
2. CONFIDENCE: Give a percentage between 50% and 95%.
3. KEY LEVELS:
   - Immediate Resistance / Target
   - Key Support / Invalidation Stop
4. TECHNICAL SIGNALS: Summarize what RSI, EMA crossover/alignment, and price structure indicate.
5. MARKET CATALYST & SUMMARY: 2 to 3 sentences explaining the primary driver and whether a Long or Short setup offers higher statistical probability.`
    : `Provide a quick market sentiment and direction report for ${coinName} (${coinSymbol}/USD).
Live Stats:
- Price: ${priceStr} (${changeStr})
- Timeframe: ${timeframe || '1H'}
- RSI: ${rsi !== undefined ? rsi : 'N/A'}
- EMA-20 vs Price: ${ema20 ? (currentPrice > ema20 ? 'Above EMA-20' : 'Below EMA-20') : 'N/A'}

Search for any breaking crypto market drivers or sentiment for ${coinSymbol}.
Provide:
1. SENTIMENT: "BULLISH" or "BEARISH" or "NEUTRAL"
2. SUMMARY: 2-3 concise sentences stating if market structure leans Long or Short, key trigger to watch, and risk note.`;

  // Attempt models in order:
  // 1. Try with googleSearch on active models: gemini-3.6-flash, gemini-3.5-flash, gemini-3.8-flash
  // 2. If googleSearch quota is exhausted (429), try models directly without tools (Gemini model quota is active and free!)
  const searchAttempts = [
    'gemini-3.5-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash',
  ];

  const directAttempts = [
    'gemini-3.5-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash',
  ];

  // Try with Google Search tool first
  for (const modelName of searchAttempts) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          tools: [{ googleSearch: {} }],
          temperature: 0.2,
        },
      });

      const analysisText = response.text || '';
      if (!analysisText) continue;

      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const searchSources = groundingChunks
        .map((chunk: any) => {
          if (chunk?.web?.uri) {
            return {
              title: chunk.web.title || 'Market Source',
              uri: chunk.web.uri,
            };
          }
          return null;
        })
        .filter(Boolean)
        .slice(0, 4);

      let sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
      const upperText = analysisText.toUpperCase();
      if (upperText.includes('BULLISH')) sentiment = 'BULLISH';
      else if (upperText.includes('BEARISH')) sentiment = 'BEARISH';

      return res.json({
        coinSymbol,
        coinName,
        sentiment,
        analysis: analysisText,
        sources: searchSources,
        timestamp: Date.now(),
        engine: 'gemini',
        modelUsed: `${modelName} + Google Search`,
      });
    } catch (err: any) {
      console.warn(`Search attempt with ${modelName} failed (${err?.status || err?.message})`);
    }
  }

  // If search failed (e.g. Google Search tool quota limit reached), run Gemini directly with the rich technical indicators provided
  for (const modelName of directAttempts) {
    try {
      const directPrompt = mode === 'chart-deep'
        ? `Conduct a deep technical analysis for ${coinName} (${coinSymbol}/USD).
Current Live Indicator & Price Action Data:
- Live Price: ${priceStr}
- 24h Change: ${changeStr}
- 24h Range: High ${high24h ? '$' + high24h : 'N/A'} / Low ${low24h ? '$' + low24h : 'N/A'}
- 24h Volume: ${volume24h ? '$' + Number(volume24h).toLocaleString() : 'N/A'}
- Active Timeframe: ${timeframe || '1H'}
- Calculated RSI (14-period): ${rsi !== undefined ? rsi : 'N/A'}
- EMA 20: ${ema20 ? '$' + ema20 : 'N/A'} | EMA 50: ${ema50 ? '$' + ema50 : 'N/A'}
- Recent Close Price Trajectory: [${pointsSummary}]

Answer in this structured format:
1. BIAS: State either "BULLISH (LONG)", "BEARISH (SHORT)", or "NEUTRAL (CONSOLIDATION)".
2. CONFIDENCE: Give a percentage between 50% and 95%.
3. KEY LEVELS:
   - Immediate Resistance / Target
   - Key Support / Invalidation Stop
4. TECHNICAL SIGNALS: Summarize what RSI, EMA crossover/alignment, and price structure indicate.
5. MARKET CATALYST & SUMMARY: 2 to 3 sentences explaining the primary driver and whether a Long or Short setup offers higher statistical probability.`
        : `Provide a quick market sentiment and direction report for ${coinName} (${coinSymbol}/USD).
Live Stats:
- Price: ${priceStr} (${changeStr})
- Timeframe: ${timeframe || '1H'}
- RSI: ${rsi !== undefined ? rsi : 'N/A'}
- EMA-20: ${ema20 ? '$' + ema20 : 'N/A'}
- EMA-20 vs Price: ${ema20 ? (currentPrice > ema20 ? 'Above EMA-20' : 'Below EMA-20') : 'N/A'}

Provide:
1. SENTIMENT: "BULLISH" or "BEARISH" or "NEUTRAL"
2. SUMMARY: 2-3 concise sentences stating if market structure leans Long or Short, key trigger to watch, and risk note.`;

      const response = await ai.models.generateContent({
        model: modelName,
        contents: directPrompt,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.2,
        },
      });

      const analysisText = response.text || '';
      if (!analysisText) continue;

      let sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
      const upperText = analysisText.toUpperCase();
      if (upperText.includes('BULLISH')) sentiment = 'BULLISH';
      else if (upperText.includes('BEARISH')) sentiment = 'BEARISH';

      return res.json({
        coinSymbol,
        coinName,
        sentiment,
        analysis: analysisText,
        sources: [],
        timestamp: Date.now(),
        engine: 'gemini',
        modelUsed: modelName,
      });
    } catch (err: any) {
      console.warn(`Direct attempt with ${modelName} failed (${err?.status || err?.message})`);
    }
  }

  // If all Gemini attempts failed or quota (429) was exhausted, fall back to our Algorithmic Technical Engine
  console.warn('All Gemini API attempts hit quota or failed. Falling back to Algorithmic Technical Engine.');
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
    quotaExceeded: true,
  });

  return res.json(fallbackReport);
});

// Helper: Algorithmic fallback chat response when Gemini quota is unavailable
function generateLocalAiChatResponse({
  message,
  coinSymbol,
  coinName,
  currentPrice,
  change24h,
  timeframe,
  rsi,
  ema20,
}: {
  message: string;
  coinSymbol?: string;
  coinName?: string;
  currentPrice?: number;
  change24h?: number;
  timeframe?: string;
  rsi?: number;
  ema20?: number;
}): string {
  const sym = coinSymbol || 'BTC';
  const name = coinName || 'Crypto';
  const priceStr = currentPrice ? `$${Number(currentPrice).toLocaleString()}` : '$64,500';
  const chgStr = change24h !== undefined ? `${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%` : '+2.4%';
  const tf = timeframe || '1H';
  const rsiVal = rsi !== undefined ? Number(rsi) : 52;
  const isBullish = (change24h || 0) >= 0;

  const lowerMsg = message.toLowerCase();

  if (lowerMsg.includes('target') || lowerMsg.includes('price') || lowerMsg.includes('predict') || lowerMsg.includes('where')) {
    const res = currentPrice ? (currentPrice * 1.045).toFixed(2) : 'Higher';
    const sup = currentPrice ? (currentPrice * 0.965).toFixed(2) : 'Lower';
    return `Based on current ${tf} momentum for ${name} (${sym} @ ${priceStr}, 24h: ${chgStr}):

• Primary Technical Target: $${res} (+4.5% upper band)
• Critical Invalidation / Support: $${sup} (-3.5% lower boundary)
• Momentum Bias: ${isBullish ? 'BULLISH continuation with volume confirmation' : 'BEARISH pull-back consolidation'}
• Indicator Confluence: RSI is hovering at ${rsiVal} (${rsiVal > 70 ? 'overbought cooling' : rsiVal < 30 ? 'oversold relief' : 'neutral-to-bullish zone'}).

Actionable Note: Watch orderbook liquidity absorption around immediate resistance before adding leverage.`;
  }

  if (lowerMsg.includes('buy') || lowerMsg.includes('sell') || lowerMsg.includes('long') || lowerMsg.includes('short')) {
    return `${sym} Market Structure Analysis:
• Current Price: ${priceStr} (${chgStr} 24h)
• Relative Strength (RSI 14): ${rsiVal}
• Short-term EMA-20: ${ema20 ? `$${ema20}` : 'Holding key dynamic support'}

Statistical Setup:
${isBullish
  ? 'Long bias offers favorable risk-to-reward on dips toward key support. Trailing stops recommended.'
  : 'Cautious stance: wait for confirmed bullish candle close before opening new long exposure.'}

Risk Note: Always maintain strict position sizing according to your portfolio risk parameters.`;
  }

  return `Aurelis Market Intelligence on ${name} (${sym}):
• Current Price: ${priceStr} (${chgStr} over 24h)
• Active Timeframe: ${tf}
• Market State: ${isBullish ? 'Upward structural trending' : 'Consolidation / Pullback'}

Regarding "${message}":
Market depth indicates active liquidity clustered around the current range. Technical indicators show ${rsiVal >= 50 ? 'bullish momentum intact with buyers defending dips' : 'cautious sideways accumulation'}. Key level to watch is immediate breakout confirmation above the 24h volume weighted average price.`;
}

// POST /api/ai-chat - Interactive AI Market Intelligence Assistant
app.post('/api/ai-chat', async (req, res) => {
  const {
    message,
    coinSymbol = 'BTC',
    coinName = 'Bitcoin',
    currentPrice,
    change24h,
    timeframe = '1H',
    rsi,
    ema20,
    ema50,
    history = [],
  } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const fallback = generateLocalAiChatResponse({
      message,
      coinSymbol,
      coinName,
      currentPrice,
      change24h,
      timeframe,
      rsi,
      ema20,
    });
    return res.json({ reply: fallback, sources: [], engine: 'local' });
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const systemPrompt = `You are Aurelis AI, the elite cybernetic cryptocurrency trading and market intelligence copilot.
You assist traders with technical analysis, price target projections, risk management, support/resistance levels, and breaking crypto catalyst context.
Active Asset: ${coinName} (${coinSymbol})
Current Live Price: $${currentPrice || 'N/A'} (24h Change: ${change24h !== undefined ? change24h + '%' : 'N/A'})
Active Timeframe: ${timeframe}
RSI (14): ${rsi !== undefined ? rsi : 'N/A'} | EMA-20: ${ema20 || 'N/A'} | EMA-50: ${ema50 || 'N/A'}

Guidelines:
- Deliver direct, high-value, crisp insights without fluff.
- Use clear bullet points and bold headers when quoting price targets or support/resistance levels.
- Always include an objective bias (Bullish, Bearish, or Neutral) and key invalidation price.`;

  const chatAttempts = [
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash',
  ];

  for (const modelName of chatAttempts) {
    try {
      // 3.5s timeout wrapper
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI generation timeout')), 3500)
      );

      const generatePromise = ai.models.generateContent({
        model: modelName,
        contents: [
          ...history.slice(-4).map((h: any) => ({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.text }],
          })),
          {
            role: 'user',
            parts: [{ text: message }],
          },
        ],
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.3,
        },
      });

      const response: any = await Promise.race([generatePromise, timeoutPromise]);

      const replyText = response.text || '';
      if (replyText) {
        return res.json({
          reply: replyText,
          sources: [],
          engine: 'gemini',
          modelUsed: modelName,
          timestamp: Date.now(),
        });
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      console.warn(`AI chat attempt with ${modelName} failed (${errMsg})`);
      // If quota exhausted (429), break immediately to avoid waiting through all retries
      if (err?.status === 429 || errMsg.includes('quota') || errMsg.includes('resource_exhausted')) {
        break;
      }
    }
  }

  // Fallback if quota reached or timed out
  const fallback = generateLocalAiChatResponse({
    message,
    coinSymbol,
    coinName,
    currentPrice,
    change24h,
    timeframe,
    rsi,
    ema20,
  });
  return res.json({ reply: fallback, sources: [], engine: 'local' });
});

// Vite Middleware for development vs Static files in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        host,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(port, host, () => {
    console.log(`Server running at http://${host}:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

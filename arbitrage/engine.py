from pathlib import Path
import base64, json, time, tomllib
from itertools import permutations
from concurrent.futures import ThreadPoolExecutor
import requests, ccxt
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

ROOT=Path("/opt/aurelis/arbitrage")
LEGACY=Path("/home/ubuntu/_archive/aurelis-web-app-legacy-20260929/.env")
TOOBIT_CFG=Path("/home/ubuntu/.toobit/config.toml")
KALSHI_HOST="https://external-api.kalshi.com"

ASSETS=("BTC","ETH","SOL")
SYMBOLS={
 "kraken":{"BTC":"BTC/USD","ETH":"ETH/USD","SOL":"SOL/USD"},
 "toobit":{"BTC":"BTC/USDC:USDC","ETH":"ETH/USDC:USDC","SOL":"SOL/USDC:USDC"},
 "okx":{"BTC":"BTC/USDT:USDT","ETH":"ETH/USDT:USDT","SOL":"SOL/USDT:USDT"},
 "kalshi":{"BTC":"KXBTCPERP","ETH":"KXETHPERP","SOL":"KXSOLPERP"},
}

def read_env(path):
 out={}
 if not path.exists(): return out
 for line in path.read_text(errors="ignore").splitlines():
  if "=" in line and not line.lstrip().startswith("#"):
   k,v=line.split("=",1); out[k.strip()]=v.strip().strip('"').strip("'")
 return out

NEW=read_env(ROOT/".env")
OLD=read_env(LEGACY)
CFG=json.loads((ROOT/"config.json").read_text())

def kraken():
 return ccxt.kraken({"apiKey":OLD.get("KRAKEN_API_KEY",""),"secret":OLD.get("KRAKEN_API_SECRET",""),"enableRateLimit":True,"timeout":15000})

def toobit():
 raw=tomllib.loads(TOOBIT_CFG.read_text())
 p=(raw.get("profiles") or {}).get(raw.get("default_profile","default")) or {}
 return ccxt.toobit({"apiKey":p.get("api_key",""),"secret":p.get("secret_key",""),"enableRateLimit":True,"timeout":15000})

def okx():
 return ccxt.okx({"apiKey":NEW.get("OKX_API_KEY",""),"secret":NEW.get("OKX_API_SECRET",""),"password":NEW.get("OKX_API_PASSPHRASE",""),"hostname":"us.okx.com","enableRateLimit":True,"timeout":15000})

def kalshi_headers(method,path):
 key=serialization.load_pem_private_key(Path(OLD["AURELIS_KALSHI_PRIVATE_KEY_PATH"]).read_bytes(),password=None)
 ts=str(int(time.time()*1000))
 sig=key.sign((ts+method+path).encode(),padding.PSS(mgf=padding.MGF1(hashes.SHA256()),salt_length=padding.PSS.DIGEST_LENGTH),hashes.SHA256())
 return {"KALSHI-ACCESS-KEY":OLD["AURELIS_KALSHI_API_KEY_ID"],"KALSHI-ACCESS-SIGNATURE":base64.b64encode(sig).decode(),"KALSHI-ACCESS-TIMESTAMP":ts}

def kalshi_get(path,auth=False,params=None):
 h=kalshi_headers("GET",path) if auth else {}
 r=requests.get(KALSHI_HOST+path,headers=h,params=params,timeout=15)
 r.raise_for_status()
 return r.json()

def stable_rates():
 ex=ccxt.kraken({"enableRateLimit":True,"timeout":15000})
 out={"USD":1.0,"USDC":1.0,"USDT":1.0}
 for coin,sym in (("USDC","USDC/USD"),("USDT","USDT/USD")):
  try:
   t=ex.fetch_ticker(sym)
   bid=float(t.get("bid") or 0); ask=float(t.get("ask") or 0)
   if bid and ask: out[coin]=(bid+ask)/2
  except Exception: pass
 return out

def vwap_cex(levels,target_usd,quote_to_usd):
 remain=target_usd; usd=0.0; base=0.0
 for price,amount,*_ in levels:
  p=float(price)*quote_to_usd; a=float(amount)
  if p<=0 or a<=0: continue
  take=min(a,remain/p)
  usd+=take*p; base+=take; remain-=take*p
  if remain<=1e-8: break
 if usd < target_usd*0.995 or base<=0: return None
 return usd/base

def vwap_kalshi(levels,target_usd,contract_size):
 remain=target_usd; usd=0.0; underlying=0.0
 for price,contracts,*_ in levels:
  p=float(price); n=float(contracts)
  if p<=0 or n<=0: continue
  take=min(n,remain/p)
  usd+=take*p; underlying+=take*contract_size; remain-=take*p
  if remain<=1e-8: break
 if usd < target_usd*0.995 or underlying<=0: return None
 return usd/underlying

def collateral_status(target):
 needed=target*(1+float(CFG.get("balance_buffer_pct",20))/100)
 out={}
 # Kraken USD
 try:
  b=kraken().fetch_balance()
  free=float((b.get("free") or {}).get("USD") or 0)
  out["kraken"]={"ready":free>=needed,"freeCollateralUsd":round(free,2)}
 except Exception as e: out["kraken"]={"ready":False,"error":type(e).__name__}
 # Toobit USDC/USDT futures/unified
 try:
  ex=toobit()
  try: b=ex.fetch_balance({"type":"swap"})
  except Exception: b=ex.fetch_balance()
  f=b.get("free") or {}
  free=float(f.get("USDC") or 0)+float(f.get("USDT") or 0)
  out["toobit"]={"ready":free>=needed,"freeCollateralUsd":round(free,2)}
 except Exception as e: out["toobit"]={"ready":False,"error":type(e).__name__}
 # OKX US stable collateral
 try:
  ex=okx()
  try: b=ex.fetch_balance({"type":"swap"})
  except Exception: b=ex.fetch_balance()
  f=b.get("free") or {}
  free=float(f.get("USDC") or 0)+float(f.get("USDT") or 0)+float(f.get("USD") or 0)
  out["okx"]={"ready":free>=needed,"freeCollateralUsd":round(free,2)}
 except Exception as e: out["okx"]={"ready":False,"error":type(e).__name__}
 # Kalshi margin available balance
 try:
  j=kalshi_get("/trade-api/v2/margin/balance",True)
  free=sum(float(x.get("available_balance") or 0) for x in j.get("subaccount_balances",[]))
  out["kalshi"]={"ready":free>=needed,"freeCollateralUsd":round(free,2)}
 except Exception as e: out["kalshi"]={"ready":False,"error":type(e).__name__}
 return out

def collect_quotes(target=25.0):
 rates=stable_rates()
 quotes={a:{} for a in ASSETS}
 fees={v:{} for v in ("kraken","toobit","okx","kalshi")}
 cexes={"kraken":kraken(),"toobit":toobit(),"okx":okx()}
 quote_ccy={"kraken":"USD","toobit":"USDC","okx":"USDT"}
 for venue,ex in cexes.items():
  ex.load_markets()
  for asset in ASSETS:
   sym=SYMBOLS[venue][asset]
   try:
    ob=ex.fetch_order_book(sym,50)
    asks=sorted(ob.get("asks") or [],key=lambda x:float(x[0]))
    bids=sorted(ob.get("bids") or [],key=lambda x:float(x[0]),reverse=True)
    qrate=rates[quote_ccy[venue]]
    ask=vwap_cex(asks,target,qrate); bid=vwap_cex(bids,target,qrate)
    m=ex.market(sym); taker=float(m.get("taker") or 0.001)
    quotes[asset][venue]={"bid":bid,"ask":ask,"symbol":sym}
    fees[venue][asset]=taker
   except Exception as e:
    quotes[asset][venue]={"error":type(e).__name__,"symbol":sym}
 # Kalshi
 markets=kalshi_get("/trade-api/v2/margin/markets",False,{"status":"active"}).get("markets",[])
 by={m.get("ticker"):m for m in markets}
 try:
  kfees=kalshi_get("/trade-api/v2/margin/fee_tiers",True).get("taker_fee_rates",{})
 except Exception: kfees={}
 for asset in ASSETS:
  t=SYMBOLS["kalshi"][asset]; m=by.get(t) or {}
  try:
   cs=float(m.get("contract_size") or 0)
   ob=kalshi_get(f"/trade-api/v2/margin/markets/{t}/orderbook",False,{"depth":50}).get("orderbook",{})
   asks=sorted(ob.get("asks") or [],key=lambda x:float(x[0]))
   bids=sorted(ob.get("bids") or [],key=lambda x:float(x[0]),reverse=True)
   quotes[asset]["kalshi"]={"bid":vwap_kalshi(bids,target,cs),"ask":vwap_kalshi(asks,target,cs),"symbol":t}
   fees["kalshi"][asset]=float(kfees.get(t) or 0.0012)
  except Exception as e:
   quotes[asset]["kalshi"]={"error":type(e).__name__,"symbol":t}
 return quotes,fees,rates

def scan(target=None):
 target=float(target or CFG.get("max_notional_per_leg_usd",25))
 with ThreadPoolExecutor(max_workers=2) as pool:
  balance_future=pool.submit(collateral_status,target)
  quote_future=pool.submit(collect_quotes,target)
  balances=balance_future.result()
  quotes,fees,rates=quote_future.result()
 opps=[]
 venues=CFG["scanner_venues"]
 for asset in ASSETS:
  for long_v,short_v in permutations(venues,2):
   l=quotes[asset].get(long_v) or {}; s=quotes[asset].get(short_v) or {}
   ask=l.get("ask"); bid=s.get("bid")
   if not ask or not bid: continue
   gross=(bid-ask)/ask*100
   roundtrip_fee=2*(fees[long_v].get(asset,0.001)+fees[short_v].get(asset,0.001))*100
   net=gross-roundtrip_fee
   executable=bool(balances.get(long_v,{}).get("ready") and balances.get(short_v,{}).get("ready") and net>=float(CFG["min_net_spread_pct"]))
   opps.append({
    "asset":asset,"longVenue":long_v,"shortVenue":short_v,
    "longAskUsd":round(ask,6),"shortBidUsd":round(bid,6),
    "grossSpreadPct":round(gross,4),"roundTripFeePct":round(roundtrip_fee,4),
    "netSpreadBeforeFundingPct":round(net,4),"targetNotionalPerLegUsd":target,
    "funded":bool(balances.get(long_v,{}).get("ready") and balances.get(short_v,{}).get("ready")),
    "executable":executable
   })
 opps.sort(key=lambda x:x["netSpreadBeforeFundingPct"],reverse=True)
 return {"mode":"paper" if CFG.get("paper_mode",True) else "live","targetNotionalPerLegUsd":target,"minNetSpreadPct":CFG["min_net_spread_pct"],"balances":balances,"stablecoinUsdRates":rates,"quotes":quotes,"opportunities":opps,"warning":"Net spread currently includes depth/slippage and taker fees, but not funding or Kraken margin borrow cost. Live trading remains disabled."}

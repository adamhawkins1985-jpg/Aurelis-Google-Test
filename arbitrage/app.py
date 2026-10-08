import time
from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse, FileResponse
from engine import CFG, scan
from dex_engine import scan_dex, TREASURY
from wallet_agent import onekey_status

app=FastAPI(title="AURELIS Arbitrage",version="0.1.0")
_cache={"at":0.0,"target":None,"data":None}
_dex_cache={"at":0.0,"target":None,"data":None}

@app.get("/")
def dashboard():
 return FileResponse("/opt/aurelis/arbitrage/index.html")

@app.get("/health")
def health():
 return {"ok":True,"service":"aurelis-arbitrage","paperMode":bool(CFG.get("paper_mode",True)),"liveTradingEnabled":bool(CFG.get("live_trading_enabled",False))}

@app.get("/config")
def config():
 return {
  "executionVenues":CFG["execution_venues"],
  "scannerVenues":CFG["scanner_venues"],
  "paperMode":CFG.get("paper_mode",True),
  "liveTradingEnabled":CFG.get("live_trading_enabled",False),
  "maxNotionalPerLegUsd":CFG.get("max_notional_per_leg_usd",25),
  "minNetSpreadPct":CFG.get("min_net_spread_pct",0.4),
  "skipUnfunded":CFG.get("skip_unfunded_venues",True),
  "fallbackToNextPair":CFG.get("fallback_to_next_pair",True),
 }

@app.get("/scan")
def run_scan(target:float=Query(default=25,ge=5,le=10000),fresh:bool=False):
 now=time.time()
 if not fresh and _cache["data"] is not None and _cache["target"]==target and now-_cache["at"]<10:
  return _cache["data"]
 try:
  data=scan(target)
  _cache.update({"at":time.time(),"target":target,"data":data})
  return data
 except Exception as e:
  return JSONResponse(status_code=502,content={"ok":False,"error":type(e).__name__})

@app.get("/status")
def status():
 data=run_scan(float(CFG.get("max_notional_per_leg_usd",25)),False)
 if isinstance(data,JSONResponse): return data
 ready=[k for k,v in data["balances"].items() if v.get("ready")]
 top=data["opportunities"][0] if data["opportunities"] else None
 return {"ok":True,"mode":data["mode"],"readyVenues":ready,"readyVenueCount":len(ready),"topOpportunity":top}

@app.get("/dex-scan")
def dex_scan(target:float=Query(default=25,ge=5,le=10000),fresh:bool=False):
 now=time.time()
 if not fresh and _dex_cache["data"] is not None and _dex_cache["target"]==target and now-_dex_cache["at"]<5:
  return _dex_cache["data"]
 try:
  data=scan_dex(target)
  _dex_cache.update({"at":time.time(),"target":target,"data":data})
  return data
 except Exception as e:
  return JSONResponse(status_code=502,content={"ok":False,"error":type(e).__name__})

@app.get("/treasury")
def treasury_status():
 wallet=onekey_status()
 return {
  "mode": TREASURY.get("mode"),
  "signerProvider": TREASURY.get("signer_provider"),
  "walletSessionConfigured": bool(wallet.get("authenticated")),
  "authStatus": wallet.get("authStatus"),
  "loginMethod": wallet.get("loginMethod"),
  "walletKind": wallet.get("walletKind"),
  "walletAddress": wallet.get("displayAddress"),
  "storageBackend": wallet.get("storageBackend"),
  "hasSecrets": bool(wallet.get("hasSecrets")),
  "liveTransfersEnabled": bool(TREASURY.get("live_transfers_enabled")),
  "liveTradingEnabled": bool(TREASURY.get("live_trading_enabled")),
  "defaultCollateral": TREASURY.get("default_collateral"),
  "executionPhase1": TREASURY.get("execution_phase_1",[]),
  "dataPhase1": TREASURY.get("data_phase_1",[]),
  "allowedVenues": TREASURY.get("allowed_venues",[])
 }

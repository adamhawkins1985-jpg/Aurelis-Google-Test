import ccxt, requests

def summarize(name, ex):
    try:
        markets = ex.load_markets()
        rows = list(markets.values())
        print(f"{name}: total={len(rows)} spot={sum(bool(m.get('spot')) for m in rows)} swap={sum(bool(m.get('swap')) for m in rows)} future={sum(bool(m.get('future')) for m in rows)} margin={sum(bool(m.get('margin')) for m in rows)}")
        for asset in ("BTC","ETH","SOL"):
            hits=[m.get("symbol") for m in rows if m.get("base")==asset and (m.get("spot") or m.get("swap") or m.get("future"))]
            print(f"  {asset}: {', '.join(hits[:8]) if hits else 'none'}")
    except Exception as e:
        print(f"{name}: ERROR {type(e).__name__}")

summarize("Kraken", ccxt.kraken({"enableRateLimit":True,"timeout":15000}))
summarize("Toobit", ccxt.toobit({"enableRateLimit":True,"timeout":15000}))
summarize("OKX US", ccxt.okx({"hostname":"us.okx.com","enableRateLimit":True,"timeout":15000}))

try:
    r=requests.get("https://external-api.kalshi.com/trade-api/v2/margin/markets",params={"limit":200},timeout=15)
    print("Kalshi Perps: HTTP",r.status_code)
    if r.status_code==200:
        j=r.json()
        ms=j.get("markets") or []
        print("  markets=",len(ms))
        for m in ms[:30]:
            t=(m.get("ticker") or "")
            title=(m.get("title") or m.get("subtitle") or "")
            if any(a in (t+" "+title).upper() for a in ("BTC","ETH","SOL")):
                print(" ",t,title[:80])
except Exception as e:
    print("Kalshi Perps: ERROR",type(e).__name__)

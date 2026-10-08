import ccxt, requests

tests = [
    ("Kraken", ccxt.kraken({"enableRateLimit":True}), ["BTC/USD","ETH/USD","SOL/USD"]),
    ("Toobit", ccxt.toobit({"enableRateLimit":True}), ["BTC/USDC:USDC","ETH/USDC:USDC","SOL/USDC:USDC"]),
    ("OKX US", ccxt.okx({"hostname":"us.okx.com","enableRateLimit":True}), ["BTC/USDC:USDC","ETH/USDC:USDC","SOL/USDC:USDC"]),
]
for name, ex, syms in tests:
    ex.load_markets()
    print(name)
    for s in syms:
        try:
            ob=ex.fetch_order_book(s, 5)
            bid=ob["bids"][0][0] if ob.get("bids") else None
            ask=ob["asks"][0][0] if ob.get("asks") else None
            print(" ",s,"OK" if bid and ask else "EMPTY")
        except Exception as e:
            print(" ",s,type(e).__name__)

r=requests.get("https://external-api.kalshi.com/trade-api/v2/margin/markets",params={"status":"active"},timeout=15)
print("Kalshi",r.status_code)
if r.status_code==200:
    by={m.get("ticker"):m for m in r.json().get("markets",[])}
    for t in ("KXBTCPERP","KXETHPERP","KXSOLPERP"):
        m=by.get(t) or {}
        print(" ",t,"OK" if m.get("bid") and m.get("ask") else "EMPTY")

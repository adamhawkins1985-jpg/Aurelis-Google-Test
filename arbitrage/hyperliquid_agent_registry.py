"""Public Hyperliquid authorized-agent lookup for mainnet/testnet.

No keys, signing, registration or trading. Public response proves exchange
registration only, not possession of the agent secret.
"""
import json
from urllib.request import Request, urlopen

URLS={"Testnet":"https://api.hyperliquid-testnet.xyz/info","Mainnet":"https://api.hyperliquid.xyz/info"}

def _address(value):
    if not isinstance(value,str) or len(value)!=42 or not value.startswith("0x") or any(c not in "0123456789abcdefABCDEF" for c in value[2:]):
        raise ValueError("invalid_address")
    return value.lower()

def authorized_agents(master, network="Testnet", fetch=None):
    master=_address(master)
    if network not in URLS: raise ValueError("invalid_network")
    body={"type":"extraAgents","user":master}
    if fetch is None:
        request=Request(URLS[network],data=json.dumps(body).encode(),headers={"Content-Type":"application/json"},method="POST")
        with urlopen(request,timeout=8) as response: data=json.load(response)
    else: data=fetch(body)
    if not isinstance(data,list) or len(data)>100: raise ValueError("invalid_exchange_response")
    agents=[]
    for row in data:
        if not isinstance(row,dict): raise ValueError("invalid_exchange_response")
        address=_address(row.get("address"))
        agents.append({"address":address,"name":str(row.get("name",""))[:100],"validUntil":row.get("validUntil")})
    return {"mode":"public_read_only","network":network,"masterAddress":master,
      "registeredAgents":agents,"agentCount":len(agents),
      "registrationSource":"hyperliquid_extraAgents","walletOwnershipVerified":False,
      "agentKeyCustodyVerified":False,"oneKeySignatureRequested":False,
      "executionReady":False,"ordersSubmitted":0}

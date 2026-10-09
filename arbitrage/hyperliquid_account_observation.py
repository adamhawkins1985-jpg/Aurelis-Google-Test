"""Read-only Hyperliquid account observation using its public info API.
An observed address is never evidence of wallet ownership or signer authorization.
"""
import json
from decimal import Decimal, InvalidOperation
from urllib.request import Request, urlopen

INFO_URL="https://api.hyperliquid.xyz/info"

def inspect_account(address, fetch=None):
    if not isinstance(address,str) or len(address)!=42 or not address.startswith("0x") or not all(c in "0123456789abcdefABCDEF" for c in address[2:]):
        raise ValueError("invalid_address")
    def public_query(body):
        if fetch is not None:
            return fetch(body)
        req=Request(INFO_URL,data=json.dumps(body).encode(),headers={"Content-Type":"application/json"},method="POST")
        with urlopen(req,timeout=8) as resp:
            return json.load(resp)
    clearing=public_query({"type":"clearinghouseState","user":address})
    spot=public_query({"type":"spotClearinghouseState","user":address})
    if not isinstance(clearing,dict) or not isinstance(spot,dict):
        raise ValueError("invalid_exchange_response")
    summary=clearing.get("marginSummary")
    balances=spot.get("balances")
    positions=clearing.get("assetPositions")
    if not isinstance(summary,dict) or not isinstance(balances,list) or not isinstance(positions,list):
        raise ValueError("invalid_exchange_response")
    for value in (summary.get("accountValue"), clearing.get("withdrawable")):
        if not isinstance(value, str) or not value.strip():
            raise ValueError("invalid_exchange_response")
        try:
            amount = Decimal(value)
        except InvalidOperation as exc:
            raise ValueError("invalid_exchange_response") from exc
        if not amount.is_finite() or amount < 0:
            raise ValueError("invalid_exchange_response")
    return {"mode":"paper","source":"hyperliquid_public_info","walletAddress":address.lower(),
      "perpsAccountValueUsd":summary.get("accountValue"),"perpsWithdrawableUsd":clearing.get("withdrawable"),
      "openPerpPositions":len(positions),"spotAssetCount":len(balances),
      "walletOwnershipVerified":False,"oneKeySignerAuthorized":False,
      "collateralSufficiencyVerified":False,"executionReady":False,"ordersSubmitted":0,
      "notice":"Public venue account data does not establish wallet ownership, authorized agent permissions, or available margin for a proposed order."}

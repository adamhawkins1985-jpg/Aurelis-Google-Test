"""Exact-format *unsigned* Hyperliquid approveAgent EIP-712 review.

Only prepares structured information to display to a user. Does not sign,
submit, create an agent key, or authorize an API wallet.
"""
from hyperliquid_agent_preflight import preflight

def preview(master, agent, name="AURELIS", network="Testnet", nonce=0):
    if not agent: raise ValueError("agent_address_required")
    report=preflight("hunter","BTC","long",25,master,agent,network)
    if not isinstance(name,str) or not 1<=len(name)<=16 or not name.isascii() or not name.isprintable():
        raise ValueError("invalid_agent_name")
    if isinstance(nonce,bool) or not isinstance(nonce,int) or nonce<=0 or nonce>=2**53:
        raise ValueError("invalid_nonce")
    # Hyperliquid user-signed approveAgent: signatureChainId 0x66eee for testnet.
    # Domain is based on user-signed transactions, not L1 trading signatures.
    return {
        "mode":"review_only","network":network,"masterAddress":report["masterAddress"],
        "agentAddress":report["agentAddress"],"agentName":name,
        "nonce":nonce,"signatureChainId":"0x66eee",
        "action":{
            "type":"approveAgent","hyperliquidChain":network,
            "signatureChainId":"0xa4b1","agentAddress":report["agentAddress"],
            "agentName":name,"nonce":nonce
        },
        "eip712PrimaryType":"HyperliquidTransaction:ApproveAgent",
        "eip712Types":[{"name":"hyperliquidChain","type":"string"},
                       {"name":"agentAddress","type":"address"},
                       {"name":"agentName","type":"string"},
                       {"name":"nonce","type":"uint64"}],
        "signature":None,"signingRequested":False,
        "approvalBroadcast":False,"executionReady":False,"ordersSubmitted":0,
        "warning":"Review-only. An approveAgent signature grants continuing trading permissions even when the wallet currently has no funds."
    }

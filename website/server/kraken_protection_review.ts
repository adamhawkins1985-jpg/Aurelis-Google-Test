/**
 * Assess a Hunter research setup against Kraken's side-specific executable quote.
 * Pure check only: it never reprices stops, sends a request or authorizes an order.
 */
export type KrakenProtectionDirection='LONG'|'SHORT';
export interface KrakenProtectionReview {
 direction:KrakenProtectionDirection;
 proposedEntry:number;
 liveQuote:number;
 stop:number;
 target:number;
 pair:string;
}
export interface KrakenProtectionAssessment {
 ok:boolean;
 code:'ok'|'quote_unavailable'|'invalid_setup_levels'|'market_outside_bracket';
 message:string;
}
const price=(n:number)=>'$'+n.toLocaleString('en-US',{maximumFractionDigits:8});

export function assessKrakenProtection(p:KrakenProtectionReview):KrakenProtectionAssessment{
  const {direction,proposedEntry,liveQuote,stop,target,pair}=p;
  if(!Number.isFinite(liveQuote)||liveQuote<=0)
    return {ok:false,code:'quote_unavailable',message:'Kraken margin executable quote is unavailable. Wait for a fresh quote and retry. No order placed.'};
  if(![stop,target].every(x=>Number.isFinite(x)&&x>0))
    return {ok:false,code:'invalid_setup_levels',message:'The stop or target is invalid. Refresh the Hunter setup; no order placed.'};
  const long=direction==='LONG';
  if(Number.isFinite(proposedEntry)&&proposedEntry>0){
    const validOriginal=long?stop<proposedEntry&&proposedEntry<target
      :target<proposedEntry&&proposedEntry<stop;
    if(!validOriginal)
      return {ok:false,code:'invalid_setup_levels',
        message:'Hunter '+direction+' setup levels are inconsistent: entry '+price(proposedEntry)+
          ', stop '+price(stop)+', target '+price(target)+'. Re-scan and review the levels. No trade placed.'};
  }
  const validLive=long?stop<liveQuote&&liveQuote<target:target<liveQuote&&liveQuote<stop;
  if(!validLive){
    const boundary=long
      ? (liveQuote<=stop?'at/below its stop':'at/above its target')
      : (liveQuote>=stop?'at/above its stop':'at/below its target');
    return {ok:false,code:'market_outside_bracket',
      message:'Kraken '+pair+' live '+(long?'buy ask':'sell bid')+' '+price(liveQuote)+
        ' is '+boundary+' for this '+direction+' setup. Hunter '+
        (Number.isFinite(proposedEntry)&&proposedEntry>0?'entry '+price(proposedEntry)+', ':'')+
        'stop '+price(stop)+', target '+price(target)+
        '. The setup is stale for Kraken execution. Return to Trade Radar, Hunt for a fresh setup, and send it through Hunter again. No trade placed.'};
  }
  return {ok:true,code:'ok',message:''};
}

/** Relevant BUY asks and SELL bids reduce stale last-trade comparisons. */
export function krakenExecutablePrice(
  info:{mark:number;ticker?:{a?:unknown[];b?:unknown[]}},
  direction:KrakenProtectionDirection
):number{
  const top=Number(direction==='LONG'?info.ticker?.a?.[0]:info.ticker?.b?.[0]);
  return Number.isFinite(top)&&top>0?top:Number(info.mark);
}

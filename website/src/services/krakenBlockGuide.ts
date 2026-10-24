export type KrakenBlockKind='wallet'|'price'|'funds'|'market'|'protection'|'validation'|'other';
export interface KrakenBlockGuide {
  kind:KrakenBlockKind;
  title:string;
  explanation:string;
  nextStep:string;
  tryNewScan:boolean;
  tryWallet:boolean;
}

/** Map errors to actionable, honest next steps; don't disguise auth as exchange rejection. */
export function explainKrakenBlock(error: unknown):KrakenBlockGuide {
  const text=String(error||'').toLowerCase();
  if (/wallet_auth_required|bot_account_owner_not_authorized|different_wallet_or_purpose|owner_wallet/.test(text)) {
    return {kind:'wallet',title:'Bot Wallet authorization needed',
      explanation:'Your wallet can be connected without being authorized to review Kraken account orders.',
      nextStep:'Choose Verify Bot Wallet above, approve a fresh OneKey sign-in message, then review this bet again.',
      tryNewScan:false,tryWallet:true};
  }
  if (/challenge_replayed|challenge_missing|challenge_expired/.test(text)) {
    return {kind:'wallet',title:'Wallet sign-in must be renewed',
      explanation:'The earlier signing request cannot be reused. No crypto transaction or trade was placed.',
      nextStep:'Use Verify Bot Wallet once to request a new message in OneKey.',
      tryNewScan:false,tryWallet:true};
  }
  if (/at\/below its stop|at\/above its stop|at\/below its target|at\/above its target|outside.*bracket|price_moved|setup.*stale|stop_price_invalid|stop_not_protective/.test(text)) {
    return {kind:'price',title:'Market moved outside the bet plan',
      explanation:'Kraken\'s live buy/sell price no longer fits the entry, stop and target from the scanner. Changing the stop automatically would change your risk.',
      nextStep:'Return to Auto Scan and select a fresh setup. Do not keep retrying these old prices.',
      tryNewScan:true,tryWallet:false};
  }
  if (/insufficient_free_margin|insufficient.*fund|balance/.test(text)) {
    return {kind:'funds',title:'Not enough available Kraken margin',
      explanation:'Your available trading collateral is too low for this $10 test. A wallet balance is not the same as available Kraken margin.',
      nextStep:'Check the Kraken account balance and margin eligibility before attempting a new review.',
      tryNewScan:false,tryWallet:false};
  }
  if (/minimum|ordermin|costmin|lot_size|quantity/.test(text)) {
    return {kind:'market',title:'This coin cannot fit the $10 test',
      explanation:'Kraken\'s minimum trade amount is larger than the authorized test order.',
      nextStep:'Choose another coin. AURELIS will not increase the real-order size to force a trade.',
      tryNewScan:true,tryWallet:false};
  }
  if (/leverage_not_supported|margin_pair|not_currently_open|unsupported.*venue/.test(text)) {
    return {kind:'market',title:'This market is not eligible',
      explanation:'The requested margin direction or leverage is not supported by this Kraken market.',
      nextStep:'Choose an eligible market instead. Research-only perp data is not live Kraken margin permission.',
      tryNewScan:true,tryWallet:false};
  }
  if (/linked_stop_target_lifecycle_unverified|execution_unverified_disabled|execution.*locked/.test(text)) {
    return {kind:'protection',title:'Live orders are still safety-locked',
      explanation:'AURELIS has not verified the linked exit protections needed to manage an actual margin position safely.',
      nextStep:'You can research and validate orders without trading. Do not bypass the safety lock.',
      tryNewScan:false,tryWallet:false};
  }
  if (/validation|confirmation.*expired|confirmation_used/.test(text)) {
    return {kind:'validation',title:'Order review needs a fresh validation',
      explanation:'The earlier no-trade validation has expired or cannot be reused.',
      nextStep:'Review the order again to obtain a fresh quote and validation.',
      tryNewScan:false,tryWallet:false};
  }
  return {kind:'other',title:'Kraken could not prepare this review',
    explanation:'The order was blocked. The technical reason is available below; no trade has been placed.',
    nextStep:'Check your OneKey authorization and the details below before trying again.',
    tryNewScan:false,tryWallet:false};
}

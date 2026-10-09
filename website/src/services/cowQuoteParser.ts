/** Read-only CoW indicative quote parsing. Not an order or profit estimate. */
export function parseCowQuote(data: unknown, sellToken: string, buyToken: string) {
  const q = (data as { quote?: Record<string, unknown> } | null)?.quote;
  const valid = (v: unknown) => typeof v === 'string' && /^[0-9]+$/.test(v);
  if (!q || String(q.sellToken).toLowerCase() !== sellToken.toLowerCase() ||
      String(q.buyToken).toLowerCase() !== buyToken.toLowerCase() ||
      !valid(q.sellAmount) || !valid(q.buyAmount) || !valid(q.feeAmount) ||
      BigInt(q.sellAmount as string) <= 0n || BigInt(q.buyAmount as string) <= 0n) {
    throw Error('invalid_cow_quote');
  }
  return { sellAmount:String(q.sellAmount), buyAmount:String(q.buyAmount),
    feeAmount:String(q.feeAmount), indicative:true as const, executable:false as const };
}

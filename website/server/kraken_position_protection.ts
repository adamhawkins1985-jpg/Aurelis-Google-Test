// Conservative Kraken margin protection audit. Read-only snapshots cannot prove
// that a conditional order is attached to a filled position or that two exits
// form an exchange-native OCO group.
export const KRAKEN_LINKED_OCO_LIFECYCLE_VERIFIED = false;

export function krakenLiveExecutionPermitted(executionFlag: unknown): boolean {
  // A deployment flag alone must NEVER unlock market orders before an
  // exchange-verified linked stop/target lifecycle is implemented and tested.
  return executionFlag === '1' && KRAKEN_LINKED_OCO_LIFECYCLE_VERIFIED;
}

export type KrakenPositionSnapshot = {
  txid: string;
  pair: string;
  rawPair?: string;
  side: string;
  remaining: number;
};

export type KrakenOrderSnapshot = {
  txid: string;
  pair: string;
  side: string;
  orderType: string;
  status: string;
  volume: number;
  filled: number;
};

export function auditKrakenMarginProtection(
  positions: KrakenPositionSnapshot[],
  orders: KrakenOrderSnapshot[]
) {
  const normalizePair = (pair: unknown) => String(pair ?? '')
    .toUpperCase().split(':')[0].replace(/[^A-Z0-9]/g, '')
    .replace(/^XBT/, 'BTC');

  const rows = positions.filter(p => Number.isFinite(p.remaining) && p.remaining > 0)
    .map(position => {
      const key = normalizePair(position.rawPair || position.pair);
      const opposingSide = position.side.toLowerCase() === 'buy' ? 'sell'
        : position.side.toLowerCase() === 'sell' ? 'buy' : '';
      const matching = orders.filter(order =>
        opposingSide && order.side.toLowerCase() === opposingSide &&
        String(order.status).toLowerCase() === 'open' &&
        normalizePair(order.pair) === key &&
        Number.isFinite(order.volume) && (order.volume - (order.filled || 0)) > 0
      );
      const stopCandidates = matching.filter(order =>
        order.orderType.toLowerCase().startsWith('stop-loss')).map(order => order.txid);
      const targetCandidates = matching.filter(order =>
        order.orderType.toLowerCase().startsWith('take-profit')).map(order => order.txid);
      return {
        positionId: position.txid,
        pair: position.rawPair || position.pair,
        side: position.side.toUpperCase() === 'BUY' ? 'LONG' : position.side.toUpperCase() === 'SELL' ? 'SHORT' : 'UNKNOWN',
        remaining: position.remaining,
        stopCandidates,
        targetCandidates,
        linkedOcoVerified: false,
        stopActivationVerified: false,
        status: stopCandidates.length ? 'POSSIBLE_STOP_UNLINKED' : 'NO_STOP_OBSERVED',
        // Never treat a loosely matched order as an activated or linked exit.
        needsManualProtectionReview: true,
      };
    });
  return {
    verified: false,
    linkedOcoVerified: false,
    activePositions: rows.length,
    positionsWithoutObservedStop: rows.filter(row => !row.stopCandidates.length).length,
    positionsRequiringReview: rows.length,
    positions: rows,
    warning: rows.length
      ? 'Kraken open-order snapshots cannot prove that a stop is attached to the position or that stop and target are linked. Review protection directly in Kraken Pro.'
      : 'No open margin positions in the latest account snapshot. This does not verify future order protection.',
  };
}

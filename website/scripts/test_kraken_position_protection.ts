import assert from 'node:assert/strict';
import {
  auditKrakenMarginProtection, KRAKEN_LINKED_OCO_LIFECYCLE_VERIFIED,
  krakenLiveExecutionPermitted,
} from '../server/kraken_position_protection';

assert.equal(KRAKEN_LINKED_OCO_LIFECYCLE_VERIFIED, false,
  'New entries stay disabled until verified linked stop/target lifecycle is integrated');
assert.equal(krakenLiveExecutionPermitted(undefined), false);
assert.equal(krakenLiveExecutionPermitted('0'), false);
assert.equal(krakenLiveExecutionPermitted('1'), false,
  'An environment variable must not unlock unverified linked exits');

const btcPosition = {
  txid: 'margin1', pair: 'XBTUSD', rawPair: 'XBTUSD:BTNL',
  side: 'buy', remaining: 0.01,
};
const stop = {
  txid: 'stop1', pair: 'BTC/USD', side: 'sell',
  orderType: 'stop-loss', status: 'open', volume: 0.01, filled: 0,
};
const target = {
  txid: 'target1', pair: 'BTC/USD', side: 'sell',
  orderType: 'take-profit', status: 'open', volume: 0.01, filled: 0,
};
const empty = auditKrakenMarginProtection([],[]);
assert.equal(empty.activePositions,0);
assert.equal(empty.verified,false,'No open positions does not prove future exit protection');

const missing = auditKrakenMarginProtection([btcPosition],[]);
assert.equal(missing.positionsWithoutObservedStop,1);
assert.equal(missing.positions[0].status,'NO_STOP_OBSERVED');

const independent = auditKrakenMarginProtection([btcPosition],[stop,target]);
assert.equal(independent.positions[0].stopCandidates.length,1);
assert.equal(independent.positions[0].targetCandidates.length,1);
assert.equal(independent.positions[0].status,'POSSIBLE_STOP_UNLINKED');
assert.equal(independent.positions[0].linkedOcoVerified,false,
  'Two independent orders are never inferred to be an OCO linkage');
assert.equal(independent.positions[0].stopActivationVerified,false,
  'Seeing a stop order does not establish protective activation');
assert.equal(independent.positionsRequiringReview,1);

const wrongSide = auditKrakenMarginProtection([btcPosition],[
  {...stop,side:'buy'}, {...target,pair:'ETHUSD'},
]);
assert.equal(wrongSide.positions[0].stopCandidates.length,0);
assert.equal(wrongSide.positions[0].targetCandidates.length,0);

const staleStop = auditKrakenMarginProtection([btcPosition],[{...stop,status:'closed'}]);
assert.equal(staleStop.positionsWithoutObservedStop,1);

const partiallyFilledStop = auditKrakenMarginProtection([btcPosition],[{...stop,filled:0.01}]);
assert.equal(partiallyFilledStop.positionsWithoutObservedStop,1,
  'Completely filled old stop orders cannot protect a current margin position');

const shortPosition={...btcPosition,txid:'short1',side:'sell'};
const shortAudit=auditKrakenMarginProtection([shortPosition],[{...stop,side:'buy'}]);
assert.equal(shortAudit.positions[0].stopCandidates.length,1);
assert.equal(shortAudit.positions[0].linkedOcoVerified,false);
console.log('PASS: Kraken stop/target status fails closed, independent exits never imply linked OCO, environment flags cannot enable unverified orders.');

import assert from 'node:assert/strict';
import { estimateBetScenario } from '../src/services/betScenario';

const near = (actual: number, expected: number, label: string) => {
  assert.ok(Math.abs(actual - expected) < 1e-8, label + ': ' + actual + ' != ' + expected);
};

const long = estimateBetScenario({
  stakeUsd: 100, leverage: 2, entry: 100, stop: 95, target: 110,
  direction: 'LONG', roundTripCostPct: 0.2,
});
assert.ok(long);
near(long.exposureUsd, 200, 'long exposure');
near(long.targetGrossUsd, 20, 'long gross gain');
near(long.stopGrossUsd, -10, 'long gross loss');
near(long.estimatedFeesUsd!, 0.4, 'round-trip fees');
near(long.targetAfterFeesUsd!, 19.6, 'long net target');
near(long.stopAfterFeesUsd!, -10.4, 'long net stop');
near(long.targetRoiPct, 19.6, 'collateral ROI');

const short = estimateBetScenario({
  stakeUsd: 50, leverage: 5, entry: 200, stop: 210, target: 180,
  direction: 'SHORT',
});
assert.ok(short);
near(short.exposureUsd, 250, 'short exposure');
near(short.targetGrossUsd, 25, 'short gain');
near(short.stopGrossUsd, -12.5, 'short loss');
assert.equal(short.targetAfterFeesUsd, null, 'unknown fees cannot be presented as net');
near(short.targetRoiPct, 50, 'short gross collateral ROI');

const larger = estimateBetScenario({
  stakeUsd: 200, leverage: 2, entry: 100, stop: 95, target: 110, direction: 'LONG',
});
assert.ok(larger);
near(larger.targetGrossUsd / (long.targetGrossUsd), 2, 'doubling stake doubles profit');

const higherLeverage = estimateBetScenario({
  stakeUsd: 100, leverage: 4, entry: 100, stop: 95, target: 110, direction: 'LONG',
});
assert.ok(higherLeverage);
near(higherLeverage.targetGrossUsd / long.targetGrossUsd, 2, 'doubling leverage doubles profit');
assert.equal(estimateBetScenario({
  stakeUsd: 100, leverage: 2, entry: 100, stop: 105, target: 110, direction: 'LONG',
}), null, 'invalid long stop');
assert.equal(estimateBetScenario({
  stakeUsd: 100, leverage: 2, entry: 100, stop: 95, target: 110, direction: 'SHORT',
}), null, 'invalid short stop');
assert.equal(estimateBetScenario({
  stakeUsd: -1, leverage: 2, entry: 100, stop: 95, target: 110, direction: 'LONG',
}), null, 'negative collateral');
assert.equal(estimateBetScenario({
  stakeUsd: 100, leverage: 2, entry: 100, stop: 95, target: 110, direction: 'LONG', roundTripCostPct: -0.2,
}), null, 'invalid fee');

console.log('Bet scenario calculations passed (long, short, fees, stake, leverage, invalid setups).');

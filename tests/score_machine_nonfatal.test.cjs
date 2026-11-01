'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../scripts/daily_tracker.cjs');

test('a failing research score machine degrades to unavailable instead of blocking the production lock', () => {
  const result = T.scoreMachineOrUnavailable(2027, () => { throw new Error('Score-machine pretip historical provenance missing'); });
  assert.equal(result.fit, null);
  assert.match(result.unavailable_reason, /provenance missing/);
});

test('a working score machine is passed through unchanged', () => {
  const fit = { fit: { training_games: 5 }, source_sha256: 'abc' };
  assert.equal(T.scoreMachineOrUnavailable(2027, () => fit), fit);
});

test('with the real historical dataset the research model is still trained (happy path unchanged)', () => {
  const result = T.scoreMachineOrUnavailable(2027);
  assert.ok(result.fit && result.fit.training_games > 0, 'real dataset must still produce a trained model');
  assert.match(result.source_sha256, /^[0-9a-f]{64}$/);
  assert.equal(result.unavailable_reason, undefined);
});

'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../predict/engine.js');
test('historical snapshot validation fails closed on missing cutoff',()=>{
  assert.throws(()=>E.assertHistoricalSnapshotBefore({date:'2026-01-01T12:00:00Z'},{}),/cutoff/);
});
test('permissive snapshot validation remains compatible',()=>{
  assert.doesNotThrow(()=>E.assertSnapshotBefore({date:'2026-01-01T12:00:00Z'},{}));
});

'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {estimate}=require('../predict/regularized-player-impact.js');
const cutoff='2026-11-20T10:00:00Z';
const priors=Array.from({length:10},(_,i)=>({player_id:String(i+1),box_prior:0,available_at_utc:'2026-11-18T00:00:00Z'}));
const observation={ended_at_utc:'2026-11-19T01:00:00Z',available_at_utc:'2026-11-19T04:00:00Z',home_player_ids:['1','2','3','4','5'],away_player_ids:['6','7','8','9','10'],margin_per_100:5,possessions:20};
test('returns bounded research-only estimates without a win probability',()=>{
 const r=estimate({as_of_utc:cutoff,priors,observations:Array.from({length:35},()=>({...observation}))});
 assert.equal(r.available,true);assert.equal(r.validated_probability,false);assert.equal(r.production,false);
 assert.equal(r.player_impacts.length,10);assert.ok(r.player_impacts[0].impact_per_100>0);
 assert.ok(!Object.hasOwn(r,'homeWin'));
});
test('rejects leakage from future available observations',()=>{
 const r=estimate({as_of_utc:cutoff,priors,observations:Array.from({length:35},()=>({...observation,available_at_utc:'2026-11-20T11:00:00Z'}))});
 assert.equal(r.available,false);
});
test('rejects unknown players and incomplete samples',()=>{
 assert.equal(estimate({as_of_utc:cutoff,priors,observations:[observation]}).available,false);
 assert.equal(estimate({as_of_utc:cutoff,priors,observations:Array.from({length:35},()=>({...observation,home_player_ids:['1','2','3','4','99']}))}).available,false);
});

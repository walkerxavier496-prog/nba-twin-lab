'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../predict/engine.js'),S=require('../scripts/game_science.cjs');
const game=(date,extra={})=>({id:'1',date,season:2026,status:'final',home:{id:'1',abbr:'ATL'},away:{id:'2',abbr:'BOS'},homeScore:120,awayScore:90,...extra});
const verified=(g,at)=>({...g,result_available_at_utc:at,result_availability_verified:true,result_availability_source:'timestamped fixture final observation'});
test('overlapping and simultaneous games cannot admit an unavailable final',()=>{
 const g=game('2026-01-01T23:00:00Z');
 for(const t of ['2026-01-01T23:00:00Z','2026-01-01T23:30:00Z','2026-01-02T00:01:00Z'])assert.equal(E.ratings([g],t).finals,0);
 assert.equal(E.ratings([g],'2026-01-03T00:00:00Z').finals,0);
 assert.equal(E.ratings([g],'2026-01-03T00:00:01Z').finals,1);
});
test('verified result observations support doubleheaders, with a strict cutoff',()=>{
 const g=verified(game('2026-01-01T14:00:00Z'),'2026-01-01T17:00:00Z');
 assert.equal(E.ratings([g],'2026-01-01T16:00:00Z').finals,0);
 assert.equal(E.ratings([g],'2026-01-01T17:00:00Z').finals,0);
 assert.equal(E.ratings([g],'2026-01-01T19:00:00Z').teams.get('1').games,1);
 assert.equal(E.matchupHistory([g],{...g,date:'2026-01-01T16:00:00Z'}).length,0);
});
test('unverified, malformed, timezone-naive and pre-tip evidence fails closed',()=>{
 const g=game('2026-01-01T14:00:00Z');
 for(const at of ['garbage','2026-01-01T13:00:00Z','2026-01-01T18:00:00'])assert.equal(E.resultAvailability(verified(g,at)),Infinity);
 assert.equal(E.resultAvailability({...verified(g,'2026-01-01T18:00:00Z'),result_availability_verified:false}),Infinity);
 assert.equal(E.resultAvailability({...g,status:'suspended'}),Infinity);
 assert.equal(E.resultAvailability({...g,date:'garbage'}),Infinity);
});
test('date-only and offset timestamps share UTC boundaries, including DST',()=>{
 assert.equal(E.resultAvailability(game('2026-01-01')),Date.parse('2026-01-03T00:00:00Z'));
 assert.equal(E.resultAvailability(game('2026-10-31T10:00:00+11:00')),Date.parse('2026-11-01T00:00:00Z'));
 const g=verified(game('2026-10-31T10:00:00+11:00'),'2026-10-31T13:00:00+11:00');
 assert.equal(E.resultKnownBefore(g,'2026-10-31T02:00:00Z'),false);
 assert.equal(E.resultKnownBefore(g,'2026-10-31T02:00:01Z'),true);
});
test('future outcome perturbations cannot change an overlapping forecast',()=>{
 const g=game('2026-01-01T23:00:00Z'),target=game('2026-01-01T23:30:00Z',{id:'2'});
 const a=E.forecast(target,E.ratings([g],target.date));
 const b=E.forecast(target,E.ratings([{...g,homeScore:180,awayScore:50}],target.date));
 assert.deepEqual(a,b);
});
test('independent team/player models reject later feature cutoffs',()=>{
 assert.throws(()=>E.independentExpectation(game('2026-01-01T12:00:00Z'),{home:{information_cutoff_utc:'2026-01-01T13:00:00Z'},away:{}}),/cutoff/);
});
test('date-only head-to-head cannot use a same-day meeting result',()=>{
 const h=new Map([['ATL|BOS',[{date:'2026-01-01',season:2026,winner:'ATL'}]]]);
 assert.equal(S.headToHeadPrior(h,{date:'2026-01-01',season:2026,home:{abbr:'ATL'},away:{abbr:'BOS'}}).meetings,0);
 assert.equal(S.headToHeadPrior(h,{date:'2026-01-03T00:00:01Z',season:2026,home:{abbr:'ATL'},away:{abbr:'BOS'}}).meetings,1);
});
test('model fitting excludes unavailable earlier-season outcomes',()=>{
 const IO=require('../scripts/research_io.cjs');
 const rows=[{season:2025,date:'2026-01-01T12:00:00Z',outcomeAvailableAt:Date.parse('2026-02-01T00:00:00Z')},
 {season:2025,date:'2025-12-01T12:00:00Z'}, {season:2026,date:'2026-01-02T12:00:00Z'}];
 assert.deepEqual(IO.trainingRows(rows,2026),[rows[1]]);
});
test('legacy feature booleans cannot substitute for chronology certification',()=>{
 const IO=require('../scripts/research_io.cjs');
 assert.throws(()=>IO.requireChronology({strict_no_future_data:true}),/Legacy/);
 assert.throws(()=>IO.write('report.json',{},require('node:path').resolve('data/model-report.json')),/separate review/);
});

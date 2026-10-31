'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const S=require('../predict/roster-strength.js');
const I=require('../predict/roster-integrity.js');
const tip='2026-11-01T23:00:00Z',now='2026-11-01T21:59:00Z';
const names=(start)=>Array.from({length:12},(_,i)=>({player_id:String(start+i),
 name:'Player '+(start+i),minutes_if_play:26,expected_minutes:22,
 play_probability:.9,impact_proxy:(i-4)/2}));
const snapshot=()=>({strict_no_future_data:true,built_at_utc:'2026-11-01T19:15:00Z',
 coverage:{season:2027},teams:[{abbr:'CHA',rotation:names(100)},
 {abbr:'WAS',rotation:names(200)},...Array.from({length:28},(_,i)=>({abbr:'X'+i,rotation:names(300+i*20)}))]});
const game=()=>({id:'match1',date:tip,season:2027,home:{abbr:'WAS'},away:{abbr:'CHA'},status:'scheduled'});
const official=()=>({schema:'nba-twin-lab-availability-v18',status:'verified',
 strict_no_future_data:true,published_at_utc:'2026-11-01T21:05:00Z',
 source:{type:'official',url:'https://ak-static.cms.nba.com/referee/injury/Injury-Report_2026-11-01_05_05PM.pdf'},
 games:[{game_id:'match1',injury_report_verified:true,teams:{
  CHA:{roster_verified:true,roster_player_ids:names(100).map(p=>p.player_id),
   injuries:[{player_id:'100',status:'OUT'},{player_id:'101',status:'QUESTIONABLE'}]},
  WAS:{roster_verified:true,roster_player_ids:names(200).map(p=>p.player_id),injuries:[]}}}]});
function build(){
 return I.auditGame({game:game(),snapshot:snapshot(),availability:official(),now});
}
test('Verified active-roster scenarios use 240 minutes per team and exclude injury OUT',()=>{
 const integrity=build();
 assert.equal(integrity.source_checks_passed,true);
 const r=S.matchup(integrity);
 assert.equal(r.available,true);
 assert.equal(r.validated_probability,false);
 assert.equal(r.historical_franchise_strength_used,false);
 assert.equal(r.away.scenarios,2);
 assert.equal(r.away.possible_scenarios,2);
 assert.ok(r.away.rotation.every(p=>p.player_id!=='100'));
 assert.ok(Math.abs(r.away.rotation.reduce((sum,p)=>sum+p.minutes,0)-240)<.05);
 assert.ok(Math.abs(r.home.rotation.reduce((sum,p)=>sum+p.minutes,0)-240)<.05);
 assert.ok(r.home_minus_away_impact_range[0]<=r.home_minus_away_impact_range[1]);
});
test('Roster data does not become a false validated win probability',()=>{
 const r=S.matchup(build());
 assert.equal(r.homeWin,undefined);
 assert.equal(r.awayWin,undefined);
 assert.equal(r.validated_probability,false);
});
test('Missing official inputs and unmatched current-roster players fail closed',()=>{
 const no=I.auditGame({game:game(),snapshot:snapshot(),now});
 assert.equal(S.matchup(no).available,false);
 const f=official();f.games[0].teams.CHA.roster_player_ids=f.games[0].teams.CHA.roster_player_ids.slice(1).concat('999');
 f.games[0].teams.CHA.injuries=f.games[0].teams.CHA.injuries.filter(item=>item.player_id!=='100');
 const bad=I.auditGame({game:game(),snapshot:snapshot(),availability:f,now});
 assert.ok(bad.issues.includes('inferred_player_not_on_verified_roster'));
 assert.equal(bad.away.players.find(p=>p.player_id==='100').excluded,true);
 // A stale historic player is EXCLUDED, not allowed to sabotage a current-
 // roster strength estimate built entirely from other valid official players.
 const cleaned=S.matchup(bad);
 assert.equal(cleaned.available,true);
 assert.ok(cleaned.away.rotation.every(p=>p.player_id!=='100'));
});
test('Insufficient healthy rotation coverage fails rather than inventing replacement stars',()=>{
 const f=official();f.games[0].teams.CHA.injuries=names(100).slice(0,7).map(p=>({player_id:p.player_id,status:'OUT'}));
 const integrity=I.auditGame({game:game(),snapshot:snapshot(),availability:f,now});
 assert.equal(integrity.source_checks_passed,true);
 const r=S.matchup(integrity);
 assert.equal(r.available,false);
 assert.match(r.reason,/Fewer than eight/);
});
test('Removing player impact data does not silently substitute zero',()=>{
 const bad=snapshot();bad.teams[0].rotation[4].impact_proxy=null;
 const integrity=I.auditGame({game:game(),snapshot:bad,availability:official(),now});
 assert.equal(S.matchup(integrity).available,false);
 assert.match(S.matchup(integrity).reason,/missing strictly pregame player impact/);
});

test('Postgame V18 grades are directional diagnostics, never probability scores',()=>{
 const A=require('../scripts/audit-core.cjs');
 const forecast={v18_roster_strength:{available:true,home_minus_away_impact_range:[1,3]}};
 const actual={home:{score:102},away:{score:98}};
 const graded=A.gradeRosterStrengthSignal(forecast,actual);
 assert.equal(graded.status,'scored');
 assert.equal(graded.correct,true);
 assert.equal(graded.not_a_probability,true);
 assert.equal(graded.p,undefined);
 assert.equal(graded.brier,undefined);
 const ambiguous=A.gradeRosterStrengthSignal({v18_roster_strength:{available:true,
  home_minus_away_impact_range:[-2,3]}},actual);
 assert.equal(ambiguous.status,'inconclusive');
 assert.equal(ambiguous.correct,null);
 assert.equal(A.rosterSignalSummary([graded,ambiguous]).decisive_coverage,.5);
});

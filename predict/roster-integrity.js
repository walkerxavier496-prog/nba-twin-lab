/* V18 pregame roster/availability integrity audit. Research-only: does not change
 * production Elo or any immutable forecast. Node and browser compatible. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.TwinRosterIntegrity=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const aliases={GS:'GSW',NY:'NYK',SA:'SAS',NO:'NOP',PHO:'PHX',BRK:'BKN',CHO:'CHA',WSH:'WAS'};
const canonical=value=>aliases[String(value||'').toUpperCase()]||String(value||'').toUpperCase();
const finite=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const utc=value=>typeof value==='number'?value:Date.parse(value);
const STATUSES=new Set(['OUT','DOUBTFUL','QUESTIONABLE','PROBABLE','AVAILABLE']);
function timeCheck({game,snapshot,now,maxAgeHours=36}){
 const tip=utc(game?.date),built=utc(snapshot?.built_at_utc),cutoff=utc(now);
 const issues=[];
 if(!game||!Number.isFinite(tip))issues.push('invalid_game_time');
 if(!snapshot?.strict_no_future_data||!Array.isArray(snapshot?.teams)||snapshot.teams.length!==30)issues.push('unverified_team_snapshot');
 if(!Number.isFinite(built)||!Number.isFinite(cutoff)||built>cutoff||built>=tip)issues.push('invalid_snapshot_cutoff');
 else if(cutoff-built>maxAgeHours*3600000)issues.push('stale_team_snapshot');
 if(Number(snapshot?.coverage?.season)!==Number(game?.season))issues.push('season_mismatch');
 return {issues,tip,cutoff,built};
}
function officialForGame(availability,game,clock){
 const issues=[];
 const published=utc(availability?.published_at_utc);
 if(!availability||availability.schema!=='nba-twin-lab-availability-v18'||
   availability.strict_no_future_data!==true||availability.status!=='verified'||
   availability.source?.type!=='official'||!availability.source?.url||
   !Array.isArray(availability.games))issues.push('official_availability_missing');
 if(!Number.isFinite(published)||published>clock.cutoff||published>=clock.tip)
   issues.push('invalid_injury_cutoff');
 if(Number.isFinite(published)&&Number.isFinite(clock.cutoff)&&clock.cutoff-published>24*3600000)
   issues.push('stale_injury_report');
 const row=availability?.games?.find?.(g=>String(g.game_id)===String(game?.id));
 if(!row||row.injury_report_verified!==true)issues.push('game_injury_report_unverified');
 return {issues,row:issues.length?null:row,published};
}
function officialTeam(row,abbr){
 const teams=row?.teams||{};
 return teams[canonical(abbr)]||teams[abbr]||Object.entries(teams).find(([k])=>canonical(k)===canonical(abbr))?.[1]||null;
}
function teamAudit(team,feed){
 const issues=[];
 const officialIds=Array.isArray(feed?.roster_player_ids)?feed.roster_player_ids.map(String):[];
 const hasRoster=feed?.roster_verified===true&&officialIds.length>=5&&new Set(officialIds).size===officialIds.length;
 if(!hasRoster)issues.push('official_roster_unverified');
 const activeIds=new Set(officialIds);
 const statusMap=new Map();
 if(feed?.injuries&& !Array.isArray(feed.injuries))issues.push('invalid_injury_entries');
 for(const entry of Array.isArray(feed?.injuries)?feed.injuries:[]){
  const id=String(entry?.player_id||''),status=String(entry?.status||'').toUpperCase();
  if(!/^\d+$/.test(id)||!STATUSES.has(status)||statusMap.has(id)||(hasRoster&&!activeIds.has(id))){
   issues.push('invalid_injury_entry');continue;
  }
  statusMap.set(id,status);
 }
 const ids=new Set();
 const players=[];
 for(const p of team?.rotation||[]){
  const id=String(p?.player_id||'');
  if(!/^\d+$/.test(id)||ids.has(id)){issues.push('invalid_rotation_player_id');continue;}
  ids.add(id);
  const minutes=finite(p.minutes_if_play),expected=finite(p.expected_minutes);
  const ifPlay=clamp(minutes??expected??0,0,48);
  const inferred=clamp(expected??(ifPlay*clamp(finite(p.play_probability)??0,0,1)),0,48);
  const rosterMismatch=hasRoster&&!activeIds.has(id);
  const status=statusMap.get(id)||'NOT_LISTED';
  const out=rosterMismatch||status==='OUT';
  const uncertain=status==='QUESTIONABLE'||status==='DOUBTFUL'||status==='PROBABLE';
  const minMinutes=out?0:uncertain||!hasRoster?0:ifPlay;
  const maxMinutes=out?0:ifPlay;
  const expectedMinutes=out?0:uncertain?null:hasRoster?ifPlay:inferred;
  if(rosterMismatch)issues.push('inferred_player_not_on_verified_roster');
  if(uncertain)issues.push('availability_scenario_required');
  players.push({player_id:id,name:String(p.name||id),status:rosterMismatch?'NOT_ON_ROSTER':status,
   roster_verified:hasRoster,minutes_if_play:ifPlay,inferred_minutes:inferred,
   min_minutes:minMinutes,max_minutes:maxMinutes,expected_minutes:expectedMinutes,
   excluded:out,reason:rosterMismatch?'Player absent from verified roster':status==='OUT'?'Officially OUT':null});
 }
 if(!players.length)issues.push('rotation_missing');
 // A minute ranking is not a confirmed starting lineup.
 const projectedLeaders=players.filter(p=>!p.excluded).sort((a,b)=>b.max_minutes-a.max_minutes).slice(0,5);
 return {team:canonical(team?.abbr),official_roster_verified:hasRoster,players,projected_leaders:projectedLeaders,
  minutes_range:{min:players.reduce((n,p)=>n+p.min_minutes,0),
   max:players.reduce((n,p)=>n+p.max_minutes,0)},
  excluded_players:players.filter(p=>p.excluded),issues:[...new Set(issues)]};
}
function auditGame({game,snapshot,availability=null,now=Date.now()}){
 const clock=timeCheck({game,snapshot,now});
 const feed=officialForGame(availability,game,clock);
 const teams=new Map((snapshot?.teams||[]).map(t=>[canonical(t.abbr),t]));
 const home=teams.get(canonical(game?.home?.abbr)),away=teams.get(canonical(game?.away?.abbr));
 const homeAudit=teamAudit(home,officialTeam(feed.row,game?.home?.abbr));
 const awayAudit=teamAudit(away,officialTeam(feed.row,game?.away?.abbr));
 const issues=[...new Set([...clock.issues,...feed.issues,...homeAudit.issues,...awayAudit.issues,
  ...(!home||!away?['team_missing_from_snapshot']:[])])];
 const sourceChecksPassed=issues.length===0;
 return {schema:'nba-twin-lab-roster-integrity-result-v18',game_id:String(game?.id||''),
  source_checks_passed:sourceChecksPassed,usable_for_new_validated_forecast:false,
  reason:'No V18 roster-first probability model has yet passed prospective validation',
  issues,team_snapshot_utc:snapshot?.built_at_utc||null,
  injury_report_utc:feed.row?availability.published_at_utc:null,
  home:homeAudit,away:awayAudit};
}
return Object.freeze({auditGame,teamAudit,officialForGame,timeCheck,canonical});
});

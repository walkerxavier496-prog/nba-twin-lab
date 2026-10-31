/* V18 research-only active-roster strength experiment.
 * Does NOT return winner probabilities or modify Elo. Uses only the NBA.com-
 * verified roster IDs and strictly pregame player-impact estimates. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.TwinRosterStrength=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const finite=x=>x===null||x===undefined||x===''?null:Number.isFinite(Number(x))?Number(x):null;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const uncertain=new Set(['QUESTIONABLE','DOUBTFUL','PROBABLE']);
const unavailable=reason=>({available:false,reason,validated_probability:false});
function allocateMinutes(players){
 const eligible=players.filter(p=>p.use&&p.max>0&&Number.isFinite(p.impact));
 if(eligible.length<8)return null;
 const caps=eligible.map(p=>Math.min(48,Math.max(p.max*1.22,p.max+6)));
 if(caps.reduce((sum,x)=>sum+x,0)<240-1e-8)return null;
 const minutes=eligible.map((p,i)=>Math.min(caps[i],p.base));
 let remaining=240-minutes.reduce((sum,x)=>sum+x,0);
 if(remaining<-.0001){
  const total=minutes.reduce((a,b)=>a+b,0);
  return eligible.map((p,i)=>({player_id:p.player_id,minutes:240*minutes[i]/total,impact:p.impact}));
 }
 for(let pass=0;pass<20&&remaining>1e-6;pass++){
  const weights=eligible.map((p,i)=>Math.max(0,caps[i]-minutes[i])*
    Math.max(.1,p.base));
  const sum=weights.reduce((a,b)=>a+b,0);
  if(sum<=1e-8)break;
  let added=0;
  for(let i=0;i<eligible.length;i++){
   const increase=Math.min(caps[i]-minutes[i],remaining*weights[i]/sum);
   minutes[i]+=increase;added+=increase;
  }
  remaining-=added;
 }
 if(remaining>0.01)return null;
 return eligible.map((p,i)=>({player_id:p.player_id,minutes:minutes[i],impact:p.impact}));
}
function playerCases(team){
 if(!team?.official_roster_verified)return unavailable('Official current NBA roster is not verified');
 const players=(team.players||[]).filter(p=>!p.excluded&&p.status!=='NOT_ON_ROSTER'&&p.max_minutes>0);
 const missing=players.filter(p=>finite(p.impact_proxy)===null);
 if(missing.length)return unavailable('Active rotation has missing strictly pregame player impact values');
 const uncertainPlayers=players.filter(p=>uncertain.has(p.status));
 if(uncertainPlayers.length>5)return unavailable('More than five unresolved player availability decisions');
 if(players.length<8)return unavailable('Fewer than eight eligible projected rotation players');
 const all=[];
 for(let mask=0;mask<2**uncertainPlayers.length;mask++){
  const active=new Set(uncertainPlayers.filter((_,i)=>(mask&(1<<i))!==0).map(p=>p.player_id));
  const entries=players.map(p=>({player_id:p.player_id,impact:finite(p.impact_proxy),
    max:clamp(p.max_minutes,0,48),base:clamp(finite(p.inferred_minutes)??0,0,48),
    use:!uncertain.has(p.status)||active.has(p.player_id)}));
  const allocated=allocateMinutes(entries);
  if(!allocated)continue;
  const total=allocated.reduce((sum,p)=>sum+p.minutes,0);
  if(Math.abs(total-240)>.05)continue;
  const impact=allocated.reduce((sum,p)=>sum+p.minutes/240*p.impact,0);
  all.push({impact,player_minutes:allocated,absent_uncertain:uncertainPlayers.filter(p=>!active.has(p.player_id)).map(p=>p.player_id)});
 }
 if(!all.length)return unavailable('Insufficient active players to allocate 240 regulation minutes');
 // Incomplete feasibility is not a known probability. Disclose scenario coverage.
 return {available:true,team:team.team,scenarios:all.length,
  possible_scenarios:2**uncertainPlayers.length,
  uncertain_players:uncertainPlayers.map(p=>({player_id:p.player_id,name:p.name,status:p.status})),
  strength_range:[Math.min(...all.map(x=>x.impact)),Math.max(...all.map(x=>x.impact))],
  rotation:all.sort((a,b)=>a.absent_uncertain.length-b.absent_uncertain.length)[0].player_minutes,
  completeness:all.length===2**uncertainPlayers.length};
}
function matchup(integrity){
 if(!integrity?.source_checks_passed)return unavailable('Official roster/injury provenance not verified');
 const home=playerCases(integrity.home),away=playerCases(integrity.away);
 if(!home.available||!away.available)return unavailable([home.reason,away.reason].filter(Boolean).join(' · '));
 return {available:true,validated_probability:false,
  label:'V18 active-roster impact proxy · NOT a win probability or projected score',
  source:'NBA.com active-roster IDs + pregame inferred player impact and minutes',
  historical_franchise_strength_used:false,
  home,away,
  home_minus_away_impact_range:[home.strength_range[0]-away.strength_range[1],
                                home.strength_range[1]-away.strength_range[0]],
  limitation:'Individual impact proxy and minute reallocations are unvalidated; do not combine this number with Elo without walk-forward calibration'};
}
return Object.freeze({matchup,playerCases,allocateMinutes});
});

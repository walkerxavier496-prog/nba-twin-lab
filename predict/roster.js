/* Cross-season rotation-change signals. Research-only.
 * Rotation is inferred from prior appearances, not an official roster/injury feed.
 * Previous-season team rotations must be snapshotted BEFORE the target season.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.TwinRoster=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const aliases={GS:'GSW',NY:'NYK',SA:'SAS',NO:'NOP',UTAH:'UTA',WSH:'WAS',PHO:'PHX',BRK:'BKN',CHO:'CHA'};
const canonical=x=>aliases[String(x||'').toUpperCase()]||String(x||'').toUpperCase();
const finite=x=>x===null||x===undefined||x===''?null:Number.isFinite(Number(x))?Number(x):null;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const logit=p=>Math.log(clamp(p,1e-6,1-1e-6)/(1-clamp(p,1e-6,1-1e-6)));
const sigmoid=x=>1/(1+Math.exp(-clamp(x,-30,30)));
function rotationPlayers(team){
 const players=new Map();
 for(const p of team?.rotation||[]){
  const id=String(p.player_id||'');
  const minutes=finite(p.expected_minutes);
  if(!id||minutes===null||minutes<=0)continue;
  players.set(id,Math.max(minutes,players.get(id)||0));
 }
 return players;
}
function priorRotationIndex(games){
 const last=new Map();
 for(const f of games){
  if(!f?.pregame||!Number.isInteger(f.season)||!f.date)continue;
  for(const side of ['home','away']){
   const team=f.pregame[side],abbr=canonical(f[side]?.abbr);
   if(!abbr||!team||team.as_of!==f.date)continue;
   const players=rotationPlayers(team);
   if(players.size<5)continue;
   const key=f.season+'|'+abbr,previous=last.get(key);
   if(!previous||previous.date<f.date)last.set(key,{date:f.date,players:[...players].map(([player_id,minutes])=>({player_id,minutes}))});
  }
 }
 return last;
}
function retainedRotation(current,prior){
 if(!prior?.players?.length)return null;
 const present=rotationPlayers(current);
 if(present.size<5)return null;
 let total=0,retained=0;
 for(const p of prior.players){
  const minutes=finite(p.minutes);
  if(minutes===null||minutes<=0)continue;
  total+=minutes;
  if(present.has(String(p.player_id)))retained+=minutes;
 }
 return total>=100?clamp(retained/total,0,1):null;
}
function net(s,kind){
 const o=finite(s?.[kind]?.adj_ortg),d=finite(s?.[kind]?.adj_drtg);
 return o===null||d===null?null:o-d;
}
function features(home,away,priorHome,priorAway,baseline){
 const rh=retainedRotation(home,priorHome),ra=retainedRotation(away,priorAway);
 if(rh===null||ra===null)return null;
 const ph=net(home,'prior'),pa=net(away,'prior'),sh=net(home,'season'),sa=net(away,'season');
 if([ph,pa,sh,sa].some(v=>v===null))return null;
 const hg=clamp(finite(home.games)??0,0,82),ag=clamp(finite(away.games)??0,0,82);
 const early=Math.exp(-Math.min(hg,ag)/16);
 const rosterUncertainty=clamp(((1-rh)+(1-ra))/2*early,0,1);
 // Losing last season's players invalidates some of last season's team quality.
 // The coefficient is LEARNED on earlier seasons; no hard-coded probability shift.
 const rosterShock=clamp((((rh-1)*ph)-((ra-1)*pa))/12*early,-2,2);
 // A different signal: current-season adjusted net vs last year's net.
 const currentChange=clamp((((sh-ph)*hg/(hg+8))-((sa-pa)*ag/(ag+8)))/12,-2,2);
 const priorResidual=clamp(((ph-pa)-baseline.margin)/12,-2,2);
 return {
  retentionHome:rh,retentionAway:ra,rosterUncertainty,
  rosterShock,currentChange,priorResidual,
  eloUncertainty:clamp(logit(baseline.homeWin),-4,4)*rosterUncertainty
 };
}
function modelForecast({game,baseline,snapshot,priorRotations,report,now=Date.now()}){
 const unavailable=reason=>({available:false,reason});
 if(!game||!baseline||!snapshot||!priorRotations||!report)return unavailable('Missing roster research inputs');
 if(game.status!=='scheduled')return unavailable('Only scheduled games are eligible');
 const tip=Date.parse(game.date),built=Date.parse(snapshot.built_at_utc);
 if(!Number.isFinite(tip)||!Number.isFinite(built)||built>=tip||tip<now-15*60000)return unavailable('Snapshot must predate game tipoff');
 if(now-built>72*3600000||built-now>3600000)return unavailable('Pregame snapshot is stale or future-dated');
 if(!snapshot.strict_no_future_data||!priorRotations.strict_no_future_data||!report.strict_no_future_data||report.status!=='research_only_not_promoted')return unavailable('Provenance checks failed');
 if(Number(game.season)!==Number(snapshot.coverage?.season)||Number(game.season)!==Number(priorRotations.target_season))return unavailable('Season mismatch');
 if(!Array.isArray(snapshot.teams)||snapshot.teams.length!==30)return unavailable('Incomplete team snapshots');
 const model=report.fits?.[game.season]?.roster;
 if(!model||model.training_games<1000||!Array.isArray(model.names)||!Array.isArray(model.coefficients)||model.coefficients.length!==model.names.length+1)return unavailable('No validated prior-season fitted coefficients');
 const teams=new Map(snapshot.teams.map(t=>[canonical(t.abbr),t]));
 const h=teams.get(canonical(game.home.abbr)),a=teams.get(canonical(game.away.abbr));
 if(!h||!a||h.as_of!==a.as_of)return unavailable('Missing matching pregame team profiles');
 const priors=priorRotations.teams||{};
 const x=features(h,a,priors[canonical(game.home.abbr)],priors[canonical(game.away.abbr)],baseline);
 if(!x)return unavailable('Previous-season rotation coverage unavailable');
 const nH=net(h,'season'),nA=net(a,'season'),pH=net(h,'prior'),pA=net(a,'prior');
 const gamesH=finite(h.games)||0,gamesA=finite(a.games)||0;
 const blend=(c,p,n)=>(n*c+18*p)/(n+18);
 const restH=finite(baseline.homeRest),restA=finite(baseline.awayRest);
 const f={
  elo:clamp(logit(baseline.homeWin),-4,4),
  player:clamp(((finite(h.player_delta)||0)-(finite(a.player_delta)||0))/4,-2,2),
  team:clamp(((blend(nH,pH,gamesH)-blend(nA,pA,gamesA))-baseline.margin)/12,-2,2),
  rest:(restA===0?1:0)-(restH===0?1:0),
  continuity:clamp(((finite(h.rotation_continuity)||0)-(finite(a.rotation_continuity)||0))*2,-2,2),
  rosterShock:x.rosterShock,
  eloUncertainty:x.eloUncertainty,
  currentChange:x.currentChange
 };
 if(model.names.some(k=>!Number.isFinite(f[k]))||model.coefficients.some(v=>!Number.isFinite(v)))return unavailable('Invalid pregame model inputs');
 const z=model.coefficients[0]+model.names.reduce((sum,k,i)=>sum+model.coefficients[i+1]*f[k],0);
 const homeWin=sigmoid(z);
 return {available:true,homeWin,awayWin:1-homeWin,features:f,
  retentionHome:x.retentionHome,retentionAway:x.retentionAway,rosterUncertainty:x.rosterUncertainty,
  sourceBuiltAt:snapshot.built_at_utc,model:'experimental roster-aware; fitted on prior seasons'};
}
return {canonical,rotationPlayers,priorRotationIndex,retainedRotation,features,modelForecast};
});
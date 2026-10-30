/* Shared basketball-science feature definitions.
 * Source: pregame opponent-adjusted team snapshots. Research-only until validated.
 * Browser: window.TwinScience. Node: require('./science.js').
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.TwinScience=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=x=>x===null||x===undefined||x===''?null:Number.isFinite(Number(x))?Number(x):null;
function blended(s,key,priorGames=12){
 const n=clamp(finite(s?.games)??0,0,82),current=finite(s?.season?.[key]),prior=finite(s?.prior?.[key]);
 if(current===null)return prior;
 if(prior===null)return current;
 return (n*current+priorGames*prior)/(n+priorGames);
}
function net(s,section){
 const a=finite(s?.[section]?.adj_ortg),d=finite(s?.[section]?.adj_drtg);
 return a===null||d===null?null:a-d;
}
function matchup(s,o){
 const sr=blended(s,'three_rate'),o3=blended(o,'opp_three_rate');
 const pct=blended(s,'three_pct');
 const ownTov=blended(s,'tov_rate'),forced=blended(o,'opp_tov_rate');
 const orb=blended(s,'orb_rate'),drb=blended(o,'drb_rate');
 const ftr=blended(s,'ftr'),allowedFtr=blended(o,'opp_ftr');
 return {
  shooting:sr===null||o3===null||pct===null?null:((sr+o3)/2)*(pct-.36),
  turnovers:ownTov===null||forced===null?null:-((ownTov+forced)/2),
  rebounding:orb===null||drb===null?null:(orb+1-drb)/2,
  freeThrows:ftr===null||allowedFtr===null?null:(ftr+allowedFtr)/2
 };
}
function scienceFeatures(home,away,h2h=0){
 if(!home||!away||!home.as_of||home.as_of!==away.as_of)throw Error('Mismatched pregame team snapshots');
 const h=matchup(home,away),a=matchup(away,home);
 const difference=(key,scale)=>{
  if(h[key]===null||a[key]===null)return 0;
  return clamp((h[key]-a[key])/scale,-2.5,2.5);
 };
 const trend=s=>{
  const short=net(s,'last5'),season=net(s,'season');
  const n=clamp(finite(s.last5?.games)??0,0,5);
  if(short===null||season===null||n<3)return 0;
  return clamp((short-season)*n/(n+10),-8,8);
 };
 const rest=s=>{
  const d=finite(s.rest_days);
  return d===null?null:clamp(d,0,3);
 };
 const hr=rest(home),ar=rest(away);
 const hp=blended(home,'pace'),ap=blended(away,'pace');
 return {
  momentum:clamp((trend(home)-trend(away))/5,-2,2),
  restScience:hr===null||ar===null?0:clamp((hr-ar)/2,-1.5,1.5),
  shooting:difference('shooting',.025),
  turnovers:difference('turnovers',.035),
  rebounding:difference('rebounding',.05),
  freeThrows:difference('freeThrows',.07),
  pace:hp===null||ap===null?0:clamp((hp-ap)/12,-2,2),
  h2h:clamp(h2h,-1,1)
 };
}
return {blended,net,matchup,scienceFeatures};
});
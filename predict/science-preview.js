/* Strictly pregame research-only form + rest probability preview.
 * Uses frozen prior-season coefficients; never replaces live Elo.
 */
(function(root,factory){
 const science=typeof module==='object'&&module.exports?require('./science.js'):root.TwinScience;
 const api=factory(science);
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.TwinSciencePreview=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(S){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sigmoid=x=>1/(1+Math.exp(-clamp(x,-30,30)));
const logit=p=>Math.log(clamp(p,.000001,.999999)/(1-clamp(p,.000001,.999999)));
const finite=x=>x===null||x===undefined||x===''?null:Number.isFinite(Number(x))?Number(x):null;
const aliases={GS:'GSW',NY:'NYK',SA:'SAS',NO:'NOP',UTAH:'UTA',WSH:'WAS',PHO:'PHX',BRK:'BKN',CHO:'CHA'};
const canonical=x=>aliases[x]||x;
function net(s){
 const current=finite(s.season?.adj_ortg),def=finite(s.season?.adj_drtg);
 const prior=finite(s.prior?.adj_ortg),pdef=finite(s.prior?.adj_drtg);
 const n=finite(s.games)||0;
 if(prior!==null&&pdef!==null&&current!==null&&def!==null)return (n*(current-def)+18*(prior-pdef))/(n+18);
 if(prior!==null&&pdef!==null)return prior-pdef;
 if(current!==null&&def!==null)return current-def;
 return null;
}
function preview({game,baseline,snapshot,report,now=Date.now()}){
 const unavailable=reason=>({available:false,reason});
 if(!S||!game||!baseline||!snapshot||!report)return unavailable('Missing validated research inputs');
 if(game.status!=='scheduled')return unavailable('Science preview is pregame-only');
 const tip=Date.parse(game.date),built=Date.parse(snapshot.built_at_utc);
 if(!Number.isFinite(tip)||!Number.isFinite(built)||tip<=built||tip<now-15*60000)return unavailable('Snapshot is not strictly before the scheduled tipoff');
 if(now-built>72*3600000||built-now>3600000)return unavailable('Research team snapshot is stale or dated in the future');
 if(!snapshot.strict_no_future_data||!report.strict_no_future_data||report.status!=='research_only_not_promoted')return unavailable('Research provenance check failed');
 const model=report.fits?.[game.season]?.form;
 if(!model||JSON.stringify(model.names)!==JSON.stringify(['elo','team','momentum','restScience']))return unavailable('No frozen form model for this season');
 const teams=new Map(snapshot.teams.map(t=>[canonical(t.abbr),t]));
 const h=teams.get(canonical(game.home.abbr)),a=teams.get(canonical(game.away.abbr));
 if(!h||!a||h.as_of!==a.as_of)return unavailable('Matching team snapshots unavailable');
 const hn=net(h),an=net(a);
 if(hn===null||an===null||!Number.isFinite(baseline.homeWin)||!Number.isFinite(baseline.margin))return unavailable('Insufficient pregame efficiency inputs');
 const restH=finite(baseline.homeRest),restA=finite(baseline.awayRest);
 // Use tipoff-specific rest, never the rest-day value stored when the snapshot was built.
 const science=S.scienceFeatures({...h,rest_days:restH},{...a,rest_days:restA});
 const features={
  elo:clamp(logit(baseline.homeWin),-4,4),
  team:clamp((hn-an-baseline.margin)/12,-2,2),
  momentum:science.momentum,
  restScience:science.restScience
 };
 const z=model.coefficients[0]+model.names.reduce((sum,name,i)=>sum+model.coefficients[i+1]*features[name],0);
 if(!Number.isFinite(z))return unavailable('Invalid fitted coefficients');
 const homeWin=sigmoid(z);
 return {available:true,homeWin,awayWin:1-homeWin,features,sourceBuiltAt:snapshot.built_at_utc,
  label:'Experimental form + rest; frozen rolling-origin coefficients; not the live default'};
}
return {preview,net};
});
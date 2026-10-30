/* Experimental V8 live comparison; no impact on the production predictor. */
(async()=>{
'use strict';
const E=window.TwinPredict,el=document.getElementById('live-body'),status=document.getElementById('live-status');
if(!E||!el)return;
const canonical=x=>({GS:'GSW',NY:'NYK',SA:'SAS',NO:'NOP',UTAH:'UTA',WSH:'WAS',PHO:'PHX',BRK:'BKN',CHO:'CHA'}[x]||x);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const sigmoid=x=>1/(1+Math.exp(-clamp(x,-30,30)));
const logit=p=>Math.log(clamp(p,.000001,.999999)/(1-clamp(p,.000001,.999999)));
const get=async url=>{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('Required data unavailable: '+url);return r.json();};
const pct=p=>(p*100).toFixed(1)+'%';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
try{
  const [gameData,context,rotations,report]=await Promise.all([
    get('../data/games.json'),get('../data/context.json'),get('../data/v7-current.json'),get('../data/v8-research-report.json')]);
  if(report.status!=='experimental_not_promoted'||!rotations.strict_no_future_data||rotations.coverage.season!==2027)throw Error('Research data failed validation');
  const age=(Date.now()-Date.parse(rotations.built_at_utc))/3600000;
  if(!Number.isFinite(age)||age< -1||age>72)throw Error('Inferred rotation snapshot is older than 72 hours; live comparison paused');
  const games=E.merge(gameData.games);
  const now=Date.now(),upcoming=games.filter(g=>g.status==='scheduled'&&Date.parse(g.date)>=now-900000&&Date.parse(g.date)<now+8*86400000).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)).slice(0,18);
  if(!upcoming.length){status.textContent='No scheduled games found in the verified snapshot.';return;}
  const rotationsByTeam=new Map(rotations.teams.map(t=>[canonical(t.abbr),t]));
  const profiles={};for(const t of context.teams.filter(t=>t.season===2026)){const p={...t,abbr:canonical(t.abbr)};profiles[canonical(t.abbr)]=p;profiles[t.abbr]=p;}for(const g of games)for(const t of [g.home,g.away])if(profiles[canonical(t.abbr)])profiles[t.abbr]=profiles[canonical(t.abbr)];
  const model=report.training.fits['2027'];
  const net=s=>{
    const c=s.season||{},p=s.prior||{},n=Number(s.games)||0;
    const cur=Number(c.adj_ortg)-Number(c.adj_drtg),prev=Number(p.adj_ortg)-Number(p.adj_drtg);
    if(Number.isFinite(cur)&&Number.isFinite(prev))return (n*cur+18*prev)/(n+18);
    return Number.isFinite(prev)?prev:Number.isFinite(cur)?cur:0;
  };
  const project=(baseline,h,a,homeRest,awayRest,key)=>{
    const features={
      elo:clamp(logit(baseline.homeWin),-4,4),
      player:clamp((Number(h.player_delta||0)-Number(a.player_delta||0))/4,-2,2),
      team:clamp((net(h)-net(a)-baseline.margin)/12,-2,2),
      rest:(awayRest===0?1:0)-(homeRest===0?1:0),
      continuity:clamp((Number(h.rotation_continuity||0)-Number(a.rotation_continuity||0))*2,-2,2)
    };
    const fit=model[key],z=fit.coefficients[0]+fit.names.reduce((s,n,i)=>s+fit.coefficients[i+1]*features[n],0);
    return sigmoid(z);
  };
  let shown=0;
  const rows=[];
  for(const game of upcoming){
    const h=rotationsByTeam.get(canonical(game.home.abbr)),a=rotationsByTeam.get(canonical(game.away.abbr));
    if(!h||!a)continue;
    const state=E.ratings(games,game.date);
    if(state.finals<800)continue;
    const baseline=E.forecast(game,state,profiles);
    const hr=E.restDays(state.teams.get(game.home.id),game.date),ar=E.restDays(state.teams.get(game.away.id),game.date);
    const team=project(baseline,h,a,hr,ar,'team'),combined=project(baseline,h,a,hr,ar,'combined');
    const date=new Date(game.date).toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
    rows.push('<tr><td>'+esc(date)+'</td><td>'+esc(game.away.abbr)+' @ '+esc(game.home.abbr)+'</td><td>'+pct(baseline.homeWin)+'</td><td>'+pct(team)+'</td><td>'+pct(combined)+'</td></tr>');
    shown++;
  }
  if(!shown)throw Error('No games with validated team snapshots and historical baseline');
  el.innerHTML=rows.join('');
  status.textContent='Home-team win probabilities · '+shown+' upcoming games · player status inferred '+Math.round(age)+' hours ago · rest recalculated for each tipoff · experimental only';
}catch(err){status.textContent='Live comparison unavailable: '+err.message;el.innerHTML='<tr><td colspan="5">Historical V8 audit remains available above.</td></tr>';}
})();
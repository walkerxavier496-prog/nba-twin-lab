/* NBA Twin Lab V9. Research-only projections; no verified injury data. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const alias={GS:'GSW',NY:'NYK',SA:'SAS',NO:'NOP',UTAH:'UTA',WSH:'WAS',PHO:'PHX',BRK:'BKN',CHO:'CHA'};
const canonical=x=>alias[x]||x;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const fmt=v=>v===null||!Number.isFinite(v)?'—':v.toFixed(1);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statKeys=['points','rebounds','assists','threes','steals','blocks','turnovers'];
const statNames={points:'Points',rebounds:'Rebounds',assists:'Assists',threes:'3-pointers made',steals:'Steals',blocks:'Blocks',turnovers:'Turnovers'};
const status=(s,bad=false)=>{$('status').textContent=s;$('status').className='status '+(bad?'bad':'good');};
let games=[],teams=new Map(),report=null,selection=null,side='away',builtAt='';
async function get(path){const res=await fetch(path,{cache:'no-store'});if(!res.ok)throw Error('Missing validated dataset: '+path);return res.json();}
function efficiency(team){const season=team.season||{},prior=team.prior||{},n=Number(season.games)||0;
 const c=finite(season.drtg),p=finite(prior.drtg);
 if(c!==null&&p!==null)return (n*c+12*p)/(n+12);
 return c??p??null;
}
function pace(team){const season=team.season||{},prior=team.prior||{},n=Number(season.games)||0;
 const c=finite(season.pace),p=finite(prior.pace);
 return c!==null&&p!==null?(n*c+12*p)/(n+12):c??p??100;
}
function factorFor(team,opponent){
 const expectedPace=clamp((pace(team)+pace(opponent))/2,90,110);
 const paceFactor=clamp(expectedPace/pace(team),.92,1.08);
 const oppDefense=efficiency(opponent);
 const defenseFactor=oppDefense===null?1:clamp(oppDefense/112,.92,1.08);
 return {paceFactor,defenseFactor};
}
function project(player,team,opponent,mode){
 const source=mode==='conditional'?player.stats_if_play:player.stats_unconditional;
 if(!source)return null;
 const {paceFactor,defenseFactor}=factorFor(team,opponent);
 const result={};
 for(const stat of statKeys){
  const value=finite(source[stat]);
  result[stat]=value===null?null:clamp(value*paceFactor*(stat==='points'?defenseFactor:1),0,70);
 }
 return result;
}
function row(player,team,opponent,mode){
 const projected=project(player,team,opponent,mode),prob=finite(player.play_probability);
 const minutes=mode==='conditional'?finite(player.minutes_if_play):finite(player.expected_minutes);
 const warning=prob!==null&&prob<.6?'warning':'';
 const vals=statKeys.map(k=>'<td>'+fmt(projected?.[k]??null)+'</td>').join('');
 return '<tr><td class="playername">'+esc(player.name)+'<small>'+esc(player.status||'inferred')+'</small></td>'+
 '<td class="'+warning+'">'+(prob===null?'—':Math.round(prob*100)+'%')+'</td><td>'+fmt(minutes)+'</td>'+vals+'</tr>';
}
function draw(){
 const game=games.find(g=>String(g.id)===selection);if(!game){$('players').innerHTML='<tr><td colspan="10">No upcoming matchup selected.</td></tr>';return;}
 const home=teams.get(canonical(game.home.abbr)),away=teams.get(canonical(game.away.abbr));
 if(!home||!away){$('players').innerHTML='<tr><td colspan="10">Team player data unavailable.</td></tr>';return;}
 const team=side==='home'?home:away,opp=side==='home'?away:home,mode=$('mode').value;
 $('away').textContent=game.away.name||game.away.abbr;$('home').textContent=game.home.name||game.home.abbr;
 $('away').classList.toggle('selected',side==='away');$('home').classList.toggle('selected',side==='home');
 const date=new Date(game.date).toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
 $('game-meta').textContent=esc(date)+' · '+team.abbr+' projections vs '+opp.abbr+' · '+team.rotation.length+' inferred rotation players';
 const rows=team.rotation.filter(p=>p.stats_if_play&&p.observed_games>=3).map(p=>row(p,team,opp,mode));
 $('players').innerHTML=rows.length?rows.join(''):'<tr><td colspan="10">Insufficient verified prior player appearances to issue projections.</td></tr>';
}
function audit(){
 if(!report||!report.strict_no_future_data){$('audit').innerHTML='<tr><td colspan="5">Historical player audit not yet available.</td></tr>';return;}
 const seasons=['2022','2023','2024','2025','2026'],rows=[];
 for(const key of statKeys){
  let n=0,sum=0,baseline=0;
  for(const season of seasons){
   const r=report.by_season?.[season]?.stats?.[key];
   if(!r||!r.count)continue;
   n+=r.count;sum+=r.count*r.mae;baseline+=r.count*r.naive_last10_mae;
  }
  if(!n)continue;
  const a=sum/n,b=baseline/n;
  rows.push('<tr><td>'+statNames[key]+'</td><td>'+n.toLocaleString()+'</td><td>'+fmt(a)+'</td><td>'+fmt(b)+'</td><td class="'+(a>b?'warning':'')+'">'+(a-b>=0?'+':'')+(a-b).toFixed(2)+'</td></tr>');
 }
 $('audit').innerHTML=rows.length?rows.join(''):'<tr><td colspan="5">No validated audit rows.</td></tr>';
 $('audit-games').textContent=seasons.reduce((n,s)=>n+(report.by_season?.[s]?.participation?.matched_projections||0),0).toLocaleString();
 $('audit-note').textContent='Historical conditional-on-playing audit, 2021–22 to 2025–26. These are matched appearances among pregame top-12 rotations, not every rostered player or DNP. Baseline is the unweighted recent observed per-game average. No injury-status validation or prediction intervals. '+report.limitations.join(' ');
}
function init(snapshot,gameData){
 if(!snapshot.strict_no_future_data||snapshot.coverage?.season!==2027||!Array.isArray(snapshot.teams)||snapshot.teams.length!==30)throw Error('Player data failed source/coverage checks');
 builtAt=snapshot.built_at_utc;const age=(Date.now()-Date.parse(builtAt))/3600000;
 if(!Number.isFinite(age)||age< -1)throw Error('Invalid player snapshot timestamp');
 if(age>96)throw Error('Player data is more than four days old. Projections paused until the verified refresh completes.');
 for(const t of snapshot.teams)teams.set(canonical(t.abbr),t);
 $('team-count').textContent=teams.size;
 $('snapshot-date').textContent=new Date(builtAt).toLocaleDateString();
 const now=Date.now();
 games=gameData.games.filter(g=>g.status==='scheduled'&&Date.parse(g.date)>=now-15*60000&&Date.parse(g.date)<=now+14*86400000&&teams.has(canonical(g.home.abbr))&&teams.has(canonical(g.away.abbr))).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
 if(!games.length){$('matchup').innerHTML='<option value="">No upcoming games in validated schedule</option>';status('Player data loaded, but no upcoming games are available in the current schedule.');return;}
 $('matchup').innerHTML=games.map(g=>'<option value="'+esc(g.id)+'">'+esc(new Date(g.date).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))+' · '+esc(g.away.abbr)+' @ '+esc(g.home.abbr)+'</option>').join('');
 selection=String(games[0].id);
 status('Player projections ready · '+games.length+' upcoming fixtures · inferred availability · snapshot '+new Date(builtAt).toLocaleString()+(age>48?' · refresh may be delayed':''));
 draw();
}
$('matchup').addEventListener('change',e=>{selection=e.target.value;draw();});
$('mode').addEventListener('change',draw);
$('away').addEventListener('click',()=>{side='away';draw();});
$('home').addEventListener('click',()=>{side='home';draw();});
Promise.allSettled([get('../data/v7-current.json'),get('../data/games.json'),get('../data/v9-player-report.json')]).then(results=>{
 const [snap,gamesResult,auditResult]=results;
 if(auditResult.status==='fulfilled'){report=auditResult.value;audit();}
 else{$('audit-note').textContent='The historical audit is still being generated. No accuracy claims are available until its verified publication.';}
 if(snap.status!=='fulfilled'||gamesResult.status!=='fulfilled')throw Error('Validated game and player snapshots are required');
 init(snap.value,gamesResult.value);
}).catch(e=>{status('Player predictor unavailable: '+e.message,true);$('players').innerHTML='<tr><td colspan="10">No predictions displayed without validated, sufficiently fresh data.</td></tr>';});
})();
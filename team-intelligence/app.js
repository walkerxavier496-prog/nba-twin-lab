/* Descriptive pregame basketball intelligence; does not issue unvalidated picks. */
(()=>{'use strict';
const S=window.TwinScience,$=id=>document.getElementById(id);
const alias={GS:'GSW',NY:'NYK',SA:'SAS',NO:'NOP',UTAH:'UTA',WSH:'WAS',PHO:'PHX',BRK:'BKN',CHO:'CHA'};
const canonical=x=>alias[x]||x;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=x=>x===null||x===undefined||x===''?null:Number.isFinite(Number(x))?Number(x):null;
const fmt=(x,d=1)=>x===null||!Number.isFinite(x)?'—':x.toFixed(d);
const pct=x=>x===null||!Number.isFinite(x)?'—':(x*100).toFixed(1)+'%';
const sign=x=>x>0?'+':'';
let teams=new Map(),games=[],snapshot=null;
const prefs=window.TwinTeamPrefs||null,media=window.NbaMedia||null;
let venue='home';
const logo=abbr=>media?.image?.(abbr,{size:'large',label:abbr})||'<span class="club-mark">'+esc(abbr)+'</span>';
const fullName=abbr=>prefs?.names?.[abbr]||abbr;
const future=()=>games.filter(g=>g.status==='scheduled'&&Date.parse(g.date)>Date.now()-15*60000&&Date.parse(g.date)<Date.now()+45*86400000&&teams.has(canonical(g.home.abbr))&&teams.has(canonical(g.away.abbr))).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));

async function get(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('Source unavailable: '+url);return r.json();}
function opponentChoices(prefer=''){
 const mine=$('my-team').value,current=prefer||$('opponent').value,list=[...teams.keys()].sort();
 $('opponent').innerHTML='<option value="">Select opponent</option>'+list.filter(t=>t!==mine).map(t=>'<option value="'+esc(t)+'">'+esc(fullName(t))+'</option>').join('');
 $('opponent').value=current&&current!==mine&&teams.has(current)?current:list.find(t=>t!==mine)||'';
}
function fixtureChoices(preserve=false){
 const team=$('my-team').value,previous=preserve?$('fixture').value:'';
 const relevant=future().filter(g=>!team||[canonical(g.home.abbr),canonical(g.away.abbr)].includes(team));
 $('fixture').innerHTML='<option value="">Manual team comparison</option>'+relevant.map(g=>'<option value="'+esc(g.id)+'">'+esc(new Date(g.date).toLocaleString('en-AU',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}))+' · '+esc(g.away.abbr)+' @ '+esc(g.home.abbr)+'</option>').join('');
 if(relevant.some(g=>String(g.id)===previous))$('fixture').value=previous;
 return relevant;
}
function sync(){
 const fixture=games.find(g=>String(g.id)===$('fixture').value);
 if(fixture){
  const h=canonical(fixture.home.abbr),a=canonical(fixture.away.abbr);
  if(![h,a].includes($('my-team').value))$('my-team').value=h;
  venue=$('my-team').value===h?'home':'away';
  opponentChoices($('my-team').value===h?a:h);
 }
 const fav=$('my-team').value,opp=$('opponent').value;
 $('home').value=fav&&opp?(venue==='home'?fav:opp):'';
 $('away').value=fav&&opp?(venue==='home'?opp:fav):'';
 for(const k of ['home','away']){$('venue-'+k).setAttribute('aria-pressed',String(k===venue));$('venue-'+k).disabled=!!fixture;}
 $('venue-note').textContent=fixture?'Scheduled matchup: using actual NBA home/away venue.':'Manual comparison: choose whether your team is at home or away.';
 if(fav&&opp&&fav!==opp){
  $('matchup-identity').innerHTML=logo(fav)+'<strong>'+esc(fav)+'</strong><span class="vs">VS</span><strong>'+esc(opp)+'</strong>'+logo(opp);
  $('matchup-context').innerHTML='<b>'+esc(fullName(fav))+'</b> vs '+esc(fullName(opp))+
   '<div>'+(fixture?'Actual scheduled matchup: '+esc(new Date(fixture.date).toLocaleString('en-AU',{dateStyle:'medium',timeStyle:'short'})):'Manual statistical comparison · hypothetical venue')+'</div>'+
   '<div>Your team '+(venue==='home'?'at home':'away')+' · pregame snapshot metrics</div>';
 }else{
  $('matchup-identity').textContent='Select your team and an opponent';
  $('matchup-context').textContent='Choose the club you support. It will also personalise the rest of NBA Twin Lab.';
 }
 draw();
}
function options(){
 const list=[...teams.keys()].sort(),html=list.map(t=>'<option value="'+esc(t)+'">'+esc(fullName(t))+'</option>').join('');
 $('my-team').innerHTML='<option value="">Choose your team</option>'+html;
 $('home').innerHTML='<option value=""></option>'+html;
 $('away').innerHTML='<option value=""></option>'+html;
 const saved=canonical(prefs?.get?.()||'');
 $('my-team').value=teams.has(saved)?saved:'';
 opponentChoices();
 const upcoming=fixtureChoices();
 const first=upcoming[0];
 if(first&&saved&&[canonical(first.home.abbr),canonical(first.away.abbr)].includes(saved)){
  $('fixture').value=String(first.id);
 }else if(saved){
  const next=upcoming.find(g=>[canonical(g.home.abbr),canonical(g.away.abbr)].includes(saved));
  if(next)$('fixture').value=String(next.id);
 }
 sync();
}
function metric(label,detail,h,a,format=fmt){
 return '<tr><td>'+esc(label)+(detail?'<small>'+esc(detail)+'</small>':'')+'</td><td>'+format(h)+'</td><td>'+format(a)+'</td></tr>';
}
function headToHead(home,away,asOf){
 const h=canonical(home),a=canonical(away),season=new Date(asOf).getUTCFullYear()+(new Date(asOf).getUTCMonth()>=6?1:0);
 const meetings=games.filter(g=>g.status==='final'&&Date.parse(g.date)<Date.parse(asOf)&&g.season>=season-2&&
  [canonical(g.home.abbr),canonical(g.away.abbr)].sort().join('|')===[h,a].sort().join('|')).sort((x,y)=>Date.parse(y.date)-Date.parse(x.date)).slice(0,8);
 const wins=meetings.filter(g=>canonical(g.home.abbr)===h?g.homeScore>g.awayScore:g.awayScore>g.homeScore).length;
 return meetings.length?home+' won '+wins+' of the last '+meetings.length+' prior meetings in the past two seasons. This is descriptive and not an extra rivalry bonus.':'No verified recent head-to-head meetings in the available dataset.';
}
function draw(){
 const home=teams.get($('home').value),away=teams.get($('away').value);
 if(!home||!away||home.abbr===away.abbr){$('home-name').textContent='Team A';$('away-name').textContent='Team B';$('metrics').innerHTML='<tr><td colspan="3">Select your team and another NBA opponent.</td></tr>';$('factors').innerHTML='<article>Select two different teams to compare their styles.</article>';$('h2h').textContent='Historical matchups appear after selecting two teams.';return;}
 const mine=$('my-team').value;
 $('home-name').textContent=home.abbr+(home.abbr===mine?' · YOUR TEAM':' · HOME');
 $('away-name').textContent=away.abbr+(away.abbr===mine?' · YOUR TEAM':' · AWAY');
 $('home-name').setAttribute('data-favourite',String(home.abbr===mine));
 $('away-name').setAttribute('data-favourite',String(away.abbr===mine));
 const bl=(s,k)=>S.blended(s,k);
 const net=s=>{const o=bl(s,'adj_ortg'),d=bl(s,'adj_drtg');return o===null||d===null?null:o-d;};
 const last=s=>S.net(s,'last5'),season=s=>S.net(s,'season');
 const rows=[
  metric('Adjusted offensive rating','Higher is better',bl(home,'adj_ortg'),bl(away,'adj_ortg')),
  metric('Adjusted defensive rating','Lower is better',bl(home,'adj_drtg'),bl(away,'adj_drtg')),
  metric('Adjusted net rating','Offense minus defense',net(home),net(away)),
  metric('Last-five adjusted net','Recent opponents accounted for',last(home),last(away)),
  metric('Recent efficiency change','Last-five net minus season net; descriptive only',last(home)===null||season(home)===null?null:last(home)-season(home),last(away)===null||season(away)===null?null:last(away)-season(away),x=>x===null?'—':sign(x)+fmt(x)),
  metric('Possessions per game','Pace, not a direct advantage',bl(home,'pace'),bl(away,'pace')),
  metric('Effective field-goal %','Accounts for three-point value',bl(home,'efg'),bl(away,'efg'),pct),
  metric('Three-point attempt share','3PA / total field-goal attempts',bl(home,'three_rate'),bl(away,'three_rate'),pct),
  metric('Three-point accuracy','Three-pointers made / attempted',bl(home,'three_pct'),bl(away,'three_pct'),pct),
  metric('Turnover rate','Lower usually better',bl(home,'tov_rate'),bl(away,'tov_rate'),pct),
  metric('Offensive rebound rate','Share of available offensive rebounds',bl(home,'orb_rate'),bl(away,'orb_rate'),pct),
  metric('Free-throw rate','Free-throw attempts per field-goal attempt',bl(home,'ftr'),bl(away,'ftr'),x=>x===null?'—':fmt(x,3))
 ];
 $('metrics').innerHTML=rows.join('');
 const a=S.matchup(home,away),b=S.matchup(away,home);
 const factors=[
  ['Shooting efficiency','Combines each offense’s eFG% with the opponent’s eFG% allowed.','shooting',pct],
  ['Three-point shot profile','Combines each offense’s 3PA share and accuracy with the opponent’s 3PA share allowed.','threePointStyle',x=>fmt(x,3)],
  ['Turnover pressure','Combines ball-security tendency with opponent turnover-forcing rate.','turnovers',x=>fmt(-x*100,1)+'%'],
  ['Offensive glass','Expected offensive rebound opportunity from own ORB and opponent defensive rebounding.','rebounding',pct],
  ['Free-throw opportunities','Own free-throw rate paired with opponent free throws allowed.','freeThrows',x=>fmt(x,3)]
 ];
 $('factors').innerHTML=factors.map(([title,desc,key,format])=>
  '<article><strong>'+title+'</strong><p>'+desc+'</p><span>'+esc(home.abbr)+': '+format(a[key])+' · '+esc(away.abbr)+': '+format(b[key])+'</span></article>').join('');
 const g=games.find(g=>String(g.id)===$('fixture').value);
 const asOf=g?.date||new Date().toISOString();
 $('h2h').textContent=headToHead(home.abbr,away.abbr,asOf);
 $('source').textContent='Team snapshots as of '+snapshot.teams[0].as_of+' · '+home.games+' / '+away.games+' current-season games · no confirmed lineups';
}
$('my-team').addEventListener('change',()=>{
 const mine=$('my-team').value;
 prefs?.set?.(mine);
 opponentChoices();const upcoming=fixtureChoices();
 const next=upcoming.find(g=>[canonical(g.home.abbr),canonical(g.away.abbr)].includes(mine));
 if(next)$('fixture').value=String(next.id);
 sync();
});
$('opponent').addEventListener('change',()=>{$('fixture').value='';sync();});
$('fixture').addEventListener('change',()=>sync());
for(const side of ['home','away'])$('venue-'+side).addEventListener('click',()=>{venue=side;$('fixture').value='';sync();});
document.addEventListener('twinlab:teamchange',e=>{
 if(!teams.size)return;
 const team=canonical(e.detail?.team||'');
 if($('my-team').value===team)return;
 $('my-team').value=teams.has(team)?team:'';
 opponentChoices();fixtureChoices();sync();
});
Promise.all([get('../data/v7-current.json'),get('../data/games.json')]).then(([snap,results])=>{
 if(!S||!snap.strict_no_future_data||snap.coverage?.season!==2027||snap.teams.length!==30)throw Error('Verified team snapshot is missing or incomplete');
 snapshot=snap;games=results.games||[];
 for(const t of snap.teams)teams.set(canonical(t.abbr),t);
 const age=(Date.now()-Date.parse(snap.built_at_utc))/3600000;
 if(!Number.isFinite(age)||age< -1)throw Error('Invalid snapshot timestamp');
 const stale=age>72;
 $('status').textContent='Team data '+new Date(snap.built_at_utc).toLocaleString()+(stale?' · Snapshot is over 72 hours old; comparisons are historical, not live.':' · Historical profiles ready. No live model changes.');
 if(stale)$('status').classList.add('warning');
 options();draw();
}).catch(e=>{$('status').textContent='Team Intelligence unavailable: '+e.message;$('status').classList.add('warning');$('metrics').innerHTML='<tr><td colspan="3">Verified data required. No estimates fabricated.</td></tr>';});
})();
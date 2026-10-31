(()=>{'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const EAST=new Set(['ATL','BOS','BKN','CHA','CHI','CLE','DET','IND','MIA','MIL','NY','ORL','PHI','TOR','WSH']);
const WEST=new Set(['DAL','DEN','GS','HOU','LAC','LAL','MEM','MIN','NO','OKC','PHX','POR','SAC','SA','UTAH']);
const canon=x=>window.TwinTeamPrefs?.canonical?.(x)||String(x||'').toUpperCase();
function records(d){
 if(!Array.isArray(d?.games))throw Error('Missing verified NBA games');
 const names=new Map(),matches=new Map();
 const max=Math.max(...d.games.map(g=>Number(g.season)||0));
 for(const g of d.games){
  for(const team of [g.away,g.home])if(team?.abbr)names.set(canon(team.abbr),team.name);
  if(Number(g.season)!==max||g.status!=='final')continue;
  if(!Number.isFinite(Number(g.homeScore))||!Number.isFinite(Number(g.awayScore))||!g.id)continue;
  matches.set(String(g.id),g);
 }
 const teams=new Map();
 for(const id of [...EAST,...WEST])teams.set(id,{abbr:id,name:names.get(id)||id,w:0,l:0});
 for(const g of matches.values()){
  const h=teams.get(canon(g.home.abbr)),a=teams.get(canon(g.away.abbr));
  if(!h||!a||g.homeScore===g.awayScore)continue;
  if(g.homeScore>g.awayScore){h.w++;a.l++}else{a.w++;h.l++}
 }
 const rows=conference=>[...conference].map(k=>teams.get(k)).sort((a,b)=>{
  const pa=a.w/(a.w+a.l)||0,pb=b.w/(b.w+b.l)||0;return pb-pa||b.w-a.w||a.l-b.l||a.name.localeCompare(b.name)
 });
 return {season:max,east:rows(EAST),west:rows(WEST),completed:matches.size};
}
function render(target,items){
 const favourite=window.TwinTeamPrefs?.get?.();
 target.innerHTML=items.map((t,i)=>{
  const uri=window.NbaMedia?.image?.(t.abbr,{size:'small',label:t.abbr})||'';
  const pct=t.w+t.l?(t.w/(t.w+t.l)).toFixed(3):'—';
  return '<tr'+(t.abbr===favourite?' class="league-me"':'')+'><td>'+(i+1)+'</td><td><span class="league-team">'+uri+esc(t.name)+'</span></td><td>'+t.w+'</td><td>'+t.l+'</td><td>'+pct+'</td></tr>';
 }).join('');
}
let snapshot=null;
function update(){
 if(!snapshot)return;
 render($('league-east'),snapshot.east);render($('league-west'),snapshot.west);
}
async function init(){
 try{
  const res=await fetch('../data/games.json',{cache:'no-store'});
  if(!res.ok)throw Error('Game results source unavailable');
  const data=await res.json();
  snapshot=records(data);update();
  const time=Number.isFinite(Date.parse(data.built_at_utc))?
   new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Melbourne',dateStyle:'medium',timeStyle:'short'}).format(new Date(data.built_at_utc)):'time unknown';
  $('league-date').textContent=snapshot.completed+' confirmed finals · dataset checked '+time;
 }catch(e){$('league-date').textContent='Standings unavailable: '+e.message;$('league-east').innerHTML='<tr><td colspan="5">Could not verify results.</td></tr>';$('league-west').innerHTML='<tr><td colspan="5">Could not verify results.</td></tr>'}
}
document.addEventListener('twinlab:teamchange',update);
init();
window.NbaStandings=Object.freeze({records});
})();
/* NBA Twin Lab League Intelligence V17
 * Actual confirmed ESPN final records, not official tie-break seed placement.
 * NBA Cup groups derived ONLY from designated official 2026 Cup-night matchups.
 */
(()=>{'use strict';
const $=id=>document.getElementById(id),escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const EAST=new Set(['ATL','BOS','BKN','CHA','CHI','CLE','DET','IND','MIA','MIL','NY','ORL','PHI','TOR','WSH']);
const WEST=new Set(['DAL','DEN','GS','HOU','LAC','LAL','MEM','MIN','NO','OKC','PHX','POR','SAC','SA','UTAH']);
const DIVISIONS={
 Atlantic:['BOS','BKN','NY','PHI','TOR'],Central:['CHI','CLE','DET','IND','MIL'],Southeast:['ATL','CHA','MIA','ORL','WSH'],
 Northwest:['DEN','MIN','OKC','POR','UTAH'],Pacific:['GS','LAC','LAL','PHX','SAC'],Southwest:['DAL','HOU','MEM','NO','SA']
};
const DIV=Object.fromEntries(Object.entries(DIVISIONS).flatMap(([k,teams])=>teams.map(t=>[t,k])));
const canon=x=>window.TwinTeamPrefs?.canonical?.(x)||String(x||'').toUpperCase();
const numeric=x=>typeof x==='number'&&Number.isFinite(x)?x:typeof x==='string'&&x.trim()!==''&&Number.isFinite(Number(x))?Number(x):null;
const formatAvg=n=>Number.isFinite(n)?n.toFixed(1):'—';
const recordText=(w,l)=>w+'-'+l;
const pct=t=>t.w+t.l?t.w/(t.w+t.l):null;
function records(d){
 if(!Array.isArray(d?.games))throw Error('Missing verified NBA games');
 const max=Math.max(...d.games.map(g=>Number(g.season)||0));
 const teams=new Map(),names=new Map(),finals=new Map();
 for(const code of [...EAST,...WEST])teams.set(code,{
  abbr:code,name:code,div:DIV[code],w:0,l:0,homeW:0,homeL:0,awayW:0,awayL:0,
  confW:0,confL:0,divW:0,divL:0,pf:0,pa:0,played:0,recent:[],streak:'—'
 });
 for(const g of d.games){
  for(const t of [g.home,g.away])if(t?.abbr&&t?.name)names.set(canon(t.abbr),t.name);
  if(Number(g.season)!==max||g.status!=='final')continue;
  const hs=numeric(g.homeScore),as=numeric(g.awayScore);
  if(!g.id||hs===null||as===null||hs===as)continue;
  finals.set(String(g.id),g);
 }
 const ordered=[...finals.values()].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
 const sameConf=(a,b)=>(EAST.has(a)&&EAST.has(b))||(WEST.has(a)&&WEST.has(b));
 for(const g of ordered){
  const h=canon(g.home.abbr),a=canon(g.away.abbr),hs=Number(g.homeScore),as=Number(g.awayScore),home=teams.get(h),away=teams.get(a);
  if(!home||!away)continue;
  const hw=hs>as;
  for(const [t,isHome,win,pf,pa,other]of[[home,true,hw,hs,as,a],[away,false,!hw,as,hs,h]]){
   t.played++;t.pf+=pf;t.pa+=pa;t.recent.push(win?'W':'L');
   if(win)t.w++;else t.l++;
   if(isHome){if(win)t.homeW++;else t.homeL++}
   else if(win)t.awayW++;else t.awayL++;
   if(sameConf(t.abbr,other)){if(win)t.confW++;else t.confL++}
   if(DIV[t.abbr]===DIV[other]){if(win)t.divW++;else t.divL++}
  }
 }
 for(const t of teams.values()){
  t.name=names.get(t.abbr)||window.TwinTeamPrefs?.names?.[t.abbr]||t.abbr;
  t.last10=t.recent.slice(-10);
  t.last10W=t.last10.filter(s=>s==='W').length;
  t.last10L=t.last10.filter(s=>s==='L').length;
  const last=t.recent[t.recent.length-1];
  if(last){let streak=0;for(let i=t.recent.length-1;i>=0&&t.recent[i]===last;i--)streak++;t.streak=last+streak}
  t.ppg=t.played?t.pf/t.played:null;
  t.oppg=t.played?t.pa/t.played:null;
  t.diffg=t.played?(t.pf-t.pa)/t.played:null;
 }
 const compareTeam=(a,b)=>(pct(b)??-1)-(pct(a)??-1)||b.w-a.w||a.l-b.l||a.name.localeCompare(b.name);
 const east=[...EAST].map(x=>teams.get(x)).sort(compareTeam),west=[...WEST].map(x=>teams.get(x)).sort(compareTeam);
 for(const conference of [east,west]){
  const leader=conference[0];
  for(const [i,t] of conference.entries()){
   t.rank=i+1;
   t.gb=t.played&&leader.played?Math.max(0,(leader.w-t.w+t.l-leader.l)/2):null;
  }
 }
 return {season:max,east,west,completed:finals.size,sourceDate:d.built_at_utc,officialSeeding:false};
}
const logo=t=>window.NbaMedia?.image?.(t,{size:'small',label:t})||'<b>'+escape(t)+'</b>';
const val=(display,value)=>'<td'+(Number.isFinite(value)?' data-sort-value="'+value+'"':'')+'>'+escape(display)+'</td>';
function render(target,items,filter=''){
 if(!target)return;
 const fav=window.TwinTeamPrefs?.get?.();
 const visible=items.filter(t=>!filter||t.name.toLowerCase().includes(filter)||t.abbr.toLowerCase().includes(filter));
 if(!visible.length){target.innerHTML='<tr><td colspan="15">No matching teams.</td></tr>';return}
 target.innerHTML=visible.map(t=>{
  const line=[
   val(t.rank,t.rank),
   '<td data-sort-value="'+escape(t.name)+'"><div class="league-team-cell"><a class="league-team" href="../team-intelligence/?team='+encodeURIComponent(t.abbr)+'">'+logo(t.abbr)+'<span>'+escape(t.name)+'</span></a><button type="button" class="watch-team-btn" data-watch-team="'+escape(t.abbr)+'" aria-label="Follow '+escape(t.name)+'">☆</button></div></td>',
   val(t.w,t.w),val(t.l,t.l),val(pct(t)===null?'—':pct(t).toFixed(3),pct(t)),
   val(t.gb===null?'—':t.gb.toFixed(1),t.gb),
   val(recordText(t.homeW,t.homeL),t.homeW),val(recordText(t.awayW,t.awayL),t.awayW),
   val(recordText(t.confW,t.confL),t.confW),val(recordText(t.divW,t.divL),t.divW),
   val(t.played?recordText(t.last10W,t.last10L):'—',t.last10W),
   '<td data-sort-value="'+(t.streak==='—'?'':(t.streak[0]==='W'?1:-1)*Number(t.streak.slice(1)))+'">'+escape(t.streak)+'</td>',
   val(formatAvg(t.ppg),t.ppg),val(formatAvg(t.oppg),t.oppg),val(formatAvg(t.diffg),t.diffg)
  ];
  return '<tr'+(t.abbr===fav?' class="league-me"':'')+'>'+line.join('')+'</tr>';
 }).join('');
}
let snapshot=null,cupSnapshot=null;
function showStandings(){
 if(!snapshot)return;
 const filter=String($('league-team-search')?.value||'').trim().toLowerCase();
 render($('league-east'),snapshot.east,filter);render($('league-west'),snapshot.west,filter);
 window.TwinWatchlist?.sync?.();
 window.TwinSort?.scan?.();
}
function renderCupGroup(group,rows,fixtures){
 const possible=rows.reduce((n,r)=>n+r.played,0)/2;
 const body=rows.map(t=>{
  const remaining=t.remaining,raw=t.played?t.rawPd:null;
  return '<tr><td data-sort-value="'+escape(window.TwinTeamPrefs?.names?.[t.team]||t.team)+'"><span class="league-team">'+logo(t.team)+'<span>'+escape(window.TwinTeamPrefs?.names?.[t.team]||t.team)+'</span></span></td>'+
   val(t.w,t.w)+val(t.l,t.l)+val(t.remaining,t.remaining)+val(t.played?t.rawPd:'—',raw)+val(t.played?t.rawPf:'—',t.played?t.rawPf:null)+'</tr>';
 }).join('');
 const games=fixtures.filter(g=>g.status==='final').length;
 return '<article class="cup-group-card"><header><div><span>2026 CUP / '+escape(group.toUpperCase())+'</span><h4>'+escape(group.startsWith('East')?'EASTERN':'WESTERN')+' · GROUP '+escape(group.split(' ')[1])+'</h4></div><small>'+games+' / 10 FINALS</small></header>'+
 '<div class="league-table-scroller"><table><thead><tr><th>TEAM</th><th>W</th><th>L</th><th>LEFT</th><th>RAW DIFF</th><th>RAW PTS</th></tr></thead><tbody>'+body+'</tbody></table></div></article>';
}
function renderCup(){
 if(!cupSnapshot||!$('cup-groups-grid'))return;
 const c=cupSnapshot;
 $('cup-groups-grid').innerHTML=Object.entries(c.groups).map(([k,rows])=>renderCupGroup(k,rows,c.fixtures[k])).join('');
 $('cup-source').textContent='Verified Cup game identification: '+c.games.length+' fixtures · '+c.confirmedFinals+' completed in current results snapshot. Raw scores are not certified overtime-adjusted Cup tiebreakers.';
 const html=['East','West'].map(conf=>{
  const candidates=Object.entries(c.groups).filter(([k])=>k.startsWith(conf)).flatMap(([k,rows])=>rows.slice(1).map(t=>({...t,group:k})));
  candidates.sort((a,b)=>b.w-a.w||a.l-b.l||b.rawPd-a.rawPd);
  return '<article class="cup-wildcard-card"><h4>'+conf.toUpperCase()+' / ELIGIBLE RUNNERS-UP</h4><p>Provisional, not a qualified wild card</p>'+
   candidates.slice(0,5).map(t=>'<div class="cup-runner"><span>'+logo(t.team)+escape(t.team)+' <small>'+escape(t.group)+'</small></span><strong>'+t.w+'-'+t.l+'</strong></div>').join('')+'</article>';
 }).join('');
 $('cup-wildcard-panels').innerHTML=html;
 window.TwinWatchlist?.sync?.();
 window.TwinSort?.scan?.();
}
function activate(tab){
 for(const key of ['standings','cup']){
  const selected=key===tab,button=$('league-tab-'+key),panel=$('view-'+key);
  if(!button||!panel)continue;
  button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;panel.hidden=!selected;
 }
 if(tab==='cup')renderCup();
 try{history.replaceState(null,'','#'+(tab==='cup'?'nba-cup':'regular-season'))}catch(e){}
}
function listen(){
 for(const btn of document.querySelectorAll?.('[data-league-tab]')||[]){
  btn.addEventListener('click',()=>activate(btn.dataset.leagueTab));
  btn.addEventListener('keydown',e=>{
   if(!['ArrowLeft','ArrowRight'].includes(e.key))return;
   e.preventDefault();const other=btn.dataset.leagueTab==='cup'?'standings':'cup';activate(other);$('league-tab-'+other).focus();
  });
 }
 $('league-team-search')?.addEventListener?.('input',showStandings);
 document.addEventListener('twinlab:teamchange',()=>{showStandings();renderCup()});
}
async function init(){
 listen();
 if(typeof location!=='undefined'&&String(location.hash||'').includes('cup'))activate('cup');
 try{
  const response=await fetch('../data/games.json',{cache:'no-store'});
  if(!response.ok)throw Error('No verified game results feed');
  const raw=await response.json();
  snapshot=records(raw);cupSnapshot=window.TwinCup2026?.calculate(raw.games)||null;
  $('league-finals').textContent=String(snapshot.completed);
  const checked=Number.isFinite(Date.parse(raw.built_at_utc))?
   new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Melbourne',dateStyle:'medium',timeStyle:'short'}).format(new Date(raw.built_at_utc)):'Timestamp unavailable';
  $('league-last-updated').textContent=checked;
  $('league-date').textContent=snapshot.completed+' confirmed NBA regular-season finals · dataset checked '+checked+' · reconstructed, not official playoff seeding';
  showStandings();renderCup();
 }catch(e){
  if($('league-date'))$('league-date').textContent='Verified NBA results unavailable: '+e.message;
  for(const id of ['league-east','league-west'])if($(id))$(id).innerHTML='<tr><td colspan="15">Unable to verify standings right now.</td></tr>';
  if($('cup-source'))$('cup-source').textContent='Cup group results unavailable. Official group memberships and bracket structure remain visible.';
 }
}
window.NbaStandings=Object.freeze({records,activate,render});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
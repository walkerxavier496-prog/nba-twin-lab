/* Player Centre: render only source-backed actual ESPN values, or clearly
 * labelled Twin Lab inferred projections. ESPN ID is NOT an NBA player ID. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params=new URLSearchParams(location.search),id=String(params.get('id')||'').trim(),
 team=window.TwinTeamPrefs?.canonical?.(params.get('team')||'')||String(params.get('team')||''),
 name=String(params.get('name')||'NBA Player').slice(0,80);
const good=/^\d{1,12}$/.test(id);
const key=x=>String(x||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const val=x=>x!==''&&x!==undefined&&x!==null&&Number.isFinite(Number(x))?Number(x):null;
const fmt=(x,d=1)=>val(x)===null?'—':Number(x).toFixed(d);
const metric=(label,value,note)=>'<div class="team-metric"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(note)+'</small></div>';
const teamName=window.TwinTeamPrefs?.names?.[team]||team||'NBA';
let verifiedName='';
function renderHero(){
 const shown=verifiedName||name;
 document.title=shown+' · Player Centre · NBA Twin Lab';
 $('player-name').textContent=shown;
 $('player-team').textContent=teamName+' · ESPN athlete identity '+(good?id:'not verified');
 $('player-team-link').href='../team/?team='+encodeURIComponent(team||'BOS');
 $('player-team-link').textContent='EXPLORE '+teamName.toUpperCase()+' ↗';
 $('player-espn-link').href=good?'https://www.espn.com/nba/player/_/id/'+encodeURIComponent(id):'https://www.espn.com/nba/';
 if(good)$('player-portrait').innerHTML='<img src="https://a.espncdn.com/i/headshots/nba/players/full/'+encodeURIComponent(id)+'.png" alt="" onerror="this.style.display=\\'none\\'">';
}
function parseStats(data){
 const stats=data?.statistics;
 const rows=Array.isArray(stats)?stats:stats?[stats]:[];
 const names=[],values=[];
 for(const row of rows){
  if(Array.isArray(row.names)&&Array.isArray(row.values)){row.names.forEach((n,i)=>{names.push(String(n).toLowerCase());values.push(row.values[i])})}
  if(Array.isArray(row.splits?.categories)){
   for(const cat of row.splits.categories)for(const stat of cat.stats||[]){names.push(String(stat.name||stat.abbreviation).toLowerCase());values.push(stat.value)}
  }
 }
 const find=(...keys)=>{
  const idx=names.findIndex(n=>keys.some(k=>n===k.toLowerCase()));
  return idx>=0?val(values[idx]):null;
 };
 return {games:find('gamesPlayed','GP'),pts:find('avgPoints','PTS','pointsPerGame'),
 reb:find('avgRebounds','REB','reboundsPerGame'),ast:find('avgAssists','AST','assistsPerGame'),
 min:find('avgMinutes','MIN','minutesPerGame'),three:find('avgThreePointFieldGoalsMade','3PM'),
 stl:find('avgSteals','STL'),blk:find('avgBlocks','BLK')};
}
async function load(){
 const status=$('player-status');
 if(good){
  try{
   const url='https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/'+encodeURIComponent(id)+'/overview';
   const response=await fetch(url,{cache:'no-store'});
   if(!response.ok)throw Error('ESPN player overview not accessible');
   const data=await response.json();
   if(data.athlete?.displayName)verifiedName=data.athlete.displayName;
   if(verifiedName&&key(verifiedName)!==key(name))throw Error('ESPN player identity does not match saved athlete');
   renderHero();
   const stats=parseStats(data);
   const real=[['SEASON PPG',fmt(stats.pts),'ESPN reported average'],
    ['REBOUNDS',fmt(stats.reb),'ESPN reported average'],
    ['ASSISTS',fmt(stats.ast),'ESPN reported average'],
    ['MINUTES',fmt(stats.min),'ESPN reported average'],
    ['STEALS',fmt(stats.stl),'ESPN reported average'],
    ['BLOCKS',fmt(stats.blk),'ESPN reported average'],
    ['GAMES',stats.games===null?'—':String(stats.games),'ESPN games played'],
    ['3-POINTERS',fmt(stats.three),'ESPN reported average']];
   $('player-real-stats').innerHTML=real.map(m=>metric(...m)).join('');
   status.textContent='Actual season numbers sourced from ESPN public player overview; missing fields are shown as —, not estimated.';
  }catch(e){status.textContent='Live ESPN season numbers unavailable: '+e.message+'. The game-day research snapshot remains separately identified.'}
 }else status.textContent='Unverified ESPN athlete ID. Only independently matched research data can be shown.';
 try{
  const r=await fetch('../data/v7-current.json',{cache:'no-store'});
  if(!r.ok)throw Error('Model snapshot unavailable');
  const snap=await r.json();
  const found=(snap.teams||[]).flatMap(t=>(t.rotation||[]).map(p=>({...p,team:t.abbr})))
   .find(p=>key(p.name)===key(verifiedName||name)&&(!team||window.TwinTeamPrefs?.canonical?.(p.team)===team));
  if(!found)throw Error('Player is not in the dated inferred rotation snapshot');
  const v=found.stats_if_play||{};
  $('player-research').innerHTML=[
   ['PTS (IF PLAYING)',fmt(v.points),'Experimental player projection'],
   ['REB (IF PLAYING)',fmt(v.rebounds),'Experimental player projection'],
   ['AST (IF PLAYING)',fmt(v.assists),'Experimental player projection'],
   ['3PM (IF PLAYING)',fmt(v.threes),'Experimental player projection'],
   ['MIN (IF PLAYING)',fmt(found.minutes_if_play),'Inferred rotation'],
   ['PLAY CHANCE',fmt(100*found.play_probability)+'%','Inferred; not official']
  ].map(m=>metric(...m)).join('');
  if(!good&&/^\d{4,10}$/.test(String(found.player_id)))$('player-portrait').innerHTML='<img src="https://cdn.nba.com/headshots/nba/latest/260x190/'+encodeURIComponent(found.player_id)+'.png" alt="" onerror="this.style.display=\\'none\\'">';
 }catch(e){$('player-research').innerHTML='<p class="team-empty">'+esc(e.message)+'. No substitute performance data has been invented.</p>'}
}
renderHero();
load();
})();
/* NBA Twin Lab / Game Centre.
   Real game scores + ESPN player stats never update locked predictions. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const valid=id=>/^\d{7,10}$/.test(String(id||''));
const safeNum=v=>v===undefined||v===null||v===''?null:Number.isFinite(Number(v))?Number(v):null;
async function verifiedArtifact(url,expectedSha,label){
 if(!/^[a-f0-9]{64}$/i.test(String(expectedSha||'')))throw Error(label+' has no valid ledger SHA-256');
 const response=await fetch(url,{cache:'no-store'});
 if(!response.ok)throw Error(label+' unavailable (HTTP '+response.status+')');
 const text=await response.text(),subtle=globalThis.crypto?.subtle;
 if(!subtle)throw Error('Cryptographic artifact verification unavailable');
 const digest=await subtle.digest('SHA-256',new TextEncoder().encode(text));
 const actual=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
 if(actual!==String(expectedSha).toLowerCase())throw Error(label+' SHA-256 does not match the audit ledger');
 return JSON.parse(text);
}
const fmt=d=>{const n=new Date(d);return Number.isFinite(n.getTime())?new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Melbourne',weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(n):'Time not reported'};
const abbr=t=>String(t?.abbreviation||t?.abbr||t?.shortDisplayName||'').toUpperCase();
const logo=t=>window.NbaMedia?.image?.(t?.abbr,{size:'large',label:t?.abbr})||'<span>'+esc(t?.abbr||'NBA')+'</span>';
const id=new URLSearchParams(location.search).get('id');
let selectedTab='overview',game=null,raw=null,players=[],plays=[],teamStats={},boxSort='pts',boxDescending=true;
let lastLoaded=null,scoreRetrievedAt=null,playersRetrievedAt=null,playersPartialRetrievedAt=null;
let teamStatsRetrievedAt={},latestTeamsMissing=[],latestPlayersPartial=false,latestScoresMissing=false;
let latestRequest=0,retryAttempt=0,retryTimer=null,refreshError='';
let matchupSnapshot=null,matchupSnapshotRequest=null,matchupSnapshotRetrievedAt=null,matchupView='season';
const fallback='<p class="game-empty">No verified data is available from ESPN for this game yet.</p>';
const statusName=g=>g.phase==='postponed'?'POSTPONED':g.phase==='live'?(g.period>4?'OT'+(g.period>5?' '+(g.period-4):''):'Q'+(g.period||'?'))+(g.clock?' · '+g.clock:'')+' · LIVE':g.phase==='final'?'FINAL':g.phase==='scheduled'?'UPCOMING':'STATUS UNAVAILABLE';
function parseSummary(data){
 const header=data?.header||{},competition=header.competitions?.[0]||{};
 const competitors=competition.competitors||[];
 const away=competitors.find(c=>c.homeAway==='away'),home=competitors.find(c=>c.homeAway==='home');
 if(!away||!home)return null;
 const status=competition.status||header.status||data.status||{},type=status.type||{};
 const statusText=[type.name,type.shortDetail,type.detail].filter(Boolean).join(' ');
 const phase=/postponed/i.test(statusText)?'postponed':
  type.completed||type.state==='post'||type.name==='STATUS_FINAL'?'final':
  type.state==='in'||String(type.name||'').startsWith('STATUS_IN')?'live':'scheduled';
 const date=competition.date||header.date||data?.header?.competitions?.[0]?.date||data?.date||null;
 const mk=c=>({abbr:abbr(c.team),name:c.team?.displayName||c.team?.name||c.team?.shortDisplayName||'NBA team',
  score:phase==='scheduled'||phase==='postponed'?null:safeNum(c.score),record:c.records?.find(x=>x.type==='total')?.summary||'',
  quarters:(c.linescores||[]).map(x=>safeNum(x.value??x.displayValue))});
 const venue=competition.venue||{};
 const venueAddress=venue.address||{};
 const venueName=String(venue.fullName||venue.name||'').trim();
 const venueCity=[venueAddress.city,venueAddress.state].filter(Boolean).join(', ');
 return {id:String(header.id||competition.id||id),date,away:mk(away),home:mk(home),phase,
  period:safeNum(status.period),clock:String(status.displayClock||''),status:String(type.shortDetail||type.detail||''),
  venue:[venueName,venueCity].filter(Boolean).join(' · ')};
}
const timestamp=value=>{
 const date=new Date(value);
 return Number.isFinite(date.getTime())?date.toISOString().replace('T',' ').replace(/\.\d{3}Z$/,' UTC'):'not supplied';
};
function mergeGame(next,previous){
 if(!previous)return next;
 const rank={scheduled:0,postponed:1,live:2,final:3};
 const newerStatus=(rank[next.phase]??0)>=(rank[previous.phase]??0);
 const team=(incoming,old)=>({...old,...incoming,
  score:newerStatus?(incoming.score??old.score):old.score,
  record:incoming.record||old.record,
  quarters:newerStatus&&incoming.quarters.length>=old.quarters.length?incoming.quarters:old.quarters
 });
 return {...previous,...next,
  phase:newerStatus?next.phase:previous.phase,
  period:newerStatus?next.period:previous.period,
  clock:newerStatus?next.clock:previous.clock,
  status:newerStatus?next.status:previous.status,
  venue:next.venue||previous.venue,
  away:team(next.away,previous.away),home:team(next.home,previous.home)
 };
}
const playerIdentity=player=>player.id?'id:'+player.id:player.team+':'+player.name;
function mergePlayerRows(previous,incoming){
 const merged=new Map(previous.map(player=>[playerIdentity(player),player]));
 for(const player of incoming){
  const old=merged.get(playerIdentity(player));
  if(!old||player.dnp){merged.set(playerIdentity(player),player);continue}
  const next={...old,...player};
  for(const key of ['pts','reb','ast','minuteValue','fgm','fga','three','threeA','ftm','fta','stl','blk','tov','oreb','dreb','pf','plusMinus','fgPct','threePct','ftPct','fpts']){
   if(player[key]===null&&old[key]!==null)next[key]=old[key];
  }
  if(player.minutes==='—')next.minutes=old.minutes;
  next.unavailable=['pts','reb','ast','minuteValue','fgm','fga','three','threeA','ftm','fta','stl','blk','tov','oreb','dreb','pf','plusMinus'].every(key=>next[key]===null);
  merged.set(playerIdentity(player),next);
 }
 return [...merged.values()];
}
function mergeTeamStats(previous,incoming){
 const merged={...previous};
 for(const [team,stats] of Object.entries(incoming)){
  const supplied=Object.fromEntries(Object.entries(stats).filter(([,value])=>value!==null));
  if(Object.keys(supplied).length)merged[team]={...(merged[team]||{}),...supplied};
 }
 return merged;
}
function scoreStat(team){
 const stats=teamStats[team?.abbr]||{};
 const key=Object.keys(stats).find(name=>['points','pts','totalpoints'].includes(name.toLowerCase().replace(/[^a-z]/g,'')));
 return key?safeNum(stats[key]):null;
}
function renderFreshness(){
 const root=$('game-freshness-details');
 if(!root)return;
 const age=lastLoaded?Date.now()-Date.parse(lastLoaded):null;
 const stale=Number.isFinite(age)&&age>120000;
 const isStale=at=>Number.isFinite(Date.parse(at))&&Date.now()-Date.parse(at)>120000;
 const row=(label,at,empty,source='ESPN summary · retrieved locally')=>
  '<div class="game-freshness-row"><b>'+esc(label)+(isStale(at)?' · STALE':'')+'</b><span>'+
  (at?esc(source)+' '+esc(timestamp(at)):esc(empty))+'</span></div>';
 const disclosures=[];
 if(!game?.venue)disclosures.push('Venue not supplied by ESPN.');
 if(!players.length)disclosures.push(game?.phase==='scheduled'?'Player box score awaiting provider update.':
  game?.phase==='postponed'?'Game postponed; no current player box score is expected.':'Player box score not supplied in the latest summary.');
 else if(players.some(player=>player.unavailable))disclosures.push('Some player statistics are incomplete; missing values remain unavailable.');
 if(latestPlayersPartial&&players.length)disclosures.push('Latest summary had incomplete player coverage; retained rows keep their earlier values and retrieval time.');
 if(latestTeamsMissing.length){
  const retained=latestTeamsMissing.some(team=>Object.keys(teamStats[team]||{}).length);
  disclosures.push('Latest summary did not supply team statistics for '+latestTeamsMissing.join(', ')+
   (retained?'; any retained values keep their team retrieval times.':'; no values are inferred.'));
 }
 if(latestScoresMissing)disclosures.push(scoreRetrievedAt?
  'Latest summary omitted the score; the previous score and its retrieval time are retained.':
  'Latest summary did not contain usable score data.');
 const scoreChecks=[game?.away,game?.home].filter(Boolean).map(team=>({team,boxScore:scoreStat(team)}));
 const comparable=scoreChecks.filter(item=>item.boxScore!==null);
 const scoreMismatches=comparable.filter(item=>Number.isFinite(item.team.score)&&item.boxScore!==item.team.score);
 if(scoreMismatches.length)disclosures.push('ESPN header score and team box-score points disagree for '+scoreMismatches.map(item=>
  item.team.abbr+' (header '+item.team.score+', team total '+item.boxScore+')').join(', ')+'. Header scores are shown pending provider resolution.');
 else if(comparable.length>0&&comparable.length<scoreChecks.length)
  disclosures.push('Score-to-team-total comparison is incomplete; the summary omitted a team points total.');
 const staleSections=[];
 if(isStale(scoreRetrievedAt))staleSections.push('score');
 if(isStale(playersRetrievedAt||playersPartialRetrievedAt))staleSections.push('player box score');
 for(const team of [game?.away,game?.home].filter(Boolean))
  if(isStale(teamStatsRetrievedAt[team.abbr]))staleSections.push(team.abbr+' team statistics');
 if(staleSections.length)disclosures.push('STALE SECTION DATA (more than two minutes since verified section data): '+staleSections.join(', ')+'.');
 disclosures.push('Official injury designations are not displayed; this page has no verified injury feed.');
 if(stale)disclosures.push('STALE DATA: last successful ESPN summary retrieval was more than two minutes ago.');
 if(refreshError)disclosures.push('Latest refresh failed: '+refreshError+'. '+(lastLoaded?'Showing the last successful response; currentness is unverified.':'No verified game data is available.'));
 root.innerHTML='<div class="game-freshness-grid">'+
  row('Score / game status',scoreRetrievedAt,'No score observation supplied.')+
  row('Player box score',playersRetrievedAt||playersPartialRetrievedAt,'Awaiting provider data.',
   playersRetrievedAt?'Last complete ESPN box score · retrieved locally':'Partial ESPN player rows · retrieved locally')+
  [game?.away,game?.home].filter(Boolean).map(team=>row(team.abbr+' team statistics',teamStatsRetrievedAt[team.abbr],
   'Not supplied by provider for this team.')).join('')+
  '<div class="game-freshness-row"><b>Game-data observation time</b><span>Not supplied for scores or statistics; logo timestamps are not game observations.</span></div>'+
  '</div>'+(disclosures.length?'<p class="game-coverage-note">'+disclosures.map(esc).join(' · ')+'</p>':'');
}
function renderSummaryStatus(){
 const root=$('game-updated');if(!root)return;
 root.textContent='ESPN public game summary (unofficial) · last checked locally '+(lastLoaded?timestamp(lastLoaded):'not yet retrieved')+
  ' · game-data observation time not supplied'+(refreshError?' · refresh issue: '+refreshError:'')+
  (retryTimer?' · retry scheduled':' · checks every 60 seconds');
 root.className='game-updated'+(refreshError?' game-updated--stale':'');
 renderFreshness();
}
function quarterTotals(g){
 if(!g||(!g.away.quarters.length&&!g.home.quarters.length))return '';
 const n=Math.max(g.away.quarters.length,g.home.quarters.length),label=i=>i<4?'Q'+(i+1):'OT'+(i===4?'':i-3);
 const row=(t)=>'<tr><th scope="row">'+esc(t.abbr)+'</th>'+Array.from({length:n},(_,i)=>'<td>'+esc(t.quarters[i]??'—')+'</td>').join('')+'<td class="quarter-total">'+esc(t.score??'—')+'</td></tr>';
 return '<div class="game-periods-scroll"><table><thead><tr><th>TEAM</th>'+Array.from({length:n},(_,i)=>'<th>'+label(i)+'</th>').join('')+'<th>TOTAL</th></tr></thead><tbody>'+row(g.away)+row(g.home)+'</tbody></table></div>';
}
function parseTeamStats(summary,matchup=game){
 const teams=summary?.boxscore?.teams||[];
 const getTeam=t=>teams.find(x=>abbr(x.team)===t)||null;
 const stats={};
 for(const t of [matchup?.away?.abbr,matchup?.home?.abbr]){
  const team=getTeam(t);
  stats[t]={};
  for(const s of team?.statistics||[])stats[t][String(s.displayName||s.label||s.name||s.abbreviation||'')]=s.displayValue??s.value??null;
 }
 return stats;
}
const matchupMetrics=[
 ['Offensive rating','ortg','rating'],
 ['Defensive rating','drtg','rating'],
 ['Pace','pace','pace'],
 ['Effective field-goal rate','efg','rate'],
 ['Opponent effective field-goal rate','opp_efg','rate'],
 ['Three-point attempt rate','three_rate','rate'],
 ['Three-point accuracy','three_pct','rate'],
 ['Opponent three-point attempt rate','opp_three_rate','rate'],
 ['Offensive rebound rate','orb_rate','rate'],
 ['Defensive rebound rate','drb_rate','rate'],
 ['Turnover rate','tov_rate','rate'],
 ['Free-throw attempt rate','ftr','rate']
];
const canonicalTeam=code=>({WAS:'WSH',GS:'GSW',NO:'NOP',NY:'NYK',SA:'SAS',UTAH:'UTA'}[String(code||'').toUpperCase()]||String(code||'').toUpperCase());
function analyzeMatchup(snapshot,matchupGame){
 const tip=Date.parse(matchupGame?.date),built=Date.parse(snapshot?.built_at_utc);
 if(snapshot?.schema!==1||snapshot.strict_no_future_data!==true||!Number.isFinite(tip)||
    !Number.isFinite(built)||built>=tip||!Array.isArray(snapshot.teams))return null;
 const teams=new Map(snapshot.teams.map(team=>[canonicalTeam(team.abbr),team]));
 const away=teams.get(canonicalTeam(matchupGame?.away?.abbr)),home=teams.get(canonicalTeam(matchupGame?.home?.abbr));
 if(!away||!home)return null;
 const hasSample=team=>Number.isFinite(Number(team.season?.games))&&Number(team.season.games)>0;
 if(!hasSample(away)||!hasSample(home))return null;
 return {snapshot,away,home,builtAt:snapshot.built_at_utc,tip:matchupGame.date};
}
const matchupNumber=(value,type)=>{
 const n=safeNum(value);
 if(n===null)return null;
 return type==='rate'?(n*100).toFixed(1)+'%':n.toFixed(1);
};
function matchupInsights(context,view,matchupGame=game){
 const stats=team=>view==='season'?team.season:team.last5;
 const claims=[];
 const directions=[
  {offense:context.away,defense:context.home,label:matchupGame?.away?.name||context.away.abbr},
  {offense:context.home,defense:context.away,label:matchupGame?.home?.name||context.home.abbr}
 ];
 for(const {offense,defense,label} of directions){
  const attack=stats(offense),opposition=stats(defense);
  const n=Number(attack?.games),oppN=Number(opposition?.games);
  if(!Number.isFinite(n)||n<3||!Number.isFinite(oppN)||oppN<3)continue;
  const add=(title,text)=>claims.push({title,text});
  const three=matchupNumber(attack?.three_rate,'rate'),allowed=matchupNumber(opposition?.opp_three_rate,'rate');
  if(three&&allowed){
   const gap=(Number(attack.three_rate)-Number(opposition.opp_three_rate))*100;
   add('Perimeter volume',label+' attempted '+three+' of its field goals from three across '+n+' games; '+(matchupGame?.[offense===context.away?'home':'away']?.name||defense.abbr)+' opponents recorded a '+allowed+' three-point attempt rate across '+oppN+' games. The raw comparison is '+(gap>=0?'+':'')+gap.toFixed(1)+' percentage points for '+label+'; it describes volume tendencies, not shot quality or expected makes.');
  }
  const ortg=matchupNumber(attack?.ortg,'rating'),drtg=matchupNumber(opposition?.drtg,'rating');
  if(ortg&&drtg){
   const gap=Number(attack.ortg)-Number(opposition.drtg);
   add('Scoring efficiency context',label+' recorded '+ortg+' points per 100 possessions; its opponent allowed '+drtg+' points per 100 in its sample. The '+(gap>=0?'+':'')+gap.toFixed(1)+' raw rating-point gap is historical context, not a matchup-adjusted forecast.');
  }
  const tov=matchupNumber(attack?.tov_rate,'rate'),forced=matchupNumber(opposition?.opp_tov_rate,'rate');
  if(tov&&forced)add('Ball security vs. pressure',label+' recorded a '+tov+' turnover rate; its opponent recorded a '+forced+' opponent turnover rate. These season tendencies may be relevant to ball security, but do not estimate turnovers for this game.');
  const ftr=matchupNumber(attack?.ftr,'rate'),oppFtr=matchupNumber(opposition?.opp_ftr,'rate');
  if(ftr&&oppFtr)add('Free-throw generation',label+' recorded a '+ftr+' free-throw attempt rate, while its opponent allowed a '+oppFtr+' rate. This is a historical foul/FT tendency comparison, not a projected whistle or free-throw total.');
 }
 return claims;
}
function renderMatchup(snapshot,matchupGame,view='season'){
 const context=analyzeMatchup(snapshot,matchupGame);
 if(!context)return '<p class="game-empty">Timestamp-eligible pre-tip team evidence is unavailable for this matchup. A later-built snapshot is not used to reconstruct pregame context.</p>';
 const current=team=>view==='season'?team.season:team.last5;
 const seasonNumber=Number(snapshot.coverage?.season);
 const seasonLabel=Number.isFinite(seasonNumber)?(seasonNumber-1)+'–'+String(seasonNumber).slice(-2)+' season':'current season';
 const periodLabel=view==='season'?seasonLabel:'last 5 available games';
 const teamLabel=(abbr)=>abbr==='WAS'?'WSH':abbr;
 const shown=(team,key,type)=>matchupNumber(current(team)?.[key],type)??'—';
 const rows=matchupMetrics.map(([label,key,type])=>{
  const priorSeason=Number.isFinite(seasonNumber)?(seasonNumber-2)+'–'+String(seasonNumber-1).slice(-2)+' prior season':'prior season';
  const prior=(team)=>team.prior?.[key]===undefined?'':'<small>Prior '+esc(priorSeason)+': '+esc(matchupNumber(team.prior[key],type)??'—')+'</small>';
  return '<div class="matchup-stat-row"><span>'+esc(shown(context.away,key,type))+' '+prior(context.away)+'</span><b>'+esc(label)+'</b><span>'+esc(shown(context.home,key,type))+' '+prior(context.home)+'</span></div>';
 }).join('');
 const claims=matchupInsights(context,view,matchupGame);
 const source=String(snapshot.source?.name||snapshot.source||'source not identified');
 const sourceLink=snapshot.source?.documentation;
 const sourceLabel=sourceLink&&/^https:\/\//.test(sourceLink)?'<a href="'+esc(sourceLink)+'" target="_blank" rel="noopener noreferrer">source documentation ↗</a>':'';
 const awayN=Number(current(context.away)?.games)||0,homeN=Number(current(context.home)?.games)||0;
 const availability=String(snapshot.availability||context.away.availability_source||context.home.availability_source||'');
 return '<div class="matchup-research-banner"><strong>RESEARCH MATCHUP CONTEXT · NOT A FORECAST</strong><span>Descriptive team evidence only. This is not a probability, archived pregame prediction or official grade.</span></div>'+
  '<div class="matchup-view-switch" role="group" aria-label="Select team sample period"><button type="button" data-matchup-view="season" aria-pressed="'+String(view==='season')+'">CURRENT SEASON</button><button type="button" data-matchup-view="last5" aria-pressed="'+String(view==='last5')+'">RECENT · LAST 5</button></div>'+
  '<div class="matchup-team-head"><span><b>'+esc(teamLabel(matchupGame.away.abbr))+'</b><small>AWAY</small></span><span>METRIC</span><span><b>'+esc(teamLabel(matchupGame.home.abbr))+'</b><small>HOME</small></span></div>'+
  '<div class="matchup-stat-table" aria-label="Team statistic comparison">'+rows+'</div>'+
  '<section class="matchup-insights" aria-labelledby="matchup-insights-title"><div class="matchup-section-heading"><div><span class="eyebrow">SUPPORTED BY THE SELECTED SAMPLE</span><h3 id="matchup-insights-title">MATCHUP SIGNALS</h3></div><span>'+esc(periodLabel)+' · '+awayN+' '+esc(teamLabel(matchupGame.away.abbr))+' games / '+homeN+' '+esc(teamLabel(matchupGame.home.abbr))+' games</span></div>'+
  (claims.length?'<div class="matchup-insight-grid">'+claims.map(claim=>'<article class="matchup-insight"><h4>'+esc(claim.title)+'</h4><p>'+esc(claim.text)+'</p></article>').join('')+'</div>':'<p class="game-empty">Fewer than three games are available for both teams in this sample. Matchup-specific claims are withheld.</p>')+'</section>'+
  '<details class="matchup-methodology"><summary>Evidence, limitations and availability</summary><p>Selected period: '+esc(periodLabel)+'. Per-team sample: '+awayN+' '+esc(teamLabel(matchupGame.away.abbr))+' games and '+homeN+' '+esc(teamLabel(matchupGame.home.abbr))+' games. Prior-season figures are shown separately and are not blended into this descriptive comparison.</p>'+
  '<p>Snapshot created '+esc(timestamp(context.builtAt))+' · retrieved locally '+esc(timestamp(matchupSnapshotRetrievedAt))+' · game tip '+esc(fmt(context.tip))+'. Source: '+esc(source)+(sourceLabel?' · '+sourceLabel:'')+'. The snapshot was rejected unless its timestamp precedes tipoff.</p>'+
  '<p>'+esc(availability||'Official pregame player-availability data is not present in this snapshot.')+' Shot-location tracking, transition scoring/defence, schedule-specific travel and verified injury designations are not inferred here. Small early-season samples can be unstable; team-level comparisons are not adjusted for opponent strength.</p>'+
  '<a class="matchup-lock-link" href="?id='+encodeURIComponent(String(matchupGame.id||id))+'&tab=machine">VIEW IMMUTABLE PRODUCTION FORECAST ↗</a></details>';
}
function bindMatchupControls(root){
 for(const button of root.querySelectorAll?.('[data-matchup-view]')||[])button.addEventListener('click',()=>{
  matchupView=button.dataset.matchupView==='last5'?'last5':'season';
  root.innerHTML=renderMatchup(matchupSnapshot,game,matchupView);
  bindMatchupControls(root);
 });
}
async function showMatchup(){
 const root=$('game-matchup');if(!root||!game)return;
 root.innerHTML='<p>Checking pre-tip team evidence…</p>';
 try{
  if(!matchupSnapshotRequest)matchupSnapshotRequest=fetch('../data/v7-current.json',{cache:'no-store'}).then(response=>{
   if(!response.ok)throw Error('HTTP '+response.status);
   return response.json();
  }).then(snapshot=>{matchupSnapshot=snapshot;return snapshot});
  const snapshot=await matchupSnapshotRequest;
  if(!matchupSnapshotRetrievedAt)matchupSnapshotRetrievedAt=new Date().toISOString();
  root.innerHTML=renderMatchup(snapshot,game,matchupView);
  bindMatchupControls(root);
 }catch(error){
  matchupSnapshotRequest=null;
  root.innerHTML='<p class="game-empty">Timestamped matchup research is unavailable ('+esc(error?.message||'data request failed')+'). No matchup claim was generated.</p>';
 }
}
function showHeader(){
 if(!game)return;
 $('game-away-name').textContent=game.away.name;$('game-home-name').textContent=game.home.name;
 if($('game-away-profile'))$('game-away-profile').href='../team/?team='+encodeURIComponent(game.away.abbr);
 if($('game-home-profile'))$('game-home-profile').href='../team/?team='+encodeURIComponent(game.home.abbr);
 $('game-away-logo').innerHTML=logo(game.away);$('game-home-logo').innerHTML=logo(game.home);
 $('game-away-record').textContent=game.away.record||'AWAY';$('game-home-record').textContent=game.home.record||'HOME';
 const hasScores=['live','final'].includes(game.phase)&&game.away.score!==null&&game.home.score!==null;
 $('game-score').textContent=game.phase==='postponed'?'POSTPONED':hasScores?game.away.score+' : '+game.home.score:'VS';
 $('game-state').textContent=statusName(game);
 $('game-state').className='game-live-status game-live-status--'+game.phase;
 $('game-clock').textContent=game.phase==='scheduled'?'TIPOFF · '+fmt(game.date):statusName(game);
 $('game-date').textContent=[game.venue||'Venue not reported',fmt(game.date)+' · Australia/Melbourne'].join(' · ');
 $('game-periods').innerHTML=quarterTotals(game);
 document.title=game.away.abbr+' @ '+game.home.abbr+' | NBA Twin Lab';
}
function showOverview(){
 const root=$('game-overview-context');if(!root||!game)return;
 const state=game.phase==='scheduled'?'Upcoming game':game.phase==='postponed'?'Postponed game':game.phase==='live'?'Live game':game.phase==='final'?'Completed game':'Game status unavailable';
 const score=game.phase==='scheduled'?'Tipoff '+fmt(game.date):game.phase==='postponed'?'No rescheduled tipoff reported':
  Number.isFinite(game.away.score)&&Number.isFinite(game.home.score)?'Current score '+game.away.abbr+' '+game.away.score+' – '+game.home.score+' '+game.home.abbr:'Score unavailable';
 root.textContent=state+' · '+score+'. Team records and venue are shown above only when provided by ESPN. Player leaders and box-score statistics below use the latest available game summary; missing fields are not inferred.';
}
const usablePlayers=()=>players.filter(player=>!player.dnp&&!player.unavailable);
function bestPlayer(key,group=usablePlayers()){
 return group.filter(player=>Number.isFinite(player[key])).sort((a,b)=>b[key]-a[key]||a.name.localeCompare(b.name))[0]||null;
}
function selectPerformers(roster,teams){
 const active=roster.filter(player=>!player.dnp&&!player.unavailable);
 return {
  awayScorer:bestPlayer('pts',active.filter(player=>player.team===teams[0]?.abbr)),
  homeScorer:bestPlayer('pts',active.filter(player=>player.team===teams[1]?.abbr)),
  rebounder:bestPlayer('reb',active),playmaker:bestPlayer('ast',active),fantasy:bestPlayer('fpts',active),
  notable:active.filter(player=>player.doubleDouble||player.tripleDouble||
   (window.TwinBoxscorePlus?.performanceTag?.(player)||''))
 };
}
function performanceCard(label,player,key,suffix=''){
 if(!player)return '';
 return '<article class="game-performance-card"><span>'+esc(label)+'</span><b>'+esc(player.name)+'</b><strong>'+esc(formatNumber(player[key]))+esc(suffix)+'</strong><small>'+esc(player.team)+(player.fpts===null?' · fantasy total unavailable':'')+'</small></article>';
}
function showLeaders(){
 const root=$('game-leaders');if(!root)return;
 const active=usablePlayers();
 if(!active.length){
  root.innerHTML='<p class="game-empty">'+(game?.phase==='scheduled'?'Player leaders will appear when ESPN publishes this game’s box score.':
   game?.phase==='postponed'?'Player leaders are unavailable while this game is postponed.':'No verified player performance statistics are currently available.')+'</p>';return;
 }
 const performers=selectPerformers(players,[game.away,game.home]);
 const cards=[
  performanceCard(game.away.abbr+' · TOP SCORER',performers.awayScorer,'pts',' PTS'),
  performanceCard(game.home.abbr+' · TOP SCORER',performers.homeScorer,'pts',' PTS'),
  performanceCard('GAME · REBOUNDS',performers.rebounder,'reb',' REB'),
  performanceCard('GAME · ASSISTS',performers.playmaker,'ast',' AST'),
  performanceCard('GAME · FANTASY POINTS',performers.fantasy,'fpts',' FPTS')
 ].filter(Boolean);
 const milestones=performers.notable.map(player=>{
   const tag=window.TwinBoxscorePlus?.performanceTag?.(player)||'';
   return '<li><b>'+esc(player.name)+'</b><span>'+esc(player.team)+' · '+esc(tag)+'</span></li>';
  });
 root.innerHTML='<div class="game-performance-grid">'+cards.join('')+'</div>'+
  (milestones.length?'<div class="game-milestones"><h3>NOTABLE GAME LINES</h3><ul>'+milestones.map(x=>x).join('')+'</ul></div>':'');
}
const boxCols=[["name","PLAYER"],["minuteValue","MIN"],["pts","PTS"],["fgm","FGM"],["fga","FGA"],["fgPct","FG%"],["three","3PM"],["threeA","3PA"],["threePct","3P%"],["ftm","FTM"],["fta","FTA"],["ftPct","FT%"],["oreb","OREB"],["dreb","DREB"],["reb","REB"],["ast","AST"],["stl","STL"],["blk","BLK"],["tov","TO"],["pf","PF"],["plusMinus","+/-"],["fpts","FPTS"]];
function orderPlayers(group,key=boxSort,descending=boxDescending){
 return group.slice().sort((a,b)=>{
  if(key==='name')return (descending?-1:1)*a.name.localeCompare(b.name);
  const av=Number.isFinite(a[key])?a[key]:null,bv=Number.isFinite(b[key])?b[key]:null;
  if(av===null)return bv===null?a.name.localeCompare(b.name):1;
  if(bv===null)return -1;
  return (descending?-1:1)*(av-bv)||a.name.localeCompare(b.name);
 });
}
function formatNumber(v,suffix=''){return Number.isFinite(v)?String(v)+suffix:'—'}
function showBox(){
 if(!game){$('game-box-groups').innerHTML=fallback;return}
 $('game-box-groups').innerHTML=[game.away,game.home].map(team=>{
  const list=orderPlayers(players.filter(p=>p.team===team.abbr));
  const rows=list.length?list.map(p=>{
   const vals=[esc(p.name),esc(p.minutes??'—'),formatNumber(p.pts),formatNumber(p.fgm),formatNumber(p.fga),
     formatNumber(p.fgPct,'%'),formatNumber(p.three),formatNumber(p.threeA),formatNumber(p.threePct,'%'),
     formatNumber(p.ftm),formatNumber(p.fta),formatNumber(p.ftPct,'%'),formatNumber(p.oreb),formatNumber(p.dreb),
     formatNumber(p.reb),formatNumber(p.ast),formatNumber(p.stl),formatNumber(p.blk),formatNumber(p.tov),
     formatNumber(p.pf),formatNumber(p.plusMinus),formatNumber(p.fpts)];
   if(p.dnp)for(let i=1;i<vals.length;i++)vals[i]='DNP';
   else if(p.unavailable)for(let i=1;i<vals.length;i++)vals[i]='—';
   const follow=p.id&&/^\d+$/.test(String(p.id))?
     '<button type="button" class="watch-player-btn" data-watch-player="'+esc(p.id)+'" data-watch-name="'+esc(p.name)+'" data-watch-player-team="'+esc(p.team)+'">+ Follow</button>':'';
   const rowClass=[p.dnp?'game-player-dnp':'',p.unavailable?'game-player-unavailable':''].filter(Boolean).join(' ');
   return '<tr class="'+rowClass+'">'+vals.map((v,i)=>'<td'+(i===21?' class="game-fpts"':'')+'>'+(i===0?'<b><a class="game-player-link" href="../player/?id='+encodeURIComponent(String(p.id||''))+'&name='+encodeURIComponent(p.name)+'&team='+encodeURIComponent(p.team)+'">'+v+'</a></b>'+follow+(p.dnp&&p.dnpReason?'<small>'+esc(p.dnpReason)+'</small>':''):v)+'</td>').join('')+'</tr>';
  }).join(''):'<tr><td colspan="'+boxCols.length+'">No published actual player statistics for this team yet.</td></tr>';
  const headings=boxCols.map(([key,label])=>'<th'+(boxSort===key?' aria-sort="'+(boxDescending?'descending':'ascending')+'"':'')+'><button type="button" data-game-sort="'+key+'" aria-label="Sort by '+label+'">'+label+(boxSort===key?(boxDescending?' ↓':' ↑'):'')+'</button></th>').join('');
  return '<div class="game-box-team"><div class="game-box-team-title"><a class="game-team-link" href="../team/?team='+encodeURIComponent(team.abbr)+'">'+logo(team)+'<h3>'+esc(team.name)+'</h3></a></div>'+
   '<div class="game-table-scroll"><table><thead><tr>'+headings+'</tr></thead><tbody>'+rows+'</tbody></table></div></div>';
 }).join('');
 window.TwinWatchlist?.sync?.();
 for(const button of $('game-box-groups').querySelectorAll?.('[data-game-sort]')||[])button.addEventListener('click',()=>{
  const key=button.dataset.gameSort;boxDescending=key===boxSort?!boxDescending:true;boxSort=key;showBox();
 });
}
function showPlays(){
 const root=$('game-play-list');
 if(!plays.length){root.innerHTML=fallback;return}
 root.innerHTML=plays.slice().reverse().map(p=>{
  const type=window.NbaLiveDesk?.highlight?.(p)||'';
  return '<article class="game-play"><div class="game-play-time">'+esc(p.period||'?')+'Q · '+esc(p.clock||'—')+'</div>'+
  '<div><p>'+esc(p.desc)+'</p>'+(type?'<small>'+esc(type)+'</small>':'')+'</div>'+
  '<div class="game-play-score">'+(p.away===null||p.home===null?'':esc(p.away+'–'+p.home))+'</div></article>';
 }).join('');
}
function showTeam(){
 const data=teamStats,a=game?.away,b=game?.home;
 if(!a||!b){$('game-team-stats').innerHTML=fallback;return}
 const awayStats=data[a.abbr]||{},homeStats=data[b.abbr]||{};
 const keys=[...new Set([...Object.keys(awayStats),...Object.keys(homeStats)])];
 const rows=keys.filter(key=>awayStats[key]!=null||homeStats[key]!=null).map(key=>
  '<tr><td>'+esc(awayStats[key]??'—')+'</td><th scope="row">'+esc(key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/([a-z])(\d)/gi,'$1 $2').replace(/^./,s=>s.toUpperCase()))+'</th><td>'+esc(homeStats[key]??'—')+'</td></tr>');
 $('game-team-stats').innerHTML=rows.length?'<p class="game-stat-guidance">Team totals below are supplied by the ESPN game summary; missing fields remain unavailable.</p>'+
  '<div class="game-team-metric-head"><span>'+logo(a)+' '+esc(a.abbr)+'</span><span>'+logo(b)+' '+esc(b.abbr)+'</span></div>'+
  '<div class="game-table-scroll"><table class="game-team-total-table"><thead><tr><th>'+esc(a.abbr)+'</th><th>TEAM TOTAL</th><th>'+esc(b.abbr)+'</th></tr></thead><tbody>'+rows.join('')+'</tbody></table></div>':
  '<p class="game-empty">ESPN has not supplied team totals for this game.</p>';
}
const machineLabels={m1_elo:'Elo',m2_science:'Basketball Science',m3_player_roster:'Player / Roster',m4_monte_carlo:'Monte Carlo',m5_regularized_ml:'Regularized ML',m6_ensemble:'Ensemble'};
const machineNum=(value,digits=3)=>{const number=safeNum(value);return number===null?'—':number.toFixed(digits)};
const metricValue=(stats,keys)=>keys.map(key=>stats?.[key]).find(value=>value!==undefined&&value!==null&&value!=='');
function machineRows(models,final){
 const rows=Object.entries(models||{}).filter(([key])=>/^m[1-6]_/.test(key));
 return rows.length?'<div class="machine-table-scroll"><table class="machine-table"><thead><tr><th>ENGINE</th><th>PICK</th><th>PROB.</th>'+(final?'<th>RESULT</th><th>BRIER ↓</th><th>LOG LOSS ↓</th><th>SCORE P→A</th><th>SCORE MAE ↓</th><th>MARGIN |E| ↓</th>':'<th>STATUS</th>')+'</tr></thead><tbody>'+rows.map(([key,row])=>{
  const p=safeNum(row.p??row.home_win_probability),pick=p===null?'—':p>=.5?game.home.abbr:game.away.abbr,prob=p===null?'—':(Math.max(p,1-p)*100).toFixed(1)+'%';
  const scores=Number.isFinite(row.away_score)&&Number.isFinite(row.home_score)?machineNum(row.away_score,0)+'–'+machineNum(row.home_score,0)+' → '+game.away.score+'–'+game.home.score:'—';
  return '<tr><td>'+esc(machineLabels[key]||row.label||key)+'</td><td><b>'+esc(pick)+'</b></td><td>'+prob+'</td>'+(final?'<td class="'+(row.correct?'machine-correct':'machine-wrong')+'">'+(row.correct?'✓ CORRECT':'✕ MISSED')+'</td><td>'+machineNum(row.brier)+'</td><td>'+machineNum(row.log_loss)+'</td><td>'+scores+'</td><td>'+machineNum(row.score_mae_per_team,1)+'</td><td>'+machineNum(row.margin_abs_error,1)+'</td>':'<td>FROZEN PRETIP</td>')+'</tr>';
 }).join('')+'</tbody></table></div>':'<p class="game-empty">The six-engine sidecar is unavailable for this matchup. No model result has been reconstructed after tipoff.</p>';
}
function productionForecast(primary,lockedAt,final,reviewGame,reviewedAt){
 if(!primary)return '<p class="game-empty">The immutable lock does not contain a production forecast for this game.</p>';
 const pct=value=>{const n=safeNum(value);return n===null?'—':(n*100).toFixed(1)+'%'};
 const projected=primary.projected_score||{};
 const actualAway=safeNum(reviewGame?.away?.score),actualHome=safeNum(reviewGame?.home?.score);
 const projectedAway=safeNum(projected.away),projectedHome=safeNum(projected.home);
 const grade=reviewGame?.models?.production_elo_v7;
 const outcome=final&&grade&&typeof grade.correct==='boolean'
  ?'<div class="production-grade"><span>VERIFIED WINNER GRADE</span><strong class="'+(grade.correct?'machine-correct':'machine-wrong')+'">'+(grade.correct?'CORRECT':'INCORRECT')+'</strong></div>'
  :final?'<div class="production-grade"><span>VERIFIED WINNER GRADE</span><strong>UNAVAILABLE IN REVIEW</strong></div>':'';
 const scoreline=Number.isFinite(projectedAway)&&Number.isFinite(projectedHome)
  ?'<div class="production-score-comparison"><span>'+esc(game.away.abbr)+' <b>'+machineNum(projectedAway,1)+'</b>'+(final&&actualAway!==null?' → '+machineNum(actualAway,0):'')+'</span><span>'+esc(game.home.abbr)+' <b>'+machineNum(projectedHome,1)+'</b>'+(final&&actualHome!==null?' → '+machineNum(actualHome,0):'')+'</span>'+
   (final?'<small>LOCKED PROJECTION → VERIFIED FINAL · official score MAE: '+machineNum(grade?.score_mae_per_team,1)+' points per team</small>':'<small>ORIGINAL LOCKED PROJECTED SCORE</small>')+'</div>'
  :'<p class="game-disclaimer">No projected score was archived in this lock.</p>';
 return '<section class="production-forecast"><div class="production-forecast-heading"><div><span class="eyebrow">OFFICIAL PRODUCTION · IMMUTABLE</span><h3>'+esc(primary.model||'Production forecast')+'</h3></div><span>'+esc(final?'VERIFIED POSTGAME REVIEW':game.phase==='final'?'FINAL · REVIEW PENDING':game.phase==='postponed'?'POSTPONED · ORIGINAL LOCK':'LOCKED PRETIP')+'</span></div>'+
  '<div class="production-forecast-main"><div><small>LOCKED WINNER</small><strong>'+esc(primary.winner||'—')+'</strong><span>Archived winner probability: '+pct(primary.winner_probability)+'</span></div>'+
  '<div class="production-probabilities"><span>'+esc(game.away.abbr)+' win <b>'+pct(primary.away_win_probability)+'</b></span><span>'+esc(game.home.abbr)+' win <b>'+pct(primary.home_win_probability)+'</b></span></div></div>'+
  scoreline+outcome+'<p class="game-disclaimer">Original forecast lock time: '+esc(timestamp(lockedAt))+'.'+(final&&reviewedAt?' Verified grading review created: '+esc(timestamp(reviewedAt))+'.':'')+' Probabilities shown here are read from the original lock, never recomputed from live or final results.'+(game.phase==='postponed'?' This original lock is not a forecast for any rescheduled tipoff.':'')+'</p></section>';
}
function playerGrades(reviewGame){
 const rows=(reviewGame?.player_results||[]).filter(row=>row.disposition==='played_scored');
 if(!rows.length)return '<p class="game-empty">No eligible participating-player projection grades are available.</p>';
 return '<div class="machine-table-scroll"><table class="machine-table machine-player-grades"><thead><tr><th>PLAYER</th><th>PTS P→A · |E|</th><th>REB P→A · |E|</th><th>AST P→A · |E|</th><th>3PM P→A · |E|</th><th>MIN |E|</th></tr></thead><tbody>'+rows.map(row=>{
  const cell=(key,d=1)=>machineNum(row.projection_if_play?.[key],d)+' → '+machineNum(row.actual?.[key],d)+' · '+machineNum(row.absolute_errors?.[key],d);
  return '<tr><td><a href="../player/?id='+encodeURIComponent(row.actual?.provider_player_id||'')+'&name='+encodeURIComponent(row.name)+'&team='+encodeURIComponent(row.team)+'">'+esc(row.name)+'</a></td><td>'+cell('pts')+'</td><td>'+cell('reb')+'</td><td>'+cell('ast')+'</td><td>'+cell('three_pm')+'</td><td>'+machineNum(row.absolute_errors?.minutes,1)+'</td></tr>';
 }).join('')+'</tbody></table></div><p class="game-disclaimer">Actual FPTS is shown in the box score. A projected FPTS grade is unavailable because the frozen player model did not project every required ESPN category (including steals, blocks and turnovers); it is not backfilled after the game.</p>';
}
function postgameEvidence(reviewGame){
 const a=reviewGame?.away?.abbr,h=reviewGame?.home?.abbr,stats=reviewGame?.team_stats||{},away=stats[a]||{},home=stats[h]||{};
 const display=abbr=>abbr==='WAS'?'WSH':abbr;
 const evidence=[['FIELD GOAL %',['fieldgoalpct','fieldgoalpercentage']],['3 POINT %',['threepointfieldgoalpct','threepointpercentage']],['REBOUNDS',['totalrebounds','rebounds']],['TURNOVERS',['turnovers']],['ASSISTS',['assists']]];
 const available=evidence.map(([label,keys])=>({label,away:metricValue(away,keys),home:metricValue(home,keys)})).filter(row=>row.away!=null||row.home!=null);
 if(!available.length)return '<p class="game-empty">The provider final is verified, but comparable team-factor fields were not included. No postgame explanation is invented.</p>';
 return '<div class="postgame-evidence"><div class="postgame-evidence-head"><b>'+esc(display(a))+'</b><span>VERIFIED FACTOR</span><b>'+esc(display(h))+'</b></div>'+available.map(row=>'<div><b>'+esc(row.away??'—')+'</b><span>'+esc(row.label)+'</span><b>'+esc(row.home??'—')+'</b></div>').join('')+'</div><p class="machine-hypothesis"><b>Evidence vs explanation:</b> these are observed box-score differences. They do not, by themselves, prove why the forecast missed or succeeded; lineup, availability and matchup explanations remain hypotheses unless separately sourced.</p>';
}
function melbourneIsoDate(value){
 const parts=new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Melbourne',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
 const get=type=>parts.find(part=>part.type===type)?.value;return get('year')+'-'+get('month')+'-'+get('day');
}
async function showMachine(){
 const root=$('game-forecast');if(!root||!game)return;
 root.innerHTML='<p>Checking immutable pregame forecasts…</p>';
 try{
  const ledgerResponse=await fetch('../data/audit-ledger.json',{cache:'no-store'});
  if(!ledgerResponse.ok)throw Error('Audit ledger unavailable (HTTP '+ledgerResponse.status+')');
  const ledger=await ledgerResponse.json();
  const date=melbourneIsoDate(game.date);
  const entries=(ledger.entries||[]).filter(e=>e.lock_path).sort((a,b)=>String(b.melbourne_date).localeCompare(String(a.melbourne_date)));
  const candidates=entries.filter(e=>e.melbourne_date===date);
  for(const entry of candidates){
   let lock;
   try{lock=await verifiedArtifact('../'+entry.lock_path,entry.lock_sha256,'Original forecast lock')}
   catch(error){
    root.innerHTML='<p class="game-empty">The original forecast lock could not be verified against the audit ledger: '+esc(error.message)+'. No forecast or grading is shown.</p>';
    return;
   }
   const snapshot=lock.forecasts?.find(g=>String(g.game_id)===String(id));
   if(!snapshot||!lock.locked_at_utc||!(Date.parse(lock.locked_at_utc)<Date.parse(snapshot.tip_utc)))continue;
   // Only the daily review hash published in the ledger anchors official grading.
   const originalHash=lock.integrity?.canonical_payload_without_integrity;
   if(!entry.lock_integrity_sha256||originalHash!==entry.lock_integrity_sha256){
    root.innerHTML='<p class="game-empty">The original forecast lock integrity value does not match the audit ledger. No forecast or grading is shown.</p>';
    return;
   }
   let reviewGame=null,reviewedAt=null,reviewError='';
   const validReview=x=>x?.source_lock_integrity_sha256===originalHash&&
     x.melbourne_date===date&&Array.isArray(x.games);
   if(entry.review_path){
    try{
     const review=await verifiedArtifact('../'+entry.review_path,entry.review_sha256,'Postgame review');
     if(review.schema==='nba-twin-lab-daily-review-v3'&&validReview(review)){
      reviewGame=review.games.find(item=>String(item.game_id)===String(id))||null;
      if(reviewGame)reviewedAt=review.reviewed_at_utc||review.generated_at_utc||null;
      else reviewError='The verified daily review does not contain this game';
     }else reviewError='The verified daily review does not match the original lock';
    }catch(error){reviewError=error.message}
   }else if(game.phase==='final'){
    reviewError='No ledger-bound postgame review is available';
   }
   let frozen={};
   try{const side=await fetch('../audit/supplements/'+encodeURIComponent(date)+'/challenge.lock.json',{cache:'no-store'});if(side.ok){const value=await side.json();frozen=(value.games||[]).find(item=>String(item.game_id)===String(id))?.predictions||{}}}catch(e){}
   const p=snapshot.primary_forecast,final=!!reviewGame,finalPending=game.phase==='final'&&!final;
   root.innerHTML=productionForecast(p,lock.locked_at_utc,final,reviewGame,reviewedAt)+
    (reviewError?'<p class="game-empty">Official postgame grading unavailable: '+esc(reviewError)+'. Grading is withheld.</p>':'')+
    '<section class="machine-section"><div class="machine-section-heading"><div><span class="eyebrow">RESEARCH / EXPERIMENTAL · NOT PRODUCTION</span><h3>'+ (final?'CHALLENGER MACHINES VS REALITY':'FROZEN CHALLENGER MACHINES') +'</h3></div><p>Separate sidecar forecasts; none replace the official production pick.</p></div>'+machineRows(final?reviewGame.models:frozen,final)+'</section>'+
    (final?'<section class="machine-section"><h3>PLAYER FORECASTS VS ACTUALS</h3>'+playerGrades(reviewGame)+'</section><section class="machine-section"><h3>POSTGAME INTELLIGENCE · OBSERVED EVIDENCE</h3>'+postgameEvidence(reviewGame)+'</section>':'<p class="game-disclaimer">Automatic grading appears after this individual game is final and both player tables are complete. It does not wait for the full slate.</p>')+
    '<a class="btn primary" href="../audit/">FULL MODEL LEADERBOARD ↗</a>';return;
  }
  root.innerHTML='<p class="game-empty">No verified immutable pregame forecast exists for this game. We won’t generate a hindsight pick.</p>';
 }catch(error){root.innerHTML='<p class="game-empty">Unable to verify immutable forecast artifacts: '+esc(error.message)+'. No forecast or grading is shown.</p>'}
}
function activate(tab,focus=false){
 selectedTab=tab;
 for(const key of ['overview','matchup','box','machine']){
  const active=key===tab;
  const button=$('tab-'+key),pane=$('pane-'+key);
  button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
  pane.hidden=!active;
 }
 if(focus)$('tab-'+tab).focus();
 if(tab==='overview')showOverview();
 if(tab==='matchup'&&game)showMatchup();
 if(tab==='machine'&&game)showMachine();
}
function installTabs(){
 const buttons=[...document.querySelectorAll('[data-tab]')];
 for(const button of buttons)button.addEventListener('click',()=>activate(button.dataset.tab));
 for(const button of buttons)button.addEventListener('keydown',e=>{
  if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;e.preventDefault();
  const i=buttons.indexOf(button),j=e.key==='Home'?0:e.key==='End'?buttons.length-1:
   (i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
  activate(buttons[j].dataset.tab,true);
 });
}
function scheduleRetry(){
 if(retryTimer||typeof setTimeout!=='function')return;
 const delay=Math.min(10000*Math.pow(2,retryAttempt),60000);
 retryAttempt++;
 retryTimer=setTimeout(()=>{retryTimer=null;if(document.visibilityState!=='hidden')refresh()},delay);
}
async function refresh(){
 if(!valid(id))return;
 const request=++latestRequest;
 let controller=null,requestTimeout=null;
 try{
  if(typeof AbortController==='function'&&typeof setTimeout==='function'){
   controller=new AbortController();requestTimeout=setTimeout(()=>controller.abort(),15000);
  }
  const response=await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event='+encodeURIComponent(id),
   {cache:'no-store',...(controller?{signal:controller.signal}:{})});
  if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json();
  const next=parseSummary(data);
  if(!next)throw Error('ESPN has not supplied the matchup information');
  if(String(next.id)!==String(id))throw Error('ESPN response game ID mismatch');
  if(request!==latestRequest)return;
  const phaseRank={scheduled:0,live:1,final:2};
  if(game&&(phaseRank[next.phase]??0)<(phaseRank[game.phase]??0))
   throw Error('ESPN returned a game status older than the latest accepted state');
  const scoreAvailable=Number.isFinite(next.away.score)&&Number.isFinite(next.home.score);
  const incomingPlayers=window.TwinBoxscorePlus?.parseBoxscore?.(data)||window.NbaLiveDesk?.parseBoxscore?.(data)||[];
  const incomingTeams=parseTeamStats(data,next);
  const teamStatsAvailable=Object.values(incomingTeams).some(stats=>Object.values(stats).some(value=>value!==null));
  const expectedTeams=[next.away.abbr,next.home.abbr];
  const playerTeams=new Set(incomingPlayers.map(player=>player.team));
  const completePlayers=expectedTeams.every(team=>playerTeams.has(team));
  const teamsWithStats=new Set(Object.entries(incomingTeams)
   .filter(([,stats])=>Object.values(stats).some(value=>value!==null)).map(([team])=>team));
  const retrievedAt=new Date().toISOString();
  game=mergeGame(next,game);
  raw=data;
  latestScoresMissing=game.phase!=='scheduled'&&!scoreAvailable;
  if(scoreAvailable)scoreRetrievedAt=retrievedAt;
  if(incomingPlayers.length){
   players=mergePlayerRows(players,incomingPlayers);
   latestPlayersPartial=!completePlayers;
   if(completePlayers){playersRetrievedAt=retrievedAt;playersPartialRetrievedAt=null}
   else playersPartialRetrievedAt=retrievedAt;
  }else{
   latestPlayersPartial=true;
  }
  if(teamStatsAvailable){
   teamStats=mergeTeamStats(teamStats,incomingTeams);
  }
  latestTeamsMissing=expectedTeams.filter(team=>!teamsWithStats.has(team));
  for(const team of teamsWithStats)teamStatsRetrievedAt[team]=retrievedAt;
  const incomingPlays=window.NbaLiveDesk?.extractPlays?.(data)||[];
  if(incomingPlays.length||!plays.length)plays=incomingPlays;
  showHeader();showOverview();showLeaders();showBox();showPlays();showTeam();
  lastLoaded=retrievedAt;refreshError='';retryAttempt=0;
  if(retryTimer&&typeof clearTimeout==='function')clearTimeout(retryTimer);
  retryTimer=null;renderSummaryStatus();
  if(selectedTab==='machine')showMachine();
  if(selectedTab==='matchup')showMatchup();
 }catch(e){
  if(request!==latestRequest)return;
  refreshError=String(e?.message||'request failed').slice(0,160);
  if(!game){$('game-state').textContent='DATA UNAVAILABLE';$('game-score').textContent='— : —';$('game-box-groups').innerHTML=fallback;$('game-play-list').innerHTML=fallback;$('game-team-stats').innerHTML=fallback;
   // The original lock is matched to this game by its feed date, so an outage must be stated rather than left as a loader.
   if($('game-forecast'))$('game-forecast').innerHTML='<p class="game-empty">Forecast and grading are unavailable until the game feed responds, because the original lock is matched to the game by its scheduled date. Nothing is recalculated; this page retries automatically.</p>'}
  renderSummaryStatus();scheduleRetry();
 }finally{
  if(requestTimeout!==null&&typeof clearTimeout==='function')clearTimeout(requestTimeout);
 }
}
function start(){
 installTabs();const requested=new URLSearchParams(location.search).get('tab');activate(['overview','matchup','box','machine'].includes(requested)?requested:'overview');
 if(!valid(id)){ $('game-state').textContent='INVALID GAME ID';$('game-clock').textContent='Open a game from Live Games to see its details.';return }
 refresh();if(typeof setInterval==='function')setInterval(()=>{if(document.visibilityState!=='hidden')refresh()},60000);
}
window.NbaGamePage=Object.freeze({parseSummary,quarterTotals,parseTeamStats,analyzeMatchup,matchupInsights,renderMatchup,orderPlayers,boxColumns:boxCols,selectPerformers,activate,refresh});
start();
})();

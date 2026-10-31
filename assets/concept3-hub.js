/* NBA Twin Lab Concept 3 interactive Game Lab and Daily Slate.
 * Both surfaces derive EVERY probability from an existing immutable pretip lock.
 * Real final scores are separately sourced and never overwrite locked models.
 */
(()=>{'use strict';

const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>document.getElementById(id);
const numbers=x=>typeof x==='number'&&Number.isFinite(x);
const pct=x=>numbers(x)?Math.round(x*100)+'%':'—';
const num=(x,d=1)=>numbers(x)?x.toFixed(d):'—';
const num0=x=>numbers(x)?Math.round(x).toString():'—';
const media=window.NbaMedia;
const logo=(team,large=false)=>media?.image?.(team?.abbr||team,{size:large?'large':'small',label:team?.abbr||team})||'<b>'+esc(team?.abbr||team)+'</b>';
const portrait=p=>media?.headshot?.(p.player_id);
const fmt=iso=>{const date=new Date(iso);return Number.isFinite(date.getTime())?
 new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Melbourne',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(date):'TIME UNKNOWN'};
const toClass=x=>String(x||'').toLowerCase()==='out'?'out':/questionable|doubtful|probable/.test(String(x||'').toLowerCase())?'uncertain':'';
const MODELS=[
 ['m1_elo','Elo'],['m2_science','Basketball Science'],['m3_player_roster','Player / Roster'],
 ['m4_monte_carlo','Monte Carlo'],['m5_regularized_ml','Machine Learning'],['m6_ensemble','Ensemble']
];
const state={entry:null,lock:null,sidecar:null,review:null,gameReviews:{},snapshot:null,results:null,gid:null,
 tab:'prediction',slateTab:'full',playerSort:'pts',playerTeam:'all',showOut:false,search:'',slateSearch:''};
function gameId(g){return String(g?.game_id||g?.id||'')}
function byId(id){return state.lock?.forecasts?.find(g=>gameId(g)===String(id))||null}
function models(g){
 const q=state.sidecar?.games?.find(x=>gameId(x)===gameId(g));
 return q?.predictions||g?.challenge_predictions||{};
}
function selectedModel(g){
 const m=models(g),p=m.m6_ensemble?.available&&numbers(m.m6_ensemble.home_win_probability)?m.m6_ensemble.home_win_probability:null;
 return numbers(p)?{home:p,label:'M6 · LOCKED ENSEMBLE'}:
 numbers(g?.primary_forecast?.home_win_probability)?{home:g.primary_forecast.home_win_probability,label:'ELO · PRODUCTION'}:null;
}
// NBA / ESPN / research snapshots disagree on some legacy abbreviations.
const TEAM_ALIASES={WSH:'WAS',GSW:'GS',NYK:'NY',SAS:'SA',NOP:'NO',PHX:'PHO',BKN:'BRK',UTA:'UTAH',CHA:'CHO'};
const canonicalTeam=abbr=>TEAM_ALIASES[String(abbr||'').toUpperCase()]||String(abbr||'').toUpperCase();
function reviewFor(g){return state.gameReviews[gameId(g)]||state.review?.games?.find(x=>gameId(x)===gameId(g))||null}
function scoreFor(g){
 const review=reviewFor(g);
 if(review&&numbers(review.away?.score)&&numbers(review.home?.score))
  return {away:review.away.score,home:review.home.score,kind:'AUDITED FINAL'};
 const result=state.results?.games?.find(x=>gameId(x)===gameId(g));
 if(result?.status==='final'&&numbers(result.awayScore)&&numbers(result.homeScore))
  return {away:result.awayScore,home:result.homeScore,kind:'SOURCE SNAPSHOT · FINAL'};
 return null;
}
async function get(url,optional=false){
 try{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return await r.json()}
 catch(err){if(optional)return null;throw err}
}
async function loadGameReview(id){
 if(!state.entry||!state.lock||!(/^\d{6,12}$/.test(String(id))))return false;
 if(state.gameReviews[String(id)])return true;
 const path='../audit/reviews/'+encodeURIComponent(state.entry.melbourne_date)+'/games/'+id+'.review.json';
 const data=await get(path,true);
 if(data?.schema!=='nba-twin-lab-game-review-v1'||String(data.game_id)!==String(id)||
 data.source_lock_integrity_sha256!==state.entry.lock_integrity_sha256||
 !Array.isArray(data.games)||data.games.length!==1||
 gameId(data.games[0])!==String(id)||
 !numbers(data.games[0].away?.score)||!numbers(data.games[0].home?.score))
  return false;
 state.gameReviews[String(id)]=data.games[0];
 return true;
}
function otherInfo(g){
 const s=state.snapshot;
 // Never use a later revised team snapshot to justify an already-locked pick.
 const valid=s?.strict_no_future_data===true &&
  Number.isFinite(new Date(s.built_at_utc).getTime()) &&
  new Date(s.built_at_utc).getTime()<=new Date(state.lock?.locked_at_utc).getTime();
 const teams=valid&&Array.isArray(s.teams)?s.teams:[];
 const getT=abbr=>teams.find(t=>canonicalTeam(t.abbr)===canonicalTeam(abbr))||null;
 return {away:getT(g.away.abbr),home:getT(g.home.abbr),available:valid&&!!getT(g.away.abbr)&&!!getT(g.home.abbr),teams};
}
function dateStatus(){
 return state.entry?state.entry.melbourne_date+' · locked '+new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Melbourne',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(state.lock.locked_at_utc))+' AEDT':'No verified lock';
}
function teamData(g,side){
 const players=(g.v9_player_projections||[]).filter(p=>p.team===g[side].abbr);
 const absent=players.filter(p=>String(p.official_injury_report?.status).toLowerCase()==='out');
 const available=players.filter(p=>String(p.official_injury_report?.status).toLowerCase()!=='out')
 .sort((a,b)=>(b.expected_minutes_if_play||0)-(a.expected_minutes_if_play||0));
 return {players,absent,available};
}
function tabBar(names,active,namespace='c3-game-tab'){
 return '<div class="c3-tabs" role="tablist" aria-label="'+(namespace==='c3-game-tab'?'Game analysis sections':'Slate views')+'">'+
 names.map(([id,label])=>'<button type="button" role="tab" class="c3-tab" data-'+namespace+'="'+id+'" aria-selected="'+(id===active)+'">'+label+'</button>').join('')+'</div>';
}
function track(away,home){
 if(!numbers(home))return '<p class="c3-muted">No immutable pregame probability.</p>';
 return '<div class="c3-large-track" role="img" aria-label="Away '+pct(away)+', home '+pct(home)+'">'+
 '<i style="width:'+(away*100).toFixed(2)+'%"></i><i style="width:'+(home*100).toFixed(2)+'%"></i></div>';
}
function pregameSummary(g){
 const model=selectedModel(g),p=model?.home,away=numbers(p)?1-p:null;
 return '<div class="c3-h2h"><div class="c3-side">'+logo(g.away,true)+'<div><b>'+esc(g.away.name)+'</b><small>AWAY · '+esc(g.away.abbr)+'</small></div></div>'+
 '<div class="c3-h2h-mid"><strong>'+esc(fmt(g.tip_utc))+'</strong><small>'+esc(state.entry?.melbourne_date||'')+'</small><em>LOCKED BEFORE TIPOFF</em></div>'+
 '<div class="c3-side right">'+logo(g.home,true)+'<div><b>'+esc(g.home.name)+'</b><small>HOME · '+esc(g.home.abbr)+'</small></div></div></div>'+
 '<p class="c3-source-note">Source: '+esc(model?.label||'No pregame model available')+' · '+esc(dateStatus())+' · numbers are historical pregame estimates, not live odds.</p>';
}
function modelCards(g){
 const ms=models(g),base=g.primary_forecast;
 return '<div class="c3-six-models">'+MODELS.map(([id,label])=>{
 const m=ms[id],p=m?.available&&numbers(m.home_win_probability)?m.home_win_probability:null;
 const favour=numbers(p)?p>=.5?g.home.abbr:g.away.abbr:'—';
 const prob=numbers(p)?Math.max(p,1-p):null;
 return '<div class="c3-engine"><small>'+esc(label)+'</small><b>'+pct(prob)+'</b>'+
 '<div class="c3-engine-track"><i style="width:'+(prob*100||0)+'%"></i></div>'+
 '<small>'+esc(favour)+' pick</small></div>';
 }).join('')+'</div>';
}
function basketballFactors(g){
 const info=otherInfo(g),a=info.away?.season,h=info.home?.season;
 if(!info.available||!a||!h)return [];
 const pc=v=>numbers(v)?(v*100).toFixed(1)+'%':'—';
 const diff=(x,y)=>numbers(x)&&numbers(y)?(100*(x-y)).toFixed(1)+' pp':'—';
 const reason=(text,detail,why)=>({text,detail,why});
 const notes=[];
 // Observable 3PA share is NOT "uncontested" or shot-quality tracking.
 if([a.three_rate,h.three_rate,a.opp_three_rate,h.opp_three_rate].every(numbers)){
  const cha=a.three_rate-h.opp_three_rate,was=h.three_rate-a.opp_three_rate;
  const stronger=cha>was?'away':'home',side=stronger==='away'?g.away:g.home;
  notes.push(reason('Three-point volume matchup',
   g.away.abbr+' attempts '+pc(a.three_rate)+' of shots from three vs '+g.home.abbr+
   ' allowing '+pc(h.opp_three_rate)+' opponent 3PA. '+g.home.abbr+' attempts '+pc(h.three_rate)+
   ' vs '+g.away.abbr+' allowing '+pc(a.opp_three_rate)+'.',
   'Shot-profile fit: '+side.abbr+' has the larger relative three-point frequency opportunity ('+diff(stronger==='away'?a.three_rate:h.three_rate,stronger==='away'?h.opp_three_rate:a.opp_three_rate)+'). Attempt share is not open-shot quality.'));
 }
 if([a.efg,h.efg,a.opp_efg,h.opp_efg].every(numbers)){
  notes.push(reason('Shooting efficiency vs defence',
   g.away.abbr+' eFG '+pc(a.efg)+' vs '+g.home.abbr+' opponent eFG allowed '+pc(h.opp_efg)+
   '; '+g.home.abbr+' eFG '+pc(h.efg)+' vs '+g.away.abbr+' allowed '+pc(a.opp_efg)+'.',
   'Compare both attacks with what the opposing defence actually concedes; small early-season samples may exaggerate edges.'));
 }
 if([a.tov_rate,h.tov_rate,a.opp_tov_rate,h.opp_tov_rate].every(numbers)){
  notes.push(reason('Ball security and pressure',
   g.away.abbr+' turnover rate '+pc(a.tov_rate)+' vs '+g.home.abbr+' forcing '+pc(h.opp_tov_rate)+
   '; '+g.home.abbr+' turnover rate '+pc(h.tov_rate)+' vs '+g.away.abbr+' forcing '+pc(a.opp_tov_rate)+'.',
   'High giveaway rates create transition opportunities. These are observed possession rates, not guaranteed steals.'));
 }
 if([a.orb_rate,h.orb_rate,a.drb_rate,h.drb_rate].every(numbers)){
  notes.push(reason('Second-chance possessions',
   g.away.abbr+' offensive rebound rate '+pc(a.orb_rate)+' vs '+g.home.abbr+
   ' defensive rebound rate '+pc(h.drb_rate)+'; '+g.home.abbr+' offensive rebound rate '+pc(h.orb_rate)+
   ' vs '+g.away.abbr+' defensive rebound rate '+pc(a.drb_rate)+'.',
   'An offensive glass advantage can offset inefficient shooting; these paired rates are not a calculated rebounding forecast.'));
 }
 if(numbers(a.pace)&&numbers(h.pace)){
  notes.push(reason('Pace and possession environment',
   g.away.abbr+' '+a.pace.toFixed(1)+' vs '+g.home.abbr+' '+h.pace.toFixed(1)+' estimated possessions per 48 minutes.',
   'The faster team may push tempo; the realised pace depends on both teams and actual rotations.'));
 }
 return notes;
}
function injuryFactors(g){
 const away=teamData(g,'away'),home=teamData(g,'home');
 const m=models(g),mp=MODELS.map(([id])=>m[id]).filter(p=>p?.available&&numbers(p.home_win_probability)).map(p=>p.home_win_probability);
 const spread=mp.length>1?(Math.max(...mp)-Math.min(...mp))*100:null;
 const f=basketballFactors(g);
 const factors=f.slice(0,4).map((x,i)=>['◉',x.text,x.detail+' '+x.why]);
 const absent=[...away.absent.map(x=>x.name+' ('+g.away.abbr+')'),...home.absent.map(x=>x.name+' ('+g.home.abbr+')')];
 factors.push(['✚','Availability and rotation',
  (absent.length?'Officially OUT: '+absent.join(', ')+'. ':'No officially OUT players in the frozen projection list. ')+
  'Lineups are inferred, not confirmed; official injury data was captured separately and DID NOT change locked probabilities.']);
 factors.push(['↗','Six-model uncertainty',
  spread===null?'Comparable model probabilities unavailable.':
  spread.toFixed(1)+' percentage points between most bullish and bearish models. This spread is model disagreement, NOT a calibrated confidence interval.']);
 if(!f.length)return '<p class="c3-muted">No reliable two-team pretip basketball statistics were available at the forecast cutoff.</p>';
 return '<div class="c3-factors">'+factors.map(([icon,title,detail])=>
  '<div class="c3-factor"><span class="c3-factor-icon" aria-hidden="true">'+icon+'</span>'+
  '<div><b>'+esc(title)+'</b><small>'+esc(detail)+'</small></div></div>').join('')+'</div>'+
 '<p class="c3-source-note">Verified cutoff '+esc(state.snapshot?.built_at_utc||'unknown')+
 ' · current season samples: '+esc(g.away.abbr)+' '+(state.snapshot?.teams?.find(t=>canonicalTeam(t.abbr)===canonicalTeam(g.away.abbr))?.season?.games||'—')+
 ', '+esc(g.home.abbr)+' '+(state.snapshot?.teams?.find(t=>canonicalTeam(t.abbr)===canonicalTeam(g.home.abbr))?.season?.games||'—')+
 ' games. Descriptive observations only; no proven causal contribution to this locked probability.</p>';
}
function postgameBar(g){
 const final=scoreFor(g),review=reviewFor(g);
 if(!final)return '';
 const winning=final.home>final.away?g.home.abbr:g.away.abbr;
 const machine=selectedModel(g),pick=machine?machine.home>=.5?g.home.abbr:g.away.abbr:null;
 const verdict=pick?(pick===winning?'CORRECT PICK':'MISSED PICK'):'NO LOCKED PICK';
 return '<section class="c3-postgame-bar" aria-label="Verified final game result">'+
 '<div><span class="c3-postgame-label">FINAL · '+esc(final.kind)+'</span><strong>'+esc(g.away.abbr)+' '+final.away+' – '+final.home+' '+esc(g.home.abbr)+'</strong></div>'+
 '<div><span class="c3-postgame-label">LOCKED '+esc(machine?.label||'MODEL')+'</span>'+
 '<strong class="'+(pick===winning?'c3-correct':'c3-incorrect')+'">'+esc(pick||'—')+' · '+verdict+'</strong></div>'+
 '<button type="button" class="c3-btn" data-c3-show-audit="true">MACHINES VS REALITY ↓</button></section>';
}
function fullPostgame(g){
 const final=scoreFor(g),review=reviewFor(g);
 if(!final)return '';
 const actual=final.home>final.away?g.home.abbr:g.away.abbr;
 const original=g.primary_forecast?.projected_score;
 const rows=MODELS.map(([id,title])=>{
  const forecast=models(g)[id],grade=review?.models?.[id];
  const hp=forecast?.available&&numbers(forecast.home_win_probability)?forecast.home_win_probability:null;
  const pick=numbers(hp)?hp>=.5?g.home.abbr:g.away.abbr:null;
  const verdict=grade?grade.correct?'✓ CORRECT':'✕ WRONG':'NOT GRADED';
  return '<tr><td>'+esc(title)+'</td><td>'+esc(pick||'—')+' '+pct(numbers(hp)?Math.max(hp,1-hp):null)+'</td>'+
   '<td><span class="'+(grade?.correct?'c3-correct':'c3-incorrect')+'">'+verdict+'</span></td>'+
   '<td>'+num(grade?.brier,3)+'</td><td>'+num(grade?.log_loss,3)+'</td>'+
   '<td>'+num(grade?.score_mae_per_team,1)+'</td></tr>';
 }).join('');
 const scored=review?.player_results?.filter(p=>p.disposition==='played_scored')||[];
 const metrics=['pts','reb','ast','three_pm'].map(key=>{
  const errors=scored.map(p=>p.absolute_errors?.[key]).filter(numbers);
  return key.toUpperCase()+' MAE '+(errors.length?(errors.reduce((a,b)=>a+b,0)/errors.length).toFixed(2):'—');
 }).join(' · ');
 return '<section class="c3-postgame-detail" id="c3-postgame-audit">'+
 '<div class="c3-panel-title"><h3>Machines vs Reality</h3><span class="c3-status c3-final">INDEPENDENTLY VERIFIED FINAL</span></div>'+
 '<p>Actual: <strong>'+esc(actual)+' won '+final.home+'–'+final.away+'</strong> ('+
 esc(g.away.abbr)+' '+final.away+', '+esc(g.home.abbr)+' '+final.home+'). Original locked Elo projected '+
 esc(g.away.abbr)+' '+num0(original?.away)+' – '+num0(original?.home)+' '+esc(g.home.abbr)+
 '. Original predictions are preserved unchanged.</p>'+
 '<div class="c3-scroll"><table class="c3-data-table"><thead><tr><th>ENGINE</th><th>LOCKED PICK</th><th>RESULT</th><th>BRIER ↓</th><th>LOG LOSS ↓</th><th>SCORE MAE ↓</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
 '<p class="c3-source-note">'+(review?
 'Audited against original pretip records. Score MAE shown only for engines with locked score predictions. '+scored.length+' participating-player predictions: '+metrics+'.':
 'This game has a final score, but detailed audited per-engine/player grading is still pending.')+'</p></section>';
}
function predictionPanel(g){
 const selection=selectedModel(g),p=selection?.home,away=numbers(p)?1-p:null;
 const scored=g.primary_forecast?.projected_score;
 return '<div class="c3-main-grid"><section class="c3-panel"><div class="c3-panel-title"><h3>Win Probability</h3><span class="c3-muted">'+esc(selection?.label||'UNAVAILABLE')+'</span></div>'+
 '<div class="c3-prob-score"><div>'+logo(g.away,true)+'<strong>'+pct(away)+'</strong></div><div><strong>'+pct(p)+'</strong>'+logo(g.home,true)+'</div></div>'+
 track(away,p)+modelCards(g)+
 '<p class="c3-source-note">Projected score (Elo): '+esc(g.away.abbr)+' '+num0(scored?.away)+' – '+num0(scored?.home)+' '+esc(g.home.abbr)+'. Six engines are independent research forecasts, not a voting poll.</p>'+
 '</section><section class="c3-panel"><div class="c3-panel-title"><h3>Key Factors</h3><span class="c3-muted">PREGAME EVIDENCE</span></div>'+injuryFactors(g)+'</section></div>'+fullPostgame(g);
}
function lineupPanel(g){
 const team=side=>{
 const t=g[side],rows=teamData(g,side),first=rows.available.slice(0,7);
 const out=rows.absent.map(p=>'<p>'+esc(p.name)+' · OUT</p>').join('');
 const uncertain=rows.available.filter(p=>['questionable','doubtful','probable'].includes(String(p.official_injury_report?.status).toLowerCase()));
 return '<section class="c3-team-lineup"><div class="c3-lineup-heading">'+logo(t,true)+'<div><strong>'+esc(t.name)+'</strong><small>Estimated rotation · NOT confirmed starting five</small></div></div>'+
 '<table class="c3-lineup-table"><thead><tr><th>PLAYER</th><th>IF PLAYING</th><th>STATUS</th></tr></thead><tbody>'+
 first.map(p=>{
 const st=p.official_injury_report?.status||'Unverified';
 return '<tr><td>'+esc(p.name)+'</td><td>'+num0(p.expected_minutes_if_play)+' min</td><td><span class="c3-status '+toClass(st)+'">'+esc(st==='Not listed'?'Unverified':st)+'</span></td></tr>';
 }).join('')+'</tbody></table>'+
 (out?'<div class="c3-absences"><strong>OFFICIAL PRETIP ABSENCES</strong>'+out+'</div>':'')+
 (uncertain.length?'<p class="c3-source-note">Availability unresolved: '+uncertain.map(p=>esc(p.name)).join(', ')+'</p>':'')+
 '</section>';
 };
 return '<div class="c3-lineup-grid">'+team('away')+team('home')+'</div>'+
 '<p class="c3-source-note">Important: lineup groups show estimated minutes from the frozen forecast. Official OUT designations are excluded. Players not on the injury report are not necessarily confirmed to play.</p>';
}
function modelBreakdownPanel(g){
 const m=models(g),review=reviewFor(g),final=scoreFor(g),completed=!!final;
 return '<div class="c3-panel"><div class="c3-panel-title"><h3>Six prediction engines · pretip audit</h3>'+
 '<span class="c3-status '+(completed?'c3-final':'')+'">'+(completed?'VERIFIED FINAL':'AWAITING FINAL')+'</span></div>'+
 (completed?'<p class="c3-source-note">Actual '+esc(g.away.abbr)+' '+final.away+' – '+final.home+' '+esc(g.home.abbr)+
 '. The original locked predictions remain unchanged.</p>':'')+
 '<div class="c3-scroll"><table class="c3-data-table"><thead><tr><th>ENGINE</th><th>LOCKED PICK</th>'+
 '<th>AWAY %</th><th>HOME %</th><th>PREDICTED SCORE</th>'+
 (completed?'<th>VERDICT</th><th>BRIER ↓</th><th>LOG LOSS ↓</th>':'')+
 '</tr></thead><tbody>'+
 MODELS.map(([id,label])=>{
  const row=m[id],hp=row?.available?row.home_win_probability:null;
  const projected=row?.projected_score,grade=review?.models?.[id];
  return '<tr><td>'+esc(label)+'</td><td>'+esc(numbers(hp)?hp>=.5?g.home.abbr:g.away.abbr:'—')+
  '</td><td>'+pct(numbers(hp)?1-hp:null)+'</td><td>'+pct(hp)+'</td>'+
  '<td>'+num0(projected?.away)+' – '+num0(projected?.home)+'</td>'+
  (completed?'<td class="'+(grade?.correct?'c3-correct':'c3-incorrect')+'">'+
   (grade?(grade.correct?'✓ CORRECT':'✕ WRONG'):'PENDING AUDIT')+'</td>'+
   '<td>'+num(grade?.brier,3)+'</td><td>'+num(grade?.log_loss,3)+'</td>':'')+'</tr>';
 }).join('')+'</tbody></table></div>'+
 '<p class="c3-source-note">Model values saved before tipoff · '+esc(dateStatus())+
 '. Official injury data was captured in the sidecar but did not feed back into the saved probabilities. Original Elo win chance: '+
 pct(g.primary_forecast?.winner_probability)+'.</p></div>';
}
function matchupPanel(g){
 const context=otherInfo(g),review=reviewFor(g),final=scoreFor(g);
 const infoRows=[
 ['OFFENSIVE RATING','ortg'],['DEFENSIVE RATING','drtg'],['PACE','pace'],
 ['eFG %','efg'],['3PT ATTEMPT RATE %','three_rate'],
 ['3PT FG%','three_pct'],['OPP 3PT ATTEMPT RATE %','opp_three_rate'],
 ['TURNOVER RATE %','tov_rate'],['OPP TURNOVER RATE %','opp_tov_rate'],
 ['OFF. REBOUND RATE %','orb_rate'],['DEF. REBOUND RATE %','drb_rate']
 ];
 const per=key=>['efg','three_rate','three_pct','opp_three_rate','tov_rate','opp_tov_rate','orb_rate','drb_rate'].includes(key);
 const away=context.away?.season,home=context.home?.season;
 const rows=infoRows.map(([label,key])=>{
  const a=away?.[key],h=home?.[key],percentage=per(key);
  return '<div class="c3-stat-row"><b>'+num(numbers(a)&&percentage?100*a:a)+'</b><span>'+esc(label)+'</span>'+
  '<b>'+num(numbers(h)&&percentage?100*h:h)+'</b></div>';
 }).join('');
 const players=[...teamData(g,'away').available.slice(0,2),...teamData(g,'home').available.slice(0,2)];
 const summary=players.map(p=>'<a class="c3-player-match" href="../team/?team='+encodeURIComponent(p.team)+'&player='+encodeURIComponent(p.player_id)+'#team-player-profile">'+
 (portrait(p)?'<img src="'+portrait(p)+'" alt="" loading="lazy">':'')+
 '<span><strong>'+esc(p.name)+' · '+esc(p.team)+'</strong><small>Conditional projection: '+num(p.projection_if_play?.pts)+' PTS / '+num(p.projection_if_play?.ast)+' AST</small></span></a>').join('');
 const factors=basketballFactors(g).slice(0,3);
 const insight='<div class="c3-evidence-notes">'+factors.map(x=>'<div class="c3-factor"><span class="c3-factor-icon">↗</span>'+
 '<div><b>'+esc(x.text)+'</b><small>'+esc(x.detail)+'</small><small class="c3-factor-why">'+esc(x.why)+'</small></div></div>').join('')+'</div>';
 const teamStat=(code,key)=>{
  const all=review?.team_stats||{},found=Object.keys(all).find(k=>canonicalTeam(k)===canonicalTeam(code));
  return found?all[found]?.[key]:'—';
 };
 const observed=final&&review?'<section class="c3-panel c3-postgame-evidence">'+
  '<h3>After the Buzzer · What Actually Happened</h3>'+
  '<p class="c3-source-note">Final: '+esc(g.away.abbr)+' '+final.away+' – '+final.home+' '+esc(g.home.abbr)+
  '. These numbers describe the completed game; they were NOT known to the pregame models.</p>'+
  '<div class="c3-stats-real">'+[
   ['3PT MADE–ATTEMPTED','threepointfieldgoalsmade-threepointfieldgoalsattempted'],
   ['FG%','fieldgoalpct'],['TURNOVERS','totalturnovers'],
   ['OFFENSIVE REBOUNDS','offensiverebounds'],['ASSISTS','assists']
  ].map(([label,key])=>'<div class="c3-stat-row"><b>'+esc(teamStat(g.away.abbr,key))+
   '</b><span>'+esc(label)+'</span><b>'+esc(teamStat(g.home.abbr,key))+'</b></div>').join('')+'</div>'+
  '<p class="c3-source-note">Use these results to test the pregame matchup hypotheses. One game cannot establish that any factor caused the model error.</p></section>':'';
 return '<div class="c3-compare-grid"><section class="c3-panel"><h3>Team Comparison · Verified Pregame Cutoff</h3>'+
 '<p class="c3-source-note">2026–27 season · '+esc(g.away.abbr)+' '+esc(away?.games||'—')+
 ' games · '+esc(g.home.abbr)+' '+esc(home?.games||'—')+' games</p>'+
 '<div class="c3-stat-row"><b>'+esc(g.away.abbr)+'</b><span>METRIC</span><b>'+esc(g.home.abbr)+'</b></div>'+rows+'</section>'+
 '<section class="c3-panel"><h3>Players to Watch · Both Teams</h3>'+summary+
 '<p class="c3-source-note">These are rotation projections, not verified defensive assignments or confirmed starters.</p></section>'+
 '<section class="c3-panel"><h3>Matchup Game Script</h3>'+
 (insight||'<p>Insufficient source-backed pregame statistics.</p>')+
 '<p class="c3-source-note">Original Elo projected '+esc(g.away.abbr)+' '+num0(g.primary_forecast?.projected_score?.away)+
 ' to '+esc(g.home.abbr)+' '+num0(g.primary_forecast?.projected_score?.home)+
 '. No narrative is retroactively attributed to the immutable machine.</p></section></div>'+
 observed+
 (!context.available?'<p class="c3-source-note">Both pregame team snapshots were not available at lock time. Missing statistics are intentionally blank.</p>':'');
}
function playersPanel(g){
 const review=reviewFor(g),byPlayer=new Map((review?.player_results||[]).map(p=>[String(p.player_id),p]));
 const all=(g.v9_player_projections||[])
 .filter(p=>state.playerTeam==='all'||p.team===state.playerTeam)
 .filter(p=>state.showOut||String(p.official_injury_report?.status).toLowerCase()!=='out')
 .filter(p=>!state.search||String(p.name||'').toLowerCase().includes(state.search.toLowerCase()))
 .sort((a,b)=>(b.projection_if_play?.[state.playerSort]||0)-(a.projection_if_play?.[state.playerSort]||0));
 const excluded=(g.v9_player_projections||[]).filter(p=>String(p.official_injury_report?.status).toLowerCase()==='out').length;
 const stat=(p,k)=>num(p.projection_if_play?.[k]);
 const statName={pts:'Points',reb:'Rebounds',ast:'Assists',three_pm:'3PM'}[state.playerSort]||'Points';
 return '<div class="c3-panel"><div class="c3-controls"><select id="c3-player-team" aria-label="Filter player team">'+
 '<option value="all">Both teams</option>'+[g.away,g.home].map(t=>'<option value="'+esc(t.abbr)+'" '+(state.playerTeam===t.abbr?'selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select>'+
 '<select id="c3-player-sort" aria-label="Select stat comparison">'+[
 ['pts','Points'],['reb','Rebounds'],['ast','Assists'],['three_pm','3PM']
 ].map(([k,n])=>'<option value="'+k+'" '+(state.playerSort===k?'selected':'')+'>Stat: '+n+'</option>').join('')+'</select>'+
 '<input id="c3-player-search" placeholder="Search players…" aria-label="Search player names" value="'+esc(state.search)+'">'+
 '<button class="c3-btn c3-out-toggle" type="button" id="c3-show-out" aria-pressed="'+String(state.showOut)+'">'+
 (state.showOut?'Hide':'Show')+' officially OUT ('+excluded+')</button></div>'+
 '<div class="c3-scroll"><table class="c3-data-table"><thead><tr><th>PLAYER</th><th>MIN IF PLAYING</th>'+
 '<th>'+esc(statName.toUpperCase())+' · PRETIP</th>'+
 (review?'<th>ACTUAL</th><th>ABS ERROR</th>':'')+
 '<th>PTS PROJ</th><th>REB PROJ</th><th>AST PROJ</th><th>3PM PROJ</th><th>AVAILABILITY</th></tr></thead><tbody>'+
 all.map(p=>{
  const grade=byPlayer.get(String(p.player_id)),played=grade?.disposition==='played_scored';
  const out=String(p.official_injury_report?.status).toLowerCase()==='out';
  const official=p.official_injury_report?.status||'Unverified';
  const label=official==='Not listed'?'Not confirmed':official;
  return '<tr'+(out?' class="c3-out-player"':'')+'><td><a class="c3-player-name" href="../team/?team='+encodeURIComponent(p.team)+'&player='+encodeURIComponent(p.player_id)+'#team-player-profile">'+
   (portrait(p)?'<img src="'+portrait(p)+'" alt="" loading="lazy">':'')+esc(p.name)+'</a></td>'+
   '<td>'+(out?'OUT · not active':num0(p.expected_minutes_if_play))+'</td>'+
   '<td>'+stat(p,state.playerSort)+'</td>'+
   (review?'<td>'+(played?num0(grade.actual?.[state.playerSort]):'DNP / ungraded')+'</td>'+
   '<td>'+(played?num(grade.absolute_errors?.[state.playerSort]):'—')+'</td>':'')+
   ['pts','reb','ast','three_pm'].map(k=>'<td>'+stat(p,k)+'</td>').join('')+
   '<td><span class="c3-status '+toClass(official)+'">'+esc(label)+'</span></td></tr>';
 }).join('')+
 '</tbody></table></div><p class="c3-source-note">'+all.length+' shown · '+excluded+
 ' officially OUT in the saved injury report · projections are conditional on playing. Players officially OUT are hidden by default, but the original frozen model values remain accessible for audit.'+
 (review?' Actual performance and absolute errors shown only for participating players in the verified game review. No DNP is scored as zero.':' Pregame player grading will appear after a verified final and complete box score.')+
 '</p></div>';
}
function renderLab(){
 const target=$('c3-lab');
 if(!target||!state.lock)return;
 const g=byId(state.gid)||state.lock.forecasts?.[0];
 if(!g){target.textContent='No locked pregame matchups available.';return}
 state.gid=gameId(g);
 const tabs=[['prediction','Prediction'],['lineups','Lineups'],['players','Player Projections'],['matchup','Matchup Analysis'],['models','Model Breakdown']];
 const rendered=state.tab==='prediction'?predictionPanel(g):state.tab==='lineups'?lineupPanel(g):
 state.tab==='players'?playersPanel(g):state.tab==='matchup'?matchupPanel(g):modelBreakdownPanel(g);
 target.innerHTML='<div class="c3-header"><div><a class="c3-breadcrumb" href="../challenge/daily.html">← Back to Games</a><h1>Game Predictor</h1></div>'+
 '<span class="c3-status-tag">● '+esc(dateStatus())+'</span></div>'+
 '<div class="c3-controls"><label class="c3-muted" for="c3-game-select">LOCKED GAME</label><select id="c3-game-select">'+
 state.lock.forecasts.map(x=>'<option value="'+esc(gameId(x))+'" '+(gameId(x)===state.gid?'selected':'')+'>'+esc(fmt(x.tip_utc)+' · '+x.away.abbr+' @ '+x.home.abbr)+'</option>').join('')+'</select></div>'+
 pregameSummary(g)+postgameBar(g)+tabBar(tabs,state.tab)+
 '<div role="tabpanel" id="c3-tab-content">'+rendered+'</div>';
 bindLab();
}
function bindLab(){
 $('c3-game-select').onchange=e=>{state.gid=e.target.value;state.playerTeam='all';state.tab='prediction';renderLab();
 const requested=state.gid;
 loadGameReview(requested).then(found=>{if(found&&state.gid===requested)renderLab()});
 if(typeof window.history?.replaceState==='function')window.history.replaceState(null,'','?game='+encodeURIComponent(state.gid))};
 document.querySelectorAll('[data-c3-game-tab]').forEach(el=>el.onclick=()=>{state.tab=el.dataset.c3GameTab;renderLab()});
 const post=$('c3-lab')?.querySelector?.('[data-c3-show-audit]');
 if(post)post.onclick=()=>{state.tab='prediction';renderLab();$('c3-postgame-audit')?.scrollIntoView?.({behavior:'smooth',block:'start'})};
 const sort=$('c3-player-sort'),team=$('c3-player-team'),search=$('c3-player-search');
 const out=$('c3-show-out');if(out)out.onclick=()=>{state.showOut=!state.showOut;renderLab()};
 if(sort)sort.onchange=e=>{state.playerSort=e.target.value;renderLab()};
 if(team)team.onchange=e=>{state.playerTeam=e.target.value;renderLab()};
 if(search)search.oninput=e=>{state.search=e.target.value;const index=search.selectionStart;renderLab();$('c3-player-search')?.focus();$('c3-player-search')?.setSelectionRange(index,index)};
}
function slateBody(g){
 const sel=selectedModel(g),p=sel?.home,away=numbers(p)?1-p:null,sc=g.primary_forecast?.projected_score;
 const modelArray=MODELS.map(([id])=>models(g)[id]).filter(x=>x?.available&&numbers(x.home_win_probability)).map(x=>x.home_win_probability);
 const spread=modelArray.length>1?Math.max(...modelArray)-Math.min(...modelArray):null;
 const grade=!numbers(p)?'missing':spread>=.20?'split':'';
 const source=!numbers(p)?'No lock':spread>=.20?'Disagreement':'Model range';
 const score=scoreFor(g);
 return '<tr><td>'+esc(fmt(g.tip_utc))+'</td><td><a class="c3-player-name" href="../predict/?game='+encodeURIComponent(gameId(g))+'">'+
 logo(g.away)+'<strong>'+esc(g.away.abbr)+' @ '+esc(g.home.abbr)+'</strong>'+logo(g.home)+'</a></td>'+
 '<td><div class="c3-prob-inline"><span>'+pct(away)+'</span><div class="c3-inline-track"><i style="width:'+(numbers(away)?away*100:0)+'%"></i><i style="width:'+(numbers(p)?p*100:0)+'%"></i></div><span>'+pct(p)+'</span></div></td>'+
 '<td>'+num0(sc?.away)+' – '+num0(sc?.home)+'</td><td><span class="c3-confidence '+grade+'" title="Across saved research engines; not a calibrated confidence grade">'+esc(source)+'</span>'+
 (numbers(spread)?'<small class="c3-muted"> '+(spread*100).toFixed(1)+'pp</small>':'')+'</td>'+
 (state.slateTab==='results'?'<td>'+esc(score?score.away+' – '+score.home:'Awaiting final')+'</td>':'')+'</tr>';
}
function slateFull(){
 const games=(state.lock.forecasts||[]).filter(g=>[g.away.name,g.home.name,g.away.abbr,g.home.abbr].some(s=>s.toLowerCase().includes(state.slateSearch.toLowerCase())));
 return '<div class="c3-controls"><input id="c3-slate-search" type="search" aria-label="Filter NBA teams" placeholder="Search a team…" value="'+esc(state.slateSearch)+'"></div>'+
 '<div class="c3-scroll"><table class="c3-data-table"><thead><tr><th>TIME · MELBOURNE</th><th>MATCHUP</th><th>WIN PROBABILITY</th><th>PREDICTED SCORE</th><th>MODEL AGREEMENT</th>'+
 (state.slateTab==='results'?'<th>ACTUAL FINAL</th>':'')+'</tr></thead><tbody>'+games.map(slateBody).join('')+'</tbody></table></div>'+
 '<p class="c3-source-note">All probabilities and projected scores come from the saved pretip lock. Confidence badges are replaced by measured model disagreement; no unsupported high/medium certainty claims. '+esc(dateStatus())+'.</p>';
}
function slateComparison(){
 return '<div class="c3-scroll"><table class="c3-data-table"><thead><tr><th>GAME</th>'+MODELS.map(x=>'<th>'+esc(x[1])+'</th>').join('')+'</tr></thead><tbody>'+
 state.lock.forecasts.map(g=>'<tr><td><a href="../predict/?game='+encodeURIComponent(gameId(g))+'">'+esc(g.away.abbr+' @ '+g.home.abbr)+'</a></td>'+
 MODELS.map(([id])=>'<td>'+pct(models(g)[id]?.home_win_probability)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'+
 '<p class="c3-source-note">Values are the home team win probability; all six model outputs refer to the saved pregame state, not revised results.</p>';
}
function slateLeaders(){
 const top=state.lock.forecasts.flatMap(g=>(g.v9_player_projections||[]).map(p=>({...p,game:g})))
 .filter(p=>numbers(p.projection_if_play?.pts)&&String(p.official_injury_report?.status).toLowerCase()!=='out')
 .sort((a,b)=>b.projection_if_play.pts-a.projection_if_play.pts).slice(0,20);
 return '<div class="c3-scroll"><table class="c3-data-table"><thead><tr><th>PLAYER</th><th>GAME</th><th>PTS</th><th>REB</th><th>AST</th><th>3PM</th></tr></thead><tbody>'+
 top.map(p=>'<tr><td><a class="c3-player-name" href="../team/?team='+encodeURIComponent(p.team)+'&player='+encodeURIComponent(p.player_id)+'#team-player-profile">'+
 (portrait(p)?'<img src="'+portrait(p)+'" alt="" loading="lazy">':'')+esc(p.name)+'</a></td>'+
 '<td><a href="../predict/?game='+encodeURIComponent(gameId(p.game))+'">'+esc(p.game.away.abbr+' @ '+p.game.home.abbr)+'</a></td>'+
 ['pts','reb','ast','three_pm'].map(k=>'<td>'+num(p.projection_if_play[k])+'</td>').join('')+'</tr>').join('')+
 '</tbody></table></div><p class="c3-source-note">These projections are conditional on playing and omit players officially marked OUT in the saved injury report.</p>';
}
function renderSlate(){
 const el=$('c3-slate');if(!el||!state.lock)return;
 const tabs=[['full','Full Slate'],['results','Game Results'],['models','Model Comparison'],['players','Player Projections']];
 const body=state.slateTab==='models'?slateComparison():state.slateTab==='players'?slateLeaders():slateFull();
 el.innerHTML='<div class="c3-header"><div><h1>'+ (new Intl.DateTimeFormat('sv-SE',{timeZone:'Australia/Melbourne'}).format(new Date())===state.entry.melbourne_date?'Today’s NBA Predictions':'Latest Locked NBA Predictions')+'</h1><p>'+esc(state.entry.melbourne_date)+' · '+state.lock.forecasts.length+' genuinely locked games</p></div><div class="c3-status-tag">● Locked at '+esc(dateStatus())+'</div></div>'+
 tabBar(tabs,state.slateTab,'c3-slate-tab')+body;
 document.querySelectorAll('[data-c3-slate-tab]').forEach(btn=>btn.onclick=()=>{state.slateTab=btn.dataset.c3SlateTab;renderSlate()});
 if($('c3-slate-search'))$('c3-slate-search').oninput=e=>{const text=e.target.value;state.slateSearch=text;renderSlate();$('c3-slate-search')?.focus();$('c3-slate-search')?.setSelectionRange(text.length,text.length)};
}
async function load(){
 const parent=$('c3-lab')||$('c3-slate');if(!parent)return;
 parent.innerHTML='<p class="c3-muted">Loading immutable pretip forecasts and six research engines…</p>';
 const prefix=$('c3-lab')?'../':'../';
 try{
  const ledger=await get(prefix+'data/audit-ledger.json');
  if(!Array.isArray(ledger.entries)||!ledger.entries.length)throw Error('No immutable pretip slate is available');
  const entry=ledger.entries.at(-1);
  const date=entry.melbourne_date;
  const [lock,sidecar,review,snapshot,results]=await Promise.all([
   get(prefix+entry.lock_path),
   get(prefix+'audit/supplements/'+date+'/challenge.lock.json',true),
   entry.review_path?get(prefix+entry.review_path,true):Promise.resolve(null),
   get(prefix+'data/v7-current.json',true),get(prefix+'data/games.json',true)
  ]);
  if(!lock.forecasts?.length||!lock.locked_at_utc)throw Error('Immutable forecast lock is incomplete');
  state.entry=entry;state.lock=lock;state.sidecar=sidecar;state.review=review;state.snapshot=snapshot;state.results=results;
  state.gid=new URLSearchParams(location.search).get('game')||gameId(lock.forecasts[0]);
  if($('c3-lab'))await loadGameReview(state.gid);
  if($('c3-lab'))renderLab();
  else renderSlate();
 }catch(err){parent.innerHTML='<div class="c3-panel"><h2>Verified forecast unavailable</h2><p>'+esc(err.message)+'. No replacement probabilities are generated.</p></div>'}
}
// GitHub Pages is static: Actions publish game reviews after verified final.
// While a Predictor page is open, check for its single-game review periodically.
if(typeof window.setInterval==='function')window.setInterval(async()=>{
 if(!$('c3-lab')||!state.entry||document.visibilityState==='hidden')return;
 const id=state.gid,g=byId(id);
 if(!g||reviewFor(g))return;
 if(await loadGameReview(id) && state.gid===id)renderLab();
},120000);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();

/* Read-only morning game centre. Initial and locked forecasts remain separate evidence. */
(()=>{'use strict';
const host=document.getElementById('daily-cycle');if(!host)return;
const base=host.dataset.root||'./';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const pct=v=>finite(v)?(v*100).toFixed(1)+'%':'—';
const num=v=>finite(v)?v.toFixed(3):'—';
const points=v=>finite(v)?Math.round(v):'—';
const probability=v=>finite(v)&&v>=0&&v<=1;
let selectedDate=null,view='predictions';
let latestRelease=null;
const previewAllowed=()=>typeof location!=='undefined'&&['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&new URLSearchParams(location.search).get('preview')==='synthetic';
const modelLabel=id=>({production_elo_v7:'Production Elo',possession_monte_carlo_v5:'Possession simulation',roster_beta_v1:'Roster research',joint_score_margin_v1:'Score Machine',m1_elo:'Elo challenger',m2_science:'Basketball Science',m3_player_roster:'Player / roster',m4_monte_carlo:'Monte Carlo challenger',m5_regularized_ml:'Machine Learning',m6_ensemble:'Research ensemble'}[id]||String(id).replace(/_/g,' '));
const assessment=id=>({insufficient_sample:'More games needed',overconfident:'Confidence exceeds observed accuracy',underconfident:'Observed accuracy exceeds confidence',approximately_calibrated:'Confidence close to observed accuracy'}[id]||id);
const logo=code=>typeof window!=='undefined'&&window.NbaMedia?window.NbaMedia.image(code,{size:'small'}):'';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Melbourne',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const stamp=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString('en-AU',{timeZone:'Australia/Melbourne',dateStyle:'medium',timeStyle:'short'})+' Melbourne':'Time unavailable';};
const source=(value,label)=>typeof value==='string'&&/^audit\/(morning|critiques)\/\d{4}-\d{2}-\d{2}\/(initial|critique|locked)\.json$/.test(value)?'<a href="'+esc(base+value)+'">'+esc(label)+'</a>':'';
function modelReport(row,label){
 if(!row)return '<p class="cycle-muted">'+esc(label)+': no verified report available for this date.</p>';
 const r=row.report||{},models=Object.entries(r.models||{});
 const findings=(r.findings||[]).filter(f=>f&&f.matchup);
 return '<details class="cycle-report"><summary>'+esc(label)+' · '+esc(row.date)+' · '+esc(r.reviewed_games)+'/'+esc(r.expected_games)+' verified finals</summary>'+
 '<p>'+(r.status==='complete'?'All forecast games reviewed.':'Partial report: pending games are excluded.')+' Small samples do not establish model superiority.</p>'+
 (findings.length?'<h3>Largest production forecast errors</h3><ol class="cycle-findings">'+findings.map(f=>'<li><strong>'+esc(f.matchup)+'</strong> · '+(f.correct?'Correct winner':'Incorrect winner')+' · Brier '+num(f.brier)+' · confidence '+pct(f.confidence)+'<p>'+esc(f.observation)+'</p></li>').join('')+'</ol>':'<p class="cycle-muted">Game-specific findings will appear after verified finals.</p>')+
 '<h3>Model performance</h3><ul class="cycle-models">'+(models.map(([id,m])=>{const evidence=r.model_evidence?.models?.[id];return '<li><strong>'+esc(modelLabel(id))+'</strong><span>n='+esc(m.count)+' · Accuracy '+pct(m.accuracy)+' · Brier '+num(m.brier)+' · Log loss '+num(m.log_loss)+'</span><span>Score error '+num(m.score_mae_per_team)+' points/team · '+esc(assessment(m.confidence_assessment))+'</span>'+ (evidence?'<p>'+esc(evidence.observation)+'</p><details><summary>Individual predictions and score errors</summary><ol class="cycle-findings">'+evidence.largest_misses.map(f=>'<li><strong>'+esc(f.matchup)+'</strong><p>'+esc(f.observation)+'</p><p>Projected '+points(f.projected_score.away)+' – '+points(f.projected_score.home)+' · actual '+points(f.actual_score.away)+' – '+points(f.actual_score.home)+'</p></li>').join('')+'</ol></details>':'')+'</li>';}).join('')||'<li>No scorable results yet.</li>')+'</ul>'+
 ((r.model_evidence?.largest_player_misses||[]).length?'<details><summary>Largest player projection misses</summary><ol>'+r.model_evidence.largest_player_misses.map(p=>'<li>'+esc(p.name)+' · '+esc(p.stat)+' · projected '+num(p.predicted)+' / actual '+num(p.actual)+' · error '+num(p.absolute_error)+'</li>').join('')+'</ol></details>':'')+
 '<p>Calibration bins and player errors: '+source(row.report_path,'Read reproducible report')+'</p></details>';
}
function gameCard(g){
 const home=esc(g.home),away=esc(g.away),p=g.home_win_probability;
 const winner=finite(p)?p>=0.5?home:away:'Unavailable';
 const score=g.projected_score||{};
 const compare=g.model_comparisons||[],final=g.result?.status==='verified_final';
 const state=g.forecast_available===false?'NO INITIAL FORECAST':final?'VERIFIED FINAL':Date.now()<Date.parse(g.tip_utc)?'UPCOMING':'AWAITING VERIFIED FINAL';
 const teamAccent=typeof window!=='undefined'?window.TwinTeamPrefs?.accent?.[window.TwinTeamPrefs.canonical(g.home)]:null;
 return '<li class="cycle-game"'+(/^#[0-9a-f]{6}$/i.test(teamAccent||'')?' style="--cycle-team:'+teamAccent+'"':'')+'><div class="cycle-game-meta"><span class="cycle-badge'+(final?' final':'')+'">'+state+'</span><span>INITIAL FORECAST</span></div><div class="cycle-game-head"><strong>'+logo(g.away)+away+' <span aria-hidden="true">@</span> '+logo(g.home)+home+'</strong><span>'+esc(stamp(g.tip_utc))+'</span></div>'+
 '<div class="cycle-pick"><span>Initial predicted winner</span><strong>'+winner+'</strong><span>'+pct(finite(p)?Math.max(p,1-p):null)+'</span></div>'+
 '<div class="cycle-bar" role="img" aria-label="'+esc(home)+' '+pct(p)+' versus '+esc(away)+' '+pct(finite(p)?1-p:null)+'"><span style="width:'+(finite(p)?Math.max(0,Math.min(100,(1-p)*100)).toFixed(1):0)+'%"></span></div>'+
 '<div class="cycle-split"><span>'+away+' '+pct(finite(p)?1-p:null)+'</span><span>'+home+' '+pct(p)+'</span></div>'+
 '<p class="cycle-score">Projected score: '+away+' '+points(score.away)+' – '+home+' '+points(score.home)+'</p>'+
 '<p class="cycle-result">'+(g.forecast_available===false?esc(g.reason):final?'Verified final: '+away+' '+esc(g.result.away)+' – '+home+' '+esc(g.result.home):'Result pending verification')+'</p>'+
 '<p class="cycle-muted">Initial '+home+' win probability '+pct(p)+' · not a final pretip lock</p>'+
 (compare.length?'<details><summary>Model comparison ('+compare.length+')</summary><ul class="cycle-comparisons">'+compare.map(m=>'<li>'+esc(m.label||modelLabel(m.id))+' <span>'+(probability(m.home_win_probability)?pct(m.home_win_probability)+' home · '+esc(m.status)+(m.projected_score?' · '+points(m.projected_score.away)+'–'+points(m.projected_score.home):''):'Unavailable · '+esc(m.reason||'No eligible pregame data'))+'</span></li>').join('')+'</ul></details>':'')+
 ((g.player_projections||[]).length?'<details><summary>Conditional player projections ('+g.player_projections.length+')</summary><p class="cycle-muted">If the player participates; inferred minutes are not confirmed availability.</p><ul class="cycle-projections">'+g.player_projections.map(p=>'<li><strong>'+esc(p.name)+'</strong><span>'+esc(p.team)+' · PTS '+num(p.projection_if_play?.pts)+' · REB '+num(p.projection_if_play?.reb)+' · AST '+num(p.projection_if_play?.ast)+'</span></li>').join('')+'</ul></details>':'')+
 (final&&(g.result.players||[]).length?'<details><summary>Verified player box scores</summary><ul class="cycle-projections">'+g.result.players.map(p=>'<li><strong>'+esc(p.name)+'</strong><span>PTS '+esc(p.pts)+' · REB '+esc(p.reb)+' · AST '+esc(p.ast)+'</span></li>').join('')+'</ul></details>':'')+'</li>';
}
function render(data,selected){
 const date=today(),days=[...data.days].filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d.date)).sort((a,b)=>a.date.localeCompare(b.date));
 const current=days.find(d=>d.date===date),day=days.find(d=>d.date===selected),locked=(data.locked||[]).find(d=>d.date===selected);
 const latest=days.at(-1),old=data.date!==date;
 const status=selected===date?(current?'Initial snapshot saved '+esc(stamp(current.captured_at_utc||current.published_at_utc))+' · '+esc(current.report?.reviewed_games)+'/'+esc(current.report?.expected_games)+' verified finals.':data.publication?.status==='not_due'&&!old?'Morning publication is not due yet.':'Today’s initial forecast is unavailable. No morning forecast will be backfilled after tipoff.'):(day?'Archived morning snapshot from '+esc(day.date)+'.':'No initial forecast was published for '+esc(selected)+'.');
 const options=[date,...days.map(d=>d.date),...(data.locked||[]).map(d=>d.date)].filter((d,i,a)=>a.indexOf(d)===i).sort().reverse();
 const stale=Date.now()-Date.parse(data.checked_at_utc)>45*60000;
 const metric=day?.report?.models?.production_elo_v7||locked?.report?.models?.production_elo_v7;
 const allGames=(day?.forecasts||[]).filter(g=>view==='predictions'||g.result?.status==='verified_final');
 const games=host.dataset.variant==='home'?allGames.slice(0,3):allGames;
 const unforecasted=day?.forecasts?.filter(g=>g.forecast_available===false).length||0;
 host.innerHTML=(data.preview===true?'<p class="cycle-preview-warning">'+(data.preview_kind==='historical'?'LOCAL PREVIEW · VERIFIED HISTORICAL RECORDS':'SYNTHETIC TEST DATA — NOT A LIVE FORECAST')+'</p>':'')+'<div class="cycle-top"><div><div class="eyebrow">MORNING PUBLICATION · VERIFIED FINALS · DAILY CRITIQUE</div><h2>THE DAILY CYCLE.</h2><p>06:00 Australia/Melbourne target · best-effort delivery. <strong>Initial forecasts are not final locked pretip forecasts.</strong></p></div>'+
 '<label class="cycle-date-label" for="cycle-date">Browse Melbourne date<select id="cycle-date" aria-label="Browse Melbourne prediction date">'+options.map(d=>'<option value="'+esc(d)+'"'+(d===selected?' selected':'')+'>'+esc(d)+'</option>').join('')+'</select></label></div>'+
 '<p class="cycle-status">'+status+'</p>'+
 (unforecasted?'<p class="cycle-muted">'+unforecasted+' games have no initial prediction and are excluded from forecast accuracy metrics.</p>':'')+
 '<p class="cycle-muted">Last automation check: '+esc(stamp(data.checked_at_utc))+(old?' · Previous-day data; today’s status is unverified.':'')+(stale?' · Results may be stale; refresh to check for updates.':'')+'</p>'+
 (latestRelease?.schema==='nba-twin-lab-deployment-v1'&&latestRelease.publication?.published_at_utc?'<p class="cycle-muted">Latest validated data release: '+esc(stamp(latestRelease.publication.published_at_utc))+'. Snapshot times record when forecasts were saved before release.</p>':'')+
 '<div class="cycle-actions"><div role="group" aria-label="Prediction or verified results view"><button type="button" data-cycle-view="predictions" aria-pressed="'+(view==='predictions')+'">Predictions</button><button type="button" data-cycle-view="results" aria-pressed="'+(view==='results')+'">Verified results</button></div><button type="button" data-cycle-refresh>Refresh results</button><a href="'+base+'#live-games">Live game centre ↗</a><a href="'+base+'audit/">Performance dashboard ↗</a></div>'+
 (metric?'<div class="cycle-kpis"><div><small>VERIFIED GAMES</small><strong>'+esc(metric.count)+'</strong></div><div><small>WINNER ACCURACY</small><strong>'+pct(metric.accuracy)+'</strong></div><div><small>BRIER · LOWER IS BETTER</small><strong>'+num(metric.brier)+'</strong></div><div><small>SCORE ERROR / TEAM</small><strong>'+num(metric.score_mae_per_team)+'</strong></div></div>':'')+
 (day?'<section class="cycle-slate"><div class="cycle-section-heading"><h3>Initial morning forecasts · '+esc(day.date)+'</h3>'+source(day.snapshot_path,'Original initial snapshot')+'</div><ul class="cycle-games">'+games.map(gameCard).join('')+'</ul>'+(!games.length?'<p>No verified results are available for this date.</p>':'')+(games.length<allGames.length?'<a href="'+base+'challenge/daily.html">View all '+allGames.length+' games ↗</a>':'')+'</section>':latest?'<p class="cycle-muted">Latest archived morning snapshot: '+esc(latest.date)+' · '+source(latest.snapshot_path,'Read archive')+'</p>':'')+
 '<section class="cycle-reports"><h3>Postgame model critique</h3>'+modelReport(day?{...day,date:day.date}:null,'Initial forecast critique')+modelReport(locked?{...locked,date:locked.date}:null,'Locked pretip forecast critique')+'</section>'+
 Object.entries(data.recurring||{}).map(([phase,r])=>'<details class="cycle-recurring"><summary>Recurring observations · '+esc(phase==='initial'?'Initial forecasts':'Final pretip locks')+' · '+esc(r.reviewed_games)+' games / '+esc(r.completed_dates)+' dates</summary>'+((r.findings||[]).length?'<ul>'+r.findings.map(f=>'<li><strong>'+esc(modelLabel(f.model_id))+'</strong><p>'+esc(f.observed)+'</p><p>Recommended check: '+esc(f.recommendation)+'</p></li>').join('')+'</ul>':'<p>No pattern met the reporting threshold of at least 10 games across two completed dates.</p>')+'<p class="cycle-muted">'+esc(r.caution)+'</p></details>').join('')+
 '<p class="c3-source-note">Verified results use ESPN public NBA summaries (unofficial) with complete final-game tables. Unverified data is excluded. No automatic model retraining or promotion.</p>';
 const picker=typeof host.querySelector==='function'?host.querySelector('#cycle-date'):null;
 if(picker)picker.addEventListener('change',()=>{selectedDate=picker.value;render(data,picker.value);});
 if(typeof host.querySelectorAll==='function')for(const button of host.querySelectorAll('[data-cycle-view]'))button.addEventListener('click',()=>{view=button.dataset.cycleView;render(data,selected);});
 const refresh=typeof host.querySelector==='function'?host.querySelector('[data-cycle-refresh]'):null;
 if(refresh)refresh.addEventListener('click',load);
}
function load(){return Promise.all([fetch(base+'data/daily-cycle.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('unavailable');return r.json();}),fetch(base+'deployment.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null)]).then(([data,release])=>{
 latestRelease=release;
 if(data.schema!=='courthesis-daily-cycle-v1'||!Array.isArray(data.days))throw Error('invalid');
 if(!Number.isFinite(Date.parse(data.checked_at_utc))||Date.parse(data.checked_at_utc)>Date.now()+60000)throw Error('Invalid source check time');
 if((data.preview||data.synthetic||data.fixture)&&!previewAllowed())throw Error('Test fixture blocked');
 if(data.days.some(d=>(d.forecasts||[]).some(g=>(!probability(g.home_win_probability)&&!(g.forecast_available===false&&g.home_win_probability===null))||(g.model_comparisons||[]).some(m=>m.home_win_probability!==null&&m.home_win_probability!==undefined&&!probability(m.home_win_probability)))))throw Error('Invalid probability');
 render(data,selectedDate||today());
}).catch(()=>{host.innerHTML='<div class="eyebrow">MORNING PUBLICATION · RESULTS · DAILY CRITIQUE</div><h2>THE DAILY CYCLE.</h2><p>Daily publication data is unavailable. The target is 06:00 Australia/Melbourne; delivery is best effort. Initial morning forecasts and final locked pretip forecasts are separate records. No forecast or accuracy numbers are substituted.</p><button type="button" data-cycle-retry>Try again</button>';const retry=typeof host.querySelector==='function'?host.querySelector('[data-cycle-retry]'):null;if(retry)retry.addEventListener('click',load);});}
load();
if(typeof setInterval==='function')setInterval(()=>{if(!document.hidden&&!(typeof host.querySelector==='function'&&host.querySelector('details[open]'))&&!(typeof host.contains==='function'&&host.contains(document.activeElement)))load();},60000);
})();

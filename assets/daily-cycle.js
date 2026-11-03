/* Read-only morning game centre. Initial and locked forecasts remain separate evidence. */
(()=>{'use strict';
const host=document.getElementById('daily-cycle');if(!host)return;
const base=host.dataset.root||'./';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const pct=v=>finite(v)?(v*100).toFixed(1)+'%':'—';
const num=v=>finite(v)?v.toFixed(3):'—';
const points=v=>finite(v)?Math.round(v):'—';
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
 '<h3>Model performance</h3><ul class="cycle-models">'+(models.map(([id,m])=>'<li><strong>'+esc(id)+'</strong><span>n='+esc(m.count)+' · Accuracy '+pct(m.accuracy)+' · Brier '+num(m.brier)+' · Log loss '+num(m.log_loss)+'</span><span>Score MAE '+num(m.score_mae_per_team)+' · Confidence gap '+num(m.confidence_gap)+' · '+esc(m.confidence_assessment)+'</span></li>').join('')||'<li>No scorable results yet.</li>')+'</ul>'+
 '<p>Calibration bins and player errors: '+source(row.report_path,'Read reproducible report')+'</p></details>';
}
function gameCard(g){
 const home=esc(g.home),away=esc(g.away),p=g.home_win_probability;
 const winner=finite(p)?p>=0.5?home:away:'Unavailable';
 const score=g.projected_score||{};
 const compare=(g.model_comparisons||[]).filter(m=>finite(m.home_win_probability));
 return '<li class="cycle-game"><div class="cycle-game-head"><strong>'+away+' <span aria-hidden="true">@</span> '+home+'</strong><span>'+esc(stamp(g.tip_utc))+'</span></div>'+
 '<div class="cycle-pick"><span>Initial predicted winner</span><strong>'+winner+'</strong><span>'+pct(finite(p)?Math.max(p,1-p):null)+'</span></div>'+
 '<div class="cycle-bar" role="img" aria-label="'+esc(home)+' '+pct(p)+' versus '+esc(away)+' '+pct(finite(p)?1-p:null)+'"><span style="width:'+(finite(p)?Math.max(0,Math.min(100,p*100)).toFixed(1):0)+'%"></span></div>'+
 '<div class="cycle-split"><span>'+away+' '+pct(finite(p)?1-p:null)+'</span><span>'+home+' '+pct(p)+'</span></div>'+
 '<p class="cycle-score">Projected score: '+away+' '+points(score.away)+' – '+home+' '+points(score.home)+'</p>'+
 '<p class="cycle-result">'+(g.result?'Verified final: '+away+' '+esc(g.result.away)+' – '+home+' '+esc(g.result.home):'Result pending verification')+'</p>'+
 '<p class="cycle-muted">Initial '+home+' win probability '+pct(p)+' · not a final pretip lock</p>'+
 (compare.length?'<details><summary>Model comparison ('+compare.length+')</summary><ul class="cycle-comparisons">'+compare.map(m=>'<li>'+esc(m.label||m.id)+' <span>'+pct(m.home_win_probability)+' home · '+esc(m.status)+'</span></li>').join('')+'</ul></details>':'')+'</li>';
}
function render(data,selected){
 const date=today(),days=[...data.days].filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d.date)).sort((a,b)=>a.date.localeCompare(b.date));
 const current=days.find(d=>d.date===date),day=days.find(d=>d.date===selected),locked=(data.locked||[]).find(d=>d.date===selected);
 const latest=days.at(-1),old=data.date!==date;
 const status=selected===date?(current?'Initial forecasts published '+esc(stamp(current.published_at_utc))+' · '+esc(current.report?.reviewed_games)+'/'+esc(current.report?.expected_games)+' verified finals.':data.publication?.status==='not_due'&&!old?'Morning publication is not due yet.':'Today’s initial forecast is unavailable. No morning forecast will be backfilled after tipoff.'):(day?'Archived morning snapshot from '+esc(day.date)+'.':'No initial forecast was published for '+esc(selected)+'.');
 const options=[date,...days.map(d=>d.date)].filter((d,i,a)=>a.indexOf(d)===i).sort().reverse();
 host.innerHTML=(data.preview===true?'<p class="cycle-preview-warning">SYNTHETIC TEST DATA — NOT A LIVE FORECAST</p>':'')+'<div class="cycle-top"><div><div class="eyebrow">MORNING PUBLICATION · VERIFIED FINALS · DAILY CRITIQUE</div><h2>THE DAILY CYCLE.</h2><p>06:00 Australia/Melbourne target · best-effort delivery. <strong>Initial forecasts are not final locked pretip forecasts.</strong></p></div>'+
 '<label class="cycle-date-label" for="cycle-date">Browse Melbourne date<select id="cycle-date" aria-label="Browse Melbourne prediction date">'+options.map(d=>'<option value="'+esc(d)+'"'+(d===selected?' selected':'')+'>'+esc(d)+'</option>').join('')+'</select></label></div>'+
 '<p class="cycle-status">'+status+'</p>'+
 '<p class="cycle-muted">Last automation check: '+esc(stamp(data.checked_at_utc))+(old?' · Previous-day data; today’s status is unverified.':'')+'</p>'+
 (day?'<section class="cycle-slate"><div class="cycle-section-heading"><h3>Initial morning forecasts · '+esc(day.date)+'</h3>'+source(day.snapshot_path,'Original initial snapshot')+'</div><ul class="cycle-games">'+(day.forecasts||[]).map(gameCard).join('')+'</ul></section>':latest?'<p class="cycle-muted">Latest archived morning snapshot: '+esc(latest.date)+' · '+source(latest.snapshot_path,'Read archive')+'</p>':'')+
 '<section class="cycle-reports"><h3>Postgame model critique</h3>'+modelReport(day?{...day,date:day.date}:null,'Initial forecast critique')+modelReport(locked?{...locked,date:locked.date}:null,'Locked pretip forecast critique')+'</section>'+
 '<p class="c3-source-note">Verified results use ESPN public NBA summaries (unofficial) with complete final-game tables. Unverified data is excluded. No automatic model retraining or promotion.</p>';
 const picker=typeof host.querySelector==='function'?host.querySelector('#cycle-date'):null;
 if(picker)picker.addEventListener('change',()=>render(data,picker.value));
}
fetch(base+'data/daily-cycle.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('unavailable');return r.json();}).then(data=>{
 if(data.schema!=='courthesis-daily-cycle-v1'||!Array.isArray(data.days))throw Error('invalid');
 render(data,today());
}).catch(()=>{host.innerHTML='<div class="eyebrow">MORNING PUBLICATION · RESULTS · DAILY CRITIQUE</div><h2>THE DAILY CYCLE.</h2><p>Daily publication data is unavailable. The target is 06:00 Australia/Melbourne; delivery is best effort. Initial morning forecasts and final locked pretip forecasts are separate records. No forecast or accuracy numbers are substituted.</p>';});
})();

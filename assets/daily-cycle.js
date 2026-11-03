/* Shared Concept 3 publication panel. Morning probabilities never enter lock widgets. */
(()=>{'use strict';
const host=document.getElementById('daily-cycle');if(!host)return;
const base=host.dataset.root||'./';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>typeof value==='number'&&Number.isFinite(value)?value.toFixed(3):'—';
const percent=value=>typeof value==='number'&&Number.isFinite(value)?(value*100).toFixed(1)+'%':'—';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Melbourne',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const stamp=value=>{const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('en-AU',{timeZone:'Australia/Melbourne',dateStyle:'medium',timeStyle:'short'})+' Melbourne':'Time unavailable';};
const source=(value,label)=>typeof value==='string'&&/^audit\/(morning|critiques)\/[\d-]+\/(initial|critique|locked)\.json$/.test(value)?`<a href="${base+value}">${label} ↗</a>`:'';
function report(row,label){
 if(!row)return `<p>${label}: no verified report available.</p>`;
 const r=row.report;
 return `<details><summary>${label} · ${esc(row.date)} · ${r.reviewed_games}/${r.expected_games} verified finals</summary>
 <p>${r.status==='complete'?'Complete daily report':'Partial report — pending games excluded'}. Small daily samples do not establish model superiority. Models remain unchanged.</p>
 <ul class="cycle-models">${Object.entries(r.models||{}).map(([id,m])=>`<li><strong>${esc(id)}</strong><span>n=${esc(m.count)} · Accuracy ${percent(m.accuracy)} · Brier ${number(m.brier)} · Log loss ${number(m.log_loss)} · Score MAE ${number(m.score_mae_per_team)}</span><span>Confidence assessment: ${esc(m.confidence_assessment)} · Confidence gap ${number(m.confidence_gap)}.</span></li>`).join('')||'<li>No scorable results yet.</li>'}</ul>
 <p>Calibration bins and player errors: ${source(row.report_path,'Read reproducible report')}</p></details>`;
}
fetch(base+'data/daily-cycle.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('unavailable');return r.json();}).then(data=>{
 if(data.schema!=='courthesis-daily-cycle-v1'||!Array.isArray(data.days))throw Error('invalid');
 const date=today(),day=data.days.find(d=>d.date===date),archive=data.days.at(-1);
 const checkedCurrent=data.date===date;
 const latestInitial=[...data.days].reverse().find(d=>d.report?.reviewed_games>0);
 const latestLocked=[...(data.locked||[])].reverse().find(d=>d.report?.reviewed_games>0);
 host.innerHTML=`<div class="eyebrow">MORNING PUBLICATION · RESULTS · DAILY CRITIQUE</div><h2>THE DAILY CYCLE.</h2>
 <p>06:00 Australia/Melbourne target, with daylight saving handled automatically. Scheduled delivery is best effort. <strong>Initial forecasts are separate from final locked pretip forecasts.</strong></p>
 <p class="cycle-status">${day?`Initial forecasts published ${esc(stamp(day.published_at_utc))} · ${day.report.reviewed_games}/${day.report.expected_games} verified finals.`:checkedCurrent&&data.publication.status==='not_due'?'Morning publication is not due yet.':'Today’s initial forecast is unavailable. No morning forecast will be backfilled after tipoff.'}</p>
 <p>Last automation check: ${esc(stamp(data.checked_at_utc))}${!checkedCurrent?' · Previous-day data; today’s status is unverified.':''}</p>
 ${day?`<details open><summary>Initial morning forecasts · ${esc(day.date)}</summary><ul class="cycle-games">${day.forecasts.map(g=>`<li><strong>${esc(g.away)} @ ${esc(g.home)}</strong><span>${esc(stamp(g.tip_utc))}</span><span>Initial ${esc(g.home)} win probability ${percent(g.home_win_probability)}</span><span>${g.result?`Verified final: ${esc(g.away)} ${esc(g.result.away)} – ${esc(g.home)} ${esc(g.result.home)}`:'Result pending verification'}</span></li>`).join('')}</ul>${source(day.snapshot_path,'Original initial snapshot')}</details>`:archive?`<p>Latest archived morning snapshot: ${esc(archive.date)} · ${source(archive.snapshot_path,'Read archive')}</p>`:''}
 ${report(latestInitial,'Initial forecast critique')}${report(latestLocked,'Locked pretip forecast critique')}
 <p class="c3-source-note">Results: verified final scores and complete player tables from ESPN’s public summary (unofficial). Pending and unavailable data are excluded. Calibration reports never retrain or promote models.</p>`;
}).catch(()=>{host.innerHTML='<div class="eyebrow">MORNING PUBLICATION · RESULTS · DAILY CRITIQUE</div><h2>THE DAILY CYCLE.</h2><p>Daily publication data is unavailable. The target is 06:00 Australia/Melbourne; delivery is best effort. Initial morning forecasts and final locked pretip forecasts are separate records. No forecast or accuracy numbers are substituted.</p>';});
})();

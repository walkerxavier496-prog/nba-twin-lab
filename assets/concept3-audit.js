/* Concept 3 accuracy audit: only real verified review metrics.
 * Blank historical KPIs are intentional until complete grades are in ledger.
 */
(()=>{'use strict';
const $=x=>document.getElementById(x);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(x,n=3)=>typeof x==='number'&&Number.isFinite(x)?x.toFixed(n):'—';
const pct=x=>typeof x==='number'&&Number.isFinite(x)?(100*x).toFixed(1)+'%':'—';
const state={ledger:null,tab:'overview'};
const tabs=[['overview','Overview'],['winners','Game Winners'],['props','Player Props'],['models','Model Comparison'],['historical','Historical']];
function kpis(d){
 const models=d.longitudinal?.models||{},prod=models.production_elo_v7||{};
 const stats=d.longitudinal?.player_stats||{};
 return '<div class="c3-audit-kpis">'+[
  ['Game Winner Accuracy',pct(prod.accuracy),'Verified completed games'],
  ['Brier Score',num(prod.brier),'Lower is better'],
  ['Log Loss',num(prod.log_loss),'Lower is better'],
  ['Player PTS MAE',num(stats.pts?.mae,2),'Players graded; excludes DNPs']
 ].map(([label,value,note])=>'<div><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong><small>'+esc(note)+'</small></div>').join('')+'</div>';
}
function trend(d){
 const entries=(d.entries||[]).filter(e=>e.status==='reviewed'&&typeof e.summary?.models?.production_elo_v7?.accuracy==='number');
 if(entries.length<2)return '<div class="c3-trend-frame"><h3>Game Winner Accuracy Trend</h3><p>At least two reviewed slates are required for a genuine accuracy trend. No sample chart will be substituted.</p></div>';
 const values=entries.map(e=>e.summary.models.production_elo_v7.accuracy);
 const max=Math.max(.75,...values),min=Math.min(.35,...values);
 const points=values.map((v,i)=>(30+i*640/(values.length-1)).toFixed(1)+','+(160-(v-min)/(max-min||1)*125).toFixed(1)).join(' ');
 return '<div class="c3-trend-frame"><h3>Game Winner Accuracy Trend · Verified Slates</h3>'+
 '<svg viewBox="0 0 700 185" role="img" aria-label="Actual reviewed accuracy trend" style="width:100%;height:auto">'+
 '<path d="M30 18V164H675" fill="none" stroke="#274664" stroke-width="2"/>'+
 '<polyline fill="none" stroke="#21acff" stroke-width="3" points="'+points+'"/>'+
 '</svg><p class="c3-source-note">'+entries.length+' completed, reviewed slates. Forecasts are timestamped before tipoff.</p></div>';
}
function models(d){
 const rows=Object.entries(d.longitudinal?.models||{});
 return rows.length?'<div class="c3-scroll"><table class="c3-data-table"><thead><tr><th>MODEL</th><th>GAMES</th><th>ACCURACY</th><th>BRIER</th><th>LOG LOSS</th><th>CONFIDENCE</th><th>CALIBRATION EVIDENCE</th></tr></thead><tbody>'+
 rows.map(([key,row])=>'<tr><td>'+esc(row.label||key)+'</td><td>'+Number(row.count||0)+'</td><td>'+pct(row.accuracy)+'</td><td>'+num(row.brier,4)+'</td><td>'+num(row.log_loss,4)+'</td><td>'+pct(row.mean_confidence)+'</td><td>'+esc(String(row.confidence_assessment||'insufficient_sample').replaceAll('_',' '))+'</td></tr>').join('')+'</tbody></table></div>':
 '<p>No reviewed daily models yet. Historical walk-forward research is available separately; it is not the same as the pretip prospective audit.</p>';
}
function historical(d){
 return '<div class="c3-scroll"><table class="c3-data-table"><thead><tr><th>SLATE</th><th>GAMES</th><th>STATUS</th><th>PRETIP LOCK</th></tr></thead><tbody>'+
 (d.entries||[]).slice().reverse().map(e=>'<tr><td>'+esc(e.melbourne_date)+'</td><td>'+Number(e.game_count||0)+'</td><td>'+esc(e.status)+'</td><td><a href="../'+encodeURI(e.lock_path)+'">Open original JSON ↗</a></td></tr>').join('')+'</tbody></table></div>';
}
function props(d){
 const stats=d.longitudinal?.player_stats||{};
 return '<div class="c3-audit-kpis">'+Object.entries({pts:'Points',reb:'Rebounds',ast:'Assists',three_pm:'3PM'}).map(([key,name])=>{
 const row=stats[key]||{};
 return '<div><small>'+name+' MAE</small><strong>'+num(row.mae,2)+'</strong><small>'+Number(row.count||0)+' participating-player projections graded</small></div>';
 }).join('')+'</div><p class="c3-source-note">These are not rates of correct DNP forecasts. Players who did not play are excluded from conditional per-stat MAE.</p>';
}
function render(){
 const d=state.ledger,el=$('c3-audit');
 if(!el||!d)return;
 const reviewed=(d.entries||[]).filter(e=>e.status==='reviewed');
 const body=state.tab==='overview'?kpis(d)+trend(d):state.tab==='models'?models(d):state.tab==='props'?props(d):
 state.tab==='winners'?historical(d):historical(d);
 el.innerHTML='<div class="c3-header"><div><h1>Prediction Accuracy Audit</h1><p>Measuring real performance. No adjustments. Full transparency.</p></div>'+
 '<span class="c3-status-tag">'+(d.entries||[]).reduce((sum,e)=>sum+Number(e.reviewed_game_count||0),0)+' games reviewed</span></div>'+
 '<div class="c3-tabs" role="tablist" aria-label="Accuracy audit sections">'+tabs.map(([key,title])=>
 '<button class="c3-tab" role="tab" type="button" aria-selected="'+(key===state.tab)+'" data-c3-audit-tab="'+key+'">'+title+'</button>').join('')+
 '</div>'+body+'<p class="c3-source-note">Scores and metrics derive exclusively from audited immutable pretip locks. No mockup KPIs or trend lines are published as actual results.</p>';
 document.querySelectorAll('[data-c3-audit-tab]').forEach(btn=>btn.onclick=()=>{state.tab=btn.dataset.c3AuditTab;render()});
}
async function load(){
 const el=$('c3-audit');if(!el)return;
 try{
 const r=await fetch('../data/audit-ledger.json',{cache:'no-store'});if(!r.ok)throw Error('Ledger HTTP '+r.status);
 const d=await r.json();
 if(!Array.isArray(d.entries)||d.schema!=='nba-twin-lab-audit-ledger-v2')throw Error('Audit schema not verified');
 state.ledger=d;render();
 }catch(error){el.innerHTML='<h2>Accuracy ledger unavailable</h2><p>'+esc(error.message)+'. No results have been invented.</p>'}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
async function render(payload,ok=true,context={}) {
 const host={dataset:{root:'../'},innerHTML:''};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/daily-cycle.js'),'utf8'),{
  document:{getElementById:()=>host},fetch:async()=>({ok,json:async()=>payload}),Date,Intl,Number,String,Object,Array,Error,...context
 });
 await new Promise(r=>setImmediate(r));return host.innerHTML;
}
test('shared panel fails honestly when data is absent and is integrated in three routes',async()=>{
 const html=await render(null,false);assert.match(html,/unavailable/);assert.match(html,/Initial morning forecasts and final locked pretip forecasts are separate/);
 for(const file of ['index.html','challenge/daily.html','audit/index.html']) {
  const s=fs.readFileSync(path.join(root,file),'utf8');assert.match(s,/id="daily-cycle"/);assert.match(s,/assets\/daily-cycle.js/);assert.match(s,/assets\/daily-cycle.css/);
 }
});
test('current initial probabilities, verified scores and critiques stay distinctly labelled and escaped',async()=>{
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Melbourne',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const report={reviewed_games:1,expected_games:1,status:'complete',models:{'<script>':{count:1,accuracy:1,brier:.09,log_loss:.36,confidence_assessment:'insufficient_sample'}}};
 const day={date,published_at_utc:new Date().toISOString(),snapshot_path:`audit/morning/${date}/initial.json`,report_path:`audit/morning/${date}/critique.json`,report,
 forecasts:[{home:'BOS',away:'<img>',tip_utc:new Date().toISOString(),home_win_probability:.7,projected_score:{home:112.2,away:106.7},model_comparisons:[{id:'production_elo_v7',label:'Production Elo',home_win_probability:.7,status:'production'}],result:{status:'verified_final',home:110,away:100}}]};
 const html=await render({schema:'courthesis-daily-cycle-v1',date,checked_at_utc:new Date().toISOString(),publication:{status:'published'},days:[day],locked:[{date,report,report_path:`audit/critiques/${date}/locked.json`}]});
 assert.match(html,/Initial BOS win probability 70.0%/);
 assert.match(html,/Projected score: &lt;img&gt; 107 – BOS 112/);assert.match(html,/Model comparison \(1\)/);assert.match(html,/Browse Melbourne date/);assert.match(html,/Verified final/);assert.match(html,/Initial forecast critique/);assert.match(html,/Locked pretip forecast critique/);assert.match(html,/More games needed/);
 assert.doesNotMatch(html,/<img>|<script>/);assert.match(html,/&lt;img&gt;/);
});
test('an archived initial publication never becomes today’s forecast',async()=>{
 const html=await render({schema:'courthesis-daily-cycle-v1',date:'2020-01-01',checked_at_utc:'2020-01-01T00:00:00Z',publication:{status:'published'},days:[{date:'2020-01-01',snapshot_path:'audit/morning/2020-01-01/initial.json',report:{reviewed_games:0}}],locked:[]});
 assert.match(html,/Today’s initial forecast is unavailable/);assert.match(html,/Previous-day data/);assert.match(html,/Latest archived/);assert.doesNotMatch(html,/Initial morning forecasts ·/);
});

test('home hero retains Concept 3 priority above morning cards',()=>{const s=fs.readFileSync(path.join(root,'index.html'),'utf8');assert.ok(s.indexOf('class="hero-grid"')<s.indexOf('id="daily-cycle"'));});
test('synthetic preview payloads are refused on public hosts and without explicit local preview mode',async()=>{
 const payload={schema:'courthesis-daily-cycle-v1',preview:true,checked_at_utc:new Date().toISOString(),days:[],locked:[]};
 for(const location of [{hostname:'walkerxavier496-prog.github.io',search:'?preview=synthetic'},{hostname:'127.0.0.1',search:''}]){
  const html=await render(payload,true,{location,URLSearchParams});assert.match(html,/unavailable/);assert.doesNotMatch(html,/cycle-top|cycle-preview-warning/);
 }
});
test('invalid probabilities cannot appear as certainty and old same-day result feeds are marked stale',async()=>{
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Melbourne',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const data={schema:'courthesis-daily-cycle-v1',date,checked_at_utc:new Date(Date.now()-2*3600000).toISOString(),days:[],locked:[{date:'2026-10-31',report:{models:{}}}]};
 assert.match(await render(data),/Results may be stale/);assert.match(await render(data),/2026-10-31/);
 data.days=[{date,forecasts:[{home_win_probability:1.7}]}];assert.match(await render(data),/unavailable/);
});

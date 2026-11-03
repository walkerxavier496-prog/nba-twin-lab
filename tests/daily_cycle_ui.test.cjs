'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
async function render(payload,ok=true) {
 const host={dataset:{root:'../'},innerHTML:''};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/daily-cycle.js'),'utf8'),{
  document:{getElementById:()=>host},fetch:async()=>({ok,json:async()=>payload}),Date,Intl,Number,String,Object,Array,Error
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
 forecasts:[{home:'BOS',away:'<img>',tip_utc:new Date().toISOString(),home_win_probability:.7,result:{home:110,away:100}}]};
 const html=await render({schema:'courthesis-daily-cycle-v1',date,checked_at_utc:new Date().toISOString(),publication:{status:'published'},days:[day],locked:[{date,report,report_path:`audit/critiques/${date}/locked.json`}]});
 assert.match(html,/Initial BOS win probability 70.0%/);assert.match(html,/Verified final/);assert.match(html,/Initial forecast critique/);assert.match(html,/Locked pretip forecast critique/);assert.match(html,/insufficient_sample/);
 assert.doesNotMatch(html,/<img>|<script>/);assert.match(html,/&lt;img&gt;/);
});
test('an archived initial publication never becomes today’s forecast',async()=>{
 const html=await render({schema:'courthesis-daily-cycle-v1',date:'2020-01-01',checked_at_utc:'2020-01-01T00:00:00Z',publication:{status:'published'},days:[{date:'2020-01-01',snapshot_path:'audit/morning/2020-01-01/initial.json',report:{reviewed_games:0}}],locked:[]});
 assert.match(html,/Today’s initial forecast is unavailable/);assert.match(html,/Previous-day data/);assert.match(html,/Latest archived/);assert.doesNotMatch(html,/Initial morning forecasts ·/);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const lock=JSON.parse(read('practice/2026-10-31-melbourne/forecast.lock.json'));
const ledger=JSON.parse(read('data/audit-ledger.json'));
const supplement=JSON.parse(read('audit/supplements/2026-10-31/challenge.lock.json'));
const review=JSON.parse(read('audit/reviews/2026-10-31/review.json'));
const perGame=JSON.parse(read('audit/reviews/2026-10-31/games/401909277.review.json'));
const snapshot=JSON.parse(read('tests/fixtures/v7-current-2026-10-30.json'));
const games=JSON.parse(read('data/games.json'));
const gameId='401909277';
function render(tab,opts={}){
 const entry={...ledger.entries.find(e=>e.melbourne_date==='2026-10-31'),review_path:null,status:'locked_awaiting_results'};
 assert.ok(entry.lock_integrity_sha256,'Original lock integrity must be present');
 const map={
  '../data/audit-ledger.json':{...ledger,entries:[entry]},
  ['../'+entry.lock_path]:lock,
  '../audit/supplements/2026-10-31/challenge.lock.json':supplement,
  '../data/v7-current.json':opts.futureSnapshot?{...snapshot,built_at_utc:'2026-11-02T00:00:00Z'}:snapshot,
  '../data/games.json':opts.noFinal?{...games,games:games.games.map(g=>String(g.id)===gameId?{...g,status:'scheduled',homeScore:null,awayScore:null}:g)}:games
 };
 if(!opts.noReview)map['../audit/reviews/2026-10-31/games/'+gameId+'.review.json']=perGame;
 const els=new Map(),byId=id=>{
  if(!els.has(id))els.set(id,{id,innerHTML:'',textContent:'',value:gameId,style:{},querySelector(){return null},classList:{toggle(){}},focus(){}});
  return els.get(id);
 };
 const doc={readyState:'complete',getElementById:byId,querySelectorAll:()=>[],visibilityState:'visible'};
 const win={NbaMedia:{image:x=>'<span class="team-logo">'+(x.abbr||x)+'</span>',headshot:id=>'nba-image-'+id+'.png'}};
 const fetch=async url=>({ok:Object.hasOwn(map,url),status:Object.hasOwn(map,url)?200:404,json:async()=>map[url]});
 const script=read('assets/concept3-hub.js').replace("tab:'prediction',slateTab:","tab:'"+tab+"',slateTab:");
 vm.runInNewContext(script,{window:win,document:doc,location:{search:'?game='+gameId},URLSearchParams,fetch,Date,Intl},
  {filename:'assets/concept3-hub.js'});
 return {byId,rendered:async()=>{await new Promise(resolve=>setImmediate(resolve));return byId('c3-lab').innerHTML}};
}
test('Both teams load from a VERIFIED pretip snapshot despite WSH/WAS alias differences',async()=>{
 const html=await render('matchup').rendered();
 assert.match(html,/Charlotte Hornets/);
 assert.match(html,/Washington Wizards/);
 assert.match(html,/102\.2/,'Charlotte offensive rating');
 assert.match(html,/112\.9/,'Washington offensive rating');
 assert.match(html,/OPP 3PT ATTEMPT RATE %/);
 assert.match(html,/Three-point shot-profile mismatch/);
 assert.match(html,/Turnover pressure vs opposing ball security/);
 assert.match(html,/OFF\. REBOUND RATE %/);
 assert.match(html,/After the Buzzer/);
 assert.match(html,/12-56/,'Charlotte actual 3PT shots');
 assert.match(html,/10-30/,'Washington actual 3PT shots');
 assert.match(html,/small early-season samples|5 games/);
});
test('Each individual FINAL review grades six machines without waiting for the slate review',async()=>{
 const html=await render('prediction').rendered();
 assert.match(html,/CHA 79 – 95 WSH/);
 assert.match(html,/MISSED PICK/);
 assert.match(html,/Machines vs Reality/);
 assert.match(html,/0\.574/,'Saved M6 ensemble Brier for Washington upset');
 assert.match(html,/BRIER/);
 assert.match(html,/LOG LOSS/);
 assert.match(html,/196|participating-player predictions:/);
 assert.match(html,/Original predictions are preserved unchanged/i);
});
test('Model Breakdown shows true postgame verdicts instead of only pregame probabilities',async()=>{
 const html=await render('models').rendered();
 assert.match(html,/VERIFIED FINAL/);
 assert.match(html,/WRONG/);
 assert.match(html,/0\.574/);
 assert.match(html,/FINAL/);
});
test('Player stats show actual and absolute errors only for eligible participants; OUT hidden by default',async()=>{
 const view=render('players'),html=await view.rendered();
 assert.match(html,/ACTUAL/);
 assert.match(html,/ABS ERROR/);
 assert.match(html,/Brandon Miller/);
 assert.match(html,/19/);
 assert.doesNotMatch(html,/Kon Knueppel/);
 assert.match(html,/Show officially OUT/);
 assert.match(html,/No DNP is scored as zero/);
 assert.equal(typeof view.byId('c3-show-out').onclick,'function');
 view.byId('c3-show-out').onclick();
 assert.match(view.byId('c3-lab').innerHTML,/Kon Knueppel/);
 assert.match(view.byId('c3-lab').innerHTML,/OUT · not active/);
});
test('Never leak a revised posttip team snapshot back into pretip basketball reasoning',async()=>{
 const html=await render('matchup',{futureSnapshot:true}).rendered();
 assert.doesNotMatch(html,/112\.9/);
 assert.match(html,/not available at lock time/);
});
test('No fabricated final grading before an independently verified outcome',async()=>{
 const html=await render('prediction',{noReview:true,noFinal:true}).rendered();
 assert.doesNotMatch(html,/Machines vs Reality/);
 assert.doesNotMatch(html,/MISSED PICK/);
 assert.match(html,/LOCKED ENSEMBLE/);
});
test('Immutable pregame locks retain the same snapshots after postgame display',()=>{
 assert.equal(lock.forecasts[0].primary_forecast.winner,'CHA');
 assert.equal(lock.forecasts[0].primary_forecast.home_win_probability,0.20674107431349767);
 assert.equal(supplement.games[0].predictions.m6_ensemble.home_win_probability,0.24258326079585543);
});

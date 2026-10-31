'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const publishedLedger=JSON.parse(read('data/audit-ledger.json'));
const originalEntry=publishedLedger.entries.find(entry=>entry.melbourne_date==='2026-10-31');
if(!originalEntry)throw Error('Immutable 2026-10-31 test fixture is missing');
// Freeze the original one-slate state so a future successful nightly audit
// never makes these V20 UI regression tests fail as new slates arrive.
const lockedLedger={...publishedLedger,entries:[{...originalEntry,status:'locked_awaiting_results',review_path:null}],
 longitudinal:{models:{},player_stats:{pts:{count:0,mae:null},reb:{count:0,mae:null},ast:{count:0,mae:null},three_pm:{count:0,mae:null}}}};
const fixture={
 '../data/audit-ledger.json':lockedLedger,
 '../practice/2026-10-31-melbourne/forecast.lock.json':JSON.parse(read('practice/2026-10-31-melbourne/forecast.lock.json')),
 '../audit/supplements/2026-10-31/challenge.lock.json':JSON.parse(read('audit/supplements/2026-10-31/challenge.lock.json')),
 '../data/v7-current.json':JSON.parse(read('data/v7-current.json')),
 '../data/games.json':JSON.parse(read('data/games.json'))
};
const sourceFetch=async uri=>({ok:Object.hasOwn(fixture,uri),status:200,json:async()=>fixture[uri]});
function run(view,source){
 const markup={innerHTML:''},select={value:'401909277',onchange:null};
 const tabs=[...['prediction','lineups','players','matchup','models','full','results'].map(name=>({dataset:{c3GameTab:name,c3SlateTab:name},onclick:null}))];
 const doc={readyState:'complete',getElementById:id=>id===view?markup:id==='c3-game-select'?select:null,
  querySelectorAll:()=>tabs};
 const location={search:'?game=401909277'};
 const win={NbaMedia:{image:team=>'<span class="team-logo">'+(team.abbr||team)+'</span>',
  headshot:id=>'https://cdn.nba.com/headshots/nba/latest/260x190/'+id+'.png'}};
 vm.runInNewContext(source,{window:win,document:doc,location,fetch:sourceFetch,URLSearchParams,Date,Intl,console},{filename:source===read('assets/concept3-audit.js')?'audit':view});
 return {markup,tabs};
}
test('approved reference retains explicit high fidelity requirements and original provenance',()=>{
 const spec=read('docs/approved-design-concept-3.md');
 assert.match(spec,/APPROVED WEBSITE DESIGN: CONCEPT 3/);
 for(const file of ['index.html','predict/index.html','challenge/daily.html','audit/index.html']){
  const html=read(file);
  assert.ok(html.includes('concept3-fidelity.css'),file+' missing new owner-approved reference implementation');
 }
 const imageCss=read('assets/concept3-fidelity.css');
 assert.match(imageCss,/LeBron_James%27_pregame_ritual\.jpg/);
 assert.match(read('index.html'),/Keith Allison/);
});
test('homepage follows Concept 3 hero/metrics/right rail composition and preserves real data IDs',()=>{
 const html=read('index.html');
 assert.ok(html.indexOf('metric-strip')>html.indexOf('class="lead-story"'));
 assert.ok(html.indexOf('metric-strip')<html.indexOf('class="c3-rail"'));
 for(const id of ['feature-tip','featured-game','feature-confidence','feature-players','c3-latest-results','home-ticker','home-games','home-projections'])
  assert.ok(html.includes('id="'+id+'"'),id+' missing');
 const home=read('assets/home.js');
 assert.match(home,/archive\?\.lock\?\.forecasts/);
 assert.match(home,/c3-prob-track/);
 assert.match(home,/liveFeed\?\.games/);
 assert.match(home,/phase==='final'/);
 assert.doesNotMatch(home,/score\.random\(/);
});
test('Game Lab renders actual six frozen model outputs and usable five tabs',async()=>{
 const {markup,tabs}=run('c3-lab',read('assets/concept3-hub.js'));
 await new Promise(resolve=>setImmediate(resolve));
 const html=markup.innerHTML;
 assert.match(html,/Charlotte Hornets/);
 assert.match(html,/Washington Wizards/);
 assert.match(html,/Basketball Science/);
 assert.match(html,/Machine Learning/);
 assert.match(html,/76%/); // actual M6 CHA away chance of 75.74%, rounded
 for(const name of ['Prediction','Lineups','Player Projections','Matchup Analysis','Model Breakdown'])
  assert.ok(html.includes(name),name);
 const tab=tabs.find(btn=>btn.dataset.c3GameTab==='lineups');
 assert.equal(typeof tab.onclick,'function');
 tab.onclick();
 assert.match(markup.innerHTML,/Kon Knueppel/);
 assert.match(markup.innerHTML,/OFFICIAL PRETIP ABSENCES/);
 assert.match(markup.innerHTML,/NOT confirmed starting five/);
});
test('Daily slate matches ten immutable 31 October games and shows measured disagreement, not fake confidence',async()=>{
 const {markup,tabs}=run('c3-slate',read('assets/concept3-hub.js'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(markup.innerHTML,/10 genuinely locked games/);
 assert.match(markup.innerHTML,/WIN PROBABILITY/);
 assert.match(markup.innerHTML,/MODEL AGREEMENT/);
 assert.match(markup.innerHTML,/Charlotte|CHA @ WSH/);
 assert.doesNotMatch(markup.innerHTML,/Value Bets/);
 assert.doesNotMatch(markup.innerHTML,/67\.3%/);
 const tab=tabs.find(btn=>btn.dataset.c3SlateTab==='models');
 tab.onclick();
 assert.match(markup.innerHTML,/Basketball Science/);
 assert.match(markup.innerHTML,/Model Comparison/);
});
test('Accuracy audit displays only actual validated values and never mockup scorecard',async()=>{
 const src=read('assets/concept3-audit.js');
 const markup={innerHTML:''};
 vm.runInNewContext(src,{document:{readyState:'complete',getElementById:id=>id==='c3-audit'?markup:null,
  querySelectorAll:()=>[]},fetch:sourceFetch,Date,Intl,console},{filename:'audit'});
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(markup.innerHTML,/Prediction Accuracy Audit/);
 assert.match(markup.innerHTML,/Game Winner Accuracy/);
 assert.match(markup.innerHTML,/At least two reviewed slates/);
 assert.doesNotMatch(markup.innerHTML,/67\.3%|0\.189|0\.612/);
});
test('Original 31 October lock and six-model challenger remain unmodified',()=>{
 const f=fixture['../practice/2026-10-31-melbourne/forecast.lock.json'];
 const s=fixture['../audit/supplements/2026-10-31/challenge.lock.json'];
 assert.equal(f.scope.games,10);
 assert.equal(f.forecasts[0].primary_forecast.winner,'CHA');
 assert.equal(s.games.length,10);
 assert.equal(s.games[0].predictions.m6_ensemble.home_win_probability,0.24258326079585543);
});

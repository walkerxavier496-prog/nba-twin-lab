'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const waitFor=async predicate=>{
 const limit=Date.now()+3000;
 while(Date.now()<limit){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10))}
 assert.ok(predicate(),'Timed out waiting for byte-verified scorecard data');
};

test('homepage command centre leads with Melbourne scoreboard and compact primary navigation',()=>{
 const html=read('index.html'),nav=read('assets/site-nav.js'),mobile=read('assets/site-shell.js');
 assert.ok(html.includes('id="live-games"'));
 assert.match(html,/id="home-team-trends"/);
 assert.match(html,/id="home-machine-scorecard"/);
 assert.match(html,/GAMES <em>COMMAND CENTRE\./);
 for(const section of ['GAMES','#live-games','PREDICTIONS','predict/','LEAGUE','league/','PLAYERS','player-stats/','MODEL LAB','challenge/'])
  assert.ok(nav.includes(section),section+' is a primary navigation destination');
 for(const section of ['Games','Predictions','League','Players','Model Lab'])assert.ok(mobile.includes('"'+section+'"'));
 assert.match(read('assets/v19-concept3.css'),/body\.v12\.home #live-games\{order:-1/);
 assert.match(read('assets/v19-concept3.css'),/home-command-panels/);
 assert.match(read('assets/v19-concept3.css'),/@media\(max-width:760px\)\{body\.v12\.home \.home-command-panels\{grid-template-columns:1fr\}\}/);
});

test('team form only emits streaks from consecutive dated final games and excludes future rows',()=>{
 const window={};
 const document={getElementById:()=>null};
 vm.runInNewContext(read('assets/home.js'),{window,document,fetch:async()=>({ok:false}),Date,Intl,Promise,console});
 const games=[
  {id:'1',date:'2026-10-25T00:00:00Z',status:'final',home:{abbr:'AAA'},away:{abbr:'BBB'},homeScore:100,awayScore:90},
  {id:'2',date:'2026-10-26T00:00:00Z',status:'final',home:{abbr:'BBB'},away:{abbr:'AAA'},homeScore:99,awayScore:90},
  {id:'3',date:'2026-10-27T00:00:00Z',status:'final',home:{abbr:'AAA'},away:{abbr:'BBB'},homeScore:100,awayScore:90},
  {id:'4',date:'2026-10-28T00:00:00Z',status:'final',home:{abbr:'AAA'},away:{abbr:'BBB'},homeScore:100,awayScore:90},
  {id:'5',date:'2026-10-29T00:00:00Z',status:'final',home:{abbr:'AAA'},away:{abbr:'BBB'},homeScore:100,awayScore:90},
  {id:'7',date:'2026-09-01T00:00:00Z',status:'final',home:{abbr:'AAA'},away:{abbr:'BBB'},homeScore:100,awayScore:90},
  {id:'6',date:'2026-11-02T00:00:00Z',status:'final',home:{abbr:'AAA'},away:{abbr:'BBB'},homeScore:100,awayScore:90}
 ];
 const streaks=window.NbaHome.teamStreaks({built_at_utc:'2026-10-31T00:00:00Z',games},Date.parse('2026-10-31T00:00:00Z'));
 assert.deepEqual(Array.from(streaks,streak=>[streak.team.abbr,streak.count,streak.outcome]),
  [['AAA',3,'W'],['BBB',3,'L']]);
});

test('official daily scorecard requires byte-verified lock/review and consistent production grading',async()=>{
 const ledger=JSON.parse(read('data/audit-ledger.json'));
 const entry=ledger.entries.find(item=>item.melbourne_date==='2026-10-31');
 assert.ok(entry?.review_path);
 const files={
  './data/audit-ledger.json':{...ledger,entries:[entry]},
  './data/five-model-report.json':{common_evaluation:{games:3643}},
  './data/games.json':JSON.parse(read('data/games.json')),
  ['./'+entry.lock_path]:JSON.parse(read(entry.lock_path)),
  ['./'+entry.review_path]:JSON.parse(read(entry.review_path)),
  ['./audit/supplements/2026-10-31/challenge.lock.json']:JSON.parse(read('audit/supplements/2026-10-31/challenge.lock.json'))
 };
 const elements=new Map(),get=id=>{
  if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:'',href:'',classList:{toggle(){},remove(){}}});
  return elements.get(id);
 };
 const document={getElementById:get,addEventListener(){}};
 const feed={melbourne_date:'20261031',date:'20261031',games:[],fetched_at_utc:'2026-10-31T00:00:00Z'};
 const window={NbaScores:{melbourneDate:()=> '20261031',usDate:()=> '20261031',
  fetchDate:async()=>feed,fetchMelbourneDate:async()=>feed},
  NbaLiveDesk:{setFeed(){},setLockedForecasts(){},unavailable(){}}};
 const lockUrl='./'+entry.lock_path,reviewUrl='./'+entry.review_path;
 const fetch=async url=>({ok:Object.hasOwn(files,url),status:200,json:async()=>files[url],
  text:async()=>url===lockUrl?read(entry.lock_path):url===reviewUrl?read(entry.review_path):JSON.stringify(files[url])});
 vm.runInNewContext(read('assets/home.js'),{window,document,fetch,Date,Intl,Promise,console,crypto:crypto.webcrypto,TextEncoder,encodeURIComponent});
 await waitFor(()=>get('home-machine-scorecard').innerHTML.includes('PRODUCTION ELO · 10 graded games'));
 const card=get('home-machine-scorecard').innerHTML;
 assert.match(card,/PRODUCTION ELO · 10 graded games/);
 assert.match(card,/Winner accuracy 60\.0%/);
 assert.match(card,/Brier 0\.249/);
 assert.match(card,/Original locked probabilities/);
 assert.match(card,/Official production game-by-game results/);
 assert.match(card,/RESEARCH & EXPERIMENTAL MACHINES/);
 assert.match(card,/M6 · Nested weighted ensemble/);
});

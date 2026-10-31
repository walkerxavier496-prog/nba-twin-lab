'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const waitFor=async predicate=>{
 const limit=Date.now()+3000;
 while(Date.now()<limit){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10))}
 assert.ok(predicate(),'Timed out waiting for byte-verified homepage data');
};

test('homepage ticker renders real team-mark components, scores and accessible matchup names',async()=>{
 const ledger=JSON.parse(read('data/audit-ledger.json'));
 const date='2026-10-31';
 const entry=ledger.entries.find(x=>x.melbourne_date===date);
 assert.ok(entry);
 ledger.entries=[entry];
 const lock=JSON.parse(read('practice/2026-10-31-melbourne/forecast.lock.json'));
 const sidecar=JSON.parse(read('audit/supplements/2026-10-31/challenge.lock.json'));
 const files={
  './data/audit-ledger.json':ledger,
  './data/five-model-report.json':{common_evaluation:{games:3643}},
  ['./'+entry.lock_path]:lock,
  ['./audit/supplements/'+date+'/challenge.lock.json']:sidecar
 };
 const elements=new Map();
 const get=id=>{
  if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',href:''});
  return elements.get(id);
 };
 const doc={getElementById:get};
 const window={NbaMedia:{image:abbr=>'<span class="ticker-logo-test" data-logo="'+abbr+'"><img src="verified-logo.png" alt=""></span>',playerImage:()=>''}};
 const lockPath='./'+entry.lock_path;
 const fetch=async uri=>({ok:Object.hasOwn(files,uri),json:async()=>files[uri],text:async()=>uri===lockPath?read(entry.lock_path):JSON.stringify(files[uri])});
 vm.runInNewContext(read('assets/home.js'),{document:doc,window,fetch,Date,Intl,Promise,console,crypto:crypto.webcrypto,TextEncoder},{filename:'assets/home.js'});
 await waitFor(()=>((get('home-ticker').innerHTML.match(/class="ticker-logo-test"/g)||[]).length>=20));
 const markup=get('home-ticker').innerHTML;
 assert.ok((markup.match(/class="ticker-logo-test"/g)||[]).length>=20,'Ten games need two logo components each');
 assert.match(markup,/class="court-ticker__matchup"/);
 assert.match(markup,/class="court-ticker__score"/);
 assert.match(markup,/aria-label="Charlotte Hornets at Washington Wizards/);
 assert.doesNotMatch(markup,/<b>CHA<\/b>/,'Do not render team abbreviations as ticker primary graphics');
 assert.match(markup,/79|PRODUCTION ELO|LOCKED/,'Shows genuine pregame prediction or independently confirmed final score');
});
test('header team selector is removed while preference data and watchlist remain usable',()=>{
 const code=read('assets/team-prefs.js');
 assert.doesNotMatch(code,/function render\(/);
 assert.doesNotMatch(code,/document\.createElement\('select'\)/);
 const rootStyle={setProperty(){}},events={};
 let headerTouched=false;
 const doc={readyState:'complete',documentElement:{style:rootStyle,dataset:{}},getElementById:()=>null,
  querySelector:()=>{headerTouched=true;return null;},dispatchEvent:e=>events[e.type]=e.detail};
 const data={};
 const store={getItem:k=>data[k]||null,setItem:(k,v)=>data[k]=v,removeItem:k=>delete data[k]};
 class CustomEvent{constructor(type,o){this.type=type;this.detail=o.detail;}}
 const window={};
 vm.runInNewContext(code,{window,document:doc,localStorage:store,CustomEvent},{filename:'assets/team-prefs.js'});
 assert.equal(headerTouched,false,'No header widget should be inserted');
 assert.equal(window.TwinTeamPrefs.set('MIL'),'MIL');
 assert.equal(window.TwinTeamPrefs.get(),'MIL');
 assert.equal(data['nba-twin-lab:my-team:v1'],'MIL');
 assert.ok(events['twinlab:teamchange']);
 const desk=read('assets/live-desk.js');
 assert.match(desk,/TwinWatchlist\?\.state\?\.\(\)\.teams/);
 assert.match(desk,/twinlab:watchlistchange/);
 const nav=read('assets/site-nav.js');
 assert.match(nav,/link\('GAMES'/);
 assert.match(nav,/MY WATCHLIST/);
});
test('hero is a sourced, Creative-Commons-licensed photograph of NBA LeBron chalk toss',()=>{
 const css=read('assets/v19-concept3.css'),html=read('index.html');
 assert.match(css,/LeBron_James%27_pregame_ritual.jpg/);
 assert.match(html,/Photo by Keith Allison/);
 assert.match(html,/creativecommons.org\/licenses\/by-sa\/2.0/);
 assert.doesNotMatch(html,/v19-hero-athlete/);
 assert.ok(html.includes('class="v19-hero-art"'));
 for(const file of ['index.html','challenge/daily.html'])assert.match(read(file),/>Following<\/button>/);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// Home on a day with no locked slate and an unreachable scoreboard: the hero rail must
// show the latest verified lock and published finals, or an explicit unavailable state — never "Loading…".
async function loadHome({withLedger=true,withGames=true}={}){
 const ledger=JSON.parse(read('data/audit-ledger.json')),entry=ledger.entries.filter(e=>e.lock_path).at(-1);
 const els=new Map(),get=id=>{if(!els.has(id))els.set(id,{innerHTML:'',textContent:'',href:''});return els.get(id)};
 const sources={'./data/five-model-report.json':{common_evaluation:{games:3643}}};
 if(withLedger){sources['./data/audit-ledger.json']=ledger;sources['./'+entry.lock_path]=null;}
 if(withGames)sources['./data/games.json']=JSON.parse(read('data/games.json'));
 const fetch=async url=>({ok:Object.hasOwn(sources,url)||url==='./'+entry?.lock_path&&withLedger,status:200,
  json:async()=>url==='./'+entry.lock_path?JSON.parse(read(entry.lock_path)):sources[url],
  text:async()=>url==='./'+entry.lock_path?read(entry.lock_path):JSON.stringify(sources[url])});
 const scores={melbourneDate:()=>'20261101',usDate:()=>'20261031',fetchDate:async()=>{throw Error('offline')},fetchMelbourneDate:async()=>{throw Error('offline')}};
 const window={NbaScores:scores};
 vm.runInNewContext(read('assets/home.js'),{window,document:{getElementById:get,addEventListener(){}},fetch,Date,Intl,Promise,console,
  crypto:crypto.webcrypto,TextEncoder,setInterval:()=>0,encodeURIComponent},{filename:'home.js'});
 await wait(400);
 return get;
}
test('no locked slate today and offline scoreboard: rail shows latest verified lock and published finals',async()=>{
 const get=await loadHome();
 const featured=get('featured-game').innerHTML;
 assert.doesNotMatch(featured,/Loading/);
 assert.match(featured,/c3-feature-match/,'latest locked matchup is shown');
 assert.match(get('feature-detail').textContent+get('feature-detail').innerHTML,/Latest locked slate 2026-10-31/i);
 assert.doesNotMatch(get('feature-tip').textContent,/Loading/);
 assert.match(get('home-projections').textContent,/^\d/,'KPI uses the latest verified lock, not an em dash');
 const results=get('c3-latest-results').innerHTML;
 assert.doesNotMatch(results,/Loading/);
 assert.equal((results.match(/c3-result-row/g)||[]).length,3);
});
test('nothing verified to show: explicit unavailable states, no endless loading text',async()=>{
 const get=await loadHome({withLedger:false,withGames:false});
 assert.doesNotMatch(get('featured-game').innerHTML,/Loading/);
 assert.match(get('featured-game').innerHTML,/No verified locked game forecast/);
 assert.doesNotMatch(get('c3-latest-results').innerHTML,/Loading/);
 assert.match(get('c3-latest-results').innerHTML,/No verified recent NBA finals/);
});

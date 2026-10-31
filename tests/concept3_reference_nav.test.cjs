'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const LABELS=['HOME','PREDICT','DAILY','PLAYERS','TEAMS','STATS','AUDIT','MODELS'];
function buildNav(pathname,hash=''){
 const nav={innerHTML:'',querySelectorAll:()=>[],contains:()=>false,addEventListener(){}};
 const doc={readyState:'complete',currentScript:null,addEventListener(){},
  querySelector:s=>s.includes('nav[aria-label')?nav:s.includes('.brand')?{href:'https://x.test/nba-twin-lab/'}:null};
 const location={pathname,hash,href:'https://x.test'+pathname};
 vm.runInNewContext(read('assets/site-nav.js'),{document:doc,location,window:{addEventListener(){}},URL,console},{filename:'site-nav.js'});
 return nav.innerHTML;
}
const links=html=>[...html.matchAll(/<a class="nav-main-link( active)?" href="([^"]*)"( aria-current="page")?>([^<]+)<\/a>/g)]
 .map(m=>({label:m[4],active:!!m[1],current:!!m[3],href:m[2]}));
test('header follows the approved Concept 3 order with a MORE menu',()=>{
 const html=buildNav('/nba-twin-lab/');
 assert.deepEqual(links(html).map(l=>l.label),LABELS);
 assert.match(html,/<summary[^>]*>MORE/);
 for(const needle of ['#live-games','watchlist/','team/','twins/'])assert.ok(html.includes(needle),'MORE keeps '+needle);
 assert.ok(links(html).find(l=>l.label==='DAILY').href.endsWith('challenge/daily.html'));
 assert.ok(links(html).find(l=>l.label==='AUDIT').href.endsWith('audit/'));
});
test('exactly one destination is active per page',()=>{
 const cases={'/nba-twin-lab/':'HOME','/nba-twin-lab/predict/':'PREDICT','/nba-twin-lab/challenge/daily.html':'DAILY',
  '/nba-twin-lab/player-stats/':'PLAYERS','/nba-twin-lab/league/':'TEAMS','/nba-twin-lab/audit/':'AUDIT','/nba-twin-lab/challenge/':'MODELS'};
 for(const [p,label] of Object.entries(cases)){
  const active=links(buildNav(p)).filter(l=>l.active||l.current);
  assert.deepEqual(active.map(l=>l.label),[label],p);
  assert.ok(active[0].active&&active[0].current,p+' needs class and aria-current together');
 }
 assert.deepEqual(links(buildNav('/nba-twin-lab/','#live-player-stats')).filter(l=>l.active).map(l=>l.label),['STATS']);
});
test('home leads with the hero; the Command Centre follows and is not dropped',()=>{
 const html=read('index.html'),css=read('assets/v19-concept3.css');
 assert.ok(html.indexOf('class="hero-grid"')<html.indexOf('id="live-games"'));
 assert.doesNotMatch(css,/#live-games\{[^}]*order:-1/,'live desk must not be visually lifted above the hero');
 assert.ok(html.includes('GAMES <em>COMMAND CENTRE.</em>'));
 for(const id of ['live-game-list','live-player-stats','home-machine-scorecard'])assert.ok(html.includes('id="'+id+'"'),id);
 const staticNav=html.match(/<nav aria-label="Main navigation">([\s\S]*?)<\/nav>/)[1];
 assert.deepEqual([...staticNav.matchAll(/>([^<]+)<\/a>/g)].map(m=>m[1].toUpperCase()),LABELS,'no-JS fallback matches');
});
test('featured matchup stacks its children instead of inheriting the 3-column legacy grid',()=>{
 assert.match(read('assets/concept3-fidelity.css'),/#featured-game\.sports-feature__match\{display:block!important/);
});
function activeMobile(pathname){
 const made=[];
 const el=()=>({attrs:{},children:[],setAttribute(k,v){this.attrs[k]=v},append(...c){this.children.push(...c)},prepend(){},set innerHTML(v){this.html=v},get innerHTML(){return this.html}});
 const document={body:Object.assign(el(),{}),currentScript:null,querySelector:()=>null,createElement:()=>{const e=el();made.push(e);return e}};
 vm.runInNewContext(read('assets/site-shell.js'),{document,location:{pathname,href:'https://x.test'+pathname},URL,console},{filename:'site-shell.js'});
 return made.filter(e=>e.attrs['aria-current']==='page').map(e=>e.attrs['aria-label']);
}
test('mobile bottom bar marks exactly one destination, and Daily is Predictions rather than Model Lab',()=>{
 assert.deepEqual(activeMobile('/nba-twin-lab/challenge/daily.html'),['Predictions']);
 assert.deepEqual(activeMobile('/nba-twin-lab/challenge/'),['Model Lab']);
 assert.deepEqual(activeMobile('/nba-twin-lab/audit/'),['Model Lab']);
 assert.deepEqual(activeMobile('/nba-twin-lab/predict/'),['Predictions']);
});

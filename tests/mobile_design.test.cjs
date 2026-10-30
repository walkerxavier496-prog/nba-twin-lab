'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const file=p=>fs.readFileSync(path.join(root,p),'utf8');

test('responsive shell loads on all primary website routes and scripts parse',()=>{
 for(const p of ['index.html','predict/index.html','challenge/index.html','challenge/daily.html','audit/index.html',
                   'models/index.html','twins/index.html','team-intelligence/index.html','player-stats/index.html']){
  const text=file(p);
  assert.match(text,/assets\/site-shell\.css/,p+' missing shared phone styles');
  assert.match(text,/assets\/site-shell\.js/,p+' missing mobile navigation');
  assert.match(text,/name="viewport"/,p+' missing viewport');
 }
 for(const p of ['assets/site-shell.js','assets/home.js','challenge/daily.js','challenge/app.js']){
  assert.doesNotThrow(()=>new vm.Script(file(p),{filename:p}),p+' fails parse');
 }
 assert.match(file('assets/site-shell.css'),/safe-area-inset-bottom/);
 assert.match(file('assets/site-shell.css'),/focus-visible/);
});

function renderNavigation(pathname){
 const children=[];
 const document={
  body:{append:item=>children.push(item),prepend:()=>{}},
  currentScript:{src:'https://example.com/nba-twin-lab/assets/site-shell.js'},
  createElement:tag=>({
   tagName:tag,attributes:{},children:[],setAttribute(k,v){this.attributes[k]=v;},
   append(item){this.children.push(item);},className:'',innerHTML:'',href:''
  }),
  querySelector:q=>q==='main'?{id:'main'}:null
 };
 const location={href:'https://example.com'+pathname,pathname};
 vm.runInNewContext(file('assets/site-shell.js'),{document,location,URL},{filename:'assets/site-shell.js'});
 const nav=children.find(item=>item.className==='site-bottom-nav');
 assert.ok(nav,'mobile nav not created');
 return nav;
}
test('mobile bottom navigation has 5 valid links and the correct active route',()=>{
 const scenarios=[
  ['/nba-twin-lab/','Home'],
  ['/nba-twin-lab/predict/','Games'],
  ['/nba-twin-lab/challenge/daily.html','Daily'],
  ['/nba-twin-lab/challenge/','Models'],
  ['/nba-twin-lab/audit/','Audit']
 ];
 for(const [route,active]of scenarios){
  const nav=renderNavigation(route);
  assert.equal(nav.children.length,5);
  assert.equal(nav.attributes['aria-label'],'Mobile navigation');
  const selected=nav.children.filter(a=>a.attributes['aria-current']==='page');
  assert.deepEqual(selected.map(a=>a.attributes['aria-label']),[active],route);
  assert.ok(nav.children.every(a=>a.href.startsWith('https://example.com/nba-twin-lab/')));
 }
});

test('mobile daily forecast has real, wired search/sort and accessible responsive cards',()=>{
 const html=file('challenge/daily.html'),js=file('challenge/daily.js');
 for(const id of ['stat-games','stat-models','stat-players','stat-review','disagreements','match-search',
                  'player-search','player-team','player-sort','player-cards','review-cards']){
  assert.ok(html.includes('id="'+id+'"'),id+' is missing');
 }
 assert.match(js,/matchupFilter/);
 assert.match(js,/match-search/);
 assert.match(js,/player-search/);
 assert.match(js,/player-sort/);
 assert.match(js,/model-card__bar/);
 assert.match(js,/aria-pressed/);
 assert.match(html,/max-width:620px/);
 assert.match(file('assets/site-shell.css'),/safe-area-inset-bottom/);
});

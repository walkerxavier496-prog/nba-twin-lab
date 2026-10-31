'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
function boot(){
 const data={},stored={getItem:k=>data[k]||null,setItem:(k,v)=>data[k]=v,removeItem:k=>delete data[k]};
 const events={};const doc={readyState:'loading',addEventListener:(k,fn)=>events[k]=fn,querySelectorAll:()=>[],getElementById:()=>null,dispatchEvent:()=>{}};
 const window={TwinTeamPrefs:{canonical:x=>x==='GSW'?'GS':x,names:{LAL:'Los Angeles Lakers',GS:'Golden State Warriors'}}};
 class CustomEvent{constructor(type,opts){this.type=type;this.detail=opts.detail}}
 vm.runInNewContext(read('assets/watchlist.js'),{window,document:doc,localStorage:stored,CustomEvent});
 return {watch:window.TwinWatchlist,data};
}
test('favourite NBA teams and player IDs persist locally without duplicates',()=>{
 const {watch,data}=boot();
 assert.deepEqual(watch.state().teams,[]);
 assert.equal(watch.toggleTeam('LAL'),true);
 assert.equal(watch.toggleTeam('LAL'),false);
 assert.equal(watch.toggleTeam('GSW'),true);
 assert.equal(watch.toggleTeam('FAKE'),false);
 assert.equal(watch.togglePlayer({id:'2544',name:'LeBron James',team:'LAL'}),true);
 assert.equal(watch.togglePlayer({id:'2544',name:'LeBron James',team:'LAL'}),false);
 assert.equal(watch.togglePlayer({id:'not-an-id',name:'Made Up',team:'LAL'}),false);
 assert.equal(watch.state().players.length,0);
 assert.deepEqual(watch.state().teams,['GS']);
 assert.ok(data['nba-twin-lab:watchlist:v1']);
});
test('player follow buttons appear only for verified numeric identifiers',()=>{
 const app=read('assets/live-desk.js'),game=read('assets/game-page.js'),league=read('league/standings.js');
 assert.match(app,/data-watch-player/);assert.match(game,/data-watch-player/);assert.match(league,/data-watch-team/);
 assert.match(app,/\^\\d\+\$/);
 assert.match(game,/\^\\d\+\$/);
 const page=read('watchlist/index.html');
 for(const id of ['watched-teams','watched-players','watchlist-status'])assert.match(page,new RegExp('id="'+id+'"'));
 assert.match(page,/aren't synced to an account/);
});
test('watchlist is a browser-only preference and does not claim background push support',()=>{
 const src=read('assets/watchlist.js');
 assert.match(src,/localStorage/);
 assert.doesNotMatch(src,/serviceWorker|PushManager|navigator\.serviceWorker/);
 for(const path of ['index.html','challenge/daily.html','game/index.html','league/index.html'])
  assert.match(read(path),/assets\/watchlist\.js/);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const games=JSON.parse(read('data/games.json')),snap=JSON.parse(read('data/v7-current.json'));
const nbas={HOU:'Houston Rockets',PHI:'Philadelphia 76ers',BOS:'Boston Celtics',MIN:'Minnesota Timberwolves'};
const prefs={names:nbas,canonical:x=>({GSW:'GS',WAS:'WSH',NYK:'NY'}[x]||x),accent:{HOU:'#e44a60'},get:()=>''};
const dataFetch=async url=>{
 const table={
 '../data/games.json':games,'../data/v7-current.json':snap,
 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/3202/overview':{
  athlete:{displayName:'Kevin Durant'},
  statistics:{names:['gamesPlayed','avgPoints','avgRebounds','avgAssists'],values:[3,25.5,6.1,5.1]}
 }};
 return {ok:Object.hasOwn(table,url),json:async()=>table[url]};
};
const elements=()=>{const map=new Map(),get=id=>{
 if(!map.has(id))map.set(id,{id,style:{setProperty(){}},innerHTML:'',textContent:'',href:'',hidden:false,
  addEventListener(){},classList:{toggle(){}}});return map.get(id)};
 return {map,get};
};
test('NBA team-centre routes, rich watchlist and stat pages have working data dependencies',()=>{
 const w=read('watchlist/index.html'),team=read('team/index.html'),player=read('player/index.html');
 for(const id of ['watched-teams','watched-players','watchlist-overview','watchlist-spotlight'])
  assert.ok(w.includes('id="'+id+'"'),id);
 for(const id of ['team-identity','team-hero-metrics','team-stats-grid','team-four-factors','team-roster-grid',
  'team-fixtures','team-player-profile'])assert.ok(team.includes('id="'+id+'"'),id);
 for(const id of ['player-name','player-portrait','player-real-stats','player-research','player-team-link'])
  assert.ok(player.includes('id="'+id+'"'),id);
 assert.match(read('league/standings.js'),/href="\.\.\/team\/\?team=/);
 assert.match(read('assets/home.js'),/\.\/team\/\?team=/);
 assert.match(read('assets/game-page.js'),/\.\.\/player\/\?id=/);
 assert.match(read('assets/live-desk.js'),/player\/\?id=/);
 assert.match(read('assets/site-nav.js'),/Manage followed NBA teams and players/);
 assert.match(read('assets/site-nav.js'),/href\('watchlist\/'\)/);
});
test('Watchlist displays real KD ESPN ID=3202 portrait and deep-links matched NBA ID=201142',async()=>{
 const {get}=elements(),events={};
 const doc={readyState:'loading',getElementById:get,addEventListener:(key,fn)=>events[key]=fn};
 const win={NbaMedia:{image:abbr=>'<i>'+abbr+'</i>',headshot:id=>'nba-'+id+'.png'},
  TwinWatchlist:{state:()=>({teams:['HOU'],players:[{id:'3202',name:'Kevin Durant',team:'HOU'}]}),sync(){}},
  TwinTeamPrefs:prefs};
 const ctx={window:win,document:doc,fetch:dataFetch,Date,Intl,URLSearchParams};
 vm.runInNewContext(read('watchlist/app.js'),ctx,{filename:'watchlist/app.js'});
 events.DOMContentLoaded();
 await new Promise(done=>setImmediate(done));
 const t=get('watched-teams').innerHTML,p=get('watched-players').innerHTML;
 assert.match(t,/team\/\?team=HOU/);
 assert.match(t,/Houston Rockets/);
 assert.match(t,/SEASON RECORD/);
 assert.match(p,/players\/full\/3202\.png/);
 assert.match(p,/team\/\?team=HOU&amp;player=201142|team\/\?team=HOU&player=201142/);
 assert.match(p,/Kevin Durant/);
 assert.ok(get('watchlist-overview').innerHTML.includes('TEAMS FOLLOWED'));
});
test('Team Centre renders Houston final-game record, actual schedule, current stats and real NBA player images',async()=>{
 const {get}=elements(),events={};
 const document={readyState:'loading',getElementById:get,
  querySelectorAll:()=>[],addEventListener:(key,fn)=>events[key]=fn};
 const win={TwinTeamPrefs:prefs,TwinWatchlist:{hasTeam:()=>true,sync:()=>{}},
  NbaMedia:{image:abbr=>'<i>'+abbr+'</i>',headshot:id=>'nba-'+id+'.png'}};
 const loc={search:'?team=HOU'};
 vm.runInNewContext(read('team/app.js'),{window:win,document,location:loc,URLSearchParams,Date,Intl,fetch:dataFetch},
   {filename:'team/app.js'});
 events.DOMContentLoaded();
 await new Promise(done=>setImmediate(done));
 assert.match(get('team-identity').innerHTML,/Houston Rockets/);
 assert.match(get('team-hero-metrics').innerHTML,/RECORD/);
 assert.match(get('team-stats-grid').innerHTML,/RECENT FORM/);
 assert.match(get('team-four-factors').innerHTML,/OFFENSIVE RATING/);
 assert.match(get('team-roster-grid').innerHTML,/Kevin Durant/);
 assert.match(get('team-roster-grid').innerHTML,/nba-201142\.png/);
 assert.match(get('team-fixtures').innerHTML,/game\/\?id=/);
 assert.match(get('team-data-status').textContent,/snapshot|Source/i);
});
test('Player Centre uses ESPN actual season values, never silently substitutes Twin Lab estimated statistics',async()=>{
 const {get}=elements();
 const win={TwinTeamPrefs:prefs};
 vm.runInNewContext(read('player/app.js'),{
  window:win,document:{getElementById:get},location:{search:'?id=3202&team=HOU&name=Kevin%20Durant'},
  URLSearchParams,fetch:dataFetch,Date,Intl
 },{filename:'player/app.js'});
 await new Promise(done=>setImmediate(done));
 assert.equal(get('player-name').textContent,'Kevin Durant');
 assert.match(get('player-portrait').innerHTML,/full\/3202\.png/);
 assert.match(get('player-real-stats').innerHTML,/25\.5/);
 assert.match(get('player-research').innerHTML,/PREGAME|PTS \(IF PLAYING\)/);
 assert.match(get('player-team-link').href,/team\/\?team=HOU/);
});
test('Authentic LeBron chalk image is correctly licensed and pretip locks untouched',()=>{
 const home=read('index.html'),css=read('assets/v19-concept3.css');
 assert.match(css,/LeBron_James%27_pregame_ritual.jpg/);
 assert.match(home,/Keith Allison/);
 assert.match(home,/creativecommons.org\/licenses\/by-sa\/2.0\//);
 const original=JSON.parse(read('practice/2026-10-31-melbourne/forecast.lock.json'));
 assert.equal(original.scope.games,10);
 assert.equal(original.forecasts[0].primary_forecast.winner,'CHA');
});

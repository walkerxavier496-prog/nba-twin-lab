'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('all 30 logo URLs are verified from source game metadata and render gracefully',()=>{
 const win={};vm.runInNewContext(read('assets/team-media.js'),{window:win,URL,encodeURIComponent});
 const media=win.NbaMedia;
 assert.equal(media.teamCount,30);
 const gameData=JSON.parse(read('data/games.json'));
 const logos=new Map();
 for(const game of gameData.games)for(const team of [game.home,game.away])if(team?.abbr&&team?.logo)logos.set(team.abbr,team.logo);
 assert.equal(logos.size,30);
 for(const [abbr,url]of logos){
  assert.equal(media.logo(abbr),url,abbr+' no longer sourced from game feed');
  const html=media.image(abbr,{size:'large',label:abbr});
  assert.ok(html.includes('src="'+url+'"'),abbr+' must show verified real logo');
  assert.ok(html.includes('team-logo__fallback'),abbr+' must retain text fallback');
  assert.match(html,/loading="lazy"/);
 }
 assert.equal(media.logo('GSW'),logos.get('GS'));
 assert.equal(media.logo('WAS'),logos.get('WSH'));
 assert.equal(media.logo('NYK'),logos.get('NY'));
 const missing=media.image('ZZZ');
 assert.ok(missing.includes('team-logo__fallback'));
 assert.ok(!missing.includes('src='));
});
test('player images use NBA player IDs with accessible fallback and explicit provenance',()=>{
 const win={};vm.runInNewContext(read('assets/team-media.js'),{window:win,encodeURIComponent});
 assert.equal(win.NbaMedia.headshot('1641706'),'https://cdn.nba.com/headshots/nba/latest/260x190/1641706.png');
 assert.equal(win.NbaMedia.headshot('not an id'),null);
 const html=win.NbaMedia.playerImage({name:'Brandon Miller',player_id:'1641706'});
 assert.match(html,/alt="Portrait of Brandon Miller"/);
 assert.match(html,/player-photo__fallback/);
 const daily=read('challenge/daily.js');
 assert.match(daily,/media\?\.playerImage/);
 assert.match(daily,/media\?\.image/);
 assert.match(read('challenge/daily.html'),/NBA\.com CDN/);
});
test('real basketball action images include required Creative Commons credits and no live-photo claims',()=>{
 const home=read('index.html'),daily=read('challenge/daily.html');
 assert.match(home,/Lakers_NBA_Cup_court_2024\.jpg/);
 assert.match(home,/Troutfarm27/);
 assert.match(home,/LeBron_James%2C_25_November_2023_01\.jpg/);
 assert.match(home,/Erik Drost/);
 assert.match(home,/creativecommons\.org\/licenses\/by\/2\.0/);
 assert.match(daily,/Curry_and_James%2C_Team_USA%2C_Olympic_Games_2024\.jpg/);
 assert.match(daily,/Clément Bardot/);
 assert.match(daily,/creativecommons\.org\/licenses\/by-sa\/4\.0/);
 assert.match(home,/Photo is illustrative, not from today's games/);
 assert.doesNotMatch(home,/2026 live game photo/i);
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const B=require('../scripts/season_backtest.cjs');
const T=(id,abbr)=>({id:String(id),name:abbr,abbr});
const game=(id,hs,as)=>({id:String(id),date:'2026-10-10T00:00:00Z',home:T(1,'ATL'),away:T(2,'BOS'),status:'final',homeScore:hs,awayScore:as});
test('preseason has a small bounded Elo effect',()=>{
 const offsets=B.preseasonOffsets([game(1,120,100),game(2,105,99)]);
 assert.ok(offsets.get('1')>0&&offsets.get('1')<10);
 assert.ok(offsets.get('2')<0&&offsets.get('2')>-10);
 const fresh={teams:new Map([['1',{elo:1500,games:0}]])};
 const experienced={teams:new Map([['1',{elo:1500,games:20}]])};
 B.applyPreseason(fresh,offsets);
 B.applyPreseason(experienced,offsets);
 assert.ok(fresh.teams.get('1').elo-1500>experienced.teams.get('1').elo-1500);
});
test('projected standings accumulate only pregame probabilities',()=>{
 const rows=[{home:T(1,'ATL'),away:T(2,'BOS'),homeWin:0.7,homeActual:0,homePick:1},
 {home:T(1,'ATL'),away:T(2,'BOS'),homeWin:0.6,homeActual:1,homePick:1}];
 const all=B.standing(rows,'all'),atl=all.find(t=>t.abbr==='ATL');
 assert.equal(atl.games,2);
 assert.equal(atl.actualWins,1);
 assert.equal(atl.expectedWins,1.3);
 assert.equal(atl.pickedWins,2);
 assert.equal(B.standing(rows,1).find(t=>t.abbr==='ATL').expectedWins,0.7);
});

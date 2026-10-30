const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../predict/engine.js');
const A={id:'1',name:'Alpha',abbr:'ALP',logo:''},B={id:'2',name:'Beta',abbr:'BET',logo:''};
const iso=(y,m,d)=>new Date(Date.UTC(y,m-1,d,23)).toISOString();
const game=(id,date,hs,as,season=2026,status='final')=>({id:String(id),date,season,home:A,away:B,homeScore:hs,awayScore:as,status});
test('normalises verified ESPN games and rejects malformed/postseason events',()=>{
 const payload={events:[{id:'123',date:iso(2026,10,25),season:{year:2027,type:2},
  competitions:[{competitors:[{homeAway:'home',team:A,score:'108'},{homeAway:'away',team:B,score:'100'}]}],
  status:{type:{name:'STATUS_FINAL',completed:true}}},{id:'124',date:iso(2026,10,26),season:{year:2027,type:3},
  competitions:[{competitors:[{homeAway:'home',team:A,score:'90'},{homeAway:'away',team:B,score:'91'}]}],
  status:{type:{completed:true}}}]};
 const out=E.normalise(payload);assert.equal(out.length,1);
 assert.equal(out[0].season,2027);assert.equal(out[0].homeScore,108);
 assert.throws(()=>E.normalise({}),/missing events/);
});
test('deduplicates scoreboard updates and preserves final results',()=>{
 const g=game(1,iso(2026,10,22),102,100,2027);
 const scheduled={...g,status:'scheduled',homeScore:null,awayScore:null};
 const out=E.merge([g],[scheduled]);assert.equal(out.length,1);assert.equal(out[0].status,'final');
});
test('forecast never trains on a future game',()=>{
 const a=game(1,iso(2026,10,25),120,100,2027);
 const before=E.ratings([a],iso(2026,10,24));
 assert.equal(before.finals,0);
 const after=E.ratings([a],iso(2026,10,26));
 assert.equal(after.finals,1);assert.ok(after.teams.get('1').elo>1500);
});
test('prior season strength regresses between seasons and win probabilities sum to one',()=>{
 const historical=[];
 for(let i=0;i<150;i++){
   const date=new Date(Date.UTC(2025,9,21+i));historical.push(game(i,date.toISOString(),i%4?120:100,100,2026));
 }
 const current=game('new',iso(2026,10,24),110,108,2027);
 const state=E.ratings([...historical,current],iso(2026,10,25));
 const p=E.forecast(game('future',iso(2026,10,28),null,null,2027,'scheduled'),state);
 assert.ok(p.homeWin>.5);assert.ok(p.homeWin<1);
 assert.ok(Math.abs(p.homeWin+p.awayWin-1)<1e-9);
 assert.ok(Number.isFinite(p.homeScore)&&Number.isFinite(p.awayScore));
 assert.equal(state.season,2027);assert.equal(state.teams.get('1').games,1);
});
test('back-to-back rest adjustment is not applied to teams with unknown last game',()=>{
 const state=E.ratings([],iso(2026,10,26));
 const p=E.forecast(game('x',iso(2026,10,26),null,null,2027,'scheduled'),state);
 assert.equal(p.homeRest,null);assert.equal(p.awayRest,null);
 assert.equal(p.eloEdge,65);
});
test('walk-forward accuracy uses only earlier completed games',()=>{
 const games=[];
 for(let i=0;i<130;i++){
   const d=new Date(Date.UTC(2025,9,21+i));
   games.push(game('prior'+i,d.toISOString(),115,105,2026));
 }
 for(let i=0;i<5;i++){
   const d=new Date(Date.UTC(2026,9,21+i));
   games.push(game('new'+i,d.toISOString(),112,106,2027));
 }
 const score=E.evaluate(games,2027);
 assert.equal(score.count,5);
 assert.ok(score.accuracy>=0&&score.accuracy<=1);
 assert.ok(score.brier>=0&&score.brier<=1);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const PE=require('../predict/player-engine.js');
const near=(a,b,t=1e-6,m='')=>assert.ok(Math.abs(a-b)<=t,`${m} ${a} != ${b}`);
const sum=(a,f)=>a.reduce((s,x)=>s+f(x),0);

// Deterministic synthetic league: two teams, ten-man rotations.
let seed=7;const rnd=()=>{seed=(seed*1664525+1013904223)%4294967296;return seed/4294967296;};
const MINS=[34,32,30,28,26,22,20,18,16,14];
function row(id,tm,min,{fgaPerMin=0.45,usage=1}={}){
 const fga=min*fgaPerMin*usage,tpa=fga*0.35,fta=min*0.1*usage;
 return {id,tm,st:min>=26?1:0,min,pts:fga*0.46*2.1+fta*0.78,fga,fgm:fga*0.46,tpa,tpm:tpa*0.36,fta,ftm:fta*0.78,
  reb:min*0.18,oreb:min*0.04,dreb:min*0.14,ast:min*0.11,tov:min*0.06,stl:min*0.03,blk:min*0.02,pf:min*0.09,pm:0};
}
// teamPrefix 'A'|'B'; `absent` = ids inactive (not in the box); `boost` = {id:{min,usage}}
function makeGame(n,{absent=[],boost={}}={}){
 const players=[];
 for(const [tm,pre] of [['H','A'],['A','B']]){
  const active=MINS.map((m,i)=>({id:pre+i,m})).filter(x=>!absent.includes(x.id));
  const lost=sum(MINS.map((m,i)=>({id:pre+i,m})).filter(x=>absent.includes(x.id)),x=>x.m);
  const total=sum(active,x=>x.m);
  for(const x of active){
   const b=boost[x.id]||{};
   const min=b.min!==undefined?b.min:x.m*(240/total);
   players.push(row(x.id,tm,min,{usage:b.usage||1}));
  }
  void lost;
 }
 return {id:'g'+n,date:`2024-11-${String(1+n%28).padStart(2,'0')}T00:00Z`,season:2025,home:{id:'TA',abbr:'AAA'},away:{id:'TB',abbr:'BBB'},hs:100,as:98,players};
}
function trained({withEvidence=false,games=60}={}){
 seed=7;const st=PE.createState();
 for(let n=0;n<games;n++){
  // when A1 (the 32-min star) is out, A4 plays much more and shoots more — only if withEvidence
  const out=withEvidence&&n%4===0;
  PE.observeGame(st,makeGame(n,out?{absent:['A1'],boost:{A4:{min:38,usage:1.5}}}:{}));
 }
 return st;
}
const input=(avail={})=>({home:{id:'TA',availability:avail},away:{id:'TB',availability:{}}});

test('240 regulation minutes per team and OUT players receive zero minutes',()=>{
 const st=trained(),f=PE.forecastGame(st,input({A0:'out'}));
 for(const side of ['home','away']){
  const rows=f.players.filter(r=>r.side===side);
  near(sum(rows,r=>r.expected_min),240,1e-6,side+' minutes');
 }
 assert.ok(!f.players.some(r=>r.side==='home'&&r.id==='A0'),'OUT player has no projection row');
 assert.deepEqual(f.out.home,['A0']);
});

test('removing a 30-minute starter redistributes his minutes to the available players',()=>{
 const st=trained(),healthy=PE.forecastGame(st,input()),short=PE.forecastGame(st,input({A2:'out'}));
 const m=f=>new Map(f.players.filter(r=>r.side==='home').map(r=>[r.id,r.expected_min]));
 const h=m(healthy),s=m(short);
 assert.ok(h.get('A2')>29,'A2 is a ~30 minute player');
 let gained=0;for(const [id,min] of s){assert.ok(min>=h.get(id)-1e-9,id+' should not lose minutes');gained+=min-h.get(id);}
 near(gained,h.get('A2'),1e-6,'redistributed minutes equal the minutes removed');
 assert.ok(s.get('A3')>h.get('A3'),'next-up players gain minutes');
});

test('field-goal attempts and plays reconcile with team possessions and are never duplicated',()=>{
 const st=trained();
 const plays=f=>sum(f.players.filter(r=>r.side==='home'),r=>r.fga+0.44*r.fta+r.tov);
 const neutral={neutral:true};
 const healthy=PE.forecastGame(st,input(),neutral),short=PE.forecastGame(st,input({A1:'out',A2:'out'}),neutral);
 near(plays(healthy),plays(short),1e-9,'team plays are conserved when starters are missing');
 const pace=PE.teamPace(st,'TA')+PE.teamPace(st,'TB')-st.league.poss/st.league.teamGames;
 near(plays(healthy),PE.clamp(pace,80,120)*PE.teamPlaysPerPossession(st,'TA'),1e-9,'plays equal the possession-based budget');
 // with real opponent adjustments the budget still holds to a tiny tolerance
 near(plays(PE.forecastGame(st,input({A1:'out',A2:'out'}))),plays(PE.forecastGame(st,input())),0.05,'adjusted');
 const fga=f=>new Map(f.players.filter(r=>r.side==='home').map(r=>[r.id,r.fga]));
 const h=fga(healthy),s=fga(short);
 assert.ok([...s].every(([id,v])=>v>=h.get(id)-1e-9),'every remaining player takes at least his normal volume');
 assert.ok(sum([...s],x=>x[1])>sum([...h].filter(([id])=>!['A1','A2'].includes(id)),x=>x[1]),'freed shots land on the available players, not nowhere');
});

test('a replacement receives extra attempts when historical evidence supports it',()=>{
 const st=trained({withEvidence:true}),generic=trained({withEvidence:true});
 generic.p.pairWeight=0;
 const withEv=PE.forecastGame(st,input({A1:'out'})),without=PE.forecastGame(generic,input({A1:'out'}));
 const get=(f,id)=>f.players.find(r=>r.side==='home'&&r.id===id);
 assert.ok(get(withEv,'A4').expected_min>get(without,'A4').expected_min+0.5,'evidence moves minutes to A4');
 assert.ok(get(withEv,'A4').fga>get(without,'A4').fga,'and shot attempts');
 assert.ok(get(withEv,'A4').evidence.length===1&&get(withEv,'A4').evidence[0].absent==='A1','evidence is recorded and attributed');
 assert.ok(get(withEv,'A4').evidence[0].games_without>=10);
 near(sum(withEv.players.filter(r=>r.side==='home'),r=>r.expected_min),240,1e-6);
});

test('two or more missing starters are handled and minutes still total 240',()=>{
 const st=trained(),f=PE.forecastGame(st,input({A0:'out',A1:'out',A2:'out'}));
 near(sum(f.players.filter(r=>r.side==='home'),r=>r.expected_min),240,1e-6);
 assert.ok(Math.max(...f.players.filter(r=>r.side==='home').map(r=>r.expected_min))<=38+1e-9,'cap respected');
});

test('questionable players become explicit participation scenarios',()=>{
 const st=trained(),f=PE.forecastGame(st,input({A0:'questionable',A1:'doubtful'}));
 assert.equal(f.scenarios.length,4*1,'two uncertain home players, none away => four scenarios');
 near(sum(f.scenarios,s=>s.probability),1,1e-9);
 const a0=f.players.find(r=>r.side==='home'&&r.id==='A0');
 near(a0.prob_plays,0.5,1e-9);
 const healthy=PE.forecastGame(st,input()).players.find(r=>r.side==='home'&&r.id==='A0');
 assert.ok(a0.expected_min<healthy.expected_min&&a0.expected_min>0,'expected minutes sit between out and healthy');
 assert.ok(f.uncertain.home.map(u=>u.id).join()==='A0,A1');
});

test('scores, margin and probability are internally consistent after calibration',()=>{
 const st=trained(),raw=PE.forecastGame(st,input({A3:'out'})),cal=PE.fitCalibration([]);
 const f=PE.applyCalibration(raw,cal,0);
 near(f.home_score+f.away_score,f.total,1e-9);near(f.home_score-f.away_score,f.margin,1e-9);
 assert.equal(f.home_win_probability>0.5,f.margin>0);
 near(f.home_win_probability,PE.normCdf(f.margin/f.sigma),1e-12);
 for(const side of ['home','away'])near(sum(f.players.filter(r=>r.side===side),r=>r.pts),side==='home'?f.home_score:f.away_score,1e-6,side+' player points reconcile with the team score');
 assert.ok(f.intervals_80.margin[0]<f.margin&&f.margin<f.intervals_80.margin[1]);
});

test('current rosters override franchise history: a traded player moves with his evidence immediately',()=>{
 const st=trained();
 const before=PE.candidates(st,'TA').map(p=>p.id);
 assert.ok(before.includes('A0'));
 // A0 appears for team B in a later verified game
 const g=makeGame(99);const x=g.players.find(r=>r.id==='A0');x.tm='A';g.players=g.players.filter(r=>!(r.tm==='H'&&r.id==='A0'));
 PE.observeGame(st,g);
 assert.ok(!PE.candidates(st,'TA').map(p=>p.id).includes('A0'),'no longer on the old franchise');
 assert.ok(PE.candidates(st,'TB').map(p=>p.id).includes('A0'),'now on the new team');
 const f=PE.forecastGame(st,{home:{id:'TA'},away:{id:'TB'}});
 assert.ok(f.players.some(r=>r.side==='away'&&r.id==='A0')&&!f.players.some(r=>r.side==='home'&&r.id==='A0'));
});

test('forecasting never mutates evidence and ignores games that were not observed (no leakage path)',()=>{
 const st=trained(),snap=JSON.stringify([...st.players.entries()].slice(0,5))+st.games;
 const a=PE.forecastGame(st,input({A2:'out'})),b=PE.forecastGame(st,input({A2:'out'}));
 assert.equal(JSON.stringify([...st.players.entries()].slice(0,5))+st.games,snap);
 assert.equal(a.raw_margin,b.raw_margin);
 const future=makeGame(500,{boost:{A0:{min:40,usage:3}}}); // a future result: unobserved => no effect
 void future;
 assert.equal(PE.forecastGame(st,input({A2:'out'})).raw_margin,a.raw_margin);
});

test('matchup spotlights are driven by measured opportunity change, not by star status',()=>{
 const st=trained({withEvidence:true}),adjusted=PE.forecastGame(st,input({A1:'out'}));
 const explained=PE.explainPlayers(st,input({A1:'out'}),adjusted);
 const picks=PE.spotlights(explained,st,2);
 assert.ok(picks.length>=1&&picks.length<=2);
 for(const p of picks){assert.ok(p.delta_fantasy_total>0.5);assert.ok(p.delta_minutes_from_availability>0||p.delta_pts_from_opponent>0);}
 assert.ok(!picks.some(p=>p.id==='A1'),'the OUT player cannot be a spotlight');
});

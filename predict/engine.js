/* NBA Twin Lab prediction engine v4.
   Transparent, deterministic Elo baseline. No odds, injury or betting inputs.
   Browser global: TwinPredict; Node: require('./engine.js').
*/
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.TwinPredict=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const BASE=1500,HOME=65,K=18;
const number=x=>x===null||x===undefined||x===''?null:Number(x);
const safe=x=>Number.isFinite(x)?x:null;
const dateMs=x=>new Date(x).getTime();
const days=(a,b)=>Math.floor((dateMs(a)-dateMs(b))/86400000);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const logistic=x=>1/(1+Math.pow(10,-x/400));
const key=x=>String(x??'').trim();
function normalise(payload){
  if(!payload||!Array.isArray(payload.events))throw Error('Invalid ESPN scoreboard: missing events');
  const out=[];
  for(const e of payload.events){
    const c=e.competitions?.[0],list=c?.competitors||[];
    const h=list.find(x=>x.homeAway==='home'),a=list.find(x=>x.homeAway==='away');
    if(!h||!a||!e.id||!e.date||!Number.isFinite(dateMs(e.date)))continue;
    const team=x=>({id:key(x.team?.id),name:key(x.team?.displayName||x.team?.name),abbr:key(x.team?.abbreviation),logo:key(x.team?.logo||'')});
    const home=team(h),away=team(a);
    if(!home.id||!away.id||home.id===away.id)continue;
    const type=e.status?.type||c?.status?.type||{};
    const final=type.completed===true||type.name==='STATUS_FINAL'||type.state==='post';
    const live=!final&&(type.state==='in'||String(type.name||'').startsWith('STATUS_IN'));
    const hs=number(h.score),as=number(a.score);
    if(final&&(!Number.isFinite(hs)||!Number.isFinite(as)))continue;
    const d=new Date(e.date);
    const inferred=d.getUTCMonth()>=6?d.getUTCFullYear()+1:d.getUTCFullYear();
    const season=Number(e.season?.year||payload.leagues?.[0]?.season?.year||inferred);
    const seasonType=Number(e.season?.type||payload.leagues?.[0]?.season?.type||2);
    if(seasonType!==2)continue;
    out.push({id:key(e.id),date:e.date,season,home,away,status:final?'final':live?'live':'scheduled',
      homeScore:safe(hs),awayScore:safe(as),source:'ESPN scoreboard'});
  }
  return out;
}
function merge(...lists){
  const m=new Map();
  for(const list of lists)for(const g of list||[]){
    if(!g?.id||!g?.date||!g.home?.id||!g.away?.id||!Number.isFinite(dateMs(g.date)))continue;
    const prev=m.get(String(g.id));
    if(!prev||g.status==='final'||(prev.status!=='final'&&g.status==='live'))m.set(String(g.id),g);
  }
  return [...m.values()].sort((a,b)=>dateMs(a.date)-dateMs(b.date)||a.id.localeCompare(b.id));
}
function blank(t){return {id:t.id,name:t.name||t.abbr,abbr:t.abbr||t.name,logo:t.logo||'',elo:BASE,
  games:0,wins:0,losses:0,points:0,allowed:0,lastDate:null,recent:[],prev:null};}
function ratings(games,asOf){
  const teams=new Map(),finals=merge(games).filter(g=>g.status==='final'&&dateMs(g.date)<dateMs(asOf));
  let season=null;const league=[];
  const get=t=>{if(!teams.has(t.id))teams.set(t.id,blank(t));const v=teams.get(t.id);
    v.name=t.name||v.name;v.abbr=t.abbr||v.abbr;v.logo=t.logo||v.logo;return v;};
  for(const g of finals){
    if(season!==g.season){
      if(season!==null)for(const t of teams.values()){
        t.prev={games:t.games,points:t.points,allowed:t.allowed,wins:t.wins,losses:t.losses};
        t.elo=BASE+(t.elo-BASE)*.68;t.games=0;t.wins=0;t.losses=0;
        t.points=0;t.allowed=0;t.recent=[];t.lastDate=null;
      }
      season=g.season;league.length=0;
    }
    const h=get(g.home),a=get(g.away);
    const diff=h.elo-a.elo+HOME;
    const p=logistic(diff);
    const win=g.homeScore>g.awayScore?1:g.homeScore<g.awayScore?0:.5;
    const margin=Math.abs(g.homeScore-g.awayScore);
    const mov=clamp(Math.log(margin+1)*2.2/(Math.abs(diff)/400+2.2),.7,2.3);
    const delta=K*mov*(win-p);
    h.elo+=delta;a.elo-=delta;
    for(const [t,pf,pa,w] of [[h,g.homeScore,g.awayScore,win],[a,g.awayScore,g.homeScore,1-win]]){
      t.games++;t.wins+=w;t.losses+=1-w;t.points+=pf;t.allowed+=pa;
      t.recent.push({win:w,margin:pf-pa,date:g.date,opponent:t===h?a.abbr:h.abbr});
      if(t.recent.length>10)t.recent.shift();t.lastDate=g.date;
    }
    league.push((g.homeScore+g.awayScore)/2);
  }
  return {teams,season,finals:finals.length,leagueMean:mean(league),allGames:finals};
}
function restDays(t,date){
  if(!t?.lastDate)return null;
  return Math.max(0,days(date,t.lastDate)-1);
}
function blended(t,kind,league){
  if(!t)return league;
  const prev=t.prev&&t.prev.games>=5?t.prev:null;
  const prior=prev?(prev[kind]/prev.games)*.7+league*.3:league;
  const n=t.games;
  return n?(t[kind]+12*prior)/(n+12):prior;
}
function forecast(game,state,profiles={}){
  const h=state.teams.get(game.home.id)||blank(game.home),a=state.teams.get(game.away.id)||blank(game.away);
  const hr=restDays(h,game.date),ar=restDays(a,game.date);
  const restEdge=(hr===0?-26:0)+(ar===0?26:0);
  // A small prior-year team-SRS anchor stabilises the early season.
  // Profiles MUST come from the season before the predicted game, never the same season.
  const ch=profiles[game.home.abbr]||profiles[game.home.id];
  const ca=profiles[game.away.abbr]||profiles[game.away.id];
  const validPrior=ch&&ca&&Number.isFinite(ch.srs)&&Number.isFinite(ca.srs);
  const priorEdge=validPrior?(ch.srs-ca.srs)*25+HOME+restEdge:null;
  const eloEdge=validPrior ? 0.8*(h.elo-a.elo+HOME+restEdge)+0.2*priorEdge : h.elo-a.elo+HOME+restEdge;
  const homeWin=clamp(logistic(eloEdge),.01,.99);
  const lg=state.leagueMean||113;
  const homeBase=(blended(h,'points',lg)+blended(a,'allowed',lg))/2;
  const awayBase=(blended(a,'points',lg)+blended(h,'allowed',lg))/2;
  const total=clamp(homeBase+awayBase,165,285);
  const margin=clamp(eloEdge/30,-23,23);
  const gamesCurrent=h.games+a.games;
  return {homeWin,awayWin:1-homeWin,homeRating:h.elo,awayRating:a.elo,eloEdge,
    margin,homeScore:(total+margin)/2,awayScore:(total-margin)/2,total,
    homeRest:hr,awayRest:ar,home:h,away:a,priorEdge,priorUsed:!!validPrior,
    confidence:state.finals<150?'Insufficient historical data':gamesCurrent<16?'Early-season baseline':'Model estimate',
    history:state.finals};
}
function evaluate(games,season,profiles={}){
  const finals=merge(games).filter(g=>g.status==='final'&&g.season===season);
  const picks=[];
  for(const g of finals){
    const s=ratings(games,g.date);
    if(s.finals<120)continue;
    const p=forecast(g,s,profiles),actual=g.homeScore>g.awayScore?1:0;
    if(g.homeScore===g.awayScore)continue;
    picks.push({id:g.id,date:g.date,p:p.homeWin,actual,
      correct:(p.homeWin>=.5)===(actual===1),brier:(p.homeWin-actual)**2,
      scoreError:(Math.abs(p.homeScore-g.homeScore)+Math.abs(p.awayScore-g.awayScore))/2});
  }
  return {count:picks.length,accuracy:picks.length?mean(picks.map(x=>x.correct?1:0)):null,
    brier:mean(picks.map(x=>x.brier)),scoreMAE:mean(picks.map(x=>x.scoreError)),picks};
}
function teamTable(state){
  return [...state.teams.values()].filter(t=>t.games>0).sort((a,b)=>b.elo-a.elo)
    .map((t,i)=>({...t,rank:i+1,ppg:t.points/t.games,oppg:t.allowed/t.games,
      form:t.recent.slice(-5).map(x=>x.win?'W':'L').join(' ')}));
}
function matchupHistory(games,game){
  const arr=merge(games).filter(g=>g.status==='final'&&dateMs(g.date)<dateMs(game.date)&&
    ((g.home.id===game.home.id&&g.away.id===game.away.id)||(g.home.id===game.away.id&&g.away.id===game.home.id)));
  return arr.slice(-5).reverse();
}
return {normalise,merge,ratings,forecast,evaluate,teamTable,matchupHistory,logistic,restDays};
});
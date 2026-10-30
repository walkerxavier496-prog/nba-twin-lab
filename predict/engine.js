/* NBA Twin Lab prediction engine v7.
   Transparent Elo/V5 baselines plus an independent rolling possession model.
   No odds or betting inputs. Player availability is used only when explicitly
   supplied as a timestamped or clearly labelled inferred pregame feature.
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
const quantile=(values,q)=>{
  if(!values.length)return null;
  const a=values.slice().sort((x,y)=>x-y),i=(a.length-1)*q,lo=Math.floor(i),hi=Math.ceil(i);
  return a[lo]+(a[hi]-a[lo])*(i-lo);
};
function seed32(value){
  let h=2166136261;
  for(const c of String(value)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}
  return h>>>0;
}
function seededRandom(seed){
  let a=typeof seed==='number'?seed>>>0:seed32(seed);
  return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296};
}
function gaussian(rng){
  const u=Math.max(rng(),1e-12),v=rng();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}
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
    if(final&&(!Number.isFinite(hs)||!Number.isFinite(as)||hs===as))continue;
    const d=new Date(e.date);
    const inferred=d.getUTCMonth()>=6?d.getUTCFullYear()+1:d.getUTCFullYear();
    const season=Number(e.season?.year||payload.leagues?.[0]?.season?.year||inferred);
    const seasonType=Number(e.season?.type||payload.leagues?.[0]?.season?.type||2);
    if(seasonType!==2)continue;
    if(e.id==='401809839')continue; // 2025 NBA Cup title game excluded from standings
    out.push({id:key(e.id),date:e.date,season,home,away,status:final?'final':live?'live':'scheduled',
      homeScore:safe(hs),awayScore:safe(as),source:'ESPN scoreboard'});
  }
  return out;
}
function merge(...lists){
  const m=new Map();
  for(const list of lists)for(const g of list||[]){
    if(!g?.id||!g?.date||!g.home?.id||!g.away?.id||!Number.isFinite(dateMs(g.date)))continue;
    if(![g.home.id,g.away.id].every(id=>Number.isInteger(Number(id))&&Number(id)>=1&&Number(id)<=30))continue; // exclude All-Star exhibitions
    if(g.id==='401809839')continue; // NBA Cup 2025 final does not count in regular season
    if(g.status==='final'&&(!Number.isFinite(g.homeScore)||!Number.isFinite(g.awayScore)||g.homeScore===g.awayScore))continue;
    const prev=m.get(String(g.id));
    if(!prev||g.status==='final'||(prev.status!=='final'&&g.status==='live'))m.set(String(g.id),g);
  }
  return [...m.values()].sort((a,b)=>dateMs(a.date)-dateMs(b.date)||a.id.localeCompare(b.id));
}
function blank(t){return {id:t.id,name:t.name||t.abbr,abbr:t.abbr||t.name,logo:t.logo||'',elo:BASE,
  games:0,wins:0,losses:0,points:0,allowed:0,lastDate:null,recent:[],prev:null};}
function ratings(games,asOf){
  const teams=new Map(),finals=merge(games).filter(g=>g.status==='final'&&dateMs(g.date)<dateMs(asOf));
  let season=null;const league=[];let priorLeagueMean=null;
  const get=t=>{if(!teams.has(t.id))teams.set(t.id,blank(t));const v=teams.get(t.id);
    v.name=t.name||v.name;v.abbr=t.abbr||v.abbr;v.logo=t.logo||v.logo;return v;};
  for(const g of finals){
    if(season!==g.season){
      if(season!==null){priorLeagueMean=mean(league);for(const t of teams.values()){
        t.prev={games:t.games,points:t.points,allowed:t.allowed,wins:t.wins,losses:t.losses};
        t.elo=BASE+(t.elo-BASE)*.68;t.games=0;t.wins=0;t.losses=0;
        t.points=0;t.allowed=0;t.recent=[];t.lastDate=null;
      }}
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
  // Pregame forecasts on opening night must regress last season's ratings,
  // even if no game in the new season has been completed yet.
  const at=new Date(asOf),target=at.getUTCFullYear()+(at.getUTCMonth()>=6?1:0);
  if(season!==null&&target>season){
    priorLeagueMean=mean(league)||priorLeagueMean;
    for(const t of teams.values()){
      t.prev={games:t.games,points:t.points,allowed:t.allowed,wins:t.wins,losses:t.losses};
      t.elo=BASE+(t.elo-BASE)*.68;t.games=0;t.wins=0;t.losses=0;
      t.points=0;t.allowed=0;t.recent=[];t.lastDate=null;
    }
    season=target;league.length=0;
  }
  return {teams,season,finals:finals.length,leagueMean:mean(league)||priorLeagueMean,allGames:finals};
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
  const beforeGame=p=>p&&Number.isFinite(p.srs)&&(p.season===undefined||Number(p.season)<Number(game.season));
  const validPrior=beforeGame(ch)&&beforeGame(ca);
  const priorEdge=validPrior?(ch.srs-ca.srs)*25+HOME+restEdge:null;
  // Previous-season context matters most in the first few games.
  // As actual current-season results accumulate, the prior fades smoothly.
  const priorWeight=validPrior ? 0.2*Math.exp(-(h.games+a.games)/16) : 0;
  const eloEdge=(1-priorWeight)*(h.elo-a.elo+HOME+restEdge)+priorWeight*(priorEdge??0);
  const homeWin=clamp(logistic(eloEdge),.01,.99);
  const lg=state.leagueMean||113;
  const homeBase=(blended(h,'points',lg)+blended(a,'allowed',lg))/2;
  const awayBase=(blended(a,'points',lg)+blended(h,'allowed',lg))/2;
  const total=clamp(homeBase+awayBase,165,285);
  const margin=clamp(eloEdge/30,-23,23);
  const gamesCurrent=h.games+a.games;
  return {homeWin,awayWin:1-homeWin,homeRating:h.elo,awayRating:a.elo,eloEdge,
    margin,homeScore:(total+margin)/2,awayScore:(total-margin)/2,total,
    homeRest:hr,awayRest:ar,home:h,away:a,priorEdge,priorUsed:!!validPrior,priorWeight,
    confidence:state.finals<150?'Insufficient historical data':gamesCurrent<16?'Early-season baseline':'Model estimate',
    history:state.finals};
}
function profileBeforeGame(profiles,team,season){
  const p=profiles?.[team.abbr]||profiles?.[team.id];
  return p&&(p.season===undefined||Number(p.season)<Number(season))?p:null;
}
function possessionProfile(team,prior,opponentPrior,targetScore,pace){
  const n=team?.games||0;
  const priorPace=safe(Number(prior?.pace))||100;
  const opponentPace=safe(Number(opponentPrior?.pace))||100;
  const gamePace=clamp((priorPace+opponentPace)/2,91,108);
  const currentPpp=n&&pace?clamp((team.points/n)/pace,.85,1.35):null;
  const priorPpp=Number.isFinite(Number(prior?.o_rtg))?Number(prior.o_rtg)/100:1.14;
  const defensePpp=Number.isFinite(Number(opponentPrior?.d_rtg))?Number(opponentPrior.d_rtg)/100:1.14;
  const historical=(priorPpp+defensePpp)/2;
  const scorePpp=Number.isFinite(targetScore)?targetScore/gamePace:historical;
  const targetPpp=clamp(.5*scorePpp+.32*historical+.18*(currentPpp??historical),.86,1.38);
  const turnover=clamp(((Number(prior?.tov_percent)||13)+(Number(opponentPrior?.opp_tov_percent)||13))/200,.075,.19);
  const threeRate=clamp(Number(prior?.x3p_ar)||.4,.22,.58);
  const freeThrowTrip=clamp((Number(prior?.f_tr)||.24)*.44,.055,.17);
  const orb=clamp(((Number(prior?.orb_percent)||25)+(100-(Number(opponentPrior?.drb_percent)||75)))/200,.14,.38);
  const rawEfg=clamp(((Number(prior?.e_fg_percent)||.545)+(Number(opponentPrior?.opp_e_fg_percent)||.545))/2,.46,.63);
  // Calibrate shot making to the forecast's expected points per possession while
  // retaining the team's validated turnover, shot mix, foul and rebounding style.
  let lo=.38,hi=.70;
  for(let i=0;i<24;i++){
    const efg=(lo+hi)/2;
    const threePct=clamp(.36+(efg-rawEfg)*.72,.27,.46);
    const twoPct=clamp((efg-1.5*threeRate*threePct)/(1-threeRate),.38,.72);
    const make=threeRate*threePct+(1-threeRate)*twoPct;
    const miss=(1-freeThrowTrip)*(1-make);
    const attemptPoints=freeThrowTrip*1.56+(1-freeThrowTrip)*(threeRate*threePct*3+(1-threeRate)*twoPct*2);
    const expected=(1-turnover)*attemptPoints/(1-miss*orb);
    if(expected<targetPpp)lo=efg;else hi=efg;
  }
  const efg=clamp((lo+hi)/2,.38,.70);
  const threePct=clamp(.36+(efg-rawEfg)*.72,.27,.46);
  const twoPct=clamp((efg-1.5*threeRate*threePct)/(1-threeRate),.38,.72);
  return {pace:gamePace,targetPpp,turnover,threeRate,freeThrowTrip,orb,threePct,twoPct,ftPct:.78,
    source:prior?'validated prior-season team profile':'league-average fallback'};
}
function rollingValues(snapshot,config={}){
  const window=['last5','last10','season'].includes(config.window)?config.window:'last10';
  const current=snapshot?.[window]||{},prior=snapshot?.prior||{};
  const n=Number(current.games)||0,priorGames=clamp(Number(config.priorGames)||12,0,40);
  const weight=n/(n+priorGames||1),keys=['ortg','drtg','adj_ortg','adj_drtg','pace','efg','opp_efg','three_rate','opp_three_rate','tov_rate','opp_tov_rate','orb_rate','drb_rate','ftr','opp_ftr','two_pct','three_pct','ft_pct'];
  const out={games:Number(snapshot?.games)||0,weight,window};
  for(const k of keys){
    const a=safe(Number(current[k])),b=safe(Number(prior[k]));
    out[k]=a!==null&&b!==null?weight*a+(1-weight)*b:a??b;
  }
  return out;
}
function calibratedEventProfile(values,targetPpp,pace){
  const turnover=clamp(Number(values.turnover)||.13,.07,.22);
  const threeRate=clamp(Number(values.threeRate)||.4,.20,.62);
  const freeThrowTrip=clamp((Number(values.ftr)||.25)*.44,.05,.18);
  const orb=clamp(Number(values.orb)||.25,.10,.42);
  const rawEfg=clamp(Number(values.efg)||.545,.44,.66);
  let lo=.36,hi=.72;
  for(let i=0;i<26;i++){
    const efg=(lo+hi)/2;
    const threePct=clamp((Number(values.threePct)||.36)+(efg-rawEfg)*.72,.24,.50);
    const twoPct=clamp((efg-1.5*threeRate*threePct)/(1-threeRate),.34,.76);
    const make=threeRate*threePct+(1-threeRate)*twoPct;
    const miss=(1-freeThrowTrip)*(1-make);
    const attempt=freeThrowTrip*2*(Number(values.ftPct)||.78)+(1-freeThrowTrip)*(threeRate*threePct*3+(1-threeRate)*twoPct*2);
    const expected=(1-turnover)*attempt/(1-miss*orb);
    if(expected<targetPpp)lo=efg;else hi=efg;
  }
  const efg=(lo+hi)/2,threePct=clamp((Number(values.threePct)||.36)+(efg-rawEfg)*.72,.24,.50);
  const twoPct=clamp((efg-1.5*threeRate*threePct)/(1-threeRate),.34,.76);
  return {pace,targetPpp:clamp(targetPpp,.84,1.42),turnover,threeRate,freeThrowTrip,orb,
    threePct,twoPct,ftPct:clamp(Number(values.ftPct)||.78,.62,.92),source:'pregame rolling team and matchup features'};
}
function independentExpectation(game,intelligence,config={}){
  if(!intelligence?.home||!intelligence?.away)throw Error('Independent model requires home and away pregame features');
  const h=rollingValues(intelligence.home,config),a=rollingValues(intelligence.away,config);
  const league=mean([Number(intelligence.home.league_ortg),Number(intelligence.away.league_ortg)].filter(Number.isFinite))||113;
  const pace=clamp(mean([h.pace,a.pace].filter(Number.isFinite))||99,88,110);
  const venue=Number(config.homeCourt??1.8),playerWeight=Number(config.playerWeight)||0;
  const restImpact=s=>s?.rest_days===0?-1.15:0;
  const player=s=>clamp(Number(s?.player_delta)||0,-8,8)*playerWeight;
  // No Elo or final-score target enters these efficiency estimates.
  const homeRtg=clamp(clamp(mean([h.adj_ortg??h.ortg,a.adj_drtg??a.drtg].filter(Number.isFinite))||league,90,135)+venue+restImpact(intelligence.home)+player(intelligence.home),88,140);
  const awayRtg=clamp(clamp(mean([a.adj_ortg??a.ortg,h.adj_drtg??h.drtg].filter(Number.isFinite))||league,90,135)-venue+restImpact(intelligence.away)+player(intelligence.away),88,140);
  const homeScore=homeRtg*pace/100,awayScore=awayRtg*pace/100,margin=homeScore-awayScore;
  const homeWin=clamp(1/(1+Math.exp(-margin/(Number(config.marginScale)||7.4))),.01,.99);
  const rates=(own,opp)=>({
    turnover:mean([own.tov_rate,opp.opp_tov_rate].filter(Number.isFinite))||.13,
    threeRate:mean([own.three_rate,opp.opp_three_rate].filter(Number.isFinite))||.4,
    ftr:mean([own.ftr,opp.opp_ftr].filter(Number.isFinite))||.25,
    orb:mean([own.orb_rate,Number.isFinite(opp.drb_rate)?1-opp.drb_rate:null].filter(Number.isFinite))||.25,
    efg:mean([own.efg,opp.opp_efg].filter(Number.isFinite))||.545,
    threePct:own.three_pct,ftPct:own.ft_pct});
  return {homeWin,awayWin:1-homeWin,homeScore,awayScore,margin,total:homeScore+awayScore,pace,
    homeRtg,awayRtg,home:rollingValues(intelligence.home,config),away:rollingValues(intelligence.away,config),
    homeRates:rates(h,a),awayRates:rates(a,h),config:{window:config.window||'last10',priorGames:Number(config.priorGames)||12,playerWeight}};
}
function independentMonteCarlo(game,intelligence,options={}){
  const expectation=independentExpectation(game,intelligence,options);
  const simulations=clamp(Math.round(Number(options.simulations)||10000),100,100000);
  const hp=calibratedEventProfile(expectation.homeRates,expectation.homeRtg/100,expectation.pace);
  const ap=calibratedEventProfile(expectation.awayRates,expectation.awayRtg/100,expectation.pace);
  const seed=options.seed??('v7|'+game.id+'|'+game.date+'|'+simulations);
  const random=seededRandom(seed),homeScores=new Array(simulations),awayScores=new Array(simulations),margins=new Array(simulations);
  let wins=0,homeTotal=0,awayTotal=0,possessionTotal=0,ot=0;
  for(let i=0;i<simulations;i++){
    const r=simulateOne(hp,ap,expectation.pace,random);
    wins+=r.homeScore>r.awayScore?1:0;homeTotal+=r.homeScore;awayTotal+=r.awayScore;
    possessionTotal+=r.possessions;ot+=r.overtime>0?1:0;
    homeScores[i]=r.homeScore;awayScores[i]=r.awayScore;margins[i]=r.homeScore-r.awayScore;
  }
  const homeWin=clamp(wins/simulations,.001,.999),homeScore=homeTotal/simulations,awayScore=awayTotal/simulations;
  return {simulations,seed,homeWin,awayWin:1-homeWin,homeScore,awayScore,total:homeScore+awayScore,
    margin:homeScore-awayScore,possessions:possessionTotal/simulations,overtimeRate:ot/simulations,
    homeRange:[quantile(homeScores,.1),quantile(homeScores,.9)],awayRange:[quantile(awayScores,.1),quantile(awayScores,.9)],
    marginRange:[quantile(margins,.1),quantile(margins,.9)],homeProfile:hp,awayProfile:ap,expectation};
}
function possession(profile,rng){
  if(rng()<profile.turnover)return 0;
  let points=0;
  for(let chance=0;chance<4;chance++){
    if(rng()<profile.freeThrowTrip){
      points+=(rng()<profile.ftPct?1:0)+(rng()<profile.ftPct?1:0);
      return points;
    }
    const three=rng()<profile.threeRate,hit=rng()<(three?profile.threePct:profile.twoPct);
    if(hit)return points+(three?3:2);
    if(rng()>=profile.orb)return points;
  }
  return points;
}
function simulateOne(home,away,pace,rng){
  const possessions=clamp(Math.round(pace+gaussian(rng)*4.5),82,121);
  let homeScore=0,awayScore=0;
  for(let i=0;i<possessions;i++){
    awayScore+=possession(away,rng);
    homeScore+=possession(home,rng);
  }
  let overtime=0;
  while(homeScore===awayScore&&overtime<6){
    overtime++;
    const extra=Math.max(4,Math.round(possessions*5/48));
    for(let i=0;i<extra;i++){
      awayScore+=possession(away,rng);
      homeScore+=possession(home,rng);
    }
  }
  if(homeScore===awayScore)(rng()<.5?()=>homeScore++:()=>awayScore++)();
  return {homeScore,awayScore,possessions,overtime};
}
function monteCarlo(game,state,profiles={},options={}){
  const baseline=forecast(game,state,profiles);
  const simulations=clamp(Math.round(Number(options.simulations)||10000),100,100000);
  const homePrior=profileBeforeGame(profiles,game.home,game.season);
  const awayPrior=profileBeforeGame(profiles,game.away,game.season);
  const priorPace=clamp(((Number(homePrior?.pace)||100)+(Number(awayPrior?.pace)||100))/2,91,108);
  const hp=possessionProfile(baseline.home,homePrior,awayPrior,baseline.homeScore,priorPace);
  const ap=possessionProfile(baseline.away,awayPrior,homePrior,baseline.awayScore,priorPace);
  const pace=(hp.pace+ap.pace)/2;
  const rng=seededRandom(options.seed??(game.id+'|'+game.date+'|'+simulations));
  let wins=0,homeTotal=0,awayTotal=0,possessionTotal=0,ot=0;
  const homeScores=new Array(simulations),awayScores=new Array(simulations),margins=new Array(simulations);
  for(let i=0;i<simulations;i++){
    const r=simulateOne(hp,ap,pace,rng);
    wins+=r.homeScore>r.awayScore?1:0;homeTotal+=r.homeScore;awayTotal+=r.awayScore;
    possessionTotal+=r.possessions;ot+=r.overtime>0?1:0;
    homeScores[i]=r.homeScore;awayScores[i]=r.awayScore;margins[i]=r.homeScore-r.awayScore;
  }
  const homeWin=clamp(wins/simulations,.001,.999),homeScore=homeTotal/simulations,awayScore=awayTotal/simulations;
  return {simulations,seed:options.seed??(game.id+'|'+game.date+'|'+simulations),homeWin,awayWin:1-homeWin,
    homeScore,awayScore,total:homeScore+awayScore,margin:homeScore-awayScore,
    possessions:possessionTotal/simulations,overtimeRate:ot/simulations,
    homeRange:[quantile(homeScores,.1),quantile(homeScores,.9)],awayRange:[quantile(awayScores,.1),quantile(awayScores,.9)],
    marginRange:[quantile(margins,.1),quantile(margins,.9)],homeProfile:hp,awayProfile:ap,baseline};
}
function calibration(picks,bins=10){
  const rows=[];
  for(let i=0;i<bins;i++){
    const low=i/bins,high=(i+1)/bins,inBin=picks.filter(x=>x.p>=low&&(i===bins-1?x.p<=high:x.p<high));
    if(!inBin.length)continue;
    rows.push({low,high,count:inBin.length,confidence:mean(inBin.map(x=>x.p)),actual:mean(inBin.map(x=>x.actual))});
  }
  return {bins:rows,ece:picks.length?rows.reduce((s,b)=>s+b.count/picks.length*Math.abs(b.confidence-b.actual),0):null};
}
function metrics(picks){
  const c=calibration(picks);
  return {count:picks.length,accuracy:picks.length?mean(picks.map(x=>x.correct?1:0)):null,
    brier:mean(picks.map(x=>x.brier)),
    logLoss:mean(picks.map(x=>{const p=clamp(x.p,1e-9,1-1e-9);return -(x.actual*Math.log(p)+(1-x.actual)*Math.log(1-p))})),
    scoreMAE:mean(picks.map(x=>x.scoreError)),ece:c.ece,calibration:c.bins};
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
  return {...metrics(picks),picks};
}
function evaluateComparison(games,season,profiles={},options={}){
  const finals=merge(games).filter(g=>g.status==='final'&&g.season===season);
  const elo=[],simulation=[];
  for(const g of finals){
    const state=ratings(games,g.date);
    if(state.finals<120||g.homeScore===g.awayScore)continue;
    const e=forecast(g,state,profiles),m=monteCarlo(g,state,profiles,{simulations:options.simulations||2000,seed:'backtest|'+g.id});
    const actual=g.homeScore>g.awayScore?1:0;
    for(const [arr,p,hs,as] of [[elo,e.homeWin,e.homeScore,e.awayScore],[simulation,m.homeWin,m.homeScore,m.awayScore]]){
      arr.push({id:g.id,date:g.date,p,actual,correct:(p>=.5)===(actual===1),brier:(p-actual)**2,
        scoreError:(Math.abs(hs-g.homeScore)+Math.abs(as-g.awayScore))/2});
    }
  }
  return {season,strictWalkForward:true,simulationsPerGame:options.simulations||2000,elo:{...metrics(elo),picks:elo},monteCarlo:{...metrics(simulation),picks:simulation}};
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
return {normalise,merge,ratings,forecast,monteCarlo,independentExpectation,independentMonteCarlo,
  evaluate,evaluateComparison,calibration,possessionProfile,rollingValues,teamTable,matchupHistory,
  logistic,restDays,seededRandom};
});

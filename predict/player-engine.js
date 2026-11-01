/* Player Engine V1 — one player-first game forecast.
 *
 * Players create team performance. Every team score, margin and probability is the sum of individual
 * player projections that share conserved team budgets:
 *   - 240 regulation player-minutes per team (water-filled with a per-player cap)
 *   - team "plays" (FGA + 0.44*FTA + TOV) tied to expected possessions: usage a missing teammate cannot
 *     use is redistributed to the players who are available, never duplicated
 *   - rebound, assist and turnover pools shared by both rosters
 * An OUT player has zero minutes and zero opportunity and every teammate is recomputed automatically.
 * Evidence from games the player's teammate missed ("with/without") is blended in, shrunk by sample size.
 * Nothing here reads a result that was not yet available at the forecast cutoff: the caller feeds games
 * to observeGame() only once they are available under the repository's result-availability rule.
 * Research engine: it does not replace production_elo_v7 and is never promoted automatically.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TwinPlayerEngine=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const VERSION='player-engine-v1';

// Structural parameters: tuned only on information preceding the evaluation window, then frozen.
const DEFAULTS={
 decay:0.94,        // per-appearance recency decay of player stat sums
 seasonCarry:0.6,   // share of last season's evidence kept across a season boundary
 kRate:300,         // pseudo-minutes pulling per-minute rates toward the league
 kShoot:100,        // pseudo-attempts pulling shooting percentages toward the league
 minDecay:0.86,     // recency of the minutes baseline (per appearance)
 minExponent:1.4,   // >1 concentrates freed minutes on high-minute players
 minCap:38,         // no player is projected above this in regulation
 usageExponent:1,   // 1 = proportional redistribution of plays a missing teammate cannot use
 usageTradeoff:0.12,// shooting-efficiency penalty per unit of extra usage
 defLambda:0.5,     // how much of an opponent's defensive profile is applied
 kDef:25,           // pseudo-games shrinking opponent profiles toward average
 teamDecay:0.96,    // per-team-game decay of team/defence evidence
 rosterWindow:25,   // a player stays a candidate this many team games after last playing
 pairKappa:6,       // pseudo-games shrinking with/without-teammate evidence
 pairWeight:0.5,    // weight of with/without MINUTES evidence relative to the generic redistribution
 pairUsageWeight:0.5,// exponent applied to the with/without USAGE ratio (0 = ignore usage evidence)
 keyMinutes:16,     // teammates at or above this baseline count as "key" absences
 astPool:0.5,       // weight of the team-FGM assist pool versus the players' own assist rates
 baseW:[0.6,0.25,0.15], // blend of fast/medium/slow minutes baselines
 apprPower:1,       // exponent on P(plays | dressed) when forming expected minutes
 normalize:1,       // 1 = scale expected minutes to the 240-minute budget, 0 = leave as projected
 shareBeta:[0.075,0.069,0.043,0.0315,0.0148], // fitted: minutes gained per lost minute, by baseline-minutes bucket (<8,8-16,16-24,24-32,32+)
 coreN:8,           // the top-N rotation players keep their projected minutes; fringe players absorb normalisation
 fringeCap:24,      // a fringe player is never inflated above this
 shareScale:1,      // fraction of fresh-absence minutes that is redistributed
 freshWindow:3,     // a recent regular who played within this many observed team games and is now OUT is a fresh absence
 returnGap:3,       // a player who missed at least this many observed team games and is back takes minutes back
 kRes:8,            // pseudo-games shrinking each team's residual prior toward zero
 resCarry:0.5       // share of a team's residual prior kept across a season boundary
};

// Neutral starting point for league-wide totals (replaced as evidence accumulates).
const LEAGUE_INIT={min:2400,fga:912,tpa:360,tpm:130,fgm:420,fta:240,ftm:187,reb:432,oreb:108,dreb:324,ast:288,tov:144,stl:72,blk:48,pf:216};
const SUMS=['min','fga','tpa','tpm','fgm','fta','ftm','reb','oreb','dreb','ast','tov','stl','blk','pf'];
const TEAM_SUMS=['w','poss','plays','dF2a','dF2m','dF3a','dF3m','dFta','dTov','dFga','dOrb','dOppMiss','dPoss'];
const STATUS_PLAY_PROBABILITY={out:0,doubtful:0.1,questionable:0.5,probable:0.85,available:1,unknown:1};

function createState(params={}){
 return {version:VERSION,p:{...DEFAULTS,...params},players:new Map(),teams:new Map(),rosters:new Map(),pairs:new Map(),
  league:{...LEAGUE_INIT,poss:100*40,teamGames:80},games:0,season:null,pending:new Map(),teamRes:new Map(),dev:{m:0,t:0,n:0}};
}
const emptyPlayer=(id,team)=>({id,team,apps:0,lastGC:-1,...Object.fromEntries(SUMS.map(k=>[k,0])),
 mpg:null,mpg10:null,mpg20:null,pts5:null,pts10:null,pts20:null,start:0.5,lastDate:null,appr:1});
function teamRec(state,id){
 let t=state.teams.get(id);
 if(!t){t={id,gc:0,lastDate:null,...Object.fromEntries(TEAM_SUMS.map(k=>[k,0]))};state.teams.set(id,t);}
 return t;
}
function rosterSet(state,teamId){let s=state.rosters.get(teamId);if(!s){s=new Set();state.rosters.set(teamId,s);}return s;}
const decaySums=(o,keys,f)=>{for(const k of keys)o[k]*=f;};
const ewma=(old,x,d)=>old===null?x:d*old+(1-d)*x;

// ---- evidence ingestion ----------------------------------------------------------------------------
// `game` is a compact box-score record (scripts/player_box_corpus.cjs). Returns false when the box score
// is unusable (it is then ignored rather than guessed).
function observeGame(state,game){
 const p=state.p,side={H:[],A:[]};
 for(const row of game.players)side[row.tm].push(row);
 const tot={};
 for(const k of ['H','A']){
  const t={min:0,fga:0,fgm:0,tpa:0,tpm:0,fta:0,ftm:0,tov:0,oreb:0};
  for(const r of side[k])if(r.min>0)for(const key of Object.keys(t))t[key]+=r[key]||0;
  t.poss=t.fga+0.44*t.fta-t.oreb+t.tov;t.plays=t.fga+0.44*t.fta+t.tov;t.f2a=t.fga-t.tpa;t.f2m=t.fgm-t.tpm;tot[k]=t;
 }
 if(!(tot.H.min>0&&tot.A.min>0&&tot.H.poss>40&&tot.A.poss>40))return false;
 if(state.season!==game.season){
  if(state.season!==null){
   for(const pl of state.players.values())decaySums(pl,SUMS,p.seasonCarry);
   for(const t of state.teams.values())decaySums(t,TEAM_SUMS,p.seasonCarry);
   for(const pr of state.pairs.values())for(const k of ['nW','mW','uW','nO','mO','uO'])pr[k]*=p.seasonCarry;
   for(const r of state.teamRes.values()){r.ms*=p.resCarry;r.mw*=p.resCarry;r.ts*=p.resCarry;r.tw*=p.resCarry;}
  }
  state.season=game.season;
 }
 state.games++;
 const L=state.league,ids={H:String(game.home.id),A:String(game.away.id)};
 for(const k of ['H','A']){
  const mine=tot[k],opp=tot[k==='H'?'A':'H'],team=teamRec(state,ids[k]),norm=240/Math.max(mine.min,200);
  // with/without evidence is recorded against the roster as it stood BEFORE this game
  recordPairs(state,ids[k],side[k],mine);
  decaySums(team,TEAM_SUMS,p.teamDecay);team.gc++;team.lastDate=game.date;team.w+=1;
  const poss=0.5*(mine.poss+opp.poss)*norm;team.poss+=poss;team.plays+=mine.plays*norm;
  team.dF2a+=opp.f2a;team.dF2m+=opp.f2m;team.dF3a+=opp.tpa;team.dF3m+=opp.tpm;team.dFta+=opp.fta;team.dTov+=opp.tov;
  team.dFga+=opp.fga;team.dOrb+=opp.oreb;team.dOppMiss+=(opp.fga-opp.fgm);team.dPoss+=opp.poss;
  L.poss+=poss;L.teamGames+=1;
  for(const r of side[k]){
   if(!(r.min>0))continue;
   let pl=state.players.get(r.id);
   if(!pl){pl=emptyPlayer(r.id,ids[k]);state.players.set(r.id,pl);}
   if(pl.team!==ids[k]){rosterSet(state,pl.team).delete(r.id);pl.team=ids[k];}
   rosterSet(state,ids[k]).add(r.id);
   decaySums(pl,SUMS,p.decay);
   for(const key of SUMS)if(finite(r[key])){pl[key]+=r[key];L[key]+=r[key];}
   pl.apps++;pl.lastGC=team.gc;pl.lastDate=game.date;
   pl.mpg=ewma(pl.mpg,r.min,p.minDecay);pl.mpg10=ewma(pl.mpg10,r.min,0.9);pl.mpg20=ewma(pl.mpg20,r.min,0.95);
   pl.pts5=ewma(pl.pts5,r.pts||0,0.8);pl.pts10=ewma(pl.pts10,r.pts||0,0.9);pl.pts20=ewma(pl.pts20,r.pts||0,0.95);
   pl.start=0.8*pl.start+0.2*(r.st?1:0);pl.appr=0.92*pl.appr+0.08;
  }
  // dressed but did not play (coach's decision): lowers the probability that he plays when dressed
  for(const r of side[k])if(!(r.min>0)){const pl=state.players.get(r.id);if(pl&&pl.team===ids[k])pl.appr=0.92*pl.appr;}
 }
 learnResidual(state,game);
 return true;
}

// Team-residual prior: how far each team's results have drifted from what the player engine predicted
// for it at the time (using only that earlier prediction and the later-available result).
function recordPrediction(state,gameId,pred){state.pending.set(String(gameId),{raw_margin:pred.raw_margin,raw_total:pred.raw_total});}
function resRec(state,id){let r=state.teamRes.get(id);if(!r){r={ms:0,mw:0,ts:0,tw:0};state.teamRes.set(id,r);}return r;}
function learnResidual(state,game){
 const pred=state.pending.get(String(game.id));if(!pred||!finite(game.hs)||!finite(game.as))return;
 state.pending.delete(String(game.id));
 const dm=(game.hs-game.as)-pred.raw_margin,dt=(game.hs+game.as)-pred.raw_total,d=state.dev,p=state.p;
 d.n++;const a=Math.max(1/d.n,0.002);d.m+=a*(dm-d.m);d.t+=a*(dt-d.t);
 const h=resRec(state,String(game.home.id)),w=resRec(state,String(game.away.id));
 for(const r of [h,w]){r.ms*=p.teamDecay;r.mw*=p.teamDecay;r.ts*=p.teamDecay;r.tw*=p.teamDecay;}
 h.ms+=dm-d.m;h.mw+=1;w.ms-=dm-d.m;w.mw+=1;       // margin residual from each team's own perspective
 h.ts+=dt-d.t;h.tw+=1;w.ts+=dt-d.t;w.tw+=1;
}
function residualOf(state,id){const r=state.teamRes.get(String(id));return r?{margin:r.ms/(r.mw+state.p.kRes),total:r.ts/(r.tw+state.p.kRes),games:r.mw}:{margin:0,total:0,games:0};}

// Evidence: how each player's minutes/usage differ when a KEY teammate is absent (inactive) vs present.
function recordPairs(state,teamId,rows,mine){
 const p=state.p,t=teamRec(state,teamId),dressed=new Set(rows.map(r=>r.id));
 const planTotal=Math.max(mine.plays,1);
 const key=state.players;
 const cands=candidates(state,teamId,[]);
 const keyIds=cands.filter(pl=>baselineMinutes(pl)>=p.keyMinutes).map(pl=>pl.id);
 for(const j of rows){
  if(!(j.min>=8))continue;
  const share=((j.fga||0)+0.44*(j.fta||0)+(j.tov||0))/planTotal;
  for(const i of keyIds){
   if(i===j.id)continue;
   const absent=!dressed.has(i),played=rows.some(r=>r.id===i&&r.min>0);
   if(!absent&&!played)continue; // dressed but did not play: neither sample
   const k=i+'|'+j.id;let pr=state.pairs.get(k);
   if(!pr){pr={nW:0,mW:0,uW:0,nO:0,mO:0,uO:0};state.pairs.set(k,pr);}
   if(absent){pr.nO++;pr.mO+=j.min;pr.uO+=share;}else{pr.nW++;pr.mW+=j.min;pr.uW+=share;}
  }
 }
}

// ---- profiles --------------------------------------------------------------------------------------
function leagueRates(L){
 const m=Math.max(L.min,1),f2=Math.max(L.fga-L.tpa,1),miss=Math.max(L.fga-L.fgm,1);
 return {fga:L.fga/m,tpa:L.tpa/m,fta:L.fta/m,reb:L.reb/m,oreb:L.oreb/m,dreb:L.dreb/m,ast:L.ast/m,tov:L.tov/m,stl:L.stl/m,blk:L.blk/m,pf:L.pf/m,
  p2:(L.fgm-L.tpm)/f2,p3:L.tpm/Math.max(L.tpa,1),ft:L.ftm/Math.max(L.fta,1),orbPerMiss:L.oreb/miss,drbPerMiss:L.dreb/miss,astPerFgm:L.ast/Math.max(L.fgm,1),
  ftaPerFga:L.fta/Math.max(L.fga,1),tovPerPoss:L.tov/Math.max(L.poss*1,1)};
}
function profile(state,pl){
 const p=state.p,lr=leagueRates(state.league),m=pl.min,k=p.kRate;
 const rate=key=>(pl[key]+k*lr[key])/(m+k),f2a=pl.fga-pl.tpa,f2m=pl.fgm-pl.tpm;
 return {rates:{fga:rate('fga'),tpa:rate('tpa'),fta:rate('fta'),reb:rate('reb'),oreb:rate('oreb'),dreb:rate('dreb'),ast:rate('ast'),
   tov:rate('tov'),stl:rate('stl'),blk:rate('blk'),pf:rate('pf')},
  p2:(f2m+p.kShoot*lr.p2)/(f2a+p.kShoot),p3:(pl.tpm+p.kShoot*1.2*lr.p3)/(pl.tpa+p.kShoot*1.2),ft:(pl.ftm+p.kShoot*0.6*lr.ft)/(pl.fta+p.kShoot*0.6)};
}
const playsPerMinute=r=>r.fga+0.44*r.fta+r.tov;
const NEUTRAL_DEFENCE={f2:1,f3:1,fta:1,tov:1,oreb:1,games:0};
function defenceFactors(state,teamId){
 const p=state.p,t=state.teams.get(teamId),lr=leagueRates(state.league);
 if(!t||t.w<1)return NEUTRAL_DEFENCE;
 const shrink=(obs,league)=>(obs*t.w+league*p.kDef)/(t.w+p.kDef);
 const f2=t.dF2a>0?shrink(t.dF2m/t.dF2a,lr.p2)/lr.p2:1,f3=t.dF3a>0?shrink(t.dF3m/t.dF3a,lr.p3)/lr.p3:1;
 const fta=t.dFga>0?shrink(t.dFta/t.dFga,lr.ftaPerFga)/lr.ftaPerFga:1;
 const tov=t.dPoss>0?shrink(t.dTov/t.dPoss,lr.tovPerPoss)/lr.tovPerPoss:1;
 const orb=t.dOppMiss>0?shrink(t.dOrb/t.dOppMiss,lr.orbPerMiss)/lr.orbPerMiss:1;
 return {f2,f3,fta,tov,oreb:orb,games:t.w};
}
function teamPace(state,teamId){
 const t=state.teams.get(teamId),lp=state.league.poss/Math.max(state.league.teamGames,1);
 return !t||t.w<1?lp:(t.poss+state.p.kDef*lp)/(t.w+state.p.kDef);
}
function teamPlaysPerPossession(state,teamId){
 const L=state.league,lg=(L.fga+0.44*L.fta+L.tov)/Math.max(L.poss*1,1),t=state.teams.get(teamId);
 return !t||t.poss<1?lg:(t.plays+state.p.kDef*lg*(t.poss/Math.max(t.w,1)))/(t.poss+state.p.kDef*(t.poss/Math.max(t.w,1)));
}
function baselineMinutes(pl,w=DEFAULTS.baseW){
 return pl.mpg===null?0:clamp(w[0]*pl.mpg+w[1]*(pl.mpg10??pl.mpg)+w[2]*(pl.mpg20??pl.mpg),0,42);
}
function candidates(state,teamId,extraIds){
 const t=teamRec(state,teamId),extra=new Set(extraIds||[]),out=[];
 for(const id of new Set([...rosterSet(state,teamId),...extra])){
  const pl=state.players.get(id);if(!pl)continue;
  const onTeam=pl.team===teamId||extra.has(id);
  if(!onTeam)continue;
  if(!extra.has(id)&&t.gc-pl.lastGC>state.p.rosterWindow)continue;
  out.push(pl);
 }
 return out;
}

// ---- opportunity allocation ------------------------------------------------------------------------
// Water-fill `total` minutes in proportion to weight with a per-player cap; the result always sums to `total`
// when there are enough players, and a zero-weight (OUT) player always receives zero.
function allocateMinutes(weights,cap,total=240){
 const alloc=weights.map(()=>0);
 let free=weights.map((w,i)=>w>0?i:-1).filter(i=>i>=0),remaining=total;
 for(let guard=0;guard<30&&free.length&&remaining>1e-9;guard++){
  const sum=free.reduce((s,i)=>s+weights[i],0),over=free.filter(i=>weights[i]*remaining/sum>cap-alloc[i]+1e-9);
  if(!over.length){for(const i of free)alloc[i]+=remaining*weights[i]/sum;remaining=0;break;}
  for(const i of over){remaining-=cap-alloc[i];alloc[i]=cap;}
  free=free.filter(i=>!over.includes(i));
 }
 return alloc;
}
// Scale a roster to exactly `total` minutes: core players keep their projections, capped fringe players absorb
// the difference, and any remainder goes back to the core within the cap.
function normalizeMinutes(weights,p,total=240){
 const order=weights.map((w,i)=>[w,i]).sort((a,b)=>b[0]-a[0]).map(x=>x[1]);
 const core=order.slice(0,p.coreN),fringe=order.slice(p.coreN),out=weights.map(()=>0);
 const coreMin=core.map(i=>Math.min(weights[i],p.minCap)),S=coreMin.reduce((a,b)=>a+b,0);
 if(S>=total){core.forEach((i,k)=>{out[i]=coreMin[k]*total/S;});return out;}
 let rem=total-S;
 const fr=allocateMinutes(fringe.map(i=>weights[i]),p.fringeCap,rem);
 fringe.forEach((i,k)=>{out[i]=fr[k];});
 const used=fr.reduce((a,b)=>a+b,0),left=rem-used;
 if(left>1e-9){const c=allocateMinutes(coreMin,p.minCap,S+left);core.forEach((i,k)=>{out[i]=c[k];});}
 else core.forEach((i,k)=>{out[i]=coreMin[k];});
 return out;
}
function pairEvidence(state,absentIds,j,base){
 const p=state.p,out=[];let confidence=0,dMin=0,usageMult=1;
 for(const i of absentIds){
  const pr=state.pairs.get(i+'|'+j.id);
  if(!pr||pr.nO<1||pr.nW<3)continue;
  const s=pr.nO/(pr.nO+p.pairKappa),dm=s*(pr.mO/pr.nO-pr.mW/pr.nW);
  const du=pr.uW>0?s*((pr.uO/pr.nO)/(pr.uW/pr.nW)-1):0;
  out.push({absent:i,games_without:Math.round(pr.nO),games_with:Math.round(pr.nW),minutes_with:pr.mW/pr.nW,minutes_without:pr.mO/pr.nO,minutes_change:dm,usage_ratio_change:du});
  dMin+=dm;usageMult+=du;confidence=Math.max(confidence,s);
 }
 return {items:out,dMin,usageMult:clamp(usageMult,0.6,1.8),confidence};
}

// One team given its available players and the game context. Does not touch rebounds' opponent pools.
const bucketOf=m=>m<8?0:m<16?1:m<24?2:m<32?3:4;
// Fresh absences free up minutes that the available players absorb according to learned role weights;
// returning players take minutes back. Healthy rosters keep their own baselines (no spurious reshuffling).
function projectTeam(state,teamId,available,absentKeyIds,ctx){
 const p=state.p;
 const rows=available.map(pl=>({pl,id:pl.id,prof:profile(state,pl),base:baselineMinutes(pl,p.baseW),appr:Math.pow(clamp(pl.appr,0.05,1),p.apprPower)})).filter(r=>r.base>0);
 const lost=ctx.freshAbsent.reduce((s,id)=>{const pl=state.players.get(id);return s+(pl?baselineMinutes(pl)*clamp(pl.appr,0.05,1):0);},0);
 const returning=new Set(ctx.returning||[]);
 const back=rows.filter(r=>returning.has(r.id)).reduce((s,r)=>s+r.base*r.appr,0);
 const net=p.shareScale*(lost-back);ctx.netLost=net;
 rows.forEach(r=>{
  const delta=returning.has(r.id)?0:(p.shareBeta[bucketOf(r.base)]||0)*net;
  r.genericCond=clamp(r.base+delta,0,p.minCap);r.netLost=net;
  r.ev=absentKeyIds.length&&p.pairWeight>0?pairEvidence(state,absentKeyIds,r.pl,r.base):{items:[],dMin:0,usageMult:1,confidence:0};
  const target=clamp(r.base+r.ev.dMin,0,p.minCap),omega=p.pairWeight*r.ev.confidence;
  r.condMin=(1-omega)*r.genericCond+omega*target;
  r.mixMin=r.condMin*r.appr;
 });
 const mins=p.normalize?normalizeMinutes(rows.map(r=>r.mixMin),p):rows.map(r=>Math.min(r.mixMin,p.minCap));
 rows.forEach((r,i)=>{r.min=mins[i];r.genericMin=r.genericCond*r.appr;});
 for(const r of rows){
  r.rawPlays=r.min*playsPerMinute(r.prof.rates);
  r.w=Math.pow(Math.max(r.rawPlays,1e-9),p.usageExponent)*Math.pow(r.ev.usageMult,p.pairUsageWeight*r.ev.confidence);
 }
 const sumW=rows.reduce((s,r)=>s+r.w,0)||1;
 let fga=0,fgm=0,fta=0,ftm=0,tov=0;
 for(const r of rows){
  r.plays=ctx.plays*r.w/sumW;r.scale=r.rawPlays>0?r.plays/r.rawPlays:1;
  const rt=r.prof.rates,eff=clamp(1-p.usageTradeoff*(r.scale-1),0.8,1.15),def=ctx.oppDefence;
  const a2=1+p.defLambda*(def.f2-1),a3=1+p.defLambda*(def.f3-1);
  r.fga=r.scale*r.min*rt.fga;r.tpa=Math.min(r.fga,r.scale*r.min*rt.tpa);r.f2a=r.fga-r.tpa;
  r.fta=r.scale*r.min*rt.fta*(1+p.defLambda*(def.fta-1));r.tov=r.scale*r.min*rt.tov*(1+p.defLambda*(def.tov-1));
  r.f2m=r.f2a*clamp(r.prof.p2*eff*a2,0.2,0.75);r.tpm=r.tpa*clamp(r.prof.p3*eff*a3,0.1,0.6);r.ftm=r.fta*clamp(r.prof.ft,0.3,0.97);
  r.fgm=r.f2m+r.tpm;r.pts=2*r.f2m+3*r.tpm+r.ftm;
  fga+=r.fga;fgm+=r.fgm;fta+=r.fta;ftm+=r.ftm;tov+=r.tov;
 }
 return {rows,fga,fgm,fta,ftm,tov,misses:fga-fgm,lr:leagueRates(state.league)};
}

// Rebounds/assists/steals/blocks drawn from pools that depend on BOTH rosters' shooting.
function finishTeam(state,mine,theirs,myDef,oppDef){
 const p=state.p,lr=mine.lr;
 const orbPool=mine.misses*lr.orbPerMiss*(1+p.defLambda*(oppDef.oreb-1));
 const drbPool=theirs.misses*lr.drbPerMiss;
 const sh=key=>mine.rows.reduce((s,r)=>s+r.min*r.prof.rates[key],0)||1;
 const oS=sh('oreb'),dS=sh('dreb'),aS=sh('ast');
 const astPool=p.astPool*mine.fgm*lr.astPerFgm+(1-p.astPool)*aS;
 for(const r of mine.rows){
  const rt=r.prof.rates;
  r.oreb=orbPool*r.min*rt.oreb/oS;r.dreb=drbPool*r.min*rt.dreb/dS;r.reb=r.oreb+r.dreb;
  r.ast=astPool*r.min*rt.ast/aS;r.stl=r.min*rt.stl*(1+p.defLambda*(oppDef.tov-1));r.blk=r.min*rt.blk;
 }
}

const fantasy=r=>r.pts+r.tpm+2*r.fgm-r.fga+r.ftm-r.fta+r.reb+2*r.ast+4*r.stl+4*r.blk-2*r.tov;

// One concrete availability scenario for both teams.
function runScenario(state,input,sideAvail,opts){
 const out={};
 const ctxFor=(me,opp,oppDef)=>{
  const pace=teamPace(state,input[me].id)+teamPace(state,input[opp].id)-state.league.poss/Math.max(state.league.teamGames,1);
  return {plays:clamp(pace,80,120)*teamPlaysPerPossession(state,input[me].id),oppDefence:oppDef,freshAbsent:sideAvail[me].freshAbsent,returning:sideAvail[me].returning};
 };
 const defH=opts.neutral?NEUTRAL_DEFENCE:defenceFactors(state,input.home.id),defA=opts.neutral?NEUTRAL_DEFENCE:defenceFactors(state,input.away.id);
 const home=projectTeam(state,input.home.id,sideAvail.home.available,sideAvail.home.absentKey,ctxFor('home','away',defA));
 const away=projectTeam(state,input.away.id,sideAvail.away.available,sideAvail.away.absentKey,ctxFor('away','home',defH));
 finishTeam(state,home,away,defH,defA);finishTeam(state,away,home,defA,defH);
 for(const team of [home,away]){team.points=team.rows.reduce((s,r)=>s+r.pts,0);for(const r of team.rows)r.fantasy=fantasy(r);}
 const pace=ctxFor('home','away',defA).plays/Math.max(teamPlaysPerPossession(state,input.home.id),1e-9);
 return {home,away,raw_margin:home.points-away.points,raw_total:home.points+away.points,possessions:pace};
}

// Split each side's roster into available / uncertain / out from the supplied availability map.
function resolveAvailability(state,teamInput,maxScenarioPlayers=3){
 const cands=candidates(state,teamInput.id,teamInput.extra||[]),status=teamInput.availability||{};
 const base=pl=>baselineMinutes(pl);
 const classify=pl=>{const s=String(status[pl.id]||'unknown').toLowerCase();return STATUS_PLAY_PROBABILITY[s]===undefined?{s:'unknown',q:1}:{s,q:STATUS_PLAY_PROBABILITY[s]};};
 const certain=[],uncertain=[],out=[];
 for(const pl of cands){const c=classify(pl);if(c.q<=0)out.push(pl);else if(c.q>=1)certain.push(pl);else uncertain.push({pl,q:c.q,status:c.s});}
 uncertain.sort((a,b)=>base(b.pl)-base(a.pl));
 const varied=uncertain.slice(0,maxScenarioPlayers),treatedAvailable=uncertain.slice(maxScenarioPlayers);
 return {certain:[...certain,...treatedAvailable.map(u=>u.pl)],varied,out,treatedAvailable:treatedAvailable.map(u=>u.pl.id)};
}
function scenarios(state,teamInput,opts={}){
 const r=resolveAvailability(state,teamInput),list=[];
 const n=r.varied.length,keyOf=pl=>baselineMinutes(pl)>=state.p.keyMinutes;
 for(let mask=0;mask<(1<<n);mask++){
  let prob=1;const avail=[...r.certain],absent=[...r.out];
  r.varied.forEach((u,i)=>{if(mask&(1<<i)){prob*=u.q;avail.push(u.pl);}else{prob*=1-u.q;absent.push(u.pl);}});
  const absentKey=absent.filter(keyOf).map(pl=>pl.id);
  const tr=teamRec(state,teamInput.id),fresh=absent.filter(pl=>baselineMinutes(pl)>=8&&tr.gc-pl.lastGC<=state.p.freshWindow).map(pl=>pl.id);
  const returning=avail.filter(pl=>baselineMinutes(pl)>=8&&tr.gc-pl.lastGC>=state.p.returnGap).map(pl=>pl.id);
  list.push({probability:prob,available:avail,absentKey,freshAbsent:fresh,returning,absent:absent.map(pl=>pl.id),playing_uncertain:r.varied.filter((u,i)=>mask&(1<<i)).map(u=>u.pl.id)});
 }
 return {list,out:r.out.map(pl=>pl.id),varied:r.varied.map(u=>({id:u.pl.id,status:u.status,probability:u.q})),treatedAvailable:r.treatedAvailable};
}

// ---- public forecast -------------------------------------------------------------------------------
// input: {home:{id,availability:{playerId:status},extra:[playerIds]}, away:{...}, date, rest:{home,away}}
function forecastGame(state,input,opts={}){
 const H=scenarios(state,input.home,opts),A=scenarios(state,input.away,opts);
 const mix={points:{home:0,away:0},margin:0,total:0,possessions:0},players=new Map(),scen=[];
 let marginSq=0;
 for(const sh of H.list)for(const sa of A.list){
  const prob=sh.probability*sa.probability;if(prob<1e-9)continue;
  const res=runScenario(state,input,{home:sh,away:sa},opts);
  mix.points.home+=prob*res.home.points;mix.points.away+=prob*res.away.points;mix.margin+=prob*res.raw_margin;mix.total+=prob*res.raw_total;mix.possessions+=prob*res.possessions;
  marginSq+=prob*res.raw_margin*res.raw_margin;
  scen.push({probability:prob,home_points:res.home.points,away_points:res.away.points,margin:res.raw_margin,home_absent:sh.absent,away_absent:sa.absent});
  for(const [side,team] of [['home',res.home],['away',res.away]])for(const r of team.rows){
   const key=side+'|'+r.id;let agg=players.get(key);
   if(!agg){agg={id:r.id,side,team:input[side].id,prob_plays:0,appr:r.appr,net_lost:0,cond_base:r.base,min:0,pts:0,reb:0,ast:0,tpm:0,stl:0,blk:0,tov:0,fga:0,fgm:0,fta:0,ftm:0,fantasy:0,evidence:[],base_minutes:baselineMinutes(r.pl),usage_scale:0};players.set(key,agg);}
   agg.prob_plays+=prob;agg.net_lost+=prob*(r.netLost||0);
   for(const k of ['min','pts','reb','ast','stl','blk','tov','fga','fgm','fta','ftm','fantasy','usage_scale'])agg[k]+=prob*(k==='usage_scale'?r.scale:r[k]);
   agg.tpm+=prob*r.tpm;if(r.ev.items.length&&r.ev.confidence>0)agg.evidence=r.ev.items;
  }
 }
 const rows=[...players.values()].map(a=>{
  const w=a.prob_plays||1,o={...a};
  for(const k of ['min','pts','reb','ast','stl','blk','tov','fga','fgm','fta','ftm','tpm','fantasy','usage_scale'])o[k]=a[k]/w;
  o.expected_min=a.min;// probability-weighted over scenarios, including 0 when absent
  // conditional-on-playing view of a dressed player (his chance of playing when dressed is `appr`)
  const k=1/Math.max(a.appr,0.05);
  for(const key of ['min','pts','reb','ast','tpm','stl','blk','tov','fga','fta','fantasy'])o[key+'_if_plays']=o[key]*k;
  o.min_if_plays=Math.min(o.min_if_plays,state.p.minCap+4);
  return o;
 });
 const rh=residualOf(state,input.home.id),ra=residualOf(state,input.away.id);
 return {version:VERSION,home_points_raw:mix.points.home,away_points_raw:mix.points.away,raw_margin:mix.margin,raw_total:mix.total,
  resid_diff:rh.margin-ra.margin,resid_total_sum:rh.total+ra.total,team_residual:{home:rh,away:ra},
  possessions:mix.possessions,margin_scenario_sd:Math.sqrt(Math.max(marginSq-mix.margin*mix.margin,0)),
  players:rows,scenarios:scen,out:{home:H.out,away:A.out},uncertain:{home:H.varied,away:A.varied},
  scenario_cap_note:(H.treatedAvailable.length+A.treatedAvailable.length)?'Players beyond the three highest-minute uncertain players per team are treated as available.':null};
}

// ---- calibration -----------------------------------------------------------------------------------
// Fits the only game-level constants (home advantage, scale, rest, spread) from PRIOR out-of-sample predictions.
function ols(X,y,ridge){
 const k=X[0].length,A=Array.from({length:k},()=>Array(k).fill(0)),b=Array(k).fill(0);
 X.forEach((x,i)=>{for(let a=0;a<k;a++){b[a]+=x[a]*y[i];for(let c=0;c<k;c++)A[a][c]+=x[a]*x[c];}});
 for(let i=1;i<k;i++)A[i][i]+=ridge[i]||0;
 for(let i=0;i<k;i++){let p=i;for(let j=i+1;j<k;j++)if(Math.abs(A[j][i])>Math.abs(A[p][i]))p=j;[A[p],A[i]]=[A[i],A[p]];[b[p],b[i]]=[b[i],b[p]];
  for(let j=i+1;j<k;j++){const f=A[j][i]/A[i][i];for(let c=i;c<k;c++)A[j][c]-=f*A[i][c];b[j]-=f*b[i];}}
 const x=Array(k).fill(0);for(let i=k-1;i>=0;i--){let t=b[i];for(let c=i+1;c<k;c++)t-=A[i][c]*x[c];x[i]=t/A[i][i];}
 return x;
}
function fitCalibration(preds){
 // preds: [{raw_margin,raw_total,margin,total,restDiff,resid_diff,resid_total_sum,home,away}] from PRIOR seasons only
 const n=preds.length;
 if(n<200)return {fitted:false,reason:'fewer than 200 prior predictions',home_adv:2.2,margin_slope:1,margin_rest:0,margin_resid:0,total_offset:0,total_slope:1,total_resid:0,sigma_margin:12.5,sigma_total:18,q:{margin:[-16,16],total:[-22,22],home:[-14,14],away:[-14,14]}};
 const clampTo=(v,a,b)=>clamp(v,a,b);
 const mc=ols(preds.map(r=>[1,r.raw_margin,r.restDiff||0,r.resid_diff||0]),preds.map(r=>r.margin),[0,5,50,5]);
 const slope=clampTo(mc[1],0.5,1.5),rest=clampTo(mc[2],-1.5,1.5),resid=clampTo(mc[3],0,1.5);
 const mPred=r=>slope*r.raw_margin+rest*(r.restDiff||0)+resid*(r.resid_diff||0);
 const intercept=preds.reduce((s,r)=>s+r.margin-mPred(r),0)/n,mResid=preds.map(r=>r.margin-(intercept+mPred(r)));
 const tc=ols(preds.map(r=>[1,r.raw_total,r.resid_total_sum||0]),preds.map(r=>r.total),[0,5,5]);
 const tSlope=clampTo(tc[1],0.5,1.5),tRes=clampTo(tc[2],0,1.5),tPred=r=>tSlope*r.raw_total+tRes*(r.resid_total_sum||0);
 const tOff=preds.reduce((s,r)=>s+r.total-tPred(r),0)/n,tResid=preds.map(r=>r.total-(tOff+tPred(r)));
 const sd=a=>Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length),qs=(a,lo,hi)=>{const t=[...a].sort((x,y)=>x-y);return [t[Math.floor(lo*(t.length-1))],t[Math.ceil(hi*(t.length-1))]];};
 const hS=preds.map(r=>r.home-((tOff+tPred(r))+(intercept+mPred(r)))/2),aS=preds.map(r=>r.away-((tOff+tPred(r))-(intercept+mPred(r)))/2);
 return {fitted:true,n,margin_intercept:intercept,margin_slope:slope,margin_rest:rest,margin_resid:resid,total_offset:tOff,total_slope:tSlope,total_resid:tRes,
  sigma_margin:sd(mResid),sigma_total:sd(tResid),q:{margin:qs(mResid,0.1,0.9),total:qs(tResid,0.1,0.9),home:qs(hS,0.1,0.9),away:qs(aS,0.1,0.9)}};
}
const normCdf=x=>{const t=1/(1+0.2316419*Math.abs(x)),d=0.3989423*Math.exp(-x*x/2),p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return x>0?1-p:p;};
function applyCalibration(f,cal,restDiff=0){
 const margin=(cal.fitted?cal.margin_intercept:cal.home_adv)+(cal.fitted?cal.margin_slope:1)*f.raw_margin+(cal.fitted?cal.margin_rest:0)*restDiff+(cal.margin_resid||0)*(f.resid_diff||0);
 const total=(cal.fitted?cal.total_offset:0)+(cal.fitted?cal.total_slope:1)*f.raw_total+(cal.total_resid||0)*(f.resid_total_sum||0);
 const home=(total+margin)/2,away=(total-margin)/2;
 const sigma=Math.sqrt(cal.sigma_margin**2+(f.margin_scenario_sd||0)**2*0.25);
 const scaleH=f.home_points_raw>0?home/f.home_points_raw:1,scaleA=f.away_points_raw>0?away/f.away_points_raw:1;
 const players=f.players.map(r=>{const k=r.side==='home'?scaleH:scaleA;return {...r,pts:r.pts*k};});
 return {...f,players,home_score:home,away_score:away,margin,total,sigma,home_win_probability:normCdf(margin/sigma),
  intervals_80:{margin:[margin+cal.q.margin[0],margin+cal.q.margin[1]],total:[total+cal.q.total[0],total+cal.q.total[1]],home_score:[home+cal.q.home[0],home+cal.q.home[1]],away_score:[away+cal.q.away[0],away+cal.q.away[1]]}};
}

// ---- player prediction bands ------------------------------------------------------------------------
// Empirical 80% residual bands by predicted-mean bucket, fitted from PRIOR out-of-sample predictions only.
// pairs: [[predicted, actual], ...] for one stat.
function fitBands(pairs,buckets=8){
 const sorted=pairs.filter(p=>finite(p[0])&&finite(p[1])).sort((a,b)=>a[0]-b[0]);
 if(sorted.length<buckets*30)return null;
 const out=[],size=Math.ceil(sorted.length/buckets);
 for(let i=0;i<sorted.length;i+=size){
  const chunk=sorted.slice(i,i+size),res=chunk.map(p=>p[1]-p[0]).sort((a,b)=>a-b);
  out.push({max:chunk[chunk.length-1][0],lo:res[Math.floor(0.1*(res.length-1))],hi:res[Math.ceil(0.9*(res.length-1))],n:chunk.length});
 }
 return out;
}
function band(bands,mean,floor=0){
 if(!bands)return null;
 const b=bands.find(x=>mean<=x.max)||bands[bands.length-1];
 return [Math.max(floor,mean+b.lo),Math.max(floor,mean+b.hi)];
}

// ---- explanation: normal vs matchup-adjusted -------------------------------------------------------
// "Normal" = everyone available against a league-average opponent. Differences are measured model
// contributions of the forecast, not causal claims.
function explainPlayers(state,input,adjusted,opts={}){
 const healthy={home:{...input.home,availability:{}},away:{...input.away,availability:{}}};
 const normal=forecastGame(state,healthy,{...opts,neutral:true});
 const availOnly=forecastGame(state,input,{...opts,neutral:true});
 const idx=f=>new Map(f.players.map(r=>[r.side+'|'+r.id,r]));
 const nIdx=idx(normal),aIdx=idx(availOnly),fIdx=idx(adjusted);
 const out=[];
 for(const [key,final] of fIdx){
  const n=nIdx.get(key),a=aIdx.get(key);if(!n||!a)continue;
  out.push({id:final.id,side:final.side,normal:{min:n.min,fga:n.fga,pts:n.pts,fantasy:n.fantasy},availability_adjusted:{min:a.min,fga:a.fga,pts:a.pts,fantasy:a.fantasy},
   final:{min:final.min,fga:final.fga,pts:final.pts,fantasy:final.fantasy},
   delta_minutes_from_availability:a.min-n.min,delta_fga_from_availability:a.fga-n.fga,delta_pts_from_availability:a.pts-n.pts,
   delta_pts_from_opponent:final.pts-a.pts,delta_pts_total:final.pts-n.pts,delta_fantasy_total:final.fantasy-n.fantasy,evidence:final.evidence});
 }
 return out;
}
// Two players most likely to exceed their normal production because of changed opportunity or opponent.
// Picks are ranked by the measured change in projected fantasy output (not by star status). A pick whose
// measured change is small is labelled 'weak' rather than dressed up as a reason.
function spotlights(explained,state,count=2,{minDelta=0.5,fill=false}={}){
 const rows=explained.filter(r=>{const pl=state.players.get(r.id);return pl&&r.normal.min>=14&&r.final.min>=14;});
 rows.sort((x,y)=>y.delta_fantasy_total-x.delta_fantasy_total);
 const strong=rows.filter(r=>r.delta_fantasy_total>minDelta).slice(0,count).map(r=>({...r,strength:'measured'}));
 if(!fill||strong.length>=count)return strong;
 const weak=rows.filter(r=>!strong.includes(r)).slice(0,count-strong.length).map(r=>({...r,strength:'weak'}));
 return [...strong,...weak];
}

return {VERSION,DEFAULTS,STATUS_PLAY_PROBABILITY,createState,observeGame,profile,leagueRates,defenceFactors,teamPace,teamPlaysPerPossession,
 candidates,allocateMinutes,baselineMinutes,recordPrediction,residualOf,forecastGame,scenarios,fitCalibration,applyCalibration,fitBands,band,explainPlayers,spotlights,fantasy,playsPerMinute,teamRec,rosterSet,normCdf,clamp};
});

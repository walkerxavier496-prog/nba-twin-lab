/* 2026 Emirates NBA Cup — official group draw + seven Cup nights.
 * Source: NBA.com Aug 12 official format and Oct 28 group announcement.
 * All games on listed US Cup Nights are designated group matches.
 * Total score / PD from archive are RAW game scores, not certified official
 * Cup tiebreakers when overtime period details are unavailable.
 */
(()=>{'use strict';
const groups=Object.freeze({
 'East A':['DET','TOR','ORL','MIL','BKN'],
 'East B':['NY','CLE','PHI','MIA','IND'],
 'East C':['BOS','ATL','CHA','CHI','WSH'],
 'West A':['DEN','HOU','PHX','DAL','UTAH'],
 'West B':['OKC','MIN','LAC','NO','MEM'],
 'West C':['SA','LAL','POR','GS','SAC']
});
const nights=Object.freeze(['2026-10-30','2026-11-06','2026-11-13','2026-11-20','2026-11-24','2026-11-25','2026-11-27']);
const names=Object.keys(groups);
const abbrAliases={GSW:'GS',NYK:'NY',NOP:'NO',SAS:'SA',UTA:'UTAH',WAS:'WSH',PHO:'PHX',BRK:'BKN'};
const canonical=x=>abbrAliases[String(x||'').toUpperCase()]||String(x||'').toUpperCase();
const map=Object.fromEntries(names.flatMap(g=>groups[g].map(t=>[t,g])));
function usDate(utc){
 const d=new Date(utc);if(!Number.isFinite(d.getTime()))return '';
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
 const v=type=>parts.find(p=>p.type===type)?.value;
 return v('year')+'-'+v('month')+'-'+v('day');
}
function isCupGame(g){
 if(Number(g?.season)!==2027||!g?.home?.abbr||!g?.away?.abbr)return false;
 if(!nights.includes(usDate(g.date)))return false;
 const a=canonical(g.away.abbr),h=canonical(g.home.abbr);
 return a!==h&&!!map[a]&&map[a]===map[h];
}
function matches(games){
 const byId=new Map();
 for(const g of games||[]){
  if(!isCupGame(g))continue;
  const key=String(g.id||canonical(g.home.abbr)+'-'+canonical(g.away.abbr)+':'+usDate(g.date));
  byId.set(key,g);
 }
 return [...byId.values()].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
}
function calculate(games){
 const cupGames=matches(games);
 const tables={};const fixtures={};
 for(const group of names){
  tables[group]=groups[group].map(team=>({team,group,w:0,l:0,played:0,remaining:4,rawPf:0,rawPa:0,rawPd:0}));
  fixtures[group]=[];
 }
 for(const g of cupGames){
  const group=map[canonical(g.home.abbr)];fixtures[group].push(g);
  if(g.status!=='final'||!Number.isFinite(Number(g.homeScore))||!Number.isFinite(Number(g.awayScore))||g.homeScore===g.awayScore)continue;
  const home=tables[group].find(t=>t.team===canonical(g.home.abbr)),away=tables[group].find(t=>t.team===canonical(g.away.abbr));
  if(!home||!away)continue;
  home.w+=(g.homeScore>g.awayScore?1:0);home.l+=(g.homeScore<g.awayScore?1:0);
  away.w+=(g.homeScore>g.awayScore?1:0);away.l+=(g.homeScore<g.awayScore?1:0);
  for(const [row,pf,pa] of [[home,g.homeScore,g.awayScore],[away,g.awayScore,g.homeScore]]){
   row.played++;row.remaining=Math.max(0,4-row.played);row.rawPf+=Number(pf);row.rawPa+=Number(pa);row.rawPd+=Number(pf)-Number(pa);
  }
 }
 for(const group of names){
  tables[group].sort((a,b)=>b.w-a.w||a.l-b.l||b.rawPd-a.rawPd||b.rawPf-a.rawPf||a.team.localeCompare(b.team));
 }
 return {groups:tables,fixtures,games:cupGames,confirmedFinals:cupGames.filter(g=>g.status==='final').length,
  stage:'group',rulesVerified:true,officialTiebreaksResolved:false};
}
window.TwinCup2026=Object.freeze({groups,nights,canonical,usDate,isCupGame,matches,calculate});
})();
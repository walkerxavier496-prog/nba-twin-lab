/* Stat parsing + ESPN standard fantasy scoring. All numbers are sourced from
 * actual ESPN game box scores. Missing required categories => FPTS unavailable.
 * ESPN default formula: PTS + 3PM + 2 FGM - FGA + FTM - FTA
 * + REB + 2 AST + 4 STL + 4 BLK - 2 TOV (ESPN Sep 2025).
 * This is not a custom league's fantasy score.
 */
(()=>{'use strict';
const n=value=>value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value))?Number(value):null;
const shot=s=>{const m=String(s??'').match(/^(\d+)\s*-\s*(\d+)$/);return m?{made:Number(m[1]),attempts:Number(m[2])}:null};
const id=s=>String(s??'').toUpperCase().replace(/[^A-Z0-9+\-%]/g,'');
const minutes=value=>{
 const text=String(value??'').trim();
 const match=text.match(/^(\d+):([0-5]\d)(?:\.\d+)?$/);
 if(match)return Number(match[1])*60+Number(match[2]);
 const number=n(text);
 return number===null?null:number*60;
};
const getStat=(labels,values,...keys)=>{
 for(const key of keys){const index=labels.findIndex(l=>id(l)===id(key));if(index>=0)return values[index]}
 return null;
};
function fantasyPoints(p){
 const keys=['pts','three','fgm','fga','ftm','fta','reb','ast','stl','blk','tov'];
 if(keys.some(k=>!Number.isFinite(p?.[k])))return null;
 const score=p.pts+p.three+2*p.fgm-p.fga+p.ftm-p.fta+p.reb+2*p.ast+4*p.stl+4*p.blk-2*p.tov;
 return Math.round(score*10)/10;
}
function parseBoxscore(raw){
 const groups=raw?.boxscore?.players;
 if(!Array.isArray(groups))return [];
 const players=[];
 for(const group of groups){
  const team=String(group.team?.abbreviation||group.team?.shortDisplayName||'').trim().toUpperCase();
  for(const statGroup of group.statistics||[]){
   const labels=(statGroup.labels||statGroup.names||[]).map(id);
   for(const entry of statGroup.athletes||[]){
    const athlete=entry.athlete||{},stats=entry.stats||[],stat=(...keys)=>getStat(labels,stats,...keys);
    const name=String(athlete.displayName||athlete.fullName||'').trim();
    if(!name)continue;
    const dnp=entry.didNotPlay===true||entry.dnp===true||
     typeof entry.didNotPlay==='string'&&/dnp|did not play/i.test(entry.didNotPlay);
    const dnpReason=String(entry.reason||entry.status||entry.didNotPlayReason||
     (typeof entry.didNotPlay==='string'?entry.didNotPlay:'')).trim();
    const pts=n(stat('PTS')),reb=n(stat('REB')),ast=n(stat('AST'));
    const fgs=shot(stat('FG','FGM-A')),threes=shot(stat('3PT','3PM-A','3FG')),fts=shot(stat('FT','FTM-A'));
    const pick=(value,alternate)=>n(value)??n(alternate);
    const obj={
     id:String(athlete.id||''),name,team,
     pts,reb,ast,
     minutes:String(stat('MIN')??'—'),
     minuteValue:minutes(stat('MIN')),
     fgm:pick(stat('FGM'),fgs?.made),fga:pick(stat('FGA'),fgs?.attempts),
     three:pick(stat('3PM','3FGM'),threes?.made),threeA:pick(stat('3PA','3FGA'),threes?.attempts),
     ftm:pick(stat('FTM'),fts?.made),fta:pick(stat('FTA'),fts?.attempts),
     stl:n(stat('STL','STEALS')),blk:n(stat('BLK','BLOCKS')),tov:n(stat('TO','TOV','TURNOVERS')),
     oreb:n(stat('OREB','ORB')),dreb:n(stat('DREB','DRB')),
     pf:n(stat('PF','FOULS')),plusMinus:n(stat('+/-','PLUSMINUS','PLUS-MINUS')),
     starter:entry.starter===true,position:String(athlete.position?.abbreviation||'')
    };
    obj.dnp=dnp;
    obj.dnpReason=dnpReason;
    if(dnp){
     for(const key of ['pts','reb','ast','minuteValue','fgm','fga','three','threeA','ftm','fta','stl','blk','tov','oreb','dreb','pf','plusMinus'])obj[key]=null;
     obj.minutes='DNP';obj.dnpReason=dnpReason||'Did not play';
    }
    obj.unavailable=!dnp&&['pts','reb','ast','minuteValue','fgm','fga','three','threeA','ftm','fta',
     'stl','blk','tov','oreb','dreb','pf','plusMinus'].every(key=>obj[key]===null);
    obj.fgPct=obj.fga>0?Math.round(obj.fgm/obj.fga*1000)/10:null;
    obj.threePct=obj.threeA>0?Math.round(obj.three/obj.threeA*1000)/10:null;
    obj.ftPct=obj.fta>0?Math.round(obj.ftm/obj.fta*1000)/10:null;
    obj.fpts=dnp?null:fantasyPoints(obj);
    obj.doubleDouble=!dnp&&['pts','reb','ast','stl','blk'].filter(k=>obj[k]!==null&&obj[k]>=10).length>=2;
    obj.tripleDouble=!dnp&&['pts','reb','ast','stl','blk'].filter(k=>obj[k]!==null&&obj[k]>=10).length>=3;
    players.push(obj);
   }
  }
 }
 const deduped=new Map();
 for(const p of players)deduped.set(p.id&&/^\d+$/.test(p.id)?p.id:p.team+':'+p.name,p);
 return [...deduped.values()].sort((a,b)=>(b.pts??-1)-(a.pts??-1));
}
const sort=(players,key='pts',descending=true)=>{
 const value=p=>typeof p[key]==='number'&&Number.isFinite(p[key])?p[key]:null;
 const factor=descending?-1:1;
 return players.slice().sort((a,b)=>{
  const x=value(a),y=value(b);
  if(x===null&&y!==null)return 1;if(y===null&&x!==null)return -1;
  return x!==null&&y!==null&&x!==y?factor*(x-y):a.name.localeCompare(b.name);
 });
};
function performanceTag(p){
 if(p.tripleDouble)return 'TRIPLE-DOUBLE';
 if(p.doubleDouble)return 'DOUBLE-DOUBLE';
 if(p.pts>=40)return '40+ POINT GAME';
 if(p.pts>=30)return '30+ POINT GAME';
 if(p.three>=7)return '7+ THREES';
 if(p.ast>=15)return '15+ ASSISTS';
 if(p.reb>=20)return '20+ REBOUNDS';
 if(p.stl>=5||p.blk>=5)return 'DEFENSIVE STANDOUT';
 return '';
}
window.TwinBoxscorePlus=Object.freeze({parseBoxscore,fantasyPoints,performanceTag,sort,shot,minutes});
})();
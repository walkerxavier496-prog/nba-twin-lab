/* ESPN NBA game state adapter, separate from immutable prediction forecasts.
 * Scores are NEVER used in pretip prediction computation or stored in lock files.
 * No response -> no live claim. Source and timestamp always displayed.
 */
(()=>{'use strict';
  const BASE='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
  const get=(o,p)=>p.reduce((v,k)=>v?.[k],o);
  const num=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
  const id=value=>String(value??'').trim();
  const cleanText=value=>String(value??'').replace(/[<>]/g,'').slice(0,60);
  function usDate(value){
    const d=new Date(value);
    if(!Number.isFinite(d.getTime()))return null;
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
    const o=Object.fromEntries(parts.map(x=>[x.type,x.value]));
    return o.year+o.month+o.day;
  }
  function status(event){
    const v=event?.status||event?.competitions?.[0]?.status||{};
    const type=v.type||{};
    const phase=type.completed===true||type.state==='post'||type.name==='STATUS_FINAL'?'final':
      type.state==='in'||String(type.name||'').startsWith('STATUS_IN')?'live':'scheduled';
    const period=num(v.period);
    const clock=cleanText(v.displayClock||'');
    const description=cleanText(type.shortDetail||type.detail||'');
    return {phase,period,clock,description};
  }
  function parse(data){
    if(!data||!Array.isArray(data.events))throw Error('ESPN response is missing its events array');
    const out=[];
    for(const event of data.events){
      const competitors=event.competitions?.[0]?.competitors||[];
      const home=competitors.find(c=>c.homeAway==='home'),away=competitors.find(c=>c.homeAway==='away');
      if(!home||!away)continue;
      const when=new Date(event.date);
      if(!Number.isFinite(when.getTime()))continue;
      const state=status(event);
      // Only present 0–0 as a real score if it is actually in progress.
      const hScore=state.phase==='scheduled'?null:num(home.score);
      const aScore=state.phase==='scheduled'?null:num(away.score);
      if(state.phase!=='scheduled'&&(!Number.isFinite(hScore)||!Number.isFinite(aScore)))continue;
      out.push({
        id:id(event.id),date:when.toISOString(),
        home:{abbr:cleanText(home.team?.abbreviation||home.team?.shortDisplayName),name:cleanText(home.team?.displayName),score:hScore},
        away:{abbr:cleanText(away.team?.abbreviation||away.team?.shortDisplayName),name:cleanText(away.team?.displayName),score:aScore},
        ...state
      });
    }
    return out;
  }
  async function fetchDate(date,{fetchImpl=fetch}={}){
    if(!/^\d{8}$/.test(String(date)))throw Error('Invalid ESPN NBA game date');
    const url=BASE+'?dates='+date+'&limit=100';
    const response=await fetchImpl(url,{cache:'no-store',headers:{Accept:'application/json'}});
    if(!response?.ok)throw Error('ESPN live scoreboard HTTP '+(response?.status||'unavailable'));
    const games=parse(await response.json());
    return {date,games,fetched_at_utc:new Date().toISOString(),source:'ESPN public scoreboard (unofficial)'};
  }
  const label=game=>{
    if(!game)return 'SCORE UNAVAILABLE';
    if(game.phase==='final')return 'FINAL';
    if(game.phase==='live'){
      const q=game.period>4?'OT'+(game.period>5?' '+(game.period-4):''):'Q'+(game.period||'?');
      return q+(game.clock?' · '+game.clock:'')+' · LIVE';
    }
    return 'SCHEDULED';
  };
  window.NbaScores=Object.freeze({parse,fetchDate,usDate,label});
})();
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const E = require('../predict/engine.js');
const U = require('../predict/unified.js');
const A = require('./audit-core.cjs');
const noForecast = reason => ({available:false, model_id:U.VERSION, reason});
function forSlate(season,snapshot,now,gameData) {
  let artifact,teams;
  try {
    if (!Number.isInteger(season) || !Number.isFinite(now)) throw Error('Invalid slate cutoff');
    const file=path.join(__dirname,'../research-reviews/unified-v1','fit-'+season+'.json');
    artifact=JSON.parse(fs.readFileSync(file,'utf8'));
    if (!A.verifyIntegrity(artifact) || artifact.target_season!==season || artifact.fit.version!==U.VERSION ||
        !(Date.parse(artifact.fit.max_available_utc)<now)) throw Error('Training artifact failed provenance');
    for (const source of [snapshot,gameData]) {
      const age=now-Date.parse(source?.built_at_utc);
      if (!(age>=0 && age<=18*3600000)) throw Error('Pregame source stale or future-dated');
    }
    if (snapshot.chronology_policy!==E.CHRONOLOGY_POLICY || snapshot.strict_no_future_data!==true ||
        Number(snapshot.coverage?.season)!==season) throw Error('Snapshot chronology unavailable');
    teams=new Map(snapshot.teams.map(t=>[A.canonicalTeam(t.abbr),t]));
  } catch(e) {return ()=>noForecast(e.code==='ENOENT'?'No trained artifact for this season':e.message);}
  return (game,baseline,rosterStrength)=>{
    try {
      if (game.status!=='scheduled'||game.season!==season||!(Date.parse(game.date)>now)) throw Error('Game is outside pre-tip scope');
      const home=teams.get(A.canonicalTeam(game.home.abbr)),away=teams.get(A.canonicalTeam(game.away.abbr));
      for(const side of [home,away]) {
        if(side?.chronology_policy!==E.CHRONOLOGY_POLICY)throw Error('Team chronology unavailable');
        E.assertHistoricalSnapshotBefore({date:new Date(now).toISOString()},side);
      }
      const schedule=U.scheduleFeatures(game,gameData.games,now);
      const x=U.vector(home,away,baseline,schedule);
      const forecast=U.forecast(artifact.fit,x,baseline);
      return {available:true,model_id:U.VERSION,status:'shadow_only',...forecast,
        model_sha256:artifact.integrity.canonical_payload_without_integrity,
        cutoff_utc:new Date(now).toISOString(),input_sha256:A.sha256({x,margin:baseline.margin,total:baseline.total}),
        availability_scenarios:rosterStrength?.available ? {complete:rosterStrength.home?.completeness===true && rosterStrength.away?.completeness===true,
          home_cases:rosterStrength.home.scenarios,away_cases:rosterStrength.away.scenarios,
          impact_proxy_range:rosterStrength.home_minus_away_impact_range,units:'unvalidated impact proxy; no probability adjustment'} : {complete:false},
        availability:'Inferred rotation from previous appearances. Official injury effects are uncalibrated.'};
    } catch(e) {return noForecast(e.message);}
  };
}
module.exports={forSlate};

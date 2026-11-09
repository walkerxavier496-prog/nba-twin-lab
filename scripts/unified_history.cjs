'use strict';
const IO = require('./research_io.cjs');
const E = require('../predict/engine.js');
const A = require('./audit-core.cjs');
const {contextProfiles} = require('./daily_tracker.cjs');
const U = require('../predict/unified.js');

// Replay the production feed horizon (previous season plus the season in progress).
function historicalRows() {
  const intel = IO.requireChronology(IO.read('v7-intelligence.json'));
  const archive = IO.read('historical-games.json').games;
  const context = IO.read('context.json');
  const byId = new Map(archive.map(g => [String(g.id), g]));
  const seen = new Set();
  const rows = [];
  const seasons = [...new Set(intel.games.map(g=>g.season))].sort().filter(s=>intel.games.filter(g=>g.season===s).length===1230);
  for (const season of seasons) {
    const games = archive.filter(g => g.season === season || g.season === season - 1);
    const profiles = contextProfiles(context, season);
    const features = intel.games.filter(f => f.season === season);
    if (features.length !== 1230) throw Error('Incomplete season ' + season);
    let previousTip, state;
    for (const f of features.sort((a,b) => Date.parse(a.prediction_at_utc) - Date.parse(b.prediction_at_utc))) {
      const g = byId.get(String(f.result_id));
      if (!g || seen.has(g.id) || g.status !== 'final' || g.season !== season ||
          Date.parse(g.date) !== Date.parse(f.prediction_at_utc) ||
          A.canonicalTeam(g.home.abbr) !== A.canonicalTeam(f.home.abbr) ||
          A.canonicalTeam(g.away.abbr) !== A.canonicalTeam(f.away.abbr) ||
          g.homeScore !== f.home_score || g.awayScore !== f.away_score) throw Error('Historical join mismatch ' + f.result_id);
      seen.add(g.id);
      for (const t of Object.values(f.pregame)) {
        E.assertHistoricalSnapshotBefore(g,t);
        if (t.chronology_policy !== E.CHRONOLOGY_POLICY || t.as_of !== f.date) throw Error('Uncertified team snapshot');
      }
      if (previousTip !== g.date) state = E.ratings(games,g.date);
      previousTip = g.date;
      const baseline = E.forecast(g,state,profiles);
      rows.push({id:g.id,date:g.date,season,x:U.vector(f.pregame.home,f.pregame.away,baseline,U.scheduleFeatures(g,games,Date.parse(g.date))),
        baseline:{margin:baseline.margin,total:baseline.total,homeWin:baseline.homeWin},
        hs:g.homeScore,as:g.awayScore,available:E.resultAvailability(g)});
    }
  }
  return rows;
}
module.exports = {historicalRows};

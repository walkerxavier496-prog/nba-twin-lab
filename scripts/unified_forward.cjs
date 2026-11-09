'use strict';
const fs = require('node:fs');
const path = require('node:path');
const A = require('./audit-core.cjs');
const B = require('./player_engine_backtest.cjs');
const {observe,compare} = require('./unified_backtest.cjs');
const ROOT = path.join(__dirname,'..');
function forward(root=ROOT) {
  const ledger=JSON.parse(fs.readFileSync(path.join(root,'data/audit-ledger.json')));
  const elo=[],pairs={existing_joint:[],unified:[]},reviewed=new Set();
  const errors=[],versions={};
  for(const entry of ledger.entries) {
    const lockBytes=fs.readFileSync(path.join(root,entry.lock_path));
    const lock=JSON.parse(lockBytes);
    if(!A.verifyIntegrity(lock)||A.sha256(lockBytes)!==entry.lock_sha256)throw Error('Lock integrity '+entry.lock_path);
    for(const f of lock.forecasts) {
      const id=String(f.game_id),tip=Date.parse(f.tip_utc);
      if(!(Date.parse(lock.locked_at_utc)<tip))throw Error('Post-tip lock '+id);
      const file=path.join(root,'audit/reviews',entry.melbourne_date,'games',id+'.review.json');
      if(!fs.existsSync(file))continue;
      const review=JSON.parse(fs.readFileSync(file));
      if(reviewed.has(id)||!A.verifyIntegrity(review)||review.source_lock_sha256!==entry.lock_sha256 ||
        review.game_id!==id || !(Date.parse(review.reviewed_at_utc)>tip))throw Error('Invalid grade '+id);
      const game=review.games[0];
      if(game.game_id!==id || A.canonicalTeam(f.home.abbr)!==A.canonicalTeam(game.home.abbr) || A.canonicalTeam(f.away.abbr)!==A.canonicalTeam(game.away.abbr))throw Error('Game mismatch '+id);
      const row={id,date:f.tip_utc,hs:game.home.score,as:game.away.score};
      if(!Number.isFinite(row.hs)||!Number.isFinite(row.as)||row.hs===row.as)throw Error('Invalid final '+id);
      reviewed.add(id);
      const base=observe(row,f.primary_forecast);
      elo.push(base);
      for(const [key,forecast] of [['existing_joint',f.research_score_machine],['unified',f.unified_shadow]]) {
        if(!forecast?.available)continue;
        const pair={candidate:observe(row,forecast),base};
        if(key==='unified'){
          if(forecast.model_id!=='unified-margin-v1'||!/^([0-9a-f]{64})$/.test(forecast.model_sha256))throw Error('Unversioned shadow forecast');
          (versions[forecast.model_sha256]??=[]).push(pair);
        }else pairs[key].push(pair);
      }
      const probabilities=Object.fromEntries(Object.entries(game.models).map(([k,m])=>[k,m.p]));
      errors.push(probabilities);
    }
  }
  const modelPairs={};
  for(const a of Object.keys(errors[0]||{}))for(const b of Object.keys(errors[0]||{}).filter(b=>b>a)){
    const vals=errors.filter(r=>Number.isFinite(r[a])&&Number.isFinite(r[b]));
    if(vals.length<2) continue;
    const x=B.mean(vals.map(r=>r[a])),y=B.mean(vals.map(r=>r[b]));
    const den=Math.sqrt(vals.reduce((s,r)=>s+(r[a]-x)**2,0)*vals.reduce((s,r)=>s+(r[b]-y)**2,0));
    modelPairs[a+' / '+b]={games:vals.length,correlation:den?vals.reduce((s,r)=>s+(r[a]-x)*(r[b]-y),0)/den:null};
  }
  const output={elo:elo.length?B.teamMetrics(elo):{games:0},model_pairs:modelPairs};
  for(const [k,rows] of Object.entries(pairs)){
    const a=rows.map(r=>r.candidate),b=rows.map(r=>r.base);
    output[k]=a.length?{candidate:B.teamMetrics(a),elo_same_games:B.teamMetrics(b),paired:compare(a,b)}:{games:0};
  }
  output.unified={games:Object.values(versions).reduce((n,rows)=>n+rows.length,0),versions:{}};
  for(const [hash,rows] of Object.entries(versions)){
    rows.sort((a,b)=>a.candidate.date.localeCompare(b.candidate.date)||a.candidate.id.localeCompare(b.candidate.id));
    const first=rows.slice(0,500),candidate=first.map(r=>r.candidate),baseline=first.map(r=>r.base);
    output.unified.versions[hash]={locked_and_graded:rows.length,planned_review_ready:first.length===500,
      candidate:B.teamMetrics(candidate),elo:B.teamMetrics(baseline),paired:compare(candidate,baseline)};
  }
  return output;
}
if(require.main===module) console.log(JSON.stringify(forward(),null,2));
module.exports={forward};

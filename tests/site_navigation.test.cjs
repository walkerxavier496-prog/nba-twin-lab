'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
test('primary site routes, audit ledger and data-backed twin finder exist',()=>{
 for(const route of ['index.html','predict/index.html','team-intelligence/index.html','models/index.html','audit/index.html','twins/index.html'])
  assert.ok(fs.existsSync(path.join(root,route)),route);
 const twins=fs.readFileSync(path.join(root,'twins/index.html'),'utf8');
 assert.ok(twins.includes('../data/seasons.json'),'Player Twins must fetch original data from new route');
 const home=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(home.includes('./predict/')&&home.includes('./team-intelligence/')&&home.includes('./models/')&&home.includes('./audit/')&&home.includes('./twins/'));
});
test('production Elo is the explicit default and roster beta remains a research comparison',()=>{
 const predictor=fs.readFileSync(path.join(root,'predict/index.html'),'utf8');
 assert.match(predictor,/<option value="elo" selected>/);
 assert.match(predictor,/<option value="roster">Roster-aware · research beta<\/option>/);
 assert.match(predictor,/Elo remains production/i);
 assert.match(predictor,/never auto-promoted/i);
 const engine=fs.readFileSync(path.join(root,'predict/engine.js'),'utf8');
 assert.ok(!engine.includes('game-science-report.json'),'Research report must not silently alter baseline Elo engine');
});
test('accuracy ledger links immutable locks and exposes only published metrics',()=>{
 const audit=fs.readFileSync(path.join(root,'audit/index.html'),'utf8');
 const app=fs.readFileSync(path.join(root,'audit/app.js'),'utf8');
 assert.ok(audit.includes('../data/audit-ledger.json'));
 assert.ok(app.includes('nba-twin-lab-audit-ledger-v2'));
 assert.ok(app.includes('No reviewed games yet'));
});
test('research and team intelligence share one source of science features',()=>{
 const research=fs.readFileSync(path.join(root,'scripts/game_science.cjs'),'utf8');
 const intel=fs.readFileSync(path.join(root,'team-intelligence/index.html'),'utf8');
 assert.ok(research.includes("require('../predict/science.js')"));
 assert.ok(intel.includes('../predict/science.js'));
});

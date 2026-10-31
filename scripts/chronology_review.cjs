#!/usr/bin/env node
'use strict';
// Offline paired replay. Baseline source comes from the audited Git revision,
// never from a hosted workflow artifact. Original evidence is read-only.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),vm=require('node:vm'),zlib=require('node:zlib'),crypto=require('node:crypto');
const ROOT=path.join(__dirname,'..');
const stage=process.argv[3]||'all';
const directory=path.resolve(process.argv[2]||path.join(ROOT,'research-reviews/chronology-v1/evaluations'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function write(name,value){const p=path.join(directory,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(value),{flag:'wx'});return p}
const baselineFiles=['predict/engine.js','predict/science.js','predict/roster.js',...['v8_research','game_science','roster_research','five_model_challenge','historical_backtest','v7_backtest'].map(n=>'scripts/'+n+'.cjs')];
const sources=Object.fromEntries(baselineFiles.map(p=>[p,cp.execFileSync('git',['show','HEAD:'+p],{cwd:ROOT,encoding:'utf8'})]));
if(!fs.existsSync(path.join(directory,'legacy-source.json')))write('legacy-source.json',sources);
else if(JSON.stringify(JSON.parse(fs.readFileSync(path.join(directory,'legacy-source.json'))))!==JSON.stringify(sources))throw Error('Baseline source revision changed');
function legacy(entry,args=[]){
 const cache=new Map(),entryPath=path.join(ROOT,entry);let main;
 const fakeFs={...fs,readFileSync(file,...rest){
   const name=path.relative(path.join(ROOT,'data'),String(file));
   const frozen=path.join(ROOT,'research-reviews/chronology-v1/legacy-replay-inputs',name+'.gz');
   if(!name.startsWith('..')&&fs.existsSync(frozen)){
     const b=zlib.gunzipSync(fs.readFileSync(frozen));return typeof rest[0]==='string'?b.toString(rest[0]):b;
   }
   return fs.readFileSync(file,...rest);
 },writeFileSync(file,body){
   const p=path.resolve(file);if(!p.startsWith(directory+path.sep))throw Error('Baseline attempted to overwrite evidence: '+p);
   fs.writeFileSync(p,body,{flag:'wx'});
 }};
 function load(full){
   const rel=path.relative(ROOT,full);if(!(rel in sources))return require(full);
   if(cache.has(full))return cache.get(full).exports;
   const mod={exports:{}};cache.set(full,mod);if(full===entryPath)main=mod;
   function req(name){
     if(name==='node:fs'||name==='fs')return fakeFs;
     if(name.startsWith('.'))return load(require.resolve(path.resolve(path.dirname(full),name)));
     return require(name);
   }
   req.main=main;
   const run=new vm.Script('(function(require,module,exports,__filename,__dirname,process){'+sources[rel].replace(/^#![^\n]*\n/,'')+'\n})',{filename:full}).runInThisContext();
   run(req,mod,mod.exports,full,path.dirname(full),{argv:['node',full,...args],env:process.env});return mod.exports;
 }
 return load(entryPath);
}
function currentCLI(script,args){cp.execFileSync(process.execPath,[path.join(ROOT,script),...args],{cwd:ROOT,env:{...process.env,NBA_REVIEW_OUTPUT_DIR:directory},stdio:'inherit'})}
const manifest={schema:'nba-chronology-review-v1',generated_at_utc:new Date().toISOString(),baseline_revision:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),
 baseline_source_sha256:Object.fromEntries(Object.entries(sources).map(([p,s])=>[p,hash(s)])),
 input_sha256:{},methodology:'Paired replays use identical frozen raw-derived inputs and seeds. Source generation, inspected samples and conservative availability are methodological changes, not evidence of improved skill.',
 limitations:['Raw rows are privately frozen in /tmp, not redistributed; exact derived replay inputs are preserved.', 'Legacy regeneration is not identical to every published feature row; compare paired replay and original publication separately.', 'No automatic model promotion or overwriting of published reports.']};
for(const folder of ['inputs','legacy-replay-inputs'])for(const name of fs.readdirSync(path.join(ROOT,'research-reviews/chronology-v1',folder)))manifest.input_sha256[folder+'/'+name]=hash(fs.readFileSync(path.join(ROOT,'research-reviews/chronology-v1',folder,name)));
if(stage==='all'||stage==='historical'){
 console.log('Paired V6 historical replay, 1,000 simulations / game');
 if(!fs.existsSync(path.join(directory,'legacy-historical-model-report.json')))legacy('scripts/historical_backtest.cjs',['--simulations','1000','--bootstrap','1000','--output',path.join(directory,'legacy-historical-model-report.json')]);
 if(!fs.existsSync(path.join(directory,'corrected-historical-model-report.json')))currentCLI('scripts/historical_backtest.cjs',['--simulations','1000','--bootstrap','1000','--output',path.join(directory,'corrected-historical-model-report.json')]);
}
if(stage==='all'||stage==='v7'){
 console.log('Paired V7 replay, 300 simulations / game');
 if(!fs.existsSync(path.join(directory,'legacy-v7-model-report.json')))legacy('scripts/v7_backtest.cjs',['--simulations','300','--bootstrap','800','--output',path.join(directory,'legacy-v7-model-report.json')]);
 if(!fs.existsSync(path.join(directory,'corrected-v7-model-report.json')))currentCLI('scripts/v7_backtest.cjs',['--simulations','300','--bootstrap','800','--output',path.join(directory,'corrected-v7-model-report.json')]);
}
if(stage==='all'||stage==='five'){
 console.log('Paired six-model replay, 400 simulations / game');
 if(!fs.existsSync(path.join(directory,'legacy-five-model-report.json')))legacy('scripts/five_model_challenge.cjs',[path.join(directory,'legacy-five-model-report.json'),'--simulations=400']);
 if(!fs.existsSync(path.join(directory,'corrected-five-model-report.json')))write('corrected-five-model-report.json',require('./five_model_challenge.cjs').generateReport({simulations:400}));
}
if(stage!=='all'&&stage!=='compare')process.exit(0);
const get=name=>JSON.parse(fs.readFileSync(path.join(directory,name)));
const delta=(a,b)=>Object.fromEntries(['accuracy','brier','logLoss','ece','scoreMAE'].map(k=>[k,Number.isFinite(a[k])&&Number.isFinite(b[k])?b[k]-a[k]:null]));
const comparisons={};
for(const family of ['historical','v7','five']){
 const stem=family==='five'?'five-model-report.json':family+'-model-report.json';
 const before=get('legacy-'+stem),after=get('corrected-'+stem),published=JSON.parse(fs.readFileSync(path.join(ROOT,'data',stem)));
 comparisons[family]={};
 for(const id of Object.keys(after.models)){
   const select=x=>family==='historical'?x.models[id].by_split.test:family==='v7'?x.models[id].rolling_origin:x.models[id].common;
   comparisons[family][id]={published:select(published),paired_legacy:select(before),corrected:select(after),corrected_minus_paired_legacy:delta(select(before),select(after))};
 }
}
manifest.corrected_source_sha256=Object.fromEntries([...baselineFiles,'build_v7_intelligence.py','historical_chronology.py','scripts/research_io.cjs'].map(p=>[p,hash(fs.readFileSync(path.join(ROOT,p)))]));
write('comparison.json',{...manifest,comparisons});
console.log('Saved exclusive review artifacts to '+directory);

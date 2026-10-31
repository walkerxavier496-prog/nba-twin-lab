'use strict';
// Historical evidence stays in data/. Corrected inputs and evaluations live in
// a separate, append-only review namespace; they are never live promotions.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const ROOT=path.join(__dirname,'..');
const INPUT=process.env.NBA_REVIEW_DATA_DIR||path.join(ROOT,'research-reviews/chronology-v1/inputs');
function inputPath(name){
 for(const p of [path.join(INPUT,name),path.join(INPUT,name+'.gz'),path.join(ROOT,'data',name)])if(fs.existsSync(p))return p;
 throw Error('Missing research input '+name);
}
function read(name){
 const p=inputPath(name),b=fs.readFileSync(p),data=JSON.parse(p.endsWith('.gz')?zlib.gunzipSync(b):b.toString('utf8'));
 const proofPath=path.join(INPUT,'result-availability.json');
 if((name==='games.json'||name==='historical-games.json')&&fs.existsSync(proofPath)){
  const A=require('./audit-core.cjs'),proof=JSON.parse(fs.readFileSync(proofPath));
  if(!A.verifyIntegrity(proof))throw Error('Invalid availability evidence');
  data.games=data.games.map(g=>{
   const e=proof.games[String(g.id)];
   return e&&e.homeScore===g.homeScore&&e.awayScore===g.awayScore&&Date.parse(e.date)===Date.parse(g.date)?{...g,...e}:g;
  });
 }
 return data;
}
function requireChronology(data){if(data?.chronology_policy!=='result-availability-v1')throw Error('Legacy historical features are not chronology-certified; rebuild review inputs first');return data}
function trainingRows(rows,season){
 const E=require('../predict/engine.js');
 const cutoff=Math.min(...rows.filter(r=>r.season===season).map(r=>Date.parse(r.date)));
 return rows.filter(r=>r.season<season&&(r.outcomeAvailableAt??E.resultAvailability({date:r.date}))<cutoff);
}
function outputPath(name){return path.join(process.env.NBA_REVIEW_OUTPUT_DIR||path.join(ROOT,'research-reviews/chronology-v1/runs',new Date().toISOString().replace(/[:.]/g,'-')),name)}
function write(name,data,explicit){
 const out=path.resolve(explicit||outputPath(name));
 if(!out.startsWith(path.join(ROOT,'research-reviews')+path.sep)&&!out.startsWith('/private/tmp/')&&!out.startsWith('/tmp/'))throw Error('Historical reports must be written to a separate review path');
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(data),{flag:'wx'});return out;
}
module.exports={read,inputPath,requireChronology,write,outputPath,trainingRows};

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
async function page(search,view='c3-lab'){
 const markup={innerHTML:''},select={};const document={readyState:'complete',getElementById:id=>id===view?markup:id==='c3-game-select'?select:null,querySelectorAll:()=>[]};
 const fetch=async url=>{try{const file=path.resolve(root,url.replace(/^\.\.\//,''));return {ok:true,json:async()=>JSON.parse(fs.readFileSync(file,'utf8'))};}catch{return {ok:false,status:404};}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/concept3-hub.js'),'utf8'),{window:{},document,location:{search},fetch,URLSearchParams,Date,Intl,console});
 await new Promise(r=>setTimeout(r,40));return markup.innerHTML;
}
test('an archived game URL loads its own lock and verified final rather than the latest slate',async()=>{
 const html=await page('?game=401909277');assert.match(html,/79/);assert.match(html,/95/);assert.match(html,/31 Oct/);
});
test('unknown game IDs fail closed instead of silently displaying another matchup',async()=>{
 assert.match(await page('?game=999999999999'),/unavailable/i);
});
test('explicit Melbourne archive date selects the requested saved daily slate',async()=>{
 const html=await page('?date=2026-10-31','c3-slate');assert.match(html,/2026-10-31/);assert.doesNotMatch(html,/2026-11-03/);
});

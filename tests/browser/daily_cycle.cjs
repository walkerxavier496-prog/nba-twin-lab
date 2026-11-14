'use strict';
// Offline browser smoke test. No live/provider requests, writes only screenshots.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_CORE||'playwright-core');
const ROOT=path.join(__dirname,'../..');
const OUT=process.env.ACCEPTANCE_OUT||path.join(ROOT,'../../browser-preview');
async function main(){
 const server=http.createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(ROOT,'.'+(name.endsWith('/')?name+'index.html':name));
  if(!file.startsWith(ROOT+path.sep)){res.writeHead(403).end();return;}
  try {res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));}
  catch{res.writeHead(404).end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;
 let browser;
 try {
  browser=await chromium.launch({executablePath:process.env.CHROME,headless:true});
  fs.mkdirSync(OUT,{recursive:true});
  for(const width of [1440,390]){
   const page=await browser.newPage({viewport:{width,height:900}});
   await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
   for(const [label,url] of [['home','/'],['daily','/challenge/daily.html'],['audit','/audit/']]){
    await page.goto(origin+url,{waitUntil:'networkidle'});
    const panel=page.locator('#daily-cycle');await panel.getByText('THE DAILY CYCLE.',{exact:true}).waitFor();
    assert.match(await panel.innerText(),/unavailable/);
    assert.match(await panel.innerText(),/separate records/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${label} overflow at ${width}`);
    await panel.screenshot({path:path.join(OUT,`${label}-${width}.png`)});
    console.log(`${label} ${width}: honest unavailable state; no horizontal overflow`);
    // Synthetic populated fixture for real-browser layout and content verification.
    const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Melbourne',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const report={status:'complete',reviewed_games:1,expected_games:1,models:{production_elo_v7:{count:1,accuracy:1,brier:.09,log_loss:.36,score_mae_per_team:5,confidence_gap:-.3,confidence_assessment:'insufficient_sample'}},findings:[{game_id:'123456789',matchup:'NYK @ BOS',correct:true,brier:.09,confidence:.7,observation:'Observed result only; no causal inference.'}]};
    const payload={schema:'courthesis-daily-cycle-v1',preview:true,date,checked_at_utc:new Date().toISOString(),publication:{status:'published'},days:[{date,published_at_utc:new Date().toISOString(),snapshot_path:'audit/morning/'+date+'/initial.json',report_path:'audit/morning/'+date+'/critique.json',report,forecasts:[{game_id:'123456789',tip_utc:new Date().toISOString(),away:'NYK',home:'BOS',home_win_probability:.7,projected_score:{home:113,away:108},model_comparisons:[{id:'production_elo_v7',label:'Production Elo',home_win_probability:.7,status:'production'}],player_projections:[{name:"Preview Player",team:"BOS",projection_if_play:{pts:20,reb:5,ast:4}}],result:{status:"verified_final",home:113,away:108}}]}],locked:[{date,report,report_path:'audit/critiques/'+date+'/locked.json'}]};
    payload.days.push({date:'2020-01-01',published_at_utc:'2020-01-01T00:00:00Z',snapshot_path:'audit/morning/2020-01-01/initial.json',report_path:'audit/morning/2020-01-01/critique.json',report:{status:'pending',reviewed_games:0,expected_games:1,models:{}},forecasts:[]});
    await page.route('**/data/daily-cycle.json',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)}));
    // Marked fixtures must be rejected during ordinary browsing, even locally.
    await page.goto(origin+url,{waitUntil:'networkidle'});
    await panel.getByText('Daily publication data is unavailable.',{exact:false}).waitFor();
    assert.equal(await panel.locator('.cycle-game').count(),0);
    await page.goto(origin+url+'?preview=synthetic',{waitUntil:'networkidle'});
    await panel.getByText('Initial predicted winner').waitFor();
    await panel.locator('.cycle-report').first().evaluate(el=>{el.open=true;});
    assert.match(await panel.innerText(),/Projected score: NYK 108 – BOS 113/);
    assert.match(await panel.innerText(),/Verified final: NYK 108 – BOS 113/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,label+' populated overflow at '+width);
    // Isolated panel captures hide fixed site chrome to avoid stitching it
    // through a tall mobile panel; full-page/viewport captures retain it.
    await panel.screenshot({path:path.join(OUT,label+'-populated-'+width+'.png'),style:'.app-header,.site-skip,.site-bottom-nav{visibility:hidden!important}'});
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:path.join(OUT,label+'-full-page-'+width+'.png'),fullPage:true});
    assert.match(await panel.innerText(),/SYNTHETIC TEST DATA/);
    assert.equal(await panel.locator('#cycle-date').inputValue(),date);
    if(label!=='home')assert.match(await panel.innerText(),/Model performance|Production Elo|production_elo_v7/);
    await panel.getByRole('button',{name:'Verified results',exact:true}).click();
    assert.equal(await panel.getByRole('button',{name:'Verified results',exact:true}).getAttribute('aria-pressed'),'true');
    assert.match(await panel.innerText(),/Verified final: NYK 108/);
    await panel.getByRole('button',{name:'Predictions',exact:true}).click();
    await panel.getByText('Model comparison (1)',{exact:true}).click();
    assert.match(await panel.locator('.cycle-comparisons').innerText(),/70.0% home/);
    await panel.getByText('Conditional player projections (1)',{exact:true}).click();
    assert.match(await panel.locator('.cycle-projections').first().innerText(),/Preview Player/);
    await panel.getByRole('button',{name:'Refresh results',exact:true}).click();
    await panel.getByText('Initial predicted winner',{exact:true}).waitFor();
    await panel.locator('#cycle-date').selectOption('2020-01-01');
    assert.match(await panel.innerText(),/Archived morning snapshot from 2020-01-01/);
    await panel.screenshot({path:path.join(OUT,label+'-archive-'+width+'.png')});
    await page.unroute('**/data/daily-cycle.json');
    if(label==='audit'){
     const M=require('../../scripts/morning_cycle.cjs');
     const ledger=JSON.parse(fs.readFileSync(path.join(ROOT,'data/audit-ledger.json'),'utf8'));
     const records=ledger.entries.map(entry=>({entry,review:entry.review_path?JSON.parse(fs.readFileSync(path.join(ROOT,entry.review_path),'utf8')):null}));
     const history={schema:'courthesis-daily-cycle-v1',preview:true,preview_kind:'historical',date,checked_at_utc:new Date().toISOString(),publication:{status:'not_due'},days:[],locked:M.lockedDays(ROOT,records),recurring:M.recurringReports(ROOT,records)};
     await page.route('**/data/daily-cycle.json',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(history)}));
     await page.goto(origin+url+'?preview=synthetic',{waitUntil:'networkidle'});
     await panel.locator('#cycle-date').selectOption(history.locked.at(-1).date);
     await panel.locator('.cycle-report').first().evaluate(el=>{el.open=true;});
     assert.match(await panel.innerText(),/LOCAL PREVIEW · VERIFIED HISTORICAL RECORDS/);
     assert.match(await panel.innerText(),/Individual predictions and score errors/);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'real archive overflow');
     await panel.screenshot({path:path.join(OUT,'audit-verified-history-'+width+'.png'),style:'.app-header,.site-skip,.site-bottom-nav{visibility:hidden!important}'});
     await page.unroute('**/data/daily-cycle.json');
    }

   }
   await page.close();
  }
 } finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

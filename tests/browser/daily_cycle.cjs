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
   }
   await page.close();
  }
 } finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

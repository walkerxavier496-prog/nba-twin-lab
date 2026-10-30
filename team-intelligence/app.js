/* Descriptive pregame basketball intelligence; does not issue unvalidated picks. */
(()=>{'use strict';
const S=window.TwinScience,$=id=>document.getElementById(id);
const alias={GS:'GSW',NY:'NYK',SA:'SAS',NO:'NOP',UTAH:'UTA',WSH:'WAS',PHO:'PHX',BRK:'BKN',CHO:'CHA'};
const canonical=x=>alias[x]||x;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=x=>x===null||x===undefined||x===''?null:Number.isFinite(Number(x))?Number(x):null;
const fmt=(x,d=1)=>x===null||!Number.isFinite(x)?'—':x.toFixed(d);
const pct=x=>x===null||!Number.isFinite(x)?'—':(x*100).toFixed(1)+'%';
const sign=x=>x>0?'+':'';
let teams=new Map(),games=[],snapshot=null;
async function get(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('Source unavailable: '+url);return r.json();}
function options(){
 const list=[...teams.keys()].sort();
 const html=list.map(abbr=>'<option value="'+esc(abbr)+'">'+esc(abbr)+'</option>').join('');
 $('home').innerHTML=html;$('away').innerHTML=html;
 $('home').value=list.includes('BOS')?'BOS':list[0];
 $('away').value=list.includes('NYK')?'NYK':list[1];
 const now=Date.now();
 const scheduled=games.filter(g=>g.status==='scheduled'&&Date.parse(g.date)>=now-15*60000&&Date.parse(g.date)<now+14*86400000&&teams.has(canonical(g.home.abbr))&&teams.has(canonical(g.away.abbr))).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
 $('fixture').innerHTML='<option value="">Manual team comparison</option>'+scheduled.map(g=>'<option value="'+esc(g.id)+'">'+esc(new Date(g.date).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric'}))+' · '+esc(g.away.abbr)+' @ '+esc(g.home.abbr)+'</option>').join('');
 if(scheduled.length){$('fixture').value=String(scheduled[0].id);$('home').value=canonical(scheduled[0].home.abbr);$('away').value=canonical(scheduled[0].away.abbr);}
}
function metric(label,detail,h,a,format=fmt){
 return '<tr><td>'+esc(label)+(detail?'<small>'+esc(detail)+'</small>':'')+'</td><td>'+format(h)+'</td><td>'+format(a)+'</td></tr>';
}
function headToHead(home,away,asOf){
 const h=canonical(home),a=canonical(away),season=new Date(asOf).getUTCFullYear()+(new Date(asOf).getUTCMonth()>=6?1:0);
 const meetings=games.filter(g=>g.status==='final'&&Date.parse(g.date)<Date.parse(asOf)&&g.season>=season-2&&
  [canonical(g.home.abbr),canonical(g.away.abbr)].sort().join('|')===[h,a].sort().join('|')).sort((x,y)=>Date.parse(y.date)-Date.parse(x.date)).slice(0,8);
 const wins=meetings.filter(g=>canonical(g.home.abbr)===h?g.homeScore>g.awayScore:g.awayScore>g.homeScore).length;
 return meetings.length?home+' won '+wins+' of the last '+meetings.length+' prior meetings in the past two seasons. This is descriptive and not an extra rivalry bonus.':'No verified recent head-to-head meetings in the available dataset.';
}
function draw(){
 const home=teams.get($('home').value),away=teams.get($('away').value);
 if(!home||!away||home.abbr===away.abbr){$('metrics').innerHTML='<tr><td colspan="3">Select two different teams.</td></tr>';$('factors').innerHTML='';return;}
 $('home-name').textContent=home.abbr;$('away-name').textContent=away.abbr;
 const bl=(s,k)=>S.blended(s,k);
 const net=s=>{const o=bl(s,'adj_ortg'),d=bl(s,'adj_drtg');return o===null||d===null?null:o-d;};
 const last=s=>S.net(s,'last5'),season=s=>S.net(s,'season');
 const rows=[
  metric('Adjusted offensive rating','Higher is better',bl(home,'adj_ortg'),bl(away,'adj_ortg')),
  metric('Adjusted defensive rating','Lower is better',bl(home,'adj_drtg'),bl(away,'adj_drtg')),
  metric('Adjusted net rating','Offense minus defense',net(home),net(away)),
  metric('Last-five adjusted net','Recent opponents accounted for',last(home),last(away)),
  metric('Recent efficiency change','Last-five net minus season net; descriptive only',last(home)===null||season(home)===null?null:last(home)-season(home),last(away)===null||season(away)===null?null:last(away)-season(away),x=>x===null?'—':sign(x)+fmt(x)),
  metric('Possessions per game','Pace, not a direct advantage',bl(home,'pace'),bl(away,'pace')),
  metric('Effective field-goal %','Accounts for three-point value',bl(home,'efg'),bl(away,'efg'),pct),
  metric('Three-point attempt share','3PA / total field-goal attempts',bl(home,'three_rate'),bl(away,'three_rate'),pct),
  metric('Three-point accuracy','Three-pointers made / attempted',bl(home,'three_pct'),bl(away,'three_pct'),pct),
  metric('Turnover rate','Lower usually better',bl(home,'tov_rate'),bl(away,'tov_rate'),pct),
  metric('Offensive rebound rate','Share of available offensive rebounds',bl(home,'orb_rate'),bl(away,'orb_rate'),pct),
  metric('Free-throw rate','Free-throw attempts per field-goal attempt',bl(home,'ftr'),bl(away,'ftr'),x=>x===null?'—':fmt(x,3))
 ];
 $('metrics').innerHTML=rows.join('');
 const a=S.matchup(home,away),b=S.matchup(away,home);
 const factors=[
  ['Shooting efficiency','Combines each offense’s eFG% with the opponent’s eFG% allowed.','shooting',pct],
  ['Three-point shot profile','Combines each offense’s 3PA share and accuracy with the opponent’s 3PA share allowed.','threePointStyle',x=>fmt(x,3)],
  ['Turnover pressure','Combines ball-security tendency with opponent turnover-forcing rate.','turnovers',x=>fmt(-x*100,1)+'%'],
  ['Offensive glass','Expected offensive rebound opportunity from own ORB and opponent defensive rebounding.','rebounding',pct],
  ['Free-throw opportunities','Own free-throw rate paired with opponent free throws allowed.','freeThrows',x=>fmt(x,3)]
 ];
 $('factors').innerHTML=factors.map(([title,desc,key,format])=>
  '<article><strong>'+title+'</strong><p>'+desc+'</p><span>'+esc(home.abbr)+': '+format(a[key])+' · '+esc(away.abbr)+': '+format(b[key])+'</span></article>').join('');
 const g=games.find(g=>String(g.id)===$('fixture').value);
 const asOf=g?.date||new Date().toISOString();
 $('h2h').textContent=headToHead(home.abbr,away.abbr,asOf);
 $('source').textContent='Team snapshots as of '+snapshot.teams[0].as_of+' · '+home.games+' / '+away.games+' current-season games · no confirmed lineups';
}
$('fixture').addEventListener('change',()=>{
 const g=games.find(g=>String(g.id)===$('fixture').value);
 if(g){$('home').value=canonical(g.home.abbr);$('away').value=canonical(g.away.abbr);}
 draw();
});
for(const id of ['home','away'])$(id).addEventListener('change',()=>{$('fixture').value='';draw();});
Promise.all([get('../data/v7-current.json'),get('../data/games.json')]).then(([snap,results])=>{
 if(!S||!snap.strict_no_future_data||snap.coverage?.season!==2027||snap.teams.length!==30)throw Error('Verified team snapshot is missing or incomplete');
 snapshot=snap;games=results.games||[];
 for(const t of snap.teams)teams.set(canonical(t.abbr),t);
 const age=(Date.now()-Date.parse(snap.built_at_utc))/3600000;
 if(!Number.isFinite(age)||age< -1)throw Error('Invalid snapshot timestamp');
 const stale=age>72;
 $('status').textContent='Team data '+new Date(snap.built_at_utc).toLocaleString()+(stale?' · Snapshot is over 72 hours old; comparisons are historical, not live.':' · Historical profiles ready. No live model changes.');
 if(stale)$('status').classList.add('warning');
 options();draw();
}).catch(e=>{$('status').textContent='Team Intelligence unavailable: '+e.message;$('status').classList.add('warning');$('metrics').innerHTML='<tr><td colspan="3">Verified data required. No estimates fabricated.</td></tr>';});
})();
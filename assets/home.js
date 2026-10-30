(()=>{'use strict';
const nodes={games:document.getElementById('home-locked'),backtest:document.getElementById('home-backtest'),date:document.getElementById('home-date')};
const show=(id,value)=>{if(nodes[id])nodes[id].textContent=value};
Promise.allSettled([
 fetch('./data/audit-ledger.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('No audit');return r.json()}),
 fetch('./data/five-model-report.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('No report');return r.json()})
]).then(([ledger,report])=>{
 if(ledger.status==='fulfilled'&&Array.isArray(ledger.value.entries)){
  const entries=ledger.value.entries.filter(e=>e.lock_path);
  show('games',String(entries.length));
  if(entries.length)show('date',entries.map(e=>e.melbourne_date).sort().at(-1));
 }
 if(report.status==='fulfilled'&&Number.isFinite(report.value.common_evaluation?.games))show('backtest',report.value.common_evaluation.games.toLocaleString('en-AU')+' games');
});
})();
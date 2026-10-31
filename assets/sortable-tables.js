/* Twin Lab sortable data surfaces — progressive enhancement.
 * One lightweight utility for static and dynamically rendered comparison tables.
 * Does not modify underlying model statistics or archived prediction data.
 */
(()=>{'use strict';
function keyOf(raw){
 const s=String(raw??'').trim().replace(/,/g,'').replace(/%$/,'').replace(/\u2212/g,'-');
 if(!s||/^(—|–|-|n\/a|na|unavailable|pending|null)$/i.test(s))return null;
 const m=s.match(/^([+-]?\d+(?:\.\d+)?)(?:\s*(?:PTS|REB|AST|%|PPG|FPTS|games?|pts))?$/i);
 return m?Number(m[1]):s.toLowerCase();
}
function compare(a,b,dir=1){
 const va=keyOf(a),vb=keyOf(b);
 if(va===null)return vb===null?0:1;if(vb===null)return -1;
 if(typeof va==='number'&&typeof vb==='number')return (va-vb)*dir;
 return String(va).localeCompare(String(vb),undefined,{numeric:true,sensitivity:'base'})*dir;
}
function sortData(rows,key,desc=true){
 return rows.slice().sort((a,b)=>compare(a[key],b[key],desc?-1:1));
}
function sortable(table){
 if(!table||table.hasAttribute?.('data-no-sort')||table.dataset?.twinSortReady==='true')return false;
 const thead=table.tHead,head=thead?.rows?.[thead.rows.length-1];
 const body=table.tBodies?.[0];
 if(!head||!body||head.cells.length<2)return false;
 // A native interactive per-column sorting system already exists on game boxes.
 if(thead.querySelector?.('[data-game-sort],[data-stat-sort],button'))return false;
 const headers=[...head.cells];
 if(headers.some(c=>c.colSpan>1||c.rowSpan>1))return false;
 table.dataset.twinSortReady='true';
 table.classList?.add('twin-sortable');
 headers.forEach((cell,i)=>{
  if(cell.getAttribute('data-no-sort')==='true')return;
  const existing=cell.textContent.trim();
  if(!existing)return;
  const b=document.createElement('button');
  b.type='button';b.className='twin-sort-head';b.dataset.twinColumn=String(i);
  b.setAttribute('aria-label','Sort by '+existing);
  b.textContent=existing+' ⇅';
  cell.textContent='';cell.appendChild(b);
  cell.setAttribute('aria-sort','none');
 });
 return true;
}
function sortColumn(table,col){
 const body=table.tBodies?.[0],head=table.tHead?.rows?.[table.tHead.rows.length-1];
 if(!body||!head)return;
 const rows=[...body.rows];
 if(rows.length<2||rows.some(row=>row.cells.length<=col||[...row.cells].some(c=>c.colSpan>1)))return;
 const oldCol=table.dataset.sortColumn,oldDir=table.dataset.sortDir;
 const dir=oldCol===String(col)&&oldDir==='asc'?'desc':'asc';
 const indexed=rows.map((row,index)=>({row,index,value:row.cells[col].dataset?.sortValue??row.cells[col].textContent.trim()}));
 indexed.sort((a,b)=>compare(a.value,b.value,dir==='asc'?1:-1)||a.index-b.index);
 const frag=document.createDocumentFragment();
 indexed.forEach(item=>frag.appendChild(item.row));body.appendChild(frag);
 table.dataset.sortColumn=String(col);table.dataset.sortDir=dir;
 [...head.cells].forEach((cell,i)=>{
  cell.setAttribute('aria-sort',i===col?(dir==='asc'?'ascending':'descending'):'none');
  const button=cell.querySelector?.('.twin-sort-head');
  if(button)button.textContent=button.textContent.replace(/ [↑↓⇅]$/,'')+' '+(i===col?(dir==='asc'?'↑':'↓'):'⇅');
 });
}
function scan(root=document){
 for(const table of root.querySelectorAll?.('table')||[])sortable(table);
}
function start(){
 scan();
 document.addEventListener('click',e=>{
  const button=e.target.closest?.('.twin-sort-head');
  if(!button)return;
  const table=button.closest('table');if(table)sortColumn(table,Number(button.dataset.twinColumn));
 });
 if(typeof MutationObserver!=='undefined'){
  let busy=false;
  new MutationObserver(records=>{
   if(busy)return;
   if(!records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1)))return;
   busy=true;try{scan()}finally{busy=false}
  }).observe(document.body,{childList:true,subtree:true});
 }
}
window.TwinSort=Object.freeze({keyOf,compare,sortData,sortColumn,scan});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
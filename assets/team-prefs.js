/* Fan team preference. Visual-only across the website; never changes any
 * game prediction, scoring, model weights or source records.
 */
(()=>{'use strict';
const NAMES=Object.freeze({"ATL":"Atlanta Hawks","BOS":"Boston Celtics","BKN":"Brooklyn Nets","CHA":"Charlotte Hornets","CHI":"Chicago Bulls","CLE":"Cleveland Cavaliers","DAL":"Dallas Mavericks","DEN":"Denver Nuggets","DET":"Detroit Pistons","GS":"Golden State Warriors","HOU":"Houston Rockets","IND":"Indiana Pacers","LAC":"LA Clippers","LAL":"Los Angeles Lakers","MEM":"Memphis Grizzlies","MIA":"Miami Heat","MIL":"Milwaukee Bucks","MIN":"Minnesota Timberwolves","NO":"New Orleans Pelicans","NY":"New York Knicks","OKC":"Oklahoma City Thunder","ORL":"Orlando Magic","PHI":"Philadelphia 76ers","PHX":"Phoenix Suns","POR":"Portland Trail Blazers","SAC":"Sacramento Kings","SA":"San Antonio Spurs","TOR":"Toronto Raptors","UTAH":"Utah Jazz","WSH":"Washington Wizards"});
const COLOURS=Object.freeze({"ATL":"#fa666f","BOS":"#44da95","BKN":"#e9edf2","CHA":"#51d5df","CHI":"#ff6176","CLE":"#efb386","DAL":"#61afff","DEN":"#f7c966","DET":"#fa7777","GS":"#ffcc56","HOU":"#ff6872","IND":"#f6ca6b","LAC":"#ff7284","LAL":"#c8a4ff","MEM":"#93b5ff","MIA":"#ff7280","MIL":"#93c9a0","MIN":"#8fb7da","NO":"#e5c898","NY":"#ffab67","OKC":"#ffad66","ORL":"#66aaf6","PHI":"#7dbaff","PHX":"#d4a7ff","POR":"#fc727b","SAC":"#bda0ef","SA":"#c1d3d9","TOR":"#ff6b77","UTAH":"#aab4f8","WSH":"#8cb3ea"});
const KEY='nba-twin-lab:my-team:v1';
const ALIAS=Object.freeze({GSW:'GS',NYK:'NY',SAS:'SA',NOP:'NO',UTA:'UTAH',WAS:'WSH',PHO:'PHX',BRK:'BKN',CHO:'CHA'});
const canonical=x=>{const key=String(x||'').toUpperCase();return ALIAS[key]||key};
const valid=x=>Object.hasOwn(NAMES,canonical(x));
const read=()=>{try{const value=localStorage.getItem(KEY);return valid(value)?canonical(value):''}catch(e){return ''}};
let current=read();
function apply(team,persist=true){
 const next=valid(team)?canonical(team):'';
 current=next;
 if(persist){try{if(next)localStorage.setItem(KEY,next);else localStorage.removeItem(KEY)}catch(e){}}
 const root=document.documentElement;
 root.style.setProperty('--fan-accent',next?COLOURS[next]:'#c6dbff');
 root.dataset.fanTeam=next||'none';
 const selector=document.getElementById('fan-team-picker');if(selector)selector.value=next;
 const label=document.getElementById('fan-team-label');if(label)label.textContent=next?NAMES[next]:'Neutral theme';
 document.dispatchEvent(new CustomEvent('twinlab:teamchange',{detail:{team:next,name:NAMES[next]||'',accent:COLOURS[next]||'#c6dbff'}}));
 return next;
}
function render(){
 const head=document.querySelector('.app-header .header-inner');
 if(!head||document.getElementById('fan-team-picker'))return;
 const group=document.createElement('div');group.className='fan-picker';
 const label=document.createElement('label');label.htmlFor='fan-team-picker';label.textContent='YOUR TEAM';
 const select=document.createElement('select');select.id='fan-team-picker';select.setAttribute('aria-label','Choose your favourite NBA team for site accent');
 const opts=[['','No team preference'],...Object.keys(NAMES).sort((a,b)=>NAMES[a].localeCompare(NAMES[b])).map(k=>[k,NAMES[k]])];
 for(const [abbr,name]of opts){const opt=document.createElement('option');opt.value=abbr;opt.textContent=name;select.append(opt)}
 select.value=current;select.addEventListener('change',()=>apply(select.value));
 group.append(label,select);
 const before=head.querySelector('.header-action');
 if(before)head.insertBefore(group,before);else head.append(group);
}
window.TwinTeamPrefs=Object.freeze({get:()=>current,set:apply,canonical,names:NAMES,accent:COLOURS});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{render();apply(current,false)},{once:true});
else{render();apply(current,false)}
})();
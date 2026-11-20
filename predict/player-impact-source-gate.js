/* Strict pre-tip lineup-stint input validation; research only.
 * This is a data-quality gate, not a source fetcher. */
'use strict';
const validTime=t=>typeof t==='string'&&/(?:Z|[+-]\d{2}:\d{2})$/.test(t)&&Number.isFinite(Date.parse(t));
const fail=reason=>({ready:false,reason});
function validate({as_of_utc,source,observations,priors}={}){
 if(!validTime(as_of_utc))return fail('Invalid as-of timestamp');
 const cutoff=Date.parse(as_of_utc);
 if(!source||!/^https:\/\//.test(source.url||'')||!source.provider||!source.dataset_version||!source.retrieved_at_utc)
  return fail('Missing source provider, HTTPS URL, dataset version or retrieval timestamp');
 if(!validTime(source.retrieved_at_utc)||Date.parse(source.retrieved_at_utc)>cutoff)
  return fail('Source retrieval was after the prediction cutoff');
 if(!Array.isArray(observations)||!observations.length||!Array.isArray(priors)||!priors.length)
  return fail('Missing observations or player priors');
 const ids=new Set();
 for(const p of priors){
  const id=String(p.player_id||'');
  if(!/^\d+$/.test(id)||ids.has(id))return fail('Invalid or duplicate player identity');
  ids.add(id);
  if(typeof p.box_prior!=='number'||!Number.isFinite(p.box_prior)||!validTime(p.available_at_utc)||Date.parse(p.available_at_utc)>=cutoff)
   return fail('Player prior is missing or post-cutoff');
 }
 const games=new Set();
 for(const o of observations){
  if(!/^\d+$/.test(String(o.game_id||''))||!o.stint_id||!validTime(o.ended_at_utc)||!validTime(o.available_at_utc))
   return fail('Missing game/stint identity or timestamp');
  if(Date.parse(o.ended_at_utc)>=cutoff||Date.parse(o.available_at_utc)>=cutoff||Date.parse(o.available_at_utc)<Date.parse(o.ended_at_utc))
   return fail('Stint not verifiably available pre-tip');
  if(!Number.isFinite(o.possessions)||o.possessions<=0||!Number.isFinite(o.margin_per_100))
   return fail('Invalid stint possessions or scoring margin');
  const all=[...(o.home_player_ids||[]),...(o.away_player_ids||[])].map(String);
  if(o.home_player_ids?.length!==5||o.away_player_ids?.length!==5||new Set(all).size!==10||all.some(id=>!ids.has(id)))
   return fail('Stint requires ten distinct known player IDs');
  const key=o.game_id+':'+o.stint_id;
  if(games.has(key))return fail('Duplicate game/stint identity');
  games.add(key);
 }
 return {ready:true,observations:observations.length,players:ids.size,source:source.provider,
  limitation:'Source identity and timestamp fields are structurally validated, not independently authenticated'};
}
module.exports={validate};

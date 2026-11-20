/* Research-only safe entrypoint: provenance gate before fitting.
 * Requires unique real stints from at least two games; no data fetching. */
'use strict';
const {validate}=require('./player-impact-source-gate.js');
const {estimate}=require('./regularized-player-impact.js');
function fitVerified(input){
 const gate=validate(input);
 if(!gate.ready)return {available:false,validated_probability:false,reason:gate.reason};
 const gameCount=new Set(input.observations.map(o=>String(o.game_id))).size;
 if(gameCount<2)return {available:false,validated_probability:false,reason:'Need observations from at least two distinct games'};
 const result=estimate(input);
 if(!result.available)return result;
 return {...result,source_metadata:{...input.source},games_used:gameCount,
  warning:'Source metadata structurally checked only. Historical availability and source authenticity must be independently audited before publishing player estimates.'};
}
module.exports={fitVerified};

/* Per-journey progression. Saved data is validated at the boundary. */
(function(root){
'use strict';
const entries=Object.freeze([
 Object.freeze({id:'arrival',title:'没有送出的信',subtitle:'Ⅰ · 流放者的残响',text:'母亲说，钟声会替远行的人指路。我在门外等了七夜，只听见雨。若你也在寻找回家的路，别把最后一瓶火留到天亮。',reward:'恢复一口余烬之瓶'}),
 Object.freeze({id:'chapel',title:'守火人的祷词',subtitle:'Ⅱ · 小堂的残响',text:'我们留下火，不是为了让人永远守在这里。选一份祝福，走出门去。倘若有一天钟声响起，便不必再回来替我们添柴。',reward:'恢复一口余烬之瓶'}),
 Object.freeze({id:'warden',title:'无冠者的誓言',subtitle:'Ⅲ · 最后的守望',text:'王冠已经空了，城门仍须有人看守。他记得命令，却不再记得下令的人。钟绳就在身后；等这把剑终于放下，请替他结束漫长的一夜。',reward:'恢复一口余烬之瓶'})
]);
const relics=Object.freeze({
 ember:Object.freeze({id:'ember',name:'余火之心',maxHp:145,maxStamina:100,damage:1,description:'生命上限 +25'}),
 wind:Object.freeze({id:'wind',name:'逐风之印',maxHp:120,maxStamina:125,damage:1,description:'耐力上限 +25'}),
 edge:Object.freeze({id:'edge',name:'断誓之刃',maxHp:120,maxStamina:100,damage:1.15,description:'剑刃伤害 +15%'})
});
const normal=Object.freeze({id:null,name:'尚未受赐福',maxHp:120,maxStamina:100,damage:1});
const fields=['parries','rolls','executions','damageTaken','damageDealt','deaths','heals','kills'];
const validNumber=v=>Number.isFinite(v)&&v>=0?Math.min(1e7,v):0;
function create(initial){
 let state;
 function restore(data){
  const source=data&&typeof data==='object'?data:{};
  state={version:12,relic:Object.hasOwn(relics,source.relic)?source.relic:null,memories:entries.filter(e=>Array.isArray(source.memories)&&source.memories.includes(e.id)).map(e=>e.id),stats:{},time:validNumber(source.time)};
  for(const key of fields)state.stats[key]=validNumber(source.stats?.[key]);
 }
 restore(initial);
 return {
  restore,
  read(id){const entry=entries.find(e=>e.id===id);if(!entry)return null;const fresh=!state.memories.includes(id);if(fresh)state.memories.push(id);return {...entry,fresh};},
  equip(id){if(!Object.hasOwn(relics,id))return false;state.relic=id;return true;},
  record(event,amount=1){if(fields.includes(event))state.stats[event]+=validNumber(amount);},
  advance(dt){if(Number.isFinite(dt)&&dt>0)state.time+=Math.min(.1,dt);},
  modifiers(){return relics[state.relic]||normal;},
  snapshot(){return {version:12,relic:state.relic,memories:[...state.memories],stats:{...state.stats},time:state.time};},
  get(id){return entries.find(e=>e.id===id)||null;}
 };
}
function checkpoint(data){
 if(!data||typeof data!=='object')return null;
 const active=data.active===true,gate=data.gate===true;
 return {version:12,active,gate,bossDefeated:data.bossDefeated===true,defeated:['sentinel-0','sentinel-1'].filter(id=>Array.isArray(data.defeated)&&data.defeated.includes(id)),journey:create(data.journey).snapshot()};
}
const api={create,entries,relics,checkpoint};root.AshenJourney=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

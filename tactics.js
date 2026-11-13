/* Ashen Vow — readable, deterministic encounter decisions. No render ownership. */
(function(root){
'use strict';
const finite=(n,f=0)=>Number.isFinite(n)?n:f;
const distance=(a,b)=>Math.hypot(finite(a.x)-finite(b.x),finite(a.z)-finite(b.z));
const idle=e=>!e.state||e.state==='idle';
const living=e=>e&&finite(e.hp,1)>0;
const side=e=>String(e.id||'0').endsWith('1')?-1:1;
const plan=(action,dx=0,dz=0,speed=0,extra={})=>({action,dx,dz,speed,...extra});
function direction(a,b){const dx=finite(b.x)-finite(a.x),dz=finite(b.z)-finite(a.z),d=Math.hypot(dx,dz);return {dx:d>.0001?dx/d:0,dz:d>.0001?dz/d:0,distance:d};}

// The player can read a guard's threat instead of being hit by two simultaneous
// windups. The longest-waiting guard IN melee gets the next turn; a distant guard
// never holds an invisible token that would prevent a nearby guard from acting.
function ownsTurn(enemy,player,peers=[]){
 const guards=peers.filter(e=>living(e)&&e.kind!=='boss'&&e.aggro!==false);
 if(!guards.some(e=>e===enemy||e.id===enemy.id))guards.push(enemy);
 if(guards.some(e=>e!==enemy&&e.id!==enemy.id&&e.state==='attack'))return false;
 const candidates=guards.filter(e=>idle(e)&&finite(e.cooldown)<=0&&distance(e,player)<=1.85);
 candidates.sort((a,b)=>(finite(a.lastAttackAt,-1000)-finite(b.lastAttackAt,-1000))||(distance(a,player)-distance(b,player))||String(a.id).localeCompare(String(b.id)));
 return !candidates.length||candidates[0]===enemy||candidates[0].id===enemy.id;
}

function bossChoice(enemy,player,options={}){
 const phase=enemy.phase>=2?2:1,cycle=Math.max(0,Math.floor(finite(enemy.cycle))),d=distance(enemy,player);
 let type,reason;
 // React only after the bottle is visibly raised. This is a readable long
 // thrust, with the normal windup, never a teleport or an instant input punish.
 if(player.state==='heal'&&finite(player.t)>=.32&&d>2.3&&d<4.1){type='thrust';reason='heal-response';}
 else if(options.guarding&&finite(options.guardTime)>=.60&&d<2.8){type='slam';reason='held-guard';}
 else if(d>3.0){type='thrust';reason='spacing';}
 else{type=(phase===2?['sweep','slam','combo','thrust','combo','slam']:['sweep','slam','thrust','sweep','thrust','slam'])[cycle%6];reason='pattern';}
 // Avoid repeating the same neutral move after a spacing response. Explicit
 // guard/heal responses remain consistent so the player can learn the rule.
 if(reason==='pattern'&&type===enemy.lastMoveType)type=type==='sweep'?'slam':'sweep';
 const indices=phase===2?{sweep:0,slam:1,combo:2,thrust:3}:{sweep:0,slam:1,thrust:2};
 return {moveType:type,moveIndex:indices[type],reason,attackDistance:type==='thrust'?3.30:2.48};
}

function decide(enemy,player,peers=[],options={}){
 if(!living(enemy)||!living(player))return plan('hold');
 // Once anticipation begins, all threat ownership and leash rules wait for its
 // authored recovery. A player can reliably bait a committed miss.
 if(!idle(enemy))return plan('hold');
 const towards=direction(enemy,player),d=towards.distance,boss=enemy.kind==='boss';
 const home={x:finite(enemy.spawnX,finite(enemy.x)),z:finite(enemy.spawnZ,finite(enemy.z))};
 const homeDistance=distance(enemy,home),playerFromHome=distance(player,home);
 if(!boss&&(homeDistance>10.0||playerFromHome>13.5||enemy.returning)){
  const back=direction(enemy,home);
  return plan('return',back.dx,back.dz,2.45,{arrived:back.distance<.42,reason:'leash'});
 }
 if(boss){
  const choice=bossChoice(enemy,player,options);
  if(d<=choice.attackDistance&&finite(enemy.cooldown)<=0)return plan('attack',0,0,0,choice);
  if(d>choice.attackDistance+.08){
   const speed=enemy.phase>=2?2.45:1.95;
   return plan('approach',towards.dx,towards.dz,speed,{reason:'close-distance'});
  }
  const sign=(Math.floor(finite(enemy.cycle))%2?1:-1),radial=d<1.72?-.65:d>2.65?.25:0;
  const dx=towards.dx*radial-towards.dz*sign,dz=towards.dz*radial+towards.dx*sign,len=Math.hypot(dx,dz)||1;
  return plan(d<1.72?'retreat':'strafe',dx/len,dz/len,.68,{reason:'recovery-spacing'});
 }
 const attackOwner=ownsTurn(enemy,player,peers),sign=side(enemy);
 if(d<=1.85&&finite(enemy.cooldown)<=0&&attackOwner)return plan('attack',0,0,0,{reason:'initiative'});
 // A supporting guard holds a readable outer ring. It can enter when the
 // first guard finishes, but never crowds the player's hurtbox while waiting.
 const supporting=!attackOwner,desired=supporting?2.65:1.72;
 if(d>desired+.15){
  const blend=supporting&&d<4.0?.30:0;
  const dx=towards.dx-towards.dz*sign*blend,dz=towards.dz+towards.dx*sign*blend,len=Math.hypot(dx,dz)||1;
  return plan('approach',dx/len,dz/len,supporting?1.28:1.92,{reason:supporting?'flank':'close-distance'});
 }
 if(supporting&&d<2.05)return plan('retreat',-towards.dx,-towards.dz,1.08,{reason:'give-space'});
 // Slow lateral footwork while recovering. Direction is stable for an entire
 // attack cycle rather than random jitter at the update rate.
 return plan('strafe',-towards.dz*sign,towards.dx*sign,.56,{reason:supporting?'support':'recovery'});
}

const api={decide,bossChoice,ownsTurn};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AshenTactics=api;
})(typeof window!=='undefined'?window:globalThis);

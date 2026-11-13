(function(root){
'use strict';
const PI=Math.PI,TAU=PI*2;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
function angleDelta(a,b){return ((a-b+PI)%TAU+TAU)%TAU-PI;}

// Every attack uses absolute seconds for both visual motion and damage windows.
// Reach is an animation target, never a substitute for the actual blade sweep.
const LIGHT=[
 {id:'light-0',kind:'light',index:0,pose:'diagonal-right',windup:.18,active:.15,followThrough:.11,recovery:.20,stamina:17,damage:25,poise:22,reach:2.05,lunge:.48,hitstop:.047,cancelAt:.45,guardAt:.48,chainOpen:.34,chainClose:.61,twist:-.70,slash:1},
 {id:'light-1',kind:'light',index:1,pose:'diagonal-left',windup:.20,active:.16,followThrough:.11,recovery:.22,stamina:19,damage:28,poise:27,reach:2.10,lunge:.50,hitstop:.054,cancelAt:.48,guardAt:.51,chainOpen:.37,chainClose:.66,twist:.74,slash:-1},
 {id:'light-2',kind:'light',index:2,pose:'overhead-finisher',windup:.30,active:.18,followThrough:.16,recovery:.27,stamina:24,damage:38,poise:43,reach:2.25,lunge:.62,hitstop:.078,cancelAt:.68,guardAt:.72,chainOpen:.70,chainClose:.88,twist:-.24,slash:0}
];
const HEAVY={id:'heavy',kind:'heavy',index:0,pose:'charged-cleave',windup:.51,active:.20,followThrough:.17,recovery:.26,stamina:34,damage:54,poise:65,reach:2.45,lunge:.80,hitstop:.095,cancelAt:.91,guardAt:.96,chainOpen:.94,chainClose:1.11,twist:-.35,slash:0};
const CRITICAL={id:'critical',kind:'critical',type:'thrust',index:0,pose:'riposte-thrust',windup:.30,active:.24,followThrough:.20,recovery:.40,stamina:28,damage:100,poise:0,reach:2.65,lunge:.48,hitstop:.14,cancelAt:1.14,guardAt:1.14,chainOpen:Infinity,chainClose:Infinity};
const ROLL={id:'roll',kind:'roll',index:0,pose:'directional-roll',windup:.075,active:.325,followThrough:.09,recovery:.13,stamina:25,damage:0,poise:0,reach:0,lunge:2.85,hitstop:0,cancelAt:.62,guardAt:.58,chainOpen:.55,chainClose:.62,iframeStart:.075,iframeEnd:.40};
const SENTINEL={id:'sentinel-cut',kind:'sentinel',index:0,pose:'diagonal-right',windup:.72,active:.22,followThrough:.20,recovery:.48,stamina:0,damage:19,poise:18,reach:2.05,lunge:.46,hitstop:.052,cancelAt:1.62,guardAt:1.62,chainOpen:1.62,chainClose:1.62,twist:-.68,slash:1,turnLock:.48};
const BOSS={
 sweep:{pose:'wide-sweep',windup:.98,active:.24,followThrough:.25,recovery:.66,damage:28,poise:30,reach:3.45,lunge:.62,twist:-1.08,slash:1,turnLock:.52,hitstop:.066},
 slam:{pose:'overhead-slam',windup:1.22,active:.23,followThrough:.27,recovery:.79,damage:36,poise:42,reach:3.65,lunge:.72,twist:-.28,slash:0,turnLock:.48,hitstop:.085},
 thrust:{pose:'long-thrust',windup:1.06,active:.24,followThrough:.22,recovery:.74,damage:31,poise:30,reach:4.00,lunge:1.12,twist:-.57,slash:0,turnLock:.44,hitstop:.070},
 combo:{pose:'double-sweep',windup:.91,active:.82,followThrough:.22,recovery:.66,damage:22,poise:24,reach:3.38,lunge:.66,twist:-1.02,slash:1,turnLock:.50,hitstop:.056,relativeWindows:[[0,.20,1],[.53,.76,2]]}
};
function finishProfile(p){
 const total=p.windup+p.active+p.followThrough+p.recovery;
 const windows=(p.relativeWindows||[[0,p.active,1]]).map(w=>[p.windup+w[0],p.windup+w[1],w[2]]);
 const result={...p,total,duration:total,activeStart:p.windup,activeEnd:p.windup+p.active,followStart:p.windup+p.active,recoveryStart:p.windup+p.active+p.followThrough,windows,activeWindows:windows.map(w=>w.slice())};
 if(p.relativeWindows)result.relativeWindows=p.relativeWindows.map(w=>w.slice());
 return result;
}
function getMove(kind='light',index=0){
 const i=((Math.trunc(Number(index)||0)%3)+3)%3;
 return finishProfile(kind==='critical'?CRITICAL:kind==='heavy'?HEAVY:kind==='roll'?ROLL:kind==='sentinel'?SENTINEL:LIGHT[i]);
}
function getBossMove(index=0,phase=1){
 const phase2=phase===true||Number(phase)>=2;
 const pattern=phase2?['sweep','slam','combo','thrust','combo','slam']:['sweep','slam','thrust','sweep','thrust','slam'];
 const i=((Math.trunc(Number(index)||0)%pattern.length)+pattern.length)%pattern.length,type=pattern[i],p=BOSS[type];
 const windup=p.windup*(phase2?.86:1),recovery=p.recovery*(phase2?.88:1);
 return finishProfile({...p,id:'boss-'+type,kind:'boss',type,index:i,phase:phase2?2:1,stamina:0,windup,recovery,cancelAt:Infinity,guardAt:Infinity,chainOpen:Infinity,chainClose:Infinity});
}
function getSentinelMove(index=0,cycle=0){
 if(index===1&&cycle%2===1)return finishProfile({...SENTINEL,id:'sentinel-thrust',type:'thrust',pose:'long-thrust',windup:.88,active:.23,damage:22,lunge:.64,recovery:.60});
 return getMove('sentinel');
}
function samplePose(move,time){
 const t=clamp(Number(time)||0,0,move.total),windows=move.windows||[[move.windup,move.windup+move.active,1]];
 let active=false,hitIndex=-1,window=null;
 for(let i=0;i<windows.length;i++){
  if(t>=windows[i][0]){hitIndex=i;window=windows[i];}
  if(t>=windows[i][0]&&t<=windows[i][1])active=true;
 }
 const phase=t<move.windup?'anticipation':t<move.activeEnd?'strike':t<move.recoveryStart?'follow':t<move.total?'recovery':'done';
 return {
  phase,time:t,progress:clamp(t/move.total),done:Number(time)>=move.total,active,
  anticipation:smooth(t/move.windup),strike:smooth((t-move.windup)/move.active),
  follow:smooth((t-move.activeEnd)/move.followThrough),recovery:smooth((t-move.recoveryStart)/move.recovery),
  hitIndex,hitMask:active&&window?window[2]:0,
  localStrike:window?smooth((t-window[0])/(window[1]-window[0])):0,
  invulnerable:move.kind==='roll'&&t>=move.iframeStart&&t<=move.iframeEnd
 };
}
function canCancel(move,time,action){
 if(!move)return true;
 if(time>=move.total)return true;
 if(move.kind==='boss'||move.kind==='sentinel')return false;
 if(action==='roll'||action==='dodge')return time>=move.cancelAt;
 if(action==='guard'||action==='parry')return time>=move.guardAt;
 if(action==='light'||action==='heavy'||action==='attack')return time>=move.chainOpen&&time<=move.chainClose;
 return false;
}

// Clip each swept blade triangle to the hurtbox's vertical slab BEFORE the XZ
// circle test. A sword above a head therefore cannot damage a nearby target.
function point(p){return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);}
function clipY(poly,y,keepAbove){
 const result=[];
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],insideA=keepAbove?a.y>=y:a.y<=y,insideB=keepAbove?b.y>=y:b.y<=y;
  if(insideA)result.push(a);
  if(insideA!==insideB){const u=(y-a.y)/(b.y-a.y);result.push({x:a.x+(b.x-a.x)*u,y,z:a.z+(b.z-a.z)*u});}
 }
 return result;
}
function segmentDistanceSqXZ(p,a,b){
 const dx=b.x-a.x,dz=b.z-a.z,den=dx*dx+dz*dz;
 const u=den?clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/den):0;
 const x=a.x+dx*u-p.x,z=a.z+dz*u-p.z;
 return x*x+z*z;
}
function polygonCircleXZ(poly,target,radius){
 if(poly.length===0)return false;
 const radiusSq=radius*radius,EPS=1e-9;
 let positive=false,negative=false,area=0;
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length];
  if(segmentDistanceSqXZ(target,a,b)<=radiusSq+EPS)return true;
  const cross=(b.x-a.x)*(target.z-a.z)-(b.z-a.z)*(target.x-a.x);
  positive=positive||cross>EPS;negative=negative||cross<-EPS;
  area+=a.x*b.z-b.x*a.z;
 }
 // A point inside the projected convex polygon is distance zero. Exclude
 // line/point degeneracies, whose halfplanes otherwise contain every point.
 return Math.abs(area)>EPS&&!(positive&&negative);
}
function sweptBladeHit(prevBase,prevTip,base,tip,target,radius=.42){
 if(![prevBase,prevTip,base,tip].every(point)||!target||!Number.isFinite(target.x)||!Number.isFinite(target.z)||!Number.isFinite(radius)||radius<0)return false;
 const originY=Number.isFinite(target.y)?target.y:0;
 const low=Number.isFinite(target.minY)?target.minY:originY+.4;
 const high=Number.isFinite(target.maxY)?target.maxY:originY+(Number.isFinite(target.height)?target.height:2.0);
 if(high<low)return false;
 for(const triangle of [[prevBase,prevTip,tip],[prevBase,tip,base]]){
  let poly=clipY(triangle,low,true);poly=clipY(poly,high,false);
  if(polygonCircleXZ(poly,target,radius))return true;
 }
 return false;
}
function circleOverlap(a,ar,b,br){const dx=b.x-a.x,dz=b.z-a.z,r=ar+br;return dx*dx+dz*dz<=r*r;}

function guardHit(damage,stamina,heldSeconds=Infinity,options={}){
 const d=Math.max(0,Number(damage)||0),s=Math.max(0,Number(stamina)||0),max=options.maxStamina||100;
 const perfect=heldSeconds>=0&&heldSeconds<=.16&&options.canParry!==false;
 const cost=perfect?d*.28+3:d*.88+7;
 if(s+1e-9<cost)return {damage:d,stamina:0,staminaCost:s,broken:true,perfect:false,stagger:.95,attackerStagger:0,poiseDamage:0,hitstop:.075};
 return {damage:perfect?0:Math.ceil(d*.12),stamina:Math.min(max,s-cost+(perfect?12:0)),staminaCost:cost,broken:false,perfect,stagger:perfect?0:.10,attackerStagger:perfect?.58:0,poiseDamage:perfect?48:0,hitstop:perfect?.09:.035};
}

// An input buffer is optional: the owner retains its actor state machine. Input
// is timestamped on arrival so a key pressed near recovery is not silently lost.
function createInputBuffer(lifetime=.24){return {lifetime,entries:[]};}
function queueInput(buffer,action,now){
 buffer.entries=buffer.entries.filter(e=>now-e.time<=buffer.lifetime&&e.action!==action);
 buffer.entries.push({action,time:now});
 if(buffer.entries.length>3)buffer.entries.shift();
}
function consumeInput(buffer,now,allowed){
 buffer.entries=buffer.entries.filter(e=>now-e.time<=buffer.lifetime);
 const i=buffer.entries.findIndex(e=>!allowed||(typeof allowed==='function'?allowed(e.action):allowed.includes(e.action)));
 if(i<0)return null;
 return buffer.entries.splice(i,1)[0].action;
}
// Segment-versus-box camera collision avoids raycasting the full scenery mesh.
function cameraDistance(origin,goal,obstacles,padding=.22){
 const dx=goal.x-origin.x,dy=goal.y-origin.y,dz=goal.z-origin.z,length=Math.hypot(dx,dy,dz);let nearest=1;
 if(length<.001)return length;
 for(const o of obstacles){
  const w=o.w??(o.r||.3)*2,d=o.d??(o.r||.3)*2,h=o.h||4;
  const lo=[o.x-w/2-padding,-.25,o.z-d/2-padding],hi=[o.x+w/2+padding,h,o.z+d/2+padding],p=[origin.x,origin.y,origin.z],v=[dx,dy,dz];let enter=0,exit=1,hit=true;
  for(let a=0;a<3;a++){if(Math.abs(v[a])<1e-8){if(p[a]<lo[a]||p[a]>hi[a]){hit=false;break}}else{let n=(lo[a]-p[a])/v[a],f=(hi[a]-p[a])/v[a];if(n>f)[n,f]=[f,n];enter=Math.max(enter,n);exit=Math.min(exit,f);if(enter>exit){hit=false;break}}}
  if(hit&&enter>0&&enter<nearest)nearest=enter;
 }
 return Math.max(.75,length*nearest-.08);
}
const api={cameraDistance,angleDelta,getMove,getBossMove,getSentinelMove,samplePose,canCancel,sweptBladeHit,segmentDistanceSqXZ,circleOverlap,guardHit,createInputBuffer,queueInput,consumeInput};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AshenCombat=api;
})(typeof window!=='undefined'?window:globalThis);

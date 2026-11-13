/* Short, skippable scene direction. Camera motion never drives gameplay state. */
(function(global){
'use strict';
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0));
const blend=(a,b,t)=>a+(b-a)*t;
const ease=t=>{t=clamp(t);return t*t*(3-2*t)};
const point=(x,y,z)=>({x,y,z});
function mix(a,b,t){return point(blend(a.x,b.x,t),blend(a.y,b.y,t),blend(a.z,b.z,t))}
function create(){
 let shot=null,age=0;
 function begin(kind,focus={},returnView={}){
  if(!['arrival','warden'].includes(kind))return false;
  const x=Number(focus.x)||0,z=Number(focus.z)||0;
  const target=point(x,1.25,z);
  const last={position:returnView.position||point(x,3.06,z+5.1),target:returnView.target||target,fov:51};
  // Stay on the intact side of the arrival portico. A reverse angle points at
  // the platform's end; the left orbit also crosses the fallen masonry. This
  // rear three-quarter dolly keeps the cloister ahead of the hero in frame.
  const keys=kind==='arrival'?[
   {position:point(x+2.5,1.55,z+3.1),target:point(x,1.16,z-.4),fov:44},
   {position:point(x+1.75,2.2,z+4.2),target:point(x,1.28,z-.65),fov:47},last
  ]:[
   {position:point(x+3.0,1.85,z+5.3),target:point(x,1.38,z),fov:43},
   {position:point(x+1.65,2.1,z+4.8),target:point(x,1.6,z),fov:45},last
  ];
  shot={kind,keys,duration:kind==='arrival'?5.2:3.8};age=0;return true;
 }
 function sample(){
  if(!shot)return null;
  const progress=clamp(age/shot.duration),split=shot.kind==='arrival'?.64:.43;
  const i=progress<split?0:1,t=ease(i===0?progress/split:(progress-split)/(1-split));
  return {kind:shot.kind,progress,done:progress>=1,position:mix(shot.keys[i].position,shot.keys[i+1].position,t),target:mix(shot.keys[i].target,shot.keys[i+1].target,t),fov:blend(shot.keys[i].fov,shot.keys[i+1].fov,t)};
 }
 return {
  begin,sample,
  get active(){return !!shot&&age<shot.duration},
  advance(dt){if(shot)age=Math.min(shot.duration,age+clamp(dt,0,.1));return sample()},
  finish(){if(!shot)return null;age=shot.duration;return sample()},
  clear(){shot=null;age=0}
 };
}
function region(x,z){
 if(x<-6&&z>-.2&&z<6.5)return {id:'chapel',title:'余火小堂',subtitle:'A FIRE THAT STILL REMEMBERS'};
 if(z<-11)return {id:'hall',title:'无冠者之厅',subtitle:'THE HALL OF THE CROWNLESS'};
 if(z<-6)return {id:'gate',title:'封誓之门',subtitle:'BEYOND THE VOW'};
 if(z<10)return {id:'court',title:'失誓之庭',subtitle:'THE FORSAKEN COURT'};
 return {id:'arrival',title:'失誓者之径',subtitle:'THE LAST BELL'};
}
global.AshenDirector={create,region};
})(typeof window!=='undefined'?window:globalThis);

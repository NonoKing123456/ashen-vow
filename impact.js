/* Finite, directional metal sparks. One draw call, fixed storage, no timers. */
(function(global){
'use strict';
function create(T,scene){
 const capacity=64,positions=new Float32Array(capacity*6),colors=new Float32Array(capacity*6);
 const pool=Array.from({length:capacity},()=>({life:0,max:1,p:new T.Vector3(),v:new T.Vector3(),color:new T.Color()}));
 positions.fill(-100);
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setAttribute('color',new T.BufferAttribute(colors,3));
 const material=new T.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.85,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false});
 const mesh=new T.LineSegments(geometry,material);mesh.name='Blade contact / directional sparks';mesh.frustumCulled=false;scene.add(mesh);
 let cursor=0,disposed=false;
 function emit(at,from,to,{perfect=false,heavy=false,blocked=false}={}){
  if(disposed)return;
  const dx=to.x-from.x,dz=to.z-from.z,len=Math.hypot(dx,dz)||1;
  for(let i=0;i<(perfect?22:heavy?16:10);i++){
   const p=pool[cursor++%capacity],spread=(Math.random()-.5)*2.5,speed=1.5+Math.random()*(heavy?5.3:3.5);
   p.p.copy(at);p.life=p.max=.12+Math.random()*.22;
   p.v.set((dx/len*.5-dz/len*spread)*speed,.6+Math.random()*3.3,(dz/len*.5+dx/len*spread)*speed);
   p.color.set(perfect?'#d5ebff':blocked?'#e8d7b2':i%3?'#efbd77':'#fff0cd');
  }
 }
 function update(dt){
  if(disposed)return;dt=Math.max(0,Math.min(.05,Number(dt)||0));
  for(let i=0;i<capacity;i++){
   const p=pool[i],at=i*6;if(p.life<=0){positions[at+1]=positions[at+4]=-100;continue;}
   p.life-=dt;p.v.y-=dt*8;p.p.addScaledVector(p.v,dt);
   if(p.p.y<.035){p.p.y=.035;p.v.y=Math.abs(p.v.y)*.24;p.v.x*=.65;p.v.z*=.65;}
   const f=Math.max(0,p.life/p.max),tail=.018+f*.018;
   positions.set([p.p.x,p.p.y,p.p.z,p.p.x-p.v.x*tail,p.p.y-p.v.y*tail,p.p.z-p.v.z*tail],at);
   colors.set([p.color.r*f,p.color.g*f,p.color.b*f,p.color.r*f*.2,p.color.g*f*.2,p.color.b*f*.2],at);
  }
  geometry.attributes.position.needsUpdate=true;geometry.attributes.color.needsUpdate=true;
 }
 return {emit,update,dispose(){if(disposed)return;disposed=true;scene.remove(mesh);geometry.dispose();material.dispose()}};
}
global.AshenImpact={create};
})(typeof window!=='undefined'?window:globalThis);

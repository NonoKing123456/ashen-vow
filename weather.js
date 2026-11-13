/* Rain is a world-space effect: it does not streak over the lens or the HUD. */
(function(root){
'use strict';
function create({THREE:T,scene,bounds}){
 const count=650,positions=new Float32Array(count*6),colors=new Float32Array(count*6),seed=new Float32Array(count*3);
 let quality='high',endingTarget=0,ending=0,reducedMotion=false;
 let state=92741;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 for(let i=0;i<count;i++){
  seed[i*3]=rand();seed[i*3+1]=rand();seed[i*3+2]=rand();
  const value=.44+seed[i*3+1]*.42;for(let v=0;v<2;v++)for(let channel=0;channel<3;channel++)colors[i*6+v*3+channel]=value*(v?.35:1);
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(positions,3));g.setAttribute('color',new T.BufferAttribute(colors,3));
 const m=new T.LineBasicMaterial({color:'#b8d0dc',vertexColors:true,transparent:true,opacity:.18,depthWrite:false});
 const rain=new T.LineSegments(g,m);rain.name='world-rain';rain.frustumCulled=false;scene.add(rain);
 const rippleGeo=new T.RingGeometry(.93,1,24),rippleMat=new T.MeshBasicMaterial({color:'#a9c7cd',transparent:true,opacity:.17,depthWrite:false,side:T.DoubleSide});
 // Instance color carries the ring's alpha envelope; keep its reflected color
 // constant as it expands instead of darkening the stone on the way out.
 rippleMat.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float impactAlpha;').replace('#include <color_vertex>','#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\nimpactAlpha=instanceColor.r;\n#else\nimpactAlpha=1.;\n#endif');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float impactAlpha;').replace('#include <color_fragment>','diffuseColor.a*=impactAlpha;');
 };
 rippleMat.customProgramCacheKey=()=> 'rain-impact-alpha-v1';
 const ripple=new T.InstancedMesh(rippleGeo,rippleMat,45);ripple.name='rain-impact-rings';ripple.frustumCulled=false;scene.add(ripple);
 const dummy=new T.Object3D(),rippleColor=new T.Color();
 const sheltered=(x,z)=>x>-12.2&&x<-6&&z>-.2&&z<6.5;
 function update(dt,t,player){
  const px=Number.isFinite(player?.x)?player.x:0,pz=Number.isFinite(player?.z)?player.z:15;
  ending+=(endingTarget-ending)*(1-Math.exp(-Math.max(0,dt)*.7));
  m.opacity=(reducedMotion?.07:.18)*(1-ending*.68);rippleMat.opacity=.17*(1-ending*.72);
  const wind=.08+Math.sin(t*.11)*.065,visibleCount=quality==='low'?300:count,speed=reducedMotion?2.5:8;
  for(let i=0;i<visibleCount;i++){
   const n=i*3,x=px+((seed[n]*27+t*.30)%27)-13.5,z=pz+((seed[n+2]*30+t*.12)%30)-15,y=12-((t*speed+seed[n+1]*12)%12),j=i*6;
   // The side chapel is sheltered; no rain falls through its roof remnant.
   const covered=sheltered(x,z);
   positions[j]=x;positions[j+1]=covered?-50:y;positions[j+2]=z;
   positions[j+3]=x-wind;positions[j+4]=covered?-50:y-(reducedMotion?.12:.20+seed[n+1]*.23);positions[j+5]=z+.035+seed[n]*.035;
  }
  g.attributes.position.needsUpdate=true;
  if(!ripple.visible)return;
  for(let i=0;i<45;i++){
   const x=px+(seed[i*3]-.5)*20,z=pz+(seed[i*3+2]-.5)*20;
   const allowed=bounds.some(b=>x>b.x-b.w/2&&x<b.x+b.w/2&&z>b.z-b.d/2&&z<b.z+b.d/2)&&!sheltered(x,z);
   const u=(t*.8+seed[i*3+1])%1,s=.025+u*.24;
   dummy.position.set(x,allowed?.025:-50,z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.setScalar(s);dummy.updateMatrix();ripple.setMatrixAt(i,dummy.matrix);
   const fade=(1-u)*(1-u);rippleColor.setRGB(fade,fade,fade);ripple.setColorAt(i,rippleColor);
  }
  ripple.instanceMatrix.needsUpdate=true;ripple.instanceColor.needsUpdate=true;
 }
 return {update,
  setQuality(q){quality=q==='low'?'low':'high';rain.geometry.setDrawRange(0,quality==='low'?600:count*2);ripple.visible=quality!=='low'&&!reducedMotion;},
  setEnding(value){endingTarget=Math.max(0,Math.min(1,Number(value)||0));},
  setReducedMotion(value){reducedMotion=!!value;ripple.visible=quality!=='low'&&!reducedMotion;},
  dispose(){scene.remove(rain,ripple);g.dispose();m.dispose();rippleGeo.dispose();rippleMat.dispose();}};
}
root.AshenWeather={create};
})(window);

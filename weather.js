/* Rain is a world-space effect: it does not streak over the lens or the HUD. */
(function(root){
'use strict';
function create({THREE:T,scene,bounds}){
 const count=650,positions=new Float32Array(count*6),seed=new Float32Array(count*3);
 let state=92741;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 for(let i=0;i<count;i++){seed[i*3]=rand();seed[i*3+1]=rand();seed[i*3+2]=rand();}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(positions,3));
 const m=new T.LineBasicMaterial({color:'#aec7d2',transparent:true,opacity:.16,depthWrite:false});
 const rain=new T.LineSegments(g,m);rain.frustumCulled=false;scene.add(rain);
 const rippleGeo=new T.RingGeometry(.93,1,24),rippleMat=new T.MeshBasicMaterial({color:'#a9c7cd',transparent:true,opacity:.17,depthWrite:false,side:T.DoubleSide});
 const ripple=new T.InstancedMesh(rippleGeo,rippleMat,45);ripple.frustumCulled=false;scene.add(ripple);
 const dummy=new T.Object3D();
 function update(dt,t,player){
  const px=player?.x||0,pz=player?.z||15;
  for(let i=0;i<count;i++){
   const n=i*3,x=px+(seed[n]-.5)*27,z=pz+(seed[n+2]-.5)*30,y=12-((t*8+seed[n+1]*12)%12),j=i*6;
   // The side chapel is sheltered; no rain falls through its roof remnant.
   const covered=x<-6&&z>-.2&&z<6.5;
   positions[j]=x;positions[j+1]=covered?-50:y;positions[j+2]=z;
   positions[j+3]=x-.026;positions[j+4]=covered?-50:y-.25;positions[j+5]=z+.055;
  }
  g.attributes.position.needsUpdate=true;
  for(let i=0;i<45;i++){
   const x=px+(seed[i*3]-.5)*20,z=pz+(seed[i*3+2]-.5)*20;
   const allowed=bounds.some(b=>x>b.x-b.w/2&&x<b.x+b.w/2&&z>b.z-b.d/2&&z<b.z+b.d/2)&&!(x<-6&&z>-.2&&z<6.5);
   const u=(t*.8+seed[i*3+1])%1,s=Math.sin(u*Math.PI)*.23;
   dummy.position.set(x,allowed?.025:-50,z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.setScalar(s);dummy.updateMatrix();ripple.setMatrixAt(i,dummy.matrix);
  }
  ripple.instanceMatrix.needsUpdate=true;
 }
 return {update,setQuality:q=>{rain.geometry.setDrawRange(0,q==='low'?600:count*2);ripple.visible=q!=='low';},dispose(){scene.remove(rain,ripple);g.dispose();m.dispose();rippleGeo.dispose();rippleMat.dispose();}};
}
root.AshenWeather={create};
})(window);

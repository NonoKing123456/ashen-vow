/* Source-calibrated gait timing. The controller continues to own displacement. */
(function(global){
'use strict';
const cache=new WeakMap(),TAU=Math.PI*2;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,Number(x)||0));
const wrap=x=>((x%1)+1)%1;
const smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
const lerp=(a,b,t)=>a+(b-a)*t;
const difference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
function curveAt(profile,side,phase){
 const curve=profile.feet[side],at=wrap(phase)*curve.length,i=Math.floor(at),u=at-i;
 const a=curve[i],b=curve[(i+1)%curve.length];
 return {height:lerp(a.height,b.height,u),x:lerp(a.x,b.x,u),z:lerp(a.z,b.z,u),contact:lerp(a.contact,b.contact,u),velocityX:lerp(a.velocityX,b.velocityX,u),velocityZ:lerp(a.velocityZ,b.velocityZ,u),support:lerp(a.support,b.support,u)};
}
function cloneRig(source,T){
 const result=source.clone(true),lookup=new Map();
 function pair(a,b){lookup.set(a,b);for(let i=0;i<a.children.length;i++)pair(a.children[i],b.children[i]);}pair(source,result);
 source.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const copy=lookup.get(mesh),skeleton=mesh.skeleton.clone();skeleton.bones=mesh.skeleton.bones.map(b=>lookup.get(b));copy.bind(skeleton,mesh.bindMatrix.clone());});
 return result;
}
function calibrate(actor,T){
 if(cache.has(actor.clips))return cache.get(actor.clips);
 const model=cloneRig(actor.model,T),holder=new T.Group();holder.position.y=.95;holder.add(model);
 const named=new Map();model.traverse(o=>{if(o.isBone)named.set(o.name,o)});
 const feet={left:named.get(actor.rig.leftFoot?.name),right:named.get(actor.rig.rightFoot?.name)};
 const probes=[];
 model.traverse(mesh=>{
  if(!mesh.isSkinnedMesh)return;
  const pos=mesh.geometry.attributes.position,indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
  const bones=mesh.skeleton.bones,sets={left:new Map(),right:new Map()};
  const components=['getX','getY','getZ','getW'];
  for(let i=0;i<pos.count;i++){
   let strongest=-1,weight=0;for(const component of components){const w=weights[component](i);if(w>weight){weight=w;strongest=indices[component](i);}}
   const name=bones[strongest]?.name||'',side=/^(?:foot|toe)_L$/i.test(name)?'left':/^(?:foot|toe)_R$/i.test(name)?'right':null;if(!side)continue;
   let bins=sets[side].get(strongest);if(!bins){bins=[];for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)if(x||y||z)bins.push({x,y,z,best:-Infinity,index:i});sets[side].set(strongest,bins);}
   for(const b of bins){const value=pos.getX(i)*b.x+pos.getY(i)*b.y+pos.getZ(i)*b.z;if(value>b.best){b.best=value;b.index=i;}}
  }
  for(const side of ['left','right']){const ids=new Set();for(const bins of sets[side].values())for(const b of bins)ids.add(b.index);if(ids.size)probes.push({mesh,side,indices:[...ids]});}
 });
 const point=new T.Vector3(),mixer=new T.AnimationMixer(model),samples=128,profiles={};
 for(const key of ['walk','run']){
  const clip=actor.clips.find(c=>new RegExp('^'+key+'$','i').test(c.name))||actor.clips.find(c=>new RegExp(key,'i').test(c.name));
  if(!clip)continue;
  mixer.stopAllAction();const action=mixer.clipAction(clip);action.reset().setEffectiveWeight(1).play();
  const profile={name:clip.name,duration:clip.duration,distance:actor.gait?.[key]?.distance||(key==='walk'?3:5),feet:{left:[],right:[]},ranges:{}};
  for(let i=0;i<samples;i++){
   mixer.setTime(i/samples*clip.duration);holder.updateMatrixWorld(true);for(const p of probes)p.mesh.skeleton.update();
   for(const side of ['left','right']){
    let minimum=Infinity;for(const p of probes){if(p.side!==side)continue;for(const index of p.indices){p.mesh.boneTransform(index,point);point.applyMatrix4(p.mesh.matrixWorld);minimum=Math.min(minimum,point.y);}}
    const foot=feet[side];if(foot)foot.getWorldPosition(point);else point.set(0,0,0);
    profile.feet[side].push({height:Number.isFinite(minimum)?minimum:point.y,x:point.x,z:point.z,contact:0});
   }
  }
  for(const side of ['left','right']){
   const values=profile.feet[side],low=Math.min(...values.map(v=>v.height)),high=Math.max(...values.map(v=>v.height));
   const zMin=Math.min(...values.map(v=>v.z)),zMax=Math.max(...values.map(v=>v.z));
   profile.ranges[side]={low,high,zMid:(zMin+zMax)/2,zRadius:Math.max(.05,(zMax-zMin)/2)};
   // A sole near its own measured floor is planted. Use the weighted mesh, not
   // the ankle alone: running toe contact can leave the ankle well above ground.
   const inner=Math.max(.008,(high-low)*.06),outer=Math.max(.03,(high-low)*.20);
   for(const v of values)v.contact=1-smooth((v.height-low-inner)/(outer-inner));
   // A low sole alone does not establish support: the walking source also
   // passes close to the ground on its forward swing. Retain only intervals
   // whose measured ankle velocity approximately cancels source root motion.
   // These are conservative candidates for a bounded leg constraint, never a
   // claim that the original clip contains a perfectly stationary contact.
   const native=profile.distance/profile.duration;
   for(let i=0;i<values.length;i++){
    const before=values[(i+values.length-1)%values.length],after=values[(i+1)%values.length],v=values[i];
    v.velocityX=(after.x-before.x)*samples/(2*profile.duration);
    v.velocityZ=(after.z-before.z)*samples/(2*profile.duration);
    const residual=Math.hypot(v.velocityX,v.velocityZ+native)/Math.max(.1,native);
    v.support=v.contact*(1-smooth((residual-.10)/.28));
   }
  }
  let dominant=1,power=-Infinity;
  for(let frequency=1;frequency<=6;frequency++){
   let re=0,im=0;for(let i=0;i<samples;i++){const z=profile.feet.left[i].z;re+=z*Math.cos(TAU*frequency*i/samples);im+=z*Math.sin(TAU*frequency*i/samples);}
   if(re*re+im*im>power){power=re*re+im*im;dominant=frequency;}
  }
  profile.cycles=dominant;
  profiles[key]=profile;
 }
 mixer.stopAllAction();mixer.uncacheRoot(model);
 if(!profiles.walk)profiles.walk=profiles.run;
 if(!profiles.run)profiles.run=profiles.walk;
 if(!profiles.walk)throw new Error('The knight needs a walk or run source clip.');
 let bestOffset=0,bestCost=Infinity;
 for(let offset=0;offset<samples/2;offset++){
  let cost=0;for(let i=0;i<samples;i++)for(const side of ['left','right']){
   const w=profiles.walk.feet[side][i],r=profiles.run.feet[side][(i+offset)%samples],wr=profiles.walk.ranges[side],rr=profiles.run.ranges[side];
   const wh=(w.height-wr.low)/Math.max(.05,wr.high-wr.low),rh=(r.height-rr.low)/Math.max(.05,rr.high-rr.low);
   const wz=(w.z-wr.zMid)/wr.zRadius,rz=(r.z-rr.zMid)/rr.zRadius;
   cost+=(wh-rh)**2+1.4*(w.contact-r.contact)**2+.4*(wz-rz)**2;
  }
  if(cost<bestCost){bestCost=cost;bestOffset=offset/samples;}
 }
 const data={walk:profiles.walk,run:profiles.run,runOffset:bestOffset,samples,alignmentCost:bestCost};cache.set(actor.clips,data);return data;
}
function create(actor,T){
 const data=calibrate(actor,T),local=new T.Vector3(),q=new T.Quaternion();
 let phase=0,runWeight=0,directionYaw=0,clock=0,wasMoving=false,reverse=false,previousTravelYaw=null,directionAge=0,previous={left:0,right:0},lastStep={left:-10,right:-10},lastFootfall=-10,lastSide=null;
 function update(o={}){
  const dt=clamp(o.dt,0,.05),speed=Math.max(0,Number(o.speed)||0),scale=Math.max(.1,actor.root.scale.x||1),moving=o.enabled!==false&&speed>.07;
  clock+=dt;local.set(Number(o.moveX)||0,0,Number(o.moveZ)||0);actor.root.getWorldQuaternion(q);local.applyQuaternion(q.invert());
  const hasDirection=local.lengthSq()>.001,oldReverse=reverse;
  if(moving&&hasDirection)reverse=local.z<-.12&&-local.z>Math.abs(local.x)*(reverse?.50:.80);
  const travelYaw=moving&&hasDirection?Math.atan2(local.x,local.z):null;
  const changed=oldReverse!==reverse||(travelYaw!==null&&previousTravelYaw!==null&&Math.abs(difference(travelYaw,previousTravelYaw))>.30);
  directionAge=moving&&!changed?directionAge+dt:0;if(travelYaw!==null)previousTravelYaw=travelYaw;
  const wantedYaw=moving&&hasDirection?Math.atan2(local.x*(reverse?-1:1),Math.abs(local.z)):0;
  directionYaw+=difference(wantedYaw,directionYaw)*(1-Math.exp(-12*dt));
  const walkNative=data.walk.distance/data.walk.duration*scale,runNative=data.run.distance/data.run.duration*scale;
  const target=moving?smooth((speed-walkNative)/Math.max(.1,runNative-walkNative)):0;
  runWeight+=(target-runWeight)*(1-Math.exp(-10*dt));
  const distance=lerp(data.walk.distance,data.run.distance,runWeight)*scale;
  if(moving)phase=wrap(phase+(reverse?-1:1)*speed*dt/Math.max(.25,distance));
  const runPhase=wrap(phase+data.runOffset),contacts={},feet={},footfalls=[];
  const cycles=lerp(data.walk.cycles,data.run.cycles,runWeight),stepInterval=distance/Math.max(.1,speed*cycles*2),minimumGap=Math.min(.24,stepInterval*.45);
  for(const side of ['left','right']){
   const walk=curveAt(data.walk,side,phase),run=curveAt(data.run,side,runPhase);
   contacts[side]=moving?lerp(walk.contact,run.contact,runWeight):0;
   const support=moving?lerp(walk.support,run.support,runWeight):0,rate=moving?(reverse?-1:1)*speed/distance*scale:0;
   // Positions and velocities use character-facing axes but world-meter units
   // (including root scale), before any directional leg-plane constraint.
   const sourceVelocity=moving?{x:lerp(walk.velocityX*data.walk.duration,run.velocityX*data.run.duration,runWeight)*rate,z:lerp(walk.velocityZ*data.walk.duration,run.velocityZ*data.run.duration,runWeight)*rate}:{x:0,z:0};
   const residual=Math.hypot(sourceVelocity.x,sourceVelocity.z+(reverse?-speed:speed)),tolerance=Math.min(.35*scale,.12*scale+speed*.075);
   feet[side]={contact:contacts[side],support,lockedCandidate:moving&&directionAge>=.10&&contacts[side]>.75&&support>.65&&residual<=tolerance,
    sourcePosition:{x:lerp(walk.x,run.x,runWeight)*scale,z:lerp(walk.z,run.z,runWeight)*scale},
    sourceVelocity};
   if(moving&&wasMoving&&contacts[side]>.58&&previous[side]<=.58&&clock-lastStep[side]>.16&&clock-lastFootfall>minimumGap&&(lastSide!==side||clock-lastFootfall>stepInterval*1.8)){
    lastStep[side]=lastFootfall=clock;lastSide=side;footfalls.push({side,strength:lerp(.58,1,runWeight),phase});
   }
   previous[side]=contacts[side];
  }
  wasMoving=moving;
  return {active:moving,phase,walkPhase:phase,runPhase,walkTime:phase*data.walk.duration,runTime:runPhase*data.run.duration,walkWeight:1-runWeight,runWeight,directionYaw,reverse,contacts,feet,footfalls,walkNative,runNative,strideDistance:distance};
 }
 return {update,calibration:data,reset(){wasMoving=false;reverse=false;previousTravelYaw=null;directionAge=0;previous={left:0,right:0};lastStep={left:-10,right:-10};lastFootfall=-10;lastSide=null;}};
}
global.AshenLocomotion={create,calibrate};
if(typeof module!=='undefined'&&module.exports)module.exports=global.AshenLocomotion;
})(typeof window!=='undefined'?window:globalThis);

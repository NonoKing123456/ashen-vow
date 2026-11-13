const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const T=require('./vendor/three.min.js'),C=require('./feel.js');
global.THREE=T;global.window=global;global.self=global;
require('./vendor/GLTFLoader.js');require('./locomotion.js');require('./rig-constraints.js');require('./motion.js');require('./characters.js');
// Only image decoding is omitted in this Node fixture. The actual shipped GLB,
// geometry, rig, animation clips, sockets and sword transforms are unchanged.
T.TextureLoader.prototype.load=function(url,onLoad){const texture=new T.Texture();queueMicrotask(()=>onLoad(texture));return texture;};
T.GLTFLoader.prototype.load=function(url,onLoad,onProgress,onError){const b=fs.readFileSync(path.join(__dirname,url));this.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',onLoad,onError);};
let actor,enemy,scene;
test.before(async()=>{await AshenCharacters.load({THREE:T,url:'assets/knight-v11.glb'});scene=new T.Scene();actor=AshenCharacters.createKnight({THREE:T,scene});enemy=AshenCharacters.createKnight({THREE:T,scene,isBoss:true});});
test('optimized production GLB retains its weighted mesh and authored source clips',()=>{
 const meta=AshenCharacters.getMetadata();assert.equal(Math.round(meta.triangles),59281);assert.equal(meta.bones.length,22);assert.equal(meta.originalAnimations.length,9);assert.ok(meta.animations.some(c=>c.name==='Sword_Regular_A_Rec'));
 assert.ok(meta.meshes.some(m=>m.skinned));assert.ok(fs.statSync(path.join(__dirname,'assets/knight-v11.glb')).size<3500000);
});
test('production motion metadata survives r128 loading and the roll trajectory is independent of sampling rate',()=>{
 const base=C.getMove('roll'),initial=actor.root.position.clone(),orientation=actor.root.quaternion.clone();assert.equal(base.nativeRootMotion,true);
 for(const [name,direction]of [['Knight_Roll',[0,0,1]],['Knight_Roll_Back',[0,0,-1]],['Knight_Roll_Left',[1,0,0]],['Knight_Roll_Right',[-1,0,0]]]){
  const clip=actor.motionClips.find(c=>c.name===name),meta=clip?.userData?.root_motion;assert.ok(meta?.samples.length>60,'missing native directional source or root metadata: '+name);
  assert.ok(Math.abs(clip.duration-base.total)<.001,'the controller must preserve the complete roll instead of compressing it to the old dodge');
  const d=meta.displacement;assert.ok(Array.isArray(d)&&d.length===3&&d.every(Number.isFinite),'native displacement must remain explicit');assert.ok(meta.horizontal_path_m>=Math.hypot(d[0],d[2])-.001,'root path length cannot be substituted for net displacement');
  const heading=new T.Vector3(d[0],0,d[2]).normalize();assert.ok(heading.dot(new T.Vector3(...direction))>.999,'a named cardinal source has the wrong native travel direction');
  const first=sourceRoot(clip,0),last=sourceRoot(clip,clip.duration).sub(first);assert.ok(Math.hypot(last.x-d[0],last.z-d[2])<.001,'native samples and displacement metadata disagree');
  for(const yaw of [0,Math.PI/2,-.73]){
   const world=new T.Vector3(...direction).applyAxisAngle(new T.Vector3(0,1,0),yaw),roll=actor.planRoll(base,world,yaw);assert.equal(roll.animation.clip,name,'world input selected the wrong cardinal source');assert.ok(Math.abs(roll.rollPlan.residualYaw)<.001,'cardinal travel must not be disguised as a rotated forward roll');
   assertSamplingRates(roll,at=>sourceRoot(clip,at/roll.total*clip.duration).sub(first));
  }
 }
 assert.ok(actor.root.position.equals(initial),'sampling a trajectory must not mutate the gameplay root');
 assert.ok(actor.root.quaternion.angleTo(orientation)<1e-6,'planning a roll must not change the gameplay facing');
});
function sourceRoot(clip,time){const samples=clip.userData.root_motion.samples;let i=0;while(i<samples.length-2&&samples[i+1][0]<time)i++;const a=samples[i],b=samples[Math.min(i+1,samples.length-1)],u=Math.max(0,Math.min(1,(time-a[0])/Math.max(1e-8,b[0]-a[0])));return new T.Vector3(a[1]+(b[1]-a[1])*u,0,a[3]+(b[3]-a[3])*u);}
function assertSamplingRates(roll,expectedAt){
 for(const hz of [20,30,60,120]){let at=0,x=0,z=0;for(let checkpoint=1;checkpoint<=14;checkpoint++){const target=roll.total*checkpoint/14;while(at<target-1e-9){const end=Math.min(target,at+1/hz),delta=actor.actionRootDelta(roll,at,end);assert.ok(Number.isFinite(delta.x)&&Number.isFinite(delta.z));x+=delta.x;z+=delta.z;at=end;}const expected=expectedAt(target);assert.ok(Math.hypot(x-expected.x,z-expected.z)<.001,'authored roll curve drifted at '+hz+'Hz, time '+target.toFixed(3));}}
}
test('all diagonal roll plans preserve requested direction, native range and sampling independence',t=>{
 const observations=[];
 for(const direction of [[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1]])for(const yaw of [0,Math.PI/2]){
  const local=new T.Vector3(...direction).normalize(),world=local.clone().applyAxisAngle(new T.Vector3(0,1,0),yaw),roll=actor.planRoll(C.getMove('roll'),world,yaw),clip=actor.motionClips.find(c=>c.name===roll.animation.clip),meta=clip.userData.root_motion;
  const native=new T.Vector3(meta.displacement[0],0,meta.displacement[2]).normalize();assert.ok(native.dot(local)>=Math.SQRT1_2-.001,'a diagonal selected a source outside its adjacent cardinal sector');
  assert.ok(Math.abs(roll.rollPlan.residualYaw)<=Math.PI/4+.001&&Math.abs(roll.rollPlan.residualYaw)>.01,'a diagonal silently lost its bounded source adaptation');
  assert.ok(roll.rollPlan.freeTurnWindow?.[1]<=meta.recovery_support_start,'diagonal rotation overlaps the authored support recovery');
  assertSamplingRates(roll,at=>actor.actionRootDelta(roll,0,at));
  const end=actor.actionRootDelta(roll,0,roll.total),length=Math.hypot(end.x,end.z),nativeLength=Math.hypot(meta.displacement[0],meta.displacement[2]),angle=Math.acos(Math.max(-1,Math.min(1,(end.x*local.x+end.z*local.z)/length)))*180/Math.PI;
  assert.ok(angle<=1,'planned roll missed its requested direction by '+angle.toFixed(3)+' degrees');assert.ok(Math.abs(length-nativeLength)<=.01,'direction adaptation changed the native net travel range');observations.push({direction,yaw,source:clip.name,endpoint:[end.x,end.z],angleErrorDegrees:angle,lengthError:Math.abs(length-nativeLength)});
 }
 t.diagnostic(JSON.stringify(observations));
});
function contact(knight,move,distance,height=1.9,combat=false){
 let previous=null,hit=false;knight.root.position.set(0,0,0);
 for(let t=0;t<=move.total;t+=1/120){
  const delta=knight.actionRootDelta(move,Math.max(0,t-1/120),t);knight.root.position.x+=delta.x;knight.root.position.z=Math.min(distance-(knight.isBoss?1.18:.98),knight.root.position.z+delta.z);
  knight.animate({state:'attack',attack:move,time:t,dt:1/120,t,speed:0,comboIndex:move.index,combat});
  const base=knight.weapon.group.localToWorld(knight.weapon.base.clone()),tip=knight.weapon.group.localToWorld(knight.weapon.tip.clone());
  if(previous&&C.samplePose(move,t).active&&C.sweptBladeHit(previous.base,previous.tip,base,tip,{x:0,z:distance,y:0,minY:.32,maxY:height},.4))hit=true;
  previous={base,tip};
 }return hit;
}
for(const kind of ['light','heavy','critical','dodgeAttack'])for(const distance of [.98,1.45,1.85])test('real sword '+kind+' contacts at '+distance+'m',()=>{
 assert.ok(contact(actor,C.getMove(kind),distance),kind+' missed '+distance);
});
for(const index of [0,1,2])test('real alternating light cut '+index+' contacts in the controller window',()=>assert.ok(contact(actor,C.getMove('light',index),1.45)));
for(const index of [0,1,2,4])test('real boss strike '+index+' contacts at combat spacing',()=>assert.ok(contact(enemy,C.getBossMove(index,2),2.3)));
test('raised combat stance preserves real blade contact for all player strike families',()=>{
 for(const move of [C.getMove('light',0),C.getMove('light',1),C.getMove('light',2),C.getMove('heavy'),C.getMove('critical'),C.getMove('dodgeAttack')])assert.ok(contact(actor,move,1.45,1.9,true),move.id+' lost contact from the raised stance');
});

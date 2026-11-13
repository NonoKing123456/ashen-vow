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
 const roll=C.getMove('roll'),clip=actor.motionClips.find(c=>c.name==='Armed_Roll');
 assert.ok(clip?.userData?.root_motion?.samples.length>60,'a missing extras payload would leave gameplay sliding independently of the pose');
 assert.ok(Math.abs(clip.duration-roll.total)<.001,'the controller must preserve the complete roll instead of compressing it to the old dodge');
 const initial=actor.root.position.clone();
 for(const hz of [20,30,60,120]){let x=0,z=0;for(let at=0;at<roll.total;){const end=Math.min(roll.total,at+1/hz),delta=actor.actionRootDelta(roll,at,end);assert.ok(Number.isFinite(delta.x)&&Number.isFinite(delta.z));x+=delta.x;z+=delta.z;at=end;}assert.ok(Math.abs(x)<.001&&Math.abs(z-roll.lunge)<.001,'scaled authored root travel drifted at '+hz+'Hz');}
 assert.ok(actor.root.position.equals(initial),'sampling a trajectory must not mutate the gameplay root');
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

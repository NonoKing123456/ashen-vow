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
 const meta=AshenCharacters.getMetadata();assert.equal(Math.round(meta.triangles),59281);assert.equal(meta.bones.length,22);assert.equal(meta.animations.length,9);
 assert.ok(meta.meshes.some(m=>m.skinned));assert.ok(fs.statSync(path.join(__dirname,'assets/knight-v11.glb')).size<3500000);
});
function contact(knight,move,distance,height=1.9,combat=false){
 let previous=null,hit=false;knight.root.position.set(0,0,0);
 for(let t=0;t<=move.total;t+=1/120){
  const start=move.windup*(knight.isBoss?.65:.45),duration=move.activeEnd-start;
  if(t>start&&t<move.activeEnd){const speed=move.lunge/duration*Math.sin((t-start)/duration*Math.PI);knight.root.position.z=Math.min(distance-(knight.isBoss?1.18:.98),knight.root.position.z+speed/120);}
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

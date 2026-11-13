const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const T=require('./vendor/three.min.js');
global.THREE=T;global.window=global;global.self=global;
require('./vendor/GLTFLoader.js');require('./locomotion.js');require('./locomotion.js');require('./rig-constraints.js');require('./motion.js');require('./characters.js');
T.TextureLoader.prototype.load=function(url,onLoad){const texture=new T.Texture();queueMicrotask(()=>onLoad(texture));return texture;};
T.GLTFLoader.prototype.load=function(url,onLoad,onProgress,onError){const b=fs.readFileSync(path.join(__dirname,url));this.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',onLoad,onError);};
let actor;
test.before(async()=>{await AshenCharacters.load({THREE:T,url:'assets/knight-v11.glb'});actor=AshenCharacters.createKnight({THREE:T,scene:new T.Scene()});});
const distance=(a,b)=>Math.abs(Math.atan2(Math.sin((a-b)*Math.PI*2),Math.cos((a-b)*Math.PI*2)))/(Math.PI*2);
function walk(driver,speed,seconds=3,extra={}){let frame;for(let i=0;i<seconds*60;i++)frame=driver.update({dt:1/60,speed,moveZ:speed,...extra});return frame;}

test('production gait calibration reads actual sole vertices through interleaved skin attributes',()=>{
 const before=actor.root.position.clone(),left=actor.rig.leftFoot.getWorldPosition(new T.Vector3()),time=actor.mixer.time;
 const d=AshenLocomotion.create(actor,T),data=d.calibration;
 assert.ok(actor.root.position.equals(before));assert.ok(actor.rig.leftFoot.getWorldPosition(new T.Vector3()).distanceTo(left)<1e-9);assert.equal(actor.mixer.time,time);
 assert.equal(data.walk.cycles,2);assert.equal(data.run.cycles,2);
 assert.ok(data.walk.distance/data.walk.duration>1&&data.walk.distance/data.walk.duration<1.3,'ordinary walking source is about 1.1 m/s');
 assert.ok(data.run.distance/data.run.duration>2.9&&data.run.distance/data.run.duration<3.2,'running source is about 3.05 m/s');
 for(const side of ['left','right']){
  assert.ok(data.walk.ranges[side].high-data.walk.ranges[side].low>.05,'walking must really lift each sole');
  assert.ok(data.run.ranges[side].high-data.run.ranges[side].low>.30,'running must retain a flight phase');
  assert.ok(data.run.ranges[side].low>-.04&&data.run.ranges[side].low<.01,'the actual source floor is close to zero');
 }
});

test('source-derived phase alignment materially reduces incompatible planted-foot blending',()=>{
 const data=AshenLocomotion.create(actor,T).calibration;let baseline=0,aligned=0;
 for(const side of ['left','right'])for(let i=0;i<data.samples;i++){
  baseline+=Math.abs(data.walk.feet[side][i].contact-data.run.feet[side][i].contact);
  aligned+=Math.abs(data.walk.feet[side][i].contact-data.run.feet[side][(i+data.runOffset*data.samples)%data.samples].contact);
 }
 assert.ok(aligned<baseline*.6,'mixing raw clip starts makes opposing feet plant together');
 assert.ok(data.runOffset>.15&&data.runOffset<.4,'the source clips are visibly out of step');
});

test('armored walk, guarded walk and sprint use their measured source cadences',()=>{
 const guarded=walk(AshenLocomotion.create(actor,T),1.05),normal=walk(AshenLocomotion.create(actor,T),1.85),sprint=walk(AshenLocomotion.create(actor,T),4.4);
 assert.ok(guarded.runWeight<.01);assert.ok(normal.runWeight>.15&&normal.runWeight<.45);assert.ok(sprint.runWeight>.99);
 assert.notEqual(normal.walkTime/normal.runTime,normal.walkNative/normal.runNative,'walk and run cannot share a raw time without their phase offset');
 const boss=AshenCharacters.createKnight({THREE:T,scene:new T.Scene(),isBoss:true}),a=walk(AshenLocomotion.create(actor,T),1.85),b=walk(AshenLocomotion.create(boss,T),1.85*boss.root.scale.x);
 assert.ok(distance(a.phase,b.phase)<1e-6,'a scaled knight takes the same gait at a proportionally scaled speed');
});

test('actual sole landings alternate at ordinary and sprint speeds without toe/heel double steps',()=>{
 for(const speed of [1.05,1.85,4.4]){
  const driver=AshenLocomotion.create(actor,T),events=[];let frame;
  for(let i=0;i<600;i++){frame=driver.update({dt:1/60,speed,moveZ:speed});for(const event of frame.footfalls)events.push({...event,time:i/60});}
  const expected=speed/frame.strideDistance*driver.calibration.walk.cycles*2*10;
  assert.ok(Math.abs(events.length-expected)<2,'footsteps must follow the source gait, not a fixed distance timer');
  for(let i=1;i<events.length;i++){assert.notEqual(events[i].side,events[i-1].side);assert.ok(events[i].time-events[i-1].time>.20,'one contact emitted both heel and toe sounds');}
  for(let i=0;i<120;i++)assert.equal(driver.update({dt:1/60,speed:0}).footfalls.length,0);
 }
});

test('starts, stops, reversals and lateral travel preserve phase continuity and face the lower body into travel',()=>{
 const driver=AshenLocomotion.create(actor,T);let previous=walk(driver,1.85,1);
 const stopped=walk(driver,0,1);assert.ok(distance(previous.phase,stopped.phase)<1e-8);
 const reversed=walk(driver,1.85,1,{moveZ:-1.85});assert.equal(reversed.reverse,true);assert.ok(Math.abs(reversed.directionYaw)<.02);
 const right=walk(driver,1.85,1,{moveX:1.85,moveZ:0});assert.equal(right.reverse,false);assert.ok(Math.abs(right.directionYaw-Math.PI/2)<.01);
 for(let i=0;i<60;i++){const f=driver.update({dt:1/60,speed:1.85,moveZ:-1.85});assert.ok(distance(f.phase,previous.phase)<.04||i===0);previous=f;}
 const paused=driver.update({dt:1/60,speed:4.4,moveZ:4.4,enabled:false});assert.equal(paused.active,false);assert.ok(distance(paused.phase,previous.phase)<1e-8);assert.equal(paused.footfalls.length,0);
});

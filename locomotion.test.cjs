const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const T=require('./vendor/three.min.js');
global.THREE=T;global.window=global;global.self=global;
require('./vendor/GLTFLoader.js');require('./locomotion.js');require('./rig-constraints.js');require('./motion.js');require('./characters.js');
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

test('low forward-swing soles cannot become support merely because their height is near the floor',()=>{
 const data=AshenLocomotion.create(actor,T).calibration;let rejectedLowSwing=0,acceptedSupport=0;
 for(const key of ['walk','run'])for(const side of ['left','right']){
  const profile=data[key],native=profile.distance/profile.duration;
  for(const sample of profile.feet[side]){
   const residual=Math.hypot(sample.velocityX,sample.velocityZ+native);
   assert.ok(Number.isFinite(sample.x)&&Number.isFinite(sample.velocityX)&&Number.isFinite(sample.velocityZ));
   if(sample.contact>.75&&residual>native*.4){assert.equal(sample.support,0);rejectedLowSwing++;}
   if(sample.support>.65){assert.ok(sample.contact>.65);assert.ok(residual<native*.25);acceptedSupport++;}
  }
 }
 assert.ok(rejectedLowSwing>10,'production walking source has low but moving soles');
 assert.ok(acceptedSupport>60,'conservative support must retain real source stance intervals');
});

test('candidate locks respect measured contact velocity at walk, blended and sprint speeds in both directions',()=>{
 const before=actor.root.position.clone();
 for(const speed of [1.05,1.85,4.4])for(const sign of [1,-1]){
  const driver=AshenLocomotion.create(actor,T),counts={left:0,right:0};
  for(let i=0;i<600;i++){
   const f=driver.update({dt:1/60,speed,moveZ:speed*sign});
   for(const side of ['left','right']){
    const foot=f.feet[side];assert.ok(foot.support>=0&&foot.support<=1);
    if(!foot.lockedCandidate)continue;counts[side]++;
    assert.ok(foot.contact>.75);
    const residual=Math.hypot(foot.sourceVelocity.x,foot.sourceVelocity.z+speed*sign);
    assert.ok(residual<=.350001,'planting a rapidly moving source ankle would demand large IK correction');
   }
  }
  // The production sprint's right ankle has only a very short low-slip window;
  // preserve that limitation rather than treating the entire low-sole phase as fixed.
  for(const side of ['left','right'])assert.ok(counts[side]>=10,side+' needs observable support in both playback directions');
  const inactive=driver.update({dt:1/60,speed,moveZ:speed*sign,enabled:false});
  for(const side of ['left','right']){assert.equal(inactive.feet[side].lockedCandidate,false);assert.equal(inactive.feet[side].sourceVelocity.x,0);assert.equal(inactive.feet[side].sourceVelocity.z,0);}
 }
 assert.ok(actor.root.position.equals(before),'calibration and candidate generation cannot move the gameplay root');
});

test('reverse hysteresis prevents phase-direction chatter near the backward lateral boundary',()=>{
 const driver=AshenLocomotion.create(actor,T);let previous=walk(driver,1.85,1),changes=0;
 for(let i=0;i<120;i++){
  const f=driver.update({dt:1/60,speed:1.85,moveX:1.4,moveZ:-1.4*(i%2?.63:.67)});
  if(f.reverse!==previous.reverse)changes++;previous=f;
 }
 assert.equal(changes,0,'small direction noise must not repeatedly reverse clip playback');
 const reverse=driver.update({dt:1/60,speed:1.85,moveX:0,moveZ:-1.85});assert.equal(reverse.reverse,true);
 for(const side of ['left','right'])assert.equal(reverse.feet[side].lockedCandidate,false,'a reversal releases existing support');
 const right=driver.update({dt:1/60,speed:1.85,moveX:1.85,moveZ:0});
 assert.equal(right.reverse,false);for(const side of ['left','right'])assert.equal(right.feet[side].lockedCandidate,false,'an abrupt turn cannot inherit an old world foot pin');
});

test('roll landing follows source recovery support once, independently of playback cadence and paused sampling',()=>{
 const sources=actor.motionClips.filter(c=>/^Knight_Roll(?:_Back|_Left|_Right)?$/.test(c.name));assert.equal(sources.length,4);
 for(const source of sources)for(const hz of [20,30,60,120]){
  const support=source.userData.root_motion.recovery_support_start,driver=AshenLocomotion.create(actor,T),events=[];
  assert.ok(support>.2&&support<source.duration-.3,'landing must describe actual support before the action ends');
  for(let time=0;time<=source.duration+1/hz;time+=1/hz){const frame=driver.update({dt:1/hz,speed:0,enabled:false,action:{clip:source.name,time}});for(const e of frame.actionLandings)events.push({event:e,time});assert.equal(driver.update({dt:0,speed:0,enabled:false,action:{clip:source.name,time}}).actionLandings.length,0);}
  assert.equal(events.length,1,source.name+' duplicated or omitted its recovery contact at '+hz+'Hz');assert.equal(events[0].event.nativeTime,support);assert.ok(events[0].time>=support-1e-8&&events[0].time<support+1/hz+1e-8);
  const idle=driver.update({dt:1/hz,speed:0,enabled:true});assert.equal(idle.actionLandings.length,0,'returning to idle cannot invent a second landing');
 }
});

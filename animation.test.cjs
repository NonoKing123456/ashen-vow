const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const T=require('./vendor/three.min.js'),C=require('./feel.js');
global.THREE=T;global.window=global;global.self=global;
require('./vendor/GLTFLoader.js');require('./locomotion.js');require('./rig-constraints.js');require('./motion.js');require('./characters.js');
// Decode the shipped weighted mesh, skeleton and clips; only image decoding is
// replaced, since the Node fixture has no browser image surface.
T.TextureLoader.prototype.load=function(url,onLoad){const texture=new T.Texture();queueMicrotask(()=>onLoad(texture));return texture;};
T.GLTFLoader.prototype.load=function(url,onLoad,onProgress,onError){const b=fs.readFileSync(path.join(__dirname,url));this.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',onLoad,onError);};
let actor;
test.before(async()=>{await AshenCharacters.load({THREE:T,url:'assets/knight-v11.glb'});actor=AshenCharacters.createKnight({THREE:T,scene:new T.Scene()});});
function actualBounds(){const p=new T.Vector3();let min=Infinity,max=-Infinity;actor.root.updateMatrixWorld(true);actor.visual.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;mesh.skeleton.update();for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.boneTransform(i,p);p.applyMatrix4(mesh.matrixWorld);min=Math.min(min,p.y);max=Math.max(max,p.y);}});return {min,max};}
function idle(){actor.root.position.set(0,0,0);actor.root.rotation.set(0,0,0);for(let i=0;i<45;i++)actor.animate({state:'idle',time:i/60,t:i/60,dt:1/60,speed:0});}
const cardinalRolls=[['forward',[0,0,1],'Knight_Roll'],['backward',[0,0,-1],'Knight_Roll_Back'],['left',[1,0,0],'Knight_Roll_Left'],['right',[-1,0,0],'Knight_Roll_Right']];
const diagonalRolls=[['forward-left',[1,0,1]],['forward-right',[-1,0,1]],['back-left',[1,0,-1]],['back-right',[-1,0,-1]]];
function rollMove(local=[0,0,1]){const direction=new T.Vector3(...local).normalize().applyQuaternion(actor.root.quaternion);return actor.planRoll(C.getMove('roll'),direction,actor.root.rotation.y);}
function sourceRoot(clip,time){const samples=clip.userData.root_motion.samples;let i=0;while(i<samples.length-2&&samples[i+1][0]<time)i++;const a=samples[i],b=samples[Math.min(i+1,samples.length-1)],u=Math.max(0,Math.min(1,(time-a[0])/Math.max(1e-8,b[0]-a[0])));return new T.Vector3(a[1]+(b[1]-a[1])*u,0,a[3]+(b[3]-a[3])*u);}
for(const [name,direction,expected]of [...cardinalRolls,...diagonalRolls])test('real '+name+' authored roll folds the body and returns without root drift',()=>{
 idle();const initial=actor.root.position.clone(),move=rollMove(direction),dir=new T.Vector3(...direction).normalize();let compact=Infinity;
 assert.ok(move.rollPlan,'every production roll must use a committed source plan');if(expected)assert.equal(move.animation.clip,expected,'the requested cardinal must use its native source');
 for(let i=0;i<=72;i++){const time=i/72*move.total;actor.animate({state:'roll',attack:move,time,t:time,dt:move.total/72,speed:0,rollDir:dir});assert.ok(actor.root.position.equals(initial),'visual animation must not own world displacement');
   if(expected)assert.ok(actor.pivot.quaternion.angleTo(new T.Quaternion())<.001,'a cardinal source must not turn the complete body toward travel');
   const bounds=actor.groundBounds();assert.ok(bounds.min>=.016,'skin probe went underground');const equipmentFloor=Math.min(new T.Box3().setFromObject(actor.weapon.group).min.y,actor.shield?.visible?new T.Box3().setFromObject(actor.shield).min.y:Infinity,actor.flask?new T.Box3().setFromObject(actor.flask).min.y:Infinity);if(i>54)assert.ok(Math.min(bounds.min,equipmentFloor)<.065,'late recovery lost ground contact at sample '+i);if(i>10&&i<54)compact=Math.min(compact,bounds.max-bounds.min);
   if([12,24,36,48,60].includes(i)){const actual=actualBounds();assert.ok(actual.min>-.035,'weighted mesh penetrates the floor: '+actual.min);assert.ok(actual.max<2.15,'roll vaults unnaturally above standing height');}
 }
 assert.ok(compact<1.35,'the actual roll must fold the body, rather than remain an upright evasive step');assert.ok(actor.pivot.quaternion.angleTo(new T.Quaternion())<.001,'evasion must finish upright at its controller duration');
 actor.animate({state:'idle',time:0,t:move.total,dt:1/60,speed:0});assert.ok(actor.pivot.quaternion.angleTo(new T.Quaternion())<.001,'recovery must not unwind a full turn');
});
test('world roll input selects a native lateral source while preserving the facing direction',()=>{
 idle();actor.root.rotation.y=Math.PI/2;const move=actor.planRoll(C.getMove('roll'),new T.Vector3(0,0,1),actor.root.rotation.y);
 assert.equal(move.animation.clip,'Knight_Roll_Right');
 for(let t=0;t<=move.total*.4;t+=1/120)actor.animate({state:'roll',attack:move,time:t,dt:1/120,rollDir:new T.Vector3(0,0,1)});
 const forward=new T.Vector3(0,0,1).applyQuaternion(actor.root.quaternion.clone().multiply(actor.pivot.quaternion));
 assert.ok(forward.distanceTo(new T.Vector3(1,0,0))<.01,'a lateral roll turned the standing facing toward travel');
 assert.equal(actor.motionFrame.style,'authored-knight-roll');assert.equal(actor.currentClip,'Knight_Roll_Right');
 assert.ok(Math.abs(new T.Vector3(0,1,0).applyQuaternion(actor.pivot.quaternion).y-1)<.001,'the pivot must not add a second rigid tumble');
});

test('diagonal adaptation occurs with both feet free and preserves native support recovery',t=>{
 const observations=[];
 for(const [name,direction]of diagonalRolls){
  idle();const move=rollMove(direction),clip=actor.motionClips.find(c=>c.name===move.animation.clip),meta=clip.userData.root_motion,window=meta.free_turn_window;
  assert.ok(Array.isArray(window)&&window.length===2&&window[0]>=0&&window[1]>window[0]&&window[1]<=meta.recovery_support_start,'diagonal adaptation needs a measured free-turn window before recovery support');
  assert.ok(Math.abs(move.rollPlan.residualYaw)<=Math.PI/4+1e-6&&Math.abs(move.rollPlan.residualYaw)>.01,'a diagonal must use a bounded nonzero adaptation of an adjacent native source');
  let maximumYaw=0,maximumSpeed=0,maximumSpeedAt=0,maximumVelocityStep=0,maximumVelocityStepAt=0,maximumNativeSpeed=0,maximumNativeVelocityStep=0,maximumCorrectionSpeed=0,maximumCorrectionVelocityStep=0,minimumFreeSole=Infinity,correctedFrames=0,previousVelocity=null,previousNativeVelocity=null,previousCorrectionVelocity=null;const count=Math.ceil(move.total*120);
  for(let i=0;i<count;i++){
   const from=i/count*move.total,to=(i+1)/count*move.total,mid=(from+to)/2;actor.animate({state:'roll',attack:move,time:mid,t:mid,dt:move.total/count,speed:0});
   const native=mid/move.total*clip.duration,q=actor.pivot.quaternion,yaw=new T.Euler().setFromQuaternion(q,'YXZ').y;maximumYaw=Math.max(maximumYaw,Math.abs(yaw));
   assert.ok(Math.abs(yaw)<=Math.PI/4+.001,'diagonal adaptation exceeded the nearest cardinal sector');
   if(native<=window[0]||native>=window[1])assert.ok(q.angleTo(new T.Quaternion())<.001,'the standing anticipation or support recovery still rotates');
   const nativeFrom=from/move.total*clip.duration,nativeTo=to/move.total*clip.duration,nativeDelta=sourceRoot(clip,nativeTo).sub(sourceRoot(clip,nativeFrom)),expected=nativeDelta.clone().applyQuaternion(q),actual=actor.actionRootDelta(move,from,to),extra=Math.hypot(actual.x-expected.x,actual.z-expected.z),velocity=new T.Vector3(actual.x,0,actual.z).divideScalar(to-from),nativeVelocity=nativeDelta.clone().divideScalar(to-from),correctionVelocity=velocity.clone().sub(expected.clone().divideScalar(to-from));
   if(velocity.length()>maximumSpeed){maximumSpeed=velocity.length();maximumSpeedAt=native;}if(previousVelocity&&velocity.distanceTo(previousVelocity)>maximumVelocityStep){maximumVelocityStep=velocity.distanceTo(previousVelocity);maximumVelocityStepAt=native;}previousVelocity=velocity;
   maximumNativeSpeed=Math.max(maximumNativeSpeed,nativeVelocity.length());maximumCorrectionSpeed=Math.max(maximumCorrectionSpeed,correctionVelocity.length());if(previousNativeVelocity)maximumNativeVelocityStep=Math.max(maximumNativeVelocityStep,nativeVelocity.distanceTo(previousNativeVelocity));if(previousCorrectionVelocity)maximumCorrectionVelocityStep=Math.max(maximumCorrectionVelocityStep,correctionVelocity.distanceTo(previousCorrectionVelocity));previousNativeVelocity=nativeVelocity;previousCorrectionVelocity=correctionVelocity;
   if(nativeTo<=window[0]||nativeFrom>=window[1])assert.ok(extra<.0001,'adaptation changed a native root increment outside the free-turn window');
   else if(extra>.00001){const soles=actor.footBounds();minimumFreeSole=Math.min(minimumFreeSole,soles.left.min,soles.right.min);correctedFrames++;assert.ok(soles.left.min>=.065&&soles.right.min>=.065,name+' direction correction moved a grounded foot at '+native.toFixed(5)+'s: L '+soles.left.min.toFixed(5)+'m R '+soles.right.min.toFixed(5)+'m');}
  }
  assert.ok(maximumYaw>.01,'the requested diagonal was silently reduced to cardinal travel');
  const support=meta.recovery_support_start/clip.duration*move.total,tail=actor.actionRootDelta(move,support,move.total),nativeTail=sourceRoot(clip,clip.duration).sub(sourceRoot(clip,meta.recovery_support_start));
  assert.ok(Math.hypot(tail.x-nativeTail.x,tail.z-nativeTail.z)<.0001,'the support tail no longer follows its authored root curve');
  assert.ok(correctedFrames>8,'the diagonal endpoint correction was not actually exercised');observations.push({direction:name,source:clip.name,maximumSpeed,maximumSpeedAt,maximumVelocityStep,maximumVelocityStepAt,maximumNativeSpeed,maximumNativeVelocityStep,maximumCorrectionSpeed,maximumCorrectionVelocityStep,minimumFreeSole,correctedFrames});
 }
 const directory=path.join(__dirname,'.asset-work','qa-v16');fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'roll-direction-observations.json'),JSON.stringify({generatedAt:new Date().toISOString(),observations},null,2));t.diagnostic(JSON.stringify(observations));
});

test('the production roll has a real inverted trunk and tucked legs through its source cycle',()=>{
 idle();const move=rollMove();let inverted=false,bent=false;
 for(let i=0;i<=90;i++){actor.animate({state:'roll',attack:move,time:i/90*move.total,dt:move.total/90,rollDir:new T.Vector3(0,0,1)});const hip=actor.rig.hips.getWorldPosition(new T.Vector3()),head=actor.rig.head.getWorldPosition(new T.Vector3());if(head.y<hip.y-.1)inverted=true;const thigh=actor.rig.leftThigh.getWorldPosition(new T.Vector3()),knee=actor.rig.leftShin.getWorldPosition(new T.Vector3()),foot=actor.rig.leftFoot.getWorldPosition(new T.Vector3());if(knee.clone().sub(thigh).normalize().dot(foot.clone().sub(knee).normalize())<.5)bent=true;}
 assert.ok(inverted&&bent,'a crouching slide cannot satisfy the source roll baseline');
});

test('sword socket inherits a tumble once and remains attached to its hand',()=>{
 for(const [,direction]of [...cardinalRolls,...diagonalRolls]){idle();const move=rollMove(direction);actor.animate({state:'roll',attack:move,time:.22,dt:1/60,rollDir:new T.Vector3(...direction).normalize()});
 const hand=actor.rig.rightHand,grip=actor.weapon.grip,expected=hand.getWorldQuaternion(new T.Quaternion()).multiply(grip.bindInverse).multiply(grip.orientation).normalize(),actual=actor.weapon.group.getWorldQuaternion(new T.Quaternion());
 assert.ok(expected.angleTo(actual)<1e-5,'equipment applies the pivot rotation a second time');assert.ok(hand.localToWorld(grip.handOffset.clone()).distanceTo(actor.weapon.group.getWorldPosition(new T.Vector3()))<1e-5);
 }
});
test('a completed roll can immediately enter a sword attack without a spinning recovery',()=>{
 idle();const roll=rollMove([0,0,-1]);for(let t=0;t<=roll.total;t+=1/120)actor.animate({state:'roll',attack:roll,time:t,dt:1/120,rollDir:new T.Vector3(0,0,-1)});
 const move=C.getMove('light');actor.animate({state:'attack',attack:move,time:0,dt:1/60,speed:0});assert.ok(actor.pivot.quaternion.angleTo(new T.Quaternion())<.015);assert.equal(actor.currentClip,'Sword_Regular_A');
});
test('stagger and death settle the weighted mesh on the floor',()=>{
 for(const state of ['stagger','dead']){idle();for(let i=0;i<=72;i++)actor.animate({state,dead:state==='dead',time:i/60,dt:1/60,speed:0});const bounds=actualBounds();assert.ok(bounds.min>-.035,'a fallen body penetrates the ground');assert.ok(bounds.min<.06,'a fallen body hovers above the ground');if(state==='dead')assert.ok(bounds.max<.8,'death should finish lying down');}
});
test('a tailored cloth mantle keeps its shoulder pins during running, turning and rolling',()=>{
 idle();assert.ok(actor.cape,'the player should have a finished cloth silhouette');
 const p=actor.cape.geometry.attributes.position,rest=actor.cape.userData.restPositions,weights=actor.cape.userData.fallWeights,pins=[];
 for(let i=0;i<p.count;i++)if(weights[i]===0)pins.push(i);assert.ok(pins.length>10,'the shoulder row needs fixed attachment points');
 const root=actor.root.position.clone(),move=rollMove([1,0,0]);
 for(let frame=0;frame<120;frame++){
  const roll=frame>=60&&frame<100;
  actor.animate({state:roll?'roll':'idle',attack:roll?move:null,time:roll?(frame-60)/39*move.total:frame/60,t:frame/60,dt:1/60,speed:frame<50?5:0,yawRate:frame<50?3.4:0,rollDir:new T.Vector3(1,0,0),moveX:5,moveZ:0});
  assert.ok(actor.root.position.equals(root),'cloth must not pull the gameplay root');
  for(const i of pins)for(let axis=0;axis<3;axis++)assert.ok(Math.abs(p.array[i*3+axis]-rest[i*3+axis])<1e-5,'the mantle detached from its shoulders');
  assert.ok([...p.array].every(Number.isFinite),'cloth contains invalid positions');
 }
});
test('rolling recovery absorbs its landing without lingering floor penetration',()=>{
 idle();const move=rollMove();for(let i=0;i<=60;i++)actor.animate({state:'roll',attack:move,time:i/60*move.total,dt:move.total/60,rollDir:new T.Vector3(0,0,1)});
 for(let i=0;i<18;i++){actor.animate({state:'idle',time:i/60,dt:1/60,speed:0});const bounds=actualBounds();assert.ok(bounds.min>-.035,'a landing foot crossed the floor: '+bounds.min);assert.ok(bounds.min<.075,'landing held the character above the floor');}
});
test('roll recovery reaches the calibrated sword and shield carry before handing control back',()=>{
 for(const [,direction]of [...cardinalRolls,...diagonalRolls]){idle();const move=rollMove(direction);for(let i=0;i<=180;i++)actor.animate({state:'roll',attack:move,time:i/180*move.total,t:i/180*move.total,dt:move.total/180,rollDir:new T.Vector3(...direction).normalize()});
 const items=[actor.weapon.group,actor.shield],before=items.map(item=>({p:item.getWorldPosition(new T.Vector3()),q:item.getWorldQuaternion(new T.Quaternion())}));
 actor.animate({state:'idle',time:0,t:move.total,dt:1/60,speed:0});
 for(let i=0;i<items.length;i++){assert.ok(items[i].getWorldPosition(new T.Vector3()).distanceTo(before[i].p)<.035,'equipment jumped when the roll returned control');assert.ok(items[i].getWorldQuaternion(new T.Quaternion()).angleTo(before[i].q)<.12,'the wrist flipped on roll recovery');}
 }
});
test('paused sampling retains the actual source pose instead of resetting unchanged channels to bind pose',()=>{
 for(const speed of [1.3,1.85,4.4])for(const at of [.25,.5,.75]){
  idle();for(let t=0;t<at-1e-6;t+=1/120)actor.animate({state:'idle',time:t,t,dt:1/120,speed,moveX:0,moveZ:speed});
  const options={state:'idle',time:at,t:at,dt:0,speed,moveX:0,moveZ:speed},names=['hips','leftThigh','rightThigh','leftShin','rightShin','leftFoot','rightFoot'];
  const before=names.map(name=>actor.rig[name].quaternion.clone()),feet=actor.footBounds();actor.animate(options);
  for(let i=0;i<names.length;i++)assert.ok(before[i].angleTo(actor.rig[names[i]].quaternion)<.001,names[i]+' changed during a zero-time sample');
  const after=actor.footBounds();assert.ok(Math.abs(after.left.min-feet.left.min)<.001&&Math.abs(after.right.min-feet.right.min)<.001,'paused sampling changed the actual sole geometry');
 }
});

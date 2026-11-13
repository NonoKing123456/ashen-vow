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
for(const [name,direction]of [['forward',[0,0,1]],['backward',[0,0,-1]],['right',[1,0,0]],['diagonal',[-.7071,0,.7071]]])test('real '+name+' turn-and-roll folds the body and returns without root drift',()=>{
 idle();const initial=actor.root.position.clone(),move=C.getMove('roll'),dir=new T.Vector3(...direction);let compact=Infinity;
 for(let i=0;i<=72;i++){const time=i/72*move.total;actor.animate({state:'roll',attack:move,time,t:time,dt:move.total/72,speed:0,rollDir:dir});assert.ok(actor.root.position.equals(initial),'visual animation must not own world displacement');
   const bounds=actor.groundBounds();assert.ok(bounds.min>=.016,'skin probe went underground');const equipmentFloor=Math.min(new T.Box3().setFromObject(actor.weapon.group).min.y,actor.shield?.visible?new T.Box3().setFromObject(actor.shield).min.y:Infinity,actor.flask?new T.Box3().setFromObject(actor.flask).min.y:Infinity);if(i>54)assert.ok(Math.min(bounds.min,equipmentFloor)<.065,'late recovery lost ground contact at sample '+i);if(i>10&&i<54)compact=Math.min(compact,bounds.max-bounds.min);
   if([12,24,36,48,60].includes(i)){const actual=actualBounds();assert.ok(actual.min>-.035,'weighted mesh penetrates the floor: '+actual.min);assert.ok(actual.max<2.15,'roll vaults unnaturally above standing height');}
 }
 assert.ok(compact<1.35,'the actual roll must fold the body, rather than remain an upright evasive step');assert.ok(actor.pivot.quaternion.angleTo(new T.Quaternion())<.001,'evasion must finish upright at its controller duration');
 actor.animate({state:'idle',time:0,t:move.total,dt:1/60,speed:0});assert.ok(actor.pivot.quaternion.angleTo(new T.Quaternion())<.001,'recovery must not unwind a full turn');
});
test('a directional roll turns the source tumble along travel without an extra rigid somersault',()=>{
 idle();actor.root.rotation.y=Math.PI/2;const move=C.getMove('roll');
 for(let t=0;t<=move.total*.4;t+=1/120)actor.animate({state:'roll',attack:move,time:t,dt:1/120,rollDir:new T.Vector3(0,0,1)});
 const forward=new T.Vector3(0,0,1).applyQuaternion(actor.root.quaternion.clone().multiply(actor.pivot.quaternion));
 assert.ok(forward.distanceTo(new T.Vector3(0,0,1))<.01,'the forward source roll must face its actual travel');
 assert.equal(actor.motionFrame.style,'source-armed-roll');assert.equal(actor.currentClip,'Armed_Roll');
 assert.ok(Math.abs(new T.Vector3(0,1,0).applyQuaternion(actor.pivot.quaternion).y-1)<.001,'the pivot must not add a second rigid tumble');
});

test('the production roll has a real inverted trunk and tucked legs through its source cycle',()=>{
 idle();const move=C.getMove('roll');let inverted=false,bent=false;
 for(let i=0;i<=90;i++){actor.animate({state:'roll',attack:move,time:i/90*move.total,dt:move.total/90,rollDir:new T.Vector3(0,0,1)});const hip=actor.rig.hips.getWorldPosition(new T.Vector3()),head=actor.rig.head.getWorldPosition(new T.Vector3());if(head.y<hip.y-.1)inverted=true;const thigh=actor.rig.leftThigh.getWorldPosition(new T.Vector3()),knee=actor.rig.leftShin.getWorldPosition(new T.Vector3()),foot=actor.rig.leftFoot.getWorldPosition(new T.Vector3());if(knee.clone().sub(thigh).normalize().dot(foot.clone().sub(knee).normalize())<.5)bent=true;}
 assert.ok(inverted&&bent,'a crouching slide cannot satisfy the source roll baseline');
});

test('sword socket inherits a tumble once and remains attached to its hand',()=>{
 idle();const move=C.getMove('roll');actor.animate({state:'roll',attack:move,time:.22,dt:1/60,rollDir:new T.Vector3(0,0,1)});
 const hand=actor.rig.rightHand,grip=actor.weapon.grip,expected=hand.getWorldQuaternion(new T.Quaternion()).multiply(grip.bindInverse).multiply(grip.orientation).normalize(),actual=actor.weapon.group.getWorldQuaternion(new T.Quaternion());
 assert.ok(expected.angleTo(actual)<1e-5,'equipment applies the pivot rotation a second time');assert.ok(hand.localToWorld(grip.handOffset.clone()).distanceTo(actor.weapon.group.getWorldPosition(new T.Vector3()))<1e-5);
});
test('a completed roll can immediately enter a sword attack without a spinning recovery',()=>{
 idle();const roll=C.getMove('roll');for(let t=0;t<=roll.total;t+=1/120)actor.animate({state:'roll',attack:roll,time:t,dt:1/120,rollDir:new T.Vector3(0,0,-1)});
 const move=C.getMove('light');actor.animate({state:'attack',attack:move,time:0,dt:1/60,speed:0});assert.ok(actor.pivot.quaternion.angleTo(new T.Quaternion())<.015);assert.equal(actor.currentClip,'Sword_Regular_A');
});
test('stagger and death settle the weighted mesh on the floor',()=>{
 for(const state of ['stagger','dead']){idle();for(let i=0;i<=72;i++)actor.animate({state,dead:state==='dead',time:i/60,dt:1/60,speed:0});const bounds=actualBounds();assert.ok(bounds.min>-.035,'a fallen body penetrates the ground');assert.ok(bounds.min<.06,'a fallen body hovers above the ground');if(state==='dead')assert.ok(bounds.max<.8,'death should finish lying down');}
});
test('a tailored cloth mantle keeps its shoulder pins during running, turning and rolling',()=>{
 idle();assert.ok(actor.cape,'the player should have a finished cloth silhouette');
 const p=actor.cape.geometry.attributes.position,rest=actor.cape.userData.restPositions,weights=actor.cape.userData.fallWeights,pins=[];
 for(let i=0;i<p.count;i++)if(weights[i]===0)pins.push(i);assert.ok(pins.length>10,'the shoulder row needs fixed attachment points');
 const root=actor.root.position.clone(),move=C.getMove('roll');
 for(let frame=0;frame<120;frame++){
  const roll=frame>=60&&frame<100;
  actor.animate({state:roll?'roll':'idle',attack:roll?move:null,time:roll?(frame-60)/39*move.total:frame/60,t:frame/60,dt:1/60,speed:frame<50?5:0,yawRate:frame<50?3.4:0,rollDir:new T.Vector3(1,0,0),moveX:5,moveZ:0});
  assert.ok(actor.root.position.equals(root),'cloth must not pull the gameplay root');
  for(const i of pins)for(let axis=0;axis<3;axis++)assert.ok(Math.abs(p.array[i*3+axis]-rest[i*3+axis])<1e-5,'the mantle detached from its shoulders');
  assert.ok([...p.array].every(Number.isFinite),'cloth contains invalid positions');
 }
});
test('rolling recovery absorbs its landing without lingering floor penetration',()=>{
 idle();const move=C.getMove('roll');for(let i=0;i<=60;i++)actor.animate({state:'roll',attack:move,time:i/60*move.total,dt:move.total/60,rollDir:new T.Vector3(0,0,1)});
 for(let i=0;i<18;i++){actor.animate({state:'idle',time:i/60,dt:1/60,speed:0});const bounds=actualBounds();assert.ok(bounds.min>-.035,'a landing foot crossed the floor: '+bounds.min);assert.ok(bounds.min<.075,'landing held the character above the floor');}
});
test('roll recovery reaches the calibrated sword and shield carry before handing control back',()=>{
 idle();const move=C.getMove('roll');for(let i=0;i<=180;i++)actor.animate({state:'roll',attack:move,time:i/180*move.total,t:i/180*move.total,dt:move.total/180,rollDir:new T.Vector3(0,0,1)});
 const items=[actor.weapon.group,actor.shield],before=items.map(item=>({p:item.getWorldPosition(new T.Vector3()),q:item.getWorldQuaternion(new T.Quaternion())}));
 actor.animate({state:'idle',time:0,t:move.total,dt:1/60,speed:0});
 for(let i=0;i<items.length;i++){assert.ok(items[i].getWorldPosition(new T.Vector3()).distanceTo(before[i].p)<.035,'equipment jumped when the roll returned control');assert.ok(items[i].getWorldQuaternion(new T.Quaternion()).angleTo(before[i].q)<.12,'the wrist flipped on roll recovery');}
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

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const T=require('./vendor/three.min.js'),C=require('./feel.js');
global.THREE=T;global.window=global;global.self=global;
require('./vendor/GLTFLoader.js');require('./motion.js');require('./characters.js');
// Decode the shipped weighted mesh, skeleton and clips; only image decoding is
// replaced, since the Node fixture has no browser image surface.
T.TextureLoader.prototype.load=function(url,onLoad){const texture=new T.Texture();queueMicrotask(()=>onLoad(texture));return texture;};
T.GLTFLoader.prototype.load=function(url,onLoad,onProgress,onError){const b=fs.readFileSync(path.join(__dirname,url));this.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',onLoad,onError);};
let actor;
test.before(async()=>{await AshenCharacters.load({THREE:T,url:'assets/knight-v11.glb'});actor=AshenCharacters.createKnight({THREE:T,scene:new T.Scene()});});
function actualBounds(){const p=new T.Vector3();let min=Infinity,max=-Infinity;actor.root.updateMatrixWorld(true);actor.visual.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;mesh.skeleton.update();for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.boneTransform(i,p);p.applyMatrix4(mesh.matrixWorld);min=Math.min(min,p.y);max=Math.max(max,p.y);}});return {min,max};}
function idle(){actor.root.position.set(0,0,0);actor.root.rotation.set(0,0,0);for(let i=0;i<45;i++)actor.animate({state:'idle',time:i/60,t:i/60,dt:1/60,speed:0});}
for(const [name,direction]of [['forward',[0,0,1]],['backward',[0,0,-1]],['right',[1,0,0]],['diagonal',[-.7071,0,.7071]]])test('real '+name+' roll tucks, stays grounded and returns without root drift',()=>{
 idle();const initial=actor.root.position.clone(),move=C.getMove('roll'),dir=new T.Vector3(...direction);let compact=Infinity;
 for(let i=0;i<=72;i++){const time=i/72*move.total;actor.animate({state:'roll',attack:move,time,t:time,dt:move.total/72,speed:0,rollDir:dir});assert.ok(actor.root.position.equals(initial),'visual animation must not own world displacement');
   const bounds=actor.groundBounds();assert.ok(bounds.min>=.016,'skin probe went underground');assert.ok(bounds.min<.06,'rolling silhouette floats clear of the floor');if(i>10&&i<54)compact=Math.min(compact,bounds.max-bounds.min);
   if([12,24,36,48,60].includes(i)){const actual=actualBounds();assert.ok(actual.min>-.035,'weighted mesh penetrates the floor: '+actual.min);assert.ok(actual.max<2.15,'roll vaults unnaturally above standing height');}
 }
 assert.ok(compact<1.25,'knees and torso should form a compact rolling silhouette');assert.ok(actor.pivot.quaternion.angleTo(new T.Quaternion())<.001,'roll must finish upright at its controller duration');
 actor.animate({state:'idle',time:0,t:move.total,dt:1/60,speed:0});assert.ok(actor.pivot.quaternion.angleTo(new T.Quaternion())<.001,'recovery must not unwind a full turn');
});
test('directional roll rotates around the travel axis after character yaw',()=>{
 idle();actor.root.rotation.y=Math.PI/2;const move=C.getMove('roll');actor.animate({state:'roll',attack:move,time:move.total*.4,dt:1/60,rollDir:new T.Vector3(0,0,1)});
 const axis=new T.Vector3(actor.motionFrame.axis.x,0,actor.motionFrame.axis.z).applyQuaternion(actor.root.quaternion);assert.ok(axis.distanceTo(new T.Vector3(1,0,0))<1e-5);
});
test('sword socket inherits a tumble once and remains attached to its hand',()=>{
 idle();const move=C.getMove('roll');actor.animate({state:'roll',attack:move,time:.22,dt:1/60,rollDir:new T.Vector3(0,0,1)});
 const hand=actor.rig.rightHand,grip=actor.weapon.grip,expected=hand.getWorldQuaternion(new T.Quaternion()).multiply(grip.bindInverse).multiply(grip.orientation),actual=actor.weapon.group.getWorldQuaternion(new T.Quaternion());
 assert.ok(expected.angleTo(actual)<1e-5,'equipment applies the pivot rotation a second time');assert.ok(hand.getWorldPosition(new T.Vector3()).distanceTo(actor.weapon.group.getWorldPosition(new T.Vector3()))<1e-5);
});
test('a completed roll can immediately enter a sword attack without a spinning recovery',()=>{
 idle();const roll=C.getMove('roll');for(let t=0;t<=roll.total;t+=1/120)actor.animate({state:'roll',attack:roll,time:t,dt:1/120,rollDir:new T.Vector3(0,0,-1)});
 const move=C.getMove('light');actor.animate({state:'attack',attack:move,time:0,dt:1/60,speed:0});assert.ok(actor.pivot.quaternion.angleTo(new T.Quaternion())<.015);assert.equal(actor.currentClip,'authored-sword-attack');
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

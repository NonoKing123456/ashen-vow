const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const T=require('./vendor/three.min.js'),C=require('./feel.js');
global.THREE=T;global.window=global;global.self=global;
require('./vendor/GLTFLoader.js');require('./navigation.js');require('./locomotion.js');require('./rig-constraints.js');require('./motion.js');require('./characters.js');
T.TextureLoader.prototype.load=function(u,f){const t=new T.Texture();queueMicrotask(()=>f(t));return t};
T.GLTFLoader.prototype.load=function(u,f,p,e){const b=fs.readFileSync(u);this.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',f,e)};
test.before(async()=>AshenCharacters.load({THREE:T,url:'assets/knight-v11.glb'}));
const vertex=new T.Vector3();
function rigidMinimum(root){let min=Infinity;root.updateWorldMatrix(true,true);root.traverse(mesh=>{if(!mesh.isMesh||!mesh.visible)return;const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){vertex.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);min=Math.min(min,vertex.y);}});return min;}
for(const mode of ['idle','walk','run','back','side','guard','light','heavy','roll','heal','hurt','dead'])test('actual '+mode+' keeps feet, blade and cloth above the shared floor',()=>{
 const a=AshenCharacters.createKnight({THREE:T,scene:new T.Scene()});let feet=100,blade=100,shield=100,cape=100,flask=100;
 const move=mode==='roll'?C.getMove('roll'):['light','heavy'].includes(mode)?C.getMove(mode):null;
 for(let i=0;i<100;i++){
  const t=i/60,state=['dead','hurt','heal','roll'].includes(mode)?mode:move?'attack':'idle',speed=['walk','back','side'].includes(mode)?1.85:mode==='run'?4.4:0;
  a.animate({state,time:move?Math.min(t,move.total):t,t,dt:1/60,speed,moveX:mode==='side'?speed:0,moveZ:mode==='back'?-speed:mode==='side'?0:speed,guarding:mode==='guard',combat:mode==='guard'||!!move,attack:move,dead:mode==='dead',rollDir:new T.Vector3(0,0,1)});
  const f=a.footBounds();feet=Math.min(feet,f.left.min,f.right.min);blade=Math.min(blade,rigidMinimum(a.weapon.group));cape=Math.min(cape,rigidMinimum(a.cape));if(a.flask)flask=Math.min(flask,rigidMinimum(a.flask));if(a.shield?.visible)shield=Math.min(shield,rigidMinimum(a.shield));
 }
 assert.ok(feet>-.003,JSON.stringify({feet,blade,shield,cape}));assert.ok(cape>.012,JSON.stringify({feet,blade,shield,cape}));
 assert.ok(flask>.005,'the carried flask intersects the ground: '+flask);assert.ok(blade>.005,JSON.stringify({feet,blade,shield,cape}));assert.ok(shield>.005,JSON.stringify({feet,blade,shield,cape}));
});
function weightedSurface(actor){
 const surfaces=[];actor.root.updateMatrixWorld(true);actor.visual.traverse(mesh=>{
  if(!mesh.isSkinnedMesh)return;mesh.skeleton.update();const p=mesh.geometry.attributes.position,si=mesh.geometry.attributes.skinIndex,sw=mesh.geometry.attributes.skinWeight,points=[],joints=[],methods=['getX','getY','getZ','getW'];
  for(let i=0;i<p.count;i++){points.push(mesh.boneTransform(i,new T.Vector3()).applyMatrix4(mesh.matrixWorld));let weight=-1,index=0;for(const method of methods){const value=sw[method](i);if(value>weight){weight=value;index=si[method](i);}}joints.push(mesh.skeleton.bones[index]?.name||'');}
  const indices=mesh.geometry.index;surfaces.push({points,joints,count:indices?indices.count:p.count,index:i=>indices?indices.getX(i):i});
 });return surfaces;
}
function crosses(surface,from,to,filter){
 const delta=to.clone().sub(from),length=delta.length(),ray=new T.Ray(from,delta.normalize()),hit=new T.Vector3();
 for(const s of surface)for(let i=0;i<s.count;i+=3){const ids=[s.index(i),s.index(i+1),s.index(i+2)];if(ids.filter(j=>filter.test(s.joints[j])).length<2)continue;const a=s.points[ids[0]],b=s.points[ids[1]],c=s.points[ids[2]];if(ray.intersectTriangle(a,b,c,false,hit)&&hit.distanceTo(from)<length-.0005)return s.joints[ids[0]];}
 return null;
}
for(const [name,dir,times]of [['forward roll',[0,0,1],[.21,.35,.56]],['side roll',[1,0,0],[.21,.35,.567]],['fallen',[0,0,1],[.50,.75,1.0]],['light',[0,0,1],[.09,.20,.35,.60]],['heavy',[0,0,1],[.25,.53,.85,1.12]],['critical',[0,0,1],[.15,.34,.62,1.12]]])test('real weighted '+name+' separates the held steel from its own body',()=>{
 const a=AshenCharacters.createKnight({THREE:T,scene:new T.Scene()}),dead=name==='fallen',rolling=name.includes('roll'),move=C.getMove(rolling?'roll':dead?'roll':name);
 for(let i=0;i<45;i++)a.animate({state:'idle',time:i/60,dt:1/60,t:i/60,speed:0});let next=0;
 for(let i=0;i<150&&next<times.length;i++){
  const time=i/120;a.animate({state:dead?'dead':rolling?'roll':'attack',dead,combat:!rolling,attack:dead?null:move,time,dt:1/120,t:time,speed:0,rollDir:new T.Vector3(...dir)});if(time+1e-5<times[next])continue;next++;
  const surface=weightedSurface(a),base=a.weapon.group.localToWorld(a.weapon.base.clone()),tip=a.weapon.group.localToWorld(a.weapon.tip.clone());
  assert.equal(crosses(surface,base,tip,/thigh|shin|pelvis|spine|chest|head/i),null,'the blade cuts a weighted body surface at '+time);
  if(a.shield?.visible){const back=a.shield.userData.structure.backPlane;for(const x of [-.20,-.10,0,.10,.20])for(const y of [-.20,-.08,.05,.18,.30]){if((x/.286)**2+((y-.05)/.337)**2>.82)continue;const from=a.shield.localToWorld(new T.Vector3(x,y,back+.002)),to=a.shield.localToWorld(new T.Vector3(x,y,back+.034));assert.equal(crosses(surface,from,to,/thigh|shin|pelvis|spine|chest|head|forearm|upperarm/i),null,'the solid shield slices a weighted limb at '+time);}}
 }
});

for(const mode of ['idle','guard','attack'])test('wall-aware '+mode+' keeps the real held geometry inside a narrow corner',()=>{
 const a=AshenCharacters.createKnight({THREE:T,scene:new T.Scene()}),obstacles=[{x:0,z:.51,w:4,d:.1,h:3},{x:.51,z:0,w:.1,d:4,h:3}],move=C.getMove('light'),entity={x:0,z:0,radius:.46},world={bounds:[{x:0,z:0,w:20,d:20}],obstacles};
 for(let i=0;i<60;i++){
  a.animate({state:mode==='attack'?'attack':'idle',time:mode==='attack'?Math.min(i/60,move.total):i/60,dt:1/60,t:i/60,speed:0,guarding:mode==='guard',combat:true,attack:mode==='attack'?move:null,obstacles});
  const fit=AshenNavigation.fitPose(entity,a.contactPoints,world);assert.equal(fit.resolved,true);a.root.position.set(entity.x,0,entity.z);a.updateEquipment();
  for(const item of [a.weapon.group,a.shield])if(item?.visible){item.updateWorldMatrix(true,true);item.traverse(mesh=>{if(!mesh.isMesh)return;const p=mesh.geometry.attributes.position;for(let j=0;j<p.count;j++){vertex.fromBufferAttribute(p,j).applyMatrix4(mesh.matrixWorld);assert.ok(vertex.x<.463&&vertex.z<.463,'held geometry crosses the solid wall at '+i+': '+vertex.toArray());}});}
 }
 for(const surface of weightedSurface(a))for(const p of surface.points)assert.ok(p.x<.463&&p.z<.463,'weighted armour crosses a wall: '+p.toArray());
});
test('recovery keeps the shield equipped and activates the carried ember flask',()=>{
 const a=AshenCharacters.createKnight({THREE:T,scene:new T.Scene()});assert.ok(a.flask&&a.flaskMaterial);let glow=0;
 for(let i=0;i<75;i++){a.animate({state:'heal',time:i/60,t:i/60,dt:1/60,speed:0});assert.equal(a.shield.visible,true);assert.equal(a.flask.visible,true);glow=Math.max(glow,a.flaskMaterial.emissiveIntensity);}
 assert.ok(glow>.7);a.animate({state:'idle',time:0,t:1.3,dt:1/60,speed:0});assert.ok(a.flaskMaterial.emissiveIntensity<.1);
});
test('every authored strike returns to the same combat grip without a wrist flip',()=>{
 for(const kind of ['light','heavy','critical']){
  const a=AshenCharacters.createKnight({THREE:T,scene:new T.Scene()}),move=C.getMove(kind);
  for(let i=0;i<60;i++)a.animate({state:'idle',time:i/60,t:i/60,dt:1/60,speed:0,combat:true});
  for(let t=0;t<move.total;t+=1/120)a.animate({state:'attack',attack:move,time:t,t:1+t,dt:1/120,speed:0,combat:true});
  a.animate({state:'attack',attack:move,time:move.total,t:1+move.total,dt:1/120,speed:0,combat:true});
  const before=a.weapon.group.getWorldQuaternion(new T.Quaternion()),grip=a.weapon.group.getWorldPosition(new T.Vector3());
  a.animate({state:'idle',time:0,t:1+move.total+1/60,dt:1/60,speed:0,combat:true});
  const after=a.weapon.group.getWorldQuaternion(new T.Quaternion());assert.ok(before.angleTo(after)<.15,kind+' snaps its wrist on recovery');assert.ok(grip.distanceTo(a.weapon.group.getWorldPosition(new T.Vector3()))<.08,kind+' jumps its palm on recovery');
 }
});
for(const [name,yaw,direction]of [['forward evasion',0,[0,0,1]],['lateral evasion',0,[1,0,0]],['backward evasion',Math.PI/2,[-1,0,0]],['fallen',0,[0,0,1]],['fallen turned',Math.PI/2,[0,0,1]]])test('final production '+name+' respects the corner throughout its actual pose',()=>{
 const a=AshenCharacters.createKnight({THREE:T,scene:new T.Scene()}),e={x:0,z:0,radius:.46},obstacles=[{x:0,z:.51,w:5,d:.1,h:3},{x:.51,z:0,w:.1,d:5,h:3}],bounds=[{x:0,z:0,w:20,d:20}],dead=name.startsWith('fallen'),move=C.getMove('roll');a.root.rotation.y=yaw;
 for(let i=0;i<=Math.ceil((dead?2.4:move.total)*120);i++){
  const time=i/120;a.animate({state:dead?'dead':'roll',dead,attack:dead?null:move,time,t:time,dt:1/120,speed:0,rollDir:new T.Vector3(...direction),obstacles});
  const fit=AshenNavigation.fitPose(e,a.contactPoints,{bounds,obstacles,player:e});assert.equal(fit.resolved,true,'a feasible pose was not separated from the wall');a.root.position.set(e.x,0,e.z);a.updateEquipment();
  for(const p of a.skinContactPoints())assert.ok(p.x<.46&&p.z<.46,'a body probe crossed the wall');
  if(i%10!==0)continue;
  for(const surface of weightedSurface(a))for(const p of surface.points)assert.ok(p.x<.463&&p.z<.463,'actual weighted armour crosses a wall at '+time+': '+p.toArray());
  for(const item of [a.weapon.group,a.shield,a.cape])if(item?.visible){item.updateWorldMatrix(true,true);item.traverse(mesh=>{if(!mesh.isMesh)return;const p=mesh.geometry.attributes.position;for(let j=0;j<p.count;j++){vertex.fromBufferAttribute(p,j).applyMatrix4(mesh.matrixWorld);assert.ok(vertex.x<.463&&vertex.z<.463,'actual equipment crosses a wall at '+time+': '+vertex.toArray());}});}
 }
});
test('a planted production foot keeps its world contact during real forward displacement and releases on turning',()=>{
 const a=AshenCharacters.createKnight({THREE:T,scene:new T.Scene()});let held=0,maxError=0;
 for(let i=0;i<300;i++){
  a.root.position.z+=1.3/60;a.animate({state:'idle',time:i/60,t:i/60,dt:1/60,speed:1.3,moveX:0,moveZ:1.3});
  for(const side of ['left','right'])if(a.footPlant[side]?.active){held++;const actual=a.rig[side+'Foot'].getWorldPosition(new T.Vector3()),anchor=a.footPlant[side].anchor;maxError=Math.max(maxError,actual.distanceTo(anchor));const sole=a.footBounds()[side].min;assert.ok(sole>-.01,'locking pushed the actual sole below ground');}
 }
 assert.ok(held>15,'no meaningful support window was exercised');assert.ok(maxError<.003,'the foot did not hold its world contact: '+maxError);
 a.root.rotation.y+=.2;a.animate({state:'idle',time:5.1,t:5.1,dt:1/60,speed:1.3,moveX:1.3,moveZ:0,yawRate:4});assert.ok(!a.footPlant.left.active&&!a.footPlant.right.active,'a turn must release both contacts');
});

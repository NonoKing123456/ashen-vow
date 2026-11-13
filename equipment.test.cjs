const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const T=require('./vendor/three.min.js'),C=require('./feel.js');
global.THREE=T;global.window=global;global.self=global;
require('./vendor/GLTFLoader.js');require('./locomotion.js');require('./rig-constraints.js');require('./motion.js');require('./characters.js');
T.TextureLoader.prototype.load=function(url,onLoad){const texture=new T.Texture();queueMicrotask(()=>onLoad(texture));return texture;};
let sourceGeometry,sourceHands={},actor;
T.GLTFLoader.prototype.load=function(url,onLoad,onProgress,onError){const b=fs.readFileSync(url);this.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',g=>{
 g.scene.updateMatrixWorld(true);g.scene.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;sourceGeometry=mesh.geometry;for(const side of ['L','R']){const bone=mesh.skeleton.bones.find(b=>b.name==='hand_'+side),joint=mesh.skeleton.bones.indexOf(bone),matrix=bone.matrixWorld.clone().invert().multiply(mesh.matrixWorld),indices=[];
  const si=mesh.geometry.attributes.skinIndex,sw=mesh.geometry.attributes.skinWeight;for(let i=0;i<si.count;i++){let w=0;for(const key of ['X','Y','Z','W'])if(si['get'+key](i)===joint)w+=sw['get'+key](i);if(w>.8)indices.push(i);}sourceHands[side]={matrix,indices};
 }});onLoad(g);
},onError);};
test.before(async()=>{await AshenCharacters.load({THREE:T,url:'assets/knight-v11.glb'});actor=AshenCharacters.createKnight({THREE:T,scene:new T.Scene()});});
function settle(){for(let i=0;i<30;i++)actor.animate({state:'idle',time:i/60,t:i/60,dt:1/60,speed:0});}
test('shield has opaque front and rear coverage across its usable surface',()=>{
 settle();const shield=actor.shield,ray=new T.Raycaster();
 for(const [x,y]of [[0,.05],[-.19,.05],[.19,.05],[0,.28],[0,-.18]])for(const side of [-1,1]){
  const origin=shield.localToWorld(new T.Vector3(x,y,side*.65)),direction=new T.Vector3(0,0,-side).transformDirection(shield.matrixWorld);
  ray.set(origin,direction);const hits=ray.intersectObject(shield,true);assert.ok(hits.length,'shield is empty from '+[x,y,side]);
  const hit=hits[0],material=Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;assert.equal(material.transparent,false);assert.equal(material.opacity,1);
 }
 assert.ok(shield.children.some(o=>/palm grip/.test(o.name)));assert.ok(shield.children.filter(o=>/forearm strap/.test(o.name)).length>=2);
});
test('timber shield core is a closed solid after welding texture seams',()=>{
 const core=actor.shield.children.find(o=>/closed timber core/.test(o.name)),p=core.geometry.attributes.position,index=core.geometry.index,edges=new Map();
 const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(n=>Math.round(n*1e6)).join(',');
 for(let i=0;i<index.count;i+=3){const tri=[key(index.getX(i)),key(index.getX(i+1)),key(index.getX(i+2))];if(new Set(tri).size<3)continue;for(let j=0;j<3;j++){const e=[tri[j],tri[(j+1)%3]].sort().join('|');edges.set(e,(edges.get(e)||0)+1);}}
 assert.ok(edges.size>100);assert.equal([...edges.values()].filter(n=>n!==2).length,0,'the shield has an unsealed rear or edge');
 assert.ok(core.geometry.boundingBox||new T.Box3().setFromBufferAttribute(p));
 const bounds=new T.Box3().setFromBufferAttribute(p);assert.ok(bounds.max.z-bounds.min.z>.03,'shield has no physical thickness');
});
test('blade starts beyond the crossguard and leaves the palm on the leather grip',()=>{
 const group=actor.weapon.group,blade=group.getObjectByName('sword / forged blade'),handle=group.getObjectByName('sword / leather grip'),guard=group.getObjectByName('sword / crossguard');
 const steel=new T.Box3().setFromBufferAttribute(blade.geometry.attributes.position),leather=new T.Box3().setFromBufferAttribute(handle.geometry.attributes.position),cross=new T.Box3().setFromBufferAttribute(guard.geometry.attributes.position).translate(guard.position);
 assert.ok(steel.max.y<=cross.min.y+.001,'the blade extends into the palm and over the leather');assert.ok(leather.min.y<-.07&&leather.max.y>.07);assert.equal(handle.position.length(),0);
 const edges=new Map(),p=blade.geometry.attributes.position,key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(n=>Math.round(n*1e6)).join(',');for(let i=0;i<p.count;i+=3){const tri=[key(i),key(i+1),key(i+2)];for(let j=0;j<3;j++){const e=[tri[j],tri[(j+1)%3]].sort().join('|');edges.set(e,(edges.get(e)||0)+1);}}
 assert.equal([...edges.values()].filter(n=>n!==2).length,0,'blade base or tip is an open shell');
});
test('sword and shield grip centres follow the actual palm through yaw and every planned tumble direction',()=>{
 const directions=[[[0,0,1],'Knight_Roll'],[[0,0,-1],'Knight_Roll_Back'],[[1,0,0],'Knight_Roll_Left'],[[-1,0,0],'Knight_Roll_Right'],[[.6,0,.8],'Knight_Roll'],[[-.6,0,-.8],'Knight_Roll_Back']];
 for(const yaw of [0,Math.PI/2,-Math.PI*.7])for(const [localDirection,expectedSource]of directions){
  actor.root.rotation.y=yaw;settle();
  const direction=new T.Vector3(...localDirection).normalize().applyAxisAngle(new T.Vector3(0,1,0),yaw),roll=actor.planRoll(C.getMove('roll'),direction,yaw);
  assert.ok(roll.rollPlan,'the grip fixture did not commit a native directional source');assert.equal(roll.animation.clip,expectedSource);
  for(let i=0;i<=Math.ceil(roll.total*60);i++){
  const time=Math.min(i/60,roll.total);actor.animate({state:'roll',attack:roll,time,t:time,dt:1/60,speed:0});assert.equal(actor.motionFrame.source,expectedSource);assert.equal(actor.weapon.group.visible,true);assert.equal(actor.shield.visible,true,'the native tumble must retain the equipped shield');
  for(const [item,hand]of [[actor.weapon.group,actor.rig.rightHand],[actor.shield,actor.rig.leftHand]]){
   const grip=item===actor.shield?actor.shield.grip:actor.weapon.grip,expectedPoint=hand.localToWorld(grip.handOffset.clone()),actualPoint=item.getWorldPosition(new T.Vector3());
   assert.ok(actualPoint.distanceTo(expectedPoint)<1e-5,'a grip drifted from the palm');
   const expectedQ=hand.getWorldQuaternion(new T.Quaternion()).multiply(grip.bindInverse).multiply(grip.orientation).normalize(),actualQ=item.getWorldQuaternion(new T.Quaternion()).normalize();assert.ok(actualQ.angleTo(expectedQ)<1e-5,'equipment inherited the root twice');
  }
  }
 }
 actor.root.rotation.y=0;
});
test('gauntlet fingers close around a transverse grip while wrist armour stays unchanged',()=>{
 const mesh=actor.visual.getObjectByName('body'),p=mesh.geometry.attributes.position,raw=sourceGeometry.attributes.position;
 for(const side of ['L','R']){const {indices,matrix}=sourceHands[side],closed=new T.Box3();let retainedWrist=0,curled=0;
  for(const i of indices){const original=new T.Vector3().fromBufferAttribute(raw,i).applyMatrix4(matrix),now=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(matrix);if(original.y<.065){assert.ok(now.distanceTo(original)<1e-6);retainedWrist++;}if(original.y>.14){assert.ok(now.y<.125,'a finger remains visibly extended');assert.ok(now.x>original.x+.025,'the finger never curled into the palm');curled++;}closed.expandByPoint(now);}
  assert.ok(retainedWrist>50&&curled>100);assert.ok(closed.max.y<.126);assert.ok(closed.max.x>.05);
 }
});
test('the gripping hand remains behind the physical shield backboard',()=>{
 settle();const mesh=actor.visual.getObjectByName('body'),back=actor.shield.userData.structure.backPlane;
 for(const guarding of [false,true])for(let frame=0;frame<12;frame++){
  actor.animate({state:'idle',guarding,time:frame/30,t:frame/30,dt:1/30,speed:0});mesh.skeleton.update();
  for(const index of sourceHands.L.indices){const p=new T.Vector3();mesh.boneTransform(index,p);p.applyMatrix4(mesh.matrixWorld);actor.shield.worldToLocal(p);assert.ok(p.z<back-.004,'hand/backboard clearance '+p.z+' guarding='+guarding+' frame='+frame+' vertex='+index+' point='+p.toArray());}
 }
});
test('foot probes use real interleaved joint weights and agree with the weighted feet',()=>{
 settle();const mesh=actor.visual.getObjectByName('body'),si=mesh.geometry.attributes.skinIndex,sw=mesh.geometry.attributes.skinWeight,groups={left:[],right:[]};
 for(let i=0;i<si.count;i++){let joint=0,weight=-1;for(const key of ['X','Y','Z','W']){const w=sw['get'+key](i);if(w>weight){weight=w;joint=si['get'+key](i);}}const name=mesh.skeleton.bones[joint].name;if(/^(foot|toe)_L$/.test(name))groups.left.push(i);if(/^(foot|toe)_R$/.test(name))groups.right.push(i);}
 assert.ok(actor.probeStats.leftFoot<150&&actor.probeStats.rightFoot<150);assert.ok(groups.left.length>100&&groups.right.length>100);
 for(let frame=0;frame<12;frame++){
  actor.animate({state:'idle',time:frame/30,t:frame/30,dt:1/30,speed:2.5,moveX:0,moveZ:2.5});const actual=actor.footBounds();mesh.skeleton.update();
  for(const side of ['left','right']){let min=Infinity,max=-Infinity;for(const i of groups[side]){const p=new T.Vector3();mesh.boneTransform(i,p);p.applyMatrix4(mesh.matrixWorld);min=Math.min(min,p.y);max=Math.max(max,p.y);}assert.ok(Math.abs(actual[side].min-min)<.012);assert.ok(Math.abs(actual[side].max-max)<.012);}
 }
});

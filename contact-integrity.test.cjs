// Offline geometric acceptance: real weighted triangles, never a runtime solver.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{performance}=require('node:perf_hooks');
const T=require('./vendor/three.min.js'),C=require('./feel.js');global.THREE=T;global.window=global;global.self=global;
require('./vendor/GLTFLoader.js');require('./navigation.js');require('./locomotion.js');require('./rig-constraints.js');require('./motion.js');require('./characters.js');
T.TextureLoader.prototype.load=(url,done)=>{const t=new T.Texture();queueMicrotask(()=>done(t));return t;};
T.GLTFLoader.prototype.load=function(url,done,progress,fail){const b=fs.readFileSync(url);this.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',done,fail);};
test.before(async()=>AshenCharacters.load({THREE:T,url:'assets/knight-v11.glb'}));
function weighted(actor){const surfaces=[];actor.root.updateWorldMatrix(true,true);actor.visual.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;mesh.skeleton.update();const p=mesh.geometry.attributes.position,si=mesh.geometry.attributes.skinIndex,sw=mesh.geometry.attributes.skinWeight,points=[],joints=[];for(let i=0;i<p.count;i++){points.push(mesh.boneTransform(i,new T.Vector3()).applyMatrix4(mesh.matrixWorld));let best=-1,joint=0;for(const key of ['X','Y','Z','W'])if(sw['get'+key](i)>best){best=sw['get'+key](i);joint=si['get'+key](i);}joints.push(mesh.skeleton.bones[joint].name);}const index=mesh.geometry.index;surfaces.push({points,joints,count:index?index.count:p.count,index:i=>index?index.getX(i):i});});return surfaces;}
function crossing(surface,a,b,filter){const delta=b.clone().sub(a),length=delta.length(),ray=new T.Ray(a,delta.normalize()),point=new T.Vector3();for(const s of surface)for(let i=0;i<s.count;i+=3){const ids=[s.index(i),s.index(i+1),s.index(i+2)];if(ids.filter(j=>filter.test(s.joints[j])).length<2)continue;if(ray.intersectTriangle(s.points[ids[0]],s.points[ids[1]],s.points[ids[2]],false,point)&&point.distanceTo(a)<length-.0005)return s.joints[ids[0]];}return null;}
function settle(actor){for(let i=0;i<24;i++)actor.animate({state:'idle',time:i/60,t:i/60,dt:1/60,speed:0});}
function check(actor,label){
 const surface=weighted(actor),base=actor.weapon.group.localToWorld(actor.weapon.base.clone()),tip=actor.weapon.group.localToWorld(actor.weapon.tip.clone());
 assert.equal(crossing(surface,base,tip,/thigh|shin|pelvis|spine|chest|head/i),null,label+': blade through weighted armour');
 if(actor.shield){
  const back=actor.shield.userData.structure.backPlane;
  for(const x of [-.20,-.10,0,.10,.20])for(const y of [-.20,-.08,.05,.18,.30]){if((x/.286)**2+((y-.05)/.337)**2>.82)continue;const from=actor.shield.localToWorld(new T.Vector3(x,y,back+.002)),to=actor.shield.localToWorld(new T.Vector3(x,y,back+.034));assert.equal(crossing(surface,from,to,/thigh|shin|pelvis|spine|chest|head|forearm|upperarm/i),null,label+': shield through weighted armour');}
  const ray=new T.Raycaster(base,tip.clone().sub(base).normalize(),0,base.distanceTo(tip));assert.equal(ray.intersectObject(actor.shield,true).length,0,label+': blade through actual shield geometry');
  for(const [item,hand]of [[actor.weapon.group,actor.rig.rightHand],[actor.shield,actor.rig.leftHand]]){const grip=item===actor.shield?actor.shield.grip:actor.weapon.grip,expected=hand.localToWorld(grip.handOffset.clone());assert.ok(expected.distanceTo(item.getWorldPosition(new T.Vector3()))<1e-5,label+': grip left its palm');assert.equal(item.visible,true);}
 }
}
for(const [mode,time]of [['carry',.5],['guard',.5],['light',.25],['lightB',.3],['heavy',.55],['critical',.15],['critical',.34],['roll',.35],['roll',.6]])test('production contact integrity '+mode+' at '+time,()=>{
 const a=AshenCharacters.createKnight({THREE:T,scene:new T.Scene()});settle(a);const move=mode==='roll'?C.getMove('roll'):mode==='lightB'?C.getMove('light',1):['light','heavy','critical'].includes(mode)?C.getMove(mode):null;
 for(let t=0;t<time-1e-7;t+=1/120)a.animate({state:mode==='roll'?'roll':move?'attack':'idle',attack:move,time:t,t:1+t,dt:1/120,speed:0,guarding:mode==='guard',rollDir:new T.Vector3(0,0,1)});
 a.animate({state:mode==='roll'?'roll':move?'attack':'idle',attack:move,time,t:1+time,dt:1/120,speed:0,guarding:mode==='guard',rollDir:new T.Vector3(0,0,1)});check(a,mode+' '+time);
});
test('contact runtime stays bounded on ordinary carry and a source cut',()=>{
 const a=AshenCharacters.createKnight({THREE:T,scene:new T.Scene()});settle(a);let worst=0,total=0,correction=0;const move=C.getMove('light');
 for(let i=0;i<120;i++){const state=i<60?'idle':'attack',time=(i%60)/60,start=performance.now();a.animate({state,time,t:i/60,attack:state==='attack'?move:null,dt:1/60,speed:0});const duration=performance.now()-start;worst=Math.max(worst,duration);total+=duration;correction=Math.max(correction,a.equipmentIntegrity?.leftShift||0,a.equipmentIntegrity?.rightShift||0);}
 console.log('Contact runtime sample:',JSON.stringify({meanMs:total/120,worstMs:worst,maxPalmCorrectionM:correction}));assert.ok(total/120<8,'contact solving regressed into per-frame mesh optimization');
});

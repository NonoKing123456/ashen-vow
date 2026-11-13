// Production footwork acceptance. Source poses, skin weights and navigation are
// real; only texture decoding is omitted. These checks do not judge animation style.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const T=require('./vendor/three.min.js');
global.THREE=T;global.window=global;global.self=global;
for(const file of ['vendor/GLTFLoader.js','navigation.js','locomotion.js','rig-constraints.js','motion.js','characters.js'])require('./'+file);
const createConstraints=AshenRigConstraints.create;
AshenRigConstraints.create=(actor,three)=>{const constraints=createConstraints(actor,three),plant=constraints.plantFeet;constraints.plantFeet=options=>{const before={};for(const side of ['left','right'])before[side]=actor.rig[side+'Foot'].getWorldPosition(new T.Vector3());plant(options);actor.acceptancePlantCorrection={};for(const side of ['left','right'])actor.acceptancePlantCorrection[side]=actor.rig[side+'Foot'].getWorldPosition(new T.Vector3()).sub(before[side]);};return constraints;};
T.TextureLoader.prototype.load=(url,done)=>{const texture=new T.Texture();queueMicrotask(()=>done(texture));return texture;};
T.GLTFLoader.prototype.load=function(url,done,progress,fail){const b=fs.readFileSync(path.join(__dirname,url));this.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',done,fail);};
const clips=['Knight_Strafe_Left','Knight_Strafe_Right','Knight_Backward'],V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const sourceSupport=new Map();
test.before(async()=>{
 await AshenCharacters.load({THREE:T,url:'assets/knight-v11.glb',motionUrl:['assets/knight-motion-v16.glb','assets/knight-footwork-v16.glb']});
 // Establish intended support from each actual source, independently of the
 // runtime contact flags. A low, flat forward-swing sole is not a planted foot.
 const a=AshenCharacters.createKnight({THREE:T,scene:new T.Scene()}),read=soleReader(a),samples=256;
 for(const clip of a.clips.filter(c=>['Walk','Run',...clips].includes(c.name))){
  a.mixer.stopAllAction();a.pivot.position.y=.95;a.pivot.quaternion.identity();const action=a.mixer.clipAction(clip);action.reset().setEffectiveWeight(1).setLoop(T.LoopRepeat,Infinity).play();action.paused=true;
  const direction=clip.userData.locomotion?.direction||[0,0,1],distance=clip.userData.locomotion?.stride_distance_m||a.gait[clip.name.toLowerCase()]?.distance,curve=[];
  for(let i=0;i<samples;i++){action.time=i/samples*clip.duration;a.mixer.update(0);curve.push(read());}
  const floor={left:Math.min(...curve.map(f=>f.left.min)),right:Math.min(...curve.map(f=>f.right.min))},support={left:[],right:[]};
  for(let i=0;i<samples;i++)for(const side of ['left','right']){
   const f=curve[i][side],before=curve[(i+samples-1)%samples][side].centre,after=curve[(i+1)%samples][side].centre,vx=(after.x-before.x)*samples/(2*clip.duration),vz=(after.z-before.z)*samples/(2*clip.duration),windows=clip.userData.locomotion?.contact_windows?.[side];
   const intended=windows?windows.some(([lo,hi])=>i/samples>=lo&&i/samples<=hi):Math.hypot(vx+direction[0]*distance/clip.duration,vz+direction[2]*distance/clip.duration)<.15;
   support[side].push(f.min<floor[side]+.035&&intended?1:0);
  }
  sourceSupport.set(clip.name,{duration:clip.duration,support});
 }
});

function soleReader(actor){
 const meshes=[];
 actor.visual.traverse(mesh=>{
  if(!mesh.isSkinnedMesh)return;const p=mesh.geometry.attributes.position,indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight,sets={left:[],right:[]};
  for(let i=0;i<p.count;i++){let highest=-1,joint=0;for(const key of ['X','Y','Z','W']){const w=weights['get'+key](i);if(w>highest){highest=w;joint=indices['get'+key](i);}}const name=mesh.skeleton.bones[joint]?.name,side=/^(foot|toe)_L$/i.test(name)?'left':/^(foot|toe)_R$/i.test(name)?'right':null;if(side)sets[side].push(i);}
  const soles={};for(const side of ['left','right']){assert.ok(sets[side].length>20,'actual weighted foot vertices are required');const low=Math.min(...sets[side].map(i=>p.getY(i)));soles[side]=new Set(sets[side].filter(i=>p.getY(i)<low+.025));assert.ok(soles[side].size>5);}
  meshes.push({mesh,sets,soles});
 });
 const point=V();return ()=>{
  actor.root.updateWorldMatrix(true,true);const feet={left:{min:Infinity,flatMax:-Infinity,centre:V(),count:0},right:{min:Infinity,flatMax:-Infinity,centre:V(),count:0}};
  for(const {mesh,sets,soles}of meshes){mesh.skeleton.update();for(const side of ['left','right'])for(const i of sets[side]){mesh.boneTransform(i,point);point.applyMatrix4(mesh.matrixWorld);feet[side].min=Math.min(feet[side].min,point.y);if(soles[side].has(i)){feet[side].centre.add(point);feet[side].flatMax=Math.max(feet[side].flatMax,point.y);feet[side].count++;}}}
  for(const side of ['left','right'])feet[side].centre.divideScalar(feet[side].count);return feet;
 };
}
function fixture(yaw=0){
 const actor=AshenCharacters.createKnight({THREE:T,scene:new T.Scene()}),entity={x:0,z:0,radius:.46,kind:'player'},world={bounds:[{x:0,z:0,w:100,d:100}],obstacles:[],entities:[]};
 actor.root.rotation.y=yaw;let elapsed=0,lastOptions=null;const read=soleReader(actor);
 for(let i=0;i<60;i++){actor.animate({state:'idle',time:elapsed,t:elapsed,dt:1/60,speed:0});elapsed+=1/60;}
 const lengths={};for(const side of ['left','right'])lengths[side]=[actor.rig[side+'Thigh'].getWorldPosition(V()).distanceTo(actor.rig[side+'Shin'].getWorldPosition(V())),actor.rig[side+'Shin'].getWorldPosition(V()).distanceTo(actor.rig[side+'Foot'].getWorldPosition(V()))];
 return {actor,read,lengths,get options(){return lastOptions;},tick(x,z,dt=1/60,yawRate=0){actor.root.rotation.y+=yawRate*dt;const direction=V(x,0,z).applyQuaternion(actor.root.quaternion),before=actor.root.position.clone();AshenNavigation.move(entity,direction.x*dt,direction.z*dt,world);actor.root.position.set(entity.x,0,entity.z);const current=actor.root.position.clone(),vx=(current.x-before.x)/dt,vz=(current.z-before.z)/dt;lastOptions={state:'idle',time:elapsed,t:elapsed,dt,speed:Math.hypot(vx,vz),moveX:vx,moveZ:vz,yawRate};actor.animate(lastOptions);elapsed+=dt;assert.ok(actor.root.position.equals(current),'animation changed collision-owned root X/Z');const fit=AshenNavigation.fitPose(entity,actor.contactPoints,world);assert.equal(fit.resolved,true);actor.root.position.set(entity.x,0,entity.z);actor.updateEquipment();return read();}};
}
function intendedSupport(actor,side){
 let total=0;for(const layer of actor.gaitFrame.layers){const source=sourceSupport.get(layer.name);if(!source)continue;const values=source.support[side],at=((layer.time/source.duration%1)+1)%1*values.length,i=Math.floor(at),u=at-i;total+=layer.weight*(values[i]+(values[(i+1)%values.length]-values[i])*u);}return total>.75;
}

test('dedicated footwork keeps explicit source travel and continuous loop endpoints',()=>{
 const a=AshenCharacters.createKnight({THREE:T,scene:new T.Scene()});
 for(const name of clips){const c=a.motionClips.find(c=>c.name===name);assert.ok(c,'missing dedicated source '+name);assert.ok(c.userData.locomotion&&c.userData.root_motion,'source gait and root metadata must survive loading');const m=c.userData.locomotion,r=c.userData.root_motion;assert.equal(m.cycles,1);assert.ok(m.stride_distance_m>.3&&m.stride_distance_m<1.3);assert.ok(Math.abs(m.nominal_speed_mps-m.stride_distance_m/c.duration)<.001);assert.ok(Math.abs(r.horizontal_path_m-m.stride_distance_m)<.003);assert.ok(r.samples.length>30);
  for(const track of c.tracks){assert.ok([...track.values].every(Number.isFinite),name+' has invalid channels');const n=track.getValueSize(),first=Array.from(track.values.slice(0,n)),last=Array.from(track.values.slice(-n));if(n===4){const q=new T.Quaternion(...first).normalize(),p=new T.Quaternion(...last).normalize();assert.ok(q.angleTo(p)<.005,name+' has a rotation jump at its loop');}else assert.ok(Math.hypot(...first.map((v,i)=>v-last[i]))<.001,name+' has a position/scale jump at its loop');}
 }
});

for(const [name,x,z,yaw]of [['left',1.1,0,0],['right',-1.1,0,0],['back',0,-1.15,0],['left-facing-east',1.1,0,Math.PI/2],['forward-left',.78,.78,0],['forward-right',-.78,.78,0],['back-left',.78,-.78,0],['back-right',-.78,-.78,0]])test('production '+name+' footwork stays separated, grounded and supported during actual travel',t=>{
 const f=fixture(yaw),episodes={left:null,right:null},events=[];let minimumGap=Infinity,minimumSole=Infinity,minimumHead=Infinity,maxSupportExcursion=0,supportEpisodes=0,worstEpisode=null;
 const close=side=>{const episode=episodes[side];if(episode&&episode.frames>=8){supportEpisodes++;if(episode.excursion>maxSupportExcursion){maxSupportExcursion=episode.excursion;worstEpisode={side,...episode};}}episodes[side]=null;};
 for(let i=0;i<540;i++){const feet=f.tick(x,z),a=f.actor;if(i<120)continue;const localL=a.root.worldToLocal(feet.left.centre.clone()),localR=a.root.worldToLocal(feet.right.centre.clone());minimumGap=Math.min(minimumGap,localL.x-localR.x);minimumSole=Math.min(minimumSole,feet.left.min,feet.right.min);minimumHead=Math.min(minimumHead,a.rig.head.getWorldPosition(V()).y);
  for(const side of ['left','right']){const foot=feet[side],contact=intendedSupport(a,side)&&foot.min<.035&&foot.flatMax<.075;if(contact){if(!episodes[side])episodes[side]={start:foot.centre.clone(),frames:0,excursion:0,samples:[]};const e=episodes[side];e.frames++;e.excursion=Math.max(e.excursion,Math.hypot(foot.centre.x-e.start.x,foot.centre.z-e.start.z));e.samples.push({t:i/60,sole:foot.centre.toArray(),soleMin:foot.min,soleMax:foot.flatMax,root:a.root.position.toArray(),hipY:a.rig.hips.getWorldPosition(V()).y,plant:{active:a.footPlant[side]?.active,error:a.footPlant[side]?.error,anchor:a.footPlant[side]?.anchor?.toArray(),hipToAnchor:a.footPlant[side]?.anchor?a.rig[side+'Thigh'].getWorldPosition(V()).distanceTo(a.footPlant[side].anchor):null,ankleToAnchor:a.footPlant[side]?.anchor?a.rig[side+'Foot'].getWorldPosition(V()).distanceTo(a.footPlant[side].anchor):null,legLength:f.lengths[side][0]+f.lengths[side][1]},gait:{...a.gaitFrame.feet[side]},layers:a.gaitFrame.layers.map(layer=>({...layer}))});}else close(side);const length=[a.rig[side+'Thigh'].getWorldPosition(V()).distanceTo(a.rig[side+'Shin'].getWorldPosition(V())),a.rig[side+'Shin'].getWorldPosition(V()).distanceTo(a.rig[side+'Foot'].getWorldPosition(V()))];for(let n=0;n<2;n++)assert.ok(Math.abs(length[n]-f.lengths[side][n])<.0005,'footwork stretched a leg');}
  for(const event of a.gaitFrame.footfalls)events.push({side:event.side,time:i/60});
 }
 close('left');close('right');
 if(maxSupportExcursion>=.045){const directory=path.join(__dirname,'.asset-work');fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'footwork-acceptance-'+name+'.json'),JSON.stringify({mode:name,minimumGap,minimumSole,minimumHead,maxSupportExcursion,supportEpisodes,worstEpisode},null,2));t.diagnostic('Worst actual support episode saved in .asset-work/footwork-acceptance-'+name+'.json');}
 assert.ok(minimumGap>.12,'feet crossed or lost foot-width clearance: '+minimumGap.toFixed(4)+'m');assert.ok(minimumSole>-.004,'weighted foot crossed ground: '+minimumSole.toFixed(4)+'m');assert.ok(minimumHead>1.50,'ordinary footwork became a sustained crouch: '+minimumHead.toFixed(3)+'m');
 assert.ok(supportEpisodes>=8,'no sustained actual flat-sole support was exercised');assert.ok(maxSupportExcursion<.045,'support sole drifted through the world by '+maxSupportExcursion.toFixed(4)+'m');
 for(let i=1;i<events.length;i++){assert.notEqual(events[i].side,events[i-1].side,'heel/toe duplicate or repeated same-foot landing');assert.ok(events[i].time-events[i-1].time>.16);}
 assert.ok(events.length>=8,'travel did not produce real alternating landing events');t.diagnostic(JSON.stringify({minimumGap,minimumSole,minimumHead,maxSupportExcursion,supportEpisodes,landingEvents:events.length}));
});

test('pure directional landing cadence follows the travelled distance and native source cycle',()=>{
 for(const [name,x,z]of [[clips[0],1.1,0],[clips[1],-1.1,0],[clips[2],0,-1.15]]){const f=fixture(),c=f.actor.motionClips.find(c=>c.name===name);for(let i=0;i<120;i++)f.tick(x,z);let events=0;for(let i=0;i<360;i++){f.tick(x,z);events+=f.actor.gaitFrame.footfalls.length;}const expected=Math.hypot(x,z)*6/c.userData.locomotion.stride_distance_m*2;assert.ok(Math.abs(events-expected)<2.1,name+' has '+events+' landings for '+expected.toFixed(2)+' expected from source travel');}
});

test('direction reversal and stopping release support and return to the shared carry continuously',t=>{
 const f=fixture(),a=f.actor;let previous=[a.rig.leftFoot.getWorldPosition(V()),a.rig.rightFoot.getWorldPosition(V())],steadyStep=0;
 for(let i=0;i<180;i++){f.tick(1.1,0);const now=[a.rig.leftFoot.getWorldPosition(V()),a.rig.rightFoot.getWorldPosition(V())];if(i>60)for(let n=0;n<2;n++)steadyStep=Math.max(steadyStep,now[n].distanceTo(previous[n]));previous=now;}
 let reversalStep=0;const reversal=[];
 for(let i=0;i<90;i++){const feet=f.tick(-1.1,0);if(i===0)assert.ok(!a.footPlant.left.active&&!a.footPlant.right.active,'reversal inherited old world foot anchors');assert.ok(feet.left.min>-.004&&feet.right.min>-.004,'reversal drove a weighted sole underground');const now=[a.rig.leftFoot.getWorldPosition(V()),a.rig.rightFoot.getWorldPosition(V())],step=now.map((p,n)=>p.distanceTo(previous[n]));for(const distance of step)if(i<30)reversalStep=Math.max(reversalStep,distance);else steadyStep=Math.max(steadyStep,distance);reversal.push({frame:i,t:i/60,step,feet:now.map(p=>p.toArray()),phase:a.gaitFrame.phase,strideDistance:a.gaitFrame.strideDistance,layers:a.gaitFrame.layers.map(layer=>({...layer})),plant:['left','right'].map(side=>({active:a.footPlant[side].active,correction:a.acceptancePlantCorrection[side].toArray(),source:{...a.gaitFrame.feet[side]}}))});previous=now;}
 // A native fast swing is not a discontinuity. Bound the additional travel
 // during handoff against this production actor's measured steady source swing.
 const directory=path.join(__dirname,'.asset-work');fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'footwork-reversal-diagnostic.json'),JSON.stringify({generatedAt:new Date().toISOString(),reversalStep,steadyStep,extraStep:reversalStep-steadyStep,trace:reversal},null,2));t.diagnostic('Reversal peak '+reversalStep.toFixed(5)+'m, steady source peak '+steadyStep.toFixed(5)+'m, extra '+(reversalStep-steadyStep).toFixed(5)+'m; timestamped trace .asset-work/footwork-reversal-diagnostic.json');
 assert.ok(reversalStep-steadyStep<.025,'reversal added '+(reversalStep-steadyStep).toFixed(4)+'m above the actual steady swing: reversal '+reversalStep.toFixed(4)+'m, steady '+steadyStep.toFixed(4)+'m');let maximumStep=0;
 for(let i=0;i<60;i++){const feet=f.tick(0,0);assert.ok(feet.left.min>-.004&&feet.right.min>-.004,'stopping drove the weighted feet underground');const now=[a.rig.leftFoot.getWorldPosition(V()),a.rig.rightFoot.getWorldPosition(V())];for(let n=0;n<2;n++)maximumStep=Math.max(maximumStep,now[n].distanceTo(previous[n]));previous=now;assert.equal(a.gaitFrame.footfalls.length,0);}
 assert.ok(maximumStep<.07,'stop snapped a foot rather than returning to carry: '+maximumStep.toFixed(4)+'m');assert.ok(!a.footPlant.left.active&&!a.footPlant.right.active);assert.ok(a.gaitFrame.moveWeight<.001);
});

test('turning through a real world arc releases foot pins without crossing the weighted feet',()=>{
 const f=fixture();for(let i=0;i<150;i++)f.tick(1.1,0);
 for(let i=0;i<90;i++){const feet=f.tick(1.1,0,1/60,1.4),a=f.actor,left=a.root.worldToLocal(feet.left.centre.clone()),right=a.root.worldToLocal(feet.right.centre.clone());assert.ok(!a.footPlant.left.active&&!a.footPlant.right.active,'a fast root turn kept an old world pin');assert.ok(left.x-right.x>.12,'feet crossed while facing changed');assert.ok(feet.left.min>-.004&&feet.right.min>-.004,'a turning weighted sole crossed ground');}
});

test('foot-pin release has no abrupt source-relative pose jump',t=>{
 const release=[];let starts=0;
 for(const sign of [1,-1]){const f=fixture(),watch={left:0,right:0};let previous=null;for(let i=0;i<480;i++){f.tick(.78*sign,.78);const a=f.actor,current={};for(const side of ['left','right']){current[side]={active:a.footPlant[side].active,correction:a.acceptancePlantCorrection[side].clone(),point:a.rig[side+'Foot'].getWorldPosition(V())};if(i>120&&previous?.[side].active&&!current[side].active){watch[side]=10;starts++;}if(current[side].active)watch[side]=0;if(watch[side]>0){release.push({direction:sign>0?'forward-left':'forward-right',side,time:i/60,releaseFrame:10-watch[side],removedCorrection:current[side].correction.distanceTo(previous[side].correction),actualFootStep:current[side].point.distanceTo(previous[side].point),candidate:a.gaitFrame.feet[side].lockedCandidate,sourceContact:a.gaitFrame.feet[side].contact,sourceSupport:a.gaitFrame.feet[side].support,height:current[side].point.y});watch[side]--;}}previous=current;}}
 const directory=path.join(__dirname,'.asset-work');fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'footwork-release-diagnostic.json'),JSON.stringify(release,null,2));const largest=Math.max(...release.map(r=>r.removedCorrection));t.diagnostic('Source-relative pin removal max '+largest.toFixed(5)+'m; details .asset-work/footwork-release-diagnostic.json');assert.ok(starts>=10,'a full sequence of support-to-swing transitions was not exercised');assert.ok(largest<.025,'removing a pin jumped the pose relative to its own source by '+largest.toFixed(4)+'m');
});

test('paused sampling retains an in-progress foot release without advancing its decay',()=>{
 const f=fixture();let observed=false;
 for(let i=0;i<480;i++){f.tick(-.78,.78);if(i<120)continue;const a=f.actor,releasing=['left','right'].some(side=>!a.footPlant[side].active&&a.acceptancePlantCorrection[side].length()>.005);if(!releasing)continue;
  const names=['hips','leftThigh','leftShin','leftFoot','rightThigh','rightShin','rightFoot'],before=names.map(name=>({q:a.rig[name].quaternion.clone(),p:a.rig[name].getWorldPosition(V())})),root=a.root.position.clone();
  for(let repeat=0;repeat<6;repeat++){a.animate({...f.options,dt:0});for(let n=0;n<names.length;n++){assert.ok(a.rig[names[n]].quaternion.angleTo(before[n].q)<.001,names[n]+' rotated while release time was paused');assert.ok(a.rig[names[n]].getWorldPosition(V()).distanceTo(before[n].p)<.001,names[n]+' moved while release time was paused');}assert.ok(a.root.position.equals(root));}
  observed=true;break;
 }
 assert.ok(observed,'no real source-relative release interval was exercised');
});

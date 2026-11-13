/* Development-only visual inspection of the production character pipeline. */
(async function(){
'use strict';
const T=THREE,C=AshenCombat,$=id=>document.getElementById(id),canvas=$('review-canvas'),stage=$('stage');
const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;renderer.physicallyCorrectLights=true;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
const scene=new T.Scene();scene.background=new T.Color('#b9c2c8');scene.fog=new T.Fog('#b9c2c8',16,40);
scene.add(new T.HemisphereLight('#ecf3fa','#68727b',1.3));
const key=new T.DirectionalLight('#fff3dd',2.5);key.position.set(-3.5,7,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-3,right:3,top:3,bottom:-3,near:.2,far:17});key.shadow.camera.updateProjectionMatrix();key.shadow.normalBias=.016;key.shadow.bias=-.00015;scene.add(key,key.target);
const rim=new T.DirectionalLight('#ddeaff',1.3);rim.position.set(3,4,-4);scene.add(rim);
// Broad reflection lobes make the actual metal surfaces readable on every side.
const ew=128,eh=64,data=new Uint8Array(ew*eh*4);
for(let y=0;y<eh;y++)for(let x=0;x<ew;x++){const i=(y*ew+x)*4,u=x/ew,v=y/eh,sky=Math.pow(1-v,1.2),left=Math.exp(-Math.pow((u-.20)/.12,2)-Math.pow((v-.4)/.28,2)),right=Math.exp(-Math.pow((u-.72)/.10,2)-Math.pow((v-.45)/.30,2));data[i]=55+sky*85+left*105+right*55;data[i+1]=63+sky*89+left*99+right*62;data[i+2]=73+sky*96+left*80+right*80;data[i+3]=255;}
const env=new T.DataTexture(data,ew,eh,T.RGBAFormat);env.encoding=T.sRGBEncoding;env.mapping=T.EquirectangularReflectionMapping;env.needsUpdate=true;const pmrem=new T.PMREMGenerator(renderer),baked=pmrem.fromEquirectangular(env);scene.environment=baked.texture;pmrem.dispose();env.dispose();
const ground=new T.Mesh(new T.PlaneGeometry(100,100),new T.MeshStandardMaterial({color:'#9ba7ae',roughness:.95,metalness:0}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;ground.position.y=-.012;scene.add(ground);
let reviewObstacles=[];const wallGroup=new T.Group();scene.add(wallGroup);
const grid=new T.GridHelper(100,200,'#75838d','#8e9aa3');grid.position.y=-.008;grid.material.transparent=true;grid.material.opacity=.55;scene.add(grid);
const camera=new T.PerspectiveCamera(39,1,.05,80),target=new T.Vector3(),viewDirection=new T.Vector3(),footPoint=new T.Vector3(),handPoint=new T.Vector3(),socketPoint=new T.Vector3();
const views={front:{label:'正面',offset:[0,1.55,4.15]},back:{label:'背面',offset:[0,1.55,-4.15]},left:{label:'左侧',offset:[4.15,1.55,0]},right:{label:'右侧',offset:[-4.15,1.55,0]},quarter:{label:'前侧',offset:[-2.6,1.55,3.25]},rearQuarter:{label:'后侧',offset:[2.6,1.55,-3.25]}};
const rollDirections={forward:[0,0,1],back:[0,0,-1],left:[1,0,0],right:[-1,0,0],forwardLeft:[.70710678,0,.70710678],backRight:[-.70710678,0,-.70710678]};
let reviewRollMove=null;
const specs={
 idle:{label:'待机',state:'idle',duration:4,speed:0},walk:{label:'行走',state:'idle',duration:4,speed:1.85,direction:[0,0,1]},run:{label:'奔跑',state:'idle',duration:4,speed:4.4,direction:[0,0,1]},back:{label:'倒退',state:'idle',duration:4,speed:1.15,direction:[0,0,-1],combat:true},left:{label:'左移',state:'idle',duration:4,speed:1.1,direction:[1,0,0],combat:true},right:{label:'右移',state:'idle',duration:4,speed:1.1,direction:[-1,0,0],combat:true},turn:{label:'转向',state:'idle',duration:4,speed:1.65,direction:[0,0,1],yawRate:.9},combat:{label:'戒备',state:'idle',duration:4,speed:0,combat:true},guard:{label:'格挡',state:'idle',duration:4,speed:0,guarding:true,combat:true},light:{label:'轻击',state:'attack',move:'light',speed:0,combat:true},lightB:{label:'续斩',state:'attack',move:'light',index:1,speed:0,combat:true},finisher:{label:'终斩',state:'attack',move:'light',index:2,speed:0,combat:true},heavy:{label:'重击',state:'attack',move:'heavy',speed:0,combat:true},critical:{label:'破势斩',state:'attack',move:'critical',speed:0,combat:true},roll:{label:'翻滚',state:'roll',move:'roll',speed:0},heal:{label:'恢复',state:'heal',duration:1.25,speed:0},hit:{label:'受击',state:'hurt',duration:.6,speed:0},dead:{label:'倒地',state:'dead',duration:2.4,speed:0}
};
for(const [name,label,x,z]of [['forwardLeft','前左移',1,1],['forwardRight','前右移',-1,1],['backLeft','后左移',1,-1],['backRight','后右移',-1,-1]]){const length=Math.hypot(x,z);specs[name]={label,state:'idle',duration:4,speed:AshenLocomotion.movement(x,z).speed,direction:[x/length,0,z/length],combat:true};}
let actor=null,helper=null,handMarker=null,socketMarker=null,bladeLine=null,stateId='idle',viewId='three',role='player',playing=true,rate=1,time=0,clock=0,last=0,ready=false,statsAge=0,worldDistance=0,previousState='',renderCounter=0,previewName='',previewAction=null,previewClip=null;
function disposeActor(){
 if(!actor)return;scene.remove(actor.root);
 if(helper){scene.remove(helper);helper.geometry?.dispose();helper.material?.dispose();}
 for(const object of [handMarker,socketMarker,bladeLine])if(object){scene.remove(object);object.geometry?.dispose();object.material?.dispose();}
 const shared=new Set(),materials=new Set();actor.visual.traverse(o=>{if(o.geometry)shared.add(o.geometry)});
 actor.root.traverse(o=>{if(o.geometry&&!shared.has(o.geometry))o.geometry.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
 actor.cape?.material.map?.dispose();actor.cape?.material.bumpMap?.dispose();for(const material of materials)material.dispose();actor.mixer.stopAllAction();actor.mixer.uncacheRoot(actor.visual);
}
function rebuild(){reviewRollMove=null;disposeActor();actor=AshenCharacters.createKnight({THREE:T,scene,isBoss:role==='boss',variant:role==='sentinel'?'sentinel':''});actor.root.rotation.y=0;actor.root.position.set(0,0,0);time=clock=worldDistance=0;previousState='';for(let i=0;i<45;i++)actor.animate({state:'idle',time:i/60,t:i/60,dt:1/60,speed:0,combat:false});helper=new T.SkeletonHelper(actor.visual);helper.material.depthTest=false;helper.material.transparent=true;helper.material.opacity=.65;scene.add(helper);handMarker=new T.Mesh(new T.SphereGeometry(.018,8,6),new T.MeshBasicMaterial({color:'#da3d47',depthTest:false}));socketMarker=new T.Mesh(new T.SphereGeometry(.012,8,6),new T.MeshBasicMaterial({color:'#33a79c',depthTest:false}));bladeLine=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3()]),new T.LineBasicMaterial({color:'#00749b',depthTest:false}));scene.add(handMarker,socketMarker,bladeLine);configurePreview();updateHelpers();updatePose(0);renderer.shadowMap.needsUpdate=true;}
function configurePreview(){
 previewClip=previewName?actor.motionClips.find(c=>c.name===previewName):null;previewAction=null;
 if(previewClip){actor.mixer.stopAllAction();previewAction=actor.mixer.clipAction(previewClip);previewAction.reset().setEffectiveWeight(1).setLoop(T.LoopOnce,1).play();previewAction.paused=true;actor.pivot.quaternion.identity();actor.pivot.position.y=.95;}
}
function updateHelpers(){const show=$('review-helpers').checked;for(const obj of [helper,handMarker,socketMarker,bladeLine])if(obj)obj.visible=show;}
function specNow(){
 if(previewClip){const duration=previewClip.duration;return {s:{label:'资源原动作 / '+previewName,state:'idle',speed:0},move:null,duration,phase:Math.min(time%(duration+.6),duration-.00001),recovering:false};}
 const s=specs[stateId];let move=s.move?(role==='boss'&&s.move==='light'?C.getBossMove(0):C.getMove(s.move,s.index||0)):null;
 if(s.move==='roll'){if(!reviewRollMove){const direction=new T.Vector3(...rollDirections[$('review-roll-direction').value]).applyQuaternion(actor.root.quaternion);reviewRollMove=actor.planRoll(move,direction,actor.root.rotation.y);}move=reviewRollMove;}
 const duration=move?.total||s.duration,discrete=!!s.move||['heal','hit','dead'].includes(stateId),phase=discrete?time%(duration+1.1):time;return {s,move,duration,phase,recovering:discrete&&phase>duration};
}
function updatePose(dt){
 if(!actor)return;const {s,move,duration,phase,recovering}=specNow(),state=recovering?'idle':s.state;
 const direction=new T.Vector3(...(state==='roll'?rollDirections[$('review-roll-direction').value]:(s.direction||[0,0,1])));if(s.yawRate&&!recovering)actor.root.rotation.y+=s.yawRate*dt;direction.applyQuaternion(actor.root.quaternion);
 let speed=recovering?0:s.speed;
 const before=actor.root.position.clone(),entity={kind:role==='boss'?'boss':'player',x:before.x,z:before.z,radius:role==='boss'?.64:.46},world={bounds:[{x:0,z:0,w:100,d:100}],obstacles:reviewObstacles,entities:[],player:entity};
 let actualX=direction.x*speed,actualZ=direction.z*speed;
 if($('review-travel').checked&&!previewAction){let dx=direction.x*speed*dt,dz=direction.z*speed*dt;if(state==='roll'||state==='attack'){const delta=actor.actionRootDelta(move,Math.max(0,phase-dt),phase),yaw=move?.rollPlan?.facingYaw??actor.root.rotation.y,sn=Math.sin(yaw),cs=Math.cos(yaw);dx=delta.x*cs+delta.z*sn;dz=delta.z*cs-delta.x*sn;}const moved=AshenNavigation.move(entity,dx,dz,world);actor.root.position.set(entity.x,0,entity.z);if(state==='idle'&&dt>0){speed=moved/dt;actualX=(entity.x-before.x)/dt;actualZ=(entity.z-before.z)/dt;}}
 if(previewAction){previewAction.time=phase;actor.mixer.update(0);actor.root.updateWorldMatrix(true,true);actor.updateEquipment();actor.currentClip=previewName;}
 else{actor.animate({state,attack:recovering?null:move,time:recovering?phase-duration:phase,t:clock,dt,speed,moveX:actualX,moveZ:actualZ,yawRate:s.yawRate||0,rollDir:direction,combat:!!s.combat,guarding:!!s.guarding,staminaRatio:1,comboIndex:0,obstacles:reviewObstacles});const fit=AshenNavigation.fitPose(entity,actor.contactPoints,world);if(fit.x||fit.z){actor.root.position.set(entity.x,0,entity.z);actor.updateEquipment();}if(dt>0&&$('review-travel').checked)worldDistance+=actor.root.position.distanceTo(before);}
 if(actor.root.position.length()>22){actor.root.position.set(0,0,0);}
 if(state!==previousState){actor.prevBlade=null;previousState=state;}
 actor.setCombatCue?.({state,time:phase,attack:move});
 if($('review-helpers').checked){actor.rig.rightHand?.getWorldPosition(handMarker.position);actor.weapon.group.getWorldPosition(socketMarker.position);const base=actor.weapon.group.localToWorld(actor.weapon.base.clone()),tip=actor.weapon.group.localToWorld(actor.weapon.tip.clone());bladeLine.geometry.setFromPoints([base,tip]);helper.updateMatrixWorld(true);}
 key.position.copy(actor.root.position).add(new T.Vector3(-3.5,7,5));key.target.position.copy(actor.root.position);renderer.shadowMap.needsUpdate=true;
 statsAge+=dt;if(statsAge>.1||dt===0){statsAge=0;const r=actor.root.position,soles=actor.footBounds(),l=soles.left.min,rr=soles.right.min;actor.rig.rightHand?.localToWorld(handPoint.copy(actor.weapon.grip.handOffset));actor.weapon.group.getWorldPosition(socketPoint);$('review-stats').textContent=`${s.label}${recovering?' / 收势':''}  ${phase.toFixed(2)} s · ${speed.toFixed(2)} m/s · 位移 ${worldDistance.toFixed(2)} m\n真实足底 L ${Number(l).toFixed(3)} / R ${Number(rr).toFixed(3)} m · 握柄挂点跟随（仅诊断） ${handPoint.distanceTo(socketPoint).toFixed(4)} m · 世界坐标 ${r.x.toFixed(2)}, ${r.z.toFixed(2)}`;}
 Object.assign(document.body.dataset,{state:stateId,view:viewId,playing:String(playing),time:time.toFixed(3),clip:actor.currentClip||'',role,source:previewName||'production',rootX:actor.root.position.x.toFixed(4),rootZ:actor.root.position.z.toFixed(4)});
}
function size(){const r=stage.getBoundingClientRect();renderer.setPixelRatio(Math.min(1.25,devicePixelRatio||1));renderer.setSize(r.width,r.height,false);}
function render(){
 const w=stage.clientWidth,h=stage.clientHeight,list=viewId==='three'?['front','back','right']:[viewId];renderer.setScissorTest(true);renderer.setClearColor(scene.background);renderer.clear();
 for(let i=0;i<list.length;i++){const x=Math.floor(w*i/list.length),width=Math.floor(w*(i+1)/list.length)-x,v=views[list[i]];renderer.setViewport(x,0,width,h);renderer.setScissor(x,0,width,h);camera.aspect=width/h;camera.updateProjectionMatrix();target.copy(actor.root.position).add(new T.Vector3(0,.99*actor.root.scale.y,0));viewDirection.set(...v.offset).multiplyScalar(actor.root.scale.y);camera.position.copy(actor.root.position).add(viewDirection);camera.lookAt(target);renderer.render(scene,camera);}renderer.setScissorTest(false);
}
function setState(id){stateId=id;for(const button of document.querySelectorAll('[data-state]'))button.setAttribute('aria-pressed',String(button.dataset.state===id));rebuild();render();}
function setView(id){viewId=id;for(const button of document.querySelectorAll('[data-view]'))button.setAttribute('aria-pressed',String(button.dataset.view===id));const labels=$('view-labels');labels.dataset.single=String(id!=='three');labels.children[0].textContent=id==='three'?'正面':views[id].label;render();}
for(const button of document.querySelectorAll('[data-state]'))button.onclick=()=>ready&&setState(button.dataset.state);
for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>ready&&setView(button.dataset.view);
$('review-pause').onclick=()=>{playing=!playing;$('review-pause').textContent=playing?'暂停':'播放';$('review-pause').setAttribute('aria-pressed',String(!playing));document.body.dataset.playing=String(playing);};
$('review-step').onclick=()=>{playing=false;$('review-pause').textContent='播放';$('review-pause').setAttribute('aria-pressed','true');time+=1/60;clock+=1/60;updatePose(1/60);render();};
function environment(){const mode=$('review-environment').value;reviewObstacles=[];if(mode==='front'||mode==='corner')reviewObstacles.push({x:0,z:.51,w:3,d:.1,h:3});if(mode==='left'||mode==='corner')reviewObstacles.push({x:.51,z:0,w:.1,d:3,h:3});while(wallGroup.children.length){const mesh=wallGroup.children[0];wallGroup.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}for(const o of reviewObstacles){const mesh=new T.Mesh(new T.BoxGeometry(o.w,o.h,o.d),new T.MeshBasicMaterial({color:'#b77741',wireframe:true,transparent:true,opacity:.45}));mesh.position.set(o.x,o.h/2,o.z);wallGroup.add(mesh);}if(ready){rebuild();render();}}
$('review-environment').onchange=environment;
$('review-source').onchange=()=>{previewName=$('review-source').value;for(const button of document.querySelectorAll('[data-state]'))button.disabled=!!previewName;$('review-environment').disabled=!!previewName;$('review-travel').disabled=!!previewName;$('review-environment').value='free';document.querySelector('.review-warning').textContent=previewName?'资源原动作检查：不含游戏接触修正。检查完整人体与装备适配，不能将此模式作为游戏验收。':'这是视觉验收工具。接触点与骨骼数据用于定位问题，不能代替观察握持、步态和动作衔接。';environment();};

function seek(fraction){playing=false;$('review-pause').textContent='播放';$('review-pause').setAttribute('aria-pressed','true');rebuild();const spec=specNow(),end=spec.duration*fraction;for(let elapsed=0;elapsed<end;){const dt=Math.min(1/120,end-elapsed);time+=dt;clock+=dt;updatePose(dt);elapsed+=dt;}updatePose(0);render();}
$('review-quarter').onclick=()=>seek(.25);$('review-half').onclick=()=>seek(.5);$('review-three-quarter').onclick=()=>seek(.75);
for(const [id,point]of [['anticipation','wind'],['contact','contact'],['recovery','recovery'],['end','end']])$('review-'+id).onclick=()=>{const {move,duration}=specNow();const at=point==='wind'?(move?.windup||duration*.3)*.80:point==='contact'?move?move.windup+move.active*.5:duration*.5:point==='recovery'?move?move.recoveryStart+(move.total-move.recoveryStart)*.5:duration*.75:duration;seek(at/duration);};
$('review-roll-direction').onchange=()=>{if(ready){rebuild();render();}};
// Export through the visible development UI. This samples the same navigation,
// source blending and contact pipeline as interactive inspection, then renders
// every phase before the browser compositor can return an older canvas frame.
$('review-export').onclick=()=>{
 if(!ready)return;playing=false;$('review-pause').textContent='播放';$('review-pause').setAttribute('aria-pressed','true');
 const button=$('review-export');button.disabled=true;$('review-export-status').textContent='正在生成完整动作检查图…';
 try{
  rebuild();const spec=specNow(),continuous=!previewClip&&!spec.move&&!['heal','hit','dead'].includes(stateId);
  const advance=end=>{while(time+1e-8<end){const dt=Math.min(1/120,end-time);time+=dt;clock+=dt;updatePose(dt);}updatePose(0);};
  let start=0,duration=spec.duration;if(continuous&&spec.s.speed>0){advance(.5);start=time;duration=actor.gaitFrame?.stepCycleDuration||actor.gaitFrame?.strideDistance/Math.max(.01,spec.s.speed*2)||1.2;}
  const cell=300,top=68,label=28,foot=32,rows=['front','back','right'],fractions=[0,.16,.32,.50,.75,1];
  const sheet=document.createElement('canvas');sheet.width=cell*fractions.length;sheet.height=top+rows.length*(cell+label)+foot;const ctx=sheet.getContext('2d');ctx.fillStyle='#edf1f3';ctx.fillRect(0,0,sheet.width,sheet.height);ctx.fillStyle='#20323c';ctx.font='bold 21px system-ui';ctx.fillText(spec.s.label+' · '+(previewName?'资源原姿':'生产动作与接触')+' · '+role,18,28);ctx.font='14px system-ui';ctx.fillText('六阶段顺序检查 · 真实位移 '+($('review-travel').checked?'开启':'关闭')+' · 环境 '+$('review-environment').selectedOptions[0].textContent+' · '+duration.toFixed(3)+'s'+(continuous?' 稳定步态周期':' 完整动作'),18,52);
  renderer.setPixelRatio(1);renderer.setSize(cell,cell,false);renderer.setScissorTest(false);renderer.setViewport(0,0,cell,cell);
  for(let i=0;i<fractions.length;i++){
   advance(start+duration*fractions[i]);
   for(let row=0;row<rows.length;row++){const v=views[rows[row]],y=top+row*(cell+label);camera.aspect=1;camera.updateProjectionMatrix();target.copy(actor.root.position).add(new T.Vector3(0,.99*actor.root.scale.y,0));camera.position.copy(actor.root.position).add(new T.Vector3(...v.offset).multiplyScalar(actor.root.scale.y));camera.lookAt(target);renderer.shadowMap.needsUpdate=true;renderer.render(scene,camera);ctx.drawImage(canvas,0,0,canvas.width,canvas.height,i*cell,y,cell,cell);ctx.fillStyle='#20323c';ctx.font='14px system-ui';ctx.fillText(v.label+'  '+(time-start).toFixed(3)+'s',i*cell+9,y+cell+19);}
  }
  ctx.font='14px system-ui';ctx.fillStyle='#20323c';ctx.fillText('按120Hz推进动作后逐格渲染；此图用于姿态与接触检查，不代表实时播放性能。',18,sheet.height-11);
  const url=sheet.toDataURL('image/png');$('review-sheet-image').src=url;$('review-sheet-download').href=url;$('review-sheet-download').download='ashen-vow-'+role+'-'+(previewName||stateId)+'-review.png';$('review-export-status').textContent='检查图已生成；动作已回到起点。';$('review-sheet').showModal();
 }catch(error){$('review-export-status').textContent='检查图生成失败：'+error.message;console.error(error);}
 finally{button.disabled=false;size();rebuild();render();}
};
$('review-sheet-close').onclick=()=>$('review-sheet').close();
$('review-reset').onclick=()=>{if(ready){rebuild();render();}};$('review-speed').onchange=()=>rate=Number($('review-speed').value)||1;$('review-role').onchange=()=>{role=$('review-role').value;if(ready){rebuild();render();}};$('review-helpers').onchange=()=>{updateHelpers();if(ready){updatePose(0);render();}};$('review-travel').onchange=()=>{if(ready){rebuild();render();}};
addEventListener('resize',()=>{size();if(ready)render();});
function frame(now){requestAnimationFrame(frame);const dt=last?Math.min(.05,(now-last)/1000):0;last=now;if(!ready||document.hidden)return;if(playing){const step=dt*rate;time+=step;clock+=step;updatePose(step);}render();Object.assign(document.body.dataset,{drawnFrame:String(++renderCounter),drawnTime:time.toFixed(3),drawnClip:actor.currentClip||''});}
try{await AshenCharacters.load({THREE:T,url:'assets/knight-v11.glb'});size();rebuild();for(const clip of actor.motionClips){const option=document.createElement('option');option.value=clip.name;option.textContent=clip.name;$('review-source').append(option);}ready=true;document.body.dataset.ready='true';$('load-status').textContent='生产角色已加载 · 选择动作逐项检查';requestAnimationFrame(frame);}catch(error){document.body.dataset.error='true';$('load-status').textContent=error.message;console.error(error);}
})();

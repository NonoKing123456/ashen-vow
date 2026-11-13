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
const specs={
 idle:{label:'待机',state:'idle',duration:4,speed:0},walk:{label:'行走',state:'idle',duration:4,speed:1.85,direction:[0,0,1]},run:{label:'奔跑',state:'idle',duration:4,speed:4.4,direction:[0,0,1]},back:{label:'倒退',state:'idle',duration:4,speed:1.45,direction:[0,0,-1],combat:true},left:{label:'左移',state:'idle',duration:4,speed:1.65,direction:[1,0,0],combat:true},right:{label:'右移',state:'idle',duration:4,speed:1.65,direction:[-1,0,0],combat:true},turn:{label:'转向',state:'idle',duration:4,speed:1.65,direction:[0,0,1],yawRate:.9},combat:{label:'戒备',state:'idle',duration:4,speed:0,combat:true},guard:{label:'格挡',state:'idle',duration:4,speed:0,guarding:true,combat:true},light:{label:'轻击',state:'attack',move:'light',speed:0,combat:true},heavy:{label:'重击',state:'attack',move:'heavy',speed:0,combat:true},critical:{label:'突刺',state:'attack',move:'critical',speed:0,combat:true},roll:{label:'翻滚',state:'roll',move:'roll',speed:0},heal:{label:'恢复',state:'heal',duration:1.25,speed:0},hit:{label:'受击',state:'hurt',duration:.6,speed:0}
};
let actor=null,helper=null,handMarker=null,socketMarker=null,bladeLine=null,stateId='idle',viewId='three',role='player',playing=true,rate=1,time=0,clock=0,last=0,ready=false,statsAge=0,worldDistance=0,previousState='';
function disposeActor(){
 if(!actor)return;scene.remove(actor.root);
 if(helper){scene.remove(helper);helper.geometry?.dispose();helper.material?.dispose();}
 for(const object of [handMarker,socketMarker,bladeLine])if(object){scene.remove(object);object.geometry?.dispose();object.material?.dispose();}
 const shared=new Set(),materials=new Set();actor.visual.traverse(o=>{if(o.geometry)shared.add(o.geometry)});
 actor.root.traverse(o=>{if(o.geometry&&!shared.has(o.geometry))o.geometry.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
 actor.cape?.material.map?.dispose();actor.cape?.material.bumpMap?.dispose();for(const material of materials)material.dispose();actor.mixer.stopAllAction();actor.mixer.uncacheRoot(actor.visual);
}
function rebuild(){disposeActor();actor=AshenCharacters.createKnight({THREE:T,scene,isBoss:role==='boss',variant:role==='sentinel'?'sentinel':''});actor.root.rotation.y=0;actor.root.position.set(0,0,0);time=clock=worldDistance=0;previousState='';for(let i=0;i<45;i++)actor.animate({state:'idle',time:i/60,t:i/60,dt:1/60,speed:0,combat:false});helper=new T.SkeletonHelper(actor.visual);helper.material.depthTest=false;helper.material.transparent=true;helper.material.opacity=.65;scene.add(helper);handMarker=new T.Mesh(new T.SphereGeometry(.018,8,6),new T.MeshBasicMaterial({color:'#da3d47',depthTest:false}));socketMarker=new T.Mesh(new T.SphereGeometry(.012,8,6),new T.MeshBasicMaterial({color:'#33a79c',depthTest:false}));bladeLine=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3()]),new T.LineBasicMaterial({color:'#00749b',depthTest:false}));scene.add(handMarker,socketMarker,bladeLine);updateHelpers();updatePose(0);renderer.shadowMap.needsUpdate=true;}
function updateHelpers(){const show=$('review-helpers').checked;for(const obj of [helper,handMarker,socketMarker,bladeLine])if(obj)obj.visible=show;}
function specNow(){const s=specs[stateId],move=s.move?(role==='boss'&&s.move==='light'?C.getBossMove(0):C.getMove(s.move)):null,duration=move?.total||s.duration;const discrete=!!s.move||['heal','hit'].includes(stateId),phase=discrete?time%(duration+1.1):time;return {s,move,duration,phase,recovering:discrete&&phase>duration};}
function updatePose(dt){
 if(!actor)return;const {s,move,duration,phase,recovering}=specNow(),state=recovering?'idle':s.state;
 const direction=new T.Vector3(...(s.direction||[0,0,1]));if(s.yawRate&&!recovering)actor.root.rotation.y+=s.yawRate*dt;direction.applyQuaternion(actor.root.quaternion);
 const speed=recovering?0:s.speed;
 if($('review-travel').checked){let travel=speed*dt;if(state==='roll'){const u=Math.min(1,phase/duration);travel=7.8*(1-u*.72)*dt;}else if(state==='attack'&&phase>move.windup*.45&&phase<move.activeEnd){const u=(phase-move.windup*.45)/(move.activeEnd-move.windup*.45);travel=move.lunge/(move.activeEnd-move.windup*.45)*Math.sin(u*Math.PI)*dt;}const entity={kind:role==='boss'?'boss':'player',x:actor.root.position.x,z:actor.root.position.z,radius:role==='boss'?.64:.46};const moved=AshenNavigation.move(entity,direction.x*travel,direction.z*travel,{bounds:[{x:0,z:0,w:100,d:100}],obstacles:reviewObstacles,entities:[],player:entity});actor.root.position.set(entity.x,0,entity.z);worldDistance+=moved;if(actor.root.position.length()>22){actor.root.position.set(0,0,0);}}
 actor.animate({state,attack:recovering?null:move,time:recovering?phase-duration:phase,t:clock,dt,speed,moveX:direction.x*speed,moveZ:direction.z*speed,yawRate:s.yawRate||0,rollDir:direction,combat:!!s.combat,guarding:!!s.guarding,staminaRatio:1,comboIndex:0,obstacles:reviewObstacles});
 if(state!==previousState){actor.prevBlade=null;previousState=state;}
 actor.setCombatCue?.({state,time:phase,attack:move});
 if($('review-helpers').checked){actor.rig.rightHand?.getWorldPosition(handMarker.position);actor.weapon.group.getWorldPosition(socketMarker.position);const base=actor.weapon.group.localToWorld(actor.weapon.base.clone()),tip=actor.weapon.group.localToWorld(actor.weapon.tip.clone());bladeLine.geometry.setFromPoints([base,tip]);helper.updateMatrixWorld(true);}
 key.position.copy(actor.root.position).add(new T.Vector3(-3.5,7,5));key.target.position.copy(actor.root.position);renderer.shadowMap.needsUpdate=true;
 statsAge+=dt;if(statsAge>.1||dt===0){statsAge=0;const r=actor.root.position,soles=actor.footBounds(),l=soles.left.min,rr=soles.right.min;actor.rig.rightHand?.localToWorld(handPoint.copy(actor.weapon.grip.handOffset));actor.weapon.group.getWorldPosition(socketPoint);$('review-stats').textContent=`${s.label}${recovering?' / 收势':''}  ${phase.toFixed(2)} s · ${speed.toFixed(2)} m/s · 位移 ${worldDistance.toFixed(2)} m\n真实足底 L ${Number(l).toFixed(3)} / R ${Number(rr).toFixed(3)} m · 掌心握柄误差 ${handPoint.distanceTo(socketPoint).toFixed(4)} m · 世界坐标 ${r.x.toFixed(2)}, ${r.z.toFixed(2)}`;}
 Object.assign(document.body.dataset,{state:stateId,view:viewId,playing:String(playing),time:time.toFixed(3),clip:actor.currentClip||'',role});
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
function seek(fraction){playing=false;$('review-pause').textContent='播放';$('review-pause').setAttribute('aria-pressed','true');rebuild();const spec=specNow(),end=spec.duration*fraction;for(let elapsed=0;elapsed<end;){const dt=Math.min(1/120,end-elapsed);time+=dt;clock+=dt;updatePose(dt);elapsed+=dt;}updatePose(0);render();}
$('review-quarter').onclick=()=>seek(.25);$('review-half').onclick=()=>seek(.5);$('review-three-quarter').onclick=()=>seek(.75);
$('review-reset').onclick=()=>{if(ready){rebuild();render();}};$('review-speed').onchange=()=>rate=Number($('review-speed').value)||1;$('review-role').onchange=()=>{role=$('review-role').value;if(ready){rebuild();render();}};$('review-helpers').onchange=()=>{updateHelpers();if(ready){updatePose(0);render();}};$('review-travel').onchange=()=>{if(ready){rebuild();render();}};
addEventListener('resize',()=>{size();if(ready)render();});
function frame(now){requestAnimationFrame(frame);const dt=last?Math.min(.05,(now-last)/1000):0;last=now;if(!ready||document.hidden)return;if(playing){const step=dt*rate;time+=step;clock+=step;updatePose(step);}render();}
try{await AshenCharacters.load({THREE:T,url:'assets/knight-v11.glb'});size();rebuild();ready=true;document.body.dataset.ready='true';$('load-status').textContent='生产角色已加载 · 选择动作逐项检查';requestAnimationFrame(frame);}catch(error){document.body.dataset.error='true';$('load-status').textContent=error.message;console.error(error);}
})();

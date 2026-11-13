(async function(){
'use strict';
const T=THREE,C=AshenCombat,PI=Math.PI,TAU=PI*2,$=id=>document.getElementById(id);
const clamp=T.MathUtils.clamp,lerp=T.MathUtils.lerp,damp=(a,b,s,dt)=>lerp(a,b,1-Math.exp(-s*dt)),smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x)};
const gfx=AshenRender.create({THREE:T,canvas:$('game')}),{scene,camera,renderer}=gfx;
const sound=AshenAudio.create();
const journey=AshenJourney.create();
let settings={},combatTime=0,bossDefeated=false,ending=0,support='键鼠',mouseGuard=false,padGuard=false,gamepadSprint=false;
const padMove=new T.Vector2();let wasMouseLocked=false;
function releaseMouse(){if(document.pointerLockElement===$('game'))document.exitPointerLock?.()}
function captureMouse(){if(!started||paused||dead||won||ui.isModalOpen()||(typeof matchMedia==='function'&&matchMedia('(pointer:coarse)').matches))return;try{const result=$('game').requestPointerLock?.();result?.catch?.(()=>{})}catch(e){}}
function cameraLook(dx,dy){if(!started||paused||dead||won||ui.isModalOpen()||locked)return;const sensitivity=settings.sensitivity||1;camYaw-=clamp(Number(dx)||0,-300,300)*.0038*sensitivity;camPitch=clamp(camPitch+clamp(Number(dy)||0,-300,300)*.0027*sensitivity,.05,.75)}
let mode='title',started=false,paused=false,ready=false,time=0,playTime=0,frameCount=0,last=0,fps=60,checkpoint=false,gateOpen=false,bossStarted=false,won=false,dead=false,finishTimer=0,chapter=0;
let camYaw=0,camPitch=.28,camDistance=5.1,locked=null,hitstop=0,shake=0,shakePhase=0,damageFlash=0,context=null,guarding=false,guardTime=0;
const keys=new Set(),stick=new T.Vector2(),moveDir=new T.Vector3(),input=C.createInputBuffer(.28),forward=new T.Vector3(),right=new T.Vector3(),up=new T.Vector3(0,1,0);
const ui=AshenUI.create({onStart:opts=>start(opts.continue),onRestart:retry,onResume:()=>setPause(false),onPause:()=>setPause(true),onTitle:returnTitle,onJournal:openJournal,onRelic:selectRelic,onSettings:s=>{settings=s;sound.setMix?.(s)},onAudio:v=>sound.setEnabled(v),onQuality:q=>{gfx.setQuality(q);if(typeof weather!=='undefined')weather?.setQuality(q)},onHelp:open=>{paused=open||ui.isPaused();clearInput();sound.update(0,{paused});if(open)releaseMouse();else if(started){$('game').focus();captureMouse()}}});
settings=ui.getSettings();sound.setEnabled(settings.audio);sound.setMix?.(settings);gfx.setQuality(settings.quality);ui.setLoading(true);
const controls=typeof AshenControls!=='undefined'?AshenControls.create({onAction:queue,onSprint:v=>gamepadSprint=v,onPause:()=>{if(ui.isModalOpen())ui.hideHelp();else if(!started&&ready)start(!!loadCheckpoint());else setPause(!paused)},onJournal:openJournal,onGuard:v=>{padGuard=v;syncGuard()},onMove:(x,y)=>padMove.set(x,y),onLook:(dx,dy)=>{if(!locked){camYaw-=dx*(settings.sensitivity||1);camPitch=clamp(camPitch+dy*(settings.sensitivity||1),.05,.75)}},onDevice:device=>support=device==='gamepad'?'手柄':'键鼠',onMenu:a=>ui.menuInput?.(a),onDisconnected:()=>{padMove.set(0,0);padGuard=false;syncGuard();if(started&&!dead&&!won)setPause(true)}}):null;
const palette={};for(const [name,color]of Object.entries({stone:'#657071',darkStone:'#28343c',edge:'#a1a498',floor:'#4d565b',soil:'#202c30',gold:'#988052',steel:'#b0b5b8',hero:'#6f7779',boss:'#3a454e',leather:'#24282b',chain:'#454d52',cloth:'#632e30',bossCloth:'#293d48',ember:'#f4ac61',soul:'#9dc8cf',grass:'#555a43',bone:'#b5ad96'})){const m=new T.MeshStandardMaterial({color,metalness:['gold','steel','hero','boss'].includes(name)?.72:.05,roughness:['gold','steel','hero','boss'].includes(name)?.4:.91});m.color.convertSRGBToLinear();palette[name]=m;}
let surfaces=null;
try{[surfaces]=await Promise.all([typeof AshenSurfaces!=='undefined'?AshenSurfaces.load(T,renderer):Promise.resolve(null),AshenCharacters.load({THREE:T,url:'assets/knight-v11.glb',onProgress:p=>{if(ui.loadingProgress)ui.loadingProgress(p.total?p.loaded/p.total:0)}})])}catch(error){$('fatal').hidden=false;$('fatal-text').textContent='资源未能载入，请刷新重试。'+(error.message||error);ui.setLoading(false);return;}
const level=AshenLevel.create({THREE:T,scene,renderer,M:palette,surfaces});
const weather=typeof AshenWeather!=='undefined'?AshenWeather.create({THREE:T,scene,bounds:level.bounds}):null;
weather?.setQuality(ui.getSettings().quality);
const player=entity('player','誓约者',level.spawn.x,level.spawn.z),enemies=[];
for(const [i,at]of level.patrols.entries())enemies.push(entity('sentinel','失誓守卫',at.x,at.z,'sentinel',i));
const boss=entity('boss','无冠守望者',level.bossSpawn.x,level.bossSpawn.z,'boss');enemies.push(boss);
function entity(kind,name,x,z,variant='',index=0){const actor=AshenCharacters.createKnight({THREE:T,scene,M:palette,isBoss:kind==='boss',variant});const e={actor,kind,name,id:kind+'-'+index,x,z,spawnX:x,spawnZ:z,yaw:kind==='player'?PI:0,hp:kind==='player'?120:kind==='boss'?360:68,max:kind==='player'?120:kind==='boss'?360:68,posture:0,state:'idle',t:0,attack:null,hits:new Set(),prevBlade:null,phase:1,cycle:0,aggro:false,cooldown:kind==='boss'?.6:.2,invuln:0,velocity:new T.Vector3(),speed:0,walk:0,step:0,roll:new T.Vector3(),combo:0,chainUntil:0,stamina:100,regenDelay:0,flasks:4,hit:0,deathAge:0,phaseDone:false};actor.root.position.set(x,0,z);actor.root.rotation.y=e.yaw;return e;}
const effect=effectsSystem();
const cameraTarget=new T.Vector3(0,1.3,18),cameraPos=new T.Vector3(0,3.4,23),ray=new T.Raycaster();let cameraClip=6;
let saved=null;try{saved=JSON.parse(localStorage.getItem('ashen-vow-checkpoint')||'null')}catch(e){}ui.setCheckpoint(!!saved);
ready=true;ui.setLoading(false);ui.setStarted(false);document.body.dataset.ready='true';
function change(e,state,attack=null){e.state=state;e.t=0;e.attack=attack;e.hits.clear();e.prevBlade=null;e.soundMask=0;if(state==='heal')e.healed=false;if(state==='hurt'||state==='dead'){if(e===player)input.entries.length=0;}}
function dist(a,b){return Math.hypot(a.x-b.x,a.z-b.z)}
function audioPan(e){return clamp((e.x-player.x)/7,-1,1)}
function save(){
 const data={version:12,active:checkpoint,gate:gateOpen,bossDefeated,defeated:checkpoint?enemies.filter(e=>e.kind==='sentinel'&&e.hp<=0).map(e=>e.id):[],journey:journey.snapshot()};
 try{localStorage.setItem('ashen-vow-checkpoint',JSON.stringify(data));ui.setCheckpoint(true)}catch(e){ui.notify('浏览器未能保存进度；本次旅途仍可继续','warn')}
}
function loadCheckpoint(){try{return AshenJourney.checkpoint(JSON.parse(localStorage.getItem('ashen-vow-checkpoint')||'null'))}catch(e){return null}}
function clearInput(){guarding=mouseGuard=padGuard=gamepadSprint=false;guardTime=0;keys.clear();stick.set(0,0);padMove.set(0,0);input.entries.length=0;controls?.reset()}
function syncGuard(){const next=mouseGuard||padGuard||keys.has('KeyL');if(next&&!guarding)guardTime=0;guarding=next}
function returnTitle(){if(started)save();started=false;paused=false;releaseMouse();dead=won=false;finishTimer=0;mode='title';locked=null;clearInput();ui.setStarted(false);sound.update(0,{paused:true});ui.setCheckpoint(!!loadCheckpoint())}
function journalSnapshot(){return {...journey.snapshot(),player:{x:player.x,z:player.z,yaw:player.yaw},discoveries:level.discoveries||[],entries:AshenJourney.entries,objective:objectiveText(),stage:bossDefeated?'钟声将至':bossStarted?'无冠者之厅':gateOpen?'钟门已开':checkpoint?'余火小堂':'失誓者之径'}}
function openJournal(){if(!started||dead||won)return;if(ui.isModalOpen()){ui.hideHelp();return}ui.showJournal?.(journalSnapshot())}
function selectRelic(id){
 if(!checkpoint||!started||dead||won||!level.checkpoints.some(c=>Math.hypot(player.x-c.x,player.z-c.z)<(c.radius||1.8))||enemies.some(e=>e.aggro&&e.hp>0&&dist(player,e)<8))return;
 if(!journey.equip(id))return;const m=journey.modifiers();player.max=m.maxHp;player.maxStamina=m.maxStamina;player.hp=player.max;player.stamina=player.maxStamina;sound.play('relic');save();ui.notify(m.name+' · '+m.description);
}
function start(resume){if(!ready)return;if(!resume){try{localStorage.removeItem('ashen-vow-checkpoint')}catch(e){}ui.setCheckpoint(false)}started=true;ui.setStarted(true);sound.unlock();resetRun(resume?loadCheckpoint():null);ui.chapter(resume?'余火小堂':'失誓者之径',resume?'火尚未熄，誓言仍在':'THE LAST BELL');$('game').focus();captureMouse()}
function resetRun(data){
 journey.restore(data?.journey);checkpoint=!!data?.active;gateOpen=!!data?.gate;bossDefeated=!!data?.bossDefeated;bossStarted=false;ending=0;dead=won=false;paused=false;mode='game';playTime=journey.snapshot().time;combatTime=0;finishTimer=0;chapter=0;locked=null;context=null;hitstop=shake=damageFlash=0;clearInput();
 const mods=journey.modifiers();player.max=mods.maxHp;player.maxStamina=mods.maxStamina;
 for(const e of [player,...enemies]){e.hp=e.max;e.posture=0;e.postureDelay=0;e.aggro=false;e.returning=false;e.lastAttackAt=-1000;e.lastMoveType=null;e.phase=1;e.phaseDone=false;e.cycle=0;e.cooldown=.6;e.invuln=0;e.speed=0;e.velocity.set(0,0,0);e.deathAge=0;e.hit=0;e.prevBlade=null;e.actor.root.visible=true;e.lastYaw=e===player?PI:0;e.visualVelocity=new T.Vector3();change(e,'idle');e.x=e.spawnX;e.z=e.spawnZ;e.yaw=e===player?PI:0;
  if((e.kind==='sentinel'&&data?.defeated?.includes(e.id))||(e.kind==='boss'&&bossDefeated)){e.hp=0;change(e,'dead');e.deathAge=9;e.actor.root.visible=false;}
 }
 Object.assign(player,{stamina:mods.maxStamina,flasks:4,regenDelay:0,combo:0,chainUntil:0,dodgeUntil:0,counterUntil:0,healed:false,guardBroken:false,criticalTarget:null});
 if(checkpoint){player.x=-8.5;player.z=3.6;player.yaw=Math.atan2(8.5,-9.6)}if(bossDefeated)gateOpen=true;
 level.setGate(gateOpen);level.setBossDefeated?.(bossDefeated);for(const d of level.discoveries||[])level.setDiscovery?.(d.id,journey.snapshot().memories.includes(d.id));
 syncAll();camYaw=player.yaw+PI;camPitch=.28;cameraTarget.set(player.x,1.3,player.z);cameraPos.set(player.x+Math.sin(camYaw)*5,3.4,player.z+Math.cos(camYaw)*5);camera.position.copy(cameraPos);camera.lookAt(cameraTarget);ui.setStarted(true);ui.setPaused(false);ui.updateStep(checkpoint?'小堂可选择一项赐福 · Tab 查看旅途手记':'WASD 行走 · Shift 奔跑 · 移动鼠标观察 · Tab 手记');
}
function retry(){const data=loadCheckpoint()||{active:false};data.journey=journey.snapshot();resetRun(data);ui.chapter(checkpoint?'余火未熄':'誓约未尽','RISE AGAIN');$('game').focus();captureMouse()}
function syncAll(){for(const e of [player,...enemies]){e.actor.root.position.set(e.x,0,e.z);e.actor.root.rotation.y=e.yaw;}}
function setPause(v){if(!started||dead||won)return;paused=v;clearInput();ui.setPaused(v);sound.update(0,{paused:v});if(v)releaseMouse();else captureMouse()}
function queue(action){if(started&&!paused&&!dead&&!won&&!ui.isModalOpen())C.queueInput(input,action,combatTime)}
function boundsContain(x,z,r=.25){return level.bounds.some(b=>x>=b.x-b.w/2+r&&x<=b.x+b.w/2-r&&z>=b.z-b.d/2+r&&z<=b.z+b.d/2-r)}
function move(e,dx,dz){const r=e.kind==='boss'?.55:e===player?.29:.35;let x=e.x+dx,z=e.z+dz;if(!boundsContain(x,z,r)){if(boundsContain(x,e.z,r))z=e.z;else if(boundsContain(e.x,z,r))x=e.x;else return 0;}
for(const o of level.obstacles){if(o.w!=null){const minX=o.x-o.w/2-r,maxX=o.x+o.w/2+r,minZ=o.z-o.d/2-r,maxZ=o.z+o.d/2+r;if(x>minX&&x<maxX&&z>minZ&&z<maxZ){const choices=[{d:Math.abs(x-minX),axis:'x',v:minX},{d:Math.abs(maxX-x),axis:'x',v:maxX},{d:Math.abs(z-minZ),axis:'z',v:minZ},{d:Math.abs(maxZ-z),axis:'z',v:maxZ}].sort((a,b)=>a.d-b.d);if(choices[0].axis==='x')x=choices[0].v;else z=choices[0].v;}}else{const ax=x-o.x,az=z-o.z,d=Math.hypot(ax,az),lim=r+o.r;if(d<lim&&d>.001){x=o.x+ax/d*lim;z=o.z+az/d*lim}}}
for(const other of [player,...enemies]){if(other===e||other.hp<=0)continue;const ax=x-other.x,az=z-other.z,d=Math.hypot(ax,az),lim=Math.max(r+(other.kind==='boss'?.55:other===player?.29:.35),e===player||other===player?(e.kind==='boss'||other.kind==='boss'?1.18:.98):.72);if(d<lim&&d>.001){x=other.x+ax/d*lim;z=other.z+az/d*lim}}
if(!boundsContain(x,z,r))return 0;const traveled=Math.hypot(x-e.x,z-e.z);e.x=x;e.z=z;return traveled;}
function inputDirection(){const x=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0)+stick.x+padMove.x,z=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0)+stick.y+padMove.y;camera.getWorldDirection(forward);forward.y=0;forward.normalize();right.crossVectors(forward,up);moveDir.copy(forward).multiplyScalar(z).addScaledVector(right,x);if(moveDir.length()>1)moveDir.normalize();return moveDir.length();}
function nearest(range=20){let best=null,d=range;for(const e of enemies){if(e.hp<=0||!e.actor.root.visible)continue;const nd=dist(player,e);if(nd<d){best=e;d=nd}}return best;}
function useStamina(amount){if(player.stamina<amount){ui.notify('耐力不足','warn');return false}player.stamina-=amount;player.regenDelay=.65;return true}
function attackPlayer(kind){
 const dodge=kind==='light'&&combatTime<player.dodgeUntil,combo=kind==='light'&&!dodge&&(player.state==='attack'||combatTime<player.chainUntil)?(player.combo+1)%3:0;
 let p=C.getMove(dodge?'dodgeAttack':kind,combo);if(combatTime<player.counterUntil)p=C.counterProfile(p);
 if(!useStamina(p.stamina))return;player.counterUntil=player.dodgeUntil=0;player.combo=combo;player.chainUntil=0;
 const target=locked||nearest(3.1);if(target)player.yaw=Math.atan2(target.x-player.x,target.z-player.z);else if(moveDir.lengthSq()>.01)player.yaw=Math.atan2(moveDir.x,moveDir.z);
 player.criticalTarget=null;change(player,'attack',p)
}
function breakPosture(e){e.posture=100;e.postureDelay=3;change(e,'stagger');sound.play('posture');ui.notify('架势击破 · 靠近按 F 处决','parry');effect.shock(e.x,e.z);}
function criticalStrike(target){if(player.state!=='idle'||target.hp<=0||target.state!=='stagger'||dist(player,target)>1.9)return false;const a=C.getMove('critical');if(!useStamina(a.stamina))return false;player.criticalTarget=target;player.combo=0;player.yaw=Math.atan2(target.x-player.x,target.z-player.z);player.invuln=1.0;target.t=0;change(player,'attack',a);journey.record('executions');sound.play('swing',{heavy:true});return true;}
function rollPlayer(){const p=C.getMove('roll');if(!useStamina(p.stamina))return;player.roll.copy(moveDir.lengthSq()>.01?moveDir:new T.Vector3(-Math.sin(player.yaw),0,-Math.cos(player.yaw))).normalize();change(player,'roll',p);journey.record('rolls');sound.play('roll');}
function updatePlayer(dt){const p=player;p.t+=dt;p.invuln=Math.max(0,p.invuln-dt);p.regenDelay=Math.max(0,p.regenDelay-dt);p.hit=Math.max(0,p.hit-dt);const amount=inputDirection(),moving=amount>.1;guardTime=guarding?guardTime+dt:0;
const action=C.consumeInput(input,combatTime,a=>{if(p.state==='idle')return true;if(p.state==='attack')return a==='light'||a==='heavy'?C.canCancel(p.attack,p.t,a):a==='roll'&&C.canCancel(p.attack,p.t,'roll');return false});
if(action==='interact')interact();else if(action==='lock'){locked=locked?null:nearest(18);sound.play('ui')}else if(action==='roll')rollPlayer();else if(action==='light'||action==='heavy'){if(!guarding)attackPlayer(action)}else if(action==='heal'){if(p.flasks>0&&p.hp<p.max){p.flasks--;journey.record('heals');change(p,'heal');sound.play('heal');p.regenDelay=1.2;}else ui.notify(p.flasks?'生命已满':'药瓶已空')}
if(p.state==='roll'){const u=clamp(p.t/p.attack.total,0,1),speed=7.8*(1-u*.72);move(p,p.roll.x*speed*dt,p.roll.z*speed*dt);if(p.t>=p.attack.total){p.dodgeUntil=combatTime+.38;change(p,'idle');p.actor.root.rotation.x=0;}}
else if(p.state==='attack'){const a=p.attack,pose=C.samplePose(a,p.t);if(p.t>a.windup*.45&&p.t<a.activeEnd){const u=clamp((p.t-a.windup*.45)/(a.activeEnd-a.windup*.45),0,1),speed=a.lunge/(a.activeEnd-a.windup*.45)*Math.sin(u*PI);move(p,Math.sin(p.yaw)*speed*dt,Math.cos(p.yaw)*speed*dt)}if(pose.done){p.criticalTarget=null;p.chainUntil=combatTime+.22;change(p,'idle')}else if(p.t>=a.chainOpen&&p.t<=a.chainClose&&input.entries.some(e=>e.action==='light'&&combatTime-e.time<input.lifetime)){input.entries=input.entries.filter(e=>e.action!=='light');p.chainUntil=combatTime+.3;attackPlayer('light')}}
else if(p.state==='heal'){if(p.t>.72&&!p.healed){p.healed=true;p.hp=Math.min(p.max,p.hp+55);effect.burst(new T.Vector3(p.x,1.1,p.z),'heal',30);ui.notify('余烬温暖了伤口')}if(p.t>1.25){p.healed=false;change(p,'idle')}}
else if(p.state==='hurt'){if(p.t>(p.guardBroken?.85:.34)){p.guardBroken=false;change(p,'idle')}}
else if(p.state==='idle'){const sprint=moving&&(keys.has('ShiftLeft')||gamepadSprint)&&p.stamina>3&&!guarding;const speed=moving?(guarding?1.5:sprint?5.1:3.05):0;p.velocity.x=damp(p.velocity.x,moveDir.x*speed,moving?15:21,dt);p.velocity.z=damp(p.velocity.z,moveDir.z*speed,moving?15:21,dt);move(p,p.velocity.x*dt,p.velocity.z*dt);p.speed=Math.hypot(p.velocity.x,p.velocity.z);if(sprint){p.stamina=Math.max(0,p.stamina-12*dt);p.regenDelay=.25}if(locked&&locked.hp>0){p.yaw+=C.angleDelta(Math.atan2(locked.x-p.x,locked.z-p.z),p.yaw)*(1-Math.exp(-17*dt))}else if(moving){p.yaw+=C.angleDelta(Math.atan2(moveDir.x,moveDir.z),p.yaw)*(1-Math.exp(-15*dt))}p.step+=p.speed*dt;if(p.step>(sprint?1.22:.75)){p.step=0;sound.play('footstep',{heavy:sprint});effect.dust(p.x,p.z)}if(p.regenDelay<=0)p.stamina=Math.min(p.maxStamina||100,p.stamina+(guarding?14:32)*dt)}
if(p.state!=='idle'){p.velocity.multiplyScalar(Math.exp(-18*dt));p.speed=damp(p.speed,0,17,dt)}if(locked&&locked.hp<=0)locked=null;}
function updateEnemy(e,dt){e.t+=dt;e.invuln=Math.max(0,e.invuln-dt);e.hit=Math.max(0,e.hit-dt);if(e.hp<=0){e.deathAge+=dt;e.speed=0;if(e.deathAge>5&&e.kind!=='boss')e.actor.root.visible=false;return}const d=dist(player,e),bossType=e.kind==='boss';e.postureDelay=Math.max(0,(e.postureDelay||0)-dt);if(e.state!=='stagger'&&e.postureDelay<=0)e.posture=Math.max(0,e.posture-dt*7);e.cooldown=Math.max(0,e.cooldown-dt);
if(!e.aggro){const trigger=bossType?player.z<-11:d<7.2;if(trigger&&!dead){e.aggro=true;if(bossType){bossStarted=true;level.setGate(false);ui.chapter('无冠守望者','THE WARDEN OF THE LAST BELL');sound.play('awaken');change(e,'awaken');}else{change(e,'awaken');sound.play('awaken',{distance:d,x:audioPan(e)});if(chapter<1){chapter=1;ui.updateStep('Q 锁定 · J 轻击 · Space 向攻击侧面翻滚')}}}return}
if(e.state==='awaken'){if(e.t>(bossType?1.6:.7))change(e,'idle');return}
if(bossType&&e.phase===1&&e.hp<e.max*.5&&e.state==='idle'){e.phase=2;change(e,'phase');sound.play('phase');effect.shock(e.x,e.z);ui.chapter('第二誓约','不熄之刃');return}
if(e.state==='phase'){if(e.t>2.1)change(e,'idle');return}if(e.state==='hurt'||e.state==='stagger'){if(e.t>(e.state==='stagger'?2.4:.38)){if(e.state==='stagger')e.posture=0;change(e,'idle');}return}
const targetYaw=Math.atan2(player.x-e.x,player.z-e.z);
if(e.state==='attack'){const a=e.attack;if(e.t<a.windup*(a.turnLock||.45))e.yaw+=C.angleDelta(targetYaw,e.yaw)*(1-Math.exp(-6*dt));if(e.t>a.windup*.65&&e.t<a.activeEnd){const u=clamp((e.t-a.windup*.65)/(a.activeEnd-a.windup*.65),0,1),speed=a.lunge/(a.activeEnd-a.windup*.65)*Math.sin(u*PI);move(e,Math.sin(e.yaw)*speed*dt,Math.cos(e.yaw)*speed*dt)}if(e.t>a.total){change(e,'idle');e.cooldown=bossType?.28:.6}e.speed=0;return;}
const decision=AshenTactics.decide(e,player,enemies,{time,guarding,guardTime});
if(decision.action==='return'){
 e.returning=true;
 if(decision.arrived){e.returning=false;e.aggro=false;e.posture=0;e.cooldown=.8;e.speed=0;return;}
 const homeYaw=Math.atan2(decision.dx,decision.dz);e.yaw+=C.angleDelta(homeYaw,e.yaw)*(1-Math.exp(-6*dt));
}else e.yaw+=C.angleDelta(targetYaw,e.yaw)*(1-Math.exp(-6*dt));
if(decision.action==='attack'){
 const p=bossType?C.getBossMove(decision.moveIndex,e.phase):C.getSentinelMove(e.id==='sentinel-1'?1:0,e.cycle);
 e.cycle++;e.lastAttackAt=combatTime;e.lastMoveType=p.type;change(e,'attack',p);e.speed=0;
}else{const traveled=move(e,decision.dx*decision.speed*dt,decision.dz*decision.speed*dt);e.speed=dt>0?traveled/dt:0;}

}
function damage(target,attacker,move){
 if(target.hp<=0||target.invuln>0||target.state==='phase')return;
 let damage=move.damage*(attacker===player?journey.modifiers().damage:1),perfect=false,blocked=false;
 if(target===player){
  if(target.state==='roll'&&C.samplePose(target.attack,target.t).invulnerable){sound.play('roll');return;}
  const yaw=Math.atan2(attacker.x-target.x,attacker.z-target.z);
  if(guarding&&target.state==='idle'&&Math.abs(C.angleDelta(yaw,target.yaw))<PI*.53){
   const g=C.guardHit(damage,target.stamina,guardTime,{maxStamina:player.maxStamina||100,canParry:move.type!=='slam'});
   target.stamina=g.stamina;target.regenDelay=.85;damage=g.damage;perfect=g.perfect;blocked=!g.broken;
   if(perfect){journey.record('parries');player.counterUntil=combatTime+1.5;attacker.posture+=g.poiseDamage;attacker.postureDelay=2.5;if(attacker.posture>=100)breakPosture(attacker);else{change(attacker,'hurt');ui.notify('精准格挡 · 反击窗口','parry');}sound.play('parry');effect.burst(new T.Vector3(target.x,1.2,target.z),'parry',35);}
   else if(g.broken){target.guardBroken=true;change(target,'hurt');sound.play('guardbreak');ui.notify('架势崩溃','warn');}
   else sound.play('guard');
   hitstop=g.hitstop;
  }else{change(target,'hurt');sound.play('bodyhit');hitstop=.065;}
  if(damage>0){ui.damage(damage);damageFlash=blocked?.22:.65;}
 }else{
  target.postureDelay=2.5;
  if(move.kind==='critical'){target.posture=0;change(target,'hurt');sound.play('critical');}
  else{target.posture+=move.poise;if(target.posture>=100)breakPosture(target);else if(target.kind!=='boss'&&target.state!=='attack'&&target.state!=='stagger')change(target,'hurt');}
  sound.play('hit',{heavy:move.kind==='heavy'||move.kind==='critical',combo:move.index,distance:dist(player,target),x:audioPan(target)});hitstop=move.hitstop;
 }
 damage=Math.round(damage*10)/10;const actual=Math.min(target.hp,damage);journey.record(target===player?'damageTaken':'damageDealt',actual);controls?.rumble(perfect?.5:target===player?.6:.22,perfect?110:65);target.hp=Math.max(0,target.hp-damage);target.invuln=.13;target.hit=.16;
 shake=Math.max(shake,perfect?.16:blocked?.07:target===player?.19:move.kind==='critical'?.22:move.kind==='heavy'?.14:.075);
 if(damage>0){
  effect.burst(new T.Vector3(lerp(target.x,attacker.x,.16),target.kind==='boss'?1.5:1.15,lerp(target.z,attacker.z,.16)),blocked?'parry':'hit',move.kind==='heavy'||move.kind==='critical'?28:17);
  const pos=new T.Vector3(target.x,target.kind==='boss'?2.5:2,target.z).project(camera);
  ui.showDamage((pos.x*.5+.5)*innerWidth,(-pos.y*.5+.5)*innerHeight,damage,move.kind==='critical'?'critical':move.kind==='heavy'?'heavy':'normal');
 }
 if(target.hp<=0){
  change(target,'dead');target.deathAge=0;sound.play('death',{distance:dist(player,target)});
  if(target===player){journey.record('deaths');save();dead=true;releaseMouse();mode='result';locked=null;finishTimer=1.3;input.entries.length=0;}
  else if(target.kind==='boss'){journey.record('kills');bossDefeated=true;locked=null;gateOpen=true;level.setGate(true);level.setBossDefeated?.(true);sound.play('death');effect.shock(target.x,target.z);ui.chapter('守望终结','钟绳仍在等待');ui.updateStep('走向大厅尽头，按 F 敲响最后的钟。');save();}
  else{journey.record('kills');ui.notify('失誓者已归于寂静');if(enemies.filter(e=>e.kind==='sentinel'&&e.hp>0).length===0){ui.chapter('钟门已解封','前往庭院深处');ui.updateStep('击败了两名守卫。前往钟门按 F 开门。');}}
 }
}
function bladePoints(e){const w=e.actor.weapon;if(w?.group){const tip=w.group.localToWorld((w.tip||new T.Vector3(0,-1.25,0)).clone()),base=w.group.localToWorld((w.base||new T.Vector3(0,-.15,0)).clone());return {base,tip}}if(e.actor.getBlade)return e.actor.getBlade();return null}
function resolveHits(e){const points=bladePoints(e);if(!points)return;const prev=e.prevBlade||points;e.prevBlade={base:points.base.clone(),tip:points.tip.clone()};if(e.state!=='attack'||e.hp<=0)return;const pose=C.samplePose(e.attack,e.t);if(!pose.active)return;if(!(e.soundMask&pose.hitMask)){e.soundMask|=pose.hitMask;sound.play('swing',{heavy:e.attack.kind==='heavy',combo:e.attack.index,distance:dist(player,e),x:audioPan(e)})}effect.ribbon(e,points);const targets=e===player?enemies:[player];for(const target of targets){if(e===player&&e.attack.kind==='critical'&&target!==player.criticalTarget)continue;if(target.hp<=0||dist(e,target)>e.attack.reach+1.1)continue;const key=target.id+':'+pose.hitMask;if(e.hits.has(key))continue;const radius=target.kind==='boss'?.67:target===player?.34:.40;const targetPos={x:target.x,y:0,z:target.z,minY:.32,maxY:target.kind==='boss'?2.65:1.9};if(C.sweptBladeHit(prev.base,prev.tip,points.base,points.tip,targetPos,radius)){e.hits.add(key);damage(target,e,e.attack);}}}
function animate(e,dt){
 const close=e===player||e.aggro||dist(player,e)<21||(e.kind==='boss'&&bossStarted);e.actor.root.visible=close&&(e.hp>0||e.deathAge<5||e.kind==='boss');if(!close)return;
 e.actor.root.position.set(e.x,0,e.z);e.actor.root.rotation.y=e.yaw;
 const v=e.visualVelocity||e.velocity,yawRate=dt>.0001?C.angleDelta(e.yaw,e.lastYaw??e.yaw)/dt:0;e.lastYaw=e.yaw;
 e.actor.animate({state:e.state,time:e.t,dt,t:time,speed:e.speed,attack:e.attack,guarding:e===player&&guarding,dead:e.hp<=0,comboIndex:e.combo,phase:e.phase,rollDir:e.roll,moveX:v.x,moveZ:v.z,yawRate});
 if(e.actor.setHit)e.actor.setHit(e.hit);e.actor.setCombatCue?.({state:e.state,time:e.t,attack:e.attack});
}
function interact(){
 updateContext();if(!context)return;
 if(context.kind==='critical'){criticalStrike(context.target);return;}
 if(player.state!=='idle')return;
 if(context.kind==='bell'){
  if(!bossDefeated)return;won=true;releaseMouse();mode='result';finishTimer=4.5;locked=null;clearInput();level.ringBell?.();sound.play('bell');ui.chapter('最后的钟声','愿远行的人，终于归来');ui.updateStep('');save();return;
 }
 if(context.kind==='memory'){
  const entry=journey.read(context.id);if(!entry)return;
  if(entry.fresh){player.flasks=Math.min(4,player.flasks+1);level.setDiscovery?.(context.id,true);sound.play('memory');save()}
  ui.showMemory?.(entry);return;
 }
 if(context.kind==='checkpoint'){
  if(enemies.some(e=>e.aggro&&e.hp>0&&dist(player,e)<8)){ui.notify('战斗中无法休息','warn');return;}
  checkpoint=true;player.hp=player.max;player.stamina=player.maxStamina||100;player.flasks=4;save();sound.play('checkpoint');effect.burst(new T.Vector3(player.x,1,player.z),'heal',45);ui.updateStep('小堂赐福只可装备一项，可在此重新选择。');ui.showShrine?.({relic:journey.snapshot().relic});
 }else if(context.kind==='gate'){
  if(enemies.some(e=>e.kind==='sentinel'&&e.hp>0)){ui.notify('两名守卫仍在看守钟门','warn');return;}
  gateOpen=true;level.setGate(true);sound.play('gate');ui.chapter('无冠者的庭院','THE FORSAKEN CLOISTER');save();ui.updateStep('穿过钟门，面对最后的守望者。');
 }
}
function updateContext(){
 context=null;const exposed=enemies.find(e=>e.hp>0&&e.state==='stagger'&&dist(player,e)<1.9);
 if(exposed&&player.state==='idle'){context={kind:'critical',target:exposed};ui.setContext({text:'处决 · 贯穿誓约',key:support==='手柄'?'Y':'F'});return;}
 if(player.state==='idle'){
  if(bossDefeated&&level.bell&&Math.hypot(player.x-level.bell.x,player.z-level.bell.z)<level.bell.radius)context=level.bell;
  if(!context)for(const c of level.checkpoints)if(Math.hypot(player.x-c.x,player.z-c.z)<(c.radius||1.8)){context=c;break;}
  if(!context&&!gateOpen&&Math.abs(player.x)<2.4&&Math.abs(player.z+6)<2)context={kind:'gate'};
  if(!context&&!enemies.some(e=>e.aggro&&e.hp>0&&dist(player,e)<7))for(const d of level.discoveries||[])if(Math.hypot(player.x-d.x,player.z-d.z)<(d.radius||1.7)){context=d;break;}
 }
 const label=context?.kind==='bell'?'敲响最后的钟声':context?.kind==='memory'?'聆听残响 · '+context.name:context?.kind==='checkpoint'?(checkpoint?'休息 · 选择赐福':'点燃余火 · 接受赐福'):'推开钟门';
 ui.setContext(context?{text:label,key:support==='手柄'?'Y':'F'}:'');
}
function objectiveText(){const left=enemies.filter(e=>e.kind==='sentinel'&&e.hp>0).length;return won?'最后的钟声，终于响起':bossDefeated?'走向大厅尽头，敲响古钟':bossStarted?'击败无冠守望者':!gateOpen?(left?'穿过废墟，击败守卫 '+(2-left)+'/2':'前往钟门，按 F 推开'):'穿过钟门，寻找守望者';}

function updateCamera(dt){if(!started){const a=Math.sin(time*.08)*.12;cameraTarget.set(0,1.2,15.8);camera.position.set(-2.7+Math.sin(a)*.8,2.55,21.0);camera.lookAt(cameraTarget);return;}const target=new T.Vector3(player.x,1.25,player.z);let desired;if(locked&&locked.hp>0&&!dead&&!won){const toward=new T.Vector3(player.x-locked.x,0,player.z-locked.z).normalize(),side=new T.Vector3(-toward.z,0,toward.x).multiplyScalar(.42);desired=target.clone().addScaledVector(toward,5.0).add(side).add(new T.Vector3(0,1.65,0));target.lerp(new T.Vector3(locked.x,1.55,locked.z),.24);camYaw=Math.atan2(toward.x,toward.z);}else{const distance=camDistance+(player.speed>4?.35:0);desired=target.clone().add(new T.Vector3(Math.sin(camYaw)*distance,Math.sin(camPitch)*distance+.4,Math.cos(camYaw)*distance));}
cameraTarget.lerp(target,1-Math.exp(-13*dt));cameraPos.lerp(desired,1-Math.exp(-8*dt));let cameraGoal=cameraPos.clone();cameraClip=C.cameraDistance(cameraTarget,cameraGoal,level.obstacles);const rayDir=cameraGoal.clone().sub(cameraTarget),len=rayDir.length();if(cameraClip<len)cameraGoal=cameraTarget.clone().addScaledVector(rayDir.normalize(),cameraClip);camera.position.copy(cameraGoal);if(shake>0){shakePhase+=dt*90;if(settings.shake!==false){camera.position.x+=Math.sin(shakePhase*1.3)*shake;camera.position.y+=Math.cos(shakePhase*1.7)*shake*.55;}shake=Math.max(0,shake-dt*.8)}camera.lookAt(cameraTarget);const fov=player.state==='attack'&&player.attack?.kind==='critical'?46:player.speed>4?55:51;camera.fov=damp(camera.fov,fov,5,dt);camera.updateProjectionMatrix();if(locked&&locked.hp>0&&!dead&&!won){const at=new T.Vector3(locked.x,locked.kind==='boss'?2.15:1.6,locked.z).project(camera);ui.setLock({x:(at.x*.5+.5)*innerWidth,y:(-at.y*.5+.5)*innerHeight,visible:at.z<1})}else ui.setLock({visible:false});}
function updateUI(){
 const guardsLeft=enemies.filter(e=>e.kind==='sentinel'&&e.hp>0).length,close=locked||nearest(4),mods=journey.modifiers(),snapshot=journey.snapshot();
 let telegraph='';if(close?.state==='attack'&&close.t<close.attack?.windup)telegraph=close.attack.type==='slam'?'重砸 · 翻滚避开':close.attack.type==='thrust'?'突刺 · 向侧面闪避':close.attack.type==='combo'?'连斩 · 留意第二剑':'';
 const status=player.guardBroken?'架势崩溃':combatTime<player.counterUntil?'精准格挡 · 下一剑强化':combatTime<player.dodgeUntil?'翻滚反击 · J 突刺':guarding?'举盾 · 耐力恢复减缓':'';
 ui.update({hp:player.hp,maxHp:player.max,stamina:player.stamina,maxStamina:player.maxStamina||100,flasks:player.flasks,bossHp:bossStarted?boss.hp:0,bossMax:bossStarted?boss.max:0,bossName:boss.name,bossTitle:boss.phase===2?'SECOND VOW · 不熄之刃':'THE WARDEN OF THE LAST BELL',posture:boss.posture,postureMax:100,enemyHp:close?.hp||0,enemyMax:close?.max||1,enemyPosture:close?.posture||0,enemyName:close&&close.kind!=='boss'?close.name:'',objective:objectiveText(),locked:!!locked,relicName:mods.id?mods.name:'',memories:snapshot.memories.length,status,support:support==='手柄'?'gamepad':'keyboard',telegraph:settings.hints===false?'':telegraph});
 Object.assign(document.body.dataset,{ready:String(ready),playerState:player.state,playerX:player.x.toFixed(2),playerZ:player.z.toFixed(2),bossState:boss.state,phase:boss.phase,gate:String(gateOpen),checkpoint:String(checkpoint),guards:String(guardsLeft),paused:String(paused),fps:String(Math.round(fps)),release:'12',resolution:String(gfx.getResolution?.()||1),targetPosture:String(nearest(20)?.posture||0),targetT:String(nearest(20)?.t||0),targetWindup:String(nearest(20)?.attack?.windup||0),targetDistance:nearest(20)?dist(player,nearest(20)).toFixed(2):'-',targetState:nearest(20)?.state||'-',targetHp:nearest(20)?.hp||0,frames:String(frameCount),memories:String(snapshot.memories.length),relic:snapshot.relic||'none',bossDefeated:String(bossDefeated)});
}

function bindInputs(){addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code)&&!ui.isModalOpen())e.preventDefault();if(e.code==='Escape'){if(ui.isModalOpen()){ui.hideHelp();return}setPause(!paused);return}if(!started){if(e.code==='Enter'&&ready)start(!!loadCheckpoint());return}if((e.code==='Tab'||e.code==='KeyM')&&!e.repeat){e.preventDefault();openJournal();return}if(e.code==='KeyR'&&(dead||won)){retry();return}if(paused||dead||won||ui.isModalOpen())return;keys.add(e.code);if(e.code==='KeyL')syncGuard();support='键鼠';if(e.repeat)return;const a={KeyJ:'light',KeyK:'heavy',Space:'roll',KeyE:'heal',KeyF:'interact',KeyQ:'lock'}[e.code];if(a)queue(a)});addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='KeyL')syncGuard()});addEventListener('blur',()=>{if(started&&!dead&&!won)setPause(true)});document.addEventListener('visibilitychange',()=>{if(document.hidden&&started&&!dead&&!won)setPause(true)});
const canvas=$('game');let hoverPoint=null;
canvas.addEventListener('pointerdown',e=>{canvas.focus();if(paused||!started||dead||won||ui.isModalOpen())return;support='键鼠';if(e.pointerType==='touch')return;captureMouse();if(e.button===2){mouseGuard=true;syncGuard()}else if(e.button===0)queue('light')});
canvas.addEventListener('pointermove',e=>{if(e.pointerType==='touch'||document.pointerLockElement===canvas)return;if(hoverPoint)cameraLook(e.clientX-hoverPoint.x,e.clientY-hoverPoint.y);hoverPoint={x:e.clientX,y:e.clientY}});
canvas.addEventListener('pointerenter',e=>{hoverPoint={x:e.clientX,y:e.clientY}});canvas.addEventListener('pointerleave',()=>hoverPoint=null);
document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas)cameraLook(e.movementX,e.movementY)});
document.addEventListener('pointerlockchange',()=>{const active=document.pointerLockElement===canvas;document.body.dataset.mouseLocked=String(active);if(wasMouseLocked&&!active&&started&&!paused&&!dead&&!won&&!ui.isModalOpen())setPause(true);wasMouseLocked=active;hoverPoint=null});
canvas.addEventListener('pointerup',e=>{if(e.button===2){mouseGuard=false;syncGuard()}});canvas.addEventListener('pointercancel',()=>{mouseGuard=false;syncGuard();hoverPoint=null});canvas.addEventListener('contextmenu',e=>e.preventDefault());addEventListener('pointerup',e=>{if(e.button===2){mouseGuard=false;syncGuard()}});
canvas.addEventListener('wheel',e=>{e.preventDefault();if(!paused&&started)camDistance=clamp(camDistance+e.deltaY*.004,3.4,7)},{passive:false});
const joy=$('joy');let joyId=null;const updateJoy=e=>{const r=joy.getBoundingClientRect();stick.set((e.clientX-r.left-r.width/2)/(r.width*.35),-(e.clientY-r.top-r.height/2)/(r.height*.35));if(stick.length()>1)stick.normalize();$('joy-knob').style.transform=`translate(${stick.x*27}px,${-stick.y*27}px)`;};joy.onpointerdown=e=>{joyId=e.pointerId;joy.setPointerCapture(e.pointerId);updateJoy(e)};joy.onpointermove=e=>{if(e.pointerId===joyId)updateJoy(e)};joy.onpointerup=joy.onpointercancel=()=>{joyId=null;stick.set(0,0);$('joy-knob').style.transform=''};for(const [id,a]of Object.entries({'touch-light':'light','touch-heavy':'heavy','touch-roll':'roll','touch-heal':'heal','touch-lock':'lock','touch-interact':'interact'})){const el=$(id);if(el)el.onpointerdown=e=>{e.preventDefault();queue(a)}}const guard=$('touch-guard');if(guard){guard.onpointerdown=e=>{e.preventDefault();guarding=true;guardTime=0;guard.setPointerCapture(e.pointerId)};guard.onpointerup=guard.onpointercancel=()=>guarding=false;}}
function effectsSystem(){const pos=new Float32Array(200*3),colors=new Float32Array(200*3),particles=Array.from({length:200},()=>({life:0}));for(let i=0;i<200;i++)pos[i*3+1]=-100;const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(pos,3));geo.setAttribute('color',new T.BufferAttribute(colors,3));const material=new T.PointsMaterial({size:.055,vertexColors:true,transparent:true,depthWrite:false,blending:T.AdditiveBlending});const points=new T.Points(geo,material);points.frustumCulled=false;scene.add(points);const light=new T.PointLight('#ffba71',0,4,2);scene.add(light);const rings=[];const ribbons=new Map();
function burst(at,kind,n){let count=0;for(const p of particles){if(p.life>0)continue;const dust=kind==='dust',heal=kind==='heal';p.life=p.max=dust?.6:.28+Math.random()*.38;p.at=at.clone();p.vel=new T.Vector3((Math.random()-.5)*(dust?.7:4),heal?1+Math.random():.5+Math.random()*3,(Math.random()-.5)*(dust?.7:4));p.color=kind==='parry'?new T.Color('#c5e5ff'):heal?new T.Color('#adcc8f'):dust?new T.Color('#686e69'):new T.Color('#ffc16b');if(++count>=n)break;}if(kind!=='dust'&&kind!=='heal'){light.position.copy(at);light.intensity=12;}}
function ribbon(e,at){let r=ribbons.get(e);if(!r){const array=new Float32Array(10*6),alpha=new Float32Array(20),indices=[];for(let i=0;i<9;i++)indices.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2);const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(array,3));g.setAttribute('alpha',new T.BufferAttribute(alpha,1));g.setIndex(indices);const m=new T.ShaderMaterial({transparent:true,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending,uniforms:{tint:{value:new T.Color(e===player?'#bcdce9':'#c7a77c')}},vertexShader:'attribute float alpha;varying float v;void main(){v=alpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying float v;uniform vec3 tint;void main(){gl_FragColor=vec4(tint,v*.28);}'});const mesh=new T.Mesh(g,m);mesh.frustumCulled=false;scene.add(mesh);r={mesh,g,array,alpha,history:[],age:0};ribbons.set(e,r)}r.age=0;r.history.unshift({base:at.base.clone(),tip:at.tip.clone()});if(r.history.length>10)r.history.pop();}
function shock(x,z){const m=new T.MeshBasicMaterial({color:'#c3b18c',transparent:true,opacity:.5,side:T.DoubleSide,depthWrite:false});const mesh=new T.Mesh(new T.RingGeometry(.9,1,64),m);mesh.rotation.x=-PI/2;mesh.position.set(x,.025,z);scene.add(mesh);rings.push({mesh,t:0})}
return {burst,ribbon,shock,dust:(x,z)=>burst(new T.Vector3(x,.04,z),'dust',4),update(dt){light.intensity=Math.max(0,light.intensity-dt*110);for(let i=0;i<200;i++){const p=particles[i];if(p.life>0){p.life-=dt;p.vel.y-=dt*4;p.at.addScaledVector(p.vel,dt);pos.set(p.at.toArray(),i*3);const f=Math.max(0,p.life/p.max);colors.set([p.color.r*f,p.color.g*f,p.color.b*f],i*3)}else pos[i*3+1]=-100;}geo.attributes.position.needsUpdate=true;geo.attributes.color.needsUpdate=true;for(const r of ribbons.values()){r.age+=dt;r.mesh.visible=r.age<.12&&r.history.length>1;if(!r.mesh.visible){r.history.length=0;continue}for(let i=0;i<10;i++){const a=r.history[Math.min(i,r.history.length-1)];r.array.set(a.base.toArray(),i*6);r.array.set(a.tip.toArray(),i*6+3);r.alpha[i*2]=r.alpha[i*2+1]=(1-i/10)*Math.max(0,1-r.age/.12);}r.g.attributes.position.needsUpdate=true;r.g.attributes.alpha.needsUpdate=true;}for(let i=rings.length-1;i>=0;i--){const r=rings[i];r.t+=dt;r.mesh.scale.setScalar(.2+r.t*6);r.mesh.material.opacity=Math.max(0,.5-r.t*.65);if(r.t>.8){scene.remove(r.mesh);r.mesh.geometry.dispose();r.mesh.material.dispose();rings.splice(i,1)}}}};}
bindInputs();
function frame(now){requestAnimationFrame(frame);const realDt=last?Math.max(0,(now-last)/1000):0;last=now;const dt=Math.min(realDt,.033);fps=damp(fps,1/Math.max(realDt,1/120),2,dt);if(document.hidden)return;time+=dt;controls?.update(dt,{enabled:started&&!paused&&!dead&&!won&&!ui.isModalOpen()});level.setReducedMotion?.(settings.shake===false);weather?.setReducedMotion?.(settings.shake===false);if(ready&&!paused&&!ui.isModalOpen()){hitstop=Math.max(0,hitstop-dt);const sim=hitstop>0?0:dt;if(started&&!dead&&!won){combatTime+=sim;playTime+=sim;journey.advance(sim);const previous=[player,...enemies].map(e=>({x:e.x,z:e.z}));updatePlayer(sim);for(const e of enemies)updateEnemy(e,sim);[player,...enemies].forEach((e,i)=>{e.visualVelocity=e.visualVelocity||new T.Vector3();if(sim>0)e.visualVelocity.set((e.x-previous[i].x)/sim,0,(e.z-previous[i].z)/sim);});syncAll();for(const e of [player,...enemies])animate(e,sim);for(const e of [player,...enemies])resolveHits(e);updateContext();if(player.z<11&&chapter===0){chapter=1;ui.updateStep('J / K 攻击 · L 格挡 · Space 翻滚 · E 喝药');}}else{for(const e of [player,...enemies]){if(e.hp<=0){e.t+=dt;e.deathAge+=dt;}animate(e,sim)}}if((dead||won)&&finishTimer>0){finishTimer-=dt;if(finishTimer<=0)ui.result({victory:won,time:journey.snapshot().time,kills:enemies.filter(e=>e.hp<=0).length,stats:journey.snapshot().stats,memories:journey.snapshot().memories.length,relic:journey.modifiers().name})}level.update(dt,time);ending=level.ending||0;weather?.setEnding?.(ending);weather?.update(dt,time,player);effect.update(dt);sound.update(dt,{combat:enemies.some(e=>e.aggro&&e.hp>0),phase:boss.phase,playerHp:player.hp/player.max,sheltered:player.x<-6&&player.z>-.2&&player.z<6.5,paused:false});}
updateCamera(dt);updateUI();gfx.render(realDt,time,{damage:settings.shake===false?0:damageFlash,phase:boss.phase,ending});damageFlash=Math.max(0,damageFlash-dt*2);frameCount++;}
addEventListener('resize',()=>gfx.resize());renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();$('fatal').hidden=false;$('fatal-text').textContent='图形连接中断，请刷新后重试。'});requestAnimationFrame(frame);
})();

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('./feel.js');
const frames=seconds=>Math.max(0,Math.ceil(seconds*60-1e-8));
function until(q,predicate,seconds,label){for(let i=0,n=frames(seconds)+6;i<n&&!predicate();i++)q.tick();assert.ok(predicate(),label||'the controller did not reach the expected phase');}
function actionTime(q,entity,time){until(q,()=>entity.t>=time||!['attack','roll'].includes(entity.state),Math.max(0,time-entity.t)+.5,'action did not reach its profile phase');}
function finishAction(q,entity=q.player){const state=entity.state,budget=(entity.attack?.total||1.5)-entity.t+.6;until(q,()=>entity.state!==state,Math.max(.6,budget),'action did not finish its source-duration recovery');}

// Controller integration uses real THREE transforms, level bounds and blade
// collision, with a small deterministic articulated sword fixture in place of
// network-loaded GLB art. It verifies rules/state, not the exported animation.
async function boot(options={}){
 const T={...require('./vendor/three.min.js')},elements=new Map(),listeners={},storage=new Map();
 const element=id=>{if(elements.has(id))return elements.get(id);const e={id,style:{},dataset:{},hidden:true,events:{},focus(){},addEventListener(t,f){this.events[t]=f},setPointerCapture(){},getBoundingClientRect(){return {left:0,top:0,width:100,height:100}}};elements.set(id,e);return e;};
 let callbacks,updates,now=1000,lastMemory=null,lastShrine=null,lastJournal=null,modalOpen=false,uiPaused=false;
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(51,16/9,.1,200),renderer={domElement:element('game'),capabilities:{getMaxAnisotropy:()=>1}};
 T.Raycaster=class{set(){}intersectObjects(){return []}};
 const noop=()=>{};
 const ui={getSettings:()=>({audio:false,quality:'medium',...options.settings}),isModalOpen:()=>modalOpen,isPaused:()=>uiPaused,update:v=>updates=v};
 for(const name of ['setLoading','setCheckpoint','setStarted','chapter','updateStep','setPaused','notify','damage','showDamage','setContext','setLock','result','hideHelp','setCinematic','location'])ui[name]=noop;
 ui.setPaused=v=>uiPaused=!!v;ui.hideHelp=()=>{modalOpen=false;callbacks?.onHelp(false)};
 ui.showMemory=e=>lastMemory=e;ui.showShrine=e=>lastShrine=e;ui.showJournal=e=>lastJournal=e;
 const levelBounds=[{x:0,z:15.5,w:9,d:13},{x:0,z:1.5,w:12,d:17},{x:-8.5,z:3.25,w:7,d:6.5},{x:0,z:-8,w:6.2,d:4},{x:0,z:-21,w:23,d:26}];
 const level={root:new T.Group(),bounds:levelBounds,obstacles:[],spawn:{x:0,z:18},bossSpawn:{x:0,z:-25},patrols:[{x:-1.8,z:8},{x:2.2,z:-2}],checkpoints:[{x:-9,z:3,kind:'checkpoint',radius:1.8}],discoveries:[{id:'arrival',name:'破盾',x:2.8,z:16.7,radius:1.7,kind:'memory'},{id:'chapel',name:'祷书',x:-8.3,z:5.2,radius:1.7,kind:'memory'},{id:'warden',name:'空冠',x:7.4,z:-19.8,radius:1.7,kind:'memory'}],bell:{x:0,z:-29.5,radius:2,kind:'bell'},setDiscovery:noop,setBossDefeated:noop,ringBell:()=>true,setGate:noop,update:noop};scene.add(level.root);
 const ctx={console,Math,Float32Array,Uint8Array,Map,Set,THREE:T,innerWidth:1280,innerHeight:720,document:{getElementById:element,body:element('body'),hidden:false,addEventListener(t,f){listeners['document:'+t]=f}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},addEventListener(t,f){listeners[t]=f},requestAnimationFrame:noop,
  AshenRender:{create:()=>({scene,camera,renderer,setQuality:noop,render:noop,resize:noop})},AshenAudio:{create:()=>({setEnabled:noop,unlock:noop,play:noop,update:noop})},AshenUI:{create:c=>{callbacks=c;return ui}},AshenLevel:{create:()=>level},
  AshenCharacters:{load:async()=>{},createKnight(){const root=new T.Group(),blade=new T.Group();root.add(blade);scene.add(root);return {root,weapon:{group:blade,base:new T.Vector3(0,0,.20),tip:new T.Vector3(0,0,2.05)},
   // Deliberately simple fixture displacement, not production root-motion data.
   actionRootDelta(profile,from,to){const total=Math.max(.001,profile.total),at=t=>Math.max(0,Math.min(total,t));return{x:0,z:(profile.lunge||0)*(at(to)-at(from))/total}},
   animate(o){this.lastAnimation={speed:o.speed,moveX:o.moveX,moveZ:o.moveZ};blade.position.set(.12,1.05,0);let yaw=0;if(o.attack&&o.state==='attack'){const pose=ctx.AshenCombat.samplePose(o.attack,o.time);yaw=(pose.localStrike-.5)*1.0;this.weapon.tip.z=o.attack.reach;}blade.rotation.y=yaw;root.updateMatrixWorld(true);if(options.poseContacts)this.contactPoints=[new T.Vector3(root.position.x+.7,1,root.position.z)];},updateEquipment(){root.updateWorldMatrix(true,true)},setHit:noop};}}
 };
 ctx.location={hostname:'localhost'};ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
 for(const file of ['feel.js','navigation.js','journey.js','tactics.js',...(options.cinematics?['director.js','impact.js']:[])])vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),ctx);
 const source=fs.readFileSync(path.join(__dirname,'game.js'),'utf8').replace(/\}\)\(\);\s*$/,'globalThis.qa={player,enemies,boss,level,camera,start,retry,frame,updatePlayer,damage,change,resolveHits,journey,updateContext,interact,selectRelic,get flags(){return {dead,won,bossDefeated,paused,checkpoint,gateOpen,locked,time,directing:!!director?.active,combatTime,playTime,hitstop,frameCount,guarding,guardTime};}};})();');
 await vm.runInContext(source,ctx);const q=ctx.qa;
 q.press=(code,repeat=false)=>listeners.keydown({code,repeat,preventDefault:noop});q.release=(code)=>listeners.keyup({code});q.tick=(n=1)=>{for(let i=0;i<n;i++){now+=1000/60;q.frame(now)}};
 q.advance=ms=>{now+=ms;q.frame(now)};q.runFor=(seconds,hz=60)=>{for(let i=0;i<Math.round(seconds*hz);i++)q.advance(1000/hz)};
 q.startPublic=(resume=false)=>{callbacks.onStart({continue:resume});q.frame(now)};q.ui=()=>updates;q.callbacks=()=>callbacks;q.memory=()=>lastMemory;q.shrine=()=>lastShrine;q.journal=()=>lastJournal;q.storage=storage;q.mouseMove=(x,y)=>element('game').events.pointermove({clientX:x,clientY:y,pointerType:'mouse'});q.pointerLock=active=>{ctx.document.pointerLockElement=active?element('game'):null;listeners['document:pointerlockchange']()};q.blur=()=>listeners.blur();q.visibility=(hidden,notify=true)=>{ctx.document.hidden=hidden;if(notify)listeners['document:visibilitychange']()};q.modal=open=>{modalOpen=open;callbacks.onHelp(open)};q.tick();return q;
}

test('controller applies the blade fixture sweep only during the profile contact window',async()=>{
 const q=await boot();q.startPublic();const enemy=q.enemies[0];
 // Arrange a melee encounter; all damage still passes through frame animation
 // and actual sword sweep, with no direct hit/damage calls.
 q.player.x=enemy.x;q.player.z=enemy.z+2;q.player.yaw=Math.PI;q.press('KeyQ');q.release('KeyQ');q.press('KeyJ');q.release('KeyJ');
 until(q,()=>q.player.state==='attack',.15,'lock and strike inputs did not enter the attack');const move=C.getMove('light');actionTime(q,q.player,move.windup-1/30);assert.equal(enemy.hp,enemy.max);actionTime(q,q.player,move.activeEnd+1/30);assert.ok(enemy.hp<enemy.max);
});

test('controller consumes light chain presses as the next cut, not a repeated opener',async()=>{
 const q=await boot();q.startPublic();tap(q,'KeyJ');q.tick();const opener=C.getMove('light',0);
 actionTime(q,q.player,opener.chainOpen-.10);tap(q,'KeyJ');assert.equal(q.player.combo,0,'the buffered press should not cancel anticipation');
 until(q,()=>q.player.combo===1,opener.chainClose-q.player.t+.1,'the buffered chain never opened');
 assert.equal(q.player.attack.id,C.getMove('light',1).id);assert.equal(q.player.attack.index,1);
});

test('held guard waits for authored strike recovery and starts a fresh guard window',async()=>{
 for(const [kind,key]of [['light','KeyJ'],['heavy','KeyK']]){
  const q=await boot();q.startPublic();tap(q,key);q.tick();const move=C.getMove(kind);
  assert.equal(q.player.state,'attack');q.press('KeyL');actionTime(q,q.player,move.windup*.5);
  assert.equal(q.player.state,'attack','held shield must preserve anticipation');assert.equal(q.flags.guardTime,0);
  actionTime(q,q.player,move.activeEnd+1/60);assert.equal(q.player.state,'attack','held shield must preserve the blade contact');assert.equal(q.flags.guardTime,0);
  actionTime(q,q.player,move.guardAt-1/30);assert.equal(q.player.state,'attack','guard should not cancel before guardAt');
  until(q,()=>q.player.state==='idle',.15,'authored recovery did not hand control to the held shield');
  assert.equal(q.flags.guarding,true);assert.ok(q.flags.guardTime<.05,'holding L during the strike consumed the actual guard window');
  assert.equal(q.player.chainUntil,0);q.runFor(.20);assert.ok(q.flags.guardTime>.16,'actual sustained guard must expire its perfect window');q.release('KeyL');q.tick();assert.equal(q.flags.guardTime,0);
 }
});

test('an interrupted completed heal cannot poison the next flask or a restart',async()=>{
 const q=await boot();q.startPublic();q.player.hp=20;q.press('KeyE');q.release('KeyE');q.tick(47);assert.equal(q.player.hp,75);
 q.damage(q.player,q.enemies[0],{damage:10,poise:0,hitstop:0,kind:'sentinel'});q.tick(25);q.press('KeyE');q.release('KeyE');q.tick(48);
 assert.equal(q.player.hp,120);q.retry();assert.equal(q.player.hp,120);assert.equal(q.player.flasks,4);assert.equal(q.player.guardBroken,false);
});

test('fresh-run death retries its current run rather than an older saved checkpoint',async()=>{
 const q=await boot();q.storage.set('ashen-vow-checkpoint',JSON.stringify({active:true,gate:true,defeated:['sentinel-0','sentinel-1']}));
 q.startPublic(false);q.retry();assert.equal(q.flags.checkpoint,false);assert.equal(q.player.z,18);
});

test('a timed guard that fills posture produces the same stagger as a heavy hit',async()=>{
 const q=await boot();q.startPublic();const enemy=q.enemies[0];
 q.player.x=enemy.x;q.player.z=enemy.z+1.6;q.player.yaw=Math.PI;enemy.posture=60;
 q.press('KeyL');q.updatePlayer(.01);q.damage(q.player,enemy,{damage:19,type:'sweep',poise:18});
 assert.equal(q.player.hp,q.player.max);assert.equal(enemy.state,'stagger');assert.equal(enemy.posture,100);
 q.release('KeyL');
});

test('contextual execution needs close stagger and damages only the selected enemy through its blade',async()=>{
 const q=await boot();q.startPublic();const target=q.boss;
 q.player.x=target.x;q.player.z=target.z+1.65;q.player.yaw=Math.PI;target.aggro=true;
 q.tick(2);tap(q,'KeyF');q.tick(2);assert.equal(q.player.state,'idle');
 q.change(target,'stagger');target.posture=100;q.tick(2);tap(q,'KeyF');q.tick();const move=C.getMove('critical');actionTime(q,q.player,move.windup-1/30);
 assert.equal(q.player.attack.kind,'critical');assert.equal(target.hp,360);
 actionTime(q,q.player,move.activeEnd+1/30);assert.equal(target.hp,260);assert.equal(target.posture,0);
 assert.equal(q.enemies[0].hp,68);assert.equal(q.enemies[1].hp,68);
});

test('an exposed enemy outside execution distance cannot receive contextual damage',async()=>{
 const q=await boot();q.startPublic();const target=q.boss;q.player.x=target.x;q.player.z=target.z+3;
 target.aggro=true;q.change(target,'stagger');q.tick(2);tap(q,'KeyF');q.tick(frames(C.getMove('critical').total+.1));
 assert.equal(target.hp,360);assert.equal(q.player.stamina,100);
});

function tap(q,code){q.press(code);q.release(code);}
function releaseMovement(q){for(const k of ['KeyW','KeyA','KeyS','KeyD'])q.release(k);}
function moveToward(q,x,z){
 releaseMovement(q);const dx=x-q.player.x,dz=z-q.player.z,length=Math.hypot(dx,dz);if(length<.22)return true;
 const v=new (require('./vendor/three.min.js').Vector3)();q.camera.getWorldDirection(v);const fl=Math.hypot(v.x,v.z),fx=v.x/fl,fz=v.z/fl;
 const along=(dx*fx+dz*fz)/length,side=(dx*(-fz)+dz*fx)/length;
 if(along>.24)q.press('KeyW');if(along<-.24)q.press('KeyS');if(side>.24)q.press('KeyD');if(side<-.24)q.press('KeyA');return false;
}
function walkTo(q,x,z){for(let i=0;i<1600;i++){if(moveToward(q,x,z)){releaseMovement(q);q.tick(5);return;}q.tick();if(q.flags.dead)break;}assert.fail('Could not reach '+[x,z]+' from '+[q.player.x,q.player.z]);}
function fight(q,target){
 let guardHeld=false;
 if(!q.flags.locked)tap(q,'KeyQ');
 for(let i=0;i<15000;i++){
  if(target.hp<=0){q.release('KeyL');releaseMovement(q);q.tick(30);return;}
  if(q.flags.dead)assert.fail('Died fighting '+target.kind+' hp='+target.hp+' playerstate='+q.player.state);
  const p=q.player,d=Math.hypot(p.x-target.x,p.z-target.z),a=target.attack;
  const incoming=target.state==='attack'&&a&&target.t>=a.windup-.10&&target.t<=a.activeEnd;
  if(incoming&&!guardHeld){q.press('KeyL');guardHeld=true;}
  if(!incoming&&guardHeld){q.release('KeyL');guardHeld=false;}
  releaseMovement(q);
  if(p.state==='idle'&&!incoming){
   if(d>2.50)moveToward(q,target.x,target.z);
   else if(p.hp<60&&p.flasks>0&&(target.state==='stagger'||target.state==='phase'))tap(q,'KeyE');
   else if(target.state==='hurt'||target.state==='stagger'||(target.state==='attack'&&target.t>a.activeEnd+.015))tap(q,'KeyK');
  }
  q.tick();
 }
 assert.fail('Fight stalled '+JSON.stringify({kind:target.kind,hp:target.hp,state:target.state,t:target.t,playerHp:q.player.hp,stamina:q.player.stamina,playerState:q.player.state,x:q.player.x,z:q.player.z}));
}

test('fixture controller advances the whole level state through public controls',async()=>{
 const q=await boot();q.startPublic();
 // This playthrough changes no HP, positions or enemy states. Every movement,
 // parry, flask and attack enters through the same keyboard callbacks as play.
 // It exercises state rules only; production-flow.test.cjs uses the real asset
 // and real obstacles, while browser acceptance evaluates visual quality.
 walkTo(q,0,13);fight(q,q.enemies[0]);
 walkTo(q,-4,7);walkTo(q,-4,3.3);walkTo(q,-8.7,3.3);tap(q,'KeyF');q.tick(3);assert.equal(q.flags.checkpoint,true);
 walkTo(q,-4,3.3);walkTo(q,0,3);fight(q,q.enemies[1]);
 walkTo(q,0,-5.2);tap(q,'KeyF');q.tick(3);assert.equal(q.flags.gateOpen,true);
 walkTo(q,0,-12);fight(q,q.boss);
 assert.equal(q.flags.bossDefeated,true);assert.equal(q.flags.won,false);walkTo(q,0,-28.8);tap(q,'KeyF');q.tick(2);assert.equal(q.flags.won,true);assert.equal(q.boss.hp,0);assert.ok(q.player.hp>0);assert.equal(q.enemies.filter(e=>e.hp<=0).length,3);
});


test('a real memory interaction rewards only once and persists without activating a false checkpoint',async()=>{
 const q=await boot();q.startPublic();walkTo(q,2.8,16.7);q.player.flasks=2;tap(q,'KeyF');q.tick(2);assert.equal(q.memory().id,'arrival');assert.equal(q.player.flasks,3);tap(q,'KeyF');q.tick(2);assert.equal(q.player.flasks,3);const data=JSON.parse(q.storage.get('ashen-vow-checkpoint'));assert.equal(data.active,false);assert.deepEqual(data.journey.memories,['arrival']);q.retry();assert.equal(q.player.z,18);assert.equal(q.journey.snapshot().memories.length,1);
});
test('shrine blessing cannot be equipped remotely and is preserved through a retry',async()=>{
 const q=await boot();q.startPublic();q.selectRelic('edge');assert.equal(q.journey.modifiers().damage,1);for(const e of q.enemies)e.aggro=false;q.player.x=-9;q.player.z=3;q.interact();assert.equal(q.flags.checkpoint,true);assert.ok(q.shrine());q.selectRelic('wind');assert.equal(q.player.maxStamina,125);assert.equal(q.player.stamina,125);q.selectRelic('ember');assert.equal(q.player.max,145);assert.equal(q.player.maxStamina,100);q.retry();assert.equal(q.player.max,145);assert.equal(q.player.hp,145);assert.equal(q.journey.snapshot().relic,'ember');
});
test('a completed roll opens the cut counter and a timed guard gives one counter only',async()=>{
 const q=await boot();q.startPublic();tap(q,'Space');q.tick();assert.equal(q.player.state,'roll');finishAction(q);assert.ok(q.flags.combatTime<q.player.dodgeUntil);tap(q,'KeyJ');until(q,()=>q.player.state==='attack',.2);assert.equal(q.player.attack.kind,'dodgeAttack');assert.equal(q.player.attack.type,'cut');
 q.retry();const e=q.enemies[0];q.player.x=e.x;q.player.z=e.z+1.6;q.player.yaw=Math.PI;q.press('KeyL');q.updatePlayer(.01);q.damage(q.player,e,{damage:19,type:'sweep',poise:18});q.release('KeyL');tap(q,'KeyJ');until(q,()=>q.player.state==='attack',.2);assert.equal(q.player.attack.counter,true);assert.equal(q.journey.snapshot().stats.parries,1);
 until(q,()=>q.player.state==='idle',C.getMove('light').total+.7);tap(q,'KeyJ');until(q,()=>q.player.state==='attack',.2);assert.equal(!!q.player.attack.counter,false);
});
test('journal and return-to-title callbacks preserve progress and clear held input',async()=>{
 const q=await boot();q.startPublic();tap(q,'Tab');assert.ok(q.journal());q.press('KeyW');q.callbacks().onTitle();const before=q.player.z;q.tick(30);assert.equal(q.player.z,before);assert.ok(q.storage.get('ashen-vow-checkpoint'));q.startPublic(true);q.tick(30);assert.equal(q.player.z,18);
});


test('a half-health warden finishes its committed attack before entering second phase',async()=>{
 const q=await boot();q.startPublic();q.boss.aggro=true;q.boss.hp=179;const move=C.getBossMove(0,1);q.change(q.boss,'attack',move);q.boss.t=move.windup*.4;q.tick();assert.equal(q.boss.state,'attack');assert.equal(q.boss.phase,1);until(q,()=>q.boss.phase===2,move.total+.3,'the committed attack never handed off to phase two');
});
test('pausing freezes the earned roll-counter window until the player resumes',async()=>{
 const q=await boot();q.startPublic();tap(q,'Space');q.tick();finishAction(q);const remaining=q.player.dodgeUntil-q.flags.combatTime;tap(q,'Escape');q.runFor(C.getMove('roll').total+1);assert.ok(Math.abs(q.player.dodgeUntil-q.flags.combatTime-remaining)<1e-9);tap(q,'Escape');tap(q,'KeyJ');until(q,()=>q.player.state==='attack',.2);assert.equal(q.player.attack.kind,'dodgeAttack');
});


test('mouse look rotates the camera without a held button and stops while paused',async()=>{
 const q=await boot();q.startPublic();q.tick(40);const before=q.camera.position.clone();q.mouseMove(200,200);q.mouseMove(320,240);q.tick(40);assert.ok(q.camera.position.distanceTo(before)>.4);tap(q,'Escape');const paused=q.camera.position.clone();q.mouseMove(500,300);q.tick(40);assert.ok(q.camera.position.distanceTo(paused)<.08);
});


test('real direction integration freezes arrival combat and consumes the skip press without attacking',async()=>{
 const q=await boot({cinematics:true});q.startPublic();const start={x:q.player.x,z:q.player.z};
 q.press('KeyW');q.tick(90);assert.equal(q.flags.directing,true);assert.equal(q.journey.snapshot().time,0);
 assert.equal(q.player.x,start.x);assert.equal(q.player.z,start.z);assert.equal(q.enemies[0].aggro,false);
 tap(q,'Space');q.tick(2);assert.equal(q.flags.directing,false);assert.equal(q.player.state,'idle');
 assert.equal(q.player.z,start.z);assert.ok(q.journey.snapshot().time>0);
 tap(q,'KeyJ');q.tick(1);assert.equal(q.player.state,'attack');
});

test('natural arrival completion hands control back while pause freezes its camera clock',async()=>{
 const q=await boot({cinematics:true});q.startPublic();q.tick(90);q.callbacks().onPause();q.tick(400);
 assert.equal(q.flags.directing,true);assert.equal(q.journey.snapshot().time,0);
 q.callbacks().onResume();q.tick(240);assert.equal(q.flags.directing,false);assert.equal(q.flags.paused,false);
 q.press('KeyW');q.tick(20);q.release('KeyW');assert.ok(q.player.z<18);
});

test('the warden intro releases a captured mouse without pausing or spending combat time',async()=>{
 const q=await boot({cinematics:true});q.startPublic();tap(q,'Enter');q.tick(1);q.pointerLock(true);
 q.player.x=0;q.player.z=-12.5;q.tick(1);assert.equal(q.flags.directing,true);assert.equal(q.boss.state,'awaken');
 const stamp=q.journey.snapshot().time,hp=q.player.hp;q.pointerLock(false);q.tick(90);
 assert.equal(q.flags.paused,false);assert.equal(q.flags.directing,true);assert.equal(q.journey.snapshot().time,stamp);assert.equal(q.player.hp,hp);
 tap(q,'Enter');q.tick(1);assert.equal(q.flags.directing,false);assert.equal(q.flags.paused,false);
});

test('continuing, retrying and reduced-motion play bypass arrival direction',async()=>{
 const q=await boot({cinematics:true});q.startPublic(true);assert.equal(q.flags.directing,false);
 q.startPublic(false);assert.equal(q.flags.directing,true);q.retry();assert.equal(q.flags.directing,false);
 const reduced=await boot({cinematics:true,settings:{shake:false}});reduced.startPublic();assert.equal(reduced.flags.directing,false);
});


test('a wall stops the actual player gait and does not drain sprint stamina at rest',async()=>{
 const q=await boot();q.startPublic();q.level.obstacles.push({x:5,z:16,w:1,d:12.3,h:3.85});q.player.x=4;q.player.z=16;
 q.press('KeyD');q.press('ShiftLeft');q.tick(180);q.release('KeyD');q.release('ShiftLeft');
 assert.ok(q.player.x<=4.0401);assert.ok(q.player.speed<.001);assert.ok(q.player.visualVelocity.length()<.001);assert.ok(q.player.stamina>99);
});

test('a physical wall contact interrupts a sword strike before it can damage an enemy',async()=>{
 const q=await boot();q.startPublic();const target=q.enemies[0];q.player.x=target.x;q.player.z=target.z+1.4;tap(q,'KeyJ');q.tick(2);
 q.player.actor.blockedWeapon={point:{x:q.player.x,y:1.2,z:q.player.z-.4},normal:{x:0,y:0,z:1}};q.tick(1);
 assert.equal(q.player.state,'hurt');assert.equal(target.hp,target.max);q.tick(12);assert.equal(target.hp,target.max);
});


test('20, 30, 60 and 120 Hz renders advance the same second of movement and action timing',async()=>{
 const samples=[];
 for(const hz of [20,30,60,120]){
  const q=await boot();q.startPublic();const frame=q.flags.frameCount;q.press('KeyW');q.runFor(1,hz);q.release('KeyW');
  assert.ok(Math.abs(q.journey.snapshot().time-1)<1e-9,'wall time must not slow gameplay at '+hz+' Hz');
  assert.equal(q.flags.frameCount-frame,hz,'render calls should retain the actual display cadence');
  samples.push({x:q.player.x,z:q.player.z,stamina:q.player.stamina,state:q.player.state,combat:q.flags.combatTime});
  const heavy=C.getMove('heavy'),duringRecovery=(heavy.recoveryStart+heavy.total)/2;tap(q,'KeyK');q.runFor(duringRecovery,hz);assert.equal(q.player.state,'attack');q.runFor(heavy.total-duringRecovery+.2,hz);assert.equal(q.player.state,'idle');
 }
 for(const sample of samples.slice(1)){assert.ok(Math.abs(sample.x-samples[0].x)<1e-8);assert.ok(Math.abs(sample.z-samples[0].z)<1e-8);assert.ok(Math.abs(sample.combat-samples[0].combat)<1e-9);assert.equal(sample.stamina,samples[0].stamina);}
});

test('hit stop consumes the same physical duration at every supported render cadence',async()=>{
 for(const hz of [20,30,60,120]){
  const q=await boot();q.startPublic();q.damage(q.player,q.enemies[0],{damage:1,poise:0,kind:'sentinel'});const freeze=q.flags.hitstop;assert.ok(freeze>0);
  q.runFor(1,hz);assert.ok(Math.abs(q.flags.combatTime-(1-freeze))<1e-8,'contact freeze changed with '+hz+' Hz rendering');
  assert.ok(Math.abs(q.journey.snapshot().time-(1-freeze))<1e-8);assert.equal(q.flags.hitstop,0);
 }
});

test('pause, modal and background handoffs discard elapsed time and held input without catch-up',async()=>{
 const q=await boot();q.startPublic();q.press('KeyW');q.runFor(1,30);const before=q.player.z,stamp=q.journey.snapshot().time;
 q.callbacks().onPause();q.advance(30000);assert.equal(q.journey.snapshot().time,stamp);assert.equal(q.player.z,before);
 q.callbacks().onResume();q.advance(20000);assert.equal(q.journey.snapshot().time,stamp);q.runFor(1,120);assert.ok(Math.abs(q.journey.snapshot().time-stamp-1)<1e-8);assert.ok(Math.abs(q.player.z-before)<.01,'the paused movement key remained held');
 q.modal(true);const modalStamp=q.journey.snapshot().time;q.advance(10000);assert.equal(q.journey.snapshot().time,modalStamp);q.modal(false);q.advance(20000);assert.equal(q.journey.snapshot().time,modalStamp);q.runFor(1,20);assert.ok(Math.abs(q.journey.snapshot().time-modalStamp-1)<1e-8);
 tap(q,'KeyJ');q.visibility(true,false);q.advance(10000);assert.equal(q.flags.paused,true,'the frame guard must also handle a missed visibility event');q.visibility(false,false);q.callbacks().onResume();q.advance(15000);q.runFor(.5,60);assert.equal(q.player.state,'idle','background handoff replayed a queued attack');
});

test('a long active frame has a bounded catch-up budget instead of simulating a multi-second teleport',async()=>{
 const q=await boot();q.startPublic();q.press('KeyW');q.advance(5000);q.release('KeyW');assert.ok(Math.abs(q.journey.snapshot().time-.25)<1e-9);assert.ok(q.player.z>17.5);q.runFor(1,60);assert.ok(Math.abs(q.journey.snapshot().time-1.25)<1e-9);
});

test('an unlocked strike never snaps toward a target behind the player and forward assistance stays bounded',async()=>{
 const q=await boot();q.startPublic();const enemy=q.enemies[0];q.player.x=0;q.player.z=0;q.player.yaw=0;enemy.x=0;enemy.z=-1.6;q.change(enemy,'stagger');
 tap(q,'KeyJ');q.tick(1);assert.equal(q.player.state,'attack');assert.ok(Math.abs(q.player.yaw)<1e-9);q.tick(frames(C.getMove('light').total+.1));assert.equal(enemy.hp,enemy.max,'an automatic turn hit an unseen target behind the player');
 const front=await boot();front.startPublic();front.player.x=0;front.player.z=0;front.player.yaw=0;front.enemies[0].x=1.5;front.enemies[0].z=1.5;front.change(front.enemies[0],'stagger');tap(front,'KeyJ');front.tick(1);assert.ok(front.player.yaw>0&&front.player.yaw<=Math.PI/8+1e-9);
});

test('combat telegraphs choose the imminent real attacker independently of the lock target',async()=>{
 const q=await boot();q.startPublic();const locked=q.enemies[0],attacker=q.enemies[1];q.player.x=0;q.player.z=2;locked.x=0;locked.z=0;attacker.x=2;attacker.z=2;tap(q,'KeyQ');q.tick(1);assert.equal(q.flags.locked,locked);
 const backhand=C.getSentinelMove(1,1);q.change(attacker,'attack',backhand);attacker.t=backhand.windup*.65;attacker.aggro=true;q.tick(1);assert.match(q.ui().telegraph,/反手斩/);assert.equal(q.ui().enemyName,locked.name,'threat selection should not silently retarget the HUD');
 attacker.x=20;attacker.z=2;q.tick(1);assert.equal(q.ui().telegraph,'','an unreachable attacker should not monopolize the warning');
});

test('holding Escape cannot bounce pause or close a modal and immediately pause the resumed game',async()=>{
 const q=await boot();q.startPublic();q.press('Escape');assert.equal(q.flags.paused,true);for(let i=0;i<8;i++)q.press('Escape',true);assert.equal(q.flags.paused,true);q.release('Escape');q.press('Escape');assert.equal(q.flags.paused,false);
 q.modal(true);q.press('Escape',true);assert.equal(q.flags.paused,true);q.release('Escape');q.press('Escape');assert.equal(q.flags.paused,false);q.press('Escape',true);assert.equal(q.flags.paused,false);
});


test('final posed contact corrections drive the next gait and retain coherent world equipment transforms',async()=>{
 const q=await boot({poseContacts:true});q.startPublic();q.level.obstacles.push({x:5,z:16,w:1,d:12.3,h:3.85});q.player.x=3.7;q.player.z=16;q.player.yaw=0;q.press('KeyD');q.tick(180);q.release('KeyD');
 assert.ok(q.player.x<3.78,'the posed silhouette was not kept outside the wall');assert.ok(q.player.speed<.001);assert.ok(q.player.visualVelocity.length()<.001);assert.ok(q.player.actor.lastAnimation.speed<.001,'the gait ignored zero final net displacement');assert.ok(Math.abs(q.player.actor.root.position.x-q.player.x)<1e-9);
 q.player.x=4;q.change(q.player,'dead');q.player.hp=0;q.tick(1);assert.ok(q.player.x<3.78,'a dead character skipped final environment contact');
});

test('overlapping chapel interactions choose the physically nearer object while keeping critical and combat rules',async()=>{
 const q=await boot();q.startPublic();q.player.x=-8.5;q.player.z=4.3;q.interact();assert.equal(q.memory()?.id,'chapel','the farther chapel shrine hid the nearby memory');assert.equal(q.shrine(),null);assert.equal(q.flags.checkpoint,false);
 q.player.x=-8.65;q.player.z=3.8;q.interact();assert.ok(q.shrine(),'the physically nearer shrine should remain selectable');assert.equal(q.flags.checkpoint,true);
 const e=q.enemies[0];e.x=q.player.x;e.z=q.player.z+.99;q.change(e,'stagger');q.interact();assert.equal(q.player.attack?.kind,'critical','an exposed enemy keeps explicit combat priority');
 const blocked=await boot();blocked.startPublic();blocked.player.x=-8.5;blocked.player.z=4.3;blocked.enemies[0].x=-8.5;blocked.enemies[0].z=6.5;blocked.enemies[0].aggro=true;blocked.interact();assert.equal(blocked.memory(),null);assert.equal(blocked.shrine(),null);assert.equal(blocked.flags.checkpoint,false,'interaction sorting must not permit resting in combat');
});

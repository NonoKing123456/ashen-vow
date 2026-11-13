const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

// Controller integration uses real THREE transforms, level bounds and blade
// collision, with a small deterministic articulated sword fixture in place of
// network-loaded GLB art. It verifies rules/state, not the exported animation.
async function boot(options={}){
 const T={...require('./vendor/three.min.js')},elements=new Map(),listeners={},storage=new Map();
 const element=id=>{if(elements.has(id))return elements.get(id);const e={id,style:{},dataset:{},hidden:true,events:{},focus(){},addEventListener(t,f){this.events[t]=f},setPointerCapture(){},getBoundingClientRect(){return {left:0,top:0,width:100,height:100}}};elements.set(id,e);return e;};
 let callbacks,updates,now=1000,lastMemory=null,lastShrine=null,lastJournal=null;
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(51,16/9,.1,200),renderer={domElement:element('game'),capabilities:{getMaxAnisotropy:()=>1}};
 T.Raycaster=class{set(){}intersectObjects(){return []}};
 const noop=()=>{};
 const ui={getSettings:()=>({audio:false,quality:'medium',...options.settings}),isModalOpen:()=>false,update:v=>updates=v};
 for(const name of ['setLoading','setCheckpoint','setStarted','chapter','updateStep','setPaused','notify','damage','showDamage','setContext','setLock','result','hideHelp','setCinematic','location'])ui[name]=noop;
 ui.showMemory=e=>lastMemory=e;ui.showShrine=e=>lastShrine=e;ui.showJournal=e=>lastJournal=e;
 const levelBounds=[{x:0,z:15.5,w:9,d:13},{x:0,z:1.5,w:12,d:17},{x:-8.5,z:3.25,w:7,d:6.5},{x:0,z:-8,w:6.2,d:4},{x:0,z:-21,w:23,d:26}];
 const level={root:new T.Group(),bounds:levelBounds,obstacles:[],spawn:{x:0,z:18},bossSpawn:{x:0,z:-25},patrols:[{x:-1.8,z:8},{x:2.2,z:-2}],checkpoints:[{x:-9,z:3,kind:'checkpoint',radius:1.8}],discoveries:[{id:'arrival',name:'破盾',x:2.8,z:16.7,radius:1.7,kind:'memory'},{id:'chapel',name:'祷书',x:-8.3,z:5.2,radius:1.7,kind:'memory'},{id:'warden',name:'空冠',x:7.4,z:-19.8,radius:1.7,kind:'memory'}],bell:{x:0,z:-29.5,radius:2,kind:'bell'},setDiscovery:noop,setBossDefeated:noop,ringBell:()=>true,setGate:noop,update:noop};scene.add(level.root);
 const ctx={console,Math,Float32Array,Uint8Array,Map,Set,THREE:T,innerWidth:1280,innerHeight:720,document:{getElementById:element,body:element('body'),hidden:false,addEventListener(t,f){listeners['document:'+t]=f}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},addEventListener(t,f){listeners[t]=f},requestAnimationFrame:noop,
  AshenRender:{create:()=>({scene,camera,renderer,setQuality:noop,render:noop,resize:noop})},AshenAudio:{create:()=>({setEnabled:noop,unlock:noop,play:noop,update:noop})},AshenUI:{create:c=>{callbacks=c;return ui}},AshenLevel:{create:()=>level},
  AshenCharacters:{load:async()=>{},createKnight(){const root=new T.Group(),blade=new T.Group();root.add(blade);scene.add(root);return {root,weapon:{group:blade,base:new T.Vector3(0,0,.20),tip:new T.Vector3(0,0,2.05)},animate(o){blade.position.set(.12,1.05,0);let yaw=0;if(o.attack&&o.state==='attack'){const pose=ctx.AshenCombat.samplePose(o.attack,o.time);yaw=(pose.localStrike-.5)*1.0;this.weapon.tip.z=o.attack.reach;}blade.rotation.y=yaw;root.updateMatrixWorld(true);},setHit:noop};}}
 };
 ctx.location={hostname:'localhost'};ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
 for(const file of ['feel.js','journey.js','tactics.js',...(options.cinematics?['director.js','impact.js']:[])])vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),ctx);
 const source=fs.readFileSync(path.join(__dirname,'game.js'),'utf8').replace(/\}\)\(\);\s*$/,'globalThis.qa={player,enemies,boss,level,camera,start,retry,frame,updatePlayer,damage,change,resolveHits,journey,updateContext,interact,selectRelic,get flags(){return {dead,won,bossDefeated,paused,checkpoint,gateOpen,locked,time,directing:!!director?.active};}};})();');
 await vm.runInContext(source,ctx);const q=ctx.qa;
 q.press=(code)=>listeners.keydown({code,repeat:false,preventDefault:noop});q.release=(code)=>listeners.keyup({code});q.tick=(n=1)=>{for(let i=0;i<n;i++){now+=1000/60;q.frame(now)}};
 q.startPublic=(resume=false)=>callbacks.onStart({continue:resume});q.ui=()=>updates;q.callbacks=()=>callbacks;q.memory=()=>lastMemory;q.shrine=()=>lastShrine;q.journal=()=>lastJournal;q.storage=storage;q.mouseMove=(x,y)=>element('game').events.pointermove({clientX:x,clientY:y,pointerType:'mouse'});q.pointerLock=active=>{ctx.document.pointerLockElement=active?element('game'):null;listeners['document:pointerlockchange']()};q.blur=()=>listeners.blur();q.tick();return q;
}

test('controller runs real swept blade damage and does not damage targets during anticipation',async()=>{
 const q=await boot();q.startPublic();const enemy=q.enemies[0];
 // Arrange a melee encounter; all damage still passes through frame animation
 // and actual sword sweep, with no direct hit/damage calls.
 q.player.x=enemy.x;q.player.z=enemy.z+2;q.player.yaw=Math.PI;q.press('KeyQ');q.release('KeyQ');q.press('KeyJ');q.release('KeyJ');
 q.tick(9);assert.equal(enemy.hp,enemy.max);q.tick(18);assert.ok(enemy.hp<enemy.max);
});

test('controller consumes light chain presses as the next cut, not a repeated opener',async()=>{
 const q=await boot();q.startPublic();q.press('KeyJ');q.release('KeyJ');q.tick(15);q.press('KeyJ');q.release('KeyJ');q.tick(9);
 assert.equal(q.player.combo,1);assert.equal(q.player.attack.index,1);
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
 q.change(target,'stagger');target.posture=100;q.tick(2);tap(q,'KeyF');q.tick(8);
 assert.equal(q.player.attack.kind,'critical');assert.equal(target.hp,360);
 q.tick(28);assert.equal(target.hp,260);assert.equal(target.posture,0);
 assert.equal(q.enemies[0].hp,68);assert.equal(q.enemies[1].hp,68);
});

test('an exposed enemy outside execution distance cannot receive contextual damage',async()=>{
 const q=await boot();q.startPublic();const target=q.boss;q.player.x=target.x;q.player.z=target.z+3;
 target.aggro=true;q.change(target,'stagger');q.tick(2);tap(q,'KeyF');q.tick(45);
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

test('scripted public controls clear both sentinels, save chapel, open gate and defeat the boss',async()=>{
 const q=await boot();q.startPublic();
 // This playthrough changes no HP, positions or enemy states. Every movement,
 // parry, flask and attack enters through the same keyboard callbacks as play.
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
test('rolling then attacking opens a thrust and a timed guard gives one counter only',async()=>{
 const q=await boot();q.startPublic();tap(q,'Space');q.tick(40);tap(q,'KeyJ');q.tick(2);assert.equal(q.player.attack.kind,'dodgeAttack');q.retry();const e=q.enemies[0];q.player.x=e.x;q.player.z=e.z+1.6;q.player.yaw=Math.PI;q.press('KeyL');q.updatePlayer(.01);q.damage(q.player,e,{damage:19,type:'sweep',poise:18});q.release('KeyL');tap(q,'KeyJ');q.tick(2);assert.equal(q.player.attack.counter,true);assert.equal(q.journey.snapshot().stats.parries,1);q.tick(60);tap(q,'KeyJ');q.tick(2);assert.equal(!!q.player.attack.counter,false);
});
test('journal and return-to-title callbacks preserve progress and clear held input',async()=>{
 const q=await boot();q.startPublic();tap(q,'Tab');assert.ok(q.journal());q.press('KeyW');q.callbacks().onTitle();const before=q.player.z;q.tick(30);assert.equal(q.player.z,before);assert.ok(q.storage.get('ashen-vow-checkpoint'));q.startPublic(true);q.tick(30);assert.equal(q.player.z,18);
});


test('a half-health warden finishes its committed attack before entering second phase',async()=>{
 const q=await boot();q.startPublic();q.boss.aggro=true;q.boss.hp=179;q.change(q.boss,'attack',require('./feel.js').getBossMove(0,1));q.boss.t=.25;q.tick();assert.equal(q.boss.state,'attack');assert.equal(q.boss.phase,1);q.tick(160);assert.equal(q.boss.phase,2);
});
test('pausing freezes the earned roll-counter window until the player resumes',async()=>{
 const q=await boot();q.startPublic();tap(q,'Space');q.tick(40);tap(q,'Escape');q.tick(120);tap(q,'Escape');tap(q,'KeyJ');q.tick(2);assert.equal(q.player.attack.kind,'dodgeAttack');
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

const test=require('node:test'),assert=require('node:assert/strict');
require('./director.js');
const D=global.AshenDirector;
test('arrival direction is bounded, continuous and arrives at the exact player camera',()=>{
 const d=D.create(),end={position:{x:0,y:3.06,z:23.1},target:{x:0,y:1.25,z:18}};
 assert.ok(d.begin('arrival',{x:0,z:18},end));let previous=d.sample();
 for(let i=0;i<330;i++){
  const p=d.advance(1/60);for(const v of [p.position,p.target])for(const n of Object.values(v))assert.ok(Number.isFinite(n));
  assert.ok(Math.hypot(p.position.x-previous.position.x,p.position.y-previous.position.y,p.position.z-previous.position.z)<.15);
  assert.ok(Math.hypot(p.position.x,p.position.z-18)<6,'the arrival camera should remain a close character dolly');previous=p;
 }
 assert.equal(d.active,false);assert.deepEqual(d.sample().position,end.position);assert.deepEqual(d.sample().target,end.target);
});
test('skipping a boss scene returns its captured view and a new journey resets direction',()=>{
 const d=D.create(),end={position:{x:2,y:3,z:-8},target:{x:0,y:1.25,z:-13}};
 d.begin('warden',{x:0,z:-25},end);d.advance(.1);
 assert.equal(d.active,true);const last=d.finish();assert.equal(d.active,false);assert.deepEqual(last.position,end.position);
 d.begin('arrival',{x:0,z:18});assert.equal(d.sample().progress,0);d.clear();assert.equal(d.sample(),null);
 assert.equal(d.begin('invalid'),false);assert.equal(d.active,false);
});
test('region titles follow actual traversable spaces rather than combat progress',()=>{
 assert.equal(D.region(0,18).id,'arrival');assert.equal(D.region(0,7).id,'court');
 assert.equal(D.region(-9,3).id,'chapel');assert.equal(D.region(0,-8).id,'gate');assert.equal(D.region(0,-16).id,'hall');
});

// Authoring against the actual collision layout catches a smooth source path
// that would snap when the production camera is compressed by masonry.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const T=require('./vendor/three.min.js'),C=require('./feel.js');
function realLevel(){const context={THREE:T,console};context.globalThis=context;vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'level.js'),'utf8'),context);return context.AshenLevel.create({THREE:T,scene:new T.Scene(),M:{}});}
function resolved(view,obstacles){const target=new T.Vector3(view.target.x,view.target.y,view.target.z),position=new T.Vector3(view.position.x,view.position.y,view.position.z),delta=position.clone().sub(target),distance=delta.length(),limit=C.cameraDistance(target,position,obstacles);return {target,position,actual:limit<distance?target.clone().addScaledVector(delta.normalize(),limit):position,distance,limit};}
test('arrival dolly stays clear of real masonry and looks into the built cloister',()=>{
 const level=realLevel();
 try{
  const focus=level.spawn,d=D.create(),end={position:{x:focus.x,y:3.06,z:focus.z+5.1},target:{x:focus.x,y:1.25,z:focus.z}};
  d.begin('arrival',focus,end);let previous=resolved(d.sample(),level.obstacles).actual;
  for(let i=0;i<330;i++){
   const view=d.advance(1/60),p=resolved(view,level.obstacles);
   assert.ok(p.limit>=p.distance-.081,'the reveal grazes a real obstacle and would compress the camera');
   assert.ok(p.actual.distanceTo(previous)<.15,'collision caused an abrupt arrival camera step');
   assert.ok(p.target.z<p.position.z-1,'the reveal must look into the level rather than the platform end');
   assert.ok(p.distance>2.5&&p.distance<6,'the hero should retain a stable readable scale');
   previous=p.actual;
  }
  assert.deepEqual(d.sample().position,end.position);assert.deepEqual(d.sample().target,end.target);
 }finally{level.dispose();}
});
test('warden pullback remains continuous through the real closing gate and returns to a safe view',()=>{
 const level=realLevel();
 try{
  const hall=level.bounds.find(b=>Math.abs(level.bossSpawn.x-b.x)<b.w/2&&Math.abs(level.bossSpawn.z-b.z)<b.d/2),entry=hall.z+hall.d/2-3;
  const end={position:{x:level.bossSpawn.x,y:3.06,z:entry+5.1},target:{x:level.bossSpawn.x,y:1.25,z:entry}},d=D.create();
  level.setGate(false);d.begin('warden',level.bossSpawn,end);let previous=resolved(d.sample(),level.obstacles).actual;
  for(let i=0;i<250;i++){
   const p=resolved(d.advance(1/60),level.obstacles);
   assert.ok(p.actual.distanceTo(previous)<.23,'the warden pullback lurches after gate collision');
   assert.ok(p.actual.y>1.2&&p.limit>2,'the boss reveal lost its viewing distance');previous=p.actual;
  }
  const final=resolved(d.sample(),level.obstacles);
  assert.ok(final.actual.distanceTo(previous)<1e-5);assert.ok(final.limit<=final.distance,'the final view respects the closed gate');
  assert.deepEqual(d.sample().position,end.position);
 }finally{level.dispose();}
});

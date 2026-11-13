const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const T=require('./vendor/three.min.js');
const context={THREE:T,console};context.globalThis=context;vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'level.js'),'utf8'),context);
function create(){const scene=new T.Scene(),level=context.AshenLevel.create({THREE:T,scene,M:{}});return {scene,level};}
function walkable(level,x,z){
 const r=.29;
 if(!level.bounds.some(b=>x>=b.x-b.w/2+r&&x<=b.x+b.w/2-r&&z>=b.z-b.d/2+r&&z<=b.z+b.d/2-r))return false;
 return !level.obstacles.some(o=>o.w!=null?x>o.x-o.w/2-r&&x<o.x+o.w/2+r&&z>o.z-o.d/2-r&&z<o.z+o.d/2+r:Math.hypot(x-o.x,z-o.z)<r+o.r);
}
test('all authored discoveries and bell can be approached through the real level bounds and collisions',()=>{
 const {level}=create();level.setGate(true);
 const queue=[[0,18]],seen=new Set(['0,36']);
 for(let i=0;i<queue.length;i++){
  const [x,z]=queue[i];
  for(const [dx,dz]of [[.5,0],[-.5,0],[0,.5],[0,-.5]]){
   const nx=x+dx,nz=z+dz,key=nx*2+','+nz*2;
   if(!seen.has(key)&&walkable(level,nx,nz)){seen.add(key);queue.push([nx,nz]);}
  }
 }
 assert.equal(level.discoveries.length,3);
 for(const item of [...level.discoveries,level.bell]){
  assert.ok(queue.some(([x,z])=>Math.hypot(x-item.x,z-item.z)<item.radius-.3),item.id+' is unreachable');
 }
 assert.ok(!walkable(level,0,-32.6),'the raised rear shrine still blocks entry');
 assert.ok(level.stats.staticDraws<34,'new relics retain static batching');
 level.dispose();
});
test('bell requires the defeated warden, rings once and fully resets for a new run',()=>{
 const {level}=create(),bell=level.root.getObjectByName('last-bell');
 assert.ok(bell&&level.root.getObjectByName('bell-pull-cord'));
 assert.equal(level.ringBell(),false);level.setBossDefeated(true);
 assert.equal(level.ringBell(),true);assert.equal(level.ringBell(),false);
 for(let i=0;i<120;i++)level.update(1/60,i/60);
 assert.ok(level.ending>.4&&level.ending<1);assert.ok(Math.abs(bell.rotation.z)>.001);
 level.setBossDefeated(false);level.update(1/60,3);
 assert.equal(level.ending,0);assert.equal(bell.rotation.z,0);assert.equal(level.ringBell(),false);
 level.setReducedMotion(true);level.setBossDefeated(true);level.ringBell();level.update(.5,4);
 assert.equal(bell.rotation.z,0,'reduced-motion ending suppresses the bell swing');
 level.dispose();
});
test('relic discovery dims its own marker and bell shell faces outward',()=>{
 const {level}=create();level.setDiscovery('arrival',true);
 for(let i=0;i<90;i++)level.update(1/60,i/60);
 const arrival=level.root.getObjectByName('memory-arrival'),chapel=level.root.getObjectByName('memory-chapel');
 assert.ok(arrival.scale.x<.15&&chapel.scale.x>.99);
 level.setDiscovery('arrival',false);for(let i=0;i<90;i++)level.update(1/60,i/60);
 assert.ok(arrival.scale.x>.99);
 const bell=level.root.getObjectByName('last-bell'),g=bell.children[0].geometry;
 let exterior=0;
 for(let i=0;i<g.attributes.position.count;i++){
  const p=new T.Vector3().fromBufferAttribute(g.attributes.position,i),n=new T.Vector3().fromBufferAttribute(g.attributes.normal,i);
  if(p.x*p.x+p.z*p.z>1.05){assert.ok(p.x*n.x+p.z*n.z>0,'outer bronze surface should face the viewer');exterior++;}
 }
 assert.ok(exterior>40);level.dispose();
});

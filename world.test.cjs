const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const T=require('./vendor/three.min.js');
const context={THREE:T,console};context.globalThis=context;vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'level.js'),'utf8'),context);
function create(){const scene=new T.Scene(),level=context.AshenLevel.create({THREE:T,scene,M:{}});return {scene,level};}
function walkable(level,x,z){
 const r=.46;
 if(!level.bounds.some(b=>x>=b.x-b.w/2+r&&x<=b.x+b.w/2-r&&z>=b.z-b.d/2+r&&z<=b.z+b.d/2-r))return false;
 return !level.obstacles.some(o=>o.w!=null?x>o.x-o.w/2-r&&x<o.x+o.w/2+r&&z>o.z-o.d/2-r&&z<o.z+o.d/2+r:Math.hypot(x-o.x,z-o.z)<r+o.r);
}
test('all authored discoveries and bell can be approached through the real level bounds and collisions',()=>{
 const {level}=create();level.setGate(true,true);
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
test('the passage opens with the actual door leaves and snapshot resets keep both in sync',()=>{
 const {level}=create(),gate=()=>level.obstacles.filter(o=>o.kind==='gate'),closed=gate().map(o=>({...o}));
 assert.equal(closed.length,2);assert.equal(walkable(level,0,-8),false);
 level.setGate(true);assert.equal(walkable(level,0,-8),false,'commanding open must not remove the still-closed door collision');
 level.update(1/60,1/60);assert.equal(walkable(level,0,-8),false,'the first opening frame still has insufficient clearance');
 for(let i=0;i<180;i++)level.update(1/60,i/60);
 assert.equal(walkable(level,0,-8),true);assert.ok(gate().every((o,i)=>Math.abs(o.z-closed[i].z)>1),'door collision did not follow rotation');
 level.setGate(false,true);assert.equal(walkable(level,0,-8),false,'a new-run reset must restore both the visible door and collision');
 level.setGate(true,true);assert.equal(walkable(level,0,-8),true,'a loaded open-gate snapshot must be passable immediately');level.dispose();
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

test('wind leaves embroidered banner mountings fixed and reduced motion holds their folds still',()=>{
 const {level}=create(),banners=[];
 level.root.traverse(o=>{if(o.name.startsWith('funeral-banner-'))banners.push(o);});
 assert.equal(banners.length,4);
 const before=banners.map(o=>o.geometry.attributes.position.array.slice());
 level.update(1/60,1.2);
 let movingHem=false;
 for(let b=0;b<banners.length;b++){
  const p=banners[b].geometry.attributes.position,maxY=Math.max(...Array.from({length:p.count},(_,i)=>before[b][i*3+1]));
  for(let i=0;i<p.count;i++){
   const at=i*3;
   if(Math.abs(before[b][at+1]-maxY)<.001){
    assert.equal(p.getX(i),before[b][at]);assert.equal(p.getY(i),before[b][at+1]);assert.equal(p.getZ(i),before[b][at+2]);
   }else if(Math.abs(p.getZ(i)-before[b][at+2])>.001)movingHem=true;
  }
 }
 assert.ok(movingHem,'free fabric should respond to wind');
 level.setReducedMotion(true);level.update(1/60,2);
 const held=banners.map(o=>o.geometry.attributes.position.array.slice());level.update(1/60,9);
 banners.forEach((o,i)=>assert.deepEqual(o.geometry.attributes.position.array,held[i]));
 assert.ok(level.stats.staticTriangles<80000,'environment detail retains a bounded static mesh budget');
 level.dispose();
});

test('world rain respects chapel shelter, quality budget and reduced-motion impact settings',()=>{
 const weatherContext={THREE:T};weatherContext.window=weatherContext;vm.createContext(weatherContext);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'weather.js'),'utf8'),weatherContext);
 const scene=new T.Scene(),weather=weatherContext.AshenWeather.create({THREE:T,scene,bounds:[{x:0,z:0,w:32,d:48}]});
 weather.update(1/60,2,{x:-7,z:3});
 const rain=scene.getObjectByName('world-rain'),rings=scene.getObjectByName('rain-impact-rings'),p=rain.geometry.attributes.position;
 let sheltered=0,exposed=0;
 for(let i=0;i<p.count;i+=2){
  assert.ok(Number.isFinite(p.getX(i))&&Number.isFinite(p.getY(i))&&Number.isFinite(p.getZ(i)));
  if(p.getX(i)>-12.2&&p.getX(i)<-6&&p.getZ(i)>-.2&&p.getZ(i)<6.5){assert.equal(p.getY(i),-50);sheltered++;}
  else if(p.getY(i)>-1)exposed++;
 }
 assert.ok(sheltered>0&&exposed>0,'roof shelter should affect only its own footprint');
 weather.setQuality('low');assert.equal(rain.geometry.drawRange.count,600);assert.equal(rings.visible,false);
 weather.setQuality('high');assert.equal(rain.geometry.drawRange.count,1300);assert.equal(rings.visible,true);
 weather.setReducedMotion(true);assert.equal(rings.visible,false);weather.update(1/60,4,{x:0,z:15});assert.ok(rain.material.opacity<.08);
 weather.setReducedMotion(false);assert.equal(rings.visible,true);
 weather.dispose();assert.equal(scene.children.length,0);
});


test('accessible stone props have solid extents and low masonry retains its real height',()=>{
 const {level}=create();try{
  const counts=kind=>level.obstacles.filter(o=>o.kind===kind).length;
  assert.equal(counts('headstone'),7);assert.equal(counts('reliquary'),3);assert.equal(counts('mourner statue'),4);assert.equal(counts('arrival pier'),2);
  const lintel=level.obstacles.find(o=>o.kind==='fallen masonry'),column=level.obstacles.find(o=>o.kind==='fallen column');
  assert.ok(lintel.w>1.5&&lintel.d>.9,'the rotated stone footprint must include its actual corners');assert.ok(lintel.h>.45&&lintel.h<.6);
  assert.ok(column.h<1.05,'a fallen column is not an invisible four-meter wall');assert.ok(walkable(level,level.spawn.x,level.spawn.z));
 }finally{level.dispose();}
});

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const N=require('./navigation.js'),T=require('./vendor/three.min.js');
function realLevel(){const ctx={THREE:T,console};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'level.js'),'utf8'),ctx);return ctx.AshenLevel.create({THREE:T,scene:new T.Scene(),M:{}});}
function blocked(e,obstacles,r){return obstacles.some(o=>o.w!=null?e.x>o.x-o.w/2-r+1e-6&&e.x<o.x+o.w/2+r-1e-6&&e.z>o.z-o.d/2-r+1e-6&&e.z<o.z+o.d/2+r-1e-6:Math.hypot(e.x-o.x,e.z-o.z)<o.r+r-1e-6);}
function within(e,bounds,r){return bounds.some(b=>e.x>=b.x-b.w/2+r-1e-6&&e.x<=b.x+b.w/2-r+1e-6&&e.z>=b.z-b.d/2+r-1e-6&&e.z<=b.z+b.d/2-r+1e-6);}
test('real hall crowd separation cannot push a legal player into the adjacent pier',()=>{
 const level=realLevel();try{level.setGate(true,true);const player={kind:'player',id:'player',hp:120,x:-11,z:-13.3},boss={kind:'boss',id:'boss',hp:360,x:-10.292893218813452,z:-12.59289321881346},ctx={...level,player,entities:[player,boss]};
 assert.equal(blocked(player,level.obstacles,.29),false);assert.equal(blocked(boss,level.obstacles,.55),false);
 for(let i=0;i<60;i++){N.move(player,0,0,ctx);assert.equal(blocked(player,level.obstacles,.29),false);assert.ok(within(player,level.bounds,.29));}
 assert.ok(Math.hypot(player.x-boss.x,player.z-boss.z)>1.1,'separation should use the available wall tangent');
 }finally{level.dispose();}
});
test('wall contact stops forward travel but retains smooth tangent movement and no idle drift',()=>{
 const player={kind:'player',x:0,z:0},ctx={player,bounds:[{x:0,z:0,w:10,d:10}],obstacles:[{x:1,z:0,w:1,d:8}],entities:[player]};
 const moved=N.move(player,1,1,ctx);assert.ok(moved>1);assert.ok(player.x<=.21&&player.z>.99);assert.equal(blocked(player,ctx.obstacles,.29),false);
 const at={x:player.x,z:player.z};assert.equal(N.move(player,0,0,ctx),0);assert.deepEqual({x:player.x,z:player.z},at);
});
test('fast directional rolls sweep both thin rectangular and circular obstacles',()=>{
 for(const obstacle of [{x:0,z:0,w:.1,d:4},{x:0,z:0,r:.45}]){const player={kind:'player',x:-2,z:0},ctx={player,bounds:[{x:0,z:0,w:12,d:12}],obstacles:[obstacle],entities:[]};N.move(player,5,0,ctx);assert.equal(blocked(player,ctx.obstacles,.29),false);assert.ok(player.x<0,'a long step tunneled through the obstruction');}
});
test('adjoining bounds permit their shared opening but retain the outside corner',()=>{
 const player={kind:'player',x:0,z:0},bounds=[{x:0,z:0,w:6,d:6},{x:4,z:0,w:4,d:3}],ctx={player,bounds,obstacles:[],entities:[]};
 N.move(player,4,0,ctx);assert.ok(player.x>3.99);assert.ok(within(player,bounds,.29));N.move(player,0,4,ctx);assert.ok(player.z<=1.21);assert.ok(within(player,bounds,.29));
});
test('a real closed gate stops travel, an opened gate permits it and closing around an actor safely recovers it',()=>{
 const level=realLevel();try{const player={kind:'player',x:0,z:-6.5},ctx={...level,player,entities:[]};N.move(player,0,-4,ctx);const front=Math.max(...level.obstacles.filter(o=>o.kind==='gate').map(o=>o.z+o.d/2));assert.ok(player.z>=front+.29-1e-5);assert.equal(blocked(player,level.obstacles,.29),false);
 level.setGate(true,true);N.move(player,0,-3,ctx);assert.ok(player.z<-9);assert.ok(within(player,level.bounds,.29));
 player.x=0;player.z=-8;level.setGate(false,true);N.move(player,0,0,ctx);assert.equal(blocked(player,level.obstacles,.29),false);assert.ok(within(player,level.bounds,.29));
 }finally{level.dispose();}
});
test('normal walking and roll-sized steps stay legal through the actual route and pillar corners',()=>{
 const level=realLevel();try{level.setGate(true,true);const player={kind:'player',radius:.46,x:0,z:18},ctx={...level,player,entities:[]};
 for(const [x,z]of [[0,12],[0,3],[-8.5,3],[0,3],[0,-8],[0,-13],[7,-18.3],[0,-29.5]]){for(let i=0;i<1000&&Math.hypot(x-player.x,z-player.z)>.08;i++){const dx=x-player.x,dz=z-player.z,d=Math.hypot(dx,dz),step=Math.min(d,i%3===0?.257:.06);N.move(player,dx/d*step,dz/d*step,ctx);assert.equal(blocked(player,level.obstacles,.46),false);assert.ok(within(player,level.bounds,.46));}assert.ok(Math.hypot(x-player.x,z-player.z)<.1,'route stopped before '+[x,z]);}
 }finally{level.dispose();}
});
test('crowded map edges favor legal placement over impossible requested standing gaps',()=>{
 const player={kind:'player',id:'p',hp:120,x:.68,z:0},other={kind:'sentinel',id:'s',hp:68,x:0,z:0},ctx={player,bounds:[{x:0,z:0,w:2,d:2}],obstacles:[],entities:[player,other]};
 for(let i=0;i<50;i++){N.move(player,.1,0,ctx);assert.ok(within(player,ctx.bounds,.29));assert.equal(blocked(player,ctx.obstacles,.29),false);}assert.ok(player.x<=.71);
 other.hp=0;player.x=0;player.z=0;assert.equal(N.move(player,0,0,ctx),0,'dead bodies must not reserve crowd spacing');
});

test('authored body radii override defaults for both walls and crowd spacing',()=>{
 const player={kind:'player',id:'p',hp:120,radius:.40,x:0,z:0},boss={kind:'boss',id:'b',hp:360,radius:.58,x:-2,z:0};
 assert.equal(N.radius(player,player),.4);assert.equal(N.radius(boss,player),.58);assert.equal(N.radius({kind:'boss'},player),.55);
 const ctx={player,bounds:[{x:0,z:0,w:10,d:10}],obstacles:[{x:1,z:0,w:1,d:6}],entities:[player,boss]};N.move(player,2,0,ctx);assert.ok(player.x<=.100001);assert.equal(blocked(player,ctx.obstacles,.4),false);
});

test('equipment segment casts use the nearest wall surface, height and padding',()=>{
 const near={x:1,z:0,w:.2,d:2,h:2},far={x:2,z:0,w:.2,d:2,h:4};
 const hit=N.segmentCast({x:0,y:1.1,z:0},{x:3,y:1.1,z:0},[far,near],.02);assert.equal(hit.obstacle,near);assert.ok(Math.abs(hit.point.x-.88)<1e-6);assert.deepEqual(hit.normal,{x:-1,y:0,z:0});
 assert.equal(N.segmentCast({x:0,y:2.1,z:0},{x:1.5,y:2.1,z:0},[near]),null,'a blade above a short obstacle must remain free');
 const top=N.segmentCast({x:1,y:3,z:0},{x:1,y:1,z:0},[near],0);assert.equal(top.point.y,2);assert.deepEqual(top.normal,{x:0,y:1,z:0});
 assert.equal(N.segmentCast({x:0,y:1,z:2},{x:3,y:1,z:2},[near]),null);assert.equal(N.segmentCast({x:NaN,y:1,z:0},{x:2,y:1,z:0},[near]),null);
});

test('equipment casts support column sides and caps without treating tangents as penetration',()=>{
 const column={x:0,z:0,r:.5,h:2};const side=N.segmentCast({x:-2,y:1,z:0},{x:2,y:1,z:0},[column],0);assert.equal(side.point.x,-.5);assert.deepEqual(side.normal,{x:-1,y:0,z:0});
 const cap=N.segmentCast({x:0,y:3,z:0},{x:0,y:1,z:0},[column],0);assert.equal(cap.point.y,2);assert.deepEqual(cap.normal,{x:0,y:1,z:0});
 assert.equal(N.segmentCast({x:-2,y:1,z:.5},{x:2,y:1,z:.5},[column],0),null);assert.equal(N.segmentCast({x:-2,y:5,z:0},{x:2,y:5,z:0},[{x:0,z:0,w:1,d:1}],0),null,'missing obstacle heights default to four meters');
});

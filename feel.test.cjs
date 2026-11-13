const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('./feel.js');
const p=(x,z,y=1)=>({x,y,z});

test('actual stationary blade hits its capsule and misses an enemy behind it',()=>{
 assert.equal(C.sweptBladeHit(p(0,0),p(0,2),p(0,0),p(0,2),{x:.3,y:0,z:1},.31),true);
 assert.equal(C.sweptBladeHit(p(0,0),p(0,2),p(0,0),p(0,2),{x:0,y:0,z:-1},.4),false);
 assert.equal(C.sweptBladeHit(p(0,0),p(0,2),p(0,0),p(0,2),{x:.42,y:0,z:1},.4),false);
});
test('swept blade detects a target crossed between frames with both end frames outside',()=>{
 const args=[p(-2,0),p(-2,2),p(2,0),p(2,2)];
 assert.equal(C.sweptBladeHit(...args,{x:0,y:0,z:1},.25),true);
 assert.equal(C.sweptBladeHit(...args,{x:0,y:0,z:3},.25),false);
});
test('vertical hurtbox clipping rejects overhead and underground sword paths',()=>{
 const target={x:0,y:0,z:1};
 for(const y of [-1,2.6])assert.equal(C.sweptBladeHit(p(-1,0,y),p(-1,2,y),p(1,0,y),p(1,2,y),target,.3),false);
 assert.equal(C.sweptBladeHit(p(-1,0,1),p(-1,2,1),p(1,0,1),p(1,2,1),target,.3),true);
});
test('a downward slash crossing the hurtbox is caught even if it starts overhead',()=>{
 assert.equal(C.sweptBladeHit(p(-.2,.5,3),p(.2,1.5,3),p(-.2,.5,.8),p(.2,1.5,.8),{x:0,y:0,z:1},.2),true);
});
test('projection alone cannot make a raised sword hit an unrelated lower target',()=>{
 // Only the near end of this triangle is low enough; the far target is overhead.
 assert.equal(C.sweptBladeHit(p(0,0,1),p(0,4,5),p(.1,0,1),p(.1,4,5),{x:0,y:0,z:3.5},.2),false);
});
test('sweep collision handles tangency, zero-length blades and invalid coordinates',()=>{
 assert.equal(C.sweptBladeHit(p(0,0),p(0,2),p(0,0),p(0,2),{x:.4,y:0,z:1},.4),true);
 assert.equal(C.sweptBladeHit(p(0,0),p(0,0),p(0,0),p(0,0),{x:50,y:0,z:50},.4),false);
 assert.equal(C.sweptBladeHit(p(0,0),p(0,0),p(0,0),p(0,0),{x:0,y:0,z:0},.4),true);
 assert.equal(C.sweptBladeHit({x:NaN,y:1,z:0},p(0,1),p(0,0),p(0,1),p(0,0),.4),false);
});
test('light chain alternates cuts and ends with a stronger committed overhead',()=>{
 const moves=[0,1,2].map(i=>C.getMove('light',i));
 assert.equal(moves[0].slash,-moves[1].slash);
 assert.equal(moves[2].slash,0);
 assert.ok(moves[2].damage>moves[1].damage&&moves[2].total>moves[0].total);
 for(const m of moves){assert.ok(m.total>=m.animation.duration-.001,'a light cut must retain its complete source recovery');assert.ok(m.recovery>m.active&&m.guardAt>=m.activeEnd&&m.cancelAt>=m.activeEnd);}
 assert.deepEqual(C.getMove('light',3),moves[0]);
 assert.ok(C.getMove('heavy').total>1&&C.getMove('heavy').poise>moves[2].poise);
});
test('pose channels share the exact damage window and never hit during anticipation',()=>{
 const m=C.getMove('light');
 assert.equal(C.samplePose(m,m.windup-.001).active,false);
 assert.equal(C.samplePose(m,m.windup+.001).active,true);
 assert.equal(C.samplePose(m,m.activeEnd+.001).active,false);
 assert.equal(C.samplePose(m,m.total).done,true);
 for(let t=0;t<=m.total;t+=.01){const s=C.samplePose(m,t);for(const k of ['anticipation','strike','follow','recovery','progress'])assert.ok(s[k]>=0&&s[k]<=1);}
});
test('attacks commit until recovery but allow an authored combo and dodge window',()=>{
 const m=C.getMove('light');
 for(const action of ['roll','guard','light','move','heal'])assert.equal(C.canCancel(m,m.windup*.5,action),false);
 assert.equal(C.canCancel(m,m.chainOpen-.001,'light'),false);
 assert.equal(C.canCancel(m,m.chainOpen,'light'),true);
 assert.equal(C.canCancel(m,m.chainClose+.001,'light'),false);
 assert.equal(C.canCancel(m,m.cancelAt-.001,'roll'),false);
 assert.equal(C.canCancel(m,m.cancelAt,'roll'),true);
 assert.equal(C.canCancel(m,m.total,'move'),true);
 assert.equal(C.canCancel(C.getBossMove(0),1,'roll'),false);
});
test('roll keeps vulnerable startup and recovery and a fixed middle protection window',()=>{
 const m=C.getMove('roll');
 assert.ok(m.iframeStart>=m.windup&&m.iframeEnd<=m.activeEnd&&m.iframeEnd<m.total);
 assert.equal(C.samplePose(m,m.iframeStart-.001).invulnerable,false);
 assert.equal(C.samplePose(m,m.iframeStart).invulnerable,true);
 assert.equal(C.samplePose(m,(m.iframeStart+m.iframeEnd)/2).invulnerable,true);
 assert.equal(C.samplePose(m,m.iframeEnd).invulnerable,true);
 assert.equal(C.samplePose(m,m.iframeEnd+.001).invulnerable,false);
});
test('perfect guard has zero chip, refunds stamina and staggers the attacker',()=>{
 const hit=C.guardHit(28,80,.16);
 assert.equal(hit.perfect,true);assert.equal(hit.damage,0);assert.equal(hit.broken,false);
 assert.ok(hit.stamina>80&&hit.stamina<=100&&hit.attackerStagger>.5&&hit.poiseDamage>0);
 assert.equal(C.guardHit(28,80,.16001).perfect,false);
 assert.equal(C.guardHit(28,80,.08,{canParry:false}).perfect,false);
});
test('held guard uses an exact stamina threshold; exhaustion produces full damage',()=>{
 const cost=28*.88+7;
 const block=C.guardHit(28,cost,1),broken=C.guardHit(28,cost-.001,1);
 assert.equal(block.broken,false);assert.equal(block.stamina,0);assert.equal(block.damage,4);
 assert.equal(broken.broken,true);assert.equal(broken.damage,28);assert.equal(broken.stamina,0);
 assert.equal(C.guardHit(28,0,.1).broken,true);
});
test('boss combos retain a real gap while second phase adds urgency',()=>{
 const m=C.getBossMove(2,2),one=C.getBossMove(0,1),two=C.getBossMove(0,2);
 assert.equal(m.type,'combo');assert.equal(m.windows.length,2);
 assert.equal(C.samplePose(m,m.windows[0][1]+.05).active,false);
 assert.equal(C.samplePose(m,m.windows[1][0]+.02).active,true);
 assert.ok(two.windup<one.windup&&two.windup>.8&&two.recovery>.5);
 m.windows[0][0]=999;assert.ok(C.getBossMove(2,2).windows[0][0]<1);
});
test('input buffer preserves blocked input until usable and expires stale presses',()=>{
 const b=C.createInputBuffer(.24);
 C.queueInput(b,'light',1);C.queueInput(b,'roll',1.05);
 assert.equal(C.consumeInput(b,1.1,['heal']),null);
 assert.equal(C.consumeInput(b,1.12,['roll']),'roll');
 assert.equal(C.consumeInput(b,1.2,['light']),'light');
 C.queueInput(b,'heavy',2);assert.equal(C.consumeInput(b,2.25),null);
 C.queueInput(b,'light',3);C.queueInput(b,'light',3.1);assert.equal(b.entries.length,1);
});

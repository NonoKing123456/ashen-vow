const test=require('node:test');
const assert=require('node:assert/strict');
const A=require('./tactics.js'),C=require('./feel.js');
const player=(x=0,z=0,extra={})=>({x,z,hp:120,state:'idle',t:0,...extra});
const guard=(id='sentinel-0',x=0,z=1.6,extra={})=>({id,kind:'sentinel',x,z,spawnX:x,spawnZ:z,hp:68,aggro:true,state:'idle',cooldown:0,lastAttackAt:-1000,...extra});
const boss=(extra={})=>guard('boss-0',0,0,{kind:'boss',phase:1,cycle:0,...extra});

test('a supporting guard never starts a second windup over an attacking peer',()=>{
 const p=player(),a=guard('sentinel-0',0,1.5,{state:'attack'}),b=guard('sentinel-1',1.5,0);
 const turn=A.decide(b,p,[a,b]);
 assert.equal(A.ownsTurn(b,p,[a,b]),false);assert.equal(turn.action,'retreat');
 assert.ok(turn.dx>0&&turn.speed>0); // away from the player, not closer
});

test('the longest-waiting guard in melee receives the next attack turn',()=>{
 const p=player(),a=guard('sentinel-0',0,1.5,{lastAttackAt:10}),b=guard('sentinel-1',1.6,0,{lastAttackAt:3});
 assert.equal(A.decide(a,p,[a,b]).action,'retreat');
 assert.equal(A.decide(b,p,[a,b]).action,'attack');
 b.lastAttackAt=11;
 assert.equal(A.decide(a,p,[a,b]).action,'attack');
 assert.notEqual(A.decide(b,p,[a,b]).action,'attack');
});

test('a distant or recovering peer cannot reserve an invisible attack token',()=>{
 const p=player(),a=guard('sentinel-0',0,1.5,{lastAttackAt:20}),b=guard('sentinel-1',0,7,{lastAttackAt:0});
 assert.equal(A.decide(a,p,[a,b]).action,'attack');
 b.z=1.5;b.state='hurt';assert.equal(A.decide(a,p,[a,b]).action,'attack');
 b.state='idle';b.cooldown=.2;assert.equal(A.decide(a,p,[a,b]).action,'attack');
});

test('guards leave the chapel approach alone when the player exceeds their leash',()=>{
 const p=player(-11,10),g=guard('sentinel-0',3,10,{spawnX:0,spawnZ:0});
 const d=A.decide(g,p,[g]);assert.equal(d.action,'return');assert.equal(d.arrived,false);
 assert.ok(d.dx<0&&d.dz<0&&d.speed>0);
 // Once committed to returning, they finish instead of ping-ponging at a radius.
 g.x=.2;g.z=.1;g.returning=true;
 assert.equal(A.decide(g,player(2,2),[g]).arrived,true);
 assert.notEqual(A.decide(boss({x:20,z:0}),player(),[]).action,'return');
});

test('recovery produces slow stable footwork, never a cooldown-bypassing attack',()=>{
 const p=player(),g=guard('sentinel-0',0,1.8,{cooldown:.5});
 const a=A.decide(g,p,[g]),b=A.decide(g,p,[g]);
 assert.equal(a.action,'strafe');assert.ok(a.speed<1);assert.equal(a.dz,0);
 assert.deepEqual(a,b);assert.equal(A.decide({...g,state:'hurt'},p,[g]).action,'hold');
 assert.equal(A.decide({...g,state:'attack'},player(30,30),[g]).action,'hold');
});

test('warden waits for the heal cue before selecting its normal backhand response',()=>{
 const e=boss(),p=player(0,3,{state:'heal',t:.31});
 assert.equal(A.bossChoice(e,p).moveType,'sweep');
 p.t=.32;const choice=A.bossChoice(e,p);
 assert.equal(choice.reason,'heal-response');assert.equal(choice.moveType,'backhand');
 const attack=C.getBossMove(choice.moveIndex,1);
 assert.equal(attack.type,'backhand');assert.equal(attack.animation.clip,'Sword_Regular_B');assert.ok(attack.windup>=1&&attack.recovery>.7);
 assert.equal(A.decide(e,p,[e]).action,'attack');
});

test('held guard invites a committed slam after a visible wait, not an instant counter',()=>{
 const e=boss(),p=player(0,2.2);
 assert.equal(A.bossChoice(e,p,{guarding:true,guardTime:.59}).moveType,'sweep');
 const choice=A.bossChoice(e,p,{guarding:true,guardTime:.6});
 assert.equal(choice.moveType,'slam');assert.equal(C.getBossMove(choice.moveIndex,1).type,'slam');
 assert.ok(C.getBossMove(choice.moveIndex,1).windup>1.2);
});

test('second-phase tactical combos retain a non-damaging gap between their blade windows',()=>{
 const e=boss({phase:2,cycle:2}),p=player(0,2.2),choice=A.bossChoice(e,p);
 assert.equal(choice.moveType,'combo');const m=C.getBossMove(choice.moveIndex,2);
 assert.equal(m.type,'combo');assert.equal(m.windows.length,2);
 assert.ok(m.windows[1][0]-m.windows[0][1]>.3);
 assert.equal(C.samplePose(m,(m.windows[1][0]+m.windows[0][1])*.5).active,false);
});

test('decisions are pure, finite and normalized for the same encounter snapshot',()=>{
 const p=player(0,0),e=boss({cooldown:.5});
 const snapshot=JSON.stringify({e,p});
 for(let x=-5;x<=5;x++)for(let z=-5;z<=5;z++){
  const result=A.decide({...e,x,z},p,[e]);
  for(const v of [result.dx,result.dz,result.speed])assert.ok(Number.isFinite(v));
  assert.ok(Math.hypot(result.dx,result.dz)<=1.00001);
 }
 assert.equal(JSON.stringify({e,p}),snapshot);
});

test('roll counter cut has committed startup, one blade window and a source recovery',()=>{
 const m=C.getMove('dodgeAttack');assert.equal(m.type,'cut');assert.equal(m.kind,'dodgeAttack');assert.equal(m.animation.clip,'Sword_Regular_A');assert.equal(m.animation.recoveryClip,'Sword_Regular_A_Rec');assert.equal(m.windows.length,1);
 assert.ok(m.damage>C.getMove('light').damage&&m.stamina<C.getMove('roll').stamina);
 assert.equal(C.samplePose(m,m.windup-.001).active,false);
 assert.equal(C.samplePose(m,m.windup+.001).active,true);
 assert.equal(C.samplePose(m,m.activeEnd+.001).active,false);
 assert.equal(C.canCancel(m,m.windup*.5,'roll'),false);assert.equal(C.canCancel(m,m.cancelAt,'roll'),true);
});

test('perfect-guard counter reward changes impact without changing or sharing blade windows',()=>{
 const base=C.getMove('light',1),counter=C.counterProfile(base);
 assert.equal(counter.counter,true);assert.ok(counter.damage>base.damage&&counter.poise>base.poise);
 assert.equal(counter.total,base.total);assert.deepEqual(counter.windows,base.windows);
 counter.windows[0][0]=99;counter.activeWindows[0][0]=99;
 assert.notEqual(base.windows[0][0],99);assert.notEqual(base.activeWindows[0][0],99);
});

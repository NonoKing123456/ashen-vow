const test=require('node:test'),assert=require('node:assert/strict');
const {bootProduction}=require('./test-support/production-harness.cjs');
const C=require('./feel.js');

// This is a systems integration driver, not a claim about human readability.
// It observes action stages at 200 ms intervals. Guards hold through sentinel
// windups; the boss strategy raises the shield near contact for its existing
// parry/counter cycle. It does not set HP, teleport, clear
// colliders, or replace the production character with a contact fixture.
const interval=12,step=.30,trace=(...v)=>{if(process.env.ASHEN_FLOW_TRACE==='1')console.info('FLOW',...v)};
function legal(world,x,z,r=.46){
 if(!world.bounds.some(b=>x>=b.x-b.w/2+r&&x<=b.x+b.w/2-r&&z>=b.z-b.d/2+r&&z<=b.z+b.d/2-r))return false;
 return !world.obstacles.some(o=>o.w!=null?x>o.x-o.w/2-r+1e-5&&x<o.x+o.w/2+r-1e-5&&z>o.z-o.d/2-r+1e-5&&z<o.z+o.d/2+r-1e-5:Math.hypot(x-o.x,z-o.z)<o.r+r-1e-5);
}
function clearLine(world,a,b){const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.09));for(let i=1;i<=n;i++)if(!legal(world,a.x+(b.x-a.x)*i/n,a.z+(b.z-a.z)*i/n))return false;return true}
function route(world,start,target,radius){
 const key=(x,z)=>Math.round(x/step)+','+Math.round(z/step),decode=k=>{const [x,z]=k.split(',').map(Number);return{x:x*step,z:z*step}},first=key(start.x,start.z),queue=[first],parent=new Map([[first,null]]);
 let goal=null;
 for(let i=0;i<queue.length;i++){const k=queue[i],p=decode(k);if(Math.hypot(p.x-target.x,p.z-target.z)<radius){goal=k;break}for(const [dx,dz]of [[step,0],[-step,0],[0,step],[0,-step]]){const next={x:p.x+dx,z:p.z+dz},nk=key(next.x,next.z);if(parent.has(nk)||!legal(world,next.x,next.z))continue;parent.set(nk,k);queue.push(nk)}}
 if(!goal)throw Error('No collision-valid route to '+JSON.stringify(target));const raw=[];for(let k=goal;k;k=parent.get(k))raw.push(decode(k));raw.reverse();
 const result=[];let at={x:start.x,z:start.z},i=1;while(i<raw.length){let far=i;for(let j=i+1;j<raw.length;j++)if(clearLine(world,at,raw[j]))far=j;result.push(raw[far]);at=raw[far];i=far+1}return result;
}
function steer(q,x,z){
 q.releaseMovement();const p=q.read().player,dx=x-p.x,dz=z-p.z,length=Math.hypot(dx,dz);if(length<.15)return;
 const f=q.camera.getWorldDirection(new q.T.Vector3()),fl=Math.hypot(f.x,f.z),fx=f.x/fl,fz=f.z/fl,along=(dx*fx+dz*fz)/length,side=(dx*-fz+dz*fx)/length;
 if(along>.25)q.press('KeyW');if(along<-.25)q.press('KeyS');if(side>.25)q.press('KeyD');if(side<-.25)q.press('KeyA');
}
function status(q){const s=q.read();return JSON.stringify({player:s.player,enemies:s.enemies,flags:s.flags,context:q.text('interaction-text')})}
async function walkTo(q,target,radius=.45,arrived=null){
 q.clear();let path=route(q.world(),q.read().player,target,Math.max(.12,radius-.18)),node=0,lastMoved=0,previous=q.read().player,advancedAt=0,lastNode=0;
 for(let frame=0;frame<6000;frame+=interval){if(frame%120===0)await new Promise(resolve=>setImmediate(resolve));const s=q.read();if(s.flags.dead)assert.fail('Died while walking: '+status(q));if(s.flags.directing){q.tap('Enter');q.tick(interval);continue}if(arrived?.(s)||Math.hypot(s.player.x-target.x,s.player.z-target.z)<radius){q.releaseMovement();q.tick(3);return}
  if(Math.hypot(s.player.x-previous.x,s.player.z-previous.z)>.05){lastMoved=frame;previous=s.player}
  if(frame-lastMoved>360)assert.fail('Production navigation stalled: '+status(q));
  while(node<path.length-1&&Math.hypot(s.player.x-path[node].x,s.player.z-path[node].z)<.27)node++;
  if(node>=path.length){path=route(q.world(),s.player,target,Math.max(.12,radius-.18));node=0}
  if(node!==lastNode){advancedAt=frame;lastNode=node}if(frame-advancedAt>600)assert.fail('No progress along the legal production route: '+JSON.stringify({path,node,...JSON.parse(status(q))}));if(frame%600===0)trace('walk',JSON.stringify({frame,node,path,target,at:s.player}));const next=path[node]||target;steer(q,next.x,next.z);q.tick(interval);
 }
 assert.fail('Walk exceeded its bounded input budget: '+status(q));
}
async function waitForPassage(q,a,b){
 q.clear();for(let frame=0;frame<=240;frame+=6){if(frame%30===0)await new Promise(resolve=>setImmediate(resolve));if(clearLine(q.world(),a,b))return frame;q.tick(6)}
 assert.fail('The visible gate never produced a body-width collision passage: '+status(q));
}
async function fight(q,id){
 q.clear();let damageAt=0,lastHp=q.read().enemies.find(e=>e.id===id).hp,guard=false,phaseTwo=false,usedRoll=false;
 for(let frame=0;frame<10800;frame+=interval){if(frame%120===0)await new Promise(resolve=>setImmediate(resolve));const s=q.read(),p=s.player,e=s.enemies.find(e=>e.id===id);phaseTwo||=e.phase===2;
  if(e.hp<=0){q.clear();q.tick(6);return{phaseTwo}}
  if(s.flags.dead)assert.fail('Production combat defeat: '+status(q));if(s.flags.directing){q.tap('Enter');q.tick(interval);continue}
  if(e.hp<lastHp){damageAt=frame;lastHp=e.hp}if(frame-damageAt>4200)assert.fail('Production blade combat stalled: '+status(q));
  if(frame%600===0)trace('fight',id,JSON.stringify({frame,player:p,enemy:e}));if(!s.flags.locked){q.tap('KeyQ');q.tick(1)}
  const d=Math.hypot(p.x-e.x,p.z-e.z),recovering=e.state==='attack'&&e.attack&&e.t>e.attack.activeEnd+(e.kind==='boss'?.05:.18),incoming=e.state==='attack'&&!recovering;
  const nextWindup=e.kind==='boss'?Math.min(...Array.from({length:6},(_,i)=>C.getBossMove(i,e.phase).windup)):0;
  const safeBossRecovery=recovering&&e.attack.total-e.t+.28+nextWindup>C.getMove('light').total+interval/60;
  // Exercise one complete production roll, then use guard/counter and the
  // authored recovery. Repeated rolls with a 1.47 s recovery are a defensive
  // loop, not an opportunity to start the slower heavy strike.
  if(e.kind==='boss'&&incoming&&!usedRoll&&p.state==='idle'&&e.t>e.attack.windup-.40&&p.stamina>=26){
   if(guard){q.release('KeyL');guard=false}usedRoll=true;q.releaseMovement();q.press('KeyW');q.press('KeyD');q.tap('Space');q.tick(interval);continue;
  }
  const needsGuard=incoming&&(e.kind!=='boss'||e.t>=e.attack.windup-.16);
  if(needsGuard&&!guard){q.press('KeyL');guard=true}if(!needsGuard&&guard){q.release('KeyL');guard=false}
  q.releaseMovement();
  if(p.state==='idle'&&!incoming){
   if(p.hp<70&&p.flasks>0&&(e.state==='stagger'||e.state==='phase'||safeBossRecovery))q.tap('KeyE');
   else if(d>1.65){const ratio=(d-1.5)/d,goal={x:p.x+(e.x-p.x)*ratio,z:p.z+(e.z-p.z)*ratio};if(clearLine(q.world(),p,goal))steer(q,goal.x,goal.z);else{const path=route(q.world(),p,e,1.65);const next=path[0];if(next)steer(q,next.x,next.z)}}
   else if(e.state==='stagger'&&p.stamina>=30)q.tap('KeyF');
   else if(e.kind==='boss'&&(safeBossRecovery||e.state==='hurt')&&p.stamina>=C.getMove('light').stamina+20)q.tap('KeyJ');
   else if(e.kind!=='boss'&&(recovering||e.state==='hurt'||e.state==='idle')&&p.stamina>=40)q.tap('KeyK');
  }
  q.tick(interval);
 }
 assert.fail('Production encounter exceeded its bounded input budget: '+status(q));
}
async function memory(q,id){
 const world=q.world(),at=world.discoveries.find(d=>d.id===id),p=q.read().player,candidates=[];
 for(let ix=Math.round(at.x/step)-6;ix<=Math.round(at.x/step)+6;ix++)for(let iz=Math.round(at.z/step)-6;iz<=Math.round(at.z/step)+6;iz++){const x=ix*step,z=iz*step;if(Math.hypot(x-at.x,z-at.z)>at.radius-.25||!legal(world,x,z,.51)||world.checkpoints.some(c=>Math.hypot(x-c.x,z-c.z)<c.radius+.4))continue;candidates.push({x,z})}
 candidates.sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z));assert.ok(candidates.length,'a physical discovery needs an available approach');
 await walkTo(q,candidates[0],.25,()=>q.text('interaction-text').includes(at.name));q.tap('KeyF');q.tick(2);assert.equal(q.modal(),true,'the real memory UI should open');assert.ok(q.read().journey.memories.includes(id),'F should read '+id+' rather than another nearby interaction');q.closeModal();q.tick(2);assert.equal(q.read().flags.paused,false)
}

test('production GLB and real collision level complete the public-input journey', {timeout:150000},async t=>{
 const q=await bootProduction();t.after(()=>q.dispose());const info=q.info();assert.equal(info.asset.triangles,59281);assert.equal(info.characters.length,4);assert.ok(info.characters.every(c=>c.skinnedMeshes===1&&c.bones===22));assert.ok(q.world().obstacles.length>30,'the real level must retain its collision geometry');
 q.stage('arrival');q.start();await memory(q,'arrival');t.diagnostic('Production asset loaded; arrival discovery opened and returned control.');
 q.stage('first sentinel');await walkTo(q,{x:0,z:13},.5);await fight(q,'sentinel-0');assert.equal(q.read().enemies[0].hp,0);t.diagnostic('First sentinel defeated by actual animated blade contacts.');
 q.stage('second sentinel');await walkTo(q,{x:0,z:3},.55);await fight(q,'sentinel-1');assert.equal(q.read().enemies[1].hp,0);t.diagnostic('Both sentinels defeated with original collisions intact.');
 q.stage('chapel');await walkTo(q,{x:-4,z:3.3},.5);await walkTo(q,q.world().checkpoints[0],1.5,()=>/点燃余火|休息/.test(q.text('interaction-text')));q.tap('KeyF');q.tick(2);assert.equal(q.read().flags.checkpoint,true);assert.equal(q.modal(),true);q.click('relic-edge');q.click('shrine-done');q.tick(2);assert.equal(q.read().journey.relic,'edge');await memory(q,'chapel');t.diagnostic('Chapel checkpoint, blessing and memory returned control through real UI logic.');
 q.stage('gate and warden');await walkTo(q,{x:-4,z:3.3},.5);await walkTo(q,{x:0,z:-5.2},.4);q.tap('KeyF');q.tick(2);assert.equal(q.read().flags.gateOpen,true);const gateWait=await waitForPassage(q,{x:0,z:-5.2},{x:0,z:-10.5});t.diagnostic('Gate passage followed the actual leaf AABBs after '+gateWait+' simulation frames.');await walkTo(q,{x:0,z:-12},.4);const boss=await fight(q,'boss-0');assert.equal(boss.phaseTwo,true,'the real fight must visit phase two');assert.equal(q.read().flags.bossDefeated,true);assert.equal(q.read().flags.won,false);t.diagnostic('Gate and both Warden phases completed through public inputs.');
 q.stage('final discovery and bell');await memory(q,'warden');await walkTo(q,q.world().bell,1.7,()=>q.text('interaction-text').includes('敲响最后的钟声'));q.tap('KeyF');q.tick(2);assert.equal(q.read().flags.won,true);assert.ok(q.read().player.hp>0);assert.equal(q.read().enemies.filter(e=>e.hp<=0).length,3);assert.equal(q.read().journey.memories.length,3);q.tick(420);assert.equal(q.text('result-title'),'长夜将尽');assert.equal(q.hidden('result-screen'),false);t.diagnostic('All discoveries, final bell and victory result reached with the production radius and no state edits.');const outcome=q.read();t.diagnostic('Driver outcome: '+JSON.stringify({frames:q.metrics().frames,wallMs:q.metrics().wallMs,hp:outcome.player.hp,flasks:outcome.player.flasks,stats:outcome.journey.stats}));
});

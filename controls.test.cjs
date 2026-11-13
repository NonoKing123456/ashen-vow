const test=require('node:test');
const assert=require('node:assert/strict');
const {create,stick}=require('./controls.js');

function harness(){
 const events=[],listeners=new Map(),docListeners=new Map();
 const win={document:{hidden:false,addEventListener:(n,f)=>docListeners.set(n,f),removeEventListener:n=>docListeners.delete(n)},addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)};
 const pad={index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
 let connected=true;
 const config={window:win,navigator:{getGamepads:()=>connected?[pad]:[]}};
 for(const name of ['onAction','onPause','onJournal','onGuard','onMove','onLook','onDevice','onDisconnected','onSprint','onMenu'])config[name]=(...args)=>events.push([name,...args]);
 const controls=create(config);controls.update(1/60,{enabled:true});
 return {controls,pad,events,listeners,docListeners,win,disconnect:()=>connected=false,reconnect:()=>connected=true,press:(i,v=true)=>Object.assign(pad.buttons[i],{pressed:v,value:v?1:0}),tick:(enabled=true)=>controls.update(1/60,{enabled})};
}
test('radial dead zones reject drift and preserve diagonal direction without excessive speed',()=>{
 assert.deepEqual(stick(.07,-.1),{x:0,y:0});
 const v=stick(1,-1);assert.ok(Math.abs(Math.hypot(v.x,v.y)-1)<1e-10);assert.equal(v.x,-v.y);
 assert.deepEqual(stick(NaN,Infinity),{x:0,y:0});
});
test('standard buttons fire only once per physical press; right stick uses seconds and left up is forward',()=>{
 const q=harness();q.press(5);q.tick();q.tick();assert.deepEqual(q.events.filter(e=>e[0]==='onAction'),[['onAction','light']]);
 q.press(5,false);q.tick();q.press(5);q.tick();assert.equal(q.events.filter(e=>e[0]==='onAction').length,2);
 q.pad.axes=[.6,-.8,1,-1];q.tick();
 const move=q.events.filter(e=>e[0]==='onMove').at(-1),look=q.events.filter(e=>e[0]==='onLook').at(-1);
 assert.ok(move[1]>0&&move[2]>0&&Math.hypot(move[1],move[2])<=1.001);
 assert.ok(look[1]>0&&look[2]<0&&look[1]<.05);
});
test('pause and blur release movement and guard, discard held attacks, and require a fresh guard press',()=>{
 const q=harness();q.pad.axes=[0,-1,0,0];q.press(4);q.tick();assert.ok(q.events.some(e=>e[0]==='onGuard'&&e[1]));
 q.press(7);q.tick(false);assert.deepEqual(q.events.filter(e=>e[0]==='onMove').at(-1),['onMove',0,0]);assert.deepEqual(q.events.filter(e=>e[0]==='onGuard').at(-1),['onGuard',false]);
 q.tick();assert.equal(q.events.filter(e=>e[0]==='onAction').length,0);assert.equal(q.events.filter(e=>e[0]==='onGuard'&&e[1]).length,1);
 q.press(4,false);q.tick();q.press(4);q.tick();assert.equal(q.events.filter(e=>e[0]==='onGuard'&&e[1]).length,2);
 q.listeners.get('blur')();q.tick();assert.deepEqual(q.events.filter(e=>e[0]==='onMove').at(-1),['onMove',0,0]);
 q.listeners.get('focus')();q.tick();assert.equal(q.events.filter(e=>e[0]==='onAction').length,0);
});
test('menu input is available while paused and cannot also issue a combat action',()=>{
 const q=harness();q.press(9);q.press(5);q.tick();assert.equal(q.events.filter(e=>e[0]==='onPause').length,1);assert.equal(q.events.filter(e=>e[0]==='onAction').length,0);
 q.press(9,false);q.tick(false);q.press(9);q.tick(false);assert.equal(q.events.filter(e=>e[0]==='onPause').length,2);
 q.press(8);q.tick(false);assert.equal(q.events.filter(e=>e[0]==='onJournal').length,1);
 q.press(8,false);q.tick(false);q.press(13);q.press(0);q.tick(false);assert.deepEqual(q.events.filter(e=>e[0]==='onMenu'),[['onMenu','next'],['onMenu','accept']]);
 q.press(10);q.tick();assert.deepEqual(q.events.filter(e=>e[0]==='onSprint').at(-1),['onSprint',true]);q.tick(false);assert.deepEqual(q.events.filter(e=>e[0]==='onSprint').at(-1),['onSprint',false]);
});
test('disconnect clears held controls, reconnect ignores stale presses, and unavailable rumble is safe',async()=>{
 const q=harness();q.pad.axes=[0,-1,0,0];q.press(4);q.tick();q.disconnect();q.tick();q.tick();assert.equal(q.events.filter(e=>e[0]==='onDisconnected').length,1);
 assert.deepEqual(q.events.filter(e=>e[0]==='onMove').at(-1),['onMove',0,0]);assert.deepEqual(q.events.filter(e=>e[0]==='onGuard').at(-1),['onGuard',false]);
 q.press(5);q.reconnect();q.tick();assert.equal(q.events.filter(e=>e[0]==='onAction').length,0);
 q.pad.vibrationActuator={playEffect:()=>Promise.reject(new Error('Unsupported'))};assert.equal(await q.controls.rumble(),false);
 q.controls.dispose();assert.equal(q.listeners.size,0);assert.equal(q.docListeners.size,0);
});

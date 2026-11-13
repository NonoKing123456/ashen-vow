/* Standard Gamepad controls. The game owns world movement and camera speed. */
(function(root){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function stick(x,y,deadzone=.18){
 x=Number.isFinite(x)?x:0;y=Number.isFinite(y)?y:0;
 const magnitude=Math.hypot(x,y);
 if(magnitude<=deadzone)return {x:0,y:0};
 const amount=clamp((magnitude-deadzone)/(1-deadzone),0,1)/magnitude;
 return {x:x*amount,y:y*amount};
}
function create(config={}){
 const win=config.window||root,nav=config.navigator||root.navigator;
 const call=(name,...args)=>{if(typeof config[name]==='function')config[name](...args)};
 let selected=null,previous=[],focused=true,disposed=false,active=false,guard=false;
 let lastMove={x:0,y:0},guardNeedsRelease=false,seedButtons=true,lastDevice='',sprinting=false;
 function device(name){if(lastDevice!==name){lastDevice=name;call('onDevice',name)}}
 function movement(x,y){if(x!==lastMove.x||y!==lastMove.y){lastMove={x,y};call('onMove',x,y)}}
 function guarding(value){if(guard!==value){guard=value;call('onGuard',value)}}
 function sprint(value){if(sprinting!==value){sprinting=value;call('onSprint',value)}}
 function reset(){movement(0,0);guarding(false);sprint(false);guardNeedsRelease=true;seedButtons=true;active=false}
 function blur(){focused=false;reset()}
 function focus(){focused=true;seedButtons=true}
 function visibility(){if(win.document?.hidden)blur();else focus()}
 function keyboard(){device('keyboard')}
 win.addEventListener?.('blur',blur);win.addEventListener?.('focus',focus);
 win.addEventListener?.('keydown',keyboard);win.addEventListener?.('pointerdown',keyboard);
 win.document?.addEventListener?.('visibilitychange',visibility);
 function pads(){try{return Array.from(nav?.getGamepads?.()||[])}catch(_){return []}}
 function standard(p){return p&&p.connected!==false&&p.mapping==='standard'}
 function update(dt,state={}){
  if(disposed)return;
  const all=pads();let pad=selected===null?null:all.find(p=>standard(p)&&p.index===selected);
  if(!pad){
   if(selected!==null){const index=selected;reset();selected=null;previous=[];call('onDisconnected',index)}
   pad=all.find(standard);
   if(!pad)return;
   selected=pad.index;seedButtons=true;
  }
  const buttons=Array.from(pad.buttons||[],b=>typeof b==='number'?b>.55:!!b&&(b.pressed||b.value>.55));
  if(seedButtons){previous=buttons.slice();seedButtons=false;guardNeedsRelease=!!buttons[4]}
  const rising=i=>buttons[i]&&!previous[i];
  const enabled=state.enabled!==false&&focused&&!win.document?.hidden;
  const left=stick(pad.axes?.[0],pad.axes?.[1],.18),right=stick(pad.axes?.[2],pad.axes?.[3],.20);
  const used=buttons.some(Boolean)||left.x!==0||left.y!==0||right.x!==0||right.y!==0;
  if(used&&focused)device('gamepad');
  // Start remains available in pause menus, but never while the page is blurred.
  const pausePress=focused&&rising(9),journalPress=focused&&rising(8);
  if(pausePress)call('onPause');
  if(journalPress)call('onJournal');
  if(pausePress||journalPress){movement(0,0);guarding(false);sprint(false);guardNeedsRelease=!!buttons[4];active=false;previous=buttons;return}
  if(!buttons[4])guardNeedsRelease=false;
  if(enabled){
   active=true;movement(left.x,-left.y);guarding(!!buttons[4]&&!guardNeedsRelease);sprint(!!buttons[10]);
   const seconds=clamp(Number(dt)||0,0,.05);
   if(right.x||right.y)call('onLook',right.x*2.45*seconds,right.y*1.7*seconds);
   for(const [index,action]of [[5,'light'],[7,'heavy'],[1,'roll'],[2,'heal'],[3,'interact'],[11,'lock']])if(rising(index))call('onAction',action);
  }else{
   if(active||guard||sprinting||lastMove.x||lastMove.y){movement(0,0);guarding(false);sprint(false);guardNeedsRelease=!!buttons[4];active=false}
   if(focused&&!win.document?.hidden)for(const [index,action]of [[12,'previous'],[13,'next'],[14,'left'],[15,'right'],[0,'accept'],[1,'back']])if(rising(index))call('onMenu',action);
  }
  previous=buttons;
 }
 function rumble(intensity=.35,duration=80){
  if(disposed||!focused||selected===null)return Promise.resolve(false);
  const pad=pads().find(p=>standard(p)&&p.index===selected),actuator=pad?.vibrationActuator;
  if(!actuator?.playEffect)return Promise.resolve(false);
  const amount=clamp(Number(intensity)||0,0,1),ms=clamp(Number(duration)||0,0,400);
  try{return Promise.resolve(actuator.playEffect('dual-rumble',{startDelay:0,duration:ms,strongMagnitude:amount,weakMagnitude:amount*.65})).then(()=>true,()=>false)}catch(_){return Promise.resolve(false)}
 }
 function dispose(){if(disposed)return;reset();disposed=true;win.removeEventListener?.('blur',blur);win.removeEventListener?.('focus',focus);win.removeEventListener?.('keydown',keyboard);win.removeEventListener?.('pointerdown',keyboard);win.document?.removeEventListener?.('visibilitychange',visibility)}
 return {update,reset,rumble,dispose,get connected(){return selected!==null},get device(){return lastDevice||'keyboard'}};
}
root.AshenControls={create,stick};
if(typeof module!=='undefined'&&module.exports)module.exports=root.AshenControls;
})(typeof window!=='undefined'?window:globalThis);

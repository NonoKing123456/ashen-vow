(function(global){
'use strict';
// Source clips own the pose; contact constraints run only after source blending.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),smooth=v=>{v=clamp(v,0,1);return v*v*(3-2*v);};
function actionSample(profile,time){
 const m=profile?.animation;if(!m)return null;
 const t=clamp(time,0,profile.total),times=[0,profile.windup,profile.activeEnd,profile.recoveryStart,profile.total],native=[0,m.windup,m.activeEnd,m.followEnd,m.duration];
 let at=m.duration;
 for(let i=0;i<4;i++)if(t<=times[i+1]){at=native[i]+(native[i+1]-native[i])*clamp((t-times[i])/Math.max(.00001,times[i+1]-times[i]),0,1);break;}
 if(m.parts){let offset=0;for(let i=0;i<m.parts.length;i++){const [name,duration]=m.parts[i];if(at<=offset+duration||i===m.parts.length-1){const local=at-offset,previous=i?m.parts[i-1]:null;return {clip:name,time:local,nativeTime:at,previous:previous&&local<.10?{clip:previous[0],time:previous[1],weight:1-smooth(local/.10)}:null};}offset+=duration;}}
 if(m.recoveryClip&&at>m.clipDuration)return {clip:m.recoveryClip,time:at-m.clipDuration,nativeTime:at};
 return {clip:m.clip,time:at,nativeTime:at};
}
function createAnimator(actor,T){
 const mix=actor.mixer,bones=actor.rig,source=actor.motionClips||[],all=actor.clips,defaults=[];
 actor.model.traverse(b=>{if(b.isBone)defaults.push({bone:b,p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()});});
 if(!global.AshenLocomotion||!global.AshenRigConstraints)throw new Error('Character contact modules are unavailable.');
 if(!source.length)throw new Error('The production knight requires its calibrated sword and roll animation library.');
 const gaitDriver=global.AshenLocomotion.create(actor,T),constraints=global.AshenRigConstraints.create(actor,T);
 const sourcePose=defaults.map(d=>({p:d.p.clone(),q:d.q.clone(),s:d.s.clone()})),bank=new Map(),byName=new Map(source.map(c=>[c.name,c]));
 const preContactPose=defaults.map(d=>({p:d.p.clone(),q:d.q.clone()}));
 const right=/^(clavicle_R|upperarm_R|forearm_R|hand_R)\./,left=/^(clavicle_L|upperarm_L|forearm_L|hand_L)\./;
 function clip(name){const c=byName.get(name)||all.find(c=>c.name===name);if(!c)throw new Error('Missing production animation: '+name);return c;}
 function action(name,mask='all'){
  const key=name+':'+mask;if(bank.has(key))return bank.get(key);
  const original=clip(name),tracks=original.tracks.filter(t=>mask==='right'?right.test(t.name):mask==='left'?left.test(t.name):mask==='body'?!left.test(t.name)&&!right.test(t.name):mask==='sword'?!left.test(t.name):true);
  const c=new T.AnimationClip(key,original.duration,tracks),a=mix.clipAction(c);
  a.setLoop(T.LoopOnce,1);a.clampWhenFinished=true;a.play();a.paused=true;a.setEffectiveWeight(0);bank.set(key,a);return a;
 }
 function sample(name,mask,at,weight){
  if(weight<=.000001)return;const a=action(name,mask);a.enabled=true;a.paused=true;a.time=clamp(at,0,clip(name).duration-.000001);a.setEffectiveWeight(weight);
 }
 const cycle=(name,t)=>((t%clip(name).duration)+clip(name).duration)%clip(name).duration;
 const originalWalk=all.find(c=>/^walk$/i.test(c.name))?.name,originalRun=all.find(c=>/^run$/i.test(c.name))?.name;
 if(!originalWalk||!originalRun)throw new Error('The production knight has no calibrated locomotion clips.');
 let lastState='',lastTime=0,clock=0,transitionFrom=null,transitionAge=1,combatBlend=0,guardBlend=0,landingAge=1;
 let carryClearance={left:0,right:0},transitionClearance={left:0,right:0};
 let lastSpeed=0,turnLean=0,clothLag=0,clothVelocity=0,clothYaw=0,clothYawVelocity=0,clothNormalAge=0;
 const rootQ=new T.Quaternion(),parentQ=new T.Quaternion(),deltaQ=new T.Quaternion(),axis=new T.Vector3(),localTravel=new T.Vector3(),flashColor=new T.Color();
 function offset(bone,x=0,y=0,z=0){
  if(!bone)return;actor.root.getWorldQuaternion(rootQ);
  for(const [a,v]of [['x',x],['y',y],['z',z]]){if(Math.abs(v)<.00001)continue;axis.set(a==='x'?1:0,a==='y'?1:0,a==='z'?1:0).applyQuaternion(rootQ);bone.parent.getWorldQuaternion(parentQ);axis.applyQuaternion(parentQ.invert());bone.quaternion.premultiply(deltaQ.setFromAxisAngle(axis,v));bone.updateWorldMatrix(false,true);}
 }
 function trajectory(name,time){
  const samples=clip(name).userData?.root_motion?.samples;if(!samples?.length)return {x:0,z:0};
  let i=0;while(i<samples.length-2&&samples[i+1][0]<time)i++;
  const a=samples[i],b=samples[Math.min(i+1,samples.length-1)],u=clamp((time-a[0])/Math.max(.000001,b[0]-a[0]),0,1);
  return {x:a[1]+(b[1]-a[1])*u,z:a[3]+(b[3]-a[3])*u};
 }
 function rootAt(profile,time){
  const s=actionSample(profile,time),m=profile?.animation;if(!s)return {x:0,z:0};
  const p=trajectory(s.clip,s.time),first=clip(m.clip).userData?.root_motion;
  if(m.recoveryClip&&s.clip===m.recoveryClip){const previous=trajectory(m.clip,m.clipDuration);p.x+=previous.x;p.z+=previous.z;}
  if(m.parts)for(const [name,duration]of m.parts){if(name===s.clip)break;const previous=trajectory(name,duration);p.x+=previous.x;p.z+=previous.z;}
  const displacement=first?.displacement||[0,0,0],recovery=m.recoveryClip?clip(m.recoveryClip).userData?.root_motion:null,path=(m.parts?m.parts.reduce((sum,[name])=>sum+(Number(clip(name).userData?.root_motion?.horizontal_path_m)||0),0):(Number(first?.horizontal_path_m)||Math.hypot(displacement[0],displacement[2]))+(Number(recovery?.horizontal_path_m)||0))||1,scale=(profile.lunge||0)/path;
  return {x:p.x*scale,z:p.z*scale};
 }
 // Returns motion only. navigation.js remains the sole owner of root X/Z.
 actor.actionRootDelta=(profile,from,to)=>{const a=rootAt(profile,from),b=rootAt(profile,to);return {x:b.x-a.x,z:b.z-a.z};};
 function animate(o={}){
  const dt=clamp(o.dt||0,0,.05),t=Number.isFinite(o.t)?o.t:clock,time=Math.max(0,o.time||0),state=o.state||'idle',speed=Math.max(0,o.speed||0);clock+=dt;
  const dead=!!o.dead||state==='dead',attacking=['light','heavy','attack'].includes(state),rolling=state==='roll'||state==='dodge',hurt=state==='hurt'||state==='stagger',healing=state==='heal';
  const changed=state!==lastState||time<lastTime-.05;
  if(changed){transitionFrom=preContactPose.map(d=>({p:d.p.clone(),q:d.q.clone()}));transitionClearance={...carryClearance};transitionAge=0;if(['roll','dodge'].includes(lastState)&&!rolling)landingAge=0;}
  transitionAge+=dt;landingAge+=dt;
  const gait=gaitDriver.update({dt,speed,moveX:o.moveX,moveZ:o.moveZ,enabled:!rolling&&!dead&&!attacking&&!hurt&&!healing});actor.gaitFrame=gait;actor.gaitPhase=gait.phase;
  combatBlend+=((o.combat||o.guarding?1:0)-combatBlend)*(1-Math.exp(-6*dt));
  guardBlend+=((o.guarding&&!attacking&&!dead&&!rolling?1:0)-guardBlend)*(1-Math.exp(-18*dt));
  actor.pivot.quaternion.identity();actor.pivot.position.y=.95;
  // Mixer may skip unchanged channels. Restore its previous pure source pose.
  for(let i=0;i<defaults.length;i++){const b=defaults[i].bone,p=sourcePose[i];b.position.copy(p.p);b.quaternion.copy(p.q);b.scale.copy(p.s);}
  for(const a of bank.values())a.setEffectiveWeight(0);
  const carry='Sword_Regular_A_Rec',carryTime=clip(carry).duration-.000001;
  let active=null,sourceWeight=0,current=carry,mask='sword';
  if(attacking){active=actionSample(o.attack,time);if(!active)throw new Error('A sword strike has no source motion schedule.');const recoveryBlend=active.clip==='Sword_Attack'?.28:.16;sourceWeight=1-smooth((time-(o.attack.total-recoveryBlend))/recoveryBlend);}
  else if(rolling){current='Armed_Roll';const duration=o.attack?.total||clip(current).duration;active={clip:current,time:time/duration*clip(current).duration};sourceWeight=1-smooth((time-(duration-.18))/.18);mask='all';}
  else if(dead){current='Death01';active={clip:current,time:Math.min(time,clip(current).duration)};sourceWeight=1;mask='all';}
  else if(hurt&&state!=='stagger'){current='Hit_Chest';active={clip:current,time:Math.min(time,clip(current).duration)};sourceWeight=1-smooth((time-.20)/.16);mask='sword';}
  const baseWeight=1-sourceWeight;
  if(baseWeight>.000001){
   const moving=speed>.12&&!dead&&!healing&&!hurt,run=moving?gait.runWeight:0;
   if(moving){sample(originalWalk,'body',gait.walkTime,baseWeight*(1-run));sample(originalRun,'body',gait.runTime,baseWeight*run);current=run>.5?originalRun:originalWalk;}
   else{sample(carry,'body',carryTime,baseWeight*(1-guardBlend));sample('Idle_Shield_Loop','body',cycle('Idle_Shield_Loop',t),baseWeight*guardBlend);}
   sample(carry,'right',carryTime,baseWeight*(1-guardBlend));sample('Sword_Block','right',.40,baseWeight*guardBlend);
  }
  if(active){current=active.clip;const previous=active.previous;sample(active.clip,mask,active.time,sourceWeight*(1-(previous?.weight||0)));if(previous)sample(previous.clip,mask,previous.time,sourceWeight*previous.weight);}
  // Shield arm follows the animated chest; a world-space hold would erase torque.
  if(mask!=='all'||sourceWeight<1){const weight=mask==='all'?baseWeight:1;sample(carry,'left',carryTime,weight*(1-guardBlend));sample('Idle_Shield_Loop','left',cycle('Idle_Shield_Loop',t),weight*guardBlend);}
  mix.update(0);
  for(let i=0;i<defaults.length;i++){const b=defaults[i].bone,p=sourcePose[i];p.p.copy(b.position);p.q.copy(b.quaternion);p.s.copy(b.scale);}
  actor.root.updateWorldMatrix(true,true);actor.root.getWorldQuaternion(rootQ);
  localTravel.set(Number(o.moveX)||0,0,Number(o.moveZ)||0).applyQuaternion(rootQ.clone().invert());
  if(speed>.12&&!attacking&&!rolling&&!hurt&&!dead&&!healing&&localTravel.lengthSq()>.04){
   const yaw=gait.directionYaw,hip=clamp(yaw,-.30,.30);offset(bones.hips,0,hip,0);offset(bones.chest,0,-hip*.45,0);offset(bones.leftThigh,0,yaw-hip,0);offset(bones.rightThigh,0,yaw-hip,0);
  }
  if(!attacking&&!rolling&&!dead&&!hurt&&!healing){
   const fatigue=1-clamp(Number.isFinite(o.staminaRatio)?o.staminaRatio:1,0,1),breath=Math.sin(t*(1.65+fatigue*.9)),still=1-clamp(speed/3.5,0,1);
   offset(bones.chest,breath*(.009+fatigue*.008)*still,0,Math.sin(t*.78)*.003*still);offset(bones.head,-breath*.005*still,clamp(Number(o.yawRate)||0,-3,3)*-.012,0);
   const acceleration=dt>0?clamp((speed-lastSpeed)/dt,-14,14):0;
   turnLean+=(clamp(Number(o.yawRate)||0,-5,5)*clamp(speed/5,0,1)*-.035-turnLean)*(1-Math.exp(-8*dt));
   const lean=clamp(acceleration*.006,-.065,.075),landing=(1-smooth(landingAge/.20))*.06;offset(bones.chest,lean+landing*.15,0,turnLean);offset(bones.head,-lean*.45,0,-turnLean*.45);
  }
  if(healing&&!dead){const focus=smooth(time/.24)*(1-smooth((time-1.0)/.25));offset(bones.head,.16*focus,0,0);offset(bones.chest,.095*focus,0,0);}
  if(state==='stagger'){const kneel=smooth(time/.22);offset(bones.chest,.38*kneel,0,-.08*kneel);offset(bones.head,.26*kneel,0,0);offset(bones.leftThigh,-.34*kneel,0,0);offset(bones.leftShin,.62*kneel,0,0);offset(bones.rightShin,.26*kneel,0,0);}
  if(state==='phase'){const power=smooth(time/.55);offset(bones.rightUpper,-.40*power,0,.18*power);offset(bones.chest,-.08*power,0,0);}
  if(actor.flaskMaterial)actor.flaskMaterial.emissiveIntensity=.04+(healing?Math.sin(Math.min(1,time/1.25)*Math.PI)**2*.8:0);
  const entryBlend=attacking&&active?.clip==='Sword_Attack'?.18:attacking?.11:.08;
  const entryWeight=transitionFrom?smooth(transitionAge/entryBlend):1;
  if(transitionFrom&&entryWeight<1){for(let i=0;i<defaults.length;i++){const b=defaults[i].bone,p=b.position.clone(),q=b.quaternion.clone();b.position.copy(transitionFrom[i].p).lerp(p,entryWeight);b.quaternion.copy(transitionFrom[i].q).slerp(q,entryWeight);}}
  // Blend poses before contacts. Reusing a pose that already contains an IK
  // correction here would apply that correction twice at every state handoff.
  for(let i=0;i<defaults.length;i++){preContactPose[i].p.copy(defaults[i].bone.position);preContactPose[i].q.copy(defaults[i].bone.quaternion);}
  const leftTarget=dead?0:rolling?baseWeight:1-guardBlend,rightTarget=dead?0:baseWeight*(1-guardBlend);
  carryClearance={left:transitionClearance.left+(leftTarget-transitionClearance.left)*entryWeight,right:transitionClearance.right+(rightTarget-transitionClearance.right)*entryWeight};
  if(rolling){
   const duration=o.attack?.total||clip(current).duration,u=clamp(time/duration,0,1);localTravel.copy(o.rollDir||{x:0,y:0,z:1});localTravel.y=0;
   if(localTravel.lengthSq()<.001)localTravel.set(0,0,1);localTravel.normalize().applyQuaternion(rootQ.clone().invert());
   const turn=smooth(u/.18)*(1-smooth((u-.82)/.18)),yaw=Math.atan2(localTravel.x,localTravel.z)*turn;
   actor.pivot.quaternion.setFromAxisAngle(new T.Vector3(0,1,0),yaw);
   actor.motionFrame={state,progress:u,tuck:Math.sin(Math.PI*u),angle:0,yaw,style:'source-armed-roll',source:current};
  }else actor.motionFrame={state,progress:0,tuck:0,angle:0,source:current};
  actor.root.updateWorldMatrix(true,true);
  constraints.carries({sourcePose:true,leftCarryAmount:carryClearance.left,rightCarryAmount:carryClearance.right,combat:combatBlend,guard:guardBlend,speed,phase:gait.phase,attacking,rolling,healing,hurt,dead,obstacles:o.obstacles});
  constraints.ground({rolling,dead,state,running:gait.runWeight>.5,contact:Math.max(gait.contacts.left,gait.contacts.right)});
  constraints.plantFeet?.({frame:gait,dt,speed,yawRate:o.yawRate,enabled:!rolling&&!dead&&!attacking&&!hurt&&!healing});
  const accel=dt>0?(speed-lastSpeed)/dt:0,target=clamp(speed*.038+clamp(accel,-14,14)*.009,0,.24);
  clothVelocity+=((target-clothLag)*64-clothVelocity*15)*dt;clothLag=clamp(clothLag+clothVelocity*dt,-.04,.27);
  const yawTarget=clamp(Number(o.yawRate)||0,-5,5)*-.025*clamp(speed/3,0,1);
  clothYawVelocity+=((yawTarget-clothYaw)*52-clothYawVelocity*13)*dt;clothYaw=clamp(clothYaw+clothYawVelocity*dt,-.16,.16);lastSpeed=speed;
  if(actor.cape){
   const p=actor.cape.geometry.attributes.position,rest=actor.cape.userData.restPositions,weights=actor.cape.userData.fallWeights,height=actor.cape.userData.height||1.43,width=actor.cape.userData.width||.78,top=height*.5;
   const tuck=rolling?smooth(time/.18)*(1-smooth((time/(o.attack?.total||1.4667)-.78)/.22))*.55:dead?smooth(time/.45)*.78:0;
   for(let i=0;i<p.count;i++){
    const at=i*3,x=rest[at],y=rest[at+1],fall=weights?weights[i]:clamp((top-y)/height,0,1),free=fall*fall,edge=Math.abs(x)/(width*.5);
    const gust=.65+.35*Math.sin(t*.68+.7),wind=(Math.sin(t*2+x*7-fall*3.6)*.018+Math.sin(t*3.7+x*13-fall*5.6)*.009)*free*gust;
    p.setXYZ(i,x*(1-tuck*.30*free)+clothYaw*free+wind*.7,y+(top-y)*tuck*.69*Math.min(1,fall*5)+wind*.25*edge,rest[at+2]*(1-tuck*.72*free)-free*clothLag*(1-tuck)+wind+Math.sin(x/width*Math.PI*5+t*2.3)*.010*free+clothYaw*x/width*fall);
   }
   p.needsUpdate=true;clothNormalAge+=dt;if(clothNormalAge>=1/24){actor.cape.geometry.computeVertexNormals();clothNormalAge=0;}
  }
  actor.motionDetails={combat:combatBlend,landing:Math.max(0,1-landingAge/.2),clothLag,clothYaw};
  actor.hit=Math.max(0,actor.hit-dt);for(const item of actor.materials){item.material.emissive.copy(item.baseEmissive);if(actor.hit>0)item.material.emissive.add(flashColor.setRGB(actor.hit*.75,actor.hit*.09,.005));}
  if(actor.shield)actor.shield.visible=true;
  actor.root.updateWorldMatrix(true,true);actor.updateEquipment();constraints.equipmentFloor({rolling});if(dead||state==='stagger')constraints.finalGround();constraints.cloth();constraints.contacts();
  lastState=state;lastTime=time;actor.currentClip=current;
 }
 return animate;
}
global.AshenMotion={createAnimator,actionSample};
})(typeof window!=='undefined'?window:globalThis);

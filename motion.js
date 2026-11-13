(function(global){
'use strict';
// State-driven layers over real skeletal animation, never rigid primitive limbs.
function createAnimator(actor,T){
  const mix=actor.mixer,bones=actor.rig,clips=actor.clips,actions={},defaults=[];
  actor.model.traverse(o=>{if(o.isBone)defaults.push({bone:o,p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone()});});
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),smooth=v=>{v=clamp(v,0,1);return v*v*(3-2*v);};
  const find=re=>clips.find(c=>re.test(c.name));
  const defs={idle:find(/idle|standing|breath/i),walk:find(/walk/i),run:find(/sprint|run/i)||find(/jog/i),attack:find(/attack|slash|strike/i),hit:find(/hit|hurt|damage/i),jump:find(/jump/i),kick:find(/kick/i)};
  for(const [key,clip]of Object.entries(defs))if(clip){const action=mix.clipAction(clip);action.enabled=true;action.clampWhenFinished=true;action.setLoop(T.LoopRepeat,Infinity);action.play();action.setEffectiveWeight(0);actions[key]=action;}
  let lastState='',lastTime=0,clock=0,locomotion=0,clothVelocity=0,lastSpeed=0;
  const axis=new T.Vector3(),parentQ=new T.Quaternion(),worldQ=new T.Quaternion(),deltaQ=new T.Quaternion(),rootQ=new T.Quaternion(),flashColor=new T.Color(),bonePoint=new T.Vector3(),childPoint=new T.Vector3(),currentDirection=new T.Vector3(),wantedDirection=new T.Vector3(),aimDelta=new T.Quaternion(),parentInverse=new T.Quaternion(),localDelta=new T.Quaternion(),swordQuaternion=new T.Quaternion();
  function offset(bone,x=0,y=0,z=0){
    if(!bone)return;
    actor.root.getWorldQuaternion(rootQ);
    for(const [axisName,angle]of [['x',x],['y',y],['z',z]]){if(Math.abs(angle)<.00001)continue;axis.set(axisName==='x'?1:0,axisName==='y'?1:0,axisName==='z'?1:0).applyQuaternion(rootQ);bone.parent.getWorldQuaternion(parentQ);axis.applyQuaternion(parentQ.invert());deltaQ.setFromAxisAngle(axis,angle);bone.quaternion.premultiply(deltaQ);bone.updateWorldMatrix(false,true);}
  }
  function aim(bone,child,direction,strength=1){
    if(!bone||!child)return;bone.getWorldPosition(bonePoint);child.getWorldPosition(childPoint);currentDirection.copy(childPoint).sub(bonePoint).normalize();actor.root.getWorldQuaternion(rootQ);wantedDirection.set(...direction).normalize().applyQuaternion(rootQ);aimDelta.setFromUnitVectors(currentDirection,wantedDirection);if(strength<1)aimDelta.slerp(new T.Quaternion(),1-strength);bone.parent.getWorldQuaternion(parentQ);parentInverse.copy(parentQ).invert();localDelta.copy(parentInverse).multiply(aimDelta).multiply(parentQ);bone.quaternion.premultiply(localDelta);bone.updateWorldMatrix(false,true);
  }
  function orientWrist(direction){
    const hand=bones.rightHand,grip=actor.weapon.grip;if(!hand||!grip)return;actor.root.getWorldQuaternion(rootQ);hand.getWorldQuaternion(worldQ);swordQuaternion.copy(rootQ).invert().multiply(worldQ).multiply(grip.bindInverse).multiply(grip.orientation);currentDirection.set(0,-1,0).applyQuaternion(swordQuaternion).normalize();wantedDirection.set(...direction).normalize();aimDelta.setFromUnitVectors(currentDirection,wantedDirection);aimDelta.premultiply(rootQ).multiply(rootQ.clone().invert());hand.parent.getWorldQuaternion(parentQ);parentInverse.copy(parentQ).invert();localDelta.copy(parentInverse).multiply(aimDelta).multiply(parentQ);hand.quaternion.premultiply(localDelta);hand.updateWorldMatrix(false,true);
  }
  function authoredSword(time,a,o){
    const side=actor.anatomyRightSign||-1,index=a.profile.index??a.profile.combo??o.comboIndex??0,flip=index%2===1?-1:1,wind=a.wind,active=a.active,end=a.duration;
    const ready={u:[side*.24,-.94,.24],f:[side*.06,-.54,.84],s:[side*.06,-.48,.88],x:0,y:0};
    const anticipate=a.heavy?{u:[side*.24,.72,.65],f:[-side*.18,.93,-.31],s:[0,.91,-.42],x:-.11,y:-.18}:{u:[side*.77,-.04,-.64],f:[-side*.14,.40,-.90],s:[side*.50*flip,.48,-.72],x:-.03,y:-.52*flip};
    const contact=a.heavy?{u:[side*.16,-.42,.89],f:[-side*.06,-.50,.86],s:[0,-.40,.92],x:.22,y:.13}:{u:[-side*.20,-.34,.92],f:[-side*.54,-.10,.84],s:[0,-.16,.99],x:.09,y:.60*flip};
    const follow=a.heavy?{u:[side*.15,-.87,.46],f:[-side*.08,-.74,.67],s:[.05,-.77,.64],x:.16,y:.16}:{u:[-side*.75,-.28,.59],f:[-side*.72,-.52,-.05],s:[-side*.96*flip,-.20,-.20],x:.07,y:.81*flip};
    let frames=[[0,ready],[wind*.62,anticipate],[wind*.83,anticipate],[wind+.01,contact],[wind+active*.78,follow],[wind+active+a.followThrough,follow],[end,ready]];
    if(a.profile.type==='thrust'){
      const chamber={u:[side*.35,-.87,-.35],f:[-side*.10,.12,.98],s:[0,0,1],x:-.045,y:-.38},extend={u:[-side*.12,-.42,.90],f:[0,-.26,.97],s:[0,-.20,.98],x:.15,y:.18};
      frames=[[0,ready],[wind*.7,chamber],[wind*.87,chamber],[wind+.01,extend],[wind+active,extend],[wind+active+a.followThrough,extend],[end,ready]];
    }else if(a.profile.type==='combo'){
      const reverseWind={u:[-side*.62,-.12,.45],f:[-side*.50,.35,-.79],s:[-side*.8,.24,-.55],x:-.02,y:.60},reverseContact={u:[-side*.12,-.34,.92],f:[-side*.12,-.10,.99],s:[-side*.20,-.16,.98],x:.09,y:-.60},reverseFollow={u:[side*.66,-.32,.68],f:[side*.70,-.50,-.05],s:[side*.96,-.20,-.20],x:.07,y:-.81};
      frames=[[0,ready],[wind*.62,anticipate],[wind*.83,anticipate],[wind+.01,contact],[wind+.20,follow],[wind+.40,reverseWind],[wind+.54,reverseContact],[wind+.76,reverseFollow],[wind+active+a.followThrough,reverseFollow],[end,ready]];
    }
    let lo=frames[0],hi=frames[frames.length-1];for(let i=0;i<frames.length-1;i++)if(time>=frames[i][0]&&time<=frames[i+1][0]){lo=frames[i];hi=frames[i+1];break;}
    let u=smooth((time-lo[0])/Math.max(.001,hi[0]-lo[0]));if(time>=end)u=1;
    const vector=key=>lo[1][key].map((n,i)=>n+(hi[1][key][i]-n)*u),pitch=lo[1].x+(hi[1].x-lo[1].x)*u,yaw=lo[1].y+(hi[1].y-lo[1].y)*u;
    offset(bones.chest||bones.spine,pitch,yaw,0);aim(bones.rightUpper,bones.rightFore,vector('u'));aim(bones.rightFore,bones.rightHand,vector('f'));orientWrist(vector('s'));
    // The free arm counters torque; the hips absorb contact while authored source
    // foot poses remain the base, avoiding a rigid torso-only sword wave.
    aim(bones.leftUpper,bones.leftFore,[-side*.45,-.70,.55],.8);aim(bones.leftFore,bones.leftHand,[side*.10,-.28,.95],.8);
    const plant=Math.sin(Math.PI*clamp(time/end,0,1));offset(bones.leftThigh,-.07*plant,0,-.035*plant);offset(bones.leftShin,.10*plant,0,0);offset(bones.rightThigh,.06*plant,0,.025*plant);offset(bones.rightShin,.08*plant,0,0);
  }
  function sampleAttack(time,o){
    const boss=actor.isBoss,a=o.attack||{},heavy=o.state==='heavy'||a.kind==='heavy'||a.type==='slam'||/overhead|cleave|slam/.test(a.pose||''),wind=a.windup??(heavy?.49:.22),active=a.active??(heavy?.27:.22),followThrough=a.followThrough??0,recovery=a.recovery??(heavy?.48:.30),duration=a.total||wind+active+followThrough+recovery;
    // Source motion's contact is retimed to the controller's hit window. Anticipation
    // is held while the strike remains fast, rather than slowing the whole action.
    const contact=.45;
    let u=time<wind?clamp(time/wind,0,1)*contact:contact+clamp((time-wind)/(duration-wind),0,1)*(1-contact);
    return {u,wind,active,followThrough,recovery,duration,heavy,boss,profile:a};
  }
  function animate(o={}){
    const dt=clamp(o.dt||0,0,.05),t=Number.isFinite(o.t)?o.t:clock,time=Math.max(0,o.time||0),state=o.state||'idle',speed=Math.max(0,o.speed||0),dead=!!o.dead||state==='dead';clock+=dt;
    const attacking=state==='light'||state==='heavy'||state==='attack',hurt=state==='hurt'||state==='stagger',rolling=state==='roll'||state==='dodge',healing=state==='heal';
    const newAction=state!==lastState||time<lastTime-.05;
    // Reset unkeyed bones too, so additive guard and recoil never accumulate.
    for(const d of defaults){d.bone.position.copy(d.p);d.bone.quaternion.copy(d.q);d.bone.scale.copy(d.s);}
    const desired={idle:0,walk:0,run:0,attack:0,hit:0,jump:0,kick:0};
    const a=sampleAttack(time,o);
    if(attacking&&actions.attack&&actor.useSourceAttack){desired.attack=1;if(newAction)actions.attack.reset();actions.attack.paused=true;actions.attack.time=a.u*defs.attack.duration;}
    else if(hurt&&actions.hit){desired.hit=1;if(newAction)actions.hit.reset();actions.hit.paused=true;actions.hit.time=Math.min(time*1.1,defs.hit.duration*.98);}
    else if(state==='kick'&&actions.kick){desired.kick=1;if(newAction)actions.kick.reset();actions.kick.paused=true;actions.kick.time=Math.min(time,defs.kick.duration*.98);}
    else if(state==='jump'&&actions.jump){desired.jump=1;if(newAction)actions.jump.reset();actions.jump.paused=true;actions.jump.time=Math.min(time,defs.jump.duration*.98);}
    else if(rolling){desired.idle=1;}
    else if(speed>.12&&!dead&&!healing&&!hurt){const run=clamp((speed-2.3)/1.5,0,1);if(actions.walk)desired.walk=1-run;if(actions.run)desired.run=run;else desired.walk=1;}
    else desired.idle=1;
    if(!actions.idle){const k=Object.keys(actions)[0];if(k&&Object.values(desired).every(v=>v===0))desired[k]=1;}
    let sum=0;
    for(const [k,action]of Object.entries(actions)){const target=desired[k]||0,current=action.getEffectiveWeight(),weight=current+(target-current)*(1-Math.exp(-(attacking||hurt?35:10)*dt));action.enabled=true;action.setEffectiveWeight(weight);sum+=weight;if(k==='walk'){action.paused=false;action.setEffectiveTimeScale(clamp(speed/1.9,.5,1.65));}else if(k==='run'){action.paused=false;action.setEffectiveTimeScale(clamp(speed/4.5,.65,1.5));}else if(k==='idle'){action.paused=false;action.setEffectiveTimeScale(.85);}}
    if(sum>.0001)for(const action of Object.values(actions))action.setEffectiveWeight(action.getEffectiveWeight()/sum);
    mix.update(dt);
    actor.root.updateWorldMatrix(true,true);
    const spine=bones.spine,chest=bones.chest||spine;
    if(!attacking&&!rolling&&!dead){
      const side=actor.anatomyRightSign||-1;aim(bones.rightUpper,bones.rightFore,[side*.24,-.94,.24],.85);aim(bones.rightFore,bones.rightHand,[side*.06,-.54,.84],.9);orientWrist([side*.06,-.48,.88]);
    }
    if(o.guarding&&!attacking&&!dead&&!rolling){offset(bones.leftUpper,-.85,-.18,-.20);offset(bones.leftFore,-.90,0,0);offset(chest,.06,-.14,.035);offset(bones.rightUpper,-.15,.10,0);}
    if(healing&&!dead){const raise=smooth(time/.24)*(1-smooth((time-1.0)/.20));offset(bones.leftUpper,-1.38*raise,.28*raise,-.17*raise);offset(bones.leftFore,-1.0*raise,0,0);offset(bones.head,.13*raise,0,0);offset(chest,.035*raise,0,0);}
    if(attacking){
      if(!actor.useSourceAttack)authoredSword(time,a,o);
      const charge=smooth(time/a.wind),release=smooth((time-a.wind)/Math.max(.16,a.active)),recover=1-smooth((time-a.wind-a.active)/Math.max(.2,a.recovery));
      if(a.heavy&&actor.useSourceAttack){offset(chest,(-.12*charge+.30*release)*recover,-.18*charge*recover,0);offset(bones.rightUpper,-.36*charge*(1-release),-.12*recover,0);offset(bones.leftUpper,-.34*charge*(1-release),.10*recover,-.08*recover);}
      else if(actor.useSourceAttack&&(o.comboIndex===1||o.attack&&o.attack.mirrored)){offset(chest,0,.36*(charge-2*release)*recover,0);offset(bones.rightUpper,0,-.25*recover,.15*recover);}
      // The head follows the opponent while the chest twists through the strike.
      offset(bones.head,0,.10*(1-release)*recover,0);
    }
    if(hurt){const recoil=(1-smooth(time/(state==='stagger'?1.15:.46)));offset(chest,-.20*recoil,0,.08*recoil);offset(bones.head,.16*recoil,0,0);offset(bones.rightUpper,.16*recoil,0,0);}
    if(state==='stagger'){const kneel=smooth(time/.22);offset(chest,.38*kneel,0,-.08*kneel);offset(bones.head,.26*kneel,0,0);offset(bones.leftThigh,-.34*kneel,0,0);offset(bones.leftShin,.62*kneel,0,0);offset(bones.rightShin,.26*kneel,0,0);}
    if(state==='phase'){const power=smooth(time/.55);offset(bones.rightUpper,-1.0*power,0,.35*power);offset(bones.leftUpper,-.40*power,0,-.30*power);offset(chest,-.08*power,0,0);offset(bones.head,-.13*power,0,0);}
    if(lastState==='roll'&&!rolling)actor.pivot.rotation.x=0;
    let pivotY=state==='stagger'?.79:.95,pivotX=0,pivotZ=0;
    if(rolling){const u=clamp(time/.64,0,1);pivotX=-Math.PI*2*smooth(u);pivotY=.67+Math.sin(u*Math.PI)*.16;offset(bones.spine,.45,0,0);offset(bones.leftThigh,-1.1,0,0);offset(bones.rightThigh,-1.1,0,0);offset(bones.leftShin,1.6,0,0);offset(bones.rightShin,1.6,0,0);offset(bones.leftUpper,-1.0,0,0);offset(bones.rightUpper,-1.0,0,0);}
    if(dead){const fall=smooth(time/1.05);pivotY=.95-.64*fall;pivotZ=(actor.isBoss?-1:1)*1.49*fall;offset(chest,-.10*fall,0,0);}
    if(rolling)actor.pivot.rotation.x=pivotX;else actor.pivot.rotation.x+=(pivotX-actor.pivot.rotation.x)*(1-Math.exp(-16*dt));
    actor.pivot.rotation.z+=(pivotZ-actor.pivot.rotation.z)*(1-Math.exp(-7*dt));actor.pivot.position.y+=(pivotY-actor.pivot.position.y)*(1-Math.exp(-18*dt));
    const accel=dt>0?(speed-lastSpeed)/dt:0;clothVelocity+=(clamp(accel,-15,15)*.012-clothVelocity*5)*dt;lastSpeed=speed;
    if(actor.cape){const p=actor.cape.geometry.attributes.position,rest=actor.cape.userData.restPositions;for(let i=0;i<p.count;i++){const at=i*3,x=rest[at],y=rest[at+1],fall=clamp((.64-y)/1.3,0,1);p.setXYZ(i,x+Math.sin(t*2.4+fall*3.2)*.016*fall,y,rest[at+2]-fall*fall*(speed*.035+clothVelocity)+Math.sin(t*3.1+x*7-fall*4)*.022*fall);}p.needsUpdate=true;if(actor._clothFrame++%3===0)actor.cape.geometry.computeVertexNormals();}
    actor.hit=Math.max(0,actor.hit-dt);for(const item of actor.materials){const base=item.baseEmissive;item.material.emissive.copy(base);if(actor.hit>0)item.material.emissive.add(flashColor.setRGB(actor.hit*.75,actor.hit*.09,.005));}
    if(actor.shield)actor.shield.visible=!healing&&!dead;
    actor.root.updateWorldMatrix(true,true);actor.updateEquipment();
    lastState=state;lastTime=time;actor.currentClip=attacking&&!actor.useSourceAttack?'authored-sword-'+state:Object.entries(desired).sort((a,b)=>b[1]-a[1])[0][0];
  }
  return animate;
}
global.AshenMotion={createAnimator};
})(typeof window!=='undefined'?window:globalThis);

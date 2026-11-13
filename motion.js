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
  if(!global.AshenLocomotion||!global.AshenRigConstraints)throw new Error('Load locomotion.js and rig-constraints.js before creating a character.');
  const gaitDriver=global.AshenLocomotion.create(actor,T),constraints=global.AshenRigConstraints.create(actor,T);
  let transitionAge=1,transitionFrom=null;
  let lastState='',lastTime=0,clock=0,clothVelocity=0,lastSpeed=0,guardBlend=0,turnLean=0,combatBlend=0,landingAge=1;
  let clothLag=0,clothYaw=0,clothYawVelocity=0,clothNormalAge=0;
  const previousPivot=new T.Quaternion(),posePivot=new T.Quaternion(),rollAxis=new T.Vector3(),localTravel=new T.Vector3(),identity=new T.Quaternion();
  const axis=new T.Vector3(),parentQ=new T.Quaternion(),worldQ=new T.Quaternion(),deltaQ=new T.Quaternion(),rootQ=new T.Quaternion(),flashColor=new T.Color(),bonePoint=new T.Vector3(),childPoint=new T.Vector3(),currentDirection=new T.Vector3(),wantedDirection=new T.Vector3(),aimDelta=new T.Quaternion(),parentInverse=new T.Quaternion(),localDelta=new T.Quaternion(),swordQuaternion=new T.Quaternion();
  function offset(bone,x=0,y=0,z=0){
    if(!bone)return;
    actor.root.getWorldQuaternion(rootQ);
    for(const [axisName,angle]of [['x',x],['y',y],['z',z]]){if(Math.abs(angle)<.00001)continue;axis.set(axisName==='x'?1:0,axisName==='y'?1:0,axisName==='z'?1:0).applyQuaternion(rootQ);bone.parent.getWorldQuaternion(parentQ);axis.applyQuaternion(parentQ.invert());deltaQ.setFromAxisAngle(axis,angle);bone.quaternion.premultiply(deltaQ);bone.updateWorldMatrix(false,true);}
  }
  function aim(bone,child,direction,strength=1){
    if(!bone||!child)return;bone.getWorldPosition(bonePoint);child.getWorldPosition(childPoint);currentDirection.copy(childPoint).sub(bonePoint).normalize();actor.root.getWorldQuaternion(rootQ);wantedDirection.set(...direction).normalize().applyQuaternion(rootQ);aimDelta.setFromUnitVectors(currentDirection,wantedDirection);if(strength<1)aimDelta.slerp(new T.Quaternion(),1-strength);bone.parent.getWorldQuaternion(parentQ);parentInverse.copy(parentQ).invert();localDelta.copy(parentInverse).multiply(aimDelta).multiply(parentQ);bone.quaternion.premultiply(localDelta);bone.updateWorldMatrix(false,true);
  }
  function orientWrist(direction,strength=1){
    const hand=bones.rightHand,grip=actor.weapon.grip;if(!hand||!grip)return;actor.root.getWorldQuaternion(rootQ);hand.getWorldQuaternion(worldQ);swordQuaternion.copy(rootQ).invert().multiply(worldQ).multiply(grip.bindInverse).multiply(grip.orientation);currentDirection.set(0,-1,0).applyQuaternion(swordQuaternion).normalize();wantedDirection.set(...direction).normalize();aimDelta.setFromUnitVectors(currentDirection,wantedDirection);if(strength<1)aimDelta.slerp(identity,1-strength);aimDelta.premultiply(rootQ).multiply(rootQ.clone().invert());hand.parent.getWorldQuaternion(parentQ);parentInverse.copy(parentQ).invert();localDelta.copy(parentInverse).multiply(aimDelta).multiply(parentQ);hand.quaternion.premultiply(localDelta);hand.updateWorldMatrix(false,true);
  }
  function authoredSword(time,a,o){
    const side=actor.anatomyRightSign||-1,index=a.profile.index??a.profile.combo??o.comboIndex??0,flip=index%2===1?-1:1,wind=a.wind,active=a.active,end=a.duration;
    const ready=constraints.readyRight({combat:combatBlend,speed:o.speed,phase:actor.gaitPhase});
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
    const plant=Math.sin(Math.PI*clamp(time/end,0,1)),coil=smooth(time/Math.max(.05,wind*.72))*(1-smooth((time-wind)/Math.max(.07,active))),drive=smooth((time-wind)/Math.max(.07,active))*(1-smooth((time-wind-active-a.followThrough)/Math.max(.08,a.recovery)));
    // The hips load before the shoulders, then the opposite leg catches the
    // weight. The controller still owns all translation and blade hit timing.
    offset(bones.hips,-.025*coil+.025*drive,-yaw*.14,0);
    offset(bones.leftThigh,-.07*plant-.055*coil+.045*drive,0,-.035*plant);offset(bones.leftShin,.10*plant+.09*coil,0,0);
    offset(bones.rightThigh,.06*plant+.045*coil-.055*drive,0,.025*plant);offset(bones.rightShin,.08*plant+.07*drive,0,0);
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
    if(newAction&&(lastState==='roll'||lastState==='dodge')&&!rolling)landingAge=0;
    if(newAction){transitionFrom=defaults.map(d=>d.bone.quaternion.clone());transitionAge=0;}transitionAge+=dt;
    landingAge+=dt;
    const gaitFrame=gaitDriver.update({dt,speed,moveX:o.moveX,moveZ:o.moveZ,enabled:!rolling&&!dead&&!attacking&&!hurt&&!healing});actor.gaitFrame=gaitFrame;
    combatBlend+=((o.combat||o.guarding?1:0)-combatBlend)*(1-Math.exp(-6*dt));
    // Author all skeletal directions in an unrolled frame. Reusing last frame's
    // pivot here made the limbs fight the tumble and the sockets orbit the body.
    previousPivot.copy(actor.pivot.quaternion);const previousHeight=actor.pivot.position.y;
    actor.pivot.quaternion.identity();actor.pivot.position.y=.95;
    // Reset unkeyed bones too, so additive guard and recoil never accumulate.
    for(const d of defaults){d.bone.position.copy(d.p);d.bone.quaternion.copy(d.q);d.bone.scale.copy(d.s);}
    const desired={idle:0,walk:0,run:0,attack:0,hit:0,jump:0,kick:0};
    const a=sampleAttack(time,o);
    if(attacking&&actions.attack&&actor.useSourceAttack){desired.attack=1;if(newAction)actions.attack.reset();actions.attack.paused=true;actions.attack.time=a.u*defs.attack.duration;}
    else if(hurt&&actions.hit){desired.hit=1;if(newAction)actions.hit.reset();actions.hit.paused=true;actions.hit.time=Math.min(time*1.1,defs.hit.duration*.98);}
    else if(state==='kick'&&actions.kick){desired.kick=1;if(newAction)actions.kick.reset();actions.kick.paused=true;actions.kick.time=Math.min(time,defs.kick.duration*.98);}
    else if(state==='jump'&&actions.jump){desired.jump=1;if(newAction)actions.jump.reset();actions.jump.paused=true;actions.jump.time=Math.min(time,defs.jump.duration*.98);}
    else if(rolling){desired.idle=1;}
    else if(speed>.12&&!dead&&!healing&&!hurt){const run=gaitFrame.runWeight;if(actions.walk)desired.walk=1-run;if(actions.run)desired.run=run;else desired.walk=1;}
    else desired.idle=1;
    if(!actions.idle){const k=Object.keys(actions)[0];if(k&&Object.values(desired).every(v=>v===0))desired[k]=1;}
    let sum=0;
    actor.root.getWorldQuaternion(rootQ);localTravel.set(Number(o.moveX)||0,0,Number(o.moveZ)||0).applyQuaternion(rootQ.clone().invert());
    const gaitPhase=gaitFrame.phase;actor.gaitPhase=gaitPhase;
    for(const [k,action]of Object.entries(actions)){const target=desired[k]||0,current=action.getEffectiveWeight(),weight=current+(target-current)*(1-Math.exp(-(attacking||hurt?35:10)*dt));action.enabled=true;action.setEffectiveWeight(weight);sum+=weight;if(k==='walk'||k==='run'){action.paused=true;action.time=k==='walk'?gaitFrame.walkTime:gaitFrame.runTime;}else if(k==='idle'){action.paused=false;action.setEffectiveTimeScale(.85);}}
    if(sum>.0001)for(const action of Object.values(actions))action.setEffectiveWeight(action.getEffectiveWeight()/sum);
    mix.update(dt);
    actor.root.updateWorldMatrix(true,true);
    const spine=bones.spine,chest=bones.chest||spine;
    if(speed>.12&&!attacking&&!rolling&&!hurt&&!dead&&!healing&&localTravel.lengthSq()>.04){const strideYaw=gaitFrame.directionYaw;offset(bones.hips,0,strideYaw,0);offset(chest,0,-strideYaw*.85,0);}
    if(!attacking&&!rolling&&!dead){
      if(!hurt&&!healing){
        const fatigue=1-clamp(Number.isFinite(o.staminaRatio)?o.staminaRatio:1,0,1),breath=Math.sin(t*(1.65+fatigue*.9)),still=1-clamp(speed/3.5,0,1);
        offset(chest,breath*(.009+fatigue*.008)*still,0,Math.sin(t*.78)*.003*still);
        offset(bones.head,-breath*.005*still,clamp(Number(o.yawRate)||0,-3,3)*-.012,0);
      }
    }
    guardBlend+=((o.guarding&&!attacking&&!dead&&!rolling?1:0)-guardBlend)*(1-Math.exp(-18*dt));
    if(guardBlend>.002&&!attacking&&!dead&&!rolling){const side=actor.anatomyRightSign||-1;offset(chest,.08*guardBlend,-.12*guardBlend,.025*guardBlend);offset(bones.leftThigh,-.12*guardBlend,0,0);offset(bones.leftShin,.18*guardBlend,0,0);offset(bones.rightShin,.12*guardBlend,0,0);}
    if(healing&&!dead){const focus=smooth(time/.24)*(1-smooth((time-1.0)/.25));offset(bones.head,.16*focus,0,0);offset(chest,.095*focus,0,0);offset(bones.leftThigh,-.09*focus,0,0);offset(bones.rightThigh,-.07*focus,0,0);offset(bones.leftShin,.13*focus,0,0);offset(bones.rightShin,.11*focus,0,0);}
    if(actor.flaskMaterial)actor.flaskMaterial.emissiveIntensity=.04+(healing?Math.sin(Math.min(1,time/1.25)*Math.PI)**2*.8:0);
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
    if(transitionFrom&&transitionAge<.10){const blend=smooth(transitionAge/.10);for(let i=0;i<defaults.length;i++){const bone=defaults[i].bone,q=bone.quaternion.clone();bone.quaternion.copy(transitionFrom[i]).slerp(q,blend);}actor.root.updateWorldMatrix(true,true);}
    constraints?.carries({combat:combatBlend,guard:guardBlend,speed,phase:gaitPhase,attacking,rolling,healing,hurt,dead,obstacles:o.obstacles});
    let pivotY=state==='stagger'?.79:.95;posePivot.identity();
    if(rolling){
      const duration=Math.max(.2,o.attack?.total||.62),u=clamp(time/duration,0,1),launch=smooth(u/.18),unfold=smooth((u-.69)/.31),tuck=launch*(1-unfold);
      localTravel.copy(o.rollDir||{x:0,y:0,z:1});localTravel.y=0;
      if(localTravel.lengthSq()<.001)localTravel.set(0,0,1);localTravel.normalize().applyQuaternion(rootQ.clone().invert());
      const dx=localTravel.x,dz=localTravel.z;rollAxis.set(dz,0,-dx).normalize();
      // Compression precedes rotation; feet unfold before the final plant.
      // The quaternion's full turn is identity, so recovery takes the short arc.
      const spin=smooth((u-.08)/.81),angle=Math.PI*2*spin;posePivot.setFromAxisAngle(rollAxis,angle);
      pivotY=.95-.39*tuck+.045*Math.sin(u*Math.PI);
      offset(chest,.43*dz*tuck,0,-.43*dx*tuck);offset(bones.head,.25*dz*tuck,0,-.25*dx*tuck);
      const side=actor.anatomyRightSign||-1;
      for(const [upper,lower,foot,sign]of [[bones.leftThigh,bones.leftShin,bones.leftFoot,-side],[bones.rightThigh,bones.rightShin,bones.rightFoot,side]]){
        aim(upper,lower,[dx*.78+sign*.14,.51,dz*.78],tuck);
        aim(lower,foot,[-dx*.73,-.68,-dz*.73],tuck);
      }
      aim(bones.leftUpper,bones.leftFore,[dx*.67-side*.20,-.40,dz*.67],tuck);aim(bones.leftFore,bones.leftHand,[dx*.42+side*.30,-.57,dz*.42],tuck);
      aim(bones.rightUpper,bones.rightFore,[dx*.68+side*.17,-.43,dz*.68],tuck);aim(bones.rightFore,bones.rightHand,[dx*.38-side*.30,-.55,dz*.38],tuck);
      // Keep the blade across the tumble's horizontal axis instead of driving
      // its tip through the floor as the head passes underneath the hips.
      orientWrist([rollAxis.x*side,0,rollAxis.z*side],tuck);
      constraints?.tuck(tuck,rollAxis);
      actor.motionFrame={state,progress:u,tuck,angle,axis:{x:rollAxis.x,y:rollAxis.y,z:rollAxis.z}};
    }else{
      const acceleration=dt>0?clamp((speed-lastSpeed)/dt,-14,14):0;
      turnLean+=(clamp(Number(o.yawRate)||0,-5,5)*clamp(speed/5,0,1)*-.035-turnLean)*(1-Math.exp(-8*dt));
      if(!attacking&&!hurt&&!dead&&!healing){const lean=clamp(acceleration*.006,-.065,.075),brake=clamp(-acceleration/14,0,1),landing=(1-smooth(landingAge/.20))*.10;offset(chest,lean+landing*.15,0,turnLean);offset(bones.head,-lean*.45,0,-turnLean*.45);offset(bones.leftThigh,-landing-brake*.045,0,0);offset(bones.rightThigh,-landing-brake*.035,0,0);offset(bones.leftShin,landing*1.8+brake*.065,0,0);offset(bones.rightShin,landing*1.6+brake*.055,0,0);}
      if(dead){const fall=smooth(time/1.05),side=actor.anatomyRightSign||-1;pivotY=.95-.61*fall;posePivot.setFromAxisAngle(new T.Vector3(0,0,1),(actor.isBoss?-1:1)*1.49*fall);offset(chest,.12*fall,0,0);offset(bones.head,.20*fall,0,0);
        aim(bones.leftUpper,bones.leftFore,[-side*.18,-.97,.12],fall);aim(bones.leftFore,bones.leftHand,[-side*.04,-.94,.32],fall);aim(bones.rightUpper,bones.rightFore,[side*.16,-.97,.18],fall);aim(bones.rightFore,bones.rightHand,[side*.04,-.94,.30],fall);
        offset(bones.leftThigh,-.18*fall,0,0);offset(bones.leftShin,.34*fall,0,0);offset(bones.rightThigh,-.28*fall,0,0);offset(bones.rightShin,.48*fall,0,0);
      }
      else posePivot.copy(previousPivot).slerp(identity,1-Math.exp(-20*dt));
      actor.motionFrame={state,progress:0,tuck:0,angle:0};
    }
    actor.pivot.quaternion.copy(posePivot);actor.pivot.position.y=rolling||dead?pivotY:previousHeight+(pivotY-previousHeight)*(1-Math.exp(-18*dt));
    // Ground the weighted silhouette, rather than a bind-pose box. This is
    // visual-only; gameplay root X/Z and collision remain controller-owned.
    constraints.ground({rolling,dead,state,running:gaitFrame.runWeight>.5,contact:Math.max(gaitFrame.contacts.left,gaitFrame.contacts.right)});
    const accel=dt>0?(speed-lastSpeed)/dt:0;
    // Damped cloth follows a start, brake and turn with a slight delay; it never
    // changes the body's root. Pinning the shoulder row prevents rubber cloth.
    const clothTarget=clamp(speed*.038+clamp(accel,-14,14)*.009,0,.24);
    clothVelocity+=((clothTarget-clothLag)*64-clothVelocity*15)*dt;clothLag=clamp(clothLag+clothVelocity*dt,-.04,.27);
    const yawTarget=clamp(Number(o.yawRate)||0,-5,5)*-.025*clamp(speed/3,0,1);
    clothYawVelocity+=((yawTarget-clothYaw)*52-clothYawVelocity*13)*dt;clothYaw=clamp(clothYaw+clothYawVelocity*dt,-.16,.16);lastSpeed=speed;
    if(actor.cape){
      const p=actor.cape.geometry.attributes.position,rest=actor.cape.userData.restPositions,weights=actor.cape.userData.fallWeights,height=actor.cape.userData.height||1.43,width=actor.cape.userData.width||.78,top=height*.5;
      const tuck=rolling?actor.motionFrame.tuck:dead?smooth(time/.45)*.86:0;
      for(let i=0;i<p.count;i++){
        const at=i*3,x=rest[at],y=rest[at+1],fall=weights?weights[i]:clamp((top-y)/height,0,1),free=fall*fall,edge=Math.abs(x)/(width*.5);
        const gust=.65+.35*Math.sin(t*.68+.7),wind=(Math.sin(t*2.0+x*7-fall*3.6)*.018+Math.sin(t*3.7+x*13-fall*5.6)*.009)*free*gust;
        p.setXYZ(i,x*(1-tuck*.30*free)+clothYaw*free+wind*.7,y+(top-y)*tuck*.69*Math.min(1,fall*5)+wind*.25*edge,rest[at+2]*(1-tuck*.72*free)-free*clothLag*(1-tuck)+wind+Math.sin(x/width*Math.PI*5+t*2.3)*.010*free+clothYaw*x/width*fall);
      }
      p.needsUpdate=true;clothNormalAge+=dt;if(clothNormalAge>=1/24){actor.cape.geometry.computeVertexNormals();clothNormalAge=0;}
    }
    actor.motionDetails={combat:combatBlend,landing:Math.max(0,1-landingAge/.2),clothLag,clothYaw};
    actor.hit=Math.max(0,actor.hit-dt);for(const item of actor.materials){const base=item.baseEmissive;item.material.emissive.copy(base);if(actor.hit>0)item.material.emissive.add(flashColor.setRGB(actor.hit*.75,actor.hit*.09,.005));}
    if(actor.shield)actor.shield.visible=true;
    actor.root.updateWorldMatrix(true,true);actor.updateEquipment();constraints?.equipmentFloor({rolling});if(rolling||dead||state==='stagger')constraints?.finalGround();constraints?.cloth();
    lastState=state;lastTime=time;actor.currentClip=attacking&&!actor.useSourceAttack?'authored-sword-'+state:Object.entries(desired).sort((a,b)=>b[1]-a[1])[0][0];
  }
  return animate;
}
global.AshenMotion={createAnimator};
})(typeof window!=='undefined'?window:globalThis);

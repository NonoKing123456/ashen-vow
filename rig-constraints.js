/* Shared anatomical constraints for the production rig and its held equipment. */
(function(global){
'use strict';
function create(actor,T){
 const rig=actor.rig,root=actor.root,V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),clamp=T.MathUtils.clamp;
 const rootQ=new T.Quaternion(),parentQ=new T.Quaternion(),q=new T.Quaternion(),delta=new T.Quaternion();
 const p0=V(),p1=V(),p2=V(),along=V(),bend=V(),desiredElbow=V(),goal=V(),pole=V(),dir=V(),current=V(),wrist=V(),offset=V(),axisWorld=V(),requested=V();
 const zero=V(),swordAxis=V(0,-1,0),shieldAxis=V(0,0,1);
 let environment=[],sourcePoseMode=false;
 function probes(object){
  if(!object)return [];object.updateWorldMatrix(true,true);const inverse=object.matrixWorld.clone().invert(),cloud=[];
  object.traverse(mesh=>{if(!mesh.isMesh)return;const p=mesh.geometry.attributes.position,matrix=inverse.clone().multiply(mesh.matrixWorld);for(let i=0;i<p.count;i++)cloud.push(V().fromBufferAttribute(p,i).applyMatrix4(matrix));});
  const chosen=new Set();for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){if(!x&&!y&&!z)continue;let best=-Infinity,index=0;for(let i=0;i<cloud.length;i++){const p=cloud[i],value=p.x*x+p.y*y+p.z*z;if(value>best){best=value;index=i;}}chosen.add(index);}return [...chosen].map(i=>cloud[i]);
 }
 const itemProbes={right:probes(actor.weapon?.group),left:probes(actor.shield)};
 function wallContact(side){
  const item=side==='right'?actor.weapon?.group:actor.shield;if(!item||!environment.length||!global.AshenNavigation)return null;
  item.updateWorldMatrix(true,true);let first=null;const from=V(),point=V();
  for(const sample of itemProbes[side]){point.copy(sample);item.localToWorld(point);from.set(root.position.x,point.y,root.position.z);const hit=global.AshenNavigation.segmentCast(from,point,environment,.012);if(hit){hit.depth=Math.max(0,-((point.x-hit.point.x)*hit.normal.x+(point.y-hit.point.y)*hit.normal.y+(point.z-hit.point.z)*hit.normal.z));if(!first||hit.depth>first.depth)first=hit;}}
  return first;
 }
 function rotateToward(bone,child,worldPoint){
  bone.getWorldPosition(p0);child.getWorldPosition(p1);current.copy(p1).sub(p0).normalize();dir.copy(worldPoint).sub(p0).normalize();
  if(!Number.isFinite(dir.x)||dir.lengthSq()<.5)return;
  delta.setFromUnitVectors(current,dir);bone.parent.getWorldQuaternion(parentQ);q.copy(parentQ).invert().multiply(delta).multiply(parentQ);
  bone.quaternion.premultiply(q).normalize();bone.updateWorldMatrix(false,true);
 }
 function arm(upper,fore,hand,target,elbowPole){
  if(!upper||!fore||!hand)return;
  upper.getWorldPosition(p0);fore.getWorldPosition(p1);hand.getWorldPosition(p2);
  const a=p0.distanceTo(p1),b=p1.distanceTo(p2);along.copy(target).sub(p0);
  const distance=clamp(along.length(),Math.abs(a-b)+.008,a+b-.008);along.normalize();
  bend.copy(elbowPole).sub(p0);const projection=bend.dot(along);bend.addScaledVector(along,-projection);
  if(bend.lengthSq()<.00001)bend.set(1,0,0).addScaledVector(along,-along.x);bend.normalize();
  const cosine=clamp((a*a+distance*distance-b*b)/(2*a*distance),-1,1);
  desiredElbow.copy(p0).addScaledVector(along,a*cosine).addScaledVector(bend,a*Math.sqrt(Math.max(0,1-cosine*cosine)));
  rotateToward(upper,fore,desiredElbow);rotateToward(fore,hand,target);
 }
 function orient(hand,grip,axis,direction){
  if(!hand||!grip)return;
  root.getWorldQuaternion(rootQ);hand.getWorldQuaternion(q);q.multiply(grip.bindInverse).multiply(grip.orientation);
  axisWorld.copy(axis).applyQuaternion(q).normalize();requested.copy(direction).normalize().applyQuaternion(rootQ);
  delta.setFromUnitVectors(axisWorld,requested);hand.parent.getWorldQuaternion(parentQ);q.copy(parentQ).invert().multiply(delta).multiply(parentQ);
  hand.quaternion.premultiply(q).normalize();hand.updateWorldMatrix(false,true);
 }
 function hold(side,point,direction,elbow){
  const right=side==='right',upper=right?rig.rightUpper:rig.leftUpper,fore=right?rig.rightFore:rig.leftFore,hand=right?rig.rightHand:rig.leftHand;
  const grip=right?actor.weapon?.grip:actor.shield?.grip;if(!hand||!grip)return;
  goal.copy(point);root.localToWorld(goal);pole.copy(elbow);root.localToWorld(pole);
  // The intended contact is the closed palm. Wrist and grip are separate
  // points; solve both arm lengths and wrist orientation against that contact.
  for(let i=0;i<3;i++){
   hand.getWorldPosition(wrist);offset.copy(grip.handOffset||zero);hand.localToWorld(offset);offset.sub(wrist);wrist.copy(goal).sub(offset);
   arm(upper,fore,hand,wrist,pole);orient(hand,grip,right?swordAxis:shieldAxis,direction);
  }
 }
 function readyRight(o={}){
  const c=clamp(o.combat||0,0,1),g=clamp(o.guard||0,0,1),run=clamp(((o.speed||0)-2)/2.4,0,1),phase=(o.phase||0)*Math.PI*4,side=actor.anatomyRightSign||-1,ready=Math.max(c,g);
  const sway=Math.sin(phase)*.018*run,bob=Math.cos(phase*2)*.007*clamp((o.speed||0)/2,0,1);
  hold('right',V(side*(.34+.035*ready),1.10+.16*ready+.065*run+bob,.12+.12*ready+sway),V(side*.025,-.84+1.50*ready,.54+.21*ready),V(side*.63,1.30,-.10));
  root.getWorldQuaternion(rootQ).invert();const upper=rig.rightUpper.getWorldPosition(V()),fore=rig.rightFore.getWorldPosition(V()),hand=rig.rightHand.getWorldPosition(V());
  rig.rightHand.getWorldQuaternion(q);q.multiply(actor.weapon.grip.bindInverse).multiply(actor.weapon.grip.orientation);
  return {u:fore.sub(upper).normalize().applyQuaternion(rootQ).toArray(),f:hand.sub(rig.rightFore.getWorldPosition(V())).normalize().applyQuaternion(rootQ).toArray(),s:swordAxis.clone().applyQuaternion(q).applyQuaternion(rootQ).normalize().toArray(),x:0,y:0};
 }
 function calibratedCarry(leftAmount,rightAmount){
  if(!actor.shield?.grip)return;
  const left=rig.leftUpper.getWorldPosition(V()).sub(rig.rightUpper.getWorldPosition(V())).normalize();
  if(leftAmount>.00001){const position=actor.shield.getWorldPosition(V()),orientation=actor.shield.getWorldQuaternion(new T.Quaternion());position.addScaledVector(left,.12*root.scale.x*leftAmount);position.y+=.12*root.scale.y*leftAmount;movePalm('left',position,orientation);}
  if(rightAmount>.00001){root.getWorldQuaternion(rootQ);const position=actor.weapon.group.getWorldPosition(V()),orientation=actor.weapon.group.getWorldQuaternion(new T.Quaternion());position.addScaledVector(left,-.035*root.scale.x*rightAmount).addScaledVector(V(0,0,1).applyQuaternion(rootQ),.017*root.scale.x*rightAmount);position.y+=.035*root.scale.y*rightAmount;movePalm('right',position,orientation);}
 }
 function carries(o){
  sourcePoseMode=!!o.sourcePose;
  environment=(o.obstacles||[]).filter(ob=>Math.abs(root.position.x-ob.x)<(ob.w||ob.r*2||0)*.5+2.2*root.scale.x&&Math.abs(root.position.z-ob.z)<(ob.d||ob.r*2||0)*.5+2.2*root.scale.x);actor.blockedWeapon=null;
  if(o.dead||o.rolling){actor.updateEquipment();if(o.sourcePose)calibratedCarry(o.leftCarryAmount||0,o.rightCarryAmount||0);return;}
  const c=clamp(o.combat||0,0,1),g=clamp(Math.max(o.guard||0,o.healing?.65:0),0,1),run=clamp((o.speed-2)/2.4,0,1),phase=(o.phase||0)*Math.PI*4;
  const sway=Math.sin(phase)*.018*run,bob=Math.cos(phase*2)*.007*clamp(o.speed/2,0,1),side=actor.anatomyRightSign||-1;
  if(!o.sourcePose&&!o.attacking)readyRight(o);
  if(!o.sourcePose&&actor.shield?.grip){
   const retract=o.attacking?1:0,hand=V(-side*(.39-.23*g+.025*retract),1.01+.33*g+.13*run+.13*retract+bob,.14+.24*g-.035*retract);
   hold('left',hand,V(-side*.88*(1-g),-.08*(1-g),.47+.53*g),V(-side*.67,1.31,.01));
  }
  actor.updateEquipment();
  if(o.sourcePose&&actor.shield?.grip){
   // Calibrate the common armed carry before contact: the free-arm source
   // leaves insufficient room for a solid shield beside the plated torso.
   // Keep this same shoulder-relative clearance through locomotion/recovery.
   calibratedCarry(o.leftCarryAmount??1,o.rightCarryAmount??1);
  }
  if(wallContact('left')){hold('left',V(-side*.27,1.24,.01),V(-side,0,0),V(-side*.36,1.24,-.22));actor.updateEquipment();}
  const contact=wallContact('right');if(contact){
   if(o.attacking)actor.blockedWeapon=contact;
   hold('right',V(side*.27,1.25,.06),V(side*.015,.995,.06),V(side*.40,1.24,-.23));actor.updateEquipment();
  }
  for(const handSide of ['left','right'])for(let pass=0;pass<3;pass++){
   const hit=wallContact(handSide);if(!hit)break;const item=handSide==='right'?actor.weapon.group:actor.shield;
   item.getWorldPosition(localPoint);localPoint.addScaledVector(V(hit.normal.x,hit.normal.y,hit.normal.z),hit.depth+.008);root.worldToLocal(localPoint);
   item.getWorldQuaternion(equipmentQ);root.getWorldQuaternion(rootQ);localDirection.copy(handSide==='right'?swordAxis:shieldAxis).applyQuaternion(equipmentQ).applyQuaternion(rootQ.invert());
   const sign=handSide==='right'?side:-side;hold(handSide,localPoint,localDirection,V(sign*.36,1.24,-.22));actor.updateEquipment();
  }
 }
 function ground({rolling=false,dead=false,state='',running=false,contact=1}={}){
  const full=rolling||dead||state==='stagger',feet=!full&&actor.footBounds?actor.footBounds():null;
  const min=feet?Math.min(feet.left.min,feet.right.min):full&&actor.groundBounds?actor.groundBounds().min:NaN;
  if(!Number.isFinite(min))return;
  const floor=root.position.y+.018*root.scale.y;
  let correction=floor-min;
  // A real roll includes a brief airborne phase. Correct penetration without
  // pulling an authored jump back down to a forced contact every frame.
  if(rolling)correction=Math.max(0,correction);
  if(!full&&correction<0&&(running&&contact<.45))correction=0;
  if(!full)correction=clamp(correction,-.035,.12*root.scale.y);
  actor.pivot.position.y+=correction/root.scale.y;
  actor.root.updateWorldMatrix(true,true);
 }
 const plant=()=>({active:false,blocked:false,point:V(),orientation:new T.Quaternion(),maxWarp:0,releaseAge:-1,releaseOffset:V(),releaseRotation:new T.Quaternion()});
 const plants={left:plant(),right:plant()},lastPlantRoot=V(Infinity,0,0),lastPlantTravel=V(),plantTravel=V(),plantUpperQ=new T.Quaternion(),plantKneeQ=new T.Quaternion(),plantFootQ=new T.Quaternion();
 function solveFoot(upper,knee,foot,target,orientation,kneeForward){
  plantUpperQ.copy(upper.quaternion);plantKneeQ.copy(knee.quaternion);plantFootQ.copy(foot.quaternion);
  knee.getWorldPosition(pole);pole.add(kneeForward);arm(upper,knee,foot,target,pole);
  foot.parent.getWorldQuaternion(parentQ);foot.quaternion.copy(parentQ.invert()).multiply(orientation).normalize();foot.updateWorldMatrix(false,true);
  if(foot.getWorldPosition(p2).distanceTo(target)>.003*root.scale.x){upper.quaternion.copy(plantUpperQ);knee.quaternion.copy(plantKneeQ);foot.quaternion.copy(plantFootQ);upper.updateWorldMatrix(false,true);return false;}
  return true;
 }
 function plantFeet({frame,dt,speed=0,yawRate=0,enabled=true}){
  plantTravel.copy(root.position).sub(lastPlantRoot);const discontinuity=plantTravel.length()>.30*root.scale.x;
  const headingChanged=!discontinuity&&plantTravel.lengthSq()>.000001&&lastPlantTravel.lengthSq()>.000001&&plantTravel.clone().normalize().dot(lastPlantTravel)<.80;lastPlantRoot.copy(root.position);
  const permitted=enabled&&speed>.2&&speed<3.1*root.scale.x&&Math.abs(yawRate||0)<.9&&!discontinuity&&!headingChanged,step=clamp(Number(dt)||0,0,.05);
  if(!permitted)lastPlantTravel.set(0,0,0);else if(plantTravel.lengthSq()>.000001)lastPlantTravel.copy(plantTravel).normalize();
  // A mixture of different travel directions needs a bounded contact warp:
  // quaternion-blended legs do not follow the weighted source ankle exactly.
  // Walk/run mixing alone retains the original small allowance.
  const directions=new Set((frame?.layers||[]).filter(layer=>layer.weight>.05).map(layer=>/^Knight_Strafe_Left$/.test(layer.name)?'left':/^Knight_Strafe_Right$/.test(layer.name)?'right':/^Knight_Backward$/.test(layer.name)?'back':'forward'));
  const directionalBlend=!!frame?.directional&&directions.size>1;
  actor.footPlant={};root.getWorldQuaternion(rootQ);const kneeForward=V(0,0,.24*root.scale.x).applyQuaternion(rootQ);
  for(const side of ['left','right']){
   const lock=plants[side],upper=rig[side+'Thigh'],knee=rig[side+'Shin'],foot=rig[side+'Foot'];if(!upper||!knee||!foot)continue;
   const source=frame?.feet?.[side],candidate=permitted&&!!source?.lockedCandidate,rawPoint=foot.getWorldPosition(V()),rawRotation=foot.getWorldQuaternion(new T.Quaternion());
   // Acquisition is deliberately stricter than keeping an established flat
   // contact. A source velocity-confidence boundary is not itself toe-off.
   const maintaining=permitted&&lock.active&&source?.contact>.75&&source?.support>.50&&rawPoint.y-lock.point.y<.008*root.scale.y;
   if(!permitted){lock.active=false;lock.blocked=false;lock.releaseAge=-1;}
   else if(!candidate&&!maintaining){
    if(lock.active){lock.releaseAge=0;lock.releaseOffset.copy(lock.point).sub(rawPoint);lock.releaseRotation.copy(lock.orientation).multiply(rawRotation.clone().invert());}
    lock.active=false;lock.blocked=false;
   }
   else if(candidate&&!lock.active&&!lock.blocked&&lock.releaseAge<0){
    const chain=upper.getWorldPosition(p0).distanceTo(knee.getWorldPosition(p1))+p1.distanceTo(foot.getWorldPosition(p2));
    lock.maxWarp=directionalBlend?Math.min(chain*.10,.095*root.scale.x):.055*root.scale.x;
    // Keep this allowance for this support episode. Letting a direction weight
    // cross a threshold must not release an otherwise reachable planted foot.
    foot.getWorldPosition(lock.point);foot.getWorldQuaternion(lock.orientation);lock.active=true;
   }
   if(lock.active){
    upper.getWorldPosition(p0);knee.getWorldPosition(p1);foot.getWorldPosition(p2);
    const correction=p2.distanceTo(lock.point),a=p0.distanceTo(p1),b=p1.distanceTo(p2),reach=p0.distanceTo(lock.point),reachable=reach<a+b-.012*root.scale.x&&reach>Math.abs(a-b)+.008*root.scale.x;
    if(correction>lock.maxWarp||!reachable){lock.active=false;lock.blocked=true;lock.releaseAge=-1;}
    else{
     if(!solveFoot(upper,knee,foot,lock.point,lock.orientation,kneeForward)){lock.active=false;lock.blocked=true;lock.releaseAge=-1;}
    }
   }
   if(lock.releaseAge>=0&&permitted){
    // Once the foot leaves support, let its source swing proceed immediately
    // and remove only the *fixed* contact correction over a short interval.
    // Following the old world anchor here would drag the departing foot.
    lock.releaseAge+=step;const u=clamp(lock.releaseAge/.12,0,1),weight=1-u*u*(3-2*u),target=rawPoint.clone().addScaledVector(lock.releaseOffset,weight),orientation=new T.Quaternion().slerp(lock.releaseRotation,weight).multiply(rawRotation);
    if(!solveFoot(upper,knee,foot,target,orientation,kneeForward)||u>=1)lock.releaseAge=-1;
   }
   foot.getWorldPosition(p2);actor.footPlant[side]={active:lock.active,releasing:lock.releaseAge>=0,error:lock.active?p2.distanceTo(lock.point):0,anchor:lock.point.clone()};
  }
 }
 const restFeet={};root.getWorldQuaternion(rootQ);
 for(const side of ['left','right']){const foot=rig[side+'Foot'];if(foot){restFeet[side]={point:root.worldToLocal(foot.getWorldPosition(V())),orientation:rootQ.clone().invert().multiply(foot.getWorldQuaternion(new T.Quaternion()))};}}
 function braceFeet(amount,travel){
  if(amount<.001)return;
  for(const side of ['left','right']){
   const rest=restFeet[side],upper=rig[side+'Thigh'],knee=rig[side+'Shin'],foot=rig[side+'Foot'];if(!rest||!upper||!knee||!foot)continue;
   const lead=side==='left'?1:-1,target=rest.point.clone().addScaledVector(travel,lead*.09*amount);root.localToWorld(target);
   const kneePole=root.localToWorld(V(rest.point.x*1.4,.52,.48));arm(upper,knee,foot,target,kneePole);
   root.getWorldQuaternion(rootQ);q.copy(rootQ).multiply(rest.orientation);foot.parent.getWorldQuaternion(parentQ);foot.quaternion.copy(parentQ.invert()).multiply(q).normalize();foot.updateWorldMatrix(false,true);
  }
 }
 const surfacePoint=V(),gripPoint=V(),equipmentQ=new T.Quaternion(),worldAxis=V(),localDirection=V(),localPoint=V(),localPole=V();
 function meshFloor(object){
  let minimum=Infinity;object.updateWorldMatrix(true,true);object.traverse(mesh=>{if(!mesh.isMesh||!mesh.visible)return;const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){surfacePoint.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);minimum=Math.min(minimum,surfacePoint.y);}});return minimum;
 }
 function worldHold(side,position,direction){
  const elbow=side==='right'?rig.rightFore:rig.leftFore;if(!elbow)return;
  localPoint.copy(position);root.worldToLocal(localPoint);root.getWorldQuaternion(rootQ);localDirection.copy(direction).applyQuaternion(rootQ.invert());
  elbow.getWorldPosition(localPole);localPole.y+=.035*root.scale.y;root.worldToLocal(localPole);hold(side,localPoint,localDirection,localPole);
 }
 const capsuleModels=[
  {a:rig.hips,b:rig.chest,joints:/^(pelvis|spine)/i,r:.195},{a:rig.chest,b:rig.neck,joints:/^chest$/i,r:.16},{a:rig.head,b:rig.head,joints:/^head$/i,r:.135},
  {a:rig.leftThigh,b:rig.leftShin,joints:/^thigh_L$/i,r:.12},{a:rig.rightThigh,b:rig.rightShin,joints:/^thigh_R$/i,r:.12},
  {a:rig.leftShin,b:rig.leftFoot,joints:/^shin_L$/i,r:.075},{a:rig.rightShin,b:rig.rightFoot,joints:/^shin_R$/i,r:.075}
 ].filter(c=>c.a&&c.b);
 // Measure the actual bind armour once. The old 12cm thigh capsule excluded
 // several centimetres of weighted plate. Runtime never scans the full mesh.
 root.updateWorldMatrix(true,true);
 for(const c of capsuleModels){c.start=c.a.getWorldPosition(V());c.end=c.b.getWorldPosition(V());c.axis=c.end.clone().sub(c.start);c.length=c.axis.lengthSq();c.measured=0;}
 actor.visual.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const p=mesh.geometry.attributes.position,si=mesh.geometry.attributes.skinIndex,sw=mesh.geometry.attributes.skinWeight;
  for(let i=0;i<p.count;i++){let best=-1,joint=0;for(const key of ['X','Y','Z','W']){const w=sw['get'+key](i);if(w>best){best=w;joint=si['get'+key](i);}}const name=mesh.skeleton.bones[joint]?.name||'',point=V().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);
   for(const c of capsuleModels)if(c.joints.test(name)){const u=c.length?clamp(point.clone().sub(c.start).dot(c.axis)/c.length,0,1):0;c.measured=Math.max(c.measured,point.distanceTo(c.start.clone().addScaledVector(c.axis,u))/root.scale.x);}
  }
 });
 for(const c of capsuleModels)c.r=Math.max(c.r,c.measured);
 function bodyCapsules(){return capsuleModels.map(c=>({a:c.a.getWorldPosition(V()),b:c.b.getWorldPosition(V()),r:c.r*root.scale.x}));}
 function segmentDistance(a,b,c,d){
  const u=b.clone().sub(a),v=d.clone().sub(c),w=a.clone().sub(c),aa=u.dot(u),bb=u.dot(v),cc=v.dot(v),dd=u.dot(w),ee=v.dot(w),den=aa*cc-bb*bb;
  let s=den>1e-9?clamp((bb*ee-cc*dd)/den,0,1):0,t=cc>1e-9?clamp((bb*s+ee)/cc,0,1):0;
  if(aa>1e-9)s=clamp((bb*t-dd)/aa,0,1);if(cc>1e-9)t=clamp((bb*s+ee)/cc,0,1);
  return a.clone().addScaledVector(u,s).distanceTo(c.clone().addScaledVector(v,t));
 }
 function clearBladeAxis(position,axis,low,high){
  const capsules=bodyCapsules(),length=actor.weapon.bladeLength*root.scale.x;
  const fit=direction=>{const y=clamp(direction.y,Math.min(low,high),Math.max(low,high));direction.y=0;if(direction.lengthSq()<.001)direction.set(0,0,1);direction.normalize().multiplyScalar(Math.sqrt(1-y*y));direction.y=y;return direction;};
  const collides=direction=>{const base=position.clone().addScaledVector(direction,.15*root.scale.x),tip=position.clone().addScaledVector(direction,length);return capsules.some(c=>segmentDistance(base,tip,c.a,c.b)<c.r+.018*root.scale.x)||(environment.length&&global.AshenNavigation?.segmentCast(base,tip,environment,.018));};
  const original=fit(axis.clone());if(sourcePoseMode||!collides(original))return original;
  root.getWorldQuaternion(equipmentQ);equipmentQ.multiply(actor.pivot.quaternion);const side=actor.anatomyRightSign||-1,away=V(side,0,0).applyQuaternion(equipmentQ);
  const candidates=[.3,.6,1,1.5].map(w=>original.clone().addScaledVector(away,w).normalize());
  for(const p of [[side,0,0],[0,0,-1],[0,0,1],[side,.4,.3],[side,-.4,-.3]])candidates.push(V(...p).applyQuaternion(equipmentQ).normalize());
  let best=original,dot=-Infinity;for(const raw of candidates){const candidate=fit(raw);if(!collides(candidate)){const score=candidate.dot(original);if(score>dot){dot=score;best=candidate;}}}return best;
 }
 function movePalm(side,point,orientation){
  const right=side==='right',upper=right?rig.rightUpper:rig.leftUpper,fore=right?rig.rightFore:rig.leftFore,hand=right?rig.rightHand:rig.leftHand,grip=right?actor.weapon?.grip:actor.shield?.grip;
  if(!upper||!fore||!hand||!grip)return;const wanted=orientation.clone().multiply(grip.orientation.clone().invert()).multiply(grip.bindInverse.clone().invert());fore.getWorldPosition(pole);pole.y+=.025*root.scale.y;
  for(let i=0;i<3;i++){hand.getWorldPosition(wrist);offset.copy(grip.handOffset||zero);hand.localToWorld(offset);offset.sub(wrist);goal.copy(point).sub(offset);arm(upper,fore,hand,goal,pole);hand.parent.getWorldQuaternion(parentQ);hand.quaternion.copy(parentQ.invert()).multiply(wanted).normalize();hand.updateWorldMatrix(false,true);}actor.updateEquipment();
 }
 const shieldSamples=[];
 if(actor.shield)for(const x of [-.24,-.12,0,.12,.24])for(const y of [-.20,-.08,.05,.18,.30])if((x/.286)**2+((y-.05)/.337)**2<.90)for(const z of [.089,.142])shieldSamples.push(V(x,y,z));
 function capsulePoint(point,cap){const segment=cap.b.clone().sub(cap.a),u=clamp(point.clone().sub(cap.a).dot(segment)/Math.max(1e-9,segment.lengthSq()),0,1);return cap.a.clone().addScaledVector(segment,u);}
 function closestSegments(a,b,c,d){
  const u=b.clone().sub(a),v=d.clone().sub(c),w=a.clone().sub(c),aa=u.dot(u),bb=u.dot(v),cc=v.dot(v),dd=u.dot(w),ee=v.dot(w),den=aa*cc-bb*bb;
  let s=den>1e-9?clamp((bb*ee-cc*dd)/den,0,1):0,t=cc>1e-9?clamp((bb*s+ee)/cc,0,1):0;if(aa>1e-9)s=clamp((bb*t-dd)/aa,0,1);if(cc>1e-9)t=clamp((bb*s+ee)/cc,0,1);
  return [a.clone().addScaledVector(u,s),c.clone().addScaledVector(v,t)];
 }
 function separateSimple(){
  const info=actor.equipmentIntegrity||{rightShift:0,leftShift:0,unresolved:null},scale=root.scale.x,floor=root.position.y+.018*scale;root.getWorldQuaternion(rootQ);
  for(const side of ['left','right']){
   const item=side==='left'?actor.shield:actor.weapon?.group;if(!item?.visible)continue;
   for(let pass=0;pass<2;pass++){
    const caps=bodyCapsules(),centre=item.getWorldPosition(V()),orientation=item.getWorldQuaternion(new T.Quaternion()),push=V();let deepest=0,weight=0;
    // The deepest collider supplies a continuous depth, not an orientation.
    // Every penetrating surface contributes to orientation instead of
    // selecting one capsule's normal when equal-depth contacts exchange rank.
    const contribute=(depth,normal)=>{if(depth<=0)return;if(normal.lengthSq()<1e-8)normal.set(side==='left'?-(actor.anatomyRightSign||-1):actor.anatomyRightSign||-1,0,0).applyQuaternion(rootQ);const w=depth*depth;push.addScaledVector(normal.normalize(),w);weight+=w;deepest=Math.max(deepest,depth);};
    if(side==='left'){
     const middle=item.localToWorld(V(0,.05,.115));for(const local of shieldSamples){const point=item.localToWorld(local.clone());for(const cap of caps){const near=capsulePoint(point,cap),gap=point.distanceTo(near),depth=cap.r+.005*scale-gap;contribute(depth,middle.clone().sub(capsulePoint(middle,cap)));}}
    }else{
     const base=item.localToWorld(actor.weapon.base.clone()),tip=item.localToWorld(actor.weapon.tip.clone());for(const cap of caps){const [blade,body]=closestSegments(base,tip,cap.a,cap.b),depth=cap.r+.018*scale-blade.distanceTo(body);contribute(depth,blade.sub(body));}
    }
    if(!weight||deepest<.0001*scale)break;
    if(push.lengthSq()<weight*weight*1e-8)push.set(side==='left'?-(actor.anatomyRightSign||-1):actor.anatomyRightSign||-1,0,0).applyQuaternion(rootQ);push.normalize();
    if(meshFloor(item)<floor+.04*scale&&push.y<0){push.y=0;if(push.lengthSq()<1e-8)push.set(side==='left'?-(actor.anatomyRightSign||-1):actor.anatomyRightSign||-1,0,0).applyQuaternion(rootQ);push.normalize();}
    const shift=Math.min(.10*scale,deepest+Math.min(.004*scale,deepest*4));movePalm(side,centre.clone().addScaledVector(push,shift),orientation);info[side+'Shift']+=item.getWorldPosition(V()).distanceTo(centre);
   }
  }
  actor.equipmentIntegrity=info;
 }
 function equipmentFloor({rolling=false}={}){
  // The offline armed roll already carries both solid items clear of the body
  // and ground. Keep its arm channels intact; the shared ground pass is enough.
  if(rolling&&/^(Armed_Roll|Knight_Roll(?:_Back|_Left|_Right)?)$/.test(actor.motionFrame?.source||'')){actor.equipmentIntegrity={rightShift:0,leftShift:0,unresolved:null,source:'offline-armed-roll'};return;}
  actor.equipmentIntegrity={rightShift:0,leftShift:0,unresolved:null};separateSimple();
  const floor=root.position.y+.018*root.scale.y;
  for(let pass=0;pass<2;pass++){
   const weapon=actor.weapon?.group;if(weapon){
    weapon.getWorldPosition(gripPoint);weapon.getWorldQuaternion(equipmentQ);worldAxis.copy(swordAxis).applyQuaternion(equipmentQ).normalize();
    const low=clamp((floor-gripPoint.y+.012)/(actor.weapon.bladeLength*root.scale.x),-.98,.98),high=clamp((gripPoint.y-floor-.012)/(.15*root.scale.x),-.98,.98);
    const clear=clearBladeAxis(gripPoint,worldAxis,low,high);if(clear.distanceToSquared(worldAxis)>.000001){worldAxis.copy(clear);worldHold('right',gripPoint,worldAxis);actor.updateEquipment();}
    if(gripPoint.y<.40*root.scale.y){const minimum=meshFloor(weapon);if(minimum<floor){weapon.getWorldPosition(gripPoint);gripPoint.y+=floor-minimum+.012;weapon.getWorldQuaternion(equipmentQ);worldAxis.copy(swordAxis).applyQuaternion(equipmentQ);worldHold('right',gripPoint,worldAxis);actor.updateEquipment();}}
   }
   const shield=actor.shield;if(!rolling&&shield?.visible&&shield.grip){
    shield.getWorldPosition(gripPoint);if(gripPoint.y>.47*root.scale.y)continue;
    const minimum=meshFloor(shield);if(minimum>=floor)continue;
    shield.getWorldQuaternion(equipmentQ);worldAxis.copy(shieldAxis).applyQuaternion(equipmentQ).normalize();
    // A shield meeting the ground rolls onto its face while the closed palm
    // stays on the handle; it cannot dig a vertical disc through the floor.
    const original=worldAxis.clone(),cloud=itemProbes.left.map(p=>p.clone().applyMatrix4(shield.matrixWorld).sub(gripPoint));let best=null;
    for(const sign of [1,-1]){const end=V(0,sign,0),turn=new T.Quaternion().setFromUnitVectors(original,end);let lo=0,hi=1;const support=t=>{const q=new T.Quaternion().slerp(turn,t);let low=Infinity;for(const p of cloud)low=Math.min(low,p.clone().applyQuaternion(q).y+gripPoint.y);return low;};if(support(1)<floor+.009)continue;for(let i=0;i<11;i++){const at=(lo+hi)*.5;if(support(at)<floor+.009)lo=at;else hi=at;}const rotation=new T.Quaternion().slerp(turn,hi),angle=rotation.angleTo(new T.Quaternion());if(!best||angle<best.angle)best={angle,direction:original.clone().applyQuaternion(rotation)};}
    if(best)worldAxis.copy(best.direction);worldHold('left',gripPoint,worldAxis);actor.updateEquipment();
    const after=meshFloor(shield);if(after<floor){shield.getWorldPosition(gripPoint);gripPoint.y+=floor-after+.015;worldHold('left',gripPoint,worldAxis);actor.updateEquipment();}
   }
  }
 }
 function finalGround(){
  // A rolling or fallen body can rest on its solid equipment. Ground the
  // complete held silhouette after arm solving, rather than lifting one part
  // and silently driving a different part below the same surface.
  const minimum=Math.min(actor.groundBounds?.().min??Infinity,actor.weapon?.group?meshFloor(actor.weapon.group):Infinity,actor.shield?.visible?meshFloor(actor.shield):Infinity,actor.flask?meshFloor(actor.flask):Infinity);
  if(!Number.isFinite(minimum))return;const floor=root.position.y+.018*root.scale.y;
  actor.pivot.position.y+=(floor-minimum)/root.scale.y;root.updateWorldMatrix(true,true);actor.updateEquipment();
 }
 const clothWorld=V(),a=V(),b=V(),nearest=V(),ab=V(),back=V();
 function cloth(){
  if(!actor.cape)return;
  const cape=actor.cape,p=cape.geometry.attributes.position,weights=cape.userData.fallWeights;
  cape.updateWorldMatrix(true,false);root.getWorldQuaternion(rootQ);rootQ.multiply(actor.pivot.quaternion);back.set(0,0,-1).applyQuaternion(rootQ);
  const capsules=[];const add=(from,to,r)=>{if(from&&to)capsules.push({a:from.getWorldPosition(V()),b:to.getWorldPosition(V()),r:r*root.scale.x})};
  add(rig.hips,rig.chest,.205);add(rig.leftThigh,rig.leftShin,.115);add(rig.rightThigh,rig.rightShin,.115);add(rig.leftUpper,rig.leftFore,.075);add(rig.rightUpper,rig.rightFore,.075);
  let altered=false;
  for(let i=0;i<p.count;i++){
   if(weights&&weights[i]<.10)continue;clothWorld.fromBufferAttribute(p,i);cape.localToWorld(clothWorld);let touched=false;
   for(const cap of capsules){a.copy(cap.a);b.copy(cap.b);ab.copy(b).sub(a);const u=clamp(nearest.copy(clothWorld).sub(a).dot(ab)/Math.max(.00001,ab.lengthSq()),0,1);nearest.copy(a).addScaledVector(ab,u);dir.copy(clothWorld).sub(nearest);const distance=dir.length();if(distance<cap.r){if(distance<.00001)dir.copy(back);else dir.multiplyScalar(1/distance);clothWorld.copy(nearest).addScaledVector(dir,cap.r+.008);touched=true;}}
   const floor=root.position.y+.025*root.scale.y;if(clothWorld.y<floor){clothWorld.y=floor;touched=true;}
   if(touched){cape.worldToLocal(clothWorld);p.setXYZ(i,clothWorld.x,clothWorld.y,clothWorld.z);altered=true;}
  }
  if(altered)p.needsUpdate=true;
 }
 const contactPoints=[],flaskProbes=probes(actor.flask);
 function contacts(){
  // Reuse vectors: the final envelope is not a second render mesh or collider.
  let count=0;const append=p=>{if(!contactPoints[count])contactPoints[count]=V();contactPoints[count++].copy(p);};
  for(const p of actor.skinContactPoints?.()||[])append(p);
  for(const [object,samples]of [[actor.weapon?.group,itemProbes.right],[actor.shield,itemProbes.left],[actor.flask,flaskProbes]]){
   if(!object||!object.visible)continue;object.updateWorldMatrix(true,true);for(const sample of samples){surfacePoint.copy(sample);object.localToWorld(surfacePoint);append(surfacePoint);}
  }
  if(actor.cape){const p=actor.cape.geometry.attributes.position;actor.cape.updateWorldMatrix(true,false);for(let i=0;i<p.count;i++){surfacePoint.fromBufferAttribute(p,i);actor.cape.localToWorld(surfacePoint);append(surfacePoint);}}
  contactPoints.length=count;actor.contactPoints=contactPoints;
 }
 return {hold,readyRight,carries,ground,plantFeet,braceFeet,equipmentFloor,finalGround,cloth,contacts};
}
global.AshenRigConstraints={create};
})(typeof window!=='undefined'?window:globalThis);

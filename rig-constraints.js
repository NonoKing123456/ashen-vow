/* Shared anatomical constraints for the production rig and its held equipment. */
(function(global){
'use strict';
function create(actor,T){
 const rig=actor.rig,root=actor.root,V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),clamp=T.MathUtils.clamp;
 const rootQ=new T.Quaternion(),parentQ=new T.Quaternion(),q=new T.Quaternion(),delta=new T.Quaternion();
 const p0=V(),p1=V(),p2=V(),along=V(),bend=V(),desiredElbow=V(),goal=V(),pole=V(),dir=V(),current=V(),wrist=V(),offset=V(),axisWorld=V(),requested=V();
 const zero=V(),swordAxis=V(0,-1,0),shieldAxis=V(0,0,1);
 let environment=[];
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
 function carries(o){
  environment=(o.obstacles||[]).filter(ob=>Math.abs(root.position.x-ob.x)<(ob.w||ob.r*2||0)*.5+2.2*root.scale.x&&Math.abs(root.position.z-ob.z)<(ob.d||ob.r*2||0)*.5+2.2*root.scale.x);actor.blockedWeapon=null;
  if(o.dead||o.rolling)return;
  const c=clamp(o.combat||0,0,1),g=clamp(Math.max(o.guard||0,o.healing?.65:0),0,1),run=clamp((o.speed-2)/2.4,0,1),phase=(o.phase||0)*Math.PI*4;
  const sway=Math.sin(phase)*.018*run,bob=Math.cos(phase*2)*.007*clamp(o.speed/2,0,1),side=actor.anatomyRightSign||-1;
  if(!o.attacking)readyRight(o);
  if(actor.shield?.grip){
   const retract=o.attacking?1:0,hand=V(-side*(.39-.23*g+.025*retract),1.01+.33*g+.13*run+.13*retract+bob,.14+.24*g-.035*retract);
   hold('left',hand,V(-side*.88*(1-g),-.08*(1-g),.47+.53*g),V(-side*.67,1.31,.01));
  }
  actor.updateEquipment();
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
 function tuck(amount,rollAxis){
  if(amount<.015)return;const strength=Math.min(1,amount*1.6),side=actor.anatomyRightSign||-1;
  for(const handSide of ['right','left']){
   if(handSide==='left'&&!actor.shield?.grip)continue;
   const item=handSide==='right'?actor.weapon.group:actor.shield,axis=handSide==='right'?swordAxis:shieldAxis;
   actor.updateEquipment();item.getWorldPosition(localPoint);root.worldToLocal(localPoint);
   const target=handSide==='right'?V(side*.37,1.08,-.10):V(-side*.40,1.08,-.02);localPoint.lerp(target,strength);
   item.getWorldQuaternion(equipmentQ);root.getWorldQuaternion(rootQ);localDirection.copy(axis).applyQuaternion(equipmentQ).applyQuaternion(rootQ.invert());
   const wanted=handSide==='right'?V(rollAxis.x,rollAxis.y,rollAxis.z):V(-side,0,0);
   if(handSide==='right'&&wanted.dot(target.clone().sub(V(0,1.03,.04)))<0)wanted.negate();
   localDirection.lerp(wanted,strength).normalize();hold(handSide,localPoint,localDirection,V((handSide==='right'?side:-side)*.56,1.32,-.13));
  }
 }
 function ground({rolling=false,dead=false,state='',running=false,contact=1}={}){
  const full=rolling||dead||state==='stagger',feet=!full&&actor.footBounds?actor.footBounds():null;
  const min=feet?Math.min(feet.left.min,feet.right.min):full&&actor.groundBounds?actor.groundBounds().min:NaN;
  if(!Number.isFinite(min))return;
  const floor=root.position.y+.018*root.scale.y;
  let correction=floor-min;
  if(!full&&correction<0&&(running&&contact<.45))correction=0;
  if(!full)correction=clamp(correction,-.035,.12*root.scale.y);
  actor.pivot.position.y+=correction/root.scale.y;
  actor.root.updateWorldMatrix(true,true);
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
 function bodyCapsules(){
  const list=[],add=(from,to,r)=>{if(from&&to)list.push({a:from.getWorldPosition(V()),b:to.getWorldPosition(V()),r:r*root.scale.x})};
  add(rig.hips,rig.chest,.195);add(rig.chest,rig.neck,.16);add(rig.head,rig.head,.135);add(rig.leftThigh,rig.leftShin,.12);add(rig.rightThigh,rig.rightShin,.12);add(rig.leftShin,rig.leftFoot,.075);add(rig.rightShin,rig.rightFoot,.075);return list;
 }
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
  const original=fit(axis.clone());if(!collides(original))return original;
  root.getWorldQuaternion(equipmentQ);equipmentQ.multiply(actor.pivot.quaternion);const side=actor.anatomyRightSign||-1,away=V(side,0,0).applyQuaternion(equipmentQ);
  const candidates=[.3,.6,1,1.5].map(w=>original.clone().addScaledVector(away,w).normalize());
  for(const p of [[side,0,0],[0,0,-1],[0,0,1],[side,.4,.3],[side,-.4,-.3]])candidates.push(V(...p).applyQuaternion(equipmentQ).normalize());
  let best=original,dot=-Infinity;for(const raw of candidates){const candidate=fit(raw);if(!collides(candidate)){const score=candidate.dot(original);if(score>dot){dot=score;best=candidate;}}}return best;
 }
 function equipmentFloor({rolling=false}={}){
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
    let lo=Math.max(0,worldAxis.y),hi=1;for(let i=0;i<10;i++){const y=(lo+hi)*.5,support=gripPoint.y+.097*root.scale.y*y-.365*root.scale.y*Math.sqrt(1-y*y)-.018*root.scale.y;if(support<floor+.01)lo=y;else hi=y;}
    const y=hi;worldAxis.y=0;if(worldAxis.lengthSq()<.001)worldAxis.set(0,0,1);worldAxis.normalize().multiplyScalar(Math.sqrt(1-y*y));worldAxis.y=y;worldHold('left',gripPoint,worldAxis);actor.updateEquipment();
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
 return {hold,readyRight,carries,tuck,ground,equipmentFloor,finalGround,cloth};
}
global.AshenRigConstraints={create};
})(typeof window!=='undefined'?window:globalThis);

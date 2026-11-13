/* Collision-aware X/Z motion. Static geometry always wins over crowd spacing. */
(function(global){
'use strict';
const EPS=1e-7,SKIN=1e-5;
function radius(entity,player){return Number.isFinite(entity.radius)&&entity.radius>0?entity.radius:entity.kind==='boss'?.55:entity===player?.29:.35;}
function insideBounds(p,bounds,r){return !bounds.length||bounds.some(b=>p.x>=b.x-b.w/2+r-EPS&&p.x<=b.x+b.w/2-r+EPS&&p.z>=b.z-b.d/2+r-EPS&&p.z<=b.z+b.d/2-r+EPS);}
function insideObstacle(p,o,r){if(o.w!=null)return p.x>o.x-o.w/2-r+EPS&&p.x<o.x+o.w/2+r-EPS&&p.z>o.z-o.d/2-r+EPS&&p.z<o.z+o.d/2+r-EPS;return Number.isFinite(o.r)&&Math.hypot(p.x-o.x,p.z-o.z)<o.r+r-EPS;}
function legal(p,ctx,r){return insideBounds(p,ctx.bounds,r)&&!ctx.obstacles.some(o=>insideObstacle(p,o,r));}
function interval(p,d,minX,maxX,minZ,maxZ){
 let enter=-Infinity,exit=Infinity,nx=0,nz=0,ex=0,ez=0;
 for(const [axis,min,max]of [['x',minX,maxX],['z',minZ,maxZ]]){
  const v=d[axis],s=p[axis];if(Math.abs(v)<EPS){if(s<min-EPS||s>max+EPS)return null;continue;}
  let near=(min-s)/v,far=(max-s)/v,normal=v>0?-1:1;
  if(near>far){const swap=near;near=far;far=swap;}
  if(near>enter){enter=near;nx=axis==='x'?normal:0;nz=axis==='z'?normal:0;}
  if(far<exit){exit=far;ex=axis==='x'?-normal:0;ez=axis==='z'?-normal:0;}
  if(enter>exit+EPS)return null;
 }
 return {enter,exit,nx,nz,ex,ez};
}
function obstacleHit(p,d,o,r){
 if(o.w!=null){
  const minX=o.x-o.w/2-r,maxX=o.x+o.w/2+r,minZ=o.z-o.d/2-r,maxZ=o.z+o.d/2+r;
  // A parallel path on a face is tangential, so it may slide along the wall.
  if(Math.abs(d.x)<EPS&&(Math.abs(p.x-minX)<EPS||Math.abs(p.x-maxX)<EPS))return null;
  if(Math.abs(d.z)<EPS&&(Math.abs(p.z-minZ)<EPS||Math.abs(p.z-maxZ)<EPS))return null;
  const hit=interval(p,d,minX,maxX,minZ,maxZ);
  if(!hit||hit.enter<-EPS||hit.enter>1||hit.exit<0)return null;
  if(d.x*hit.nx+d.z*hit.nz>=-EPS)return null;
  return {t:Math.max(0,hit.enter),nx:hit.nx,nz:hit.nz};
 }
 if(!Number.isFinite(o.r))return null;
 const x=p.x-o.x,z=p.z-o.z,size=o.r+r,a=d.x*d.x+d.z*d.z,b=2*(x*d.x+z*d.z),c=x*x+z*z-size*size;
 const disc=b*b-4*a*c;if(a<EPS||disc<0)return null;const t=(-b-Math.sqrt(disc))/(2*a);if(t<-EPS||t>1)return null;
 const cx=x+d.x*t,cz=z+d.z*t,length=Math.hypot(cx,cz)||1,nx=cx/length,nz=cz/length;
 return d.x*nx+d.z*nz<-EPS?{t:Math.max(0,t),nx,nz}:null;
}
function boundaryHit(p,d,bounds,r){
 if(!bounds.length)return null;
 const spans=[];for(const b of bounds){const a=interval(p,d,b.x-b.w/2+r,b.x+b.w/2-r,b.z-b.d/2+r,b.z+b.d/2-r);if(a&&a.exit>=-EPS&&a.enter<=1+EPS)spans.push(a);}
 spans.sort((a,b)=>a.enter-b.enter);let reach=0,last=null;
 for(const span of spans){if(span.enter>reach+EPS)break;if(span.exit>reach){reach=span.exit;last=span;}if(reach>=1-EPS)return null;}
 if(!last)return {t:0,nx:-Math.sign(d.x),nz:-Math.sign(d.z)};
 return {t:Math.max(0,reach),nx:-last.ex,nz:-last.ez};
}
function sweep(p,dx,dz,ctx,r){
 let at={x:p.x,z:p.z},d={x:dx,z:dz};
 for(let pass=0;pass<5&&Math.hypot(d.x,d.z)>EPS;pass++){
  let hit=boundaryHit(at,d,ctx.bounds,r);
  for(const o of ctx.obstacles){const next=obstacleHit(at,d,o,r);if(next&&(!hit||next.t<hit.t-EPS))hit=next;}
  if(!hit){at.x+=d.x;at.z+=d.z;break;}
  const t=Math.max(0,hit.t-SKIN/Math.max(SKIN,Math.hypot(d.x,d.z)));at.x+=d.x*t;at.z+=d.z*t;
  const remaining=1-hit.t;d.x*=remaining;d.z*=remaining;const toward=d.x*hit.nx+d.z*hit.nz;
  if(toward<0){d.x-=hit.nx*toward;d.z-=hit.nz*toward;}else break;
 }
 return legal(at,ctx,r)?at:{x:p.x,z:p.z};
}
function recover(p,ctx,r){
 if(legal(p,ctx,r))return p;
 const queue=[{...p}],seen=new Set();let best=null,bestDistance=Infinity;
 function add(x,z){const key=Math.round(x*1e6)+':'+Math.round(z*1e6);if(!seen.has(key)){seen.add(key);queue.push({x,z});}}
 for(let i=0;i<queue.length&&i<256;i++){
  const point=queue[i],distance=Math.hypot(point.x-p.x,point.z-p.z);
  if(legal(point,ctx,r)){if(distance<bestDistance){best=point;bestDistance=distance;}continue;}
  for(const b of ctx.bounds)add(Math.max(b.x-b.w/2+r,Math.min(b.x+b.w/2-r,point.x)),Math.max(b.z-b.d/2+r,Math.min(b.z+b.d/2-r,point.z)));
  for(const o of ctx.obstacles)if(insideObstacle(point,o,r)){
   if(o.w!=null){add(o.x-o.w/2-r-SKIN,point.z);add(o.x+o.w/2+r+SKIN,point.z);add(point.x,o.z-o.d/2-r-SKIN);add(point.x,o.z+o.d/2+r+SKIN);}
   else{const dx=point.x-o.x,dz=point.z-o.z,len=Math.hypot(dx,dz),size=o.r+r+SKIN;if(len>EPS)add(o.x+dx/len*size,o.z+dz/len*size);for(const [x,z]of [[1,0],[-1,0],[0,1],[0,-1]])add(o.x+x*size,o.z+z*size);}
  }
 }
 return best||p;
}
function move(entity,dx,dz,options={}){
 const ctx={bounds:options.bounds||[],obstacles:options.obstacles||[]},player=options.player,r=radius(entity,player);
 const start={x:Number(entity.x)||0,z:Number(entity.z)||0},safe=recover(start,ctx,r);
 let at=sweep(safe,Number.isFinite(dx)?dx:0,Number.isFinite(dz)?dz:0,ctx,r);
 const peers=options.entities||[];
 // Two deterministic passes allow a secondary crowd constraint to settle, but
 // an impossible gap never overrides a wall, pillar, closed gate or map edge.
 for(let pass=0;pass<2;pass++)for(const other of peers){
  if(other===entity||other.hp<=0)continue;
  let x=at.x-other.x,z=at.z-other.z,distance=Math.hypot(x,z);if(!Number.isFinite(distance))continue;
  const gap=Math.max(r+radius(other,player),entity===player||other===player?(entity.kind==='boss'||other.kind==='boss'?1.18:.98):.72);
  if(distance>=gap-EPS)continue;
  if(distance<EPS){x=String(entity.id||entity.kind)<String(other.id||other.kind)?-1:1;z=0;distance=1;}
  const amount=gap-Math.hypot(at.x-other.x,at.z-other.z);at=sweep(at,x/distance*amount,z/distance*amount,ctx,r);
 }
 entity.x=at.x;entity.z=at.z;return Math.hypot(at.x-start.x,at.z-start.z);
}
function segmentCast(from,to,obstacles,padding=.02){
 const start={x:Number(from.x),y:Number(from.y??1),z:Number(from.z)},d={x:Number(to.x)-Number(from.x),y:Number(to.y??1)-Number(from.y??1),z:Number(to.z)-Number(from.z)};
 if(!Object.values(start).every(Number.isFinite)||!Object.values(d).every(Number.isFinite))return null;
 padding=Math.max(0,Number(padding)||0);let best=null;
 function accept(t,normal,obstacle){if(t<-EPS||t>1+EPS||best&&t>=best.t)return;t=Math.max(0,Math.min(1,t));best={t,point:{x:start.x+d.x*t,y:start.y+d.y*t,z:start.z+d.z*t},normal,obstacle};}
 for(const o of obstacles||[]){
  const low=-padding,high=(Number.isFinite(o.h)?Math.max(0,o.h):4)+padding;
  if(o.w!=null){
   const min={x:o.x-o.w/2-padding,y:low,z:o.z-o.d/2-padding},max={x:o.x+o.w/2+padding,y:high,z:o.z+o.d/2+padding};
   let enter=-Infinity,exit=Infinity,normal={x:0,y:0,z:0},miss=false;
   for(const axis of ['x','y','z']){
    const v=d[axis],s=start[axis];if(Math.abs(v)<EPS){if(s<=min[axis]+EPS||s>=max[axis]-EPS)miss=true;continue;}
    let near=(min[axis]-s)/v,far=(max[axis]-s)/v;if(near>far){const swap=near;near=far;far=swap;}
    if(near>enter){enter=near;normal={x:0,y:0,z:0};normal[axis]=v>0?-1:1;}exit=Math.min(exit,far);if(enter>exit+EPS)miss=true;
   }
   if(miss||exit<0||enter>1)continue;
   if(enter>=-EPS){accept(enter,normal,o);continue;}
   if(['x','y','z'].every(axis=>start[axis]>min[axis]+EPS&&start[axis]<max[axis]-EPS)){
    let nearest=Infinity;for(const axis of ['x','y','z'])for(const [edge,sign]of [[min[axis],-1],[max[axis],1]]){const gap=Math.abs(start[axis]-edge);if(gap<nearest){nearest=gap;normal={x:0,y:0,z:0};normal[axis]=sign;}}
    accept(0,normal,o);
   }
  }else if(Number.isFinite(o.r)){
   const x=start.x-o.x,z=start.z-o.z,r=o.r+padding,a=d.x*d.x+d.z*d.z,b=2*(x*d.x+z*d.z),c=x*x+z*z-r*r;
   if(c<-EPS&&start.y>low+EPS&&start.y<high-EPS){const len=Math.hypot(x,z),side=r-len,under=start.y-low,over=high-start.y;accept(0,under<side&&under<over?{x:0,y:-1,z:0}:over<side?{x:0,y:1,z:0}:{x:len>EPS?x/len:1,y:0,z:len>EPS?z/len:0},o);continue;}
   const disc=b*b-4*a*c;if(a>EPS&&disc>=0){const t=(-b-Math.sqrt(disc))/(2*a),y=start.y+d.y*t,cx=x+d.x*t,cz=z+d.z*t,len=Math.hypot(cx,cz)||1;if(y>low-EPS&&y<high+EPS&&d.x*cx+d.z*cz<-EPS)accept(t,{x:cx/len,y:0,z:cz/len},o);}
   if(Math.abs(d.y)>EPS)for(const [y,sign]of [[low,-1],[high,1]]){const t=(y-start.y)/d.y,cx=x+d.x*t,cz=z+d.z*t;if(d.y*sign<0&&cx*cx+cz*cz<r*r+EPS)accept(t,{x:0,y:sign,z:0},o);}
  }
 }
 return best;
}
// Resolve the final posed silhouette, after animation and equipment attachment.
// Points stay in world space; only this module may change horizontal position.
// Roots use their normal swept collider, so pose correction cannot teleport
// through a pillar or override the map boundary.
function fitPose(entity,points,options={}){
 if(!points?.length)return {x:0,z:0,resolved:true};
 const skin=.022,box={minX:entity.x,maxX:entity.x,minZ:entity.z,maxZ:entity.z,minY:Infinity,maxY:-Infinity};
 for(const p of points){box.minX=Math.min(box.minX,p.x);box.maxX=Math.max(box.maxX,p.x);box.minZ=Math.min(box.minZ,p.z);box.maxZ=Math.max(box.maxZ,p.z);box.minY=Math.min(box.minY,p.y);box.maxY=Math.max(box.maxY,p.y);}
 const bounds=options.bounds||[],near=(options.obstacles||[]).filter(o=>box.maxY>=-skin&&box.minY<=(o.h??4)+skin&&box.minX<(o.x+(o.w??o.r*2)/2+skin)&&box.maxX>(o.x-(o.w??o.r*2)/2-skin)&&box.minZ<(o.z+(o.d??o.r*2)/2+skin)&&box.maxZ>(o.z-(o.d??o.r*2)/2-skin));
 const boundsFit=!bounds.length||bounds.some(b=>box.minX>=b.x-b.w/2+skin&&box.maxX<=b.x+b.w/2-skin&&box.minZ>=b.z-b.d/2+skin&&box.maxZ<=b.z+b.d/2-skin);
 if(!near.length&&boundsFit)return {x:0,z:0,resolved:true};
 const ctx={bounds,obstacles:options.obstacles||[]},r=radius(entity,options.player);
 const start={x:entity.x,z:entity.z};let at=recover(start,ctx,r),resolved=false;
 for(let pass=0;pass<16;pass++){
  let correction=null,worst=0;const dx=at.x-start.x,dz=at.z-start.z;
  for(const source of points||[]){
   if(!Number.isFinite(source.x)||!Number.isFinite(source.y)||!Number.isFinite(source.z))continue;
   const point={x:source.x+dx,y:source.y,z:source.z+dz};
   const hit=near.length||pass>0?segmentCast({x:at.x,y:point.y,z:at.z},point,ctx.obstacles,skin):null;
   if(hit&&Math.abs(hit.normal.y)<.5){const depth=-((point.x-hit.point.x)*hit.normal.x+(point.z-hit.point.z)*hit.normal.z)+.002;if(depth>worst){worst=depth;correction={x:hit.normal.x*depth,z:hit.normal.z*depth};}}
   if(ctx.bounds.length&&(!boundsFit||pass>0)&&!insideBounds(point,ctx.bounds,skin)){
    let nearest=null,distance=Infinity;
    for(const b of ctx.bounds){const x=Math.max(b.x-b.w/2+skin,Math.min(b.x+b.w/2-skin,point.x)),z=Math.max(b.z-b.d/2+skin,Math.min(b.z+b.d/2-skin,point.z)),d=Math.hypot(x-point.x,z-point.z);if(d<distance){distance=d;nearest={x:x-point.x,z:z-point.z};}}
    if(distance>worst){worst=distance;correction=nearest;}
   }
  }
  if(!correction||worst<.001){resolved=true;break;}
  const next=sweep(at,correction.x,correction.z,ctx,r);
  if(Math.hypot(next.x-at.x,next.z-at.z)<1e-6)break;at=next;
 }
 entity.x=at.x;entity.z=at.z;
 return {x:at.x-start.x,z:at.z-start.z,resolved};
}
const api={move,radius,segmentCast,fitPose};global.AshenNavigation=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

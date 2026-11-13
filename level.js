/* ASHEN VOW — The Exile's Procession. Original authored short level. */
(function(global){
'use strict';
function create({THREE:T,scene,renderer,M,surfaces}){
 const PI=Math.PI,TAU=PI*2,lerp=T.MathUtils.lerp;let seed=0x3c73a1;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const root=new T.Group(),architecture=new T.Group(),life=new T.Group();root.name="The Exile's Procession";root.add(architecture,life);scene.add(root);
 const textures=[],materials=[],obstacles=[],fire=[],lights=[],cloths=[],mistUniforms={clock:{value:0}};
 const bounds=[{x:0,z:15.5,w:9,d:13},{x:0,z:1.5,w:12,d:17},{x:-8.5,z:3.25,w:7,d:6.5},{x:0,z:-8,w:6.2,d:4},{x:0,z:-21,w:23,d:26}];
 const spawn={x:0,y:0,z:18},bossSpawn={x:0,y:0,z:-25};
 const checkpoints=[{id:'chapel',x:-9,y:0,z:3,name:'余火小堂',kind:'checkpoint',radius:1.8}];
 const patrols=[{id:'exile',x:-1.8,y:0,z:8,yaw:PI,name:'流放守卫',route:[[-1.8,8],[1,5],[-1.8,2]]},{id:'gatekeeper',x:2.2,y:0,z:-2,yaw:PI,name:'门前守卫',route:[[2.2,-2],[2.8,-5],[1,-1]]}];
 const interactables=[...checkpoints,{id:'gate',x:0,y:0,z:-6.0,name:'封誓之门',kind:'gate',radius:2.2}];
 function mat(color,metal=0,rough=.94){const m=new T.MeshStandardMaterial({color,metalness:metal,roughness:rough});m.color.convertSRGBToLinear();materials.push(m);return m;}
 const ashStone=mat('#697376'),obsidian=mat('#3d4b51',.05,.85),weathered=mat('#525e61'),edge=mat('#7c817b'),deep=mat('#263138'),bronze=mat('#8d734d',.65,.50),soil=mat('#2b332e'),moss=mat('#465343'),wood=mat('#302c2a'),wax=mat('#b5aa91'),robe=mat('#455052'),bone=mat('#929388');
 const flooring=mat('#566369',.04,.94),fracture=mat('#202b30'),rock=mat('#39444a'),mountain=mat('#22323d'),farMountain=mat('#1b2b39'),city=mat('#293b47');
 const flameOuter=new T.MeshBasicMaterial({color:'#e88735'}),flameInner=new T.MeshBasicMaterial({color:'#ffcf80'});materials.push(flameOuter,flameInner);
 const hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453123;return n-Math.floor(n);};
 const noise=(x,y)=>{const ix=Math.floor(x),iy=Math.floor(y),a=x-ix,b=y-iy,u=a*a*(3-2*a),v=b*b*(3-2*b);return lerp(lerp(hash(ix,iy),hash(ix+1,iy),u),lerp(hash(ix,iy+1),hash(ix+1,iy+1),u),v);};
 const patina=new Uint8Array(256*256*4),grain=new Uint8Array(256*256*4);
 for(let y=0;y<256;y++)for(let x=0;x<256;x++){const u=x/256,v=y/256,k=(y*256+x)*4,b=noise(u*4.3+5,v*4.3+17),m=noise(u*15+3,v*15+41),f=hash(x,y);const stain=Math.max(0,.56-b)*95,n=221+(m-.5)*29+(f-.5)*13-stain;patina[k]=n-3;patina[k+1]=n;patina[k+2]=n+1;patina[k+3]=255;const g=115+f*50+(m-.5)*19;grain[k]=grain[k+1]=grain[k+2]=g;grain[k+3]=255;}
 function data(bytes,srgb=false){const tex=new T.DataTexture(bytes,256,256,T.RGBAFormat);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.minFilter=T.LinearMipMapLinearFilter;tex.magFilter=T.LinearFilter;tex.generateMipmaps=true;tex.encoding=srgb?T.sRGBEncoding:T.LinearEncoding;tex.anisotropy=renderer&&renderer.capabilities?Math.min(4,renderer.capabilities.getMaxAnisotropy()):1;tex.needsUpdate=true;textures.push(tex);return tex;}
 const bump=data(grain);for(const [i,m]of [ashStone,obsidian,weathered,edge,flooring,robe,bone,rock].entries()){const map=data(patina.slice(),true);map.offset.set(i*.241,i*.173);map.rotation=i*.47;m.map=map;m.bumpMap=bump;m.bumpScale=m===flooring?.022:.036;}
 // Texture color is retained instead of multiplying photographs by dark stone tint.
 const wallMaterials=[ashStone,obsidian,weathered,edge,rock],floorMaterials=[flooring];
 if(surfaces){
  for(const m of wallMaterials){m.map=surfaces.wall.color;m.normalMap=surfaces.wall.normal;m.normalScale=new T.Vector2(.38,.38);m.roughnessMap=surfaces.wall.roughness;m.bumpMap=null;m.roughness=1;m.color.set(m===obsidian?'#727d83':m===edge?'#bec4bd':'#a3aeb1').convertSRGBToLinear();m.userData.worldUV=.38;}
  flooring.map=surfaces.floor.color;flooring.normalMap=surfaces.floor.normal;flooring.normalScale=new T.Vector2(.60,.60);flooring.roughnessMap=surfaces.floor.roughness;flooring.bumpMap=null;flooring.roughness=.68;flooring.color.set('#b1babe').convertSRGBToLinear();flooring.userData.worldUV=.32;
 }
 function group(p,x=0,y=0,z=0){const g=new T.Group();g.position.set(x,y,z);p.add(g);return g;}
 function mesh(p,geometry,material,x=0,y=0,z=0,cast=true){const m=new T.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=cast;m.receiveShadow=true;p.add(m);return m;}
 function box(p,x,y,z,w,h,d,m=ashStone,cast=true){return mesh(p,new T.BoxGeometry(w,h,d),m,x,y,z,cast);}
 function cylinder(p,x,y,z,r,h,m=ashStone,sides=12,top=r,cast=true){return mesh(p,new T.CylinderGeometry(top,r,h,sides),m,x,y,z,cast);}
 function ball(p,x,y,z,rx,ry,rz,m=ashStone,n=14){const o=mesh(p,new T.SphereGeometry(1,n,Math.max(6,n/2|0)),m,x,y,z);o.scale.set(rx,ry,rz);return o;}
 function curve(p,points,r,m=ashStone,segments=points.length*4,sides=6){return mesh(p,new T.TubeGeometry(new T.CatmullRomCurve3(points.map(q=>new T.Vector3(...q))),segments,r,sides,false),m);}
 function beam(p,a,b,r,m=ashStone,sides=7){const v=new T.Vector3(...a),w=new T.Vector3(...b),d=w.clone().sub(v),mid=v.clone().add(w).multiplyScalar(.5);const o=cylinder(p,mid.x,mid.y,mid.z,r,d.length(),m,sides);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return o;}
 function ring(p,x,y,z,r,t,m=bronze,n=40){return mesh(p,new T.TorusGeometry(r,t,5,n),m,x,y,z);}
 function blockCollision(x,z,w,d,name='wall'){const c={x,z,w,d,kind:name};obstacles.push(c);return c;}
 // Chamfered rectangular piers carry weight into stepped footings.
 function chamfer(w,d,h,ch=.14){const s=new T.Shape(),x=w*.5,z=d*.5;s.moveTo(-x+ch,-z);s.lineTo(x-ch,-z);s.lineTo(x,-z+ch);s.lineTo(x,z-ch);s.lineTo(x-ch,z);s.lineTo(-x+ch,z);s.lineTo(-x,z-ch);s.lineTo(-x,-z+ch);s.closePath();const g=new T.ExtrudeGeometry(s,{depth:h,bevelEnabled:false,steps:1});g.rotateX(-PI/2);return g;}
 function pier(p,x,z,h=6,w=1.1,d=1.25){const q=group(p,x,0,z);box(q,0,.16,0,w+.4,.32,d+.4,deep);box(q,0,.39,0,w+.22,.14,d+.22,edge);mesh(q,chamfer(w,d,h-.55,.12),obsidian,0,.46,0);for(const y of [1.2,h*.53,h-.22])box(q,0,y,0,w+.075,.10,d+.075,weathered);box(q,0,h+.04,0,w+.3,.23,d+.3,edge);box(q,0,h+.23,0,w+.48,.15,d+.45,deep);return q;}
 // The vault is a continuous, supported mass, not disconnected decorative arches.
 function pointedShape(half,rise,base,segments=32){const pts=[];for(let i=0;i<=segments;i++){const x=-half+2*half*i/segments;pts.push([x,base+rise*Math.sqrt(Math.max(0,1-Math.abs(x)/half))]);}return pts;}
 function arch(p,cx,base,z,span,rise,thickness=.5,depth=.7,m=ashStone,broken=false){const outer=pointedShape(span*.5+thickness,rise+thickness,base),inner=pointedShape(span*.5,rise,base);const s=new T.Shape();s.moveTo(...outer[0]);for(const pt of outer.slice(1))s.lineTo(...pt);s.lineTo(...inner[inner.length-1]);for(const pt of inner.slice(0,-1).reverse())s.lineTo(...pt);s.closePath();const g=new T.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSegments:1,bevelSize:.025,bevelThickness:.025,steps:1,curveSegments:1});g.translate(0,0,-depth*.5);const o=mesh(p,g,m,cx,0,z);if(broken){const a=g.attributes.position;for(let i=0;i<a.count;i++){if(a.getX(i)>0&&a.getY(i)>base+rise*.8)a.setY(i,a.getY(i)-.18*hash(i,3));}a.needsUpdate=true;g.computeVertexNormals();}return o;}
 function structuralWindow(p,x,y,z,w,h){const q=group(p,x,y,z);box(q,-w*.5-.10,h*.5,0,.18,h,.27,edge);box(q,w*.5+.10,h*.5,0,.18,h,.27,edge);box(q,0,-.07,0,w+.45,.16,.42,edge);arch(q,0,h,0,w,w*.68,.15,.28,edge);box(q,0,h*.50,.02,.075,h,.12,bronze);return q;}
 function wall(x,z,w,d,h=4.1,broken=false){const q=group(architecture,x,0,z);box(q,0,h*.5,0,w,h,d,weathered);box(q,0,.18,0,w+.13,.36,d+.15,deep);if(!broken)box(q,0,h+.10,0,w+.16,.22,d+.18,edge);else{const n=Math.max(2,Math.floor(w/1.2));for(let i=0;i<n;i++){const xx=-w*.5+(i+.5)*w/n,hh=.16+random()*.55;box(q,xx,h+hh*.5,0,w/n*.86,hh,d*.88,i%2?obsidian:ashStone);}}for(let y=.95;y<h-.3;y+=1.1)box(q,0,y,d*.5+.012,w,.025,.025,deep);const c=blockCollision(x,z,w,d);c.h=h+.25;return q;}

 // Broad ash-stained ground surfaces and a handful of large cracked processional
 // stones establish scale; no evenly repeated tile grid covers the level.
 function floor(x,z,w,d,m=flooring){const g=new T.BoxGeometry(w,.22,d),a=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;for(let i=0;i<a.count;i++){if(n.getY(i)>.8)uv.setXY(i,(a.getX(i)+x)*.12,(a.getZ(i)+z)*.12);}box(architecture,x,-.45,z,w+.8,.65,d+.8,rock);return mesh(architecture,g,m,x,-.12,z,false);}
 floor(0,15.5,9,13,flooring);floor(0,1.5,12,17);floor(-8.5,3.25,7,6.5);floor(0,-8,6.2,4,obsidian);floor(0,-21,23,26);
 for(let i=0;i<10;i++){const z=18-i*2.55,w=3.15+(i%3)*.21,d=2.1+(i%2)*.15,q=group(architecture,(i%2?-.17:.12),0,z);q.rotation.y=(i%2?1:-1)*.018;const stone=mesh(q,chamfer(w,d,.055,.14),i%3===1?weathered:ashStone,0,-.035,0,false);}
 // Large, irregular fracture branches, with subtle bronze seams in the inner hall.
 for(const [x,z,yaw,length]of [[-2.7,14,.6,2.3],[2.2,10,-.5,2.9],[-3,4,.2,3.5],[2,-3,1.8,3.0],[-5,-14,.3,4.8],[3,-20,-.7,5.4],[-4,-26,.7,4.2],[4,-30,1.0,3.1]]){const q=group(architecture,x,.013,z);q.rotation.y=yaw;curve(q,[[-length*.5,0,0],[-length*.15,0,.13],[length*.16,0,-.14],[length*.5,0,.11]],.012,fracture,7,3);curve(q,[[length*.16,0,-.14],[length*.22,0,-.43],[length*.35,0,-.61]],.007,fracture,4,3);}
 function groundPatch(x,z,rx,rz,m=soil){const pts=[],count=11;for(let i=0;i<count;i++){const a=i/count*TAU,r=.72+random()*.28;pts.push(new T.Vector2(Math.cos(a)*rx*r,Math.sin(a)*rz*r));}const s=new T.Shape(pts),o=mesh(architecture,new T.ShapeGeometry(s),m,x,.015,z,false);o.rotation.x=-PI/2;return o;}

 // I. The arrival: a collapsed portico, thick perimeter walls and a view back
 // over the ashen valley. The dominant axis leads directly to the sealed gate.
 wall(-5.0,16.0,1.0,12.3,2.9,true);wall(5.0,16.0,1.0,12.3,3.6,true);
 for(const x of [-4.15,4.15])pier(architecture,x,20.1,5.0,1.05,1.3);
 arch(architecture,0,5.0,20.1,7.3,2.0,.52,1.0,ashStone,true);
 const brokenLintel=box(architecture,-2.6,.25,19,1.5,.48,.9,obsidian);brokenLintel.rotation.y=.42;
 blockCollision(-2.6,19,1.5,.9,'fallen masonry');
 // Exile court walls open only where the small side chapel actually connects.
 wall(6.55,1.2,1.1,18.2,5.2,true);wall(-6.55,8.4,1.1,3.3,4.3,true);wall(-6.55,-3.45,1.1,6.9,5.4,true);
 wall(-5.7,11.4,1.8,1.1,3.4,true);wall(5.7,11.4,1.8,1.1,4.0,true);
 // Heavy external buttresses and inset narrow windows make the long wall read
 // as a building rather than a fence. Each has a purposeful different break.
 for(const z of [8.9,2.3,-4.7]){const q=pier(architecture,6.8,z,6.2,.85,1.9);const foot=box(q,.55,1.5,0,1.25,3,1.7,obsidian);foot.rotation.z=-.15;}
 for(const z of [6,-1.1]){const w=structuralWindow(architecture,5.96,2.5,z,1.1,1.8);w.rotation.y=-PI/2;}
 // The east gallery has a roof remnant, an inaccessible stair and a collapsed
 // clerestory. The entrance remains clear and the structure is visibly supported.
 const gallery=group(architecture,8.8,0,2.0);box(gallery,0,1.1,0,3.3,2.2,8,deep);
 for(let i=0;i<7;i++)box(gallery,0,.20+i*.23,3.5-i*.46,2.45,.24,.56,weathered);
 pier(gallery,-1.0,-3.1,7.6,.9,1.0);pier(gallery,1.0,-3.1,6.1,.9,1.0);box(gallery,0,6.15,-3.1,3.1,.4,1.2,obsidian);
 const roof=box(gallery,0,6.0,-1.6,3.3,.22,3.3,deep);roof.rotation.x=.14;
 for(const a of [-.8,.2,.9]){const b=beam(gallery,[a,5.2,-2.7],[a+1.2,6.6,-.4],.065,wood,5);}

 // II. The Chapel of Embers: an asymmetric refuge, identified by its single
 // warm window, open east door and a small shrine beneath the broken roof.
 wall(-12.55,3.25,1.1,7.6,6.9,true);wall(-9.0,7.05,8.2,1.1,5.8,true);wall(-9.0,-.55,8.2,1.1,5.5,true);
 for(const z of [.3,6.2])pier(architecture,-6.5,z,5.0,.9,1.0);
 const chapelDoor=group(architecture,-6.35,0,3.25);chapelDoor.rotation.y=PI/2;arch(chapelDoor,0,4.8,0,4.7,1.65,.4,.75,ashStone);
 for(const z of [.5,6.0])pier(architecture,-11.4,z,6.3,.65,.8);
 const westWindow=structuralWindow(architecture,-11.96,2.6,3.2,1.4,2.15);westWindow.rotation.y=PI/2;
 // An amber mineral lens is genuine mesh geometry set into the old window.
 const glass=mat('#ae6f33',.1,.44);glass.emissive.set('#6e3915');glass.emissiveIntensity=.32;const lens=mesh(architecture,new T.IcosahedronGeometry(.58,0),glass,-11.83,4.75,3.2);lens.scale.set(.075,1.75,.78);
 const chapelRib=group(architecture,-9.0,0,3.3);chapelRib.rotation.y=PI/2;arch(chapelRib,0,6.4,0,5.8,1.7,.25,.35,edge,true);
 for(const [x,z,slope]of [[-10.1,1.5,-.19],[-9.5,5.9,.18]]){const o=box(architecture,x,7.0,z,2.4,.22,2.2,deep);o.rotation.x=slope;}
 // The shrine has a hand-carved bowl, a reliquary sword and an ash branch crest.
 const altar=group(architecture,-10.8,0,3.25);box(altar,0,.18,0,1.2,.36,1.8,deep);box(altar,0,.5,0,.75,.5,1.35,obsidian);box(altar,0,.80,0,1.05,.12,1.7,edge);
 const bowlProfile=[new T.Vector2(.12,0),new T.Vector2(.19,.07),new T.Vector2(.34,.17),new T.Vector2(.38,.24),new T.Vector2(.35,.26),new T.Vector2(.30,.18)];mesh(altar,new T.LatheGeometry(bowlProfile,20),bronze,0,.85,0);
 beam(altar,[0,1.0,0],[0,2.25,0],.035,M.steel||edge,6);box(altar,0,1.78,0,.49,.065,.10,bronze);ball(altar,0,2.30,0,.06,.08,.06,bronze);
 for(const s of [-1,1])for(let i=0;i<3;i++)beam(altar,[0,1.4+i*.11,.06],[s*(.10+i*.03),1.51+i*.11,.06],.013,bronze,5);
 blockCollision(-10.8,3.25,1.3,1.9,'chapel altar');

 // III. The Oath Gate: two articulated heavy leaves, carried by stone towers.
 for(const side of [-1,1]){
  pier(architecture,side*3.85,-8.0,7.0,1.65,2.1);wall(side*8.2,-8,6.7,1.4,5.5,true);
  const tower=group(architecture,side*5.0,0,-9.0);box(tower,0,4.8,0,2.15,9.6,3.1,obsidian);box(tower,0,9.7,0,2.65,.30,3.4,edge);cylinder(tower,0,10.9,0,1.65,2.05,deep,4,0).rotation.y=PI/4;cylinder(tower,0,12.2,0,.065,.8,bronze,6,0);
  const buttress=box(architecture,side*5.75,2.4,-6.6,1.1,4.8,3.7,weathered);buttress.rotation.x=-.06;
 }
 arch(architecture,0,7.0,-8,6.0,3.5,.85,1.75,obsidian);arch(architecture,0,7.08,-7.02,6.0,3.0,.13,.12,bronze);
 const seal=ring(architecture,0,8.85,-6.99,.46,.075,bronze,40);beam(architecture,[0,8.25,-6.9],[0,9.45,-6.9],.04,bronze,6);
 const doorLeft=group(life,-3.02,0,-8.05),doorRight=group(life,3.02,0,-8.05);
 function door(p,side){const x=-side*1.50;box(p,x,2.72,0,2.98,5.44,.30,wood);box(p,x,2.72,-.02,2.78,5.10,.32,obsidian);for(const xx of [x-1.35,x+1.35])box(p,xx,2.72,.20,.105,5.3,.08,bronze);for(const y of [.23,2.3,5.2])box(p,x,y,.20,2.8,.11,.08,bronze);for(let i=0;i<5;i++){const xx=x-1.0+i*.5;box(p,xx,2.76,.22,.035,4.55,.035,bronze);}
  const center=group(p,x,2.85,.25);ring(center,0,0,0,.47,.04,bronze);for(const s of [-1,1])for(let i=0;i<3;i++)beam(center,[0,-.5+i*.28,.02],[s*(.22-i*.045),-.23+i*.28,.02],.018,bronze,5);beam(center,[0,-.9,.02],[0,.88,.02],.025,bronze,6);
  for(const y of [1.1,4.3]){const hinge=cylinder(p,0,y,.02,.115,.7,bronze,10);box(p,x,y,.23,2.76,.14,.08,bronze);}
 }
 door(doorLeft,-1);door(doorRight,1);const gateBarrier={x:0,z:-8,w:6.3,d:.7,kind:'gate'};obstacles.push(gateBarrier);let gateTarget=0,gateAmount=0;

 // IV. Hall of the Uncrowned: a broad, quiet fighting floor framed by massive
 // side piers and a broken roof. Its throne and vertical rear aperture set the
 // encounter's scale instead of a decorative circular arena border.
 wall(-12.2,-21.0,1.4,26.8,6.0,true);wall(12.2,-21.0,1.4,26.8,7.2,true);wall(0,-34.7,25.5,1.8,9.2,true);
 for(const side of [-1,1])for(const [z,h]of [[-14.5,7.0],[-24,8.8],[-31.0,9.3]]){
  const q=pier(architecture,side*10.75,z,h,1.3,1.6);box(q,side*.72,h*.35,0,1.2,h*.70,2.0,deep);const brace=box(q,side*.55,h*.62,0,.65,h*.53,1.8,weathered);brace.rotation.z=side*.20;
  blockCollision(side*10.75,z,1.65,1.8,'hall pier');
 }
 // Roof ribs terminate on these piers; missing center bays expose the night sky.
 for(const [z,base,rise]of [[-14.5,7.0,3.9],[-24,8.8,4.3],[-31,9.3,4.5]]){
  arch(architecture,0,base,z,20.2,rise,.55,.95,weathered,true);
 }
 const roofLeft=box(architecture,-9.0,11.0,-27.6,4.0,.32,7.0,deep);roofLeft.rotation.z=-.11;
 const roofRight=box(architecture,9.4,10.5,-17.9,3.2,.28,5.9,deep);roofRight.rotation.z=.14;
 // Tall, empty lancet openings stand proud of the rear wall. The wall ends
 // below their upper halves, so their negative space reads against the sky.
 for(const x of [-6.5,0,6.5]){const q=group(architecture,x,0,-33.7);for(const side of [-1,1])pier(q,side*1.42,0,x===0?13.4:10.8,.52,.70);arch(q,0,x===0?13.4:10.8,0,2.32,2.25,.30,.75,edge);box(q,0,x===0?10.8:9.0,.38,.07,x===0?5.3:3.0,.08,bronze);}
 // A restrained ash-seal is set into the stone, offset under the boss's opening
 // position. Its discontinuity and radial fissures avoid a bright target decal.
 const sealFloor=group(architecture,0,.017,-25.0);for(const [start,len]of [[.12,1.8],[2.4,1.7],[4.7,1.0]]){const o=mesh(sealFloor,new T.TorusGeometry(4.4,.016,4,54,len),bronze);o.rotation.set(PI/2,0,start);}for(const a of [.3,2.2,4.5])curve(sealFloor,[[Math.sin(a)*1.3,0,Math.cos(a)*1.3],[Math.sin(a+.06)*2.5,0,Math.cos(a+.06)*2.5],[Math.sin(a-.03)*4.5,0,Math.cos(a-.03)*4.5]],.018,fracture,7,3);
 // The raised rear shrine is intentionally outside the fighting route.
 for(let i=0;i<5;i++)box(architecture,0,.10+i*.21,-31.2-i*.57,7.6-i*.32,.22,.72,weathered);
 blockCollision(0,-32.6,8.0,3.4,'raised shrine');
 const throne=group(architecture,0,1.1,-33.4);box(throne,0,.16,0,2.2,.32,1.6,deep);box(throne,0,.56,0,1.6,.46,1.3,obsidian);box(throne,0,1.7,-.47,1.6,2.4,.30,obsidian);for(const x of [-.95,.95]){box(throne,x,.90,.05,.32,1.5,1.6,weathered);cylinder(throne,x,1.85,-.47,.12,.7,bronze,5,0);}arch(throne,0,2.8,-.47,1.5,1.3,.22,.36,edge);box(throne,0,1.5,-.27,.035,1.55,.04,bronze);

 // Sculptural landmarks have individual placement and readable silhouette.
 function mourner(x,z,s=1,headless=false,yaw=0){const q=group(architecture,x,0,z);q.scale.setScalar(s);q.rotation.y=yaw;box(q,0,.18,0,1.35,.36,1.35,deep);box(q,0,.45,0,1.14,.18,1.14,edge);const profile=[new T.Vector2(.48,.55),new T.Vector2(.45,.8),new T.Vector2(.29,1.65),new T.Vector2(.33,2.15),new T.Vector2(.24,2.43)];mesh(q,new T.LatheGeometry(profile,18),robe);for(let i=0;i<7;i++){const a=i/7*TAU;curve(q,[[Math.sin(a)*.46,.58,Math.cos(a)*.46],[Math.sin(a)*.31,1.5,Math.cos(a)*.31],[Math.sin(a)*.26,2.29,Math.cos(a)*.26]],.022,weathered,8,4);}if(!headless){ball(q,0,2.67,0,.23,.29,.22,bone);const hood=mesh(q,new T.SphereGeometry(.31,14,10,0,TAU,0,PI*.64),obsidian,0,2.78,-.04);hood.scale.y=1.1;ball(q,0,2.65,.20,.14,.17,.025,deep,10);}for(const side of [-1,1]){beam(q,[side*.28,2.12,0],[side*.36,1.75,.20],.085,robe);beam(q,[side*.36,1.75,.20],[side*.05,1.9,.40],.07,robe);}cylinder(q,0,1.82,.40,.11,.21,bronze,9,.16);return q;}
 mourner(-4.65,-5.6,1.05,false,.14);mourner(4.6,-5.6,1.05,true,-.14);mourner(-8.8,-30.6,1.52,false,.4);mourner(8.9,-30.2,1.52,true,-.4);
 // Headstones and collapsed architectural fragments belong at the boundaries.
 for(const [x,z,yaw]of [[-3.9,14.0,.1],[3.5,19.1,-.2],[-5.1,9.8,.15],[4.8,5.3,-.3],[-11.1,5.6,.6],[9.5,-18.5,-.8],[-10,-27.2,.2]]){const q=group(architecture,x,0,z);q.rotation.y=yaw;q.rotation.z=.06;box(q,0,.40,0,.48,.8,.15,weathered);ball(q,0,.81,0,.24,.14,.075,weathered,10);box(q,0,.52,.085,.04,.27,.025,bronze);box(q,0,.58,.085,.20,.04,.025,bronze);}
 for(const [cx,cz,count,radius]of [[-5.5,10,15,1.0],[5.2,-4,19,1.1],[-10.8,-16,24,1.3],[10.7,-28,25,1.2],[-11.6,6,15,.7]])for(let i=0;i<count;i++){const a=random()*TAU,r=random()*radius,s=.10+random()*.26;const o=box(architecture,cx+Math.sin(a)*r,s*.35,cz+Math.cos(a)*r,s*1.9,s*.7,s,random()>.5?ashStone:obsidian);o.rotation.set(random()*.3,random()*TAU,random()*.3);}
 // A fallen sculpted head, half-buried shield and fractured column add sparse
 // close-up points of interest without occupying the line of combat.
 const fallen=group(architecture,9.1,.44,-13.0);fallen.rotation.set(.3,-.4,-.8);ball(fallen,0,0,0,.37,.47,.34,bone,18);ball(fallen,0,0,.30,.24,.27,.10,edge);box(fallen,0,.12,.40,.50,.08,.07,deep);beam(fallen,[0,.0,.40],[0,-.13,.43],.033,edge,5);for(const x of [-.18,.18])ball(fallen,x,.06,.39,.07,.025,.022,deep,10);
 const fallenColumn=cylinder(architecture,-9.8,.43,-21.1,.40,2.9,weathered,12);fallenColumn.rotation.set(.15,0,PI*.5);blockCollision(-9.8,-21.1,3.1,.85,'fallen column');

 // Trees and roots extend from the surrounding earth, not the stone floor.
 function tree(x,z,h=6,s=1){const q=group(architecture,x,-.3,z);q.scale.setScalar(s);curve(q,[[0,0,0],[.2,h*.3,0],[-.1,h*.65,.11],[.15,h,.05]],.16,wood,22,7);for(let i=0;i<5;i++){const a=i*2.45,yy=h*(.30+i*.11),length=1.0+i*.16;curve(q,[[.04,yy,0],[Math.cos(a)*length*.55,yy+.35,Math.sin(a)*length*.55],[Math.cos(a)*length,yy+1.3,Math.sin(a)*length]],.055,wood,9,5);}for(let i=0;i<5;i++){const a=i/5*TAU;curve(q,[[0,.18,0],[Math.sin(a)*.45,.02,Math.cos(a)*.45],[Math.sin(a)*1.1,-.02,Math.cos(a)*1.1]],.065,wood,7,5);}}
 for(const [x,z,h,s]of [[-8.4,16.5,7,1.1],[9.4,12,6.6,1.1],[-16,1,7.8,1.2],[16,-19,9,1.4],[-16,-30,8,1.2],[14,-37,9,1.4]])tree(x,z,h,s);
 for(const [x,z]of [[-5.7,14],[5.5,8],[-11.9,4],[11.2,-17],[-11.2,-28]]){const q=group(architecture,x,.03,z);curve(q,[[0,0,0],[.3,.05,.6],[.15,.04,1.3],[.5,.02,1.9]],.026,wood,12,5);}
 const grass=mat('#62684c');for(const [cx,cz]of [[-4.1,15],[4.2,17],[-5.5,7],[5.1,3],[-11.5,5],[10.9,-25],[-10.8,-15]])for(let i=0;i<10;i++){const q=group(architecture,cx+(random()-.5)*.7,0,cz+(random()-.5)*1.2);for(let j=0;j<3;j++){const h=.17+random()*.25,o=mesh(q,new T.ConeGeometry(.012,h,3),grass,(random()-.5)*.15,h*.5,(random()-.5)*.15,false);o.rotation.z=(random()-.5)*.6;}}

 // Firelight creates a few deliberate warm islands: the refuge, gate and throne.
 function flame(x,y,z,size=1){const q=group(life,x,y,z);for(let i=0;i<2;i++){const profile=[new T.Vector2(0,-.05),new T.Vector2(.12,.02),new T.Vector2(.10,.24),new T.Vector2(.035,.47),new T.Vector2(0,.65)],o=mesh(q,new T.LatheGeometry(profile,8),i?flameInner:flameOuter,(i?-.03:.025),0,0,false);o.scale.setScalar(size*(i?.65:1));fire.push({mesh:o,scale:o.scale.clone(),phase:random()*TAU});}return q;}
 function torch(x,z,h=1.8,type='stand'){const q=group(architecture,x,0,z);if(type==='stand'){cylinder(q,0,.16,0,.30,.32,deep,9);cylinder(q,0,h*.5+.15,0,.07,h-.2,bronze,8,.05);cylinder(q,0,h,0,.24,.17,obsidian,10,.32);for(const s of [-1,1])beam(q,[s*.20,h,0],[s*.30,h+.30,0],.022,bronze,5);}else{beam(q,[0,h-.5,-.25],[0,h,.1],.045,bronze,6);cylinder(q,0,h,.1,.20,.2,obsidian,9,.25);}flame(x,h+.08,z+.05,.88);const l=new T.PointLight('#efac65',27,8.5,2);l.position.set(x,h+.43,z+.12);life.add(l);lights.push({light:l,base:27,phase:random()*TAU});}
 torch(-4.7,10.5,1.6);torch(4.7,-5.2,1.9);torch(-4.7,-5.2,1.9);torch(-8.2,-29.5,2.0);torch(8.2,-29.5,2.0);flame(-10.8,1.03,3.25,.55);const shrineLight=new T.PointLight('#ffbd70',29,7.5,2);shrineLight.position.set(-10.0,1.7,3.25);life.add(shrineLight);lights.push({light:shrineLight,base:29,phase:1});
 function candle(x,z,h=.25){cylinder(architecture,x,h*.5+.02,z,.03,h,wax,7);const f=ball(life,x,h+.055,z,.02,.05,.02,flameInner,7);f.castShadow=false;fire.push({mesh:f,scale:f.scale.clone(),phase:random()*TAU});}
 for(const [x,z,h]of [[-10.2,2.4,.32],[-10.5,4.3,.21],[-9.8,4.8,.25],[-11.4,2.1,.35],[-11.5,4.5,.18],[-9.7,2.1,.2],[-1,-32.5,.25],[1.1,-32.8,.31]])candle(x,z,h);

 // Two old hanging banners supply secondary motion and human scale.
 const cloth=mat('#4d3030');cloth.side=T.DoubleSide;
 for(const [x,z,h,yaw]of [[6.0,-3.0,5.0,-PI/2],[-11.6,-27,7.0,PI/2]]){const q=group(life,x,h,z);q.rotation.y=yaw;const geo=new T.PlaneGeometry(1.0,2.4,8,14),base=geo.attributes.position.array.slice();const o=mesh(q,geo,cloth,0,-1.1,0,false);beam(q,[-.62,.18,0],[.62,.18,0],.025,bronze,6);const a=geo.attributes.position;for(let i=0;i<a.count;i++)if(a.getY(i)<-.9)a.setY(i,a.getY(i)+Math.sin(a.getX(i)*17)*.09);cloths.push({mesh:o,base,phase:x});}

 // Actual landscape meshes anchor the walls in a valley rather than a flat void.
 const terrainGeo=new T.PlaneGeometry(180,180,64,64);terrainGeo.rotateX(-PI/2);const pa=terrainGeo.attributes.position;
 for(let i=0;i<pa.count;i++){const x=pa.getX(i),z=pa.getZ(i)+7;let clearance=Infinity;for(const b of bounds){const dx=Math.max(0,Math.abs(x-b.x)-b.w*.5),dz=Math.max(0,Math.abs(z-b.z)-b.d*.5);clearance=Math.min(clearance,Math.hypot(dx,dz));}const outside=Math.max(0,(clearance-3)/25),h=-1.2+Math.min(1,outside)*(4+noise(x*.055,z*.055)*13)+Math.max(0,outside-1)*4;pa.setY(i,h);}
 terrainGeo.computeVertexNormals();mesh(architecture,terrainGeo,soil,0,-.3,7,false);
 function ridge(radius,height,m,phase){const p=[],uv=[],idx=[],n=72;for(let i=0;i<=n;i++){const a=i/n*TAU,crest=height*(.59+.27*Math.sin(a*5+phase)+.16*Math.sin(a*9+.6*phase));for(let row=0;row<3;row++){const r=radius+row*13;p.push(Math.sin(a)*r,row===1?crest:-4,Math.cos(a)*r-10);uv.push(i/n,row*.5);}}for(let i=0;i<n;i++)for(let j=0;j<2;j++){const a=i*3+j,b=a+3;idx.push(a,b,a+1,a+1,b,b+1);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();m.side=T.DoubleSide;mesh(architecture,g,m,0,0,0,false);}
 ridge(45,22,mountain,1.4);ridge(70,35,farMountain,2.3);
 // A distant split cathedral is deliberately offset from the local gate axis.
 const distant=group(architecture,-26,0,-63);box(distant,0,9,0,10,18,5,city,false);for(const x of [-6.6,6.6]){cylinder(distant,x,13.3,0,1.7,26.6,city,8,1.35,false);cylinder(distant,x,30.2,0,2.0,7.1,city,6,0,false);}const dRoof=cylinder(distant,0,20.4,0,4.0,5.0,city,4,0,false);dRoof.scale.z=.7;dRoof.rotation.y=PI/4;
 const moonMaterial=new T.MeshBasicMaterial({color:'#a8b9bf',fog:false});materials.push(moonMaterial);mesh(life,new T.SphereGeometry(3.0,28,16),moonMaterial,-25,32,-78,false);

 // Sculpted low mist curls along walls and behind the gate, with soft alpha and
 // depth testing. The center of each encounter remains readable.
 const mist=new T.ShaderMaterial({uniforms:mistUniforms,transparent:true,depthWrite:false,side:T.DoubleSide,
  vertexShader:'varying vec2 uv0;varying vec3 world;void main(){uv0=uv;vec4 p=modelMatrix*vec4(position,1.);world=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}',
  fragmentShader:`precision mediump float;uniform float clock;varying vec2 uv0;varying vec3 world;float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}void main(){vec2 p=world.xz*.18+vec2(-clock*.045,clock*.013)+uv0*2.;float f=n(p)*.66+n(p*2.1+4.)*.34;vec2 q=(uv0-.5)*2.;float a=(1.-smoothstep(.12,1.,dot(q,q)))*smoothstep(.22,.70,f)*(1.-smoothstep(.22,.96,uv0.y))*.20;gl_FragColor=vec4(.24,.31,.34,a);}`});materials.push(mist);
 for(const [x,z,w,rot]of [[-5.4,4,11,PI/2],[5.4,1,10,PI/2],[-10.3,-21,17,PI/2],[10.4,-23,16,PI/2],[0,-32,18,0],[0,-9.5,5.5,0]]){const o=mesh(life,new T.PlaneGeometry(w,1.6),mist,x,.83,z,false);o.rotation.y=rot;o.renderOrder=2;}
 const ashGeo=new T.BufferGeometry(),ash=new Float32Array(180*3);for(let i=0;i<180;i++){ash[i*3]=(random()-.5)*29;ash[i*3+1]=.2+random()*11;ash[i*3+2]=-32+random()*52;}ashGeo.setAttribute('position',new T.BufferAttribute(ash,3));const ashMaterial=new T.PointsMaterial({color:'#9caeae',size:.028,transparent:true,opacity:.28,depthWrite:false});materials.push(ashMaterial);life.add(new T.Points(ashGeo,ashMaterial));

 // Rain-polished shallow pools use physical environment reflections, not a painted glow.
 const wet=new T.MeshPhysicalMaterial({color:new T.Color('#667d83').convertSRGBToLinear(),metalness:.12,roughness:.16,clearcoat:1,clearcoatRoughness:.08,transparent:true,opacity:.48,depthWrite:false});materials.push(wet);
 if(surfaces){wet.normalMap=surfaces.floor.normal;wet.normalScale=new T.Vector2(.07,.07);}
 for(const [x,z,rx,rz]of [[-2.1,16,.85,1.9],[2.9,12,1.1,1.7],[-3.6,6,.6,1.2],[3.7,1,1.15,2.1],[-2.8,-3,.6,.9],[-4,-16,1.0,1.8],[5,-22,1.6,1.1],[-5,-27,1.1,1.9]]){const pool=groundPatch(x,z,rx,rz,wet);pool.position.y=.026;}
 const leafMaterial=mat('#455743',0,.88),leafShape=new T.Shape();leafShape.moveTo(0,0);leafShape.quadraticCurveTo(.09,.11,0,.24);leafShape.quadraticCurveTo(-.09,.11,0,0);const leafGeo=new T.ShapeGeometry(leafShape,3);leafMaterial.side=T.DoubleSide;
 const ivy=new T.InstancedMesh(leafGeo,leafMaterial,520),leafDummy=new T.Object3D();ivy.castShadow=false;ivy.receiveShadow=true;
 for(let i=0;i<520;i++){const side=i<300?1:-1,wallX=side>0?5.94:-5.94,z=(i<300?7:-2)+Math.sin(i*.24)*1.6+(random()-.5)*.85,y=.2+(i%90)/90*4.2;
  leafDummy.position.set(wallX-side*(.035+random()*.08),y,z);leafDummy.rotation.set((random()-.5)*.8,side*PI/2,(random()-.5)*2);leafDummy.scale.setScalar(.65+random()*.8);leafDummy.updateMatrix();ivy.setMatrixAt(i,leafDummy.matrix);
 }life.add(ivy);
 // Static surfaces collapse into a small number of GPU submissions while
 // moving doors, flames, fabric and mist retain their own geometry.
 architecture.updateMatrixWorld(true);const buckets=new Map(),old=[];
 architecture.traverse(o=>{if(!o.isMesh)return;const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);if(o.material.userData.worldUV){const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv,s=o.material.userData.worldUV;if(uv)for(let i=0;i<p.count;i++){const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));uv.setXY(i,(ny>nx&&ny>nz?p.getX(i):nx>nz?p.getZ(i):p.getX(i))*s,(ny>nx&&ny>nz?p.getZ(i):p.getY(i))*s);}}const key=o.material.uuid+(o.castShadow?'1':'0');if(!buckets.has(key))buckets.set(key,{material:o.material,cast:o.castShadow,p:[],n:[],uv:[]});const b=buckets.get(key);b.p.push(g.attributes.position.array);b.n.push(g.attributes.normal.array);b.uv.push(g.attributes.uv?g.attributes.uv.array:new Float32Array(g.attributes.position.count*2));old.push(o);g.dispose();});
 const concat=arrays=>{const a=new Float32Array(arrays.reduce((n,b)=>n+b.length,0));let at=0;for(const b of arrays){a.set(b,at);at+=b.length;}return a;};
 let staticTriangles=0;for(const b of buckets.values()){const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(concat(b.p),3));g.setAttribute('normal',new T.BufferAttribute(concat(b.n),3));g.setAttribute('uv',new T.BufferAttribute(concat(b.uv),2));g.computeBoundingSphere();staticTriangles+=g.attributes.position.count/3;mesh(root,g,b.material,0,0,0,b.cast);}
 for(const o of old){o.parent.remove(o);o.geometry.dispose();}root.remove(architecture);
 const stats={staticDraws:buckets.size,staticTriangles,rooms:5};
 return {root,obstacles,bounds,spawn,checkpoints,bossSpawn,patrols,interactables,stats,
  setGate(open){gateTarget=open?1:0;const i=obstacles.indexOf(gateBarrier);if(open&&i>=0)obstacles.splice(i,1);else if(!open&&i<0)obstacles.push(gateBarrier);},
  update(dt,t){mistUniforms.clock.value=t;gateAmount=lerp(gateAmount,gateTarget,1-Math.exp(-1.9*dt));doorLeft.rotation.y=gateAmount*PI*.56;doorRight.rotation.y=-gateAmount*PI*.56;for(const f of fire){f.mesh.scale.y=f.scale.y*(.86+Math.sin(t*7.4+f.phase)*.18);f.mesh.scale.x=f.scale.x*(.94+Math.sin(t*5.3+f.phase)*.1);f.mesh.rotation.z=Math.sin(t*3.4+f.phase)*.09;}for(const l of lights)l.light.intensity=l.base*(.96+Math.sin(t*5+l.phase)*.045);for(const b of cloths){const p=b.mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){const x=b.base[i*3],y=b.base[i*3+1],u=(1.2-y)/2.4;p.setZ(i,Math.sin(t*1.7+x*2+y*1.8+b.phase)*.11*u);};p.needsUpdate=true;b.mesh.geometry.computeVertexNormals();}const a=ashGeo.attributes.position;for(let i=0;i<a.count;i++){a.setY(i,(a.getY(i)+dt*.055)%11);a.setX(i,a.getX(i)+Math.sin(t*.31+i)*dt*.014);}a.needsUpdate=true;},
  dispose(){const seen=new Set();root.traverse(o=>{if(o.geometry&&!seen.has(o.geometry)){seen.add(o.geometry);o.geometry.dispose();}});for(const m of materials)m.dispose();for(const t of textures)t.dispose();scene.remove(root);}
 };
}
global.AshenLevel={create};
})(typeof window!=='undefined'?window:globalThis);
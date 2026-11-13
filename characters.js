(function(global){
'use strict';
// Real skinned PBR character pipeline. Geometry, UVs, weights and authored clips
// come from the credited GLB asset; variants share buffers and textures only.
let template=null,pending=null;
function load({THREE:T,url,onProgress,forward=0,gripEuler=null,forceEquipment=false}){
  if(template&&template.url===url)return Promise.resolve(template.info);
  if(pending)return pending;
  pending=new Promise((resolve,reject)=>{
    if(!T.GLTFLoader){reject(new Error('GLTFLoader must be loaded before characters.js'));return;}
    new T.GLTFLoader().load(url,gltf=>{
      gltf.scene.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(gltf.scene),size=bounds.getSize(new T.Vector3()),bones=[],meshes=[];
      gltf.scene.traverse(o=>{if(o.isBone)bones.push(o.name);if(o.isMesh)meshes.push({name:o.name,skinned:!!o.isSkinnedMesh,triangles:(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3,materials:(Array.isArray(o.material)?o.material:[o.material]).map(m=>m.name)});});
      const clips=gltf.animations.map(c=>c.clone()),gait={};
      // The original root-motion variants provide actual travelled meters per
      // clip. Retain that cadence before removing root displacement.
      for(const clip of clips){const match=/^(walk|run)_root$/i.exec(clip.name);if(!match)continue;const track=clip.tracks.find(t=>/(?:hips|pelvis|root).*\.position$/i.test(t.name)&&t.getValueSize()===3);if(track){const last=track.values.length-3,distance=Math.hypot(track.values[last]-track.values[0],track.values[last+2]-track.values[2]);if(distance>.05)gait[match[1].toLowerCase()]={distance,duration:clip.duration};}}
      // Keep vertical hip weight shifts but remove translation that would fight
      // collision-aware root movement in the gameplay controller.
      for(const clip of clips)for(const track of clip.tracks){if(/(?:hips|pelvis|root|armature).*\.position$/i.test(track.name)&&track.getValueSize()===3){const x=track.values[0],z=track.values[2];for(let i=0;i<track.values.length;i+=3){track.values[i]=x;track.values[i+2]=z;}}}
      const info={url,bounds:{height:size.y,width:size.x,depth:size.z},bones,meshes,animations:clips.map(c=>({name:c.name,duration:c.duration,tracks:c.tracks.length})),triangles:meshes.reduce((n,m)=>n+m.triangles,0)};
      template={url,gltf,clips,gait,info,forward,gripEuler,forceEquipment};pending=null;resolve(info);
    },onProgress,e=>{pending=null;reject(new Error('Unable to load the skinned character asset: '+(e.message||url)));});
  });return pending;
}
function cloneSkinned(source,T){
  const clone=source.clone(true),lookup=new Map();
  function pair(a,b){lookup.set(a,b);for(let i=0;i<a.children.length;i++)pair(a.children[i],b.children[i]);}pair(source,clone);
  source.traverse(o=>{if(!o.isSkinnedMesh)return;const m=lookup.get(o),s=o.skeleton.clone();s.bones=o.skeleton.bones.map(b=>lookup.get(b));m.bindMode=o.bindMode;m.bind(s,o.bindMatrix.clone());});return clone;
}
function createKnight({THREE:T,scene,M={},isBoss=false,variant=''}){
  if(!template)throw new Error('Await AshenCharacters.load({THREE,url}) before creating a character.');
  if(!global.AshenMotion)throw new Error('motion.js must be loaded before creating a character.');
  const boss=isBoss,sentinel=variant==='sentinel',root=new T.Group(),pivot=new T.Group(),model=new T.Group(),visual=cloneSkinned(template.gltf.scene,T),art=new T.Group();scene.add(root);root.add(pivot);pivot.position.y=.95;pivot.add(model);model.position.y=-.95;pivot.add(art);art.position.y=-.95;model.add(visual);
  visual.rotation.y+=template.forward;visual.updateWorldMatrix(true,true);let bounds=new T.Box3().setFromObject(visual),center=bounds.getCenter(new T.Vector3());
  const naturalHeight=1.93,normalization=naturalHeight/Math.max(.1,bounds.max.y-bounds.min.y);visual.position.x-=center.x;visual.position.z-=center.z;visual.position.y-=bounds.min.y;model.scale.setScalar(normalization);model.updateWorldMatrix(true,true);
  const actorMaterials=[],matCache=new Map();let triangles=0,meshCount=0;
  visual.traverse(o=>{if(!o.isMesh)return;meshCount++;triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;
    function material(src){if(matCache.has(src))return matCache.get(src);const m=src.clone(),name=(m.name||'').toLowerCase();if(m.isMeshStandardMaterial){m.roughness=Math.max(m.roughness,.48);m.metalness=Math.min(m.metalness,.78);if(boss)m.color.multiply(new T.Color('#c6bca6'));else if(sentinel)m.color.multiply(new T.Color('#9daaa3'));if(/cloth|cape|fabric|leather/i.test(name)){m.metalness=0;m.roughness=.94;m.color.multiply(new T.Color(boss?'#8e7670':sentinel?'#7f9990':'#bb8070'));}actorMaterials.push({material:m,baseEmissive:m.emissive.clone()});}matCache.set(src,m);return m;}
    o.material=Array.isArray(o.material)?o.material.map(material):material(o.material);
  });
  const boneList=[];visual.traverse(o=>{if(o.isBone)boneList.push(o);});
  const norm=n=>n.toLowerCase().replace(/^(?:mixamorig|armature)[:_ .-]*|^rig[:_ .-]+/,'').replace(/[^a-z0-9]/g,'');
  function bone(...tests){for(const test of tests){const b=boneList.find(o=>test.test(norm(o.name)));if(b)return b;}return null;}
  const rig={hips:bone(/hips$/,/pelvis$/,/root$/),spine:bone(/spine$/,/spine0$/,/spine1$/,/chest$/),chest:bone(/chest$/,/spine2$/,/spine1$/),neck:bone(/neck$/),head:bone(/head$/),leftUpper:bone(/leftarm$/,/leftupperarm$/,/upperarml$/,/arml$/),leftFore:bone(/leftforearm$/,/leftlowerarm$/,/forearml$/,/lowerarml$/),leftHand:bone(/lefthand$/,/handl$/),rightUpper:bone(/rightarm$/,/rightupperarm$/,/upperarmr$/,/armr$/),rightFore:bone(/rightforearm$/,/rightlowerarm$/,/forearmr$/,/lowerarmr$/),rightHand:bone(/righthand$/,/handr$/),leftThigh:bone(/leftupleg$/,/leftthigh$/,/thighl$/,/upperlegl$/),leftShin:bone(/leftleg$/,/leftcalf$/,/shinl$/,/lowerlegl$/),leftFoot:bone(/leftfoot$/,/footl$/),rightThigh:bone(/rightupleg$/,/rightthigh$/,/thighr$/,/upperlegr$/),rightShin:bone(/rightleg$/,/rightcalf$/,/shinr$/,/lowerlegr$/),rightFoot:bone(/rightfoot$/,/footr$/)};
  rig.spine=rig.spine||rig.hips||boneList[0];rig.chest=rig.chest||rig.spine;rig.head=rig.head||rig.neck||rig.chest;
  const dummy=()=>new T.Group(),body=rig.spine,neck=rig.neck||rig.head,head=rig.head,arms=[{shoulder:rig.leftUpper||dummy(),elbow:rig.leftFore||dummy(),hand:rig.leftHand||rig.leftFore},{shoulder:rig.rightUpper||dummy(),elbow:rig.rightFore||dummy(),hand:rig.rightHand||rig.rightFore}],legs=[{hip:rig.leftThigh||dummy(),knee:rig.leftShin||dummy(),foot:rig.leftFoot||dummy()},{hip:rig.rightThigh||dummy(),knee:rig.rightShin||dummy(),foot:rig.rightFoot||dummy()}];
  root.name=boss?'The Crownless / skinned knight':sentinel?'Vigil knight / skinned knight':'Exile / skinned knight';root.scale.setScalar(boss?1.36:sentinel?1.03:1);
  root.updateWorldMatrix(true,true);
  const q=new T.Quaternion(),v=new T.Vector3(),rootInv=new T.Quaternion(),bindings=[];
  function slot(target,name,orientation){const s=new T.Group();s.name=name;art.add(s);target=target||rig.hips||rig.spine;target.getWorldQuaternion(q);const bindInverse=q.clone().invert();bindings.push({slot:s,target,bindInverse,orientation:orientation||new T.Quaternion()});return s;}
  function basicMat(color,metal=.2,rough=.7){return new T.MeshStandardMaterial({color:new T.Color(color).convertSRGBToLinear(),metalness:metal,roughness:rough});}
  const swordMat=basicMat(boss?'#7c807d':'#949b9b',.72,.39),edgeMat=basicMat('#b7b9ae',.65,.43),hiltMat=basicMat('#6e6250',.52,.56),leatherMat=basicMat('#262725',.03,.9);
  let includedSword=null,includedShield=null;visual.traverse(o=>{if(o.isMesh){if(!includedSword&&/sword|blade|weapon/i.test(o.name))includedSword=o;if(!includedShield&&/shield/i.test(o.name))includedShield=o;}});
  // Equipment is the only newly authored hard-surface geometry. The humanoid
  // itself remains the original coherent weighted and UV-unwrapped mesh.
  const replaceSword=template.forceEquipment||boss;
  if(includedSword&&replaceSword)includedSword.visible=false;
  const forearm=new T.Vector3(0,-1,0);if(rig.rightFore&&rig.rightHand){rig.rightFore.getWorldPosition(v);rig.rightHand.getWorldPosition(forearm);forearm.sub(v).normalize().applyQuaternion(root.getWorldQuaternion(q).invert());}
  const swordOrientation=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,-1,0),forearm);
  if(template.gripEuler)swordOrientation.multiply(new T.Quaternion().setFromEuler(new T.Euler(...template.gripEuler)));
  const swordSlot=slot(rig.rightHand||rig.rightFore,'right_hand_socket',swordOrientation),bladeLen=boss?1.36:sentinel?1.03:1.08;
  let steelMesh;
  if(!includedSword||replaceSword){
    const rings=[[.02,.032,.022],[-.13,.044,.024],[-.25,boss?.105:.051,.022],[-bladeLen*.86,boss?.085:.042,.016],[-bladeLen,.001,.001]],p=[],uv=[],idx=[];
    for(let j=0;j<rings.length;j++){const [y,w,t]=rings[j];for(const [x,z]of [[-w,0],[0,t],[w,0],[0,-t]]){p.push(x,y,z);uv.push((x/w+1)*.5,j/(rings.length-1));}}
    for(let j=0;j<rings.length-1;j++)for(let k=0;k<4;k++){const a=j*4+k,b=j*4+(k+1)%4,c=a+4,d=b+4;idx.push(a,c,b,b,c,d);}
    let g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g=g.toNonIndexed();g.computeVertexNormals();steelMesh=new T.Mesh(g,swordMat);steelMesh.castShadow=true;swordSlot.add(steelMesh);
    const guard=new T.Mesh(new T.BoxGeometry(boss?.36:.25,.035,.044),hiltMat);guard.position.y=-.12;swordSlot.add(guard);const handle=new T.Mesh(new T.CylinderGeometry(.025,.029,.17,8),leatherMat);handle.position.y=.015;swordSlot.add(handle);const pommel=new T.Mesh(new T.OctahedronGeometry(.043),hiltMat);pommel.position.y=.13;swordSlot.add(pommel);
  }else steelMesh=includedSword;
  const swordBinding=bindings.find(b=>b.slot===swordSlot);
  const weapon={grip:{bindInverse:swordBinding.bindInverse,orientation:swordBinding.orientation},group:swordSlot,steel:steelMesh,base:new T.Vector3(0,-.15,0),tip:new T.Vector3(0,-bladeLen,0),bladeLength:bladeLen,restPitch:0,included:!!includedSword&&!replaceSword};
  const halo=new T.Mesh(new T.RingGeometry(.48,.51,40),new T.MeshBasicMaterial({color:'#e0bb79',transparent:true,opacity:.65,side:T.DoubleSide,depthWrite:false}));halo.rotation.x=-Math.PI/2;halo.position.y=.032;root.add(halo);halo.visible=false;
  if(boss){
    const crown=slot(rig.head,'broken_coronet');
    const band=new T.Mesh(new T.CylinderGeometry(.105,.101,.032,14,1,true),hiltMat);band.position.y=.165;crown.add(band);
    for(let i=0;i<7;i++){const angle=i/7*Math.PI*2,h=.07+(i%3)*.035,w=.026,depth=.011,x=Math.sin(angle)*.105,z=Math.cos(angle)*.105;
      const shape=new T.Shape();shape.moveTo(-w,0);shape.lineTo(-w*.72,h*.65);shape.lineTo(w*.20,h);shape.lineTo(w,h*.12);shape.lineTo(w,0);shape.closePath();const g=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:.002,bevelThickness:.002,bevelSegments:1,steps:1});const shard=new T.Mesh(g,hiltMat);shard.position.set(x,.176,z);shard.rotation.y=angle;shard.rotation.z=(i===2?-.18:.03);shard.castShadow=true;crown.add(shard);}
  }
  let shield=includedShield;
  if(!boss&&!shield){shield=slot(rig.leftHand||rig.leftFore,'left_hand_shield');const sg=new T.SphereGeometry(.235,16,8,0,Math.PI*2,0,Math.PI*.5);sg.rotateX(Math.PI/2);sg.scale(1,1.18,.28);const disk=new T.Mesh(sg,leatherMat);disk.castShadow=true;shield.add(disk);const rim=new T.Mesh(new T.TorusGeometry(.235,.009,5,28),hiltMat);rim.scale.y=1.18;shield.add(rim);const bossing=new T.Mesh(new T.ConeGeometry(.052,.055,8),edgeMat);bossing.rotation.x=Math.PI/2;bossing.position.z=.04;shield.add(bossing);}
  // A tailored mantle gives each role its own silhouette. Shoulder vertices are
  // pinned, with the folds and worn hem carried by the animator's cloth layer.
  const capeAnchor=slot(rig.chest||rig.spine,'cloth_attachment'),clothWidth=boss?.88:sentinel?.66:.76,clothHeight=boss?1.13:sentinel?.83:.93;
  const clothColumns=18,clothRows=24,cg=new T.PlaneGeometry(clothWidth,clothHeight,clothColumns,clothRows),cp=cg.attributes.position,clothFall=new Float32Array(cp.count),clothColors=new Float32Array(cp.count*3);
  for(let i=0;i<cp.count;i++){
    const x=cp.getX(i),y=cp.getY(i),fall=Math.floor(i/(clothColumns+1))/clothRows,edge=Math.abs(x)/(clothWidth*.5),pin=Math.max(0,1-fall*5);
    const pleat=Math.cos(x/clothWidth*Math.PI*7+fall*.62)*(.042+.038*fall)*Math.sin(fall*Math.PI*.5);
    const hem=Math.pow(Math.max(0,(fall-.61)/.39),2),notch=.20*Math.exp(-Math.pow(x/(clothWidth*.14),2)),sideLift=.095*Math.pow(edge,4),fray=.018*(.5+.5*Math.sin(x*67))+Math.max(0,-x)*.08;
    cp.setX(i,x*(.44+fall*.35+Math.sin(fall*Math.PI)*.12)-.018*fall*fall);
    cp.setY(i,y-.05*Math.pow(edge,1.6)*pin+hem*(notch+sideLift-fray));
    cp.setZ(i,-.055-fall*.10-.035*(1-edge*edge)*pin+pleat);
    clothFall[i]=fall;
    const shade=.86+.12*Math.cos(x/clothWidth*Math.PI*7+fall*.62),wear=Math.max(0,(fall-.78)/.22)*.045;
    clothColors.set([shade+wear,shade*.98+wear*.6,shade*.96],i*3);
  }
  cg.setAttribute('color',new T.Float32BufferAttribute(clothColors,3));cg.computeVertexNormals();const clothMat=basicMat(boss?'#3e302e':sentinel?'#344b46':'#783d36',0,.91);clothMat.side=T.DoubleSide;clothMat.vertexColors=true;
  const cape=new T.Mesh(cg,clothMat);cape.name=boss?'Warden / weathered oath mantle':sentinel?'Vigil / green watch mantle':'Exile / crimson oath mantle';cape.position.set(0,boss?-.43:-.40,-.16);cape.castShadow=true;cape.receiveShadow=true;
  cape.userData.restPositions=new Float32Array(cp.array);cape.userData.fallWeights=clothFall;cape.userData.height=clothHeight;cape.userData.width=clothWidth;capeAnchor.add(cape);
  // The small locally generated weave also carries a faded stitched border and
  // oath mark. Its UVs deform with the cloth rather than sliding over the body.
  const clothSize=128,clothData=new Uint8Array(clothSize*clothSize*4),reliefData=new Uint8Array(clothSize*clothSize*4);
  for(let y=0;y<clothSize;y++)for(let x=0;x<clothSize;x++){
    const n=(y*clothSize+x)*4,u=x/(clothSize-1),v=y/(clothSize-1),edge=Math.min(u,1-u,v,1-v);
    const wear=.9+Math.sin(x*1.7+y*.91)*.025+Math.sin(x*.17-y*.21)*.04;
    const border=edge>.036&&edge<.054,stitch=border&&((x+y)%5<3);
    const sx=(u-.5)*2,sy=(v-.53)*2,mark=(Math.abs(sx)<.026&&sy>-.32&&sy<.34)||(Math.abs(sy+.11)<.022&&Math.abs(sx)<.21)||(Math.abs(Math.abs(sx)+Math.abs(sy-.23)-.115)<.02&&sy>.11);
    const faded=mark&&Math.sin(x*.83+y*.53)>-.62;
    const value=Math.round((stitch?242:faded?221:202)*wear),weave=125+(x%2?9:-9)+(y%2?6:-6);
    clothData[n]=value;clothData[n+1]=stitch||faded?Math.round(value*.84):value;clothData[n+2]=stitch||faded?Math.round(value*.64):value;clothData[n+3]=255;
    reliefData[n]=reliefData[n+1]=reliefData[n+2]=weave+(border?12:0);reliefData[n+3]=255;
  }
  const clothTex=new T.DataTexture(clothData,clothSize,clothSize,T.RGBAFormat);clothTex.encoding=T.sRGBEncoding;clothTex.magFilter=T.LinearFilter;clothTex.minFilter=T.LinearMipmapLinearFilter;clothTex.generateMipmaps=true;clothTex.needsUpdate=true;clothMat.map=clothTex;
  const weaveTex=new T.DataTexture(reliefData,clothSize,clothSize,T.RGBAFormat);weaveTex.wrapS=weaveTex.wrapT=T.RepeatWrapping;weaveTex.repeat.set(3,5);weaveTex.magFilter=T.LinearFilter;weaveTex.minFilter=T.LinearMipmapLinearFilter;weaveTex.generateMipmaps=true;weaveTex.needsUpdate=true;clothMat.bumpMap=weaveTex;clothMat.bumpScale=.0018;
  const gait={};for(const [key,value]of Object.entries(template.gait))gait[key]={...value,distance:value.distance*normalization};
  const mixer=new T.AnimationMixer(visual),actor={root,pivot,model,visual,body,neck,head,arms,legs,weapon,shield,cape,rig,mixer,clips:template.clips,gait,materials:actorMaterials,isBoss:boss,variant,scale:root.scale.x,walk:0,blend:0,hit:0,_clothFrame:0,source:template.url};
  // Sockets are children of the animated pivot. Inverting the gameplay root
  // would apply a somersault twice to equipment while its hand only rolls once.
  actor.updateEquipment=()=>{root.updateWorldMatrix(true,true);art.getWorldQuaternion(rootInv).invert();for(const b of bindings){b.target.getWorldPosition(v);art.worldToLocal(v);b.slot.position.copy(v);b.target.getWorldQuaternion(q);b.slot.quaternion.copy(rootInv).multiply(q).multiply(b.bindInverse).multiply(b.orientation);}art.updateWorldMatrix(false,true);if(includedSword&&!replaceSword){includedSword.geometry.computeBoundingBox();const bb=includedSword.geometry.boundingBox;const axis=['x','y','z'].sort((a,b)=>(bb.max[b]-bb.min[b])-(bb.max[a]-bb.min[a]))[0];const localTip=bb.getCenter(new T.Vector3());localTip[axis]=Math.abs(bb.max[axis])>Math.abs(bb.min[axis])?bb.max[axis]:bb.min[axis];includedSword.localToWorld(localTip);swordSlot.worldToLocal(localTip);weapon.tip.copy(localTip);}};
  // A small skin-aware contact hull follows the real weighted vertices. A
  // geometry bounding box only sees the bind pose and cannot ground a tuck.
  const skinProbes=[],probePoint=new T.Vector3(),probeDirections=[];
  for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)if(x||y||z)probeDirections.push([x,y,z]);
  visual.traverse(o=>{if(!o.isSkinnedMesh)return;const p=o.geometry.attributes.position,si=o.geometry.attributes.skinIndex,sw=o.geometry.attributes.skinWeight,extremes=new Map();
    for(let i=0;i<p.count;i++){let strongest=0,weight=-1;for(let j=0;j<4;j++){const w=sw.getComponent?sw.getComponent(i,j):sw.array[i*4+j];if(w>weight){weight=w;strongest=si.array[i*4+j];}}
      let bins=extremes.get(strongest);if(!bins){bins=probeDirections.map(()=>({value:-Infinity,index:0}));extremes.set(strongest,bins);}const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      for(let j=0;j<probeDirections.length;j++){const d=probeDirections[j],value=x*d[0]+y*d[1]+z*d[2];if(value>bins[j].value){bins[j].value=value;bins[j].index=i;}}
    }
    const indices=new Set();for(const bins of extremes.values())for(const bin of bins)indices.add(bin.index);skinProbes.push({mesh:o,indices:[...indices]});
  });
  actor.groundBounds=()=>{root.updateWorldMatrix(true,true);let min=Infinity,max=-Infinity;for(const probe of skinProbes){probe.mesh.updateMatrixWorld(true);probe.mesh.skeleton.update();for(const index of probe.indices){probe.mesh.boneTransform(index,probePoint);probePoint.applyMatrix4(probe.mesh.matrixWorld);min=Math.min(min,probePoint.y);max=Math.max(max,probePoint.y);}}return {min,max};};
  if(rig.rightUpper&&rig.spine){rig.rightUpper.getWorldPosition(v);actor.anatomyRightSign=Math.sign(v.x-root.position.x)||-1;}
  actor.setCombatCue=(o)=>{halo.visible=o.state==='stagger';if(halo.visible){halo.scale.setScalar(1+Math.sin(o.time*7)*.10);halo.material.opacity=.45+Math.sin(o.time*7)*.18;}swordMat.emissive.set('#bb6524');swordMat.emissiveIntensity=o.state==='attack'&&o.attack&&o.time<o.attack.windup?Math.max(0,o.time/o.attack.windup-.45)*.9:0;};
  actor.setHit=value=>{actor.hit=Math.max(actor.hit,Number(value)||0);};
  actor.animate=global.AshenMotion.createAnimator(actor,T);root.userData.artStats={meshes:meshCount,triangles:Math.round(triangles),bones:boneList.length,skinnedMeshes:template.info.meshes.filter(m=>m.skinned).length,animations:template.clips.map(c=>c.name)};actor.updateEquipment();actor.animate({state:'idle',time:0,dt:.016,t:0,speed:0});return actor;
}
function getMetadata(){return template&&template.info;}
global.AshenCharacters={load,createKnight,getMetadata};
})(typeof window!=='undefined'?window:globalThis);

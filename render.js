/* Ashen Vow: restrained filmic rendering for actual PBR character assets. */
(function(global){
'use strict';
function create({THREE:T,canvas}){
 const renderer=new T.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance',stencil:false});
 renderer.outputEncoding=T.sRGBEncoding;
 renderer.toneMapping=T.ACESFilmicToneMapping;
 renderer.toneMappingExposure=1.07;
 renderer.physicallyCorrectLights=true;
 renderer.shadowMap.enabled=true;
 renderer.shadowMap.type=T.PCFSoftShadowMap;
 renderer.setClearColor('#0b131b',1);
 const scene=new T.Scene();scene.background=new T.Color('#0b131b');scene.fog=new T.FogExp2('#101b24',.0115);
 const width=Math.max(1,global.innerWidth||1280),height=Math.max(1,global.innerHeight||720);
 const camera=new T.PerspectiveCamera(52,width/height,.12,190);camera.position.set(7,5,23);camera.lookAt(0,1,15);
 const ambient=new T.HemisphereLight('#a7bfd1','#29251f',.96);scene.add(ambient);
 const moon=new T.DirectionalLight('#c2d7eb',3.35);moon.position.set(-16,27,-17);moon.target.position.set(0,0,-8);moon.castShadow=true;scene.add(moon,moon.target);
 moon.shadow.mapSize.set(2048,2048);Object.assign(moon.shadow.camera,{left:-16,right:16,top:25,bottom:-25,near:.5,far:105});moon.shadow.camera.updateProjectionMatrix();moon.shadow.normalBias=.018;moon.shadow.bias=-.00012;moon.shadow.radius=2;
 const skyFill=new T.DirectionalLight('#819bb3',.53);skyFill.position.set(16,12,23);scene.add(skyFill);
 const groundBounce=new T.DirectionalLight('#bba17d',.23);groundBounce.position.set(3,4,17);scene.add(groundBounce);
 const night={sky:new T.Color('#0b131b'),fog:new T.Color('#101b24'),moon:new T.Color('#c2d7eb'),ambient:new T.Color('#a7bfd1')};
 const morning={sky:new T.Color('#19202a'),fog:new T.Color('#263137'),moon:new T.Color('#d9c6a8'),ambient:new T.Color('#bfc7c6')};
 let ending=0;const shadowAnchor=new T.Vector3(0,0,-8);

 // Broad sky lobes, horizon bounce and a soft warm reflection. No flat chrome.
 const pixels=new Uint8Array(256*128*4);
 for(let y=0;y<128;y++)for(let x=0;x<256;x++){
  const u=x/255,v=y/127,sky=Math.pow(Math.max(0,1-v),1.3),horizon=Math.exp(-Math.pow((v-.43)/.13,2));
  const cool=Math.exp(-Math.pow((u-.26)/.13,2))*horizon,warm=Math.exp(-Math.pow((u-.75)/.085,2))*Math.exp(-Math.pow((v-.52)/.16,2)),i=(y*256+x)*4;
  pixels[i]=11+sky*43+cool*117+warm*112;pixels[i+1]=17+sky*55+cool*126+warm*76;pixels[i+2]=24+sky*69+cool*137+warm*40;pixels[i+3]=255;
 }
 const reflection=new T.DataTexture(pixels,256,128,T.RGBAFormat);reflection.mapping=T.EquirectangularReflectionMapping;reflection.encoding=T.sRGBEncoding;reflection.magFilter=T.LinearFilter;reflection.minFilter=T.LinearFilter;reflection.needsUpdate=true;
 const environmentBaker=new T.PMREMGenerator(renderer);environmentBaker.compileEquirectangularShader();const environmentTarget=environmentBaker.fromEquirectangular(reflection);scene.environment=environmentTarget.texture;environmentBaker.dispose();reflection.dispose();

 const size=new T.Vector2();let quality='high',disposed=false,renderScale=1,frameAverage=1/60,adaptAge=0,settle=0,economy=false,slowAge=0,recoveryAge=0;
 const depthSupported=!!(renderer.capabilities.isWebGL2||renderer.extensions.has('WEBGL_depth_texture'));
 const derivativeSupported=!!(renderer.capabilities.isWebGL2||renderer.extensions.has('OES_standard_derivatives'));
 const useDepth=depthSupported&&derivativeSupported;
 const target=new T.WebGLRenderTarget(width,height,{minFilter:T.LinearFilter,magFilter:T.LinearFilter,format:T.RGBAFormat,depthBuffer:true,stencilBuffer:false});
 target.texture.encoding=T.sRGBEncoding;
 if(useDepth){target.depthTexture=new T.DepthTexture(width,height,T.UnsignedShortType);target.depthTexture.minFilter=T.NearestFilter;target.depthTexture.magFilter=T.NearestFilter;}
 const uniforms={
  colorImage:{value:target.texture},depthImage:{value:useDepth?target.depthTexture:target.texture},
  inverseProjection:{value:camera.projectionMatrixInverse},projectionScale:{value:camera.projectionMatrix.elements[5]},
  texel:{value:new T.Vector2(1/width,1/height)},aoStrength:{value:useDepth?.42:0},bloomStrength:{value:.085},damage:{value:0},phase:{value:0},ending:{value:0}
 };
 const post=new T.ShaderMaterial({
  uniforms,defines:{HAS_DEPTH:useDepth?1:0,HAS_BLOOM:1},extensions:{derivatives:useDepth},depthTest:false,depthWrite:false,toneMapped:false,
  vertexShader:'varying vec2 screenUV;void main(){screenUV=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
  fragmentShader:`precision highp float;
   varying vec2 screenUV;
   uniform sampler2D colorImage;uniform sampler2D depthImage;
   uniform mat4 inverseProjection;uniform float projectionScale;
   uniform vec2 texel;uniform float aoStrength;uniform float bloomStrength;uniform float damage;uniform float phase;uniform float ending;
   vec3 colorAt(vec2 p){return texture2D(colorImage,clamp(p,texel,vec2(1.)-texel)).rgb;}
   vec3 bloomTap(vec2 p){vec3 h=colorAt(p);return h*smoothstep(.78,.985,max(h.r,max(h.g,h.b)));}
   float luminance(vec3 c){return dot(c,vec3(.299,.587,.114));}
   #if HAS_DEPTH == 1
   vec3 viewAt(vec2 p){float d=texture2D(depthImage,p).x;vec4 q=inverseProjection*vec4(p*2.-1.,d*2.-1.,1.);return q.xyz/q.w;}
   float aoTap(vec2 uv,vec3 origin,vec3 normal,vec2 kernel,float screenRadius){
    vec2 offset=kernel*screenRadius;offset.x*=texel.x/texel.y;
    vec2 at=clamp(uv+offset,texel,vec2(1.)-texel);vec3 delta=viewAt(at)-origin;
    float len=length(delta);float alignment=max(dot(normal,delta/max(len,.0001))-.09,0.);
    float range=1.-smoothstep(.0954,.954,len);float bias=smoothstep(.012,.075,len);
    return alignment*range*bias;
   }
   float contactAO(vec2 uv){
    float d=texture2D(depthImage,uv).x;
    vec3 origin=viewAt(uv);vec3 normal=cross(dFdx(origin),dFdy(origin));
    normal/=max(length(normal),.00001);normal*=sign(normal.z+.000001);
    float screenRadius=clamp(.53*projectionScale/max(.5,-origin.z)*.5,.0015,.095);
    // Explicit taps keep texture gradients outside divergent loops on ANGLE.
    float occlusion=aoTap(uv,origin,normal,vec2(.3062,0.),screenRadius)
     +aoTap(uv,origin,normal,vec2(-.3449,.3160),screenRadius)
     +aoTap(uv,origin,normal,vec2(.0513,-.5841),screenRadius)
     +aoTap(uv,origin,normal,vec2(.4166,.5430),screenRadius)
     +aoTap(uv,origin,normal,vec2(-.7588,-.1342),screenRadius)
     +aoTap(uv,origin,normal,vec2(.7153,-.4549),screenRadius)
     +aoTap(uv,origin,normal,vec2(-.2384,.8871),screenRadius)
     +aoTap(uv,origin,normal,vec2(-.4536,-.8735),screenRadius);
    return mix(clamp(1.-occlusion*aoStrength*.34,.78,1.),1.,step(.99992,d));
   }
   #endif
   void main(){
    vec2 uv=screenUV;vec3 c=colorAt(uv);float m=luminance(c);
    // Edge-directed resolve follows diagonal silhouettes instead of blurring
    // every high-contrast cobble. Keep the original sample on interior detail.
    float nw=luminance(colorAt(uv+vec2(-texel.x,texel.y))),ne=luminance(colorAt(uv+texel));
    float sw=luminance(colorAt(uv-texel)),se=luminance(colorAt(uv+vec2(texel.x,-texel.y)));
    float hi=max(m,max(max(nw,ne),max(sw,se))),lo=min(m,min(min(nw,ne),min(sw,se)));
    vec2 dir=vec2(-((nw+ne)-(sw+se)),(nw+sw)-(ne+se));
    float reduce=max((nw+ne+sw+se)*.03125,.0078125);
    dir=clamp(dir/(min(abs(dir.x),abs(dir.y))+reduce),vec2(-6.),vec2(6.))*texel;
    vec3 a=.5*(colorAt(uv-dir/6.)+colorAt(uv+dir/6.));
    vec3 edgeB=a*.5+.25*(colorAt(uv-dir*.5)+colorAt(uv+dir*.5));
    float lb=luminance(edgeB);vec3 resolved=lb<lo||lb>hi?a:edgeB;
    c=mix(c,resolved,step(max(.055,hi*.125),hi-lo));
    #if HAS_DEPTH == 1
    c*=contactAO(uv);
    #endif
    #if HAS_BLOOM == 1
    vec2 b=texel*5.5;
    vec3 bloom=bloomTap(uv+vec2(b.x,0.))+bloomTap(uv-vec2(b.x,0.))
     +bloomTap(uv+vec2(0.,b.y))+bloomTap(uv-vec2(0.,b.y))
     +bloomTap(uv+b*.7071)+bloomTap(uv-b*.7071)
     +bloomTap(uv+vec2(b.x,-b.y)*.7071)+bloomTap(uv+vec2(-b.x,b.y)*.7071);
    c+=bloom*(bloomStrength/8.);
    #endif
    float lum=luminance(c);c=mix(vec3(lum),c,1.035);
    // Cool shadow chroma and restrained warm highlights; preserve black detail.
    c+=vec3(-.004,.002,.006)*(1.-smoothstep(.10,.56,lum));
    c+=vec3(.006,.003,-.003)*smoothstep(.46,.94,lum);
    vec2 q=uv*2.-1.;float edge=smoothstep(.28,1.35,length(q));
    c*=1.-.075*edge;c+=vec3(.085,-.012,-.018)*clamp(damage,0.,1.)*edge;
    c+=vec3(.01,.002,-.004)*clamp(phase,0.,1.);
    c+=vec3(.012,.006,-.003)*ending*smoothstep(.05,.7,lum);
    gl_FragColor=vec4(clamp(c,0.,1.),1.);
   }`
 });
 const postScene=new T.Scene(),postCamera=new T.Camera(),quad=new T.Mesh(new T.PlaneGeometry(2,2),post);postScene.add(quad);
 function resize(){if(disposed)return;const w=Math.max(1,global.innerWidth||canvas.clientWidth||1280),h=Math.max(1,global.innerHeight||canvas.clientHeight||720);renderer.setPixelRatio(Math.min(global.devicePixelRatio||1,quality==='high'?1.35:1)*renderScale);renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.getDrawingBufferSize(size);target.setSize(Math.max(1,size.x),Math.max(1,size.y));uniforms.texel.value.set(1/size.x,1/size.y);uniforms.projectionScale.value=camera.projectionMatrix.elements[5];}
 function applyQuality(){
  const detailed=quality==='high'&&!economy,depthDefine=useDepth&&detailed?1:0;
  if(post.defines.HAS_DEPTH!==depthDefine){post.defines.HAS_DEPTH=depthDefine;post.needsUpdate=true;}
  const bloomDefine=detailed?1:0;if(post.defines.HAS_BLOOM!==bloomDefine){post.defines.HAS_BLOOM=bloomDefine;post.needsUpdate=true;}
  uniforms.aoStrength.value=depthDefine?.42:0;uniforms.bloomStrength.value=detailed?.085:.045;
  const shadowSize=detailed?2048:1024;if(moon.shadow.mapSize.x!==shadowSize){moon.shadow.mapSize.set(shadowSize,shadowSize);if(moon.shadow.map){moon.shadow.map.dispose();moon.shadow.map=null;}}
 }
 function setQuality(value){quality=value==='low'?'low':'high';renderScale=1;adaptAge=settle=slowAge=recoveryAge=0;frameAverage=1/60;economy=false;applyQuality();resize();}
 function updateBudget(dt){
  if(!(dt>0&&dt<1))return;
  const sample=Math.min(dt,.25);frameAverage+=(sample-frameAverage)*.08;adaptAge+=sample;settle+=sample;
  slowAge=frameAverage>1/30?slowAge+sample:Math.max(0,slowAge-sample*2);
  recoveryAge=frameAverage<1/56?recoveryAge+sample:0;
  // Sustained slow hardware gets cheaper contact shading and shadows before
  // the image becomes excessively soft. Recovery is deliberately much slower.
  if(quality==='high'&&((!economy&&slowAge>3)||(economy&&recoveryAge>12))){economy=!economy;slowAge=recoveryAge=0;applyQuality();}
  if(adaptAge>2&&settle>1.5){const before=renderScale;if(frameAverage>1/43)renderScale=Math.max(.72,renderScale-.08);else if(frameAverage<1/58)renderScale=Math.min(1,renderScale+.04);if(Math.abs(renderScale-before)>.001){settle=0;resize();}}
 }
 resize();
 return {renderer,scene,camera,lights:{ambient,moon,skyFill,groundBounce},
  getResolution:()=>Number(renderScale.toFixed(2)),
  render(dt,t,feedback={}){if(disposed)return;updateBudget(dt);ending+=(T.MathUtils.clamp(Number(feedback.ending)||0,0,1)-ending)*(1-Math.exp(-Math.max(0,Math.min(.05,dt))*1.4));uniforms.ending.value=ending;scene.background.lerpColors(night.sky,morning.sky,ending);scene.fog.color.lerpColors(night.fog,morning.fog,ending);moon.color.lerpColors(night.moon,morning.moon,ending);ambient.color.lerpColors(night.ambient,morning.ambient,ending);groundBounce.intensity=.23+ending*.43;skyFill.intensity=.53+ending*.12;renderer.toneMappingExposure=1.07+ending*.055;uniforms.damage.value=Number.isFinite(feedback.damage)?feedback.damage:0;uniforms.phase.value=Number(feedback.phase)>=2?1:0;if(feedback.focus){
    const f=feedback.focus,ax=Math.round(f.x*4)/4,az=Math.round((f.z-5)*4)/4;
    if(Math.abs(shadowAnchor.x-ax)>.2||Math.abs(shadowAnchor.z-az)>.2){shadowAnchor.set(ax,0,az);moon.target.position.copy(shadowAnchor);moon.position.copy(shadowAnchor).add(new T.Vector3(-16,27,-9));}
   }const previous=renderer.getRenderTarget();renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);renderer.setRenderTarget(previous);renderer.render(postScene,postCamera);},
  resize,setQuality,
  dispose(){if(disposed)return;disposed=true;target.dispose();quad.geometry.dispose();post.dispose();environmentTarget.dispose();renderer.dispose();}
 };
}
global.AshenRender={create};
})(typeof window!=='undefined'?window:globalThis);

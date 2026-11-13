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
 moon.shadow.mapSize.set(2048,2048);Object.assign(moon.shadow.camera,{left:-25,right:25,top:41,bottom:-41,near:.5,far:105});moon.shadow.camera.updateProjectionMatrix();moon.shadow.normalBias=.018;moon.shadow.bias=-.00012;moon.shadow.radius=2;
 const skyFill=new T.DirectionalLight('#819bb3',.53);skyFill.position.set(16,12,23);scene.add(skyFill);
 const groundBounce=new T.DirectionalLight('#bba17d',.23);groundBounce.position.set(3,4,17);scene.add(groundBounce);

 // Broad sky lobes, horizon bounce and a soft warm reflection. No flat chrome.
 const pixels=new Uint8Array(256*128*4);
 for(let y=0;y<128;y++)for(let x=0;x<256;x++){
  const u=x/255,v=y/127,sky=Math.pow(Math.max(0,1-v),1.3),horizon=Math.exp(-Math.pow((v-.43)/.13,2));
  const cool=Math.exp(-Math.pow((u-.26)/.13,2))*horizon,warm=Math.exp(-Math.pow((u-.75)/.085,2))*Math.exp(-Math.pow((v-.52)/.16,2)),i=(y*256+x)*4;
  pixels[i]=11+sky*43+cool*117+warm*112;pixels[i+1]=17+sky*55+cool*126+warm*76;pixels[i+2]=24+sky*69+cool*137+warm*40;pixels[i+3]=255;
 }
 const reflection=new T.DataTexture(pixels,256,128,T.RGBAFormat);reflection.mapping=T.EquirectangularReflectionMapping;reflection.encoding=T.sRGBEncoding;reflection.magFilter=T.LinearFilter;reflection.minFilter=T.LinearFilter;reflection.needsUpdate=true;
 const environmentBaker=new T.PMREMGenerator(renderer);environmentBaker.compileEquirectangularShader();const environmentTarget=environmentBaker.fromEquirectangular(reflection);scene.environment=environmentTarget.texture;environmentBaker.dispose();reflection.dispose();

 const size=new T.Vector2();let quality='high',disposed=false,renderScale=1,frameAverage=1/60,adaptAge=0,settle=0;
 const depthSupported=!!(renderer.capabilities.isWebGL2||renderer.extensions.has('WEBGL_depth_texture'));
 const derivativeSupported=!!(renderer.capabilities.isWebGL2||renderer.extensions.has('OES_standard_derivatives'));
 const useDepth=depthSupported&&derivativeSupported;
 const target=new T.WebGLRenderTarget(width,height,{minFilter:T.LinearFilter,magFilter:T.LinearFilter,format:T.RGBAFormat,depthBuffer:true,stencilBuffer:false});
 target.texture.encoding=T.sRGBEncoding;
 if(useDepth){target.depthTexture=new T.DepthTexture(width,height,T.UnsignedShortType);target.depthTexture.minFilter=T.NearestFilter;target.depthTexture.magFilter=T.NearestFilter;}
 const uniforms={
  colorImage:{value:target.texture},depthImage:{value:useDepth?target.depthTexture:target.texture},
  inverseProjection:{value:camera.projectionMatrixInverse},projectionScale:{value:camera.projectionMatrix.elements[5]},
  texel:{value:new T.Vector2(1/width,1/height)},aoStrength:{value:useDepth?.42:0},bloomStrength:{value:.085},damage:{value:0},phase:{value:0}
 };
 const post=new T.ShaderMaterial({
  uniforms,defines:{HAS_DEPTH:useDepth?1:0},extensions:{derivatives:useDepth},depthTest:false,depthWrite:false,toneMapped:false,
  vertexShader:'varying vec2 screenUV;void main(){screenUV=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
  fragmentShader:`precision highp float;
   varying vec2 screenUV;
   uniform sampler2D colorImage;uniform sampler2D depthImage;
   uniform mat4 inverseProjection;uniform float projectionScale;
   uniform vec2 texel;uniform float aoStrength;uniform float bloomStrength;uniform float damage;uniform float phase;
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
    // Directional contrast resolve keeps thin tracery and armor edges stable.
    float n=luminance(colorAt(uv+vec2(0.,texel.y))),s=luminance(colorAt(uv-vec2(0.,texel.y)));
    float e=luminance(colorAt(uv+vec2(texel.x,0.))),w=luminance(colorAt(uv-vec2(texel.x,0.)));
    float hi=max(m,max(max(n,s),max(e,w))),lo=min(m,min(min(n,s),min(e,w)));
    vec2 dir=abs(n-s)>abs(e-w)?vec2(texel.x,0.):vec2(0.,texel.y);
    vec3 antialiased=(colorAt(uv+dir*.5)+colorAt(uv-dir*.5))*.5;
    c=mix(c,antialiased,step(max(.055,hi*.16),hi-lo)*.42);
    #if HAS_DEPTH == 1
    c*=contactAO(uv);
    #endif
    vec2 b=texel*5.5;
    vec3 bloom=bloomTap(uv+vec2(b.x,0.))+bloomTap(uv-vec2(b.x,0.))
     +bloomTap(uv+vec2(0.,b.y))+bloomTap(uv-vec2(0.,b.y))
     +bloomTap(uv+b*.7071)+bloomTap(uv-b*.7071)
     +bloomTap(uv+vec2(b.x,-b.y)*.7071)+bloomTap(uv+vec2(-b.x,b.y)*.7071);
    c+=bloom*(bloomStrength/8.);
    float lum=luminance(c);c=mix(vec3(lum),c,1.035);
    // Cool shadow chroma and restrained warm highlights; preserve black detail.
    c+=vec3(-.004,.002,.006)*(1.-smoothstep(.10,.56,lum));
    c+=vec3(.006,.003,-.003)*smoothstep(.46,.94,lum);
    vec2 q=uv*2.-1.;float edge=smoothstep(.28,1.35,length(q));
    c*=1.-.075*edge;c+=vec3(.085,-.012,-.018)*clamp(damage,0.,1.)*edge;
    c+=vec3(.01,.002,-.004)*clamp(phase,0.,1.);
    gl_FragColor=vec4(clamp(c,0.,1.),1.);
   }`
 });
 const postScene=new T.Scene(),postCamera=new T.Camera(),quad=new T.Mesh(new T.PlaneGeometry(2,2),post);postScene.add(quad);
 function resize(){if(disposed)return;const w=Math.max(1,global.innerWidth||canvas.clientWidth||1280),h=Math.max(1,global.innerHeight||canvas.clientHeight||720);renderer.setPixelRatio(Math.min(global.devicePixelRatio||1,quality==='high'?1.35:1)*renderScale);renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.getDrawingBufferSize(size);target.setSize(Math.max(1,size.x),Math.max(1,size.y));uniforms.texel.value.set(1/size.x,1/size.y);uniforms.projectionScale.value=camera.projectionMatrix.elements[5];}
 function setQuality(value){quality=value==='low'?'low':'high';renderScale=1;adaptAge=settle=0;const depthDefine=useDepth&&quality==='high'?1:0;if(post.defines.HAS_DEPTH!==depthDefine){post.defines.HAS_DEPTH=depthDefine;post.needsUpdate=true;}uniforms.aoStrength.value=depthDefine?.42:0;uniforms.bloomStrength.value=quality==='high'?.085:.045;moon.shadow.mapSize.set(quality==='high'?2048:1024,quality==='high'?2048:1024);if(moon.shadow.map){moon.shadow.map.dispose();moon.shadow.map=null;}resize();}
 resize();
 return {renderer,scene,camera,lights:{ambient,moon,skyFill,groundBounce},
  getResolution:()=>Number(renderScale.toFixed(2)),
  render(dt,t,feedback={}){if(disposed)return;if(dt>0&&dt<.15){frameAverage+=(dt-frameAverage)*.04;adaptAge+=dt;settle+=dt;if(adaptAge>3&&settle>2.5){const previousScale=renderScale;if(frameAverage>1/43)renderScale=Math.max(.72,renderScale-.08);else if(frameAverage<1/58)renderScale=Math.min(1,renderScale+.04);if(Math.abs(renderScale-previousScale)>.001){settle=0;resize();}}}uniforms.damage.value=Number.isFinite(feedback.damage)?feedback.damage:0;uniforms.phase.value=Number.isFinite(feedback.phase)?feedback.phase:0;const previous=renderer.getRenderTarget();renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);renderer.setRenderTarget(previous);renderer.render(postScene,postCamera);},
  resize,setQuality,
  dispose(){if(disposed)return;disposed=true;target.dispose();quad.geometry.dispose();post.dispose();environmentTarget.dispose();renderer.dispose();}
 };
}
global.AshenRender={create};
})(typeof window!=='undefined'?window:globalThis);

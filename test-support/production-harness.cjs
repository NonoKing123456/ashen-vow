/* Headless production flow: only the rendering/audio devices and DOM are fake.
 * The model, poses, equipment constraints, UI logic, level and controller run
 * unchanged. No entity mutators are exposed to the driver. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
async function bootProduction(options={}){
 const T={...require('../vendor/three.min.js')},nodes=new Map(),listeners=new Map(),storage=new Map([['ashen-vow-audio','off']]),scheduled=new Map(),held=new Set();
 let now=1000,timer=0,totalFrames=0,ui,stage='boot';const startedAt=Date.now(),wallBudget=options.wallBudgetMs||120000;
 const document={activeElement:null,hidden:false};
 const on=(key,fn)=>{if(!listeners.has(key))listeners.set(key,[]);listeners.get(key).push(fn);};
 function element(id,tag='BUTTON'){
  if(nodes.has(id))return nodes.get(id);const classes=new Set(),attrs={},children=[],queries=new Map(),events=new Map();
  const node={id,tagName:tag.toUpperCase(),type:'',value:'',min:'0',max:'1',step:'.05',disabled:false,isConnected:true,open:false,hidden:false,textContent:'',children,dataset:{},style:{setProperty(k,v){this[k]=v}},
   classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle(c,v){if(v===undefined)v=!classes.has(c);v?classes.add(c):classes.delete(c);return v;}},
   setAttribute(k,v){attrs[k]=String(v)},getAttribute:k=>attrs[k],addEventListener(k,f){if(!events.has(k))events.set(k,[]);events.get(k).push(f)},
   querySelector(selector){if(!queries.has(selector))queries.set(selector,element(id+':'+selector,'span'));return queries.get(selector)},querySelectorAll(){return[]},
   appendChild(child){children.push(child)},replaceChildren(){children.length=0},getClientRects:()=>[{}],getBoundingClientRect:()=>({left:0,top:0,width:1280,height:720}),
   showModal(){this.open=true},close(){this.open=false},focus(){document.activeElement=this},click(){if(!this.disabled)this.onclick?.()},remove(){this.isConnected=false},setPointerCapture(){},requestPointerLock(){}};
  nodes.set(id,node);return node;
 }
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');for(const m of html.matchAll(/<([a-z][a-z0-9-]*)\b[^>]*\bid="([^"]+)"[^>]*>/gi))element(m[2],m[1]);
 document.body=element('body','body');document.getElementById=element;document.createElement=tag=>element('generated-'+nodes.size,tag);document.createElementNS=(ns,tag)=>document.createElement(tag);document.addEventListener=(name,fn)=>on('document:'+name,fn);
 const noop=()=>{},scene=new T.Scene(),camera=new T.PerspectiveCamera(51,16/9,.12,190),renderer={domElement:element('game'),capabilities:{getMaxAnisotropy:()=>1}};
 const context={console,Math,Number,String,Array,Object,JSON,Map,Set,Float32Array,Uint8Array,THREE:T,innerWidth:1280,innerHeight:720,document,Blob,URL,TextDecoder,TextEncoder,queueMicrotask,
  navigator:{getGamepads:()=>[]},location:{hostname:'localhost'},addEventListener:(name,fn)=>on(name,fn),removeEventListener:noop,requestAnimationFrame:noop,
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
  setTimeout(fn,ms=0){scheduled.set(++timer,{at:now+ms,fn});return timer},clearTimeout(id){scheduled.delete(id)},
  AshenRender:{create:()=>({scene,camera,renderer,setQuality:noop,render:noop,resize:noop,getResolution:()=>1})},
  AshenAudio:{create:()=>({setEnabled:noop,setMix:noop,unlock:noop,play:noop,update:noop})}
 };
 context.window=context;context.self=context;context.globalThis=context;vm.createContext(context);
 const run=file=>vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
 run('vendor/GLTFLoader.js');
 // Node has no image surface. Texture definitions and the real GLB skin remain;
 // only pixel decoding/device upload are omitted together with rendering.
 T.TextureLoader.prototype.load=function(url,onLoad){const texture=new T.Texture();queueMicrotask(()=>onLoad?.(texture));return texture};
 T.GLTFLoader.prototype.load=function(url,onLoad,onProgress,onError){const bytes=fs.readFileSync(path.join(root,url));this.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',onLoad,onError)};
 for(const file of ['feel.js','navigation.js','locomotion.js','rig-constraints.js','motion.js','characters.js','surfaces.js','weather.js','level.js','ui.js','journey.js','tactics.js','controls.js','director.js','impact.js'])run(file);
 const createUI=context.AshenUI.create;context.AshenUI.create=config=>{ui=createUI(config);return ui};
 const source=fs.readFileSync(path.join(root,'game.js'),'utf8').replace(/\}\)\(\);\s*$/,
  `globalThis.__production={frame,read(){const entity=e=>({id:e.id,kind:e.kind,x:e.x,z:e.z,yaw:e.yaw,hp:e.hp,max:e.max,state:e.state,t:e.t,stamina:e.stamina,flasks:e.flasks,phase:e.phase,aggro:e.aggro,attack:e.attack?{id:e.attack.id,type:e.attack.type,kind:e.attack.kind,windup:e.attack.windup,activeEnd:e.attack.activeEnd,recoveryStart:e.attack.recoveryStart,total:e.attack.total}:null,blocked:e.actor.blockedWeapon?{point:{...e.actor.blockedWeapon.point},normal:{...e.actor.blockedWeapon.normal}}:null});return {player:entity(player),enemies:enemies.map(entity),boss:entity(boss),flags:{dead,won,bossDefeated,paused,checkpoint,gateOpen,locked:locked?.id||null,directing:!!director?.active},journey:journey.snapshot()};},world(){return {bounds:level.bounds.map(x=>({...x})),obstacles:level.obstacles.map(x=>({...x})),spawn:{...level.spawn},checkpoints:level.checkpoints.map(x=>({...x})),discoveries:level.discoveries.map(x=>({...x})),bell:{...level.bell}};},info(){return {asset:AshenCharacters.getMetadata(),characters:[player,...enemies].map(e=>({...e.actor.root.userData.artStats})),world:level.stats};},dispose(){ui.destroy?.();level.dispose?.();weather?.dispose?.();controls?.dispose?.();}};})();`);
 await vm.runInContext(source,context,{filename:'game.js'});const api=context.__production;
 if(!api)throw Error('Production controller failed to boot: '+element('fatal-text').textContent);
 const dispatch=(name,event)=>{for(const fn of listeners.get(name)||[])fn(event)};
 function press(code){if(held.has(code))return;held.add(code);dispatch('keydown',{code,repeat:false,preventDefault:noop})}
 function release(code){if(!held.has(code))return;held.delete(code);dispatch('keyup',{code,preventDefault:noop})}
 function tick(frames=1){for(let i=0;i<frames;i++){if(totalFrames%120===0&&Date.now()-startedAt>wallBudget)throw Error('Production flow wall budget exceeded at '+stage+': '+JSON.stringify(api.read()));now+=1000/60;totalFrames++;api.frame(now);for(const [id,item]of [...scheduled])if(item.at<=now){scheduled.delete(id);item.fn()}}}
 tick();
 return {T,camera,press,release,tap(code){press(code);release(code)},tick,click:id=>element(id).click(),read:()=>api.read(),world:()=>api.world(),info:()=>api.info(),text:id=>element(id).textContent,hidden:id=>element(id).classList.contains('is-hidden'),metrics:()=>({frames:totalFrames,mode:document.body.dataset.mode,wallMs:Date.now()-startedAt}),stage:name=>{stage=name;if(process.env.ASHEN_FLOW_TRACE==='1')console.info('FLOW',stage,JSON.stringify({frames:totalFrames,player:api.read().player,flags:api.read().flags}))},modal:()=>ui.isModalOpen(),dispose:()=>api.dispose(),
  start(){element('start-button').click();tick();if(api.read().flags.directing){press('Enter');release('Enter');tick()}},
  releaseMovement(){for(const code of ['KeyW','KeyA','KeyS','KeyD','ShiftLeft'])release(code)},
  clear(){for(const code of [...held])release(code)},
  closeModal(){for(const name of ['memory','shrine','journal','settings','help'])if(element(name+'-dialog').open)element(name+'-done').click()}
 };
}
module.exports={bootProduction};

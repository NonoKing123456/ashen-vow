/* Ashen Vow: original, gesture-unlocked Web Audio sound design. */
(function(root){
'use strict';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function create(options={}){
 let context=null,disposed=false,enabled=options.enabled!==false,volume=clamp(Number.isFinite(Number(options.volume))?Number(options.volume):.72,0,1);
 let master=null,compressor=null,fxBus=null,ambienceBus=null,musicBus=null,menuBus=null,room=null,roomGain=null,musicRoom=null,musicRoomGain=null,menuRoom=null,fxOutput=null,musicOutput=null,menuOutput=null;
 let musicVolume=1,effectsVolume=1;
 let noiseWhite=null,noiseBrown=null,windFilter=null,windGain=null,windSource=null,rainGain=null;
 const nodes=new Set(),loops=new Set(),lastEvent=new Map();
 let elapsed=0,lastPad=-100,lastBell=8,lastPulse=-100,lastHeartbeat=-100,combatAmount=0,previousCombat=false,phase=1,padIndex=0,paused=false;
 const random=()=>Math.random(),now=()=>context?context.currentTime:0;
 function track(node){nodes.add(node);return node}
 function disconnect(node){try{node.disconnect()}catch(_){}nodes.delete(node)}
 function parameter(param,value,at,duration=.05){if(!param)return;try{param.cancelScheduledValues(at);param.setTargetAtTime(value,at,Math.max(.003,duration))}catch(_){param.value=value}}
 function gain(value=1){const n=track(context.createGain());n.gain.value=value;return n}
 function filter(type,frequency,q=.6){const n=track(context.createBiquadFilter());n.type=type;n.frequency.value=frequency;n.Q.value=q;return n}
 function startSource(source,time,duration){source.start(time);source.stop(time+duration+.05);source.onended=()=>disconnect(source)}
 function envelope(node,time,peak,attack,duration,tail=.001){
  const p=node.gain;p.setValueAtTime(.00001,time);p.exponentialRampToValueAtTime(Math.max(.00002,peak),time+Math.max(.001,attack));p.exponentialRampToValueAtTime(Math.max(.00001,tail),time+duration);
 }
 function scheduleCleanup(items,time){
  // Nodes disconnected by a source's ended event require no timer or render loop.
  return ()=>{for(const item of items)disconnect(item)};
 }
 function route(config={},send=.17,bus=fxBus){
  const distance=Math.max(0,Number(config.distance)||0),level=1/(1+distance*.09),input=gain(level),outputs=[input];
  let dry=input;if(context.createStereoPanner){const pan=track(context.createStereoPanner());pan.pan.value=clamp(Number(config.x)||0,-1,1);input.connect(pan);dry=pan;outputs.push(pan)}
  dry.connect(bus);
  if(send>0&&room){const wet=gain(send);dry.connect(wet);wet.connect(bus===musicBus?musicRoom:bus===menuBus?menuRoom:room);outputs.push(wet)}
  return {input,outputs};
 }
 function oscillator({frequency=220,end=frequency,type='sine',volume=.05,attack=.003,duration=.2,time=now(),config={},send=.12,bus=fxBus,detune=0,lowpass=0}){
  if(!context||disposed)return;
  const osc=track(context.createOscillator()),amp=gain(),r=route(config,send,bus),all=[osc,amp,...r.outputs];
  osc.type=type;osc.frequency.setValueAtTime(Math.max(18,frequency),time);osc.detune.value=detune;
  if(end!==frequency)osc.frequency.exponentialRampToValueAtTime(Math.max(18,end),time+duration*.93);
  envelope(amp,time,volume,attack,duration);
  if(lowpass){const f=filter('lowpass',lowpass);osc.connect(f);f.connect(amp);all.push(f)}else osc.connect(amp);
  amp.connect(r.input);osc.onended=scheduleCleanup(all,time);osc.start(time);osc.stop(time+duration+.025);
 }
 function noise({duration=.15,volume=.06,attack=.002,type='bandpass',frequency=1300,end=frequency,q=.6,time=now(),config={},send=.1,brown=false,bus=fxBus}){
  if(!context||disposed)return;
  const src=track(context.createBufferSource()),amp=gain(),f=filter(type,frequency,q),r=route(config,send,bus),all=[src,amp,f,...r.outputs];
  src.buffer=brown?noiseBrown:noiseWhite;src.loop=true;
  f.frequency.setValueAtTime(Math.max(30,frequency),time);if(end!==frequency)f.frequency.exponentialRampToValueAtTime(Math.max(30,end),time+duration);
  envelope(amp,time,volume,attack,duration);src.connect(f);f.connect(amp);amp.connect(r.input);
  src.onended=scheduleCleanup(all,time);src.start(time,random()*1.8);src.stop(time+duration+.025);
 }
 function bell(frequency=145,volume=.08,time=now(),distance=0,pan=0,duration=3,bus=fxBus){
  const partials=[[1,1,1],[2.006,.38,.65],[2.67,.23,.50],[4.09,.13,.35],[5.43,.06,.20]];
  for(const [ratio,amount,decay]of partials)oscillator({frequency:frequency*ratio,end:frequency*ratio*.997,type:'sine',volume:volume*amount,attack:.008,duration:duration*decay,time,config:{distance,x:pan},send:.52,bus});
  noise({duration:.04,volume:volume*.21,type:'highpass',frequency:1800,time,config:{distance,x:pan},send:.25,bus});
 }
 function makeNoise(seconds,brown){
  const length=Math.floor(context.sampleRate*seconds),buffer=context.createBuffer(1,length,context.sampleRate),data=buffer.getChannelData(0);let state=0;
  for(let i=0;i<length;i++){const white=random()*2-1;state=(state+.019*white)/1.019;data[i]=brown?state*3.3:white;}
  return buffer;
 }
 function createRoom(){
  const length=Math.floor(context.sampleRate*1.45),impulse=context.createBuffer(2,length,context.sampleRate);
  for(let channel=0;channel<2;channel++){const data=impulse.getChannelData(channel);for(let i=0;i<length;i++){const t=i/context.sampleRate;data[i]=(random()*2-1)*Math.pow(1-i/length,2.7)*.34*(t>.022?1:0);}
   for(const [offset,amplitude]of [[.036,.22],[.067,.13],[.109,.08]]){const at=Math.floor(context.sampleRate*(offset+channel*.003));if(at<length)data[at]+=amplitude;}}
  // Separate wet returns make each volume slider control its complete sound,
  // including long bell/pad tails. Muting music cannot leave its reverb audible.
  room=track(context.createConvolver());room.buffer=impulse;roomGain=gain(.23);room.connect(roomGain);roomGain.connect(fxOutput);
  musicRoom=track(context.createConvolver());musicRoom.buffer=impulse;musicRoomGain=gain(.23);musicRoom.connect(musicRoomGain);musicRoomGain.connect(musicOutput);
  menuRoom=track(context.createConvolver());menuRoom.buffer=impulse;const menuRoomGain=gain(.20);menuRoom.connect(menuRoomGain);menuRoomGain.connect(menuOutput);
 }
 function initialize(){
  if(context||disposed)return Boolean(context);
  const Context=root.AudioContext||root.webkitAudioContext;if(!Context)return false;
  try{
   context=new Context({latencyHint:'interactive'});master=gain(enabled?volume:0);
   compressor=track(context.createDynamicsCompressor());compressor.threshold.value=-17;compressor.knee.value=17;compressor.ratio.value=3.8;compressor.attack.value=.003;compressor.release.value=.19;
   master.connect(compressor);compressor.connect(context.destination);
   fxOutput=gain(effectsVolume*(paused?.07:1));musicOutput=gain(musicVolume*(paused?.07:1));menuOutput=gain(effectsVolume);fxOutput.connect(master);musicOutput.connect(master);menuOutput.connect(master);
   fxBus=gain(.77);ambienceBus=gain(.28);musicBus=gain(.16);menuBus=gain(.68);fxBus.connect(fxOutput);ambienceBus.connect(fxOutput);musicBus.connect(musicOutput);menuBus.connect(menuOutput);
   noiseWhite=makeNoise(3,false);noiseBrown=makeNoise(4,true);createRoom();
   windSource=track(context.createBufferSource());windSource.buffer=noiseBrown;windSource.loop=true;windFilter=filter('lowpass',430,.55);const high=filter('highpass',95,.4);windGain=gain(.038);
   windSource.connect(windFilter);windFilter.connect(high);high.connect(windGain);windGain.connect(ambienceBus);windSource.start();loops.add(windSource);
   // A second, very quiet moving air band prevents a flat static hiss.
   const upper=track(context.createBufferSource()),upperFilter=filter('bandpass',1150,.48),upperGain=gain(.009);upper.buffer=noiseWhite;upper.loop=true;upper.connect(upperFilter);upperFilter.connect(upperGain);upperGain.connect(ambienceBus);upper.start();loops.add(upper);
   const rain=track(context.createBufferSource()),rainBand=filter('bandpass',2700,.38);rainGain=gain(.055);rain.buffer=noiseWhite;rain.loop=true;rain.connect(rainBand);rainBand.connect(rainGain);rainGain.connect(ambienceBus);rain.start();loops.add(rain);
   return true;
  }catch(_){context=null;return false;}
 }
 function unlock(){if(disposed)return Promise.resolve(false);if(!initialize())return Promise.resolve(false);try{return Promise.resolve(context.resume()).then(()=>true,()=>false)}catch(_){return Promise.resolve(false)}}
 function applyMix(){if(!context)return;const t=now();parameter(master.gain,enabled?volume:0,t,.035);parameter(fxOutput.gain,effectsVolume*(paused?.07:1),t,.035);parameter(musicOutput.gain,musicVolume*(paused?.07:1),t,.035);parameter(menuOutput.gain,effectsVolume,t,.035)}
 function setEnabled(value){enabled=Boolean(value);applyMix();return enabled}
 function setVolume(value){volume=clamp(Number(value)||0,0,1);applyMix()}
 function setMix(mix={}){for(const key of ['master','music','effects'])if(mix[key]!=null&&Number.isFinite(Number(mix[key]))){const value=clamp(Number(mix[key]),0,1);if(key==='master')volume=value;else if(key==='music')musicVolume=value;else effectsVolume=value;}applyMix();return {master:volume,music:musicVolume,effects:effectsVolume}}
 function playable(){return context&&!disposed&&enabled&&context.state!=='suspended'&&context.state!=='closed'}
 function pad(index,intensity,time){
  // Quiet bowed harmonics, with changing intervals and slow attacks; no perpetual sine drone.
  const progression=[[55,82.4069,110],[51.9131,77.7817,103.826],[48.9994,73.4162,97.9989],[46.2493,69.2957,92.4986]],notes=progression[index%4];
  for(let i=0;i<notes.length;i++){
   oscillator({frequency:notes[i],end:notes[i]*.998,type:i===0?'triangle':'sine',volume:(i===0?.023:.015)*intensity,attack:1.3,duration:7.7,time:time+i*.17,config:{x:(i-1)*.25},send:.42,bus:musicBus,detune:i===1?-4:3,lowpass:470});
   if(i>0)oscillator({frequency:notes[i]*2.001,type:'sine',volume:.004*intensity,attack:1.8,duration:7.1,time:time+.3+i*.1,send:.5,bus:musicBus});
  }
  noise({duration:6.5,volume:.010*intensity,attack:1.5,type:'bandpass',frequency:320,end:440,q:1.1,time,send:.35,brown:true,bus:musicBus});
 }
 function play(event,config={}){
  if(!playable()||(paused&&!['ui','memory','relic','checkpoint'].includes(event)))return;
  const t=now(),heavy=Boolean(config.heavy),combo=Number(config.combo)||0;
  const interval={footstep:.11,swing:.055,hit:.035,bodyhit:.07,guard:.065,parry:.12,checkpoint:1,awaken:.8,heal:.5,memory:.8,relic:.6,bell:2,arrival:2,location:2,ui:.06}[event]||.03;
  if(t-(lastEvent.has(event)?lastEvent.get(event):-100)<interval)return;lastEvent.set(event,t);
  switch(event){
   case 'arrival':
    // A short unresolved oath motif, leaving the rain and footsteps in front.
    bell(110,.043,t,3,-.35,4.8, musicBus);
    for(const [i,f]of [164.814,146.832,123.471].entries())oscillator({frequency:f,type:'sine',volume:.021-i*.003,attack:.24,duration:2.6,time:t+.5+i*.72,config:{x:(i-1)*.2},send:.52,bus:musicBus});
    noise({duration:3.2,volume:.014,attack:.85,type:'bandpass',frequency:430,end:1100,q:.5,time:t,send:.5,brown:true,bus:musicBus});break;
   case 'location':
    bell(164.814,.018,t,5,.3,2.8,musicBus);
    oscillator({frequency:246.942,type:'sine',volume:.012,attack:.15,duration:1.8,time:t+.3,config:{x:-.2},send:.5,bus:musicBus});break;
   case 'step':case 'footstep':{
    const loud=heavy?1.65:1,offset=random()*.013;
    oscillator({frequency:heavy?85:118+random()*25,end:heavy?39:65,type:'triangle',duration:heavy?.15:.1,volume:.046*loud,time:t,config,send:.09});
    noise({duration:.065,volume:.028*loud,type:'lowpass',frequency:1200,end:420,time:t+offset,config,send:.09,brown:true});
    noise({duration:.09,volume:.011*loud,type:'highpass',frequency:1900,end:3200,time:t+.014,config,send:.13});break;
   }
   case 'roll':
    noise({duration:.27,volume:.063,attack:.036,type:'bandpass',frequency:1700,end:360,q:.45,time:t,config,send:.1,brown:true});
    noise({duration:.12,volume:.035,type:'highpass',frequency:1800,end:700,time:t+.065,config,send:.08});
    oscillator({frequency:82,end:39,type:'triangle',volume:.027,duration:.13,time:t+.27,config,send:.08});
    noise({duration:.07,volume:.023,type:'lowpass',frequency:1200,end:400,time:t+.55,config,send:.08,brown:true});
    oscillator({frequency:470,end:350,type:'sine',volume:.009,duration:.10,time:t+.55,config,send:.18});break;
   case 'swing':{
    const dur=heavy?.29:.19;
    noise({duration:dur,volume:heavy?.145:.085,attack:heavy?.055:.027,type:'bandpass',frequency:heavy?430:760,end:heavy?2100:3300,q:.45,time:t,config:{...config,x:clamp((config.x||0)+(combo%2?-.16:.16),-1,1)},send:.07});
    noise({duration:dur*.7,volume:heavy?.05:.024,attack:.012,type:'lowpass',frequency:480,end:115,time:t+.025,config,send:.03,brown:true});
    oscillator({frequency:heavy?112:195,end:heavy?51:94,type:'triangle',volume:heavy?.023:.011,attack:.025,duration:dur,time:t,config,send:.06});break;
   }
   case 'hit':case 'impact':
    oscillator({frequency:heavy?88:126,end:heavy?32:49,type:'triangle',volume:heavy?.115:.073,duration:heavy?.24:.17,time:t,config,send:.15});
    noise({duration:.07,volume:heavy?.125:.08,type:'lowpass',frequency:2100,end:450,time:t,config,send:.16});
    for(const [f,v,d]of [[424,.034,.23],[1055,.012,.17],[1795,.006,.12]])oscillator({frequency:f*(heavy?.84:1),end:f*(heavy?.83:.99),volume:v,type:'sine',duration:d,time:t+.003,config,send:.26});break;
   case 'hurt':case 'bodyhit':
    oscillator({frequency:104,end:36,type:'triangle',volume:.105,duration:.20,time:t,config,send:.05});
    noise({duration:.16,volume:.12,attack:.002,type:'lowpass',frequency:920,end:250,time:t,config,send:.05,brown:true});
    noise({duration:.04,volume:.025,type:'bandpass',frequency:2300,q:.4,time:t,config,send:.08});break;
   case 'perfectguard':case 'perfect-parry':case 'parry':
    bell(622.25,.085,t,Number(config.distance)||0,Number(config.x)||0,1.1);
    oscillator({frequency:830.61,end:1244.51,type:'sine',volume:.042,attack:.008,duration:.29,time:t+.025,config,send:.4});
    noise({duration:.045,volume:.09,type:'highpass',frequency:2600,time:t,config,send:.24});break;
   case 'block':case 'guard':
    oscillator({frequency:heavy?118:171,end:70,type:'triangle',volume:.055,duration:.18,time:t,config,send:.12});
    for(const [f,v]of [[699,.036],[1121,.016],[1772,.008]])oscillator({frequency:f,end:f*.96,volume:v,duration:.20,time:t,config,send:.23});
    noise({duration:.055,volume:.065,type:'highpass',frequency:1300,time:t,config,send:.13});break;
   case 'critical':
   case 'guardbreak':case 'guard-break':case 'posture':
    oscillator({frequency:70,end:25,type:'triangle',volume:.14,duration:.42,time:t,config,send:.25});
    for(let i=0;i<4;i++)oscillator({frequency:[319,607,941,1427][i],end:[186,401,631,1049][i],type:i<2?'triangle':'sine',volume:.038/(i+1),duration:.45+i*.08,time:t+i*.011,config,send:.4});
    noise({duration:.28,volume:.13,type:'bandpass',frequency:1900,end:250,q:.5,time:t,config,send:.25});break;
   case 'heal':
    noise({duration:.65,volume:.035,attack:.2,type:'highpass',frequency:1600,end:3300,time:t,config,send:.45});
    for(let i=0;i<5;i++)oscillator({frequency:[440,659.255,880,1108.731,1318.51][i],end:[440,659.255,880,1108.731,1318.51][i]*1.003,type:'sine',volume:.025*(1-i*.10),attack:.03,duration:.6,time:t+i*.11,config,send:.55});
    oscillator({frequency:146.832,type:'triangle',volume:.018,attack:.09,duration:.8,time:t,config,send:.4});break;
   case 'death':
    noise({duration:1.1,volume:.075,attack:.07,type:'lowpass',frequency:1200,end:100,time:t,config,send:.5,brown:true});
    oscillator({frequency:92.4986,end:30.8677,type:'sine',volume:.1,attack:.01,duration:1.4,time:t,config,send:.6});
    bell(103.826,.04,t+.2,2,0,3.4);break;
   case 'victory':
    bell(164.8138,.10,t,0,-.2,4.0);bell(246.9417,.065,t+.65,2,.25,3.5);bell(329.6276,.045,t+1.35,3,0,3.4);
    noise({duration:1.7,volume:.027,attack:.3,type:'highpass',frequency:1700,end:4000,time:t,send:.65});break;
   case 'gate':
    noise({duration:1.9,volume:.115,attack:.14,type:'lowpass',frequency:600,end:180,time:t,config,send:.4,brown:true});
    oscillator({frequency:47,end:29,type:'sawtooth',volume:.022,attack:.1,duration:1.6,time:t,config,send:.3,lowpass:340});
    for(let i=0;i<5;i++)oscillator({frequency:160+i*17,end:110+i*9,type:'triangle',volume:.017,attack:.012,duration:.16,time:t+.12+i*.28,config,send:.3});
    oscillator({frequency:75,end:30,type:'triangle',volume:.08,duration:.3,time:t+1.72,config,send:.4});break;
   case 'checkpoint':
    bell(220,.052,t,1,-.15,2.7,menuBus);bell(329.6276,.03,t+.17,1,.15,2.2,menuBus);
    noise({duration:1.2,volume:.048,attack:.14,type:'bandpass',frequency:400,end:1700,q:.4,time:t,config,send:.35,brown:true,bus:menuBus});break;
   case 'awaken':
    bell(55,.085,t,3,config.x||0,3.1);
    noise({duration:.65,volume:.055,attack:.2,type:'lowpass',frequency:180,end:750,time:t,config,send:.45,brown:true});
    oscillator({frequency:46.2493,end:55,type:'triangle',volume:.047,attack:.15,duration:1.1,time:t,config,send:.4});break;
   case 'phase':
    bell(69.2957,.08,t,1,0,3.2);
    noise({duration:.9,volume:.09,attack:.18,type:'bandpass',frequency:260,end:1700,q:.55,time:t,config,send:.38,brown:true});
    oscillator({frequency:36.7081,end:73.4162,type:'sawtooth',volume:.017,attack:.16,duration:.9,time:t,config,send:.25,lowpass:310});break;
   case 'memory':
    // A breath and three distant harmonics leave room for reading the text.
    noise({duration:1.25,volume:.018,attack:.23,type:'bandpass',frequency:1100,end:2400,q:.5,time:t,config,send:.55,bus:menuBus});
    for(const [i,f]of [293.665,440,587.33].entries())oscillator({frequency:f,type:'sine',volume:.025-i*.004,attack:.035,duration:1.4,time:t+i*.23,config,send:.58,bus:menuBus});break;
   case 'relic':
    bell(261.626,.047,t,0,-.15,2.2,menuBus);
    for(const [i,f]of [329.628,391.995,523.251].entries())oscillator({frequency:f,type:'sine',volume:.021,attack:.11,duration:1.65,time:t+.16+i*.12,config:{...config,x:(i-1)*.2},send:.48,bus:menuBus});
    noise({duration:.8,volume:.016,attack:.16,type:'highpass',frequency:2000,time:t,send:.4,bus:menuBus});break;
   case 'bell':
    // The final bell has a low bronze fundamental and a long inharmonic decay.
    bell(82.407,.12,t,0,-.12,7.2);bell(164.814,.045,t+.025,1,.16,5.1);
    oscillator({frequency:41.2035,end:41.1,type:'sine',volume:.052,attack:.03,duration:3.1,time:t,send:.35});
    noise({duration:.15,volume:.065,type:'lowpass',frequency:1800,end:380,time:t,config,send:.38});break;
   case 'ui':
    oscillator({frequency:config.blocked?174.614:349.228,end:config.blocked?146.832:523.251,type:'sine',volume:.022,duration:.11,time:t,send:.18,bus:menuBus});break;
   default:break;
  }
 }
 function update(dt,state={}){
  if(disposed)return;dt=clamp(Number(dt)||0,0,.1);elapsed+=dt;
  const inCombat=Boolean(state.combat),nextPhase=Number(state.phase)||1,nextPause=Boolean(state.paused);
  if(nextPause!==paused){paused=nextPause;applyMix()}
  combatAmount+=((inCombat&&!paused?1:0)-combatAmount)*(1-Math.exp(-dt*1.5));combatAmount=clamp(combatAmount,0,1);
  if(!playable())return;
  if(rainGain)parameter(rainGain.gain,state.sheltered?.012:.055,now(),.8);
  const t=now();parameter(ambienceBus.gain,paused?.11:.28,t,.5);parameter(musicBus.gain,paused?.035:.10+combatAmount*.075,t,.55);
  if(windFilter)parameter(windFilter.frequency,410+Math.sin(elapsed*.17)*145+Math.sin(elapsed*.039)*70,t,.4);
  if(windGain)parameter(windGain.gain,.038+Math.sin(elapsed*.21)*.011+Math.sin(elapsed*.057)*.008,t,.5);
  if(!paused){
   if(inCombat&&!previousCombat)lastPad=elapsed-8;
   if(elapsed-lastPad>8.4){lastPad=elapsed;pad(padIndex++,inCombat?1:.38,t+.025)}
   if(elapsed-lastBell>17.5+Math.sin(elapsed*.3)*3){lastBell=elapsed;bell([110,82.4069,73.4162][padIndex%3],inCombat?.014:.023,t,18,(random()-.5)*1.6,4.4)}
   if(nextPhase>phase)play('phase');
   if(inCombat&&combatAmount>.25&&elapsed-lastPulse>(nextPhase>=2?.62:.86)){
    lastPulse=elapsed;const p=nextPhase>=2?55:46.249;
    oscillator({frequency:p,end:p*.5,type:'triangle',volume:.019*combatAmount,attack:.008,duration:.24,time:t,send:.18,bus:musicBus,lowpass:190});
    noise({duration:.12,volume:.008*combatAmount,attack:.009,type:'lowpass',frequency:320,end:110,time:t,send:.1,brown:true,bus:musicBus});
   }
   if(Number(state.playerHp)<.28&&inCombat&&elapsed-lastHeartbeat>1.05){
    lastHeartbeat=elapsed;
    for(const delay of [0,.14])oscillator({frequency:62,end:39,type:'sine',volume:.018,attack:.012,duration:.13,time:t+delay,send:.02});
   }
  }
  phase=nextPhase;previousCombat=inCombat;
 }
 function dispose(){
  if(disposed)return;disposed=true;
  if(context){for(const source of loops){try{source.stop()}catch(_){}}loops.clear();for(const node of [...nodes])disconnect(node);try{const result=context.close();if(result&&result.catch)result.catch(()=>{})}catch(_){}context=null;}
 }
 return {unlock,setEnabled,setVolume,setMix,update,play,dispose,getMix:()=>({master:volume,music:musicVolume,effects:effectsVolume}),get enabled(){return enabled},get available(){return Boolean(context)},get unlocked(){return context&&context.state==='running'},get activeNodes(){return nodes.size}};
}
root.AshenAudio={create};if(typeof module!=='undefined'&&module.exports)module.exports=root.AshenAudio;
})(typeof window!=='undefined'?window:globalThis);

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');

function harness(){
 const nodes=[];
 class Param{constructor(value=0){this.value=value}cancelScheduledValues(){}setValueAtTime(v){this.value=v}setTargetAtTime(v){this.value=v}exponentialRampToValueAtTime(v){this.value=v}}
 class Node{constructor(type){this.kind=type;this.links=[];this.gain=new Param(1);this.frequency=new Param(440);this.detune=new Param();this.Q=new Param();this.pan=new Param();nodes.push(this)}connect(n){this.links.push(n)}disconnect(){this.links=[]}start(t){this.started=t}stop(t){this.stopped=t}}
 let context;
 class Context{
  constructor(){this.currentTime=0;this.sampleRate=1000;this.state='suspended';this.destination=new Node('destination');context=this}
  createGain(){return new Node('gain')}createOscillator(){return new Node('oscillator')}createBufferSource(){return new Node('buffer-source')}createBiquadFilter(){return new Node('filter')}createStereoPanner(){return new Node('panner')}createConvolver(){return new Node('convolver')}
  createDynamicsCompressor(){const n=new Node('compressor');for(const key of ['threshold','knee','ratio','attack','release'])n[key]=new Param();return n}
  createBuffer(channels,length){const data=Array.from({length:channels},()=>new Float32Array(length));return {getChannelData:i=>data[i]}}
  async resume(){this.state='running'}async close(){this.state='closed'}
 }
 const scope={AudioContext:Context,Math,Float32Array,Set,Map,Number,Boolean,Promise,module:{exports:{}}};scope.globalThis=scope;
 vm.runInNewContext(fs.readFileSync(require.resolve('./audio.js'),'utf8'),scope);
 const sound=scope.AshenAudio.create();
 return {sound,nodes,get context(){return context},sources:()=>nodes.filter(n=>n.kind==='oscillator'||n.kind==='buffer-source')};
}
test('music and effects sliders include their independent reverb returns and master volume remains backwards compatible',async()=>{
 const q=harness();q.sound.setMix({master:.6,music:0,effects:.4});await q.sound.unlock();
 assert.equal(q.sound.getMix().master,.6);assert.equal(q.sound.getMix().music,0);assert.equal(q.sound.getMix().effects,.4);
 const master=q.nodes.find(n=>n.kind==='gain'),wet=q.nodes.filter(n=>n.kind==='convolver');assert.equal(wet.length,3);assert.equal(master.gain.value,.6);
 const fxOutput=wet[0].links[0].links[0],musicOutput=wet[1].links[0].links[0];assert.equal(fxOutput.gain.value,.4);assert.equal(musicOutput.gain.value,0);
 q.sound.setVolume(.25);assert.equal(master.gain.value,.25);q.sound.setEnabled(false);assert.equal(master.gain.value,0);q.sound.setEnabled(true);assert.equal(master.gain.value,.25);
 q.sound.dispose();assert.equal(q.sound.activeNodes,0);
});
test('pausing at zero simulation time ducks ongoing tails and prevents gameplay voices until resumed',async()=>{
 const q=harness();await q.sound.unlock();q.sound.play('bell');const before=q.sources().length;assert.ok(before>3);
 const wet=q.nodes.filter(n=>n.kind==='convolver'),fxOutput=wet[0].links[0].links[0],musicOutput=wet[1].links[0].links[0],menuOutput=wet[2].links[0].links[0];
 q.sound.update(0,{paused:true});assert.equal(fxOutput.gain.value,.07);assert.equal(musicOutput.gain.value,.07);assert.equal(menuOutput.gain.value,1);
 q.sound.play('hit');assert.equal(q.sources().length,before);q.sound.play('relic');assert.ok(q.sources().length>before);
 q.sound.update(0,{paused:false});assert.equal(fxOutput.gain.value,1);q.context.currentTime=1;q.sound.play('hit');assert.ok(q.sources().length>before);
});
test('discoveries, relic attunement and final bell have distinct playable voices without repeated frame spam',async()=>{
 const q=harness();await q.sound.unlock();
 for(const name of ['memory','relic','bell']){const before=q.sources().length;q.context.currentTime+=3;q.sound.play(name);const count=q.sources().length;assert.ok(count>before,name);q.sound.play(name);assert.equal(q.sources().length,count,name+' is debounced')}
 q.sound.setMix({master:100,music:-1,effects:NaN});assert.equal(q.sound.getMix().master,1);assert.equal(q.sound.getMix().music,0);assert.equal(q.sound.getMix().effects,1);
});

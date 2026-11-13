const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function boot(seed={}){
 const nodes=new Map(),storage=new Map(Object.entries(seed)),events=[],scheduled=new Map();let timer=0;
 const document={activeElement:null};
 function element(id,tag='BUTTON'){
  if(nodes.has(id))return nodes.get(id);
  const classes=new Set(),attrs={},children=[],queries=new Map();
  const node={id,tagName:tag,type:'',value:'',min:'0',max:'1',step:'.05',disabled:false,isConnected:true,open:false,textContent:'',style:{setProperty(k,v){this[k]=v}},dataset:{},attrs,children,queries,
   classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle(c,value){if(value===undefined)value=!classes.has(c);value?classes.add(c):classes.delete(c);return value;}},
   setAttribute(k,v){attrs[k]=String(v)},getAttribute:k=>attrs[k],addEventListener(k,f){this['event_'+k]=f},
   querySelector(selector){if(!queries.has(selector))queries.set(selector,element(id+':'+selector,'SPAN'));return queries.get(selector);},
   querySelectorAll(){return this.options||[]},appendChild(child){children.push(child)},replaceChildren(){children.length=0},
   getClientRects:()=>[{}],showModal(){this.open=true},close(){this.open=false},focus(){document.activeElement=this},click(){this.onclick?.()},remove(){this.isConnected=false}};
  nodes.set(id,node);return node;
 }
 document.body=element('body','BODY');document.getElementById=element;document.createElement=t=>element('generated-'+nodes.size,t.toUpperCase());document.createElementNS=(ns,t)=>document.createElement(t);
 const context={window:null,document,Math,Map,Number,String,Array,Object,JSON,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setTimeout(fn){scheduled.set(++timer,fn);return timer},clearTimeout(id){scheduled.delete(id)}};
 context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'ui.js'),'utf8'),context);
 const ui=context.AshenUI.create({onHelp:open=>events.push(['help',open]),onRelic:id=>events.push(['relic',id]),onSettings:s=>events.push(['settings',s]),onTitle:()=>events.push(['title']),onResume:()=>events.push(['resume'])});
 return{ui,element,events,storage,document,scheduled};
}
test('every static UI target is present in the production document without duplicate IDs',()=>{
 const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8'),source=fs.readFileSync(path.join(__dirname,'ui.js'),'utf8'),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]),known=new Set(ids);
 assert.equal(ids.length,known.size,'HTML identifiers must be unique');
 for(const match of source.matchAll(/\$\('([^']+)'\)/g))assert.ok(known.has(match[1]),'Missing UI element '+match[1]);
 for(const dialog of ['help','settings','journal','shrine','memory'])for(const suffix of ['dialog','close','done'])assert.ok(known.has(dialog+'-'+suffix));
 for(const stat of ['parries','rolls','damage','executions'])for(const prefix of ['journal','result'])assert.ok(known.has(prefix+'-'+stat));
});
test('all modal types preserve a running or paused game and Escape closes settings as well as help',()=>{
 const q=boot();q.ui.setStarted(true);
 q.element('pause-settings').click();assert.equal(q.ui.isModalOpen(),true);assert.equal(q.ui.isPaused(),true);
 q.ui.hideHelp();assert.equal(q.ui.isModalOpen(),false);assert.equal(q.ui.isPaused(),false);assert.equal(q.document.activeElement.id,'game');
 q.ui.setPaused(true);q.ui.showShrine({relic:'ember'});q.ui.hideHelp();assert.equal(q.ui.isPaused(),true);
 q.ui.showMemory({title:'A',text:'B'});q.ui.hideHelp();assert.equal(q.ui.isPaused(),true);
 q.element('pause-settings').click();q.element('settings-dialog').event_cancel({preventDefault(){}});assert.equal(q.ui.isModalOpen(),false);assert.equal(q.ui.isPaused(),true);
});
test('switching journal into a memory cannot accidentally unpause a previously paused run',()=>{
 const q=boot();q.ui.setStarted(true);q.ui.setPaused(true);
 const entry={id:'arrival',title:'Rain',text:'A remembered oath'};
 q.ui.showJournal({player:{x:3,z:12,yaw:0},memories:['arrival'],entries:[entry],discoveries:[{id:'arrival',x:3,z:13}],stats:{parries:2,rolls:7,damageTaken:19}});
 assert.equal(q.element('map-player').attrs.transform,'translate(3 12) rotate(0)');assert.equal(q.element('journal-parries').textContent,'2');
 assert.equal(q.element('map-discoveries').children.length,1);
 q.element('journal-entry-arrival').click();assert.equal(q.element('journal-dialog').open,false);assert.equal(q.element('memory-dialog').open,true);q.ui.hideHelp();assert.equal(q.ui.isPaused(),true);assert.equal(q.element('journal-dialog').open,true);q.ui.hideHelp();assert.equal(q.ui.isModalOpen(),false);assert.equal(q.ui.isPaused(),true);
});
test('a shrine has exactly one selected blessing and selection calls the gameplay controller',()=>{
 const q=boot();q.ui.showShrine({relic:'wind'});assert.equal(q.element('relic-wind').attrs['aria-pressed'],'true');
 q.element('relic-edge').click();assert.equal(q.element('relic-wind').attrs['aria-pressed'],'false');assert.equal(q.element('relic-edge').attrs['aria-pressed'],'true');
 assert.deepEqual(q.events.find(e=>e[0]==='relic'),['relic','edge']);assert.equal(q.element('shrine-current').textContent,'断誓之刃');
});
test('settings sanitize persisted ranges and every change returns and persists a complete audio mix',()=>{
 const q=boot({'ashen-vow-settings':JSON.stringify({master:6,music:-3,effects:.5,sensitivity:20,shake:false,hints:false})}),s=q.ui.getSettings();
 assert.equal(s.master,1);assert.equal(s.music,0);assert.equal(s.effects,.5);assert.equal(s.sensitivity,1.8);assert.equal(q.document.body.dataset.reducedMotion,'true');
 const slider=q.element('setting-master');slider.value=.25;slider.oninput();assert.equal(q.ui.getSettings().master,.25);assert.equal(JSON.parse(q.storage.get('ashen-vow-settings')).master,.25);
 q.element('setting-hints').click();assert.equal(q.ui.getSettings().hints,true);
 q.ui.updateStep('Observe the Warden');assert.equal(q.element('step-panel').classList.contains('is-hidden'),false);
});
test('text from discoveries uses textContent and can never introduce markup or event handlers',()=>{
 const q=boot(),attack='<img src=x onerror=alert(1)>';q.ui.showMemory({title:attack,text:attack,subtitle:attack});
 assert.equal(q.element('memory-copy').textContent,attack);assert.equal(q.element('memory-copy').children.length,0);
 q.ui.update({telegraph:attack,status:attack,support:'gamepad'});assert.equal(q.document.body.dataset.input,'gamepad');assert.equal(q.element('telegraph-text').textContent,attack);
});
test('controller menu navigation focuses before activation and steps volume without firing game actions',()=>{
 const q=boot(),button=q.element('menu-test'),slider=q.element('setting-master');slider.tagName='INPUT';slider.type='range';slider.step='.05';
 q.ui.setStarted(true);q.ui.setPaused(true);q.element('pause-screen').options=[button,slider];q.document.activeElement=null;
 let clicks=0;button.onclick=()=>clicks++;q.ui.menuInput('accept');assert.equal(clicks,0);assert.equal(q.document.activeElement,button);
 q.ui.menuInput('accept');assert.equal(clicks,1);q.ui.menuInput('next');assert.equal(q.document.activeElement,slider);
 const before=q.ui.getSettings().master;q.ui.menuInput('left');assert.ok(q.ui.getSettings().master<before);
 q.ui.menuInput('back');assert.equal(q.ui.isPaused(),false);assert.ok(q.events.some(e=>e[0]==='resume'));
});

test('cinematic presentation has one optional skip action without changing the game pause or modal state',()=>{
 const q=boot();q.ui.setStarted(true);let skipped=0;
 q.ui.setCinematic(true,{title:'雨夜回廊',subtitle:'THE LAST BELL',skip:()=>skipped++});
 assert.equal(q.document.body.dataset.cinematic,'true');assert.equal(q.ui.isPaused(),false);assert.equal(q.ui.isModalOpen(),false);
 assert.equal(q.element('game-hud').inert,true);assert.equal(q.element('touch-ui').inert,true);assert.equal(q.element('game-hud').attrs['aria-hidden'],'true');
 assert.equal(q.element('cinematic-title').textContent,'雨夜回廊');assert.equal(q.element('cinematic-frame').attrs['aria-hidden'],'false');
 q.element('cinematic-skip').click();assert.equal(skipped,1);
 q.ui.setCinematic(false);q.element('cinematic-skip').click();assert.equal(skipped,1);assert.equal(q.element('cinematic-frame').attrs['aria-hidden'],'true');
 assert.equal(q.element('game-hud').inert,false);assert.equal(q.element('touch-ui').inert,false);assert.equal(q.element('game-hud').attrs['aria-hidden'],'false');
 q.ui.setCinematic(true);assert.equal(q.element('cinematic-skip').classList.contains('is-hidden'),true);
 q.ui.setStarted(false);assert.equal(q.document.body.dataset.cinematic,'false');
});

test('location cards and chapter cards hand off without overlapping or injecting markup',()=>{
 const q=boot();q.ui.chapter('钟门已解封','前往庭院深处');assert.equal(q.element('chapter-card').classList.contains('show'),true);
 q.ui.location('<b>余火小堂</b>','THE EMBER CHAPEL');assert.equal(q.element('chapter-card').classList.contains('show'),false);
 assert.equal(q.element('location-card').classList.contains('show'),true);assert.equal(q.element('location-title').textContent,'<b>余火小堂</b>');assert.equal(q.element('location-title').children.length,0);
 assert.equal(q.element('location-card').attrs['aria-hidden'],'false');
 q.ui.chapter('守望终结');assert.equal(q.element('location-card').classList.contains('show'),false);assert.equal(q.element('location-card').attrs['aria-hidden'],'true');
});

test('an interaction owns its layout lane only while available and preserves the secondary combat status',()=>{
 const q=boot();q.ui.update({status:'精准格挡 · 下一剑强化',telegraph:'突刺',context:{text:'处决'}});
 assert.equal(q.document.body.dataset.interaction,'true');assert.equal(q.element('interaction').classList.contains('is-hidden'),false);
 q.ui.setContext({text:'钟门尚未解封',available:false});assert.equal(q.document.body.dataset.interaction,'false');assert.equal(q.element('interaction').classList.contains('is-hidden'),true);
 assert.equal(q.element('combat-status').textContent,'精准格挡 · 下一剑强化');assert.equal(q.element('telegraph-text').textContent,'突刺');
 q.ui.setContext(null);assert.equal(q.document.body.dataset.interaction,'false');
});

test('the objective display does not restart its emphasis timer on every gameplay frame',()=>{
 const q=boot();q.ui.update({objective:'推开钟门',locked:false,bossHp:0});const count=q.scheduled.size;
 q.ui.update({objective:'推开钟门',locked:true,bossHp:0});assert.equal(q.scheduled.size,count);assert.equal(q.document.body.dataset.combat,'true');
 for(const fn of [...q.scheduled.values()])fn();assert.equal(q.document.body.dataset.objectiveFresh,'false');
 q.ui.update({objective:'敲响最后的钟'});assert.equal(q.document.body.dataset.objectiveFresh,'true');
});

test('journey imprints reflect real achievements and missing damage data never earns a flawless completion',()=>{
 const q=boot();q.ui.result({victory:true,kills:3,memories:3,stats:{parries:2,damageTaken:40}});
 assert.equal(q.element('result-imprint-title').textContent,'残响收藏者');
 q.ui.result({victory:true,kills:3,stats:{damageTaken:0}});assert.equal(q.element('result-imprint-title').textContent,'无瑕誓约');
 q.ui.result({victory:true,kills:3,stats:{}});assert.equal(q.element('result-imprint-title').textContent,'长夜行者');
 q.ui.result({victory:false,kills:0,stats:{parries:3,damageTaken:120}});assert.equal(q.element('result-imprint-title').textContent,'听刃者');
 q.ui.result({victory:false,stats:{}});assert.equal(q.element('result-imprint').classList.contains('is-hidden'),true);
});

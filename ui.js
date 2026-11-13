(function(global){
'use strict';
global.AshenUI={create:function(config={}){
  const $=id=>document.getElementById(id),cache=Object.create(null),timers=new Map();
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  let started=false,paused=false,dialogWasPaused=false,resultVisible=false,previousFocus=null,step='',memoryReturn=false;
  const settings={audio:true,quality:'high',master:.72,music:.65,effects:.85,sensitivity:1,shake:true,hints:true};
  try{
    const stored=JSON.parse(localStorage.getItem('ashen-vow-settings')||'null');
    if(stored&&typeof stored==='object')for(const key of Object.keys(settings))if(typeof stored[key]===typeof settings[key])settings[key]=stored[key];
    settings.audio=localStorage.getItem('ashen-vow-audio')!=='off'&&settings.audio;
    if(localStorage.getItem('ashen-vow-quality')==='low')settings.quality='low';
  }catch(_){}
  settings.quality=settings.quality==='low'?'low':'high';
  for(const key of ['master','music','effects'])settings[key]=clamp(Number(settings[key])||0,0,1);
  settings.sensitivity=clamp(Number(settings.sensitivity)||1,.4,1.8);
  const el={title:$('title-screen'),hud:$('game-hud'),pause:$('pause-screen'),result:$('result-screen'),touch:$('touch-ui'),help:$('help-dialog'),settings:$('settings-dialog'),journal:$('journal-dialog'),shrine:$('shrine-dialog'),memory:$('memory-dialog')};
  const dialogKeys=['help','settings','journal','shrine','memory'];
  const relics=[
    {id:'ember',name:'余火之心'},
    {id:'wind',name:'逐风之印'},
    {id:'edge',name:'断誓之刃'}
  ];
  function text(id,value){const node=$(id),v=String(value==null?'':value);if(node&&cache[id]!==v){cache[id]=v;node.textContent=v;}}
  function show(node,yes){if(typeof node==='string')node=$(node);if(node)node.classList.toggle('is-hidden',!yes);}
  function after(key,fn,ms){clearTimeout(timers.get(key));timers.set(key,setTimeout(fn,ms));}
  function scale(id,value){const node=$(id),x=clamp(Number(value)||0,0,1);if(node&&cache[id]!==x){cache[id]=x;node.style.transform='scaleX('+x+')';}}
  function modal(){return dialogKeys.some(key=>el[key]&&el[key].open);}
  function mode(){const open=modal();document.body.dataset.mode=resultVisible?'result':open?'help':!started?'title':paused?'pause':'game';show(el.touch,started&&!paused&&!resultVisible&&!open);show(el.pause,started&&paused&&!open&&!resultVisible);}
  function invoke(name,value){if(typeof config[name]==='function')return config[name](value);}
  function persist(){try{localStorage.setItem('ashen-vow-settings',JSON.stringify(settings));localStorage.setItem('ashen-vow-audio',settings.audio?'on':'off');localStorage.setItem('ashen-vow-quality',settings.quality);}catch(_){}invoke('onSettings',{...settings});}
  function syncSettings(){
    text('hud-audio',settings.audio?'声音 开':'声音 关');
    const toggle=$('audio-toggle');if(toggle){toggle.setAttribute('aria-pressed',String(settings.audio));toggle.querySelector('span').textContent=settings.audio?'开启':'关闭';}
    for(const q of ['high','low'])$('quality-'+q)?.setAttribute('aria-pressed',String(settings.quality===q));
    for(const key of ['master','music','effects','sensitivity']){
      const input=$('setting-'+key);if(input)input.value=settings[key];
      text('setting-'+key+'-value',key==='sensitivity'?settings[key].toFixed(1)+'×':Math.round(settings[key]*100)+'%');
    }
    for(const key of ['shake','hints']){const node=$('setting-'+key);if(node){node.setAttribute('aria-pressed',String(settings[key]));node.querySelector('span').textContent=settings[key]?'开启':'关闭';}}
    document.body.dataset.reducedMotion=String(!settings.shake);document.body.dataset.hints=String(settings.hints);
    show('step-panel',settings.hints&&!!step);
  }
  function toggleAudio(){settings.audio=!settings.audio;persist();syncSettings();invoke('onAudio',settings.audio);}
  function openDialog(which){
    if(!el[which]||el[which].open)return;
    const alreadyOpen=modal();
    if(!alreadyOpen){dialogWasPaused=paused;previousFocus=document.activeElement;}
    for(const key of dialogKeys)if(el[key]?.open)el[key].close();
    if(started)paused=true;
    el[which].showModal();mode();invoke('onHelp',true);
    el[which].querySelector('[data-dialog-focus]')?.focus();
  }
  function closeDialog(which){
    if(!el[which]?.open)return;
    if(which==='memory'&&memoryReturn){memoryReturn=false;el.memory.close();el.journal.showModal();mode();el.journal.querySelector('[data-dialog-focus]')?.focus();return;}
    el[which].close();paused=dialogWasPaused;mode();invoke('onHelp',false);
    if(started&&!paused)$('game').focus();else if(previousFocus?.isConnected)previousFocus.focus();
    previousFocus=null;
  }
  function closeAll(){for(const key of dialogKeys)if(el[key]?.open){closeDialog(key);return;}}
  function resetSurfaces(){clearTimeout(timers.get('result'));resultVisible=false;show(el.result,false);$('death-fade').classList.remove('active');}
  function begin(resume){resetSurfaces();invoke('onStart',{continue:resume});}
  function restart(){resetSurfaces();show(el.pause,false);paused=false;mode();invoke('onRestart');$('game').focus();}
  function bind(id,fn){const node=$(id);if(node)node.onclick=fn;}
  bind('start-button',()=>begin(false));bind('continue-button',()=>begin(true));bind('retry-button',restart);bind('pause-restart',restart);
  bind('resume-button',()=>{api.setPaused(false);invoke('onResume');$('game').focus();});
  bind('hud-pause',()=>{api.setPaused(!paused);invoke(paused?'onPause':'onResume');});
  for(const id of ['title-help','pause-help','hud-help'])bind(id,()=>openDialog('help'));
  for(const id of ['title-settings','pause-settings'])bind(id,()=>openDialog('settings'));
  for(const id of ['hud-journal','pause-journal'])bind(id,()=>invoke('onJournal'));
  for(const id of ['pause-title','result-title-button'])bind(id,()=>{closeAll();invoke('onTitle');api.setStarted(false);});
  for(const key of dialogKeys){
    bind(key+'-close',()=>closeDialog(key));bind(key+'-done',()=>closeDialog(key));
    el[key]?.addEventListener('cancel',event=>{event.preventDefault();closeDialog(key);});
  }
  bind('hud-audio',toggleAudio);bind('audio-toggle',toggleAudio);
  for(const q of ['high','low'])bind('quality-'+q,()=>{settings.quality=q;persist();syncSettings();invoke('onQuality',q);});
  for(const key of ['master','music','effects','sensitivity']){
    const node=$('setting-'+key);if(node)node.oninput=()=>{settings[key]=clamp(Number(node.value)||0,key==='sensitivity'?.4:0,key==='sensitivity'?1.8:1);persist();syncSettings();};
  }
  for(const key of ['shake','hints'])bind('setting-'+key,()=>{settings[key]=!settings[key];persist();syncSettings();});
  function statsInto(prefix,s={}){
    const values={parries:s.parries??s.perfectGuards??0,rolls:s.rolls??0,damage:s.damageTaken??0,executions:s.executions??s.criticals??0};
    for(const [key,value]of Object.entries(values))text(prefix+'-'+key,Math.round(Number(value)||0));
  }
  function renderRelic(id){for(const relic of relics){const node=$('relic-'+relic.id);if(node){const selected=relic.id===id;node.setAttribute('aria-pressed',String(selected));node.querySelector('.relic-state').textContent=selected?'已立下此誓':'选择此誓';}}text('shrine-current',relics.find(r=>r.id===id)?.name||'尚未立誓');}
  for(const relic of relics)bind('relic-'+relic.id,()=>{renderRelic(relic.id);invoke('onRelic',relic.id);});
  const api={
    elements:{...el,joy:$('joy'),knob:$('joy-knob'),canvas:$('game')},
    update:function(s={}){
      if(s.hp!=null){const max=s.maxHp||100;scale('hp-fill',s.hp/max);scale('hp-trail',s.hp/max);text('hp-text',Math.ceil(Math.max(0,s.hp))+' / '+max);document.body.dataset.hp=Math.ceil(s.hp);document.body.dataset.lowHealth=String(s.hp>0&&s.hp/max<.26);}
      if(s.stamina!=null){scale('stamina-fill',s.stamina/(s.maxStamina||100));document.body.dataset.stamina=Math.round(s.stamina);document.body.dataset.exhausted=String(s.stamina<25);}
      if(s.flasks!=null)text('flask-count',s.flasks);
      if(s.objective!=null)text('objective-text',typeof s.objective==='object'?s.objective.text:s.objective);
      if(s.bossHp!=null){const visible=s.bossVisible!==false&&s.bossMax>0&&s.bossHp>0;show('boss-panel',visible);scale('boss-fill',s.bossHp/(s.bossMax||1));scale('boss-trail',s.bossHp/(s.bossMax||1));if(s.bossName!=null)text('boss-name',s.bossName);if(s.bossTitle!=null)text('boss-title',s.bossTitle);document.body.dataset.bossHp=Math.ceil(s.bossHp);}
      if(s.posture!=null)scale('posture-fill',s.posture/(s.postureMax||100));
      if(s.enemyHp!=null){scale('target-hp',s.enemyHp/(s.enemyMax||1));show('target-detail',!!s.enemyName&&s.enemyHp>0);if(s.enemyName)text('target-name',s.enemyName);}
      if(s.enemyPosture!=null)scale('target-posture',s.enemyPosture/100);
      if(s.locked===false)show('lock-marker',false);
      if(s.relicName!=null){text('equipped-relic',s.relicName||'未立誓');show('relic-hud',!!s.relicName);}
      if(s.memories!=null)text('memory-count',(Array.isArray(s.memories)?s.memories.length:s.memories)+' / 3');
      if(s.telegraph!=null){text('telegraph-text',s.telegraph);show('telegraph',!!s.telegraph);}
      if(s.status!=null){text('combat-status',s.status);show('combat-status',!!s.status);}
      if(s.support!=null){const device=s.support==='gamepad'?'gamepad':'keyboard';text('input-support',s.support==='gamepad'?'手柄':s.support==='keyboard'?'键盘与鼠标':s.support);document.body.dataset.input=device;}
      if(Object.prototype.hasOwnProperty.call(s,'context'))api.setContext(s.context);
      if(s.step!=null)api.updateStep(s.step);
    },
    notify:function(message,kind='info'){const node=$('toast');if(kind==='parry'){const caption=$('impact-caption');caption.textContent=String(message).split(' · ')[0];caption.classList.remove('show');void caption.offsetWidth;caption.classList.add('show');after('impact',()=>caption.classList.remove('show'),1100);}node.querySelector('span').textContent=String(message);node.dataset.kind=kind;node.classList.remove('show');void node.offsetWidth;node.classList.add('show');after('toast',()=>node.classList.remove('show'),kind==='checkpoint'?3800:2600);},
    chapter:function(title,sub=''){text('chapter-title',title);text('chapter-subtitle',sub);const node=$('chapter-card');node.classList.remove('show');void node.offsetWidth;node.classList.add('show');after('chapter',()=>node.classList.remove('show'),3700);},
    damage:function(amount=1){const node=$('hurt-overlay');node.style.setProperty('--hurt',Math.min(.85,.25+Math.abs(amount)/100));node.classList.remove('active');void node.offsetWidth;node.classList.add('active');after('hurt',()=>node.classList.remove('active'),650);},
    result:function(s={}){
      const victory=!!s.victory;resultVisible=true;paused=false;show(el.pause,false);show(el.touch,false);show('lock-marker',false);show('interaction',false);show('step-panel',false);show('telegraph',false);show('combat-status',false);
      $('result-screen').dataset.victory=String(victory);text('result-kicker',victory?'THE LAST BELL RINGS AGAIN':'THE VOW REMAINS');text('result-title',victory?'长夜将尽':'誓约未竟');text('result-copy',victory?'钟声越过废墟。这一次，守望者终于可以离去。':'这并非誓言的终点。余火会记得你来过。');$('retry-button').querySelector('span').textContent=victory?'再次踏入余烬':'从余烬中重新站起';
      show('result-stats',true);const seconds=Math.max(0,Math.floor(s.time||0));text('result-time',Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'));text('result-kills',s.kills||0);text('result-memories',(Array.isArray(s.memories)?s.memories.length:Number(s.memories)||0)+' / 3');statsInto('result',s.stats||s);
      $('death-fade').classList.add('active');after('result',()=>{show(el.result,true);mode();$('retry-button').focus();},victory?1250:850);mode();
    },
    setPaused:function(value){paused=!!value;if(!started||resultVisible)paused=false;mode();if(paused)$('resume-button').focus();},
    setStarted:function(value){
      for(const key of dialogKeys)if(el[key]?.open)el[key].close();
      started=!!value;paused=false;dialogWasPaused=false;resultVisible=false;previousFocus=null;memoryReturn=false;clearTimeout(timers.get('result'));show(el.title,!started);show(el.hud,started);show(el.pause,false);show(el.result,false);$('death-fade').classList.remove('active');mode();if(!started)$('start-button').focus();
    },
    setContext:function(value){const s=typeof value==='object'&&value!==null?value:{text:value};text('interaction-text',s.text||'');text('interaction-key',s.key||'F');show('interaction',!!s.text&&s.available!==false);},
    setLock:function(s={}){show('lock-marker',!!s.visible);if(s.visible){$('lock-marker').style.left=(s.x||0)+'px';$('lock-marker').style.top=(s.y||0)+'px';}},
    updateStep:function(value){step=String(value||'');text('step-text',step);show('step-panel',settings.hints&&!!step);},
    showDamage:function(x,y,amount,type='normal'){if(typeof x==='object'){const s=x;x=s.x;y=s.y;amount=s.amount;type=s.type||'normal';}const node=document.createElement('span');node.className='damage-number '+String(type).replace(/[^a-z-]/gi,'');node.style.left=(Number(x)||0)+'px';node.style.top=(Number(y)||0)+'px';node.textContent=typeof amount==='number'?Math.round(amount):String(amount);$('damage-numbers').appendChild(node);setTimeout(()=>node.remove(),1050);},
    setCheckpoint:function(available){show('continue-button',!!available);$('start-button').classList.toggle('secondary',!!available);$('start-button').querySelector('span').textContent=available?'重新启程':'踏入余烬';},
    setLoading:function(value){show('loading-strip',!!value);$('start-button').disabled=$('continue-button').disabled=!!value;if(!value)$('loading-strip').querySelector('span').textContent='唤醒庭院…';},
    loadingProgress:function(value){const progress=Number(value);$('loading-strip').querySelector('span').textContent=Number.isFinite(progress)?'唤醒庭院 · '+Math.round(clamp(progress>1?progress/100:progress,0,1)*100)+'%':String(value||'唤醒庭院…');},
    showHelp:()=>openDialog('help'),hideHelp:closeAll,
    showJournal:function(s={}){
      text('journal-objective',s.objective||'穿过雨夜回廊，寻找最后的钟声。');text('journal-stage',s.stage||'钟鸣之章');
      const memories=Array.isArray(s.memories)?s.memories:[],entries=s.entries||[];
      text('journal-memory-count',memories.length+' / 3');text('journal-relic',relics.find(r=>r.id===s.relic)?.name||'尚未立誓 · 在余火小堂选择赐福');statsInto('journal',s.stats||{});
      const player=s.player||{},x=Number(player.x)||0,z=Number(player.z)||0,yaw=Number(player.yaw)||0;
      $('map-player').setAttribute('transform','translate('+x+' '+z+') rotate('+(-yaw*180/Math.PI)+')');
      const markers=$('map-discoveries');markers.replaceChildren();
      for(const at of s.discoveries||[]){if(!Number.isFinite(at.x)||!Number.isFinite(at.z))continue;const node=document.createElementNS('http://www.w3.org/2000/svg','circle');node.setAttribute('cx',at.x);node.setAttribute('cy',at.z);node.setAttribute('r','.48');node.setAttribute('class',memories.includes(at.id)?'map-memory found':'map-memory');markers.appendChild(node);}
      for(const id of ['arrival','chapel','warden']){
        const found=memories.includes(id),entry=entries.find(item=>item.id===id);
        const button=$('journal-entry-'+id);button.disabled=!found;button.classList.toggle('discovered',found);
        button.querySelector('.entry-name').textContent=found?(entry?.title||{arrival:'雨中的刻字',chapel:'未熄的余火',warden:'守望者的誓言'}[id]):'尚未寻得的残响';
        button.querySelector('.entry-state').textContent=found?'重读残响 →':'沿途探索';button.onclick=found&&entry?()=>api.showMemory(entry):null;
      }
      openDialog('journal');
    },
    showShrine:function(s={}){renderRelic(s.relic);openDialog('shrine');},
    showMemory:function(entry={}){memoryReturn=!!el.journal?.open;$('memory-done').querySelector('span').textContent=memoryReturn?'返回旅途手记':'记住这道残响';text('memory-title',entry.title||'遗落的残响');text('memory-subtitle',entry.subtitle||'AN ECHO OF THE VOW');text('memory-copy',entry.text||'');openDialog('memory');},
    menuInput:function(action){
      if(action==='back'){if(modal())closeAll();else if(started&&paused){api.setPaused(false);invoke('onResume');$('game').focus();}return;}
      const dialog=dialogKeys.find(key=>el[key]?.open),surface=dialog?el[dialog]:resultVisible?el.result:!started?el.title:paused?el.pause:null;
      if(!surface)return;
      const choices=Array.from(surface.querySelectorAll('button:not([disabled]),input:not([disabled])')).filter(node=>node.getClientRects().length&&(!global.getComputedStyle||global.getComputedStyle(node).visibility!=='hidden'));
      if(!choices.length)return;
      const focused=document.activeElement,index=choices.indexOf(focused);
      if(action==='next'||action==='previous'){const direction=action==='next'?1:-1,next=index<0?(direction>0?0:choices.length-1):(index+direction+choices.length)%choices.length;choices[next].focus();return;}
      if(index<0){choices[0].focus();return;}
      if(focused.tagName==='INPUT'&&focused.type==='range'&&(action==='left'||action==='right'||action==='accept')){
        const minimum=Number(focused.min)||0,maximum=Number(focused.max)||1,step=Number(focused.step)||.05,direction=action==='left'?-1:1;
        focused.value=clamp(Number(focused.value)+step*direction,minimum,maximum);focused.oninput?.();return;
      }
      if(action==='accept')focused.click();
    },
    isModalOpen:modal,isPaused:()=>paused,getSettings:()=>({...settings}),
    destroy:function(){timers.forEach(clearTimeout);}
  };
  syncSettings();let hasCheckpoint=false;try{hasCheckpoint=!!localStorage.getItem('ashen-vow-checkpoint');}catch(_){}api.setCheckpoint(hasCheckpoint);mode();return api;
}};
})(window);

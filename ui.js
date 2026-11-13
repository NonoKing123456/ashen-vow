(function(global){
'use strict';
global.AshenUI={create:function(config={}){
  const $=id=>document.getElementById(id), cache=Object.create(null), timers=new Map();
  let started=false,paused=false,dialogWasPaused=false,resultVisible=false;
  let soundEnabled=true,quality='high';
  try{soundEnabled=localStorage.getItem('ashen-vow-audio')!=='off';quality=localStorage.getItem('ashen-vow-quality')==='low'?'low':'high';}catch(e){}
  const el={title:$('title-screen'),hud:$('game-hud'),pause:$('pause-screen'),result:$('result-screen'),touch:$('touch-ui'),help:$('help-dialog'),settings:$('settings-dialog')};
  function text(id,value){const v=String(value==null?'':value);if(cache[id]!==v){cache[id]=v;$(id).textContent=v;}}
  function show(node,yes){if(typeof node==='string')node=$(node);if(node)node.classList.toggle('is-hidden',!yes);}
  function after(key,fn,ms){clearTimeout(timers.get(key));timers.set(key,setTimeout(fn,ms));}
  function scale(id,value){const x=Math.max(0,Math.min(1,Number(value)||0));if(cache[id]!==x){cache[id]=x;$(id).style.transform='scaleX('+x+')';}}
  function mode(){document.body.dataset.mode=resultVisible?'result':el.help.open||el.settings.open?'help':!started?'title':paused?'pause':'game';show(el.touch,started&&!paused&&!resultVisible&&!el.help.open&&!el.settings.open);}
  function invoke(name,value){if(typeof config[name]==='function')return config[name](value);}
  function syncSettings(){text('hud-audio',soundEnabled?'声音 开':'声音 关');$('audio-toggle').setAttribute('aria-pressed',String(soundEnabled));$('audio-toggle').querySelector('span').textContent=soundEnabled?'开启':'关闭';for(const q of ['high','low'])$('quality-'+q).setAttribute('aria-pressed',String(quality===q));}
  function toggleAudio(){soundEnabled=!soundEnabled;try{localStorage.setItem('ashen-vow-audio',soundEnabled?'on':'off');}catch(e){}syncSettings();invoke('onAudio',soundEnabled);}
  function openDialog(which){dialogWasPaused=paused;if(started)paused=true;el[which].showModal();mode();invoke('onHelp',true);}
  function closeDialog(which){el[which].close();paused=dialogWasPaused;mode();invoke('onHelp',false);if(started&&!paused)$('game').focus();}
  function begin(resume){clearTimeout(timers.get('result'));resultVisible=false;show(el.result,false);$('death-fade').classList.remove('active');invoke('onStart',{continue:resume});}
  function restart(){clearTimeout(timers.get('result'));resultVisible=false;show(el.result,false);$('death-fade').classList.remove('active');show(el.pause,false);paused=false;mode();invoke('onRestart');$('game').focus();}
  $('start-button').onclick=()=>begin(false);$('continue-button').onclick=()=>begin(true);$('retry-button').onclick=restart;$('pause-restart').onclick=restart;
  $('resume-button').onclick=()=>{api.setPaused(false);invoke('onResume');$('game').focus();};
  $('hud-pause').onclick=()=>{api.setPaused(!paused);invoke(paused?'onPause':'onResume');};
  for(const id of ['title-help','pause-help','hud-help'])$(id).onclick=()=>openDialog('help');
  for(const id of ['title-settings','pause-settings'])$(id).onclick=()=>openDialog('settings');
  for(const id of ['help-close','help-done'])$(id).onclick=()=>closeDialog('help');
  for(const id of ['settings-close','settings-done'])$(id).onclick=()=>closeDialog('settings');
  for(const key of ['help','settings'])el[key].addEventListener('cancel',e=>{e.preventDefault();closeDialog(key);});
  $('hud-audio').onclick=$('audio-toggle').onclick=toggleAudio;
  for(const q of ['high','low'])$('quality-'+q).onclick=()=>{quality=q;try{localStorage.setItem('ashen-vow-quality',q);}catch(e){}syncSettings();invoke('onQuality',q);};
  const api={
    elements:{...el,joy:$('joy'),knob:$('joy-knob'),canvas:$('game')},
    update:function(s={}){
      if(s.hp!=null){const max=s.maxHp||100;scale('hp-fill',s.hp/max);scale('hp-trail',s.hp/max);text('hp-text',Math.ceil(Math.max(0,s.hp))+' / '+max);document.body.dataset.hp=Math.ceil(s.hp);}
      if(s.stamina!=null){scale('stamina-fill',s.stamina/(s.maxStamina||100));document.body.dataset.stamina=Math.round(s.stamina);}
      if(s.flasks!=null)text('flask-count',s.flasks);
      if(s.objective!=null)text('objective-text',typeof s.objective==='object'?s.objective.text:s.objective);
      if(s.bossHp!=null){const visible=s.bossVisible!==false&&s.bossMax>0&&s.bossHp>0;show('boss-panel',visible);scale('boss-fill',s.bossHp/(s.bossMax||1));scale('boss-trail',s.bossHp/(s.bossMax||1));if(s.bossName!=null)text('boss-name',s.bossName);if(s.bossTitle!=null)text('boss-title',s.bossTitle);document.body.dataset.bossHp=Math.ceil(s.bossHp);}
      if(s.posture!=null)scale('posture-fill',s.posture>1?s.posture/(s.postureMax||100):s.posture);
      if(s.enemyHp!=null){scale('target-hp',s.enemyHp/(s.enemyMax||1));show('target-detail',!!s.enemyName&&s.enemyHp>0);if(s.enemyName)text('target-name',s.enemyName);}
      if(s.enemyPosture!=null)scale('target-posture',s.enemyPosture/100);
      if(s.locked===false)show('lock-marker',false);
      if(Object.prototype.hasOwnProperty.call(s,'context'))api.setContext(s.context);
      if(s.step!=null)api.updateStep(s.step);
    },
    notify:function(message,kind='info'){const node=$('toast');if(kind==='parry'){const caption=$('impact-caption');caption.textContent=String(message).split(' · ')[0];caption.classList.remove('show');void caption.offsetWidth;caption.classList.add('show');after('impact',()=>caption.classList.remove('show'),1100);}node.querySelector('span').textContent=String(message);node.dataset.kind=kind;node.classList.remove('show');void node.offsetWidth;node.classList.add('show');after('toast',()=>node.classList.remove('show'),kind==='checkpoint'?3800:2600);},
    chapter:function(title,sub=''){text('chapter-title',title);text('chapter-subtitle',sub);const node=$('chapter-card');node.classList.remove('show');void node.offsetWidth;node.classList.add('show');after('chapter',()=>node.classList.remove('show'),3700);},
    damage:function(amount=1){const node=$('hurt-overlay');node.style.setProperty('--hurt',Math.min(.85,.25+Math.abs(amount)/100));node.classList.remove('active');void node.offsetWidth;node.classList.add('active');after('hurt',()=>node.classList.remove('active'),650);},
    result:function(s={}){const victory=!!s.victory;resultVisible=true;paused=false;show(el.pause,false);show(el.touch,false);show('lock-marker',false);show('interaction',false);show('step-panel',false);$('result-screen').dataset.victory=String(victory);text('result-kicker',victory?'THE LAST BELL RINGS AGAIN':'THE VOW REMAINS');text('result-title',victory?'长夜将尽':'誓约未竟');text('result-copy',victory?'钟声再次响起。守望终于结束。':'余烬未熄，你还可以再次站起。');$('retry-button').querySelector('span').textContent=victory?'再次踏入余烬':'从余烬中重新站起';show('result-stats',victory);const seconds=Math.max(0,Math.floor(s.time||0));text('result-time',Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'));text('result-kills',s.kills||0);$('death-fade').classList.add('active');after('result',()=>{show(el.result,true);mode();},victory?1250:850);mode();},
    setPaused:function(value){paused=!!value;if(!started||resultVisible)paused=false;show(el.pause,paused);mode();},
    setStarted:function(value){started=!!value;paused=false;resultVisible=false;clearTimeout(timers.get('result'));show(el.title,!started);show(el.hud,started);show(el.pause,false);show(el.result,false);$('death-fade').classList.remove('active');mode();},
    setContext:function(value){const s=typeof value==='object'&&value!==null?value:{text:value};text('interaction-text',s.text||'');text('interaction-key',s.key||'F');show('interaction',!!s.text&&s.available!==false);},
    setLock:function(s={}){show('lock-marker',!!s.visible);if(s.visible){$('lock-marker').style.left=(s.x||0)+'px';$('lock-marker').style.top=(s.y||0)+'px';}},
    updateStep:function(value){text('step-text',value||'');show('step-panel',!!value);},
    showDamage:function(x,y,amount,type='normal'){if(typeof x==='object'){const s=x;x=s.x;y=s.y;amount=s.amount;type=s.type||'normal';}const n=document.createElement('span');n.className='damage-number '+String(type).replace(/[^a-z-]/gi,'');n.style.left=(Number(x)||0)+'px';n.style.top=(Number(y)||0)+'px';n.textContent=typeof amount==='number'?Math.round(amount):String(amount);$('damage-numbers').appendChild(n);setTimeout(()=>n.remove(),1050);},
    setCheckpoint:function(available){show('continue-button',!!available);$('start-button').classList.toggle('secondary',!!available);$('start-button').querySelector('span').textContent=available?'重新启程':'踏入余烬';},
    setLoading:function(value){show('loading-strip',!!value);$('start-button').disabled=$('continue-button').disabled=!!value;if(!value)$('loading-strip').querySelector('span').textContent='唤醒庭院…';},
    loadingProgress:function(value){const p=Number(value);$('loading-strip').querySelector('span').textContent=Number.isFinite(p)?'唤醒庭院 · '+Math.round(Math.max(0,Math.min(1,p>1?p/100:p))*100)+'%':String(value||'唤醒庭院…');},
    showHelp:function(){openDialog('help');},hideHelp:function(){if(el.help.open)closeDialog('help');},
    isModalOpen:function(){return el.help.open||el.settings.open;},isPaused:function(){return paused;},
    getSettings:function(){return{audio:soundEnabled,quality};},
    destroy:function(){timers.forEach(clearTimeout);}
  };
  syncSettings();let hasCheckpoint=false;try{hasCheckpoint=!!localStorage.getItem('ashen-vow-checkpoint');}catch(e){}api.setCheckpoint(hasCheckpoint);mode();return api;
}};
})(window);

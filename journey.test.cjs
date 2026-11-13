const test=require('node:test'),assert=require('node:assert/strict');
const J=require('./journey.js');
test('each physical memory grants its discovery reward once; unknown ids grant nothing',()=>{
 const j=J.create();assert.equal(j.read('arrival').fresh,true);assert.equal(j.read('arrival').fresh,false);assert.equal(j.read('unknown'),null);assert.deepEqual(j.snapshot().memories,['arrival']);
});
test('a shrine replaces its blessing instead of stacking bonuses',()=>{
 const j=J.create();j.equip('ember');assert.equal(j.modifiers().maxHp,145);j.equip('wind');assert.equal(j.modifiers().maxHp,120);assert.equal(j.modifiers().maxStamina,125);j.equip('edge');assert.equal(j.modifiers().maxStamina,100);assert.equal(j.modifiers().damage,1.15);assert.equal(j.equip('__proto__'),false);
});
test('checkpoint migration drops malformed ids and does not invent an active chapel',()=>{
 assert.equal(J.checkpoint(null),null);const s=J.checkpoint({active:'false',gate:false,defeated:['boss','sentinel-0'],journey:{relic:'constructor',memories:['arrival','arrival','oops'],time:Infinity,stats:{damageTaken:-5,parries:3}}});assert.equal(s.active,false);assert.deepEqual(s.defeated,['sentinel-0']);assert.equal(s.journey.relic,null);assert.deepEqual(s.journey.memories,['arrival']);assert.equal(s.journey.stats.damageTaken,0);assert.equal(s.journey.time,0);
});
test('journey state survives JSON round trips and snapshots cannot mutate live state',()=>{
 const j=J.create();j.equip('ember');j.read('chapel');j.record('parries');j.record('damageTaken',19);j.advance(1/60);const copy=j.snapshot();copy.memories.push('warden');copy.stats.parries=999;const restored=J.create(JSON.parse(JSON.stringify(j.snapshot())));assert.equal(restored.modifiers().maxHp,145);assert.deepEqual(restored.snapshot().memories,['chapel']);assert.equal(restored.snapshot().stats.parries,1);assert.equal(restored.snapshot().stats.damageTaken,19);
});

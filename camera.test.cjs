const test=require('node:test'),assert=require('node:assert/strict'),C=require('./feel.js');
test('camera stops before a wall and can slide parallel without false clipping',()=>{
 const wall={x:0,z:3,w:4,d:.5,h:4},origin={x:0,y:1.2,z:0};
 const clipped=C.cameraDistance(origin,{x:0,y:2.5,z:6},[wall]);assert.ok(clipped>2&&clipped<2.8);
 const clear=C.cameraDistance(origin,{x:5,y:2.5,z:0},[wall]);assert.ok(clear>5);
});
test('camera respects wall height and the nearest of several obstacles',()=>{
 const origin={x:0,y:2,z:0},goal={x:0,y:2,z:8};
 assert.ok(C.cameraDistance(origin,goal,[{x:0,z:3,w:4,d:.5,h:1}])>7.8);
 const near={x:0,z:2,w:2,d:.5,h:4},far={x:0,z:6,w:2,d:.5,h:4};
 assert.equal(C.cameraDistance(origin,goal,[far,near]),C.cameraDistance(origin,goal,[near]));
});
test('sentinel backhand keeps its own source clip and profile contact window',()=>{
 const cut=C.getSentinelMove(0,1),backhand=C.getSentinelMove(1,1);
 assert.equal(backhand.type,'backhand');assert.equal(backhand.animation.clip,'Sword_Regular_B');assert.ok(backhand.windup>cut.windup);assert.ok(backhand.total>backhand.activeEnd);
 assert.equal(C.samplePose(backhand,backhand.windup-.01).active,false);assert.equal(C.samplePose(backhand,(backhand.windup+backhand.activeEnd)/2).active,true);
});

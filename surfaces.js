/* Local CC0 surface maps, with authored world-scale UVs in level.js. */
(function(root){
'use strict';
async function load(T,renderer){
 const loader=new T.TextureLoader(),sets={},pending=[];
 for(const [name,id]of Object.entries({floor:'cobblestone_floor_08',wall:'stone_brick_wall_001'})){
  const set=sets[name]={};
  for(const kind of ['color','normal','roughness'])pending.push(new Promise((resolve,reject)=>{
   loader.load('assets/surfaces/'+id+'_'+kind+'.jpg',texture=>{
    texture.wrapS=texture.wrapT=T.RepeatWrapping;
    texture.encoding=kind==='color'?T.sRGBEncoding:T.LinearEncoding;
    texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    set[kind]=texture;resolve();
   },undefined,()=>reject(new Error('石材贴图未能载入，请刷新重试。')));
  }));
 }
 await Promise.all(pending);return sets;
}
root.AshenSurfaces={load};
})(window);

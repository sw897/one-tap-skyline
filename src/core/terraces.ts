import type {TowerModel} from './tower.ts';
export interface Terrace {x:number;z:number;y:number;width:number;depth:number;height:number}
/** Only supported side/back strips; the photo-facing +Z side is deliberately excluded. */
export function terracePlan(model:TowerModel):Terrace[]{
 const out:Terrace[]=[];
 for(let i=0;i<model.layers.length-1&&out.length<6;i++){
  const a=model.layers[i],b=model.layers[i+1],left=a.x-a.width/2,right=a.x+a.width/2,back=a.z-a.depth/2;
  const strips=[{x:(left+b.x-b.width/2)/2,z:a.z,width:b.x-b.width/2-left,depth:a.depth},
  {x:(right+b.x+b.width/2)/2,z:a.z,width:right-b.x-b.width/2,depth:a.depth},
  {x:b.x,z:(back+b.z-b.depth/2)/2,width:b.width,depth:b.z-b.depth/2-back}];
  for(const r of strips){const width=r.width-.08,depth=r.depth-.08;if(Math.min(width,depth)<.16||Math.max(width,depth)<.24||out.length>=6)continue;
   out.push({...r,width,depth,height:model.layerHeight*.24,y:(i+1)*model.layerHeight});}
 }
 return out;
}

export interface GroundPoint{x:number;z:number}
export interface Footprint extends GroundPoint{rotation:number}
const bounds=(p:GroundPoint[])=>({minX:Math.min(...p.map(q=>q.x)),maxX:Math.max(...p.map(q=>q.x)),minZ:Math.min(...p.map(q=>q.z)),maxZ:Math.max(...p.map(q=>q.z))});
export interface GroundTriangle {points:GroundPoint[];height:number;color:number}
export function pointPlotDistance(p:GroundPoint,f:Footprint,half=1.8){
  const dx=p.x-f.x,dz=p.z-f.z,c=Math.cos(f.rotation),s=Math.sin(f.rotation);
  return Math.hypot(Math.max(0,Math.abs(c*dx-s*dz)-half),Math.max(0,Math.abs(s*dx+c*dz)-half));
}
/** All scenery ground is painted once: intersections cannot compete for depth. */
export function groundPixels(triangles:GroundTriangle[],plots:Footprint[],extent:{minX:number;maxX:number;minZ:number;maxZ:number},size=1536){
  const data=new Uint8Array(size*size*4),reserved=new Uint8Array(size*size),sx=(extent.maxX-extent.minX)/(size-1),sz=(extent.maxZ-extent.minZ)/(size-1);
  for(let i=0;i<size*size;i++){data[i*4]=183;data[i*4+1]=209;data[i*4+2]=158;data[i*4+3]=255;}
  const pixel=(p:GroundPoint)=>({x:(p.x-extent.minX)/sx,z:(p.z-extent.minZ)/sz});
  for(const plot of plots){const center=pixel(plot),r=2.6;
    for(let z=Math.max(0,Math.floor(center.z-r/sz));z<=Math.min(size-1,Math.ceil(center.z+r/sz));z++)for(let x=Math.max(0,Math.floor(center.x-r/sx));x<=Math.min(size-1,Math.ceil(center.x+r/sx));x++){
      if(pointPlotDistance({x:extent.minX+x*sx,z:extent.minZ+z*sz},plot)<.06)reserved[z*size+x]=1;
    }
  }
  for(const triangle of [...triangles].sort((a,b)=>a.height-b.height)){
    const [a,b,c]=triangle.points.map(pixel);const determinant=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);if(Math.abs(determinant)<1e-9)continue;
    const minX=Math.max(0,Math.floor(Math.min(a.x,b.x,c.x))),maxX=Math.min(size-1,Math.ceil(Math.max(a.x,b.x,c.x))),minZ=Math.max(0,Math.floor(Math.min(a.z,b.z,c.z))),maxZ=Math.min(size-1,Math.ceil(Math.max(a.z,b.z,c.z)));
    const r=triangle.color>>16&255,g=triangle.color>>8&255,blue=triangle.color&255;
    for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++){
      const index=z*size+x;if(reserved[index])continue;
      const u=((x-a.x)*(c.z-a.z)-(z-a.z)*(c.x-a.x))/determinant,v=((b.x-a.x)*(z-a.z)-(b.z-a.z)*(x-a.x))/determinant;
      if(u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6){data[index*4]=r;data[index*4+1]=g;data[index*4+2]=blue;}
    }
  }
  return data;
}
/** Static road detours. Coordinates/geometry change; player identities and plot IDs do not. */
export function routeStreet(points:GroundPoint[],plots:Footprint[],width:number){
  if(!plots.length)return points;
  const clearLine=(a:GroundPoint,b:GroundPoint)=>{const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.7));for(let i=0;i<=steps;i++){const p={x:a.x+(b.x-a.x)*i/steps,z:a.z+(b.z-a.z)*i/steps};if(plots.some(f=>pointPlotDistance(p,f)<width/2+.25))return false;}return true;};
  if(points.slice(1).every((p,i)=>clearLine(points[i],p)))return points;
  const step=1.5,b=bounds([...points,...plots]),minX=b.minX-16,minZ=b.minZ-16,nx=Math.ceil((b.maxX-minX+16)/step),nz=Math.ceil((b.maxZ-minZ+16)/step);
  const id=(x:number,z:number)=>x*(nz+1)+z,point=(key:number)=>({x:minX+Math.floor(key/(nz+1))*step,z:minZ+key%(nz+1)*step}),validCache=new Map<number,boolean>();
  const valid=(key:number)=>{if(validCache.has(key))return validCache.get(key)!;const p=point(key),ok=plots.every(f=>pointPlotDistance(p,f)>=width/2+.25);validCache.set(key,ok);return ok;};
  const closest=(p:GroundPoint)=>{const x=Math.round((p.x-minX)/step),z=Math.round((p.z-minZ)/step);let best=-1,distance=Infinity;for(let dx=-6;dx<=6;dx++)for(let dz=-6;dz<=6;dz++){const ix=x+dx,iz=z+dz;if(ix<0||ix>nx||iz<0||iz>nz)continue;const key=id(ix,iz),q=point(key),d=Math.hypot(q.x-p.x,q.z-p.z);if(d<distance&&valid(key)){best=key;distance=d;}}return best;};
  const heap:Array<{key:number;f:number}>=[];
  const push=(v:{key:number;f:number})=>{heap.push(v);let i=heap.length-1;while(i>0){const parent=(i-1)>>1;if(heap[parent].f<=v.f)break;heap[i]=heap[parent];i=parent;}heap[i]=v;};
  const pop=()=>{const first=heap[0],last=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1].f<heap[child].f)child++;if(heap[child].f>=last.f)break;heap[i]=heap[child];i=child;}heap[i]=last;}return first;};
  const output:GroundPoint[]=[];
  for(let segment=1;segment<points.length;segment++){
    heap.length=0;const start=closest(points[segment-1]),end=closest(points[segment]);if(start<0||end<0)return points;
    const costs=new Map([[start,0]]),previous=new Map<number,number>(),closed=new Set<number>(),endPoint=point(end);push({key:start,f:0});
    let found=false;
    while(heap.length&&closed.size<25000){const {key}=pop();if(closed.has(key))continue;closed.add(key);if(key===end){found=true;break;}
      const x=Math.floor(key/(nz+1)),z=key%(nz+1);
      for(const [dx,dz] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]){
        const ix=x+dx,iz=z+dz;if(ix<0||ix>nx||iz<0||iz>nz)continue;const next=id(ix,iz);
        if(closed.has(next)||!valid(next)||dx&&dz&&(!valid(id(x+dx,z))||!valid(id(x,z+dz))))continue;
        const cost=costs.get(key)!+Math.hypot(dx,dz)*step;if(cost>=(costs.get(next)??Infinity))continue;costs.set(next,cost);previous.set(next,key);const q=point(next);push({key:next,f:cost+Math.hypot(q.x-endPoint.x,q.z-endPoint.z)});
      }
    }
    if(!found)return points;
    const route:number[]=[end];while(route.at(-1)!==start)route.push(previous.get(route.at(-1)!)!);route.reverse();
    const nodes=route.map(point),smooth:GroundPoint[]=[nodes[0]];let cursor=0;
    while(cursor<nodes.length-1){let next=nodes.length-1;while(next>cursor+1&&!clearLine(nodes[cursor],nodes[next]))next--;smooth.push(nodes[next]);cursor=next;}
    output.push(...smooth.slice(segment===1?0:1));
  }
  // Preserve bends, omit only collinear nodes so a detour is not straightened through plots.
  return output.filter((p,i)=>{if(i===0||i===output.length-1)return true;const a=output[i-1],b=output[i+1];return Math.abs((p.x-a.x)*(b.z-p.z)-(p.z-a.z)*(b.x-p.x))>1e-6;});
}

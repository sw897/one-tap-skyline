import type {CityBuilding} from '../core/city.ts';
/** Rooftop labels follow projection only; no avoidance, clusters or leader lines. */
export class CityLabels {
 private nodes=new Map<string,HTMLButtonElement>();private members:CityBuilding[]=[];
 constructor(private root:HTMLElement,private focus:(id:string)=>void){}
 set(buildings:CityBuilding[],selected?:string){
  this.members=buildings;const present=new Set(buildings.map(b=>b.playerId));
  for(const [id,node] of this.nodes)if(!present.has(id)){node.remove();this.nodes.delete(id);}
  for(const b of buildings){let node=this.nodes.get(b.playerId);if(!node){node=document.createElement('button');node.className='building-label rooftop-label';node.onclick=()=>this.focus(b.playerId);this.root.append(node);this.nodes.set(b.playerId,node);}
   node.textContent=b.name;node.title=b.name+' · '+b.tower.layers.length+' 层 · 地块 '+(b.plotId+1);node.classList.toggle('selected-label',b.playerId===selected);
  }
 }
 clear(){this.set([]);}
 update(_now:number,project:(b:CityBuilding)=>{x:number;y:number;visible:boolean},_selected?:string,_eventId?:string){
  for(const b of this.members){const p=project(b),node=this.nodes.get(b.playerId)!;node.hidden=!p.visible;if(p.visible)node.style.transform='translate('+p.x+'px,'+p.y+'px) translate(-50%,-100%)';}
 }
}

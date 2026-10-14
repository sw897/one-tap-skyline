import type {CityBuilding} from '../core/city.ts';
import {arrangeLabels,type LabelAnchor,type Rect} from '../core/label-layout.ts';
export class CityLabels {
  private nodes=new Map<string,HTMLButtonElement>();
  private lines=new Map<string,SVGLineElement>();
  private sizes=new Map<string,{width:number;height:number}>();
  private offsets=new Map<string,{dx:number;dy:number}>();
  private clusters=new Map<string,HTMLButtonElement>();
  private members:CityBuilding[]=[];private nextLayout=0;private sizeKey='';
  private svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  constructor(private root:HTMLElement,private focus:(id:string)=>void,private list:(ids:string[])=>void){this.svg.classList.add('label-lines');this.svg.setAttribute('aria-hidden','true');root.append(this.svg);}
  set(buildings:CityBuilding[],selected?:string){
    this.members=buildings;const present=new Set(buildings.map(b=>b.playerId));
    for(const [id,node] of this.nodes)if(!present.has(id)){node.remove();this.lines.get(id)?.remove();this.nodes.delete(id);this.lines.delete(id);this.sizes.delete(id);this.offsets.delete(id);}
    for(const b of buildings){let node=this.nodes.get(b.playerId);if(!node){node=document.createElement('button');node.className='building-label';node.onclick=()=>this.focus(b.playerId);this.root.append(node);this.nodes.set(b.playerId,node);const line=document.createElementNS(this.svg.namespaceURI,'line') as SVGLineElement;this.svg.append(line);this.lines.set(b.playerId,line);}
      const title=(b.rank&&b.rank<=3?'TOP'+b.rank+' · ':'')+b.name;if(node.textContent!==title){node.textContent=title;this.sizes.delete(b.playerId);}
      node.title=b.name+' · '+b.tower.layers.length+' 层 · 地块 '+(b.plotId+1);node.style.setProperty('--building-color',b.color);node.classList.toggle('selected-label',b.playerId===selected);node.dataset.rank=String(b.rank??'');
    }
    this.nextLayout=0;
  }
  clear(){this.set([]);for(const n of this.clusters.values())n.remove();this.clusters.clear();}
  update(now:number,project:(b:CityBuilding)=>{x:number;y:number;visible:boolean},selected?:string,eventId?:string){
    const points=new Map(this.members.map(b=>[b.playerId,project(b)]));
    if(now>=this.nextLayout){
      const bounds=this.root.getBoundingClientRect(),key=bounds.width+':'+bounds.height;
      if(key!==this.sizeKey){this.sizes.clear();this.sizeKey=key;}
      this.nextLayout=now+100;const anchors:LabelAnchor[]=[];
      for(const b of this.members){const p=points.get(b.playerId)!;if(!p.visible)continue;const node=this.nodes.get(b.playerId)!;
        let size=this.sizes.get(b.playerId);if(!size){node.hidden=false;const r=node.getBoundingClientRect();size={width:r.width||90,height:r.height||28};this.sizes.set(b.playerId,size);}
        anchors.push({id:b.playerId,x:p.x,y:p.y,...size,priority:b.playerId===selected?100:b.playerId===eventId?90:b.rank&&b.rank<=3?80:0});
      }
      const blocked:Rect[]=[];
      for(const selector of ['.city-title','.city-board','.map-controls','#city-event','#building-results']){const el=document.querySelector<HTMLElement>(selector);if(!el||el.hidden||!el.getClientRects().length)continue;const r=el.getBoundingClientRect();blocked.push({x:r.left-bounds.left,y:r.top-bounds.top,width:r.width,height:r.height});}
      const arranged=arrangeLabels(anchors,bounds.width,bounds.height,blocked,this.offsets);this.offsets=arranged.placed;const live=new Set<string>();
      for(const cluster of arranged.clusters){const ids=[...cluster.ids].sort(),id=ids.join('|');live.add(id);let node=this.clusters.get(id);if(!node){node=document.createElement('button');node.className='building-label label-cluster';node.onclick=()=>this.list(ids);this.root.append(node);this.clusters.set(id,node);}node.textContent=ids.length+' 栋楼';node.setAttribute('aria-label','展开 '+ids.length+' 栋楼的名称');node.style.transform='translate('+cluster.x+'px,'+cluster.y+'px) translate(-50%,-100%)';}
      for(const [id,node] of this.clusters)if(!live.has(id)){node.remove();this.clusters.delete(id);}
    }
    for(const [id,node] of this.nodes){const p=points.get(id),offset=this.offsets.get(id),line=this.lines.get(id)!;node.hidden=!p?.visible||!offset;line.style.display=node.hidden||!offset||Math.abs(offset.dx)+Math.abs(offset.dy)<10?'none':'';
      if(p&&offset&&!node.hidden){node.style.transform='translate('+(p.x+offset.dx)+'px,'+(p.y+offset.dy)+'px) translate(-50%,-100%)';line.setAttribute('x1',String(p.x));line.setAttribute('y1',String(p.y));line.setAttribute('x2',String(p.x+offset.dx));line.setAttribute('y2',String(p.y+offset.dy-5));}
    }
  }
}

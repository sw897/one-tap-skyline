import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import type {RuntimeConfig} from './config.ts';
import type {CityBuilding} from './core/city.ts';
import {districtsFor,plotLocation,type CityLayout} from './core/layout.ts';
import {towerHeight} from './core/tower.ts';
import {islandPlan,shoreLoop,shorePoint,type IslandPlan} from './core/island.ts';
import {CameraControl,intersectsBox,type Box} from './core/presentation.ts';
interface Goal{target:T.Vector3;position:T.Vector3;label:string;playerId?:string;arc?:boolean}
export class CityCamera {
  readonly camera=new T.PerspectiveCamera(44,1,1,2500);
  readonly controls:OrbitControls;
  private layout:CityLayout;private config:RuntimeConfig;private buildings:CityBuilding[]=[];
  private island:IslandPlan;private displaySurface:boolean;
  private control=new CameraControl();
  private goal?:Goal;private path:T.Vector3[]=[];private travel?:T.CubicBezierCurve3;private fromTarget=new T.Vector3();
  private travelSeconds=7;
  private transition=0;private dwell=0;private arcElapsed=0;private step=0;private ready=false;private enabled=false;
  private selected?:string;private label='城市全景';
  private arcOrigin?:T.Vector3;private arcTarget=new T.Vector3();private allowArc=false;
  private tourBuilding=0;private lastTourId?:string;
  private collisionBoxes:Array<Box&{id:string}>=[];
  private reduced=matchMedia('(prefers-reduced-motion: reduce)');
  constructor(canvas:HTMLCanvasElement,layout:CityLayout,config:RuntimeConfig,displaySurface=false){
    this.layout=layout;this.config=config;this.displaySurface=displaySurface;this.island=islandPlan(layout);
    this.controls=new OrbitControls(this.camera,canvas);this.controls.enableDamping=true;this.controls.dampingFactor=.075;
    this.controls.minDistance=5;this.controls.maxDistance=850;this.controls.minPolarAngle=.25;this.controls.maxPolarAngle=1.22;
    this.controls.screenSpacePanning=false;this.controls.enabled=false;
    this.controls.addEventListener('start',()=>{this.control.dragging=true;this.takeover();this.selected=undefined;});
    this.controls.addEventListener('end',()=>{this.control.dragging=false;this.control.manual(performance.now(),this.config.visual.tourIdleSeconds*1000);});
  }
  setConfig(config:RuntimeConfig){this.config=config;this.collisionBoxes=this.buildBoxes();}
  setLayout(layout:CityLayout){this.layout=layout;this.island=islandPlan(layout);this.collisionBoxes=this.buildBoxes();this.step=0;this.cancelMotion();this.control.clear();}
  // Refresh must not retarget a camera that the visitor is inspecting.
  setBuildings(buildings:CityBuilding[]){this.buildings=buildings;this.collisionBoxes=this.buildBoxes();if(this.selected&&!buildings.some(b=>b.playerId===this.selected)){this.selected=undefined;this.cancelMotion();this.control.clear();}}
  selectedId(){return this.selected;}
  setEnabled(enabled:boolean){this.enabled=enabled;this.controls.enabled=enabled;}
  resize(width:number,height:number){
    this.camera.aspect=width/Math.max(1,height);
    if(this.displaySurface)this.camera.setViewOffset(width,height,width*.14,0,width,height);
    this.camera.updateProjectionMatrix();if(!this.ready)this.move(this.fullGoal(),true);
  }
  private availableAspect(){return this.camera.aspect*(this.displaySurface?.7:1);}
  private fit(x:number,y:number,z:number,width:number,depth:number,height:number,label:string,rotation=0):Goal{
    const radius=Math.max(3,Math.hypot(width,depth,height)/2),half=T.MathUtils.degToRad(22);
    const distance=radius/Math.sin(Math.min(half,Math.atan(Math.tan(half)*this.availableAspect())))*1.13;
    const target=new T.Vector3(x,y,z),direction=new T.Vector3(.35,.8,1.4).normalize().applyAxisAngle(new T.Vector3(0,1,0),rotation);
    return {target,position:target.clone().addScaledVector(direction,distance),label};
  }
  private fullGoal():Goal{
    const h=Math.max(3,...this.buildings.map(b=>towerHeight(b.tower)+1.8)),target=new T.Vector3(this.island.x,h*.32,this.island.z);
    const direction=new T.Vector3(.8,.8,1).normalize(),right=new T.Vector3(direction.z,0,-direction.x).normalize(),up=new T.Vector3().crossVectors(direction,right).normalize();
    const points=shoreLoop(this.island,1.05).map(p=>new T.Vector3(p.x,0,p.z));
    for(const b of this.buildings){const p=plotLocation(b.plotId,this.layout);if(p)for(const dx of [-2,2])for(const dz of [-2,2])points.push(new T.Vector3(p.x+dx,towerHeight(b.tower)+1.8,p.z+dz));}
    const tangent=Math.tan(T.MathUtils.degToRad(22));let distance=5;
    for(const point of points){const delta=point.sub(target),near=delta.dot(direction);distance=Math.max(distance,Math.abs(delta.dot(right))/(tangent*this.availableAspect())+near,Math.abs(delta.dot(up))/tangent+near);}
    return {target,position:target.clone().addScaledVector(direction,distance*1.13),label:'海岛全景',arc:true};
  }
  private boxes(){return this.collisionBoxes;}
  private buildBoxes():Array<Box&{id:string}>{
    const boxes:Array<Box&{id:string}>=[];
    for(const b of this.buildings){const p=plotLocation(b.plotId,this.layout);if(!p)continue;const c=Math.cos(p.rotation),s=Math.sin(p.rotation),base={x:0,z:0,width:b.tower.baseWidth+.26,depth:b.tower.depth+.26},points=[base,...b.tower.layers].flatMap(l=>[-1,1].flatMap(x=>[-1,1].map(z=>({x:p.x+(l.x+x*l.width/2)*c+(l.z+z*l.depth/2)*s,z:p.z-(l.x+x*l.width/2)*s+(l.z+z*l.depth/2)*c}))));
      boxes.push({id:b.playerId,minX:Math.min(...points.map(p=>p.x))-.1,maxX:Math.max(...points.map(p=>p.x))+.1,minZ:Math.min(...points.map(p=>p.z))-.1,maxZ:Math.max(...points.map(p=>p.z))+.1,minY:0,maxY:towerHeight(b.tower)+1.8});
    }
    if(this.config.visual.publicBuildings)for(const [x,z] of [[-15,47],[-20,-42],[20,48]])boxes.push({id:'scenery',minX:x-4,maxX:x+4,minZ:z-3,maxZ:z+3,minY:0,maxY:2.1});
    return boxes;
  }
  private districtGoal(id:number):Goal{
    const d=districtsFor(this.layout).find(d=>d.id===id);if(!d)return this.fullGoal();
    const h=Math.max(3,...this.buildings.filter(b=>plotLocation(b.plotId,this.layout)?.districtId===id).map(b=>towerHeight(b.tower)+1.8));
    return this.fit(d.x,h*.4,d.z,36,23,h,d.name);
  }
  private buildingGoal(b:CityBuilding):Goal{
    const p=plotLocation(b.plotId,this.layout);if(!p)return this.fullGoal();
    const h=towerHeight(b.tower)+(b.rank&&b.rank<=3?1.8:.4);
    return {...this.fit(p.x,h*.46,p.z,4.8,4.8,h+1.5,b.name,p.rotation),playerId:b.playerId,arc:true};
  }
  private cancelMotion(){this.goal=undefined;this.arcOrigin=undefined;this.allowArc=false;}
  private move(requested:Goal,snap=false,manual=false){
    this.travelSeconds=manual?this.config.visual.focusTransitionSeconds:this.config.visual.tourTransitionSeconds;
    const boxes=this.boxes(),height=Math.max(6,...boxes.map(b=>b.maxY+6));
    let goal=requested;
    const blocked=boxes.some(b=>intersectsBox(goal.position,goal.position,b)||b.id!==goal.playerId&&intersectsBox(goal.position,goal.target,b,.3));
    if(blocked){goal=goal.playerId?this.districtGoal(plotLocation(this.buildings.find(b=>b.playerId===goal.playerId)!.plotId,this.layout)!.districtId):this.fullGoal();goal.position.y=Math.max(height,goal.position.y);goal.arc=false;}
    this.selected=goal.playerId;this.label=goal.label;this.dwell=0;this.allowArc=!!goal.arc;this.arcOrigin=undefined;
    this.fromTarget.copy(this.controls.target);
    const start=this.camera.position.clone(),up=start.clone(),over=goal.position.clone();
    up.y=over.y=Math.max(height,start.y,goal.position.y);
    this.path=[start,up,over,goal.position.clone()];
    if(this.path.slice(1).some((p,i)=>boxes.some(b=>intersectsBox(this.path[i],p,b)))){
      goal=this.fullGoal();goal.position.y=Math.max(height,goal.position.y);goal.arc=false;this.allowArc=false;this.selected=undefined;this.label='高位海岛全景';
      over.copy(goal.position);over.y=Math.max(height,start.y,goal.position.y);this.path=[start,up,over,goal.position.clone()];
    }
    this.travel=new T.CubicBezierCurve3(...this.path as [T.Vector3,T.Vector3,T.Vector3,T.Vector3]);
    if(this.travel.getPoints(40).slice(1).some((p,i,points)=>boxes.some(b=>intersectsBox(i?points[i-1]:this.path[0],p,b)))){
      const safe=this.fullGoal();safe.position.y=Math.max(height,safe.position.y);safe.arc=false;goal=safe;this.selected=undefined;this.label='海岛全景';this.allowArc=false;
      const highStart=start.clone(),highEnd=safe.position.clone();highStart.y=highEnd.y=Math.max(height,start.y,safe.position.y)+12;this.travel=new T.CubicBezierCurve3(start,highStart,highEnd,safe.position);
    }
    this.goal=goal;this.transition=0;
    if(snap||!this.ready||this.reduced.matches){this.controls.target.copy(goal.target);this.camera.position.copy(goal.position);this.controls.update();this.goal=undefined;this.ready=true;this.beginArc();}
  }
  private beginArc(){this.arcOrigin=this.camera.position.clone();this.arcTarget.copy(this.controls.target);this.arcElapsed=0;}
  takeover(){this.control.manual(performance.now(),this.config.visual.tourIdleSeconds*1000);this.cancelMotion();this.label='手动查看';}
  focus(b?:CityBuilding){this.takeover();this.move(b?this.buildingGoal(b):this.fullGoal(),false,true);}
  district(id:number){this.takeover();this.move(this.districtGoal(id),false,true);}
  zoom(amount:number){this.takeover();const offset=this.camera.position.clone().sub(this.controls.target).multiplyScalar(1+amount);offset.setLength(T.MathUtils.clamp(offset.length(),5,850));this.camera.position.copy(this.controls.target).add(offset);this.controls.update();}
  rotate(direction:number){this.takeover();const offset=this.camera.position.clone().sub(this.controls.target).applyAxisAngle(new T.Vector3(0,1,0),direction*Math.PI/12);this.camera.position.copy(this.controls.target).add(offset);this.controls.update();}
  toggle(){this.cancelMotion();if(!this.control.toggle()){this.step=0;this.move(this.fullGoal());}return this.control.paused;}
  notice(b:CityBuilding){const duration=(this.config.visual.tourTransitionSeconds+this.config.visual.noticeStaySeconds)*1000;if(!this.control.notice(performance.now(),duration))return 0;this.move(this.buildingGoal(b));return duration;}
  automatic(){return this.control.automatic(performance.now());}
  clearNotice(){const wasNotice=this.control.busy(performance.now());this.control.clear();if(wasNotice)this.cancelMotion();}
  status(){return {automatic:this.automatic(),paused:this.control.paused,label:this.label,selectedId:this.selected,notice:this.control.busy(performance.now())};}
  private nextTour(){
    const populated=districtsFor(this.layout).filter(d=>this.buildings.some(b=>plotLocation(b.plotId,this.layout)?.districtId===d.id));
    const coast=shorePoint(this.island,Math.PI*.67,.92);this.step++;
    if(this.step%3===0||!this.buildings.length){this.move(this.step%2?this.fit(0,1,0,26,20,3,'中央水园'):this.fullGoal());return;}
    if(this.step%3===1&&populated.length){this.move(this.districtGoal(populated[Math.floor(this.step/3)%populated.length].id));return;}
    const pool=this.buildings.filter(b=>b.playerId!==this.lastTourId);
    const chosen=pool.length?pool[this.tourBuilding++%pool.length]:undefined;
    if(chosen){this.lastTourId=chosen.playerId;this.move(this.buildingGoal(chosen));}
    else this.move(this.fit(coast.x,1,coast.z,38,24,4,'环岛步道'));
  }
  update(seconds:number,snap=false){
    if(!this.enabled)return;if(!this.ready)this.move(this.fullGoal(),true);
    if(snap&&this.automatic()&&!this.control.busy(performance.now()))this.move(this.fullGoal(),true);
    const dt=Math.min(seconds,.1);
    if(this.goal){
      this.transition+=dt;const t=Math.min(1,this.transition/this.travelSeconds),e=t*t*t*(t*(t*6-15)+10);
      this.controls.target.lerpVectors(this.fromTarget,this.goal.target,e);this.camera.position.copy(this.travel!.getPoint(e));
      if(t===1){this.goal=undefined;this.beginArc();}
    }else if(this.automatic()){
      this.dwell+=dt;
      if(this.arcOrigin&&this.allowArc&&!this.reduced.matches&&!this.control.busy(performance.now())){
        this.arcElapsed+=dt;const angle=T.MathUtils.degToRad(this.config.visual.tourArcDegrees)*Math.min(1,this.arcElapsed/this.config.visual.tourStaySeconds);
        const next=this.arcOrigin.clone().sub(this.arcTarget).applyAxisAngle(new T.Vector3(0,1,0),angle).add(this.arcTarget);
        if(this.boxes().some(b=>intersectsBox(this.camera.position,next,b)||b.id!==this.selected&&intersectsBox(next,this.arcTarget,b,.3)))this.allowArc=false;
        else this.camera.position.copy(next);
      }
      if(!this.control.busy(performance.now())&&this.dwell>this.config.visual.tourStaySeconds)this.nextTour();
    }
    const island=this.island,nx=(this.controls.target.x-island.x)/(island.radiusX*1.25),nz=(this.controls.target.z-island.z)/(island.radiusZ*1.25),length=Math.hypot(nx,nz);
    if(length>1){const before=this.controls.target.clone();this.controls.target.x=island.x+nx/length*island.radiusX*1.25;this.controls.target.z=island.z+nz/length*island.radiusZ*1.25;this.camera.position.add(this.controls.target.clone().sub(before));}
    this.controls.target.y=T.MathUtils.clamp(this.controls.target.y,0,100);this.controls.update();
  }
  dispose(){this.controls.dispose();}
}

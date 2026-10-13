import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import type {RuntimeConfig} from './config.ts';
import type {CityBuilding} from './core/city.ts';
import {districtsFor,layoutBounds,plotLocation,type CityLayout} from './core/layout.ts';
import {towerHeight} from './core/tower.ts';
interface Goal{target:T.Vector3;position:T.Vector3;label:string}
export class CityCamera {
  readonly camera=new T.PerspectiveCamera(44,1,.1,1000);
  readonly controls:OrbitControls;
  private layout:CityLayout;private config:RuntimeConfig;private buildings:CityBuilding[]=[];
  private goal?:Goal;private fromTarget=new T.Vector3();private fromPosition=new T.Vector3();private transition=0;
  private dwell=0;private step=0;private manualUntil=0;private paused=false;private dragging=false;private enabled=false;
  private selected?:string;private label='城市全景';private ready=false;
  constructor(canvas:HTMLCanvasElement,layout:CityLayout,config:RuntimeConfig){
    this.layout=layout;this.config=config;this.controls=new OrbitControls(this.camera,canvas);
    this.controls.enableDamping=true;this.controls.dampingFactor=.075;this.controls.minDistance=5;this.controls.maxDistance=360;
    this.controls.minPolarAngle=.25;this.controls.maxPolarAngle=1.22;this.controls.screenSpacePanning=false;this.controls.enabled=false;
    this.controls.addEventListener('start',()=>{this.dragging=true;this.takeover();this.selected=undefined;});
    this.controls.addEventListener('end',()=>{this.dragging=false;this.manualUntil=performance.now()+this.config.visual.tourIdleSeconds*1000;});
  }
  setConfig(config:RuntimeConfig){this.config=config;}
  setLayout(layout:CityLayout){this.layout=layout;this.ready=false;this.selected=undefined;this.step=0;}
  setBuildings(buildings:CityBuilding[]){
    const previous=this.buildings.find(b=>b.playerId===this.selected);this.buildings=buildings;
    const current=buildings.find(b=>b.playerId===this.selected);
    if(this.selected&&!current)this.selected=undefined;
    if(current&&previous?.tower!==current.tower&&!this.dragging)this.move(this.buildingGoal(current));
  }
  selectedId(){return this.selected;}
  setEnabled(enabled:boolean){this.enabled=enabled;this.controls.enabled=enabled;}
  resize(width:number,height:number){this.camera.aspect=width/Math.max(1,height);this.camera.updateProjectionMatrix();if(this.selected){const b=this.buildings.find(b=>b.playerId===this.selected);if(b)this.move(this.buildingGoal(b),true);}else if(!this.ready)this.move(this.fullGoal(),true);}
  private fit(x:number,y:number,z:number,width:number,depth:number,height:number,label:string):Goal{
    const radius=Math.max(3,Math.sqrt(width*width+depth*depth+height*height)/2),half=T.MathUtils.degToRad(22);
    const distance=radius/Math.sin(Math.min(half,Math.atan(Math.tan(half)*this.camera.aspect)))*1.13;
    const target=new T.Vector3(x,y,z),direction=new T.Vector3(.8,.8,1).normalize();
    return {target,position:target.clone().addScaledVector(direction,distance),label};
  }
  private fullGoal(){const b=layoutBounds(this.layout),h=Math.max(3,...this.buildings.map(b=>towerHeight(b.tower)+1));return this.fit(b.x,h*.38,(b.minZ+Math.max(b.maxZ,71))/2,b.width+9,Math.max(b.maxZ,71)-b.minZ+9,h,'城市全景');}
  private buildingGoal(b:CityBuilding){const p=plotLocation(b.plotId,this.layout)!;const h=towerHeight(b.tower)+.6;return this.fit(p.x,h*.46,p.z,4.8,4.8,h+1.5,b.name);}
  private move(goal:Goal,snap=false){this.goal=goal;this.fromTarget.copy(this.controls.target);this.fromPosition.copy(this.camera.position);this.transition=0;this.dwell=0;this.label=goal.label;
    if(snap||!this.ready){this.controls.target.copy(goal.target);this.camera.position.copy(goal.position);this.controls.update();this.goal=undefined;this.ready=true;}}
  takeover(){this.manualUntil=performance.now()+this.config.visual.tourIdleSeconds*1000;this.goal=undefined;this.label='手动查看';}
  focus(b?:CityBuilding){this.takeover();this.selected=b?.playerId;this.move(b?this.buildingGoal(b):this.fullGoal());}
  district(id:number){const d=districtsFor(this.layout).find(d=>d.id===id);if(!d){this.focus();return;}this.takeover();this.selected=undefined;const h=Math.max(3,...this.buildings.filter(b=>plotLocation(b.plotId,this.layout)?.districtId===id).map(b=>towerHeight(b.tower)));this.move(this.fit(d.x,h*.4,d.z,36,23,h,d.name));}
  zoom(amount:number){this.takeover();const offset=this.camera.position.clone().sub(this.controls.target).multiplyScalar(1+amount);offset.setLength(T.MathUtils.clamp(offset.length(),this.controls.minDistance,this.controls.maxDistance));this.camera.position.copy(this.controls.target).add(offset);this.controls.update();}
  rotate(direction:number){this.takeover();const offset=this.camera.position.clone().sub(this.controls.target).applyAxisAngle(new T.Vector3(0,1,0),direction*Math.PI/12);this.camera.position.copy(this.controls.target).add(offset);this.controls.update();}
  toggle(){this.paused=!this.paused;this.goal=undefined;if(!this.paused){this.manualUntil=0;this.selected=undefined;this.move(this.fullGoal());this.step=0;}return this.paused;}
  notice(b:CityBuilding){if(this.automatic()){this.selected=b.playerId;this.move(this.buildingGoal(b));}}
  automatic(){return !this.paused&&!this.dragging&&performance.now()>=this.manualUntil;}
  status(){return {automatic:this.automatic(),paused:this.paused,label:this.label,selectedId:this.selected};}
  update(seconds:number,snap=false){
    if(!this.enabled)return;
    if(!this.ready)this.move(this.fullGoal(),true);
    if(snap){if(this.selected){const b=this.buildings.find(b=>b.playerId===this.selected);if(b)this.move(this.buildingGoal(b),true);}else if(this.automatic())this.move(this.fullGoal(),true);}
    const dt=Math.min(seconds,.1);
    if(this.goal){
      this.transition+=dt;const t=Math.min(1,this.transition/this.config.visual.tourTransitionSeconds),e=t*t*(3-2*t);
      this.controls.target.lerpVectors(this.fromTarget,this.goal.target,e);this.camera.position.lerpVectors(this.fromPosition,this.goal.position,e);
      if(t===1)this.goal=undefined;
    }else if(this.automatic()){
      this.dwell+=dt;
      if(this.dwell>this.config.visual.tourStaySeconds){
        this.selected=undefined;
        const populated=districtsFor(this.layout).filter(d=>this.buildings.some(b=>plotLocation(b.plotId,this.layout)?.districtId===d.id));
        const goals=[this.fullGoal(),...populated.map(d=>{const h=Math.max(3,...this.buildings.filter(b=>plotLocation(b.plotId,this.layout)?.districtId===d.id).map(b=>towerHeight(b.tower)));return this.fit(d.x,h*.4,d.z,36,23,h,d.name);}),this.fit(0,1,0,26,20,3,'中央水园'),this.fit(-15,1,54,38,24,4,'滨水步道')];
        this.step=(this.step+1)%goals.length;this.move(goals[this.step]);
      }
    }
    const b=layoutBounds(this.layout);this.controls.target.x=T.MathUtils.clamp(this.controls.target.x,b.minX-8,b.maxX+8);this.controls.target.z=T.MathUtils.clamp(this.controls.target.z,b.minZ-8,76);this.controls.target.y=T.MathUtils.clamp(this.controls.target.y,0,100);
    this.controls.update();
  }
  dispose(){this.controls.dispose();}
}

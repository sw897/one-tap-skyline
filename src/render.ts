import * as T from 'three';
import type { RuntimeConfig } from './config.ts';
import type { GameSession } from './core/game.ts';
import { topLayer, towerHeight } from './core/tower.ts';
import type { Axis, Layer, TowerModel } from './core/tower.ts';
import type { CityBuilding, CityUpdate } from './core/city.ts';
import { photoKey } from './core/photo.ts';
import type { PhotoDecoration } from './core/photo.ts';
import {waterfrontLayout,plotLocation,type CityLayout} from './core/layout.ts';
import {createWaterfront,disposeLandscape,type SceneryLabel} from './city-scene.ts';
import {CityCamera} from './city-camera.ts';
import {fullWallFacade} from './core/facade.ts';

const unit = new T.BoxGeometry(1, 1, 1);
const blockMaterial = new T.MeshStandardMaterial({ roughness: 0.64, metalness: 0.02 });
const foundationMaterial = new T.MeshStandardMaterial({ color: '#f4f5e8', roughness: 0.85 });
const glassMaterial = new T.MeshStandardMaterial({ color: '#dbf3fa', roughness: 0.3, metalness: 0.07 });
const styleMaterials=[blockMaterial,new T.MeshStandardMaterial({roughness:.43,metalness:.13}),new T.MeshStandardMaterial({roughness:.3,metalness:.24})];
const trimMaterial=new T.MeshStandardMaterial({color:'#f4f7ef',roughness:.45});
const roofGreen=new T.MeshStandardMaterial({color:'#61ac86',roughness:.85});
const roofWood=new T.MeshStandardMaterial({color:'#c89869',roughness:.65});
const roofGlass=new T.MeshStandardMaterial({color:'#70bacb',roughness:.24,metalness:.23});
const roofSteel=new T.MeshStandardMaterial({color:'#d5e9f1',roughness:.25,metalness:.48});
const medalMaterials=['#e7bf63','#c0d5e3','#ca9277'].map(color=>new T.MeshStandardMaterial({color,roughness:.3,metalness:.55,emissive:color,emissiveIntensity:.15}));
const medalRing=new T.TorusGeometry(1,.08,8,32),medalPeak=new T.OctahedronGeometry(1,0);
const haloGeometry=new T.RingGeometry(1,1.06,48);
const stickerMaterial = new T.MeshStandardMaterial({ color: '#fffaf1', roughness: 0.6 });
const scratch = new T.Object3D();
const tint = new T.Color();
const warmTint = new T.Color('#fff4d8'), coolTint = new T.Color('#eef8ff');
export type View = 'intro' | 'play' | 'result' | 'city';

export const layerTint = (color: string, index: number, target = new T.Color()) =>
  target.set(color).lerp(index % 3 === 1 ? warmTint : coolTint, index % 4 * 0.075);

function instance(mesh: T.InstancedMesh, index: number, x: number, y: number, z: number, width: number, height: number, depth: number) {
  scratch.position.set(x, y, z); scratch.rotation.set(0, 0, 0); scratch.scale.set(width, height, depth);
  scratch.updateMatrix(); mesh.setMatrixAt(index, scratch.matrix);
}

function positionFloor(model: TowerModel, index: number, slabs: T.InstancedMesh, windows: T.InstancedMesh, slots: T.InstancedMesh, offset = 0,trim?:T.InstancedMesh,tier=0) {
  const layer = model.layers[index], y = (index + 0.5) * model.layerHeight + offset;
  instance(slabs, index, layer.x, y, layer.z, layer.width, model.layerHeight, layer.depth);
  for (let j = 0; j < 3; j++)for(let face=0;face<4;face++){
    const front=face<2,sign=face%2===0?1:-1;
    const windowWidth=tier===0?.18:tier===1?.25:.29,windowHeight=tier===0?.54:tier===1?.7:.82;
    instance(windows,index*12+j*4+face,layer.x+(front?(j-1)*layer.width*.29:sign*(layer.width/2+.009)),y,layer.z+(front?sign*(layer.depth/2+.009):(j-1)*layer.depth*.29),front?layer.width*windowWidth:.018,model.layerHeight*windowHeight,front?.018:layer.depth*windowWidth);
  }
  if(trim)for(let j=0;j<4;j++){const sx=j%2===0?1:-1,sz=j<2?1:-1;instance(trim,index*4+j,layer.x+sx*layer.width*.47,y,layer.z+sz*layer.depth*.47,Math.min(.025,layer.width*.04),model.layerHeight*.95,Math.min(.025,layer.depth*.04));}
  // Each placeholder panel follows its actual facade; no plane bridges a Z setback.
  if (index < slots.count) instance(slots, index, layer.x, y, layer.z + layer.depth / 2 + 0.025, layer.width * 0.3, model.layerHeight * 0.78, 0.025);
}

function styledRoof(model:TowerModel,tier:number){
  const root=new T.Group(),top=topLayer(model);
  root.position.set(top.x,towerHeight(model)+.012,top.z);
  if(!model.layers.length)return root;
  const part=(material:T.Material,x:number,y:number,z:number,w:number,h:number,d:number)=>{
    const mesh=new T.Mesh(unit,material);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);root.add(mesh);return mesh;
  };
  const w=top.width,d=top.depth,small=Math.min(w,d);
  if(tier===0){
    // Low-rise garden and open pergola, contained in the actual last floor.
    part(roofGreen,0,.025,0,w*.86,.04,d*.82);
    if(small>.5){for(const x of [-w*.29,w*.29])for(const z of [-d*.26,d*.26])part(roofWood,x,.10,z,.035,.18,.035);
      for(let i=0;i<4;i++)part(roofWood,0,.19,(i-1.5)*d*.17,w*.66,.025,d*.045);}
  }else if(tier===1){
    part(roofGlass,0,.09,0,w*.58,.16,d*.54);
    part(trimMaterial,0,.18,0,w*.69,.025,d*.64);
    part(roofSteel,-w*.3,.032,0,w*.1,.045,d*.74);
    part(roofSteel,w*.3,.032,0,w*.1,.045,d*.74);
  }else{
    part(roofSteel,0,.035,0,w*.86,.06,d*.84);
    part(roofGlass,0,.105,0,w*.62,.09,d*.54);
    for(let i=0;i<3;i++)part(roofSteel,(i-1)*w*.2,.19,0,w*.06,.17,d*.64);
  }
  root.userData.style=['garden','glass-pavilion','skyline-fins'][tier];return root;
}

/** The only tower generator: all three views use these exact layer records. */
export function buildTower(model: TowerModel, color: string,photo?:PhotoDecoration|null,thumbnail=false,thresholds={lowFloors:12,midFloors:24}): T.Group {
  const root = new T.Group();
  const foundation = new T.Mesh(unit, foundationMaterial);
  foundation.scale.set(model.baseWidth + 0.26, model.baseHeight, model.depth + 0.26);
  foundation.position.y = model.baseHeight / 2;
  root.add(foundation);
  const floors = new T.Group(); floors.position.y = model.baseHeight; root.add(floors);
  const tier=model.layers.length<=thresholds.lowFloors?0:model.layers.length<=thresholds.midFloors?1:2;
  const slabs = new T.InstancedMesh(unit, styleMaterials[tier], Math.max(1, model.layers.length));
  slabs.count = model.layers.length;
  const windows = new T.InstancedMesh(unit, glassMaterial, Math.max(1, model.layers.length * 12));
  windows.count = model.layers.length * 12;
  const trim=new T.InstancedMesh(unit,trimMaterial,Math.max(1,model.layers.length*4));trim.count=model.layers.length*4;trim.visible=tier>0;
  const slots = new T.InstancedMesh(unit, stickerMaterial, Math.max(1, Math.min(3, model.layers.length)));
  slots.count = Math.min(3, model.layers.length);
  model.layers.forEach((layer, index) => {
    positionFloor(model, index, slabs, windows, slots,0,trim,tier);
    layerTint(color, index, tint);
    slabs.setColorAt(index, tint);
    for(let j=0;j<12;j++)windows.setColorAt(index*12+j,new T.Color(tier===0?'#ffebbd':tier===1?index%3?'#76b8c7':'#b2d9e0':'#438fac'));
  });
  floors.add(slabs, windows, slots,trim);
  const photoHolder=new T.Group();floors.add(photoHolder);
  const roof=styledRoof(model,tier);root.add(roof);
  root.userData = { model, floors, slabs, windows, slots,trim,roof,photoHolder,photoKey:null, logicalHeight: towerHeight(model), color,tier };
  applyFacade(root,photo,thumbnail);
  return root;
}
export function decorateRank(root:T.Group,rank?:number){
  const medal=rank&&Number.isInteger(rank)&&rank>=1&&rank<=3?rank:0;if(root.userData.medal===medal)return;
  root.userData.crown?.removeFromParent();root.userData.crown=undefined;root.userData.medal=medal;root.userData.decorationHeight=0;
  if(!medal)return;
  const model=root.userData.model as TowerModel,top=topLayer(model),size=Math.min(top.width,top.depth);
  if(!model.layers.length)return;
  const crown=new T.Group(),material=medalMaterials[medal-1];
  const part=(x:number,y:number,z:number,w:number,h:number,d:number)=>{const mesh=new T.Mesh(unit,material);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);crown.add(mesh);};
  const ring=new T.Mesh(medalRing,material);ring.rotation.x=Math.PI/2;ring.scale.set(top.width*.38,top.depth*.38,size*.38);
  ring.position.y=medal===1?.65:.3;crown.add(ring);
  if(size<.3){part(0,.4,0,size*.28,.8,size*.28);}
  else if(medal===1){
    part(0,.5,0,size*.075,1,size*.075);
    const star=new T.Mesh(medalPeak,material);star.scale.set(size*.22,.34,size*.22);star.position.y=1.08;crown.add(star);
  }else if(medal===2){
    for(const x of [-top.width*.18,top.width*.18]){part(x,.37,0,size*.1,.74,size*.1);part(x,.78,0,size*.19,.07,size*.19);}
  }else{
    for(let i=0;i<3;i++)part((i-1)*top.width*.2,.18+i*.08,0,top.width*.13,.36+i*.16,top.depth*.3);
  }
  crown.position.set(top.x,towerHeight(model)+.25,top.z);root.add(crown);root.userData.crown=crown;
  root.userData.decorationHeight=size<.3?1.05:medal===1?1.67:medal===2?1.07:.94;
}

interface TextureEntry { texture:T.Texture; refs:number; loaded:boolean; listeners:Set<()=>void> }
const photoTextures=new Map<string,TextureEntry>();
function acquirePhoto(url:string,onReady:()=>void){
 let entry=photoTextures.get(url);
 if(!entry){
  const fresh:TextureEntry={texture:new T.Texture(),refs:0,loaded:false,listeners:new Set()};
  entry=fresh;photoTextures.set(url,fresh);
  fresh.texture=new T.TextureLoader().load(url,texture=>{
   texture.colorSpace=T.SRGBColorSpace;fresh.loaded=true;
   if(fresh.refs===0){texture.dispose();return;}
   for(const callback of fresh.listeners)callback();
  },undefined,()=>{fresh.loaded=false;});
  fresh.texture.colorSpace=T.SRGBColorSpace;
 }
 const saved=entry;saved.refs++;saved.listeners.add(onReady);
 if(saved.loaded)queueMicrotask(onReady);
 return {texture:saved.texture,release:()=>{saved.listeners.delete(onReady);saved.refs--;if(saved.refs===0){saved.texture.dispose();if(photoTextures.get(url)===saved)photoTextures.delete(url);}}};
}
function applyFacade(root:T.Group,photo?:PhotoDecoration|null,thumbnail=false){
 const key=photoKey(photo)+(photoKey(photo)?thumbnail?':thumb':':image':'');
 if(root.userData.photoKey===key)return;
 root.userData.photoRelease?.();root.userData.photoRelease=undefined;
 const holder=root.userData.photoHolder as T.Group;
 holder.traverse(object=>{if(object instanceof T.Mesh){object.geometry.dispose();(object.material as T.Material).dispose();}});
 holder.clear();root.userData.photo=photo;root.userData.photoKey=key;
 const model=root.userData.model as TowerModel,slots=root.userData.slots as T.InstancedMesh;
 slots.count=Math.min(3,model.layers.length);
 if(!key||!photo||!model.layers.length)return;
 const {positions,uvs}=fullWallFacade(model);
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();
 holder.visible=false;
 const acquired=acquirePhoto(thumbnail?photo.thumbnailUrl:photo.imageUrl,()=>{
  if(root.userData.photoKey===key&&photo.expiresAt>Date.now()){holder.visible=true;slots.count=0;}
 });
 const material=new T.MeshStandardMaterial({map:acquired.texture,roughness:.75,toneMapped:false,side:T.DoubleSide});
 holder.add(new T.Mesh(geometry,material));root.userData.photoRelease=acquired.release;
}

function releaseGroup(group: T.Group) {
  applyFacade(group,undefined);
  if(group.userData.halo){group.userData.halo.material.dispose();group.userData.halo.removeFromParent();}
  group.traverse(object => { if (object instanceof T.InstancedMesh) object.dispose(); });
  group.removeFromParent();
}
interface Growth { group: T.Group; from: number; elapsed: number }
interface Fragment { mesh: T.Mesh; age: number; direction: number; axis: Axis; origin: T.Vector3 }

export class SkylineRenderer {
  readonly renderer: T.WebGLRenderer;
  private scene = new T.Scene();
  private camera = new T.OrthographicCamera(-8, 8, 8, -8, 0.1, 150);
  private solo = new T.Group();
  private city = new T.Group();
  private soloTower?: T.Group;
  private soloModel?: TowerModel;
  private moving = new T.Mesh(unit, new T.MeshStandardMaterial({ color: '#76a8ff', roughness: 0.58 }));
  private guide = new T.LineSegments(new T.EdgesGeometry(unit), new T.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.65 }));
  private fragmentMesh = new T.Mesh(unit, new T.MeshStandardMaterial({ roughness: 0.64, metalness: 0.02 }));
  private cutGlow = new T.Mesh(unit, new T.MeshBasicMaterial({ color: '#fff5ce', transparent: true, opacity: 0 }));
  private cutAge = 100;
  private cutOriginY = 0;
  private cityObjects = new Map<string, T.Group>();
  private growth=new Map<string,Growth>();
  private layout:CityLayout;
  private landscape?:T.Group;
  private cityCamera:CityCamera;
  private fragment?: Fragment;
  private landingAge = 100;
  private view: View = 'intro';
  private focus?: CityBuilding;
  private target = new T.Vector3();
  private aim = new T.Vector3();
  private currentSpan = 7;
  private cameraReady = false;
  private zoom = 1;
  private angle = Math.PI / 4.6;
  private config: RuntimeConfig;
  private width = 1;
  private height = 1;
  private container: HTMLElement;
  private observer: ResizeObserver;
  private maxCityHeight = 0;
  private soloColor='#75aaff';
  private nextPhotoCheck=0;

  constructor(container: HTMLElement, config: RuntimeConfig, layout=waterfrontLayout(config.city.openDistricts,config.city.capacities),citySurface=true,displaySurface=false) {
    this.layout=layout;
    this.container = container;
    this.config = config;
    this.renderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, config.visual.maxPixelRatio));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.domElement.setAttribute('aria-label', '三维楼体画面');
    this.renderer.domElement.style.opacity = '0';
    container.prepend(this.renderer.domElement);
    this.cityCamera=new CityCamera(this.renderer.domElement,layout,config,displaySurface);
    this.scene.add(new T.HemisphereLight('#f8fcff', '#bdd1bd', 1.9));
    const sun = new T.DirectionalLight('#fff7e4', 2.6); sun.position.set(-5, 14, 9); this.scene.add(sun);
    this.scene.add(this.solo, this.city);
    this.city.visible = false;
    this.fragmentMesh.visible = false; this.cutGlow.visible = false;
    this.solo.add(this.moving, this.guide, this.fragmentMesh, this.cutGlow);
    const island = new T.Mesh(new T.CylinderGeometry(6.4, 6.55, 0.28, 60), new T.MeshStandardMaterial({ color: '#d3e8d9', roughness: 1 }));
    island.position.y = -0.18; this.solo.add(island);
    const ring = new T.Mesh(new T.TorusGeometry(6.46, 0.055, 8, 70), new T.MeshBasicMaterial({ color: '#f4fbff' }));
    ring.rotation.x = Math.PI / 2; ring.position.y = -0.02; this.solo.add(ring);
    if(citySurface)this.createCityGround();
    this.observer=new ResizeObserver(() => this.resize());this.observer.observe(container);
    this.resize(false);
  }
  setConfig(config: RuntimeConfig) { this.config = config;this.cityCamera.setConfig(config); }
  private resize(redraw = true) {
    const width = Math.max(1, this.container.clientWidth), height = Math.max(1, this.container.clientHeight);
    if (width === this.width && height === this.height) return;
    this.width = width; this.height = height;
    this.renderer.setSize(this.width, this.height, false);
    this.cityCamera.resize(this.width,this.height);
    if (redraw && this.cameraReady) { this.updateCamera(0, true); this.draw(); }
  }
  private createCityGround() {
    if(this.landscape)disposeLandscape(this.landscape);
    this.landscape=createWaterfront(this.layout,this.config.visual.publicBuildings);this.city.add(this.landscape);
  }
  setSolo(model: TowerModel, color = this.soloColor,photo?:PhotoDecoration|null,rank?:number) {
    if (model === this.soloModel && color===this.soloColor){if(this.soloTower){applyFacade(this.soloTower,photo);decorateRank(this.soloTower,rank);}return;}
    this.soloColor=color;
    if (this.soloTower) releaseGroup(this.soloTower);
    this.soloModel = model;
    this.soloTower = buildTower(model, color,photo,false,this.config.visual);decorateRank(this.soloTower,rank);
    this.soloTower.userData.roof.visible=this.view!=='play';this.solo.add(this.soloTower);
  }
  setView(view: View) {
    const pullback = this.view === 'play' && view === 'result';
    if (view === 'play' && this.view !== 'play') { this.fragmentMesh.visible = false; this.fragment = undefined; this.cutGlow.visible = false; this.cutAge = 100; }
    this.view = view; this.solo.visible = view !== 'city'; this.city.visible = view === 'city';
    this.renderer.toneMappingExposure=view==='city'?.85:1.1;
    if(this.soloTower)this.soloTower.userData.roof.visible=view!=='play';
    this.scene.background=view==='city'?new T.Color('#b8e1e7'):null;this.scene.fog=view==='city'?new T.Fog('#b8e1e7',700,2100):null;
    this.cityCamera.setEnabled(view==='city');
    this.moving.visible = false; this.guide.visible = false;
    if (view !== 'city') this.focus = undefined;
    this.resize(false);
    this.updateCamera(0, !pullback);
    this.draw();
  }
  setCity(buildings: CityBuilding[], update?: CityUpdate,layout?:CityLayout) {
    if(layout&&JSON.stringify(layout)!==JSON.stringify(this.layout)){this.layout=layout;this.cityCamera.setLayout(layout);this.createCityGround();}
    this.cityCamera.setBuildings(buildings);
    this.maxCityHeight=Math.max(0,...buildings.map(b=>towerHeight(b.tower)));
    const present=new Set(buildings.map(b=>b.playerId));
    for(const [id,group] of this.cityObjects)if(!present.has(id)){releaseGroup(group);this.cityObjects.delete(id);this.growth.delete(id);}
    for (const building of buildings) {
      const previous = this.cityObjects.get(building.playerId);
      const thumbnail=this.cityCamera.selectedId()!==building.playerId;
      const rank='rank' in building?Number(building.rank):undefined;
      if (previous?.userData.model === building.tower){const p=plotLocation(building.plotId,this.layout);if(p){previous.position.set(p.x,.055,p.z);previous.rotation.y=p.rotation;}applyFacade(previous,building.photo,thumbnail);decorateRank(previous,rank);continue;}
      const oldFloors=previous?(previous.userData.model as TowerModel).layers.length:0;
      if (previous) releaseGroup(previous);
      this.growth.delete(building.playerId);
      const p=plotLocation(building.plotId,this.layout);if(!p)continue;
      const group = buildTower(building.tower, building.color,building.photo,thumbnail,this.config.visual);
      decorateRank(group,rank);group.rotation.y=p.rotation;
      group.position.set(p.x, 0.055, p.z);
      group.userData.playerId = building.playerId;
      this.city.add(group); this.cityObjects.set(building.playerId, group);
      if (oldFloors>0&&building.tower.layers.length>oldFloors||update?.building?.playerId === building.playerId && ['first', 'best'].includes(update.kind)) {
        const from = (update?.building?.playerId===building.playerId?update.previous?.tower.layers.length:oldFloors)??0;
        const ratio=Math.max(.05,from/building.tower.layers.length);
        group.userData.floors.scale.y = ratio;
        group.userData.roof.position.y=building.tower.baseHeight+building.tower.layers.length*building.tower.layerHeight*ratio+.012;
        this.growth.set(building.playerId,{ group, from:ratio, elapsed: 0 });
      }
    }
  }
  landed(model: TowerModel, cut?: Layer, axis: Axis = 'x') {
    this.setSolo(model); this.landingAge = 0;
    if (cut && cut.width > 1e-8 && cut.depth > 1e-8) {
      const top = topLayer(model), mesh = this.fragmentMesh, direction = cut[axis] >= top[axis] ? 1 : -1;
      mesh.visible = true; mesh.rotation.set(0, 0, 0);
      mesh.material.color.copy(layerTint(this.soloTower?.userData.color ?? '#75aaff', model.layers.length - 1));
      mesh.scale.set(cut.width, model.layerHeight, cut.depth);
      mesh.position.set(cut.x, towerHeight(model) - model.layerHeight / 2 + 1.1, cut.z);
      this.fragment = { mesh, age: 0, axis, direction, origin: mesh.position.clone() };
      this.cutAge = 0; this.cutOriginY = towerHeight(model) - model.layerHeight / 2;
      this.cutGlow.scale.set(axis === 'x' ? 0.018 : top.width, model.layerHeight * 0.98, axis === 'z' ? 0.018 : top.depth);
      this.cutGlow.position.set(top.x, this.cutOriginY + 1.1, top.z);
      this.cutGlow.position[axis] = top[axis] + direction * (axis === 'x' ? top.width : top.depth) / 2;
      this.cutGlow.material.opacity = 0.85; this.cutGlow.visible = true;
    }
  }
  focusBuilding(building?: CityBuilding) {this.cityCamera.focus(building);}
  focusDistrict(id:number){this.cityCamera.district(id);}
  toggleTour(){return this.cityCamera.toggle();}
  tourStatus(){return this.cityCamera.status();}
  recordNotice(building:CityBuilding){this.cityCamera.notice(building);}
  animateCityBuilding(id:string,previousFloors:number){
    const group=this.cityObjects.get(id);if(!group||this.growth.has(id))return;
    const model=group.userData.model as TowerModel,from=Math.max(.05,previousFloors/Math.max(1,model.layers.length));
    group.userData.floors.scale.y=from;if(group.userData.crown)group.userData.crown.position.y=model.baseHeight+model.layers.length*model.layerHeight*from+.02;this.growth.set(id,{group,from,elapsed:0});
  }
  highlightBuilding(id:string){const group=this.cityObjects.get(id);if(!group)return;
    if(!group.userData.halo){const halo=new T.Mesh(haloGeometry,new T.MeshBasicMaterial({color:'#ffc969',transparent:true,opacity:.8,side:T.DoubleSide,depthWrite:false}));halo.rotation.x=-Math.PI/2;halo.position.y=.04;halo.scale.setScalar(2.05);group.add(halo);group.userData.halo=halo;}
    group.userData.highlightUntil=performance.now()+4300;
  }
  zoomCity(amount: number) {this.cityCamera.zoom(amount);}
  rotateCity(direction: number) {this.cityCamera.rotate(direction);}
  sceneryLabels():SceneryLabel[]{return this.landscape?.userData.labels??[];}
  projectSceneryLabel(label:SceneryLabel){
    const p=new T.Vector3(label.x,label.height+.45,label.z).project(this.cityCamera.camera);
    return {x:(p.x+1)*this.width/2,y:(1-p.y)*this.height/2,visible:p.z<1&&p.z>-1&&Math.abs(p.x)<.94&&Math.abs(p.y)<.92};
  }
  projectLabel(building: CityBuilding) {
    const group = this.cityObjects.get(building.playerId);if(!group)return {x:0,y:0,visible:false};
    const height = building.tower.baseHeight + building.tower.layers.length * building.tower.layerHeight * (group?.userData.floors.scale.y ?? 1);
    const top = topLayer(building.tower);
    const v = group.localToWorld(new T.Vector3(top.x,height+(group.userData.decorationHeight||.29)+.45,top.z)).project(this.cityCamera.camera);
    return { x: (v.x + 1) * this.width / 2, y: (1 - v.y) * this.height / 2, visible: v.z<1&&v.z>-1&&Math.abs(v.x) < .94 && Math.abs(v.y) < .92 };
  }
  cityGeometry(playerId: string) {
    const group = this.cityObjects.get(playerId);
    if (!group) return null;
    const model = group.userData.model as TowerModel;
    return { model, logicalHeight: towerHeight(model), displayedHeight: model.baseHeight + model.layers.length * model.layerHeight * group.userData.floors.scale.y, plotPosition: group.position.toArray(), color: group.userData.color };
  }
  soloGeometry(){
    if(!this.soloTower)return null;
    const model=this.soloTower.userData.model as TowerModel;
    return {model,logicalHeight:towerHeight(model),displayedHeight:model.baseHeight+model.layers.length*model.layerHeight*this.soloTower.userData.floors.scale.y,color:this.soloColor};
  }
  update(seconds: number, game?: GameSession) {
    if(Date.now()>=this.nextPhotoCheck){this.nextPhotoCheck=Date.now()+500;for(const root of [...this.cityObjects.values(),...(this.soloTower?[this.soloTower]:[])])if(root.userData.photo&&root.userData.photo.expiresAt<=Date.now())applyFacade(root,undefined);}
    for(const group of this.cityObjects.values())if(group.userData.halo){const left=group.userData.highlightUntil-performance.now();if(left<=0){group.userData.halo.material.dispose();group.userData.halo.removeFromParent();group.userData.halo=undefined;}else group.userData.halo.material.opacity=.35+.35*Math.sin(left*.004)**2;}
    if (this.view === 'play' && game) {
      this.setSolo(game.tower);
      const top = topLayer(game.tower);
      this.moving.visible = game.hasMovingBlock;
      this.moving.scale.set(top.width, game.tower.layerHeight, top.depth);
      this.moving.material.color.copy(layerTint(this.soloTower?.userData.color ?? '#75aaff', game.tower.layers.length));
      const moving = game.movingLayer;
      this.moving.position.set(moving.x, towerHeight(game.tower) + game.tower.layerHeight / 2 + 1.1, moving.z);
      this.guide.visible = this.moving.visible;
      this.guide.scale.set(top.width, game.tower.layerHeight, top.depth);
      this.guide.position.set(top.x, towerHeight(game.tower) + game.tower.layerHeight / 2, top.z);
      if (game.phase !== 'paused') this.landingAge += seconds;
      if (this.soloTower && game.isLanding) this.animateLanding(game.tower, Math.max(0, 1 - this.landingAge / game.config.dropSeconds) ** 2 * 1.1);
      else if (this.soloTower) this.animateLanding(game.tower, 0);
    }
    const effectSeconds = this.view === 'play' && game?.phase === 'paused' ? 0 : seconds;
    if (this.fragment) {
      this.fragment.age += effectSeconds;
      const f = this.fragment;
      f.mesh.position.copy(f.origin); f.mesh.position[f.axis] += f.direction * f.age * 1.2;
      f.mesh.position.y -= 6 * f.age ** 2;
      f.mesh.rotation[f.axis === 'x' ? 'z' : 'x'] = (f.axis === 'x' ? -1 : 1) * f.direction * f.age;
      if (f.age > 1.25) { f.mesh.visible = false; this.fragment = undefined; }
    }
    if (this.cutGlow.visible) {
      this.cutAge += effectSeconds;
      this.cutGlow.position.y = this.cutOriginY + Math.max(0, 1 - this.cutAge / this.config.game.dropSeconds) ** 2 * 1.1;
      this.cutGlow.material.opacity = Math.max(0, 0.85 * (1 - this.cutAge / 0.4));
      if (this.cutAge >= 0.4) this.cutGlow.visible = false;
    }
    for(const [id,growth] of this.growth){
      growth.elapsed+=Math.min(seconds,.1);
      const t=Math.min(1,growth.elapsed/this.config.visual.growthSeconds),eased=1-(1-t)**3;
      growth.group.userData.floors.scale.y=T.MathUtils.lerp(growth.from,1,eased);
      const m=growth.group.userData.model as TowerModel,h=m.baseHeight+m.layers.length*m.layerHeight*growth.group.userData.floors.scale.y;
      growth.group.userData.roof.position.y=h+.012;
      if(growth.group.userData.crown)growth.group.userData.crown.position.y=h+.25;
      if(t===1)this.growth.delete(id);
    }
    this.updateCamera(seconds);
    this.draw();
  }
  private updateCamera(seconds: number, snap = false) {
    if(this.view==='city'){this.cityCamera.update(seconds,snap);this.cameraReady=true;
      const selected=this.cityCamera.selectedId();for(const [id,group] of this.cityObjects){applyFacade(group,group.userData.photo,id!==selected);const distance=this.cityCamera.camera.position.distanceTo(group.position);group.userData.windows.visible=distance<220||id===selected;group.userData.trim.visible=group.userData.tier>0&&(distance<140||id===selected);}
      return;
    }
    const model = this.soloModel;
    const height = model ? towerHeight(model)+(this.view==='play'?0:Math.max(.29,this.soloTower?.userData.decorationHeight||0)) : 3, aspect = this.width / this.height;
    let span: number;
    {
      this.aim.set(model ? topLayer(model).x * 0.3 : 0, this.view === 'play' ? Math.max(2.3, height - 1.6) : height * 0.46, model ? topLayer(model).z * 0.3 : 0);
      span = this.view === 'play' ? Math.max(4.6, 4.6 / aspect) : Math.max(2.9, height * 0.49 + 0.85, 3.1 / aspect);
    }
    const damping = snap || !this.cameraReady ? 1 : 1 - Math.exp(-Math.max(0, seconds) * 4 / this.config.visual.cameraSeconds);
    if(snap||!this.cameraReady){this.target.copy(this.aim);this.currentSpan=span;}
    else{this.target.lerp(this.aim,damping);this.currentSpan=T.MathUtils.lerp(this.currentSpan,span,damping);}
    this.camera.position.copy(this.target).add(new T.Vector3(Math.sin(this.angle) * 25, 23, Math.cos(this.angle) * 25));
    this.camera.lookAt(this.target);
    this.camera.left = -this.currentSpan * aspect; this.camera.right = this.currentSpan * aspect;
    this.camera.top = this.currentSpan; this.camera.bottom = -this.currentSpan; this.camera.updateProjectionMatrix();
    this.cameraReady = true;
  }
  private draw() {
    this.renderer.render(this.scene, this.view==='city'?this.cityCamera.camera:this.camera);
    this.renderer.domElement.style.opacity = '1';
  }
  presentation() {
    return { view: this.view, width: this.width, height: this.height, cameraReady: this.cameraReady, span: this.currentSpan, target: this.target.toArray(), aim: this.aim.toArray() };
  }
  dispose() {
    this.observer.disconnect();
    this.cityCamera.dispose();if(this.landscape)disposeLandscape(this.landscape);this.growth.clear();
    if(this.soloTower)releaseGroup(this.soloTower);for(const group of this.cityObjects.values())releaseGroup(group);
    this.scene.traverse(object=>{if(object instanceof T.InstancedMesh)object.dispose();});
    this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();
    this.cityObjects.clear();this.scene.clear();
  }
  cuttingPresentation() {
    return { moving: { visible: this.moving.visible, position: this.moving.position.toArray(), scale: this.moving.scale.toArray(), color: this.moving.material.color.getHexString() }, fragment: this.fragment ? { axis: this.fragment.axis, age: this.fragment.age, position: this.fragment.mesh.position.toArray(), scale: this.fragment.mesh.scale.toArray(), color: this.fragmentMesh.material.color.getHexString() } : null, cutGlow: { visible: this.cutGlow.visible, position: this.cutGlow.position.toArray(), scale: this.cutGlow.scale.toArray(), opacity: this.cutGlow.material.opacity } };
  }
  private animateLanding(model: TowerModel, offset: number) {
    if (!this.soloTower || model.layers.length === 0) return;
    const index = model.layers.length - 1;
    const slabs = this.soloTower.userData.slabs as T.InstancedMesh, windows = this.soloTower.userData.windows as T.InstancedMesh, slots = this.soloTower.userData.slots as T.InstancedMesh;
    const trim=this.soloTower.userData.trim as T.InstancedMesh;
    positionFloor(model, index, slabs, windows, slots, offset,trim,this.soloTower.userData.tier);
    for (const mesh of [slabs, windows, slots,trim]) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }
  }
}

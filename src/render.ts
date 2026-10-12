import * as T from 'three';
import type { RuntimeConfig } from './config.ts';
import type { GameSession } from './core/game.ts';
import { topLayer, towerHeight } from './core/tower.ts';
import type { Axis, Layer, TowerModel } from './core/tower.ts';
import type { CityBuilding, CityUpdate } from './core/city.ts';

const unit = new T.BoxGeometry(1, 1, 1);
const blockMaterial = new T.MeshStandardMaterial({ roughness: 0.64, metalness: 0.02 });
const foundationMaterial = new T.MeshStandardMaterial({ color: '#f4f5e8', roughness: 0.85 });
const glassMaterial = new T.MeshStandardMaterial({ color: '#dbf3fa', roughness: 0.3, metalness: 0.07 });
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

function positionFloor(model: TowerModel, index: number, slabs: T.InstancedMesh, windows: T.InstancedMesh, slots: T.InstancedMesh, offset = 0) {
  const layer = model.layers[index], y = (index + 0.5) * model.layerHeight + offset;
  instance(slabs, index, layer.x, y, layer.z, layer.width, model.layerHeight, layer.depth);
  for (let j = 0; j < 3; j++) instance(windows, index * 3 + j, layer.x + (j - 1) * layer.width * 0.26, y, layer.z + layer.depth / 2 + 0.009, layer.width * 0.15, model.layerHeight * 0.38, 0.018);
  // Each placeholder panel follows its actual facade; no plane bridges a Z setback.
  if (index < slots.count) instance(slots, index, layer.x, y, layer.z + layer.depth / 2 + 0.025, layer.width * 0.3, model.layerHeight * 0.78, 0.025);
}

/** The only tower generator: all three views use these exact layer records. */
export function buildTower(model: TowerModel, color: string): T.Group {
  const root = new T.Group();
  const foundation = new T.Mesh(unit, foundationMaterial);
  foundation.scale.set(model.baseWidth + 0.26, model.baseHeight, model.depth + 0.26);
  foundation.position.y = model.baseHeight / 2;
  root.add(foundation);
  const floors = new T.Group(); floors.position.y = model.baseHeight; root.add(floors);
  const slabs = new T.InstancedMesh(unit, blockMaterial, Math.max(1, model.layers.length));
  slabs.count = model.layers.length;
  const windows = new T.InstancedMesh(unit, glassMaterial, Math.max(1, model.layers.length * 3));
  windows.count = model.layers.length * 3;
  const slots = new T.InstancedMesh(unit, stickerMaterial, Math.max(1, Math.min(3, model.layers.length)));
  slots.count = Math.min(3, model.layers.length);
  model.layers.forEach((layer, index) => {
    positionFloor(model, index, slabs, windows, slots);
    layerTint(color, index, tint);
    slabs.setColorAt(index, tint);
  });
  floors.add(slabs, windows, slots);
  root.userData = { model, floors, slabs, windows, slots, logicalHeight: towerHeight(model), color };
  return root;
}

const plotPosition = (plot: number, side=4) => ({ x: (plot % side - (side-1)/2) * 4.6, z: (Math.floor(plot / side) - (side-1)/2) * 4.6 });
function releaseGroup(group: T.Group) {
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
  private growth?: Growth;
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
  private gridSide: number;
  private maxCityHeight = 0;
  private soloColor='#75aaff';

  constructor(container: HTMLElement, config: RuntimeConfig, gridSide=4) {
    this.gridSide=gridSide;
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
    this.createCityGround();
    this.observer=new ResizeObserver(() => this.resize());this.observer.observe(container);
    this.resize(false);
  }
  setConfig(config: RuntimeConfig) { this.config = config; }
  private resize(redraw = true) {
    const width = Math.max(1, this.container.clientWidth), height = Math.max(1, this.container.clientHeight);
    if (width === this.width && height === this.height) return;
    this.width = width; this.height = height;
    this.renderer.setSize(this.width, this.height, false);
    if (redraw && this.cameraReady) { this.updateCamera(0, true); this.draw(); }
  }
  private createCityGround() {
    const ground = new T.Mesh(unit, new T.MeshStandardMaterial({ color: '#dbe8de', roughness: 1 }));
    ground.scale.set(this.gridSide*4.6+3.6, 0.28, this.gridSide*4.6+3.6); ground.position.y = -0.23; this.city.add(ground);
    const parkMaterial = new T.MeshStandardMaterial({ color: '#c9dfc2', roughness: 1 });
    const walkMaterial = new T.MeshStandardMaterial({ color: '#edf1e7', roughness: 1 });
    const count=this.gridSide**2;
    const walks=new T.InstancedMesh(unit,walkMaterial,count),lawns=new T.InstancedMesh(unit,parkMaterial,count);
    const trunks=new T.InstancedMesh(unit,new T.MeshStandardMaterial({color:'#a99b87',roughness:1}),count*2);
    const trees=new T.InstancedMesh(new T.IcosahedronGeometry(0.31,1),new T.MeshStandardMaterial({roughness:1}),count*2);
    for (let plot = 0; plot < count; plot++) {
      const p = plotPosition(plot,this.gridSide);
      scratch.position.set(p.x,-0.04,p.z);scratch.scale.set(3.95,0.1,3.95);scratch.rotation.set(0,0,0);scratch.updateMatrix();walks.setMatrixAt(plot,scratch.matrix);
      scratch.position.set(p.x,0.015,p.z);scratch.scale.set(3.55,0.055,3.55);scratch.updateMatrix();lawns.setMatrixAt(plot,scratch.matrix);
      for (const side of [-1, 1]) {
        const i=plot*2+(side>0?1:0);
        scratch.position.set(p.x+side*1.52,0.23,p.z+1.42);scratch.scale.set(0.1,0.33,0.1);scratch.updateMatrix();trunks.setMatrixAt(i,scratch.matrix);
        scratch.position.y=0.58;scratch.scale.set(1,1,1);scratch.updateMatrix();trees.setMatrixAt(i,scratch.matrix);trees.setColorAt(i,new T.Color(plot%2?'#82bba5':'#91c293'));
      }
    }
    this.city.add(walks,lawns,trunks,trees);
    const park = new T.Mesh(new T.CylinderGeometry(1.2, 1.25, 0.08, 40), parkMaterial);
    const p = plotPosition(13,this.gridSide); park.position.set(p.x, 0.1, p.z); this.city.add(park);
    const water = new T.Mesh(new T.CylinderGeometry(0.52, 0.56, 0.12, 32), new T.MeshStandardMaterial({ color: '#92d2e8', roughness: 0.4 }));
    water.position.set(p.x, 0.2, p.z); this.city.add(water);
  }
  setSolo(model: TowerModel, color = this.soloColor) {
    if (model === this.soloModel && color===this.soloColor) return;
    this.soloColor=color;
    if (this.soloTower) releaseGroup(this.soloTower);
    this.soloModel = model;
    this.soloTower = buildTower(model, color); this.solo.add(this.soloTower);
  }
  setView(view: View) {
    const pullback = this.view === 'play' && view === 'result';
    if (view === 'play' && this.view !== 'play') { this.fragmentMesh.visible = false; this.fragment = undefined; this.cutGlow.visible = false; this.cutAge = 100; }
    this.view = view; this.solo.visible = view !== 'city'; this.city.visible = view === 'city';
    this.moving.visible = false; this.guide.visible = false;
    if (view !== 'city') this.focus = undefined;
    this.resize(false);
    this.updateCamera(0, !pullback);
    this.draw();
  }
  setCity(buildings: CityBuilding[], update?: CityUpdate) {
    this.maxCityHeight=Math.max(0,...buildings.map(b=>towerHeight(b.tower)));
    const present=new Set(buildings.map(b=>b.playerId));
    for(const [id,group] of this.cityObjects)if(!present.has(id)){releaseGroup(group);this.cityObjects.delete(id);}
    for (const building of buildings) {
      const previous = this.cityObjects.get(building.playerId);
      if (previous?.userData.model === building.tower) continue;
      if (previous) releaseGroup(previous);
      const group = buildTower(building.tower, building.color), p = plotPosition(building.plotId,this.gridSide);
      group.position.set(p.x, 0.055, p.z);
      group.userData.playerId = building.playerId;
      this.city.add(group); this.cityObjects.set(building.playerId, group);
      if (update?.building?.playerId === building.playerId && ['first', 'best'].includes(update.kind)) {
        const from = update.previous ? update.previous.tower.layers.length / building.tower.layers.length : 0.05;
        group.userData.floors.scale.y = from;
        this.growth = { group, from, elapsed: 0 };
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
  focusBuilding(building?: CityBuilding) { this.focus = building; this.zoom = building ? 0.72 : 1; }
  zoomCity(amount: number) { this.zoom = T.MathUtils.clamp(this.zoom + amount, 0.55, 1.55); }
  rotateCity(direction: number) { this.angle += direction * Math.PI / 12; }
  projectLabel(building: CityBuilding) {
    const group = this.cityObjects.get(building.playerId), p = plotPosition(building.plotId,this.gridSide);
    const height = building.tower.baseHeight + building.tower.layers.length * building.tower.layerHeight * (group?.userData.floors.scale.y ?? 1);
    const top = topLayer(building.tower);
    const v = new T.Vector3(p.x + top.x, height + 0.8, p.z + top.z).project(this.camera);
    return { x: (v.x + 1) * this.width / 2, y: (1 - v.y) * this.height / 2, visible: Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.1 };
  }
  cityGeometry(playerId: string) {
    const group = this.cityObjects.get(playerId);
    if (!group) return null;
    const model = group.userData.model as TowerModel;
    return { model, logicalHeight: towerHeight(model), displayedHeight: model.baseHeight + model.layers.length * model.layerHeight * group.userData.floors.scale.y, plotPosition: group.position.toArray(), color: group.userData.color };
  }
  update(seconds: number, game?: GameSession) {
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
    if (this.growth) {
      this.growth.elapsed += seconds;
      const t = Math.min(1, this.growth.elapsed / this.config.visual.growthSeconds), eased = 1 - (1 - t) ** 3;
      this.growth.group.userData.floors.scale.y = T.MathUtils.lerp(this.growth.from, 1, eased);
      if (t === 1) this.growth = undefined;
    }
    this.updateCamera(seconds);
    this.draw();
  }
  private updateCamera(seconds: number, snap = false) {
    const model = this.soloModel;
    const height = model ? towerHeight(model) : 3, aspect = this.width / this.height;
    let span: number;
    if (this.view === 'city') {
      const focus = this.focus ? plotPosition(this.focus.plotId,this.gridSide) : { x: 0, z: 0 };
      this.aim.set(focus.x, this.focus ? towerHeight(this.focus.tower) * 0.45 : 3.2, focus.z);
      span = (this.focus?Math.max(4.6,5.5/aspect,towerHeight(this.focus.tower)*0.55+1):Math.max(13.2*this.gridSide/4,15.8*this.gridSide/4/aspect,this.maxCityHeight*0.65))*this.zoom;
    } else {
      this.aim.set(model ? topLayer(model).x * 0.3 : 0, this.view === 'play' ? Math.max(2.3, height - 1.6) : height * 0.46, model ? topLayer(model).z * 0.3 : 0);
      span = this.view === 'play' ? Math.max(4.6, 4.6 / aspect) : Math.max(2.9, height * 0.49 + 0.85, 3.1 / aspect);
    }
    const damping = snap || !this.cameraReady ? 1 : 1 - Math.exp(-Math.max(0, seconds) * 4 / this.config.visual.cameraSeconds);
    this.target.lerp(this.aim, damping); this.currentSpan = T.MathUtils.lerp(this.currentSpan, span, damping);
    this.camera.position.copy(this.target).add(new T.Vector3(Math.sin(this.angle) * 25, 23, Math.cos(this.angle) * 25));
    this.camera.lookAt(this.target);
    this.camera.left = -this.currentSpan * aspect; this.camera.right = this.currentSpan * aspect;
    this.camera.top = this.currentSpan; this.camera.bottom = -this.currentSpan; this.camera.updateProjectionMatrix();
    this.cameraReady = true;
  }
  private draw() {
    this.renderer.render(this.scene, this.camera);
    this.renderer.domElement.style.opacity = '1';
  }
  presentation() {
    return { view: this.view, width: this.width, height: this.height, cameraReady: this.cameraReady, span: this.currentSpan, target: this.target.toArray(), aim: this.aim.toArray() };
  }
  dispose() {
    this.observer.disconnect();
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
    positionFloor(model, index, slabs, windows, slots, offset);
    for (const mesh of [slabs, windows, slots]) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }
  }
}

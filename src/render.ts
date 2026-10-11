import * as T from 'three';
import type { RuntimeConfig } from './config.ts';
import type { GameSession } from './core/game.ts';
import { topLayer, towerHeight } from './core/tower.ts';
import type { Layer, TowerModel } from './core/tower.ts';
import type { CityBuilding, CityUpdate } from './core/city.ts';

const unit = new T.BoxGeometry(1, 1, 1);
const blockMaterial = new T.MeshStandardMaterial({ roughness: 0.64, metalness: 0.02 });
const foundationMaterial = new T.MeshStandardMaterial({ color: '#f4f5e8', roughness: 0.85 });
const glassMaterial = new T.MeshStandardMaterial({ color: '#dbf3fa', roughness: 0.3, metalness: 0.07 });
const stickerMaterial = new T.MeshStandardMaterial({ color: '#fffaf1', roughness: 0.6 });
const scratch = new T.Object3D();
const tint = new T.Color();
export type View = 'intro' | 'play' | 'result' | 'city';

function instance(mesh: T.InstancedMesh, index: number, x: number, y: number, z: number, width: number, height: number, depth: number) {
  scratch.position.set(x, y, z); scratch.rotation.set(0, 0, 0); scratch.scale.set(width, height, depth);
  scratch.updateMatrix(); mesh.setMatrixAt(index, scratch.matrix);
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
  model.layers.forEach((layer, index) => {
    const y = (index + 0.5) * model.layerHeight;
    instance(slabs, index, layer.x, y, 0, layer.width, model.layerHeight, model.depth);
    tint.set(color).lerp(new T.Color(index % 3 === 1 ? '#fff4d8' : '#eef8ff'), index % 4 * 0.075);
    slabs.setColorAt(index, tint);
    for (let j = 0; j < 3; j++) instance(windows, index * 3 + j, layer.x + (j - 1) * layer.width * 0.26, y, model.depth / 2 + 0.009, layer.width * 0.15, model.layerHeight * 0.38, 0.018);
  });
  floors.add(slabs, windows);
  if (model.layers.length > 0) {
    const slotHeight = Math.min(1.12, model.layers.length * model.layerHeight * 0.55);
    const slotLayer = model.layers[Math.min(model.layers.length - 1, Math.ceil(slotHeight / model.layerHeight))];
    const slot = new T.Mesh(unit, stickerMaterial);
    slot.scale.set(slotLayer.width * 0.35, slotHeight, 0.025);
    slot.position.set(slotLayer.x, slotHeight / 2 + 0.06, model.depth / 2 + 0.032);
    floors.add(slot);
    for (let i = 0; i < 3; i++) {
      const mark = new T.Mesh(unit, glassMaterial);
      mark.scale.set(slotLayer.width * 0.2, 0.025, 0.014);
      mark.position.set(slotLayer.x, slotHeight * (0.29 + i * 0.18) + 0.06, model.depth / 2 + 0.052);
      floors.add(mark);
    }
  }
  root.userData = { model, floors, slabs, windows, logicalHeight: towerHeight(model), color };
  return root;
}

const plotPosition = (plot: number) => ({ x: (plot % 4 - 1.5) * 4.6, z: (Math.floor(plot / 4) - 1.5) * 4.6 });
function releaseGroup(group: T.Group) {
  group.traverse(object => { if (object instanceof T.InstancedMesh) object.dispose(); });
  group.removeFromParent();
}
interface Growth { group: T.Group; from: number; elapsed: number }
interface Fragment { mesh: T.Mesh; age: number; direction: number; origin: T.Vector3 }

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

  constructor(container: HTMLElement, config: RuntimeConfig) {
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
    this.solo.add(this.moving, this.guide);
    const island = new T.Mesh(new T.CylinderGeometry(6.4, 6.55, 0.28, 60), new T.MeshStandardMaterial({ color: '#d3e8d9', roughness: 1 }));
    island.position.y = -0.18; this.solo.add(island);
    const ring = new T.Mesh(new T.TorusGeometry(6.46, 0.055, 8, 70), new T.MeshBasicMaterial({ color: '#f4fbff' }));
    ring.rotation.x = Math.PI / 2; ring.position.y = -0.02; this.solo.add(ring);
    this.createCityGround();
    new ResizeObserver(() => this.resize()).observe(container);
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
    ground.scale.set(22, 0.28, 22); ground.position.y = -0.23; this.city.add(ground);
    const parkMaterial = new T.MeshStandardMaterial({ color: '#c9dfc2', roughness: 1 });
    const walkMaterial = new T.MeshStandardMaterial({ color: '#edf1e7', roughness: 1 });
    for (let plot = 0; plot < 16; plot++) {
      const p = plotPosition(plot);
      const walk = new T.Mesh(unit, walkMaterial); walk.position.set(p.x, -0.04, p.z); walk.scale.set(3.95, 0.1, 3.95); this.city.add(walk);
      const lawn = new T.Mesh(unit, parkMaterial); lawn.position.set(p.x, 0.015, p.z); lawn.scale.set(3.55, 0.055, 3.55); this.city.add(lawn);
      const treeMaterial = new T.MeshStandardMaterial({ color: plot % 2 ? '#82bba5' : '#91c293', roughness: 1 });
      for (const side of [-1, 1]) {
        const trunk = new T.Mesh(unit, new T.MeshStandardMaterial({ color: '#a99b87', roughness: 1 }));
        trunk.scale.set(0.1, 0.33, 0.1); trunk.position.set(p.x + side * 1.52, 0.23, p.z + 1.42); this.city.add(trunk);
        const tree = new T.Mesh(new T.IcosahedronGeometry(0.31, 1), treeMaterial); tree.position.set(trunk.position.x, 0.58, trunk.position.z); this.city.add(tree);
      }
    }
    const park = new T.Mesh(new T.CylinderGeometry(1.2, 1.25, 0.08, 40), parkMaterial);
    const p = plotPosition(13); park.position.set(p.x, 0.1, p.z); this.city.add(park);
    const water = new T.Mesh(new T.CylinderGeometry(0.52, 0.56, 0.12, 32), new T.MeshStandardMaterial({ color: '#92d2e8', roughness: 0.4 }));
    water.position.set(p.x, 0.2, p.z); this.city.add(water);
  }
  setSolo(model: TowerModel, color = '#75aaff') {
    if (model === this.soloModel) return;
    if (this.soloTower) releaseGroup(this.soloTower);
    this.soloModel = model;
    this.soloTower = buildTower(model, color); this.solo.add(this.soloTower);
  }
  setView(view: View) {
    const pullback = this.view === 'play' && view === 'result';
    this.view = view; this.solo.visible = view !== 'city'; this.city.visible = view === 'city';
    this.moving.visible = false; this.guide.visible = false;
    if (view !== 'city') this.focus = undefined;
    this.resize(false);
    this.updateCamera(0, !pullback);
    this.draw();
  }
  setCity(buildings: CityBuilding[], update?: CityUpdate) {
    for (const building of buildings) {
      const previous = this.cityObjects.get(building.playerId);
      if (previous?.userData.model === building.tower) continue;
      if (previous) releaseGroup(previous);
      const group = buildTower(building.tower, building.color), p = plotPosition(building.plotId);
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
  landed(model: TowerModel, cut?: Layer) {
    this.setSolo(model); this.landingAge = 0;
    if (cut && cut.width > 1e-8) {
      if (this.fragment) this.fragment.mesh.removeFromParent();
      const mesh = new T.Mesh(unit, blockMaterial); mesh.scale.set(cut.width, model.layerHeight, model.depth);
      mesh.position.set(cut.x, towerHeight(model) - model.layerHeight / 2 + 1.1, 0);
      this.solo.add(mesh); this.fragment = { mesh, age: 0, direction: cut.x >= topLayer(model).x ? 1 : -1, origin: mesh.position.clone() };
    }
  }
  focusBuilding(building?: CityBuilding) { this.focus = building; this.zoom = building ? 0.72 : 1; }
  zoomCity(amount: number) { this.zoom = T.MathUtils.clamp(this.zoom + amount, 0.55, 1.55); }
  rotateCity(direction: number) { this.angle += direction * Math.PI / 12; }
  projectLabel(building: CityBuilding) {
    const group = this.cityObjects.get(building.playerId), p = plotPosition(building.plotId);
    const height = building.tower.baseHeight + building.tower.layers.length * building.tower.layerHeight * (group?.userData.floors.scale.y ?? 1);
    const v = new T.Vector3(p.x + topLayer(building.tower).x, height + 0.8, p.z).project(this.camera);
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
      this.moving.scale.set(top.width, game.tower.layerHeight, game.tower.depth);
      this.moving.position.set(game.movingX, towerHeight(game.tower) + game.tower.layerHeight / 2 + 1.1, 0);
      this.guide.visible = this.moving.visible;
      this.guide.scale.set(top.width, game.tower.layerHeight, game.tower.depth);
      this.guide.position.set(top.x, towerHeight(game.tower) + game.tower.layerHeight / 2, 0);
      if (game.phase !== 'paused') this.landingAge += seconds;
      if (this.soloTower && game.isLanding) this.animateLanding(game.tower, Math.max(0, 1 - this.landingAge / game.config.dropSeconds) ** 2 * 1.1);
      else if (this.soloTower) this.animateLanding(game.tower, 0);
    }
    if (this.fragment) {
      this.fragment.age += seconds;
      const f = this.fragment;
      f.mesh.position.copy(f.origin).add(new T.Vector3(f.direction * f.age * 1.2, -6 * f.age ** 2, f.age * 0.5));
      f.mesh.rotation.z = -f.direction * f.age;
      if (f.age > 1.25) { f.mesh.removeFromParent(); this.fragment = undefined; }
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
      const focus = this.focus ? plotPosition(this.focus.plotId) : { x: 0, z: 0 };
      this.aim.set(focus.x, this.focus ? towerHeight(this.focus.tower) * 0.45 : 3.2, focus.z);
      span = Math.max(13.2, 15.8 / aspect) * this.zoom;
    } else {
      this.aim.set(model ? topLayer(model).x * 0.3 : 0, this.view === 'play' ? Math.max(2.3, height - 1.6) : height * 0.46, 0);
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
  private animateLanding(model: TowerModel, offset: number) {
    if (!this.soloTower || model.layers.length === 0) return;
    const index = model.layers.length - 1, layer = model.layers[index], y = (index + 0.5) * model.layerHeight + offset;
    const slabs = this.soloTower.userData.slabs as T.InstancedMesh, windows = this.soloTower.userData.windows as T.InstancedMesh;
    instance(slabs, index, layer.x, y, 0, layer.width, model.layerHeight, model.depth);
    for (let j = 0; j < 3; j++) instance(windows, index * 3 + j, layer.x + (j - 1) * layer.width * 0.26, y, model.depth / 2 + 0.009, layer.width * 0.15, model.layerHeight * 0.38, 0.018);
    slabs.instanceMatrix.needsUpdate = true; windows.instanceMatrix.needsUpdate = true;
    slabs.computeBoundingSphere(); windows.computeBoundingSphere();
  }
}

import './style.css';
import { loadRuntimeConfig, parseRuntimeConfig } from './config.ts';
import { GameSession } from './core/game.ts';
import type { CompletedRun } from './core/game.ts';
import { MemoryCityRepository } from './core/city.ts';
import { temporaryId } from './core/session-id.ts';
import { fixtureTower, towerHeight } from './core/tower.ts';
import { SkylineRenderer } from './render.ts';
import type { View } from './render.ts';
import { mountUI } from './ui.ts';

const root = document.querySelector<HTMLElement>('#app')!;
mountUI(root);
const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
let config = await loadRuntimeConfig();
const city = new MemoryCityRepository();
const playerId = temporaryId();
let game: GameSession | undefined;
let completed: CompletedRun | null = null;
let view: View = 'intro';
let endHandled = false;
let feedbackUntil = 0;
let eventUntil = 0;
let stickerSkipped = false;
let labelNodes: Array<{ building: ReturnType<typeof city.all>[number]; node: HTMLButtonElement }> = [];
let viewer: SkylineRenderer;

try { viewer = new SkylineRenderer($('viewport'), config); }
catch {
  root.innerHTML = '<div class="compatibility-message"><h1>还差一点，就能看到天际线。</h1><p>当前浏览器无法启动 3D 画面，请尝试新版 Safari 或 Chrome，并启用图形加速。</p></div>';
  throw new Error('WebGL2 renderer unavailable');
}
viewer.setSolo(fixtureTower(10));
viewer.setCity(city.all());
$('city-name').textContent = config.cityDisplayName;

function show(next: View) {
  view = next;
  document.documentElement.dataset.view = next;
  for (const section of document.querySelectorAll<HTMLElement>('[data-screen]')) section.hidden = section.dataset.screen !== next;
  viewer.setView(next);
  $('building-labels').hidden = next !== 'city';
  $('overview-button').hidden = next === 'city';
  $('footer-status').textContent = next === 'city' ? '模拟数据 · 刷新会重置城市' : '单轴盖楼 · 城市使用模拟数据';
}
function start() {
  game = new GameSession(config.game); completed = null; endHandled = false;
  stickerSkipped = false; $('skip-sticker').textContent = '跳过'; ($('skip-sticker') as HTMLButtonElement).disabled = false;
  feedbackUntil = 0; $('placement-feedback').classList.remove('visible');
  viewer.setSolo(game.tower); show('play'); updateHUD();
}
function place() {
  if (view !== 'play' || !game) return;
  const placed = game.place();
  if (!placed) return;
  if (placed.kind !== 'miss') {
    viewer.landed(game.tower, placed.kind === 'trimmed' ? placed.cut : undefined);
    const feedback = $('placement-feedback');
    feedback.textContent = placed.kind === 'perfect' ? `Perfect${game.combo >= game.config.comboMilestone ? ` · ${game.combo} 连击！` : '！'}` : '接住了！';
    feedback.className = 'visible ' + (placed.kind === 'perfect' ? 'perfect' : 'trimmed');
    feedbackUntil = performance.now() + 900;
  }
  updateHUD();
}
function updateHUD() {
  if (!game) return;
  $('seconds').textContent = String(Math.ceil(game.remaining));
  $('floor-count').textContent = String(game.tower.layers.length);
  $('timer-ring').style.setProperty('--progress', `${game.remaining / game.config.roundSeconds * 100}%`);
  ($('drop-button') as HTMLButtonElement).disabled = game.phase !== 'moving';
  $('pause-overlay').hidden = game.phase !== 'paused';
}
function finish() {
  if (!game || endHandled || game.phase !== 'ended') return;
  endHandled = true; completed = game.result();
  if (!completed) return;
  const count = completed.tower.layers.length;
  $('result-floors').textContent = String(count);
  $('end-caption').textContent = completed.reason === 'time' ? '时间到，作品完成' : '这一局，收好你的作品';
  $('performance-summary').textContent = `Perfect ${completed.perfectCount} 次 · 最长 ${completed.longestCombo} 连击`;
  ($('submit-button') as HTMLButtonElement).disabled = count === 0;
  $('submit-note').textContent = count === 0 ? '先成功盖一层，再把小楼放进城市。' : '城市使用模拟数据，仅保留在本页。';
  viewer.setSolo(completed.tower); show('result');
}
function refreshCityUI() {
  const buildings = city.all(), own = city.get(playerId);
  $('city-count').textContent = `12 栋样例建筑${own ? ' + 你的本页作品' : ''}`;
  const ranking = $('city-ranking'); ranking.replaceChildren();
  buildings.slice(0, 7).forEach((building, index) => {
    const item = document.createElement('li'), button = document.createElement('button');
    if (building.playerId === playerId) item.className = 'mine';
    const order = document.createElement('span'); order.className = 'rank-number'; order.textContent = String(index + 1).padStart(2, '0');
    const dot = document.createElement('span'); dot.className = 'color-dot'; dot.style.backgroundColor = building.color;
    const name = document.createElement('span'); name.className = 'rank-name'; name.textContent = building.name;
    const score = document.createElement('strong'); score.textContent = `${building.tower.layers.length} 层`;
    button.append(order, dot, name, score); button.onclick = () => viewer.focusBuilding(building);
    item.append(button); ranking.append(item);
  });
  const personal = $('personal-building'); personal.hidden = !own;
  if (own) { personal.textContent = `我的楼 · ${own.name} · 最佳 ${own.tower.layers.length} 层`; personal.onclick = () => viewer.focusBuilding(own); }
  $('find-building').hidden = !own;
  $('city-callout-title').textContent = own ? `${own.name}，还可以再长高一点。` : '让这座城市，多一栋你的楼。';
  $('city-callout-note').textContent = own ? `个人最佳 ${own.tower.layers.length} 层 · 地块和颜色保持不变` : '先玩一局，再为作品署名。';
  $('city-play').textContent = game?.phase === 'paused' ? '继续盖楼 →' : own ? '再盖一局 →' : '开始盖楼 →';
  $('building-labels').replaceChildren();
  labelNodes = buildings.map(building => {
    const node = document.createElement('button'); node.className = 'building-label' + (building.playerId === playerId ? ' own-label' : '');
    node.style.setProperty('--building-color', building.color);
    node.textContent = building.playerId === playerId ? `${building.name} · ${building.tower.layers.length} 层` : building.name;
    node.onclick = () => viewer.focusBuilding(building);
    $('building-labels').append(node); return { building, node };
  });
}
function overview() {
  if (game && game.phase !== 'ended') game.pause();
  viewer.setCity(city.all()); refreshCityUI(); viewer.focusBuilding(); show('city');
}
function submit() {
  if (!completed) return;
  const update = city.submit(playerId, $('signature') instanceof HTMLInputElement ? ($('signature') as HTMLInputElement).value : '', completed);
  if (!update.building || ['invalid', 'duplicate'].includes(update.kind)) return;
  viewer.setCity(city.all(), update); refreshCityUI(); viewer.focusBuilding(); show('city');
  const event = $('city-event'); event.replaceChildren();
  const title = document.createElement('strong'), note = document.createElement('span');
  title.textContent = update.kind === 'first' ? '你的楼，入城了！' : update.kind === 'best' ? '新最佳，原地长高！' : '最佳纪录保持不变';
  note.textContent = update.kind === 'first' ? `${update.building.name} · ${completed.tower.layers.length} 层` : update.kind === 'best' ? `从 ${update.previous!.tower.layers.length} 层，长到 ${update.building.tower.layers.length} 层` : `本局 ${completed.tower.layers.length} 层，主楼仍是 ${update.building.tower.layers.length} 层`;
  event.append(title, note); event.dataset.kind = update.kind; event.hidden = false; eventUntil = performance.now() + 6000;
  ($('submit-button') as HTMLButtonElement).disabled = true;
}

$('start-button').onclick = start; $('replay-button').onclick = start;
$('city-play').onclick = () => { if (game?.phase === 'paused') { game.resume(); show('play'); updateHUD(); } else start(); };
$('home-button').onclick = () => { if (game && game.phase !== 'ended') game.pause(); viewer.setSolo(fixtureTower(10)); show('intro'); };
$('overview-button').onclick = overview;
$('drop-button').addEventListener('pointerdown', event => { if (event.isPrimary && event.button === 0) { event.preventDefault(); place(); } });
viewer.renderer.domElement.addEventListener('pointerdown', event => { if (event.isPrimary && event.button === 0) place(); });
$('pause-button').onclick = () => { game?.pause(); updateHUD(); };
$('resume-button').onclick = () => { game?.resume(); updateHUD(); };
$('skip-sticker').onclick = () => { stickerSkipped = true; $('skip-sticker').textContent = '已跳过'; ($('skip-sticker') as HTMLButtonElement).disabled = true; };
$('submit-button').onclick = submit;
$('zoom-in').onclick = () => viewer.zoomCity(-0.12); $('zoom-out').onclick = () => viewer.zoomCity(0.12);
$('rotate-city').onclick = () => viewer.rotateCity(1); $('city-wide').onclick = () => viewer.focusBuilding();
$('find-building').onclick = () => viewer.focusBuilding(city.get(playerId));
document.addEventListener('visibilitychange', () => { if (document.hidden && game && game.phase !== 'ended') { game.pause(); updateHUD(); } });
document.addEventListener('keydown', event => {
  if (event.code === 'Space' && !event.repeat && view === 'play' && !(event.target instanceof HTMLInputElement) && !($('settings-dialog') as HTMLDialogElement).open) { event.preventDefault(); place(); }
});
const dialog = $('settings-dialog') as HTMLDialogElement;
$('settings-button').onclick = () => {
  game?.pause(); updateHUD();
  ($('setting-time') as HTMLInputElement).value = String(config.game.roundSeconds);
  ($('setting-speed') as HTMLInputElement).value = String(config.game.baseSpeed);
  ($('setting-perfect') as HTMLInputElement).value = String(config.game.perfectRatio * 100);
  ($('setting-combo') as HTMLInputElement).value = String(config.game.comboMilestone);
  dialog.showModal();
};
dialog.addEventListener('close', () => {
  if (dialog.returnValue === 'apply') {
    config = parseRuntimeConfig({ ...config, game: { ...config.game, roundSeconds: +($('setting-time') as HTMLInputElement).value, baseSpeed: +($('setting-speed') as HTMLInputElement).value, perfectRatio: +($('setting-perfect') as HTMLInputElement).value / 100, comboMilestone: +($('setting-combo') as HTMLInputElement).value } });
    viewer.setConfig(config);
  }
});

if (import.meta.env.DEV && new URLSearchParams(location.search).get('qa') === '1') {
  const qaWindow = window as unknown as { __SKYLINE_QA__: { snapshot(): unknown } };
  qaWindow.__SKYLINE_QA__ = { snapshot: () => JSON.parse(JSON.stringify({ view, config, playerId, game: game ? { phase: game.phase, movingX: game.movingX, elapsed: game.elapsed, tower: game.tower, perfectCount: game.perfectCount, combo: game.combo } : null, completed, own: city.get(playerId), rendered: viewer.cityGeometry(playerId), presentation: viewer.presentation(), stickerSkipped, logicalHeight: game ? towerHeight(game.tower) : null, drawCalls: viewer.renderer.info.render.calls })) };
}
const initialView: View = new URLSearchParams(location.search).get('view') === 'city' ? 'city' : 'intro';
show(initialView);
if (initialView === 'city') refreshCityUI();
let previousTime = performance.now(), lastHUD = 0;
function frame(now: number) {
  const seconds = Math.max(0, (now - previousTime) / 1000); previousTime = now;
  if (view === 'play' && game) { game.advance(seconds); finish(); if (now - lastHUD > 90) { updateHUD(); lastHUD = now; } }
  viewer.update(seconds, game);
  if (view === 'city') for (const { building, node } of labelNodes) { const p = viewer.projectLabel(building); node.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`; node.hidden = !p.visible; }
  if (feedbackUntil && now > feedbackUntil) { $('placement-feedback').classList.remove('visible'); feedbackUntil = 0; }
  if (eventUntil && now > eventUntil) { $('city-event').hidden = true; eventUntil = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

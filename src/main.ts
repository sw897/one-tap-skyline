import { loadRuntimeConfig, parseRuntimeConfig, playtestConfig } from './config.ts';
import { GameSession } from './core/game.ts';
import type { CompletedRun } from './core/game.ts';
import { MemoryCityRepository } from './core/city.ts';
import { temporaryId } from './core/session-id.ts';
import { fixtureTower, towerHeight, emptyTower } from './core/tower.ts';
import { SkylineRenderer } from './render.ts';
import type { View } from './render.ts';
import { mountUI } from './ui.ts';
import { RunClock } from './core/trace.ts';
import type { RunTrace } from './core/trace.ts';
import { SharedCityRepository, SharedError, loadSession, startSharedRun, sharedMessage } from './shared/client.ts';
import type { SharedSession, SharedCityId } from './shared/protocol.ts';

export async function mountSkyline(root: HTMLElement, signal?: AbortSignal): Promise<() => void> {
const search = new URLSearchParams(location.search);
const personalSurface=search.get('mode')!=='display'&&(matchMedia('(pointer: coarse)').matches||matchMedia('(max-width:760px)').matches);
let config = playtestConfig(await loadRuntimeConfig(), location.search);
const cityId: SharedCityId = search.get('city')==='test-mobile'?'test-mobile':search.get('city')==='test'?'test':'public';
let shared = search.get('mode') !== 'practice' && !search.has('cut');
let session: SharedSession | undefined, initialError = '';
if (shared) {
  try { session = await loadSession(cityId,signal,personalSurface?'own':'all'); if (!session.snapshot.writeOpen && search.get('mode') !== 'shared') shared=false; }
  catch (error) { if (signal?.aborted) return () => {}; initialError=sharedMessage(error); shared=false; }
}
if (signal?.aborted) return () => {};
if (shared && session) config={...config,game:{...session.rules},cityDisplayName:session.snapshot.name};
mountUI(root);
document.documentElement.dataset.surface=personalSurface?'personal':'city';
const $ = <E extends HTMLElement = HTMLElement>(id: string) => root.querySelector('#'+id) as E;
const city = shared && session ? new SharedCityRepository(session) : new MemoryCityRepository(true, config.game.cutMode);
const playerId = shared && session ? session.playerId : temporaryId();
const buildingColor=shared&&session?session.color:'#75aaff';
let game: GameSession | undefined;
let clock: RunClock | undefined, origin = 0, completedTrace: RunTrace | undefined;
let activeServerRun = session?.activeRunId ?? null;
let pendingStartKey: string | undefined, starting=false, submitting=false, frozenName: string | undefined;
let disposed=false, animationFrame=0, pollBusy=false;
let placementClickPending=false;
let navigationVersion=0;
const pollAbort = new AbortController();
let completed: CompletedRun | null = null;
let view: View = 'intro';
let endHandled = false;
let feedbackUntil = 0;
let eventUntil = 0;
let stickerSkipped = false;
let labelNodes: Array<{ building: ReturnType<typeof city.all>[number]; node: HTMLButtonElement }> = [];
let viewer: SkylineRenderer;

try { viewer = new SkylineRenderer($('viewport'), config,shared&&!personalSurface?8:4); }
catch {
  root.innerHTML = '<div class="compatibility-message"><h1>还差一点，就能看到天际线。</h1><p>当前浏览器无法启动 3D 画面，请尝试新版 Safari 或 Chrome，并启用图形加速。</p></div>';
  throw new Error('WebGL2 renderer unavailable');
}
viewer.setSolo(fixtureTower(10, 0, config.game.cutMode),buildingColor);
if(!personalSurface)viewer.setCity(city.all());
$('city-name').textContent = config.cityDisplayName;
$('intro-direction').textContent = config.game.cutMode === 'alternate-xz' ? '楼层左右、前后交替移动 · 单指点击落层' : '楼层沿固定方向移动 · 单指点击落层';
const modeName = () => (game?.config ?? config.game).cutMode === 'alternate-xz' ? '逐层换向' : '固定方向';
const clockNow = () => Math.max(0,Math.round((performance.now()-origin)*1000));
const pauseGame = () => { if (clock && game?.phase !== 'ended') clock.pause(clockNow()); };
const resumeGame = () => { if (clock) clock.resume(clockNow()); };
$('prototype-badge').textContent=shared?'共享试玩':'练习 · 本页模拟';
$('overview-button').firstChild!.textContent=personalSurface?'我的楼 ':'城市总览 ';
$('scene-data-mark').hidden=!(shared&&cityId!=='public');
$('settings-button').hidden=shared;
$('shared-link').hidden=shared; $('practice-link').hidden=!shared;
($('practice-link') as HTMLAnchorElement).href='/?mode=practice';
($('shared-link') as HTMLAnchorElement).href='/?mode=shared';
$('data-badge').textContent=shared?(cityId!=='public'?'共享测试数据':'真实共享城市'):'模拟数据 · 本页城市';
$('board-title').textContent=shared?'层数榜':'模拟高度榜';
$('city-disclosure').textContent=shared?'署名、成绩与楼体公开展示。只在新最佳时更新主楼。':'这里是视觉模拟。刷新会重置，不是共享城市或真实排名。';
$('submit-button').firstChild!.textContent=shared?'共享入城 ':'模拟入城 ';
if(initialError)$('intro-direction').textContent=initialError+' 当前进入练习。';

function show(next: View) {
  navigationVersion++;
  view = next;
  document.documentElement.dataset.view = next;
  for (const section of document.querySelectorAll<HTMLElement>('[data-screen]')) section.hidden = section.dataset.screen !== next;
  // Hidden overflow containers can retain a focus-induced internal scroll.
  // Every screen starts at the fixed viewport origin.
  root.scrollLeft=0;root.scrollTop=0;
  viewer.setView(next==='city'&&personalSurface?'result':next);
  $('building-labels').hidden = next !== 'city'||personalSurface;
  $('overview-button').hidden = next === 'city';
  $('footer-status').textContent = `${modeName()} · ${shared?(cityId!=='public'?'共享测试数据':'同浏览器匿名身份 · 真实共享'):next === 'city'?'模拟数据，刷新会重置城市':'城市使用模拟数据'}`;
}
async function start() {
  if(starting||submitting||disposed)return;
  const navigation=navigationVersion;
  starting=true;
  try {
    let runId: string | undefined;
    if(shared) {
      pendingStartKey ??= temporaryId();
      const began=await startSharedRun(cityId,pendingStartKey,activeServerRun);
      runId=began.runId;activeServerRun=runId;pendingStartKey=undefined;
      if(disposed||navigation!==navigationVersion)return;
      config={...config,game:began.rules};
    }
    game = new GameSession(config.game,runId); clock=new RunClock(game);origin=performance.now();
    completed = null; completedTrace=undefined;endHandled = false; frozenName=undefined;
    ($('signature') as HTMLInputElement).disabled=false;
  stickerSkipped = false; $('skip-sticker').textContent = '跳过'; ($('skip-sticker') as HTMLButtonElement).disabled = false;
  feedbackUntil = 0; $('placement-feedback').classList.remove('visible');
  viewer.setSolo(game.tower,buildingColor); show('play'); updateHUD();
  } catch(error) {
    if(error instanceof SharedError&&['start_key_finished','run_expired_or_cancelled'].includes(error.code)){pendingStartKey=undefined;activeServerRun=null;}
    $('intro-direction').textContent=sharedMessage(error);$('city-callout-note').textContent=sharedMessage(error);$('submit-note').textContent=sharedMessage(error);
  }
  finally {starting=false;}
}
function place() {
  if (view !== 'play' || !game) return;
  const placed = clock?.place(clockNow());
  if (!placed) return;
  if (placed.kind !== 'miss') {
    viewer.landed(game.tower, placed.kind === 'trimmed' ? placed.cut : undefined, placed.axis);
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
  $('move-direction').textContent = game.isLanding ? '落稳后，再接下一层' : game.activeAxis === 'x' ? '本层左右移动 ↔' : '本层前后移动 ↗↙';
}
function finish() {
  if (!game || endHandled || game.phase !== 'ended') return;
  endHandled = true; completed = game.result(); completedTrace=clock?.trace();
  if (!completed) return;
  const count = completed.tower.layers.length;
  $('result-floors').textContent = String(count);
  $('end-caption').textContent = completed.reason === 'time' ? '时间到，作品完成' : '这一局，收好你的作品';
  $('performance-summary').textContent = `Perfect ${completed.perfectCount} 次 · 最长 ${completed.longestCombo} 连击`;
  ($('submit-button') as HTMLButtonElement).disabled = count === 0;
  $('submit-note').textContent = count === 0 ? '先成功盖一层，再把小楼放进城市。' : shared?'提交后，署名、成绩与楼体将公开展示。本局需在开局后10分钟内提交。':'城市使用模拟数据，仅保留在本页。';
  viewer.setSolo(completed.tower,buildingColor); show('result');
}
function refreshCityUI() {
  if(city instanceof SharedCityRepository)$('city-name').textContent=city.snapshot.name;
  const buildings = city.all(), own = city.get(playerId);
  if(personalSurface){
    $('personal-summary').hidden=false;
    $('personal-floors').textContent=String(own?.tower.layers.length??0);
    $('personal-name').textContent=own?.name??'还没有保存的作品';
    $('personal-note').textContent=own?'每次只保留个人最佳；新最佳会在大屏原地更新。':'先盖一局，把自己的楼留在天际线。';
    $('city-callout-title').textContent=own?'看看你的最高作品。':'先盖出属于你的小楼。';
    $('city-callout-note').textContent=shared?'署名、成绩与楼体会在大屏城市公开展示。':'这是本页模拟，刷新后重置。';
    $('city-play').textContent=game?.phase==='paused'?'继续盖楼 →':own?'再盖一局 →':'开始盖楼 →';
    labelNodes=[];return;
  }
  $('city-count').textContent = shared?`${buildings.length} 栋${cityId!=='public'?'共享测试':'玩家'}建筑`:`12 栋样例建筑${own ? ' + 你的本页作品' : ''}`;
  const ranking = $('city-ranking'); ranking.replaceChildren();
  buildings.slice(0, 7).forEach((building, index) => {
    const item = document.createElement('li'), button = document.createElement('button');
    if (building.playerId === playerId) item.className = 'mine';
    const order = document.createElement('span'); order.className = 'rank-number'; order.textContent = String('rank' in building ? building.rank : index + 1).padStart(2, '0');
    const dot = document.createElement('span'); dot.className = 'color-dot'; dot.style.backgroundColor = building.color;
    const name = document.createElement('span'); name.className = 'rank-name'; name.textContent = building.name;
    const score = document.createElement('strong'); score.textContent = `${building.tower.layers.length} 层`;
    button.append(order, dot, name, score); button.onclick = () => viewer.focusBuilding(building);
    item.append(button); ranking.append(item);
  });
  const personal = $('personal-building'); personal.hidden = !own;
  if (own) { personal.textContent = `我的楼 · ${own.name} · 最佳 ${own.tower.layers.length} 层${'rank' in own?' · 第'+own.rank+'名':''}`; personal.onclick = () => viewer.focusBuilding(own); }
  $('find-building').hidden = !own;
  $('city-callout-title').textContent = own ? `${own.name}，还可以再长高一点。` : '让这座城市，多一栋你的楼。';
  const nextTarget=own?buildings.filter(b=>b.tower.layers.length>own.tower.layers.length).at(-1):undefined;
  $('city-callout-note').textContent = own ? nextTarget?`再盖到 ${nextTarget.tower.layers.length+1} 层，超过下一档目标`:`个人最佳 ${own.tower.layers.length} 层 · 地块和颜色保持不变` : '先玩一局，再为作品署名。';
  $('city-play').textContent = game?.phase === 'paused' ? '继续盖楼 →' : own ? '再盖一局 →' : '开始盖楼 →';
  $('building-labels').replaceChildren();
  labelNodes = buildings.filter((building,index)=>!shared||index<7||building.playerId===playerId).map(building => {
    const node = document.createElement('button'); node.className = 'building-label' + (building.playerId === playerId ? ' own-label' : '');
    node.style.setProperty('--building-color', building.color);
    node.textContent = building.playerId === playerId ? `${building.name} · ${building.tower.layers.length} 层` : building.name;
    node.onclick = () => viewer.focusBuilding(building);
    $('building-labels').append(node); return { building, node };
  });
}
async function overview() {
  const navigation=navigationVersion;
  pauseGame();
  if(city instanceof SharedCityRepository)try{await city.refresh(pollAbort.signal);}catch(error){$('city-callout-note').textContent=sharedMessage(error);}
  if(disposed||navigation!==navigationVersion)return;
  if(personalSurface)viewer.setSolo(city.get(playerId)?.tower??emptyTower(),buildingColor);
  else{viewer.setCity(city.all());viewer.focusBuilding();}
  refreshCityUI();show('city');
}
async function submit() {
  if (!completed || submitting || disposed) return;
  const navigation=navigationVersion;
  submitting=true;($('submit-button') as HTMLButtonElement).disabled=true;
  try {
  frozenName ??= ($('signature') as HTMLInputElement).value;
  if(shared)($('signature') as HTMLInputElement).disabled=true;
  $('submit-note').textContent=shared?'正在共享，请稍等…':'正在入城…';
  const update = city instanceof SharedCityRepository ? await city.submit(playerId,frozenName,completed,completedTrace!) : city.submit(playerId,frozenName,completed);
  if(disposed)return;
  if (!update.building || update.kind==='invalid') throw new Error('No accepted building');
  activeServerRun=null;
  if(navigation!==navigationVersion)return;
  if(personalSurface)viewer.setSolo(update.building.tower,update.building.color);
  else{viewer.setCity(city.all(),update);viewer.focusBuilding();}
  refreshCityUI();show('city');
  const event = $('city-event'); event.replaceChildren();
  const title = document.createElement('strong'), note = document.createElement('span');
  title.textContent = update.kind === 'first' ? '你的楼，入城了！' : update.kind === 'best' ? '新最佳，原地长高！' : update.kind==='duplicate'?'这一局已经共享过':'最佳纪录保持不变';
  note.textContent = update.kind === 'first' ? `${update.building.name} · ${completed.tower.layers.length} 层` : update.kind === 'best' ? `从 ${update.previous!.tower.layers.length} 层，长到 ${update.building.tower.layers.length} 层` : `本局 ${completed.tower.layers.length} 层，主楼仍是 ${update.building.tower.layers.length} 层`;
  event.append(title, note); event.dataset.kind = update.kind; event.hidden = false; eventUntil = performance.now() + 6000;
  ($('submit-button') as HTMLButtonElement).disabled = true;
  }catch(error){if(!disposed){$('submit-note').textContent=sharedMessage(error)+' 本局尚未确认共享，可重试。';($('submit-button') as HTMLButtonElement).disabled=false;}}
  finally{submitting=false;}
}

$('start-button').onclick = start; $('replay-button').onclick = start;
$('city-play').onclick = () => { if (game?.phase === 'paused') { viewer.setSolo(game.tower,buildingColor);resumeGame();show('play');updateHUD(); } else void start(); };
$('home-button').onclick = () => { pauseGame(); viewer.setSolo(fixtureTower(10, 0, config.game.cutMode),buildingColor); show('intro'); };
$('overview-button').onclick = overview;
// A touch may finish the run before its click is dispatched. Consume that
// gesture's click even if the result buttons now occupy the same coordinates.
const gestureStart=(event:PointerEvent)=>{
  if(!event.isPrimary||event.button!==0)return;
  placementClickPending=view==='play'&&event.target instanceof Element&&
    (Boolean(event.target.closest('#drop-button'))||event.target===viewer.renderer.domElement);
};
const gestureClick=(event:MouseEvent)=>{
  if(placementClickPending&&event.detail>0){placementClickPending=false;event.preventDefault();event.stopPropagation();}
};
root.addEventListener('pointerdown',gestureStart,true);
root.addEventListener('click',gestureClick,true);
$('drop-button').addEventListener('pointerdown', event => { if (event.isPrimary && event.button === 0) { event.preventDefault(); place(); } });
viewer.renderer.domElement.addEventListener('pointerdown', event => { if (event.isPrimary && event.button === 0) place(); });
$('pause-button').onclick = () => { pauseGame(); updateHUD(); };
$('resume-button').onclick = () => { resumeGame(); updateHUD(); };
$('skip-sticker').onclick = () => { stickerSkipped = true; $('skip-sticker').textContent = '已跳过'; ($('skip-sticker') as HTMLButtonElement).disabled = true; };
$('submit-button').onclick = submit;
$('zoom-in').onclick = () => viewer.zoomCity(-0.12); $('zoom-out').onclick = () => viewer.zoomCity(0.12);
$('rotate-city').onclick = () => viewer.rotateCity(1); $('city-wide').onclick = () => viewer.focusBuilding();
$('find-building').onclick = () => viewer.focusBuilding(city.get(playerId));
const visibilityHandler=()=>{if(document.hidden){pauseGame();updateHUD();}else if(view==='city')void pollCity();};
document.addEventListener('visibilitychange', visibilityHandler);
const keyHandler=(event:KeyboardEvent)=>{
  if (event.code === 'Space' && !event.repeat && view === 'play' && !(event.target instanceof HTMLInputElement) && !($('settings-dialog') as HTMLDialogElement).open) { event.preventDefault(); place(); }
};
document.addEventListener('keydown',keyHandler);
const dialog = $('settings-dialog') as HTMLDialogElement;
$('settings-button').onclick = () => {
  pauseGame(); updateHUD();
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
  qaWindow.__SKYLINE_QA__ = { snapshot: () => JSON.parse(JSON.stringify({ view, surface:personalSurface?'personal':'city', config, playerId, game: game ? { phase: game.phase, activeAxis: game.activeAxis, movingPosition: game.movingPosition, movingLayer: game.movingLayer, elapsed: game.elapsed, tower: game.tower, perfectCount: game.perfectCount, combo: game.combo } : null, completed, own: city.get(playerId), rendered: personalSurface&&view==='city'?viewer.soloGeometry():viewer.cityGeometry(playerId), presentation: viewer.presentation(), cutting: viewer.cuttingPresentation(), stickerSkipped, logicalHeight: game ? towerHeight(game.tower) : null, drawCalls: viewer.renderer.info.render.calls })) };
}
const initialView: View = new URLSearchParams(location.search).get('view') === 'city' ? 'city' : 'intro';
show(initialView);
if (initialView === 'city'){refreshCityUI();if(personalSurface){viewer.setSolo(city.get(playerId)?.tower??emptyTower(),buildingColor);viewer.setView('result');}}
let previousTime = performance.now(), lastHUD = 0;
function frame(now: number) {
  const seconds = Math.max(0, (now - previousTime) / 1000); previousTime = now;
  if (view === 'play' && game) { clock?.sync(clockNow()); finish(); if (now - lastHUD > 90) { updateHUD(); lastHUD = now; } }
  viewer.update(seconds, game);
  if (view === 'city') for (const { building, node } of labelNodes) { const p = viewer.projectLabel(building); node.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`; node.hidden = !p.visible; }
  if (feedbackUntil && now > feedbackUntil) { $('placement-feedback').classList.remove('visible'); feedbackUntil = 0; }
  if (eventUntil && now > eventUntil) { $('city-event').hidden = true; eventUntil = 0; }
  if(!disposed)animationFrame=requestAnimationFrame(frame);
}
async function pollCity(){
  if(personalSurface||!(city instanceof SharedCityRepository)||pollBusy||disposed||view!=='city'||document.hidden)return;
  pollBusy=true;
  try{if(await city.refresh(pollAbort.signal)&&!disposed&&view==='city'){viewer.setCity(city.all());refreshCityUI();}}
  catch(error){if(!disposed&&!pollAbort.signal.aborted)$('city-callout-note').textContent=sharedMessage(error)+' 正在显示上次已共享的城市。';}
  finally{pollBusy=false;}
}
const pollTimer=setInterval(()=>void pollCity(),3000);
animationFrame=requestAnimationFrame(frame);
return()=>{disposed=true;cancelAnimationFrame(animationFrame);clearInterval(pollTimer);pollAbort.abort();
  root.removeEventListener('pointerdown',gestureStart,true);root.removeEventListener('click',gestureClick,true);
  document.removeEventListener('visibilitychange',visibilityHandler);document.removeEventListener('keydown',keyHandler);
  if(city instanceof SharedCityRepository)city.dispose();viewer.dispose();
  if(import.meta.env.DEV)delete(window as unknown as {__SKYLINE_QA__?:unknown}).__SKYLINE_QA__;
};
}

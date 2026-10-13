import { loadRuntimeConfig, parseRuntimeConfig, playtestConfig } from './config.ts';
import { GameSession } from './core/game.ts';
import type { CompletedRun } from './core/game.ts';
import { MemoryCityRepository,cleanName,randomBuildingName,type CityBuilding } from './core/city.ts';
import {waterfrontLayout,districtsFor,plotLocation} from './core/layout.ts';
import QRCode from 'qrcode';
import { temporaryId } from './core/session-id.ts';
import { fixtureTower, towerHeight, emptyTower } from './core/tower.ts';
import { SkylineRenderer } from './render.ts';
import type { View } from './render.ts';
import { mountUI } from './ui.ts';
import { RunClock } from './core/trace.ts';
import type { RunTrace } from './core/trace.ts';
import { SharedCityRepository, DisplayCityRepository,loadDisplay, SharedError, loadSession, startSharedRun, sharedMessage } from './shared/client.ts';
import type { SharedSession, SharedCityId,CitySnapshot,CityEvent } from './shared/protocol.ts';
import { requestJson } from './shared/client.ts';
import { PhotoEditor } from './ui/photo-editor.ts';
import type { PhotoDraft } from './core/photo.ts';
import { nextShanghaiMidnight } from './core/photo.ts';

export async function mountSkyline(root: HTMLElement, signal?: AbortSignal): Promise<() => void> {
const search = new URLSearchParams(location.search);
const displaySurface=search.get('mode')==='display';
const personalSurface=search.get('mode')!=='display'&&(matchMedia('(pointer: coarse)').matches||matchMedia('(max-width:760px)').matches);
let config = playtestConfig(await loadRuntimeConfig(), location.search);
const cityId: SharedCityId = search.get('city')==='test-mobile'?'test-mobile':search.get('city')==='test'?'test':'public';
let shared = displaySurface||search.get('mode') !== 'practice' && !search.has('cut');
let session: SharedSession | undefined, displaySnapshot:CitySnapshot|undefined, initialError = '';
if (shared) {
  try {if(displaySurface)displaySnapshot=await loadDisplay(cityId,signal);else{ session = await loadSession(cityId,signal,personalSurface?'own':'all'); if (!session.snapshot.writeOpen && search.get('mode') !== 'shared') shared=false; }}
  catch (error) { if (signal?.aborted) return () => {}; initialError=sharedMessage(error); if(!displaySurface)shared=false; }
}
if (signal?.aborted) return () => {};
if (shared && session) config={...config,game:{...session.rules},cityDisplayName:session.snapshot.name};
mountUI(root);
document.documentElement.dataset.surface=displaySurface?'display':personalSurface?'personal':'city';
const $ = <E extends HTMLElement = HTMLElement>(id: string) => root.querySelector('#'+id) as E;
const defaultLayout=waterfrontLayout(config.city.openDistricts,config.city.capacities);
const city = displaySurface?new DisplayCityRepository(displaySnapshot??{cityId,epoch:'pending',revision:0,name:config.cityDisplayName,isTest:cityId!=='public',writeOpen:false,capacity:0,buildings:[],layout:defaultLayout,scope:'all'}):shared && session ? new SharedCityRepository(session) : new MemoryCityRepository(true, config.game.cutMode);
const playerId = displaySurface?'':shared && session ? session.playerId : temporaryId();
const currentLayout=()=>city instanceof SharedCityRepository?city.snapshot.layout??defaultLayout:defaultLayout;
const rankOf=(building:CityBuilding|undefined)=>building&&'rank' in building?Number(building.rank):undefined;
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
let photoBusy=false;
let photoFeedback='';
let eventQueue:CityEvent[]=[],lastNotice=0,selectedId:string|undefined;
let recentEvents:CityEvent[]=city instanceof SharedCityRepository?(city.snapshot.events??[]).slice(-6):[];
let lastSync=Date.now(),connectionError=!!initialError;
let labelNodes: Array<{ building: ReturnType<typeof city.all>[number]; node: HTMLButtonElement }> = [];
let sceneryNodes:Array<{label:ReturnType<SkylineRenderer['sceneryLabels']>[number];node:HTMLSpanElement}>=[];
let viewer: SkylineRenderer;

try { viewer = new SkylineRenderer($('viewport'), config,currentLayout(),!personalSurface,displaySurface); }
catch {
  root.innerHTML = '<div class="compatibility-message"><h1>还差一点，就能看到天际线。</h1><p>当前浏览器无法启动 3D 画面，请尝试新版 Safari 或 Chrome，并启用图形加速。</p></div>';
  throw new Error('WebGL2 renderer unavailable');
}
viewer.setSolo(fixtureTower(10, 0, config.game.cutMode),buildingColor);
const photoEditor=new PhotoEditor(root,(photo,context)=>{
  if(context==='result'&&(view!=='result'||!completed)){photoEditor.clear();return;}
  stickerSkipped=false;($('skip-sticker') as HTMLButtonElement).disabled=false;
  $('skip-sticker').textContent='跳过';
  if(context==='result'&&completed){viewer.setSolo(completed.tower,buildingColor,photo.preview);photoNote('已预览，提交入城后保存。');}
  else{const own=city.get(playerId);if(own){viewer.setSolo(own.tower,own.color,photo.preview,rankOf(own));void saveSelectedPhoto();}}
},photoNote);
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
$('board-title').textContent=shared?'高楼榜':'模拟高楼榜';
$('city-disclosure').textContent=shared?'署名、成绩与楼体公开展示。只在新最佳时更新主楼。':'这里是视觉模拟。刷新会重置，不是共享城市或真实排名。';
$('submit-button').firstChild!.textContent=shared?'共享入城 ':'模拟入城 ';
if(initialError)$('intro-direction').textContent=initialError+(displaySurface?'':' 当前进入练习。');
if(displaySurface){for(const id of ['home-button','overview-button','settings-button','city-play','own-photo-actions','practice-link','shared-link'])$(id).hidden=true;
  $('prototype-badge').textContent='今日城市';$('city-callout-title').textContent='每一栋小楼，都是今天的新风景';$('city-callout-note').textContent='拖动环绕 · 滚轮放大 · 手动查看后自动恢复巡游';}
const mobileEntry=new URL('/',location.origin);($('entry-link') as HTMLAnchorElement).href=mobileEntry.href;($('entry-link')).textContent=mobileEntry.host;
$('entry-link').hidden=displaySurface;
void QRCode.toCanvas($<HTMLCanvasElement>('entry-qr'),mobileEntry.href,{width:240,margin:4,errorCorrectionLevel:'M',color:{dark:'#213e54',light:'#ffffff'}}).then(()=>{if(!disposed)$('qr-note').textContent='手机相机扫码参与 · 每日 00:00 重置';}).catch(()=>{if(!disposed)$('qr-note').textContent=displaySurface?'二维码暂未生成，请刷新重试':'二维码暂未生成，可点击入口链接';});

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
  $('overview-button').hidden = displaySurface||next === 'city';
  $('footer-status').textContent = `${modeName()} · ${shared?(cityId!=='public'?'共享测试数据':'同浏览器匿名身份 · 真实共享'):next === 'city'?'模拟数据，刷新会重置城市':'城市使用模拟数据'}`;
}
async function start() {
  if(displaySurface||starting||submitting||photoBusy||disposed)return;
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
    ($('signature') as HTMLInputElement).value=city.get(playerId)?.name??randomBuildingName(playerId);
  photoEditor.clear();photoNote('贴在楼的正面，留下你的颜色');
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
  const own=city.get(playerId),canEdit=count>0&&(!own||count>own.tower.layers.length);
  ($('signature') as HTMLInputElement).value=own?.name??randomBuildingName(playerId);
  ($('signature') as HTMLInputElement).disabled=!canEdit;$('choose-sticker').parentElement!.hidden=!canEdit;
  $('result-floors').textContent = String(count);
  $('end-caption').textContent = completed.reason === 'time' ? '时间到，作品完成' : '这一局，收好你的作品';
  $('performance-summary').textContent = `Perfect ${completed.perfectCount} 次 · 最长 ${completed.longestCombo} 连击`;
  ($('submit-button') as HTMLButtonElement).disabled = count === 0;
  $('submit-note').textContent = count === 0 ? '先成功盖一层，再把小楼放进城市。' : shared?'提交后，署名、成绩与楼体将公开展示。本局需在开局后10分钟内提交。':'城市使用模拟数据，仅保留在本页。';
  viewer.setSolo(completed.tower,buildingColor,city.get(playerId)?.photo); show('result');
}
function refreshCityUI() {
  if(city instanceof SharedCityRepository)$('city-name').textContent=city.snapshot.name;
  const buildings = city.all(), own = city.get(playerId);
  $('own-photo-actions').hidden=!own;
  $('remove-own-photo').hidden=!own?.photo||own.photo.expiresAt<=Date.now();
  $('retry-photo').hidden=!photoEditor.selected;
  ($('edit-own-photo') as HTMLButtonElement).disabled=photoBusy;
  $('photo-own-note').textContent=photoFeedback||'照片即时公开，午夜和城市一起重置';
  if(personalSurface){
    $('personal-summary').hidden=false;
    $('personal-floors').textContent=String(own?.tower.layers.length??0);
    $('personal-name').textContent=own?.name??'还没有保存的作品';
    const p=own?plotLocation(own.plotId,currentLayout()):undefined;
    $('personal-note').textContent=own?`${p?.districtName??'今日街区'} · 地块 ${own.plotId+1}；新最佳在大屏原地更新。`:'先盖一局，把自己的楼留在天际线。';
    $('city-callout-title').textContent=own?'看看你的最高作品。':'先盖出属于你的小楼。';
    $('city-callout-note').textContent=shared?'署名、成绩与楼体会在大屏城市公开展示。':'这是本页模拟，刷新后重置。';
    $('city-play').textContent=game?.phase==='paused'?'继续盖楼 →':own?'再盖一局 →':'开始盖楼 →';
    labelNodes=[];sceneryNodes=[];return;
  }
  $('city-count').textContent = shared?`${buildings.length} 栋${cityId!=='public'?'共享测试':'玩家'}建筑`:`12 栋样例建筑${own ? ' + 你的本页作品' : ''}`;
  const ranking = $('city-ranking'); ranking.replaceChildren();
  buildings.slice(0, 10).forEach((building, index) => {
    const item = document.createElement('li'), button = document.createElement('button');
    if (building.playerId === playerId) item.className = 'mine';
    const order = document.createElement('span'); order.className = 'rank-number'; order.textContent = String('rank' in building ? building.rank : index + 1).padStart(2, '0');
    const dot = document.createElement('span'); dot.className = 'color-dot'; dot.style.backgroundColor = building.color;
    const name = document.createElement('span'); name.className = 'rank-name'; name.textContent = building.name;
    const score = document.createElement('strong'); score.textContent = `${building.tower.layers.length} 层`;
    button.append(order, dot, name, score); button.onclick = () => focusCurrent(building.playerId);
    item.append(button); ranking.append(item);
  });
  const personal = $('personal-building'); personal.hidden = !own;
  if (own) { personal.textContent = `我的楼 · ${own.name} · 最佳 ${own.tower.layers.length} 层${'rank' in own?' · 第'+own.rank+'名':''}`; personal.onclick = () => focusCurrent(own.playerId); }
  $('find-building').hidden = !own;
  $('city-callout-title').textContent = own ? `${own.name}，还可以再长高一点。` : '让这座城市，多一栋你的楼。';
  const nextTarget=own?buildings.filter(b=>b.tower.layers.length>own.tower.layers.length).at(-1):undefined;
  $('city-callout-note').textContent = own ? nextTarget?`再盖到 ${nextTarget.tower.layers.length+1} 层，超过下一档目标`:`个人最佳 ${own.tower.layers.length} 层 · 地块和颜色保持不变` : '先玩一局，再为作品署名。';
  $('city-play').textContent = game?.phase === 'paused' ? '继续盖楼 →' : own ? '再盖一局 →' : '开始盖楼 →';
  if(displaySurface){$('city-play').hidden=true;$('own-photo-actions').hidden=true;$('city-callout-title').textContent=connectionError?'正在重新连接今日城市':buildings.length?'一起盖出的今日天际线':'城市刚刚醒来，等待第一栋楼';$('city-callout-note').textContent='拖动环绕 · 滚轮放大 · 点击排行找楼';}
  refreshLabels();refreshFeed();
  const select=$<HTMLSelectElement>('district-select'),value=select.value;select.replaceChildren();select.add(new Option('城市全景','0'));for(const d of districtsFor(currentLayout()))select.add(new Option(d.name,String(d.id)));select.value=value||'0';
}
function focusCurrent(id:string){const building=city.get(id);if(!building)return;selectedId=id;viewer.focusBuilding(building);const p=plotLocation(building.plotId,currentLayout());$('search-note').textContent=`${building.name} · ${building.tower.layers.length} 层 · ${p?.districtName??''} · 地块 ${building.plotId+1}`;refreshLabels();}
function refreshLabels(){
  $('building-labels').replaceChildren();
  const buildings=city.all();
  labelNodes = buildings.map(building => {
    const node = document.createElement('button'); node.className = 'building-label' + (building.playerId === playerId ? ' own-label' : '');
    node.style.setProperty('--building-color', building.color);
    node.textContent=building.name;
    node.dataset.playerId=building.playerId;
    if(building.rank&&building.rank<=3){node.dataset.rank=String(building.rank);node.textContent=`TOP${building.rank} · ${building.name}`;}
    node.classList.toggle('selected-label',building.playerId===selectedId);
    node.title=`${building.name} · ${building.tower.layers.length} 层`;
    node.onclick = () => focusCurrent(building.playerId);
    $('building-labels').append(node); return { building, node };
  });
  sceneryNodes=viewer.sceneryLabels().map(label=>{
    const node=document.createElement('span');node.className='building-label scenery-label';node.textContent=label.name;
    node.title='公共景观 · 不计成绩';$('building-labels').append(node);return {label,node};
  });
}
function refreshFeed(){
  const feed=$('event-feed');feed.replaceChildren();for(const event of [...recentEvents].reverse().slice(0,6)){const item=document.createElement('li'),button=document.createElement('button');button.textContent=`${event.globalRecord?'全城新纪录':event.kind==='first'?'首次入城':'个人新高'} · ${event.name} · ${event.floors} 层`;const time=document.createElement('small');time.textContent=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(event.createdAt);button.append(time);button.onclick=()=>focusCurrent(event.playerId);item.append(button);feed.append(item);}
  if(!recentEvents.length){const item=document.createElement('li');item.textContent=shared?'今天还没有入城动态':'模拟数据 · 练习不发布动态';feed.append(item);}
  $('connection-status').textContent=connectionError?'连接暂时中断，自动重试；保留上次有效城市':`已更新 ${new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(lastSync)} · 每 3 秒同步`;
}
function collectEvents(){if(!(city instanceof SharedCityRepository))return;if(city.snapshot.eventGap){eventQueue=[];recentEvents=(city.snapshot.events??[]).slice(-6);}const events=city.takeEvents();
  for(const event of events){const building=city.get(event.playerId);if(building?.bestRunId===event.runId)viewer.animateCityBuilding(building.playerId,event.previousFloors);recentEvents=[...recentEvents.filter(e=>e.id!==event.id),event].slice(-6);eventQueue=eventQueue.filter(e=>e.playerId!==event.playerId);eventQueue.push(event);}
  eventQueue=eventQueue.slice(-20).sort((a,b)=>Number(b.globalRecord)-Number(a.globalRecord)||a.id-b.id);refreshFeed();}
function playNotice(now:number){
  if(!eventQueue.length||now-lastNotice<4500||view!=='city'||personalSurface)return;
  const event=eventQueue.shift()!,building=city.get(event.playerId);
  if(!(city instanceof SharedCityRepository)||event.epoch!==city.snapshot.epoch||!building||building.bestRunId!==event.runId)return;
  viewer.highlightBuilding(building.playerId);
  if(event.globalRecord)viewer.recordNotice(building);
  const box=$('city-event');box.replaceChildren();const title=document.createElement('strong'),note=document.createElement('span');title.textContent=event.globalRecord?'全城新纪录！':event.kind==='first'?'新邻居，欢迎入城！':'个人新高，原地长高！';note.textContent=`${event.name} · ${event.kind==='best'?event.previousFloors+' → ':''}${event.floors} 层`;box.append(title,note);box.hidden=false;box.dataset.kind=event.kind;eventUntil=now+4200;lastNotice=now;
}
async function overview() {
  const navigation=navigationVersion;
  pauseGame();
  if(city instanceof SharedCityRepository)try{await city.refresh(pollAbort.signal);}catch(error){$('city-callout-note').textContent=sharedMessage(error);}
  if(disposed||navigation!==navigationVersion)return;
  if(personalSurface)viewer.setSolo(city.get(playerId)?.tower??emptyTower(),buildingColor,city.get(playerId)?.photo,rankOf(city.get(playerId)));
  else{viewer.setCity(city.all());viewer.focusBuilding();}
  refreshCityUI();show('city');
}
async function submit() {
  if (!completed || submitting || disposed) return;
  const navigation=navigationVersion;
  submitting=true;($('submit-button') as HTMLButtonElement).disabled=true;
  try {
  frozenName ??= cleanName(($('signature') as HTMLInputElement).value,city.get(playerId)?.name??randomBuildingName(playerId));
  if(shared)($('signature') as HTMLInputElement).disabled=true;
  $('submit-note').textContent=shared?'正在共享，请稍等…':'正在入城…';
  const update = city instanceof SharedCityRepository ? await city.submit(playerId,frozenName,completed,completedTrace!) : city.submit(playerId,frozenName,completed);
  if(disposed)return;
  if (!update.building || update.kind==='invalid') throw new Error('No accepted building');
  activeServerRun=null;
  if(navigation!==navigationVersion)return;
  if(personalSurface)viewer.setSolo(update.building.tower,update.building.color,update.building.photo,rankOf(update.building));
  else{viewer.setCity(city.all(),update);viewer.focusBuilding();}
  refreshCityUI();show('city');
  const event = $('city-event'); event.replaceChildren();
  const title = document.createElement('strong'), note = document.createElement('span');
  title.textContent = update.kind === 'first' ? '你的楼，入城了！' : update.kind === 'best' ? '新最佳，原地长高！' : update.kind==='duplicate'?'这一局已经共享过':'最佳纪录保持不变';
  note.textContent = update.kind === 'first' ? `${update.building.name} · ${completed.tower.layers.length} 层` : update.kind === 'best' ? `从 ${update.previous!.tower.layers.length} 层，长到 ${update.building.tower.layers.length} 层` : `本局 ${completed.tower.layers.length} 层，主楼仍是 ${update.building.tower.layers.length} 层`;
  event.append(title, note); event.dataset.kind = update.kind; event.hidden = false; eventUntil = performance.now() + 6000;
  if(photoEditor.selected){
    if(update.kind==='first'||update.kind==='best'||update.building.bestRunId===completed.runId)await saveSelectedPhoto();
    else photoNote('纪录保持不变；可点“重试保存照片”，明确把新贴纸用于最佳楼。');
  }
  ($('submit-button') as HTMLButtonElement).disabled = true;
  }catch(error){if(!disposed){$('submit-note').textContent=sharedMessage(error)+' 本局尚未确认共享，可重试。';($('submit-button') as HTMLButtonElement).disabled=false;}}
  finally{submitting=false;}
}

function photoNote(message:string){photoFeedback=message;$('sticker-hint').textContent=message;$('photo-own-note').textContent=message;}
function photoControls(busy:boolean){photoBusy=busy;for(const id of ['choose-sticker','edit-own-photo','retry-photo','remove-own-photo','replay-button','city-play'])($<HTMLButtonElement>(id)).disabled=busy;}
function paintOwnPhoto(){const own=city.get(playerId);if(!own)return;if(personalSurface)viewer.setSolo(own.tower,own.color,own.photo,rankOf(own));else viewer.setCity(city.all());refreshCityUI();}
async function saveSelectedPhoto(){
  const selected=photoEditor.selected,own=city.get(playerId);if(!selected||!own||photoBusy||disposed)return;
  const navigation=navigationVersion;
  photoControls(true);photoNote('成绩已保存，正在保存照片…');
  try{
    if(city instanceof SharedCityRepository){
      if(!city.snapshot.photoWriteOpen)throw new SharedError('photos_closed');
      const scope='&scope='+city.scope;
      if(!selected.draftId){
        const response=await fetch('/api/photos/draft?city='+cityId+'&uploadKey='+selected.uploadKey,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'image/jpeg'},body:selected.blob,signal:AbortSignal.timeout(20_000)});
        const value=await response.json() as PhotoDraft&{error?:string};if(!response.ok)throw new SharedError(value.error??'photo_service_unavailable');selected.draftId=value.id;
      }
      const saved=await requestJson<{snapshot:import('./shared/protocol.ts').CitySnapshot}>('/api/photos/save?city='+cityId+scope,{id:selected.draftId,version:own.appearanceVersion??0});
      if(disposed)return;city.apply(saved.snapshot);
    }else Object.assign(own,{photo:selected.preview,appearanceVersion:(own.appearanceVersion??0)+1});
    photoEditor.clear();photoNote(shared?'照片已公开，今天午夜和城市一起重置。':'练习贴纸只在本页预览，刷新或午夜清空。');if(view==='city'&&navigation===navigationVersion)paintOwnPhoto();
  }catch(error){if(!disposed){photoNote(sharedMessage(error)+' 成绩已保存，可重试照片或继续玩。');$('retry-photo').hidden=false;}}
  finally{if(!disposed)photoControls(false);}
}
async function removePhoto(){
  const own=city.get(playerId);if(!own||photoBusy)return;photoControls(true);
  try{
    if(city instanceof SharedCityRepository){const saved=await requestJson<{snapshot:import('./shared/protocol.ts').CitySnapshot}>('/api/photos/remove?city='+cityId+'&scope='+city.scope,{version:own.appearanceVersion??0});if(disposed)return;city.apply(saved.snapshot);}
    else Object.assign(own,{photo:null,appearanceVersion:(own.appearanceVersion??0)+1});
    photoEditor.clear();photoNote('照片已撤回，楼体与成绩保留。');paintOwnPhoto();
  }catch(error){if(!disposed)photoNote(sharedMessage(error));}finally{if(!disposed)photoControls(false);}
}

$('start-button').onclick = start; $('replay-button').onclick = start;
$('city-play').onclick = () => { if (game?.phase === 'paused') { viewer.setSolo(game.tower,buildingColor);resumeGame();show('play');updateHUD(); } else void start(); };
$('home-button').onclick = () => {if(displaySurface)return; pauseGame(); viewer.setSolo(fixtureTower(10, 0, config.game.cutMode),buildingColor); show('intro'); };
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
$('choose-sticker').onclick=()=>photoEditor.choose('result',shared);
$('edit-own-photo').onclick=()=>photoEditor.choose('own',shared);
$('retry-photo').onclick=()=>void saveSelectedPhoto();
$('remove-own-photo').onclick=()=>void removePhoto();
$('skip-sticker').onclick = () => { photoEditor.clear();if(completed)viewer.setSolo(completed.tower,buildingColor,city.get(playerId)?.photo);photoNote('已跳过，本次不更换照片。');stickerSkipped = true; $('skip-sticker').textContent = '已跳过'; ($('skip-sticker') as HTMLButtonElement).disabled = true; };
$('submit-button').onclick = submit;
$('zoom-in').onclick = () => viewer.zoomCity(-0.12); $('zoom-out').onclick = () => viewer.zoomCity(0.12);
$('rotate-city').onclick = () => viewer.rotateCity(1); $('city-wide').onclick = () => viewer.focusBuilding();
$('find-building').onclick = () => viewer.focusBuilding(city.get(playerId));
$('tour-toggle').onclick=()=>{$('tour-toggle').textContent=viewer.toggleTour()?'恢复巡游':'暂停巡游';};
$('district-select').onchange=()=>{selectedId=undefined;viewer.focusDistrict(Number($<HTMLSelectElement>('district-select').value));refreshLabels();};
$('building-search').onsubmit=event=>{event.preventDefault();const query=$<HTMLInputElement>('building-query').value.trim();if(!query)return;const b=city.all().find(b=>b.name.includes(query)||String(b.plotId+1)===query);if(b){focusCurrent(b.playerId);return;}const d=districtsFor(currentLayout()).find(d=>d.name.includes(query)||`区${d.id}`===query);if(d){viewer.focusDistrict(d.id);$('search-note').textContent=d.name;return;}$('search-note').textContent='暂未找到，试试楼名或地块号。';};
const visibilityHandler=()=>{if(document.hidden){pauseGame();updateHUD();eventQueue=[];if(city instanceof SharedCityRepository)city.silenceNextEvents();}else if(view==='city')void pollCity();};
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
const initialView: View = displaySurface||new URLSearchParams(location.search).get('view') === 'city' ? 'city' : 'intro';
show(initialView);
if (initialView === 'city'){refreshCityUI();if(personalSurface){viewer.setSolo(city.get(playerId)?.tower??emptyTower(),buildingColor,city.get(playerId)?.photo,rankOf(city.get(playerId)));viewer.setView('result');}}
let previousTime = performance.now(), lastHUD = 0;
function frame(now: number) {
  const seconds = Math.max(0, (now - previousTime) / 1000); previousTime = now;
  if (view === 'play' && game) { clock?.sync(clockNow()); finish(); if (now - lastHUD > 90) { updateHUD(); lastHUD = now; } }
  viewer.update(seconds, game);
  if(view==='city'&&!personalSurface){playNotice(now);const tour=viewer.tourStatus();$('tour-status').textContent=tour.paused?'巡游已暂停':tour.automatic?`自动巡游 · ${tour.label}`:'手动查看 · 空闲后恢复巡游';if(tour.selectedId!==selectedId){selectedId=tour.selectedId;refreshLabels();}}
  if (view === 'city') for (const { building, node } of labelNodes) { const p = viewer.projectLabel(building); node.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`; node.hidden = !p.visible; }
  if(view==='city')for(const {label,node} of sceneryNodes){const p=viewer.projectSceneryLabel(label);node.style.transform=`translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;node.hidden=!p.visible;}
  if (feedbackUntil && now > feedbackUntil) { $('placement-feedback').classList.remove('visible'); feedbackUntil = 0; }
  if (eventUntil && now > eventUntil) { $('city-event').hidden = true; eventUntil = 0; }
  if(!disposed)animationFrame=requestAnimationFrame(frame);
}
async function pollCity(){
  if(personalSurface||!(city instanceof SharedCityRepository)||pollBusy||disposed||resettingDay||view!=='city'||document.hidden)return;
  pollBusy=true;
  try{const changed=await city.refresh(pollAbort.signal);if(!disposed&&!resettingDay&&view==='city'){connectionError=false;lastSync=Date.now();if(changed){viewer.setCity(city.all(),undefined,currentLayout());refreshCityUI();}collectEvents();}}
  catch(error){if(error instanceof SharedError&&error.code==='city_reset'){eventQueue=[];recentEvents=[];viewer.setCity([]);location.reload();return;}if(!disposed&&!pollAbort.signal.aborted){connectionError=true;eventQueue=[];city.silenceNextEvents();refreshFeed();$('city-callout-note').textContent=sharedMessage(error)+' 正在显示上次已共享的城市。';}}
  finally{pollBusy=false;}
}
const pollTimer=setInterval(()=>void pollCity(),3000);
const resetAt=session?.snapshot.resetAt??displaySnapshot?.resetAt??nextShanghaiMidnight();let resettingDay=false;
const resetTimer=setInterval(()=>{if(Date.now()<resetAt||resettingDay)return;resettingDay=true;pauseGame();navigationVersion++;eventQueue=[];recentEvents=[];selectedId=undefined;viewer.setCity([]);viewer.setSolo(emptyTower(),buildingColor);photoEditor.clear();labelNodes=[];$('event-feed').replaceChildren();$('search-note').textContent='';$('building-labels').replaceChildren();$('city-ranking').replaceChildren();$('city-count').textContent='新的一天，城市重新开始';$('personal-floors').textContent='0';$('personal-name').textContent='新的一天，再盖一栋新的楼';$('own-photo-actions').hidden=true;$('city-event').hidden=true;void fetch('/api/game/reset-due',{cache:'no-store',signal:AbortSignal.timeout(10_000)}).catch(()=>{}).finally(()=>location.reload());},500);
animationFrame=requestAnimationFrame(frame);
return()=>{disposed=true;cancelAnimationFrame(animationFrame);clearInterval(pollTimer);clearInterval(resetTimer);pollAbort.abort();photoEditor.dispose();
  root.removeEventListener('pointerdown',gestureStart,true);root.removeEventListener('click',gestureClick,true);
  document.removeEventListener('visibilitychange',visibilityHandler);document.removeEventListener('keydown',keyHandler);
  if(city instanceof SharedCityRepository)city.dispose();viewer.dispose();
  if(import.meta.env.DEV)delete(window as unknown as {__SKYLINE_QA__?:unknown}).__SKYLINE_QA__;
};
}

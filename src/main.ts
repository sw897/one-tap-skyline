import { loadRuntimeConfig, parseRuntimeConfig, playtestConfig } from './config.ts';
import { GameSession } from './core/game.ts';
import type { CompletedRun } from './core/game.ts';
import { MemoryCityRepository,cleanName,randomBuildingName,PALETTE,type CityBuilding } from './core/city.ts';
import {FullCityRepository,isFullCityPreview} from './core/full-city.ts';
import {waterfrontLayout,districtsFor,plotLocation,layoutCapacity} from './core/layout.ts';
import QRCode from 'qrcode';
import {RELEASE_ID} from './release.ts';
import {mobileEntryUrl} from './shared/entry.ts';
import {ReleaseUpdate} from './ui/release-update.ts';
import { temporaryId } from './core/session-id.ts';
import { fixtureTower, towerHeight, emptyTower } from './core/tower.ts';
import { SkylineRenderer } from './render.ts';
import type { View } from './render.ts';
import { mountUI, mountSharedUnavailable } from './ui.ts';
import { RunClock } from './core/trace.ts';
import type { RunTrace } from './core/trace.ts';
import { SharedCityRepository, DisplayCityRepository,loadDisplay, SharedError, loadSession, startSharedRun, sharedMessage } from './shared/client.ts';
import type { SharedSession, SharedCityId,CitySnapshot,CityEvent } from './shared/protocol.ts';
import { requestJson } from './shared/client.ts';
import { PhotoEditor } from './ui/photo-editor.ts';
import {GameAudio,landingHaptic} from './ui/game-audio.ts';
import {CityLabels} from './ui/city-labels.ts';
import {NoticeQueue} from './core/presentation.ts';
import type { PhotoDraft } from './core/photo.ts';
import { nextShanghaiMidnight } from './core/photo.ts';

export async function mountSkyline(root: HTMLElement, signal?: AbortSignal): Promise<() => void> {
const search = new URLSearchParams(location.search);
const displaySurface=search.get('mode')==='display';
const fullCityPreview=isFullCityPreview(search);
const personalSurface=search.get('mode')!=='display';
let config = playtestConfig(await loadRuntimeConfig(), location.search);
const cityId: SharedCityId = search.get('city')==='test-mobile'?'test-mobile':search.get('city')==='test'?'test':'public';
const shared = !fullCityPreview&&(displaySurface||search.get('mode') === 'shared'||search.get('mode') !== 'practice' && !search.has('cut'));
let session: SharedSession | undefined, displaySnapshot:CitySnapshot|undefined, initialError = '';
if (shared) {
  try {if(displaySurface)displaySnapshot=await loadDisplay(cityId,signal);else{ session = await loadSession(cityId,signal,personalSurface?'own':'all',search.get('entry')??undefined); if (!session.snapshot.writeOpen) throw new SharedError('city_write_closed'); }}
  catch (error) { if (signal?.aborted) return () => {}; initialError=sharedMessage(error); if(!displaySurface) return mountSharedUnavailable(root,initialError); }
}
if (signal?.aborted) return () => {};
if (shared && session) config={...config,game:{...session.rules},cityDisplayName:session.snapshot.name};
mountUI(root);
document.documentElement.dataset.surface=displaySurface?'display':personalSurface?'personal':'city';
const $ = <E extends HTMLElement = HTMLElement>(id: string) => root.querySelector('#'+id) as E;
const defaultLayout=waterfrontLayout(config.city.openDistricts,config.city.capacities);
const city = fullCityPreview?new FullCityRepository(defaultLayout,config.game.cutMode):displaySurface?new DisplayCityRepository(displaySnapshot??{cityId,epoch:'pending',revision:0,name:config.cityDisplayName,isTest:cityId!=='public',writeOpen:false,capacity:0,buildings:[],layout:defaultLayout,scope:'all'}):shared && session ? new SharedCityRepository(session) : new MemoryCityRepository(true, config.game.cutMode);
const playerId = displaySurface?'':shared && session ? session.playerId : temporaryId();
const currentLayout=()=>city instanceof SharedCityRepository?city.snapshot.layout??defaultLayout:defaultLayout;
const rankOf=(building:CityBuilding|undefined)=>building&&'rank' in building?Number(building.rank):undefined;
let buildingColor=shared&&session?city.get(playerId)?.color??session.color:'#75aaff';
let selectedColor=buildingColor,frozenColor:string|undefined;
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
const noticeQueue=new NoticeQueue();let activeNotice:CityEvent|undefined,selectedId:string|undefined;
let tierUntil=0,resultIds:string[]=[];
let recentEvents:CityEvent[]=city instanceof SharedCityRepository?(city.snapshot.events??[]).slice(-6):[];
let lastSync=Date.now(),connectionError=!!initialError;
let sceneryNodes:Array<{label:ReturnType<SkylineRenderer['sceneryLabels']>[number];node:HTMLSpanElement}>=[];
let viewer: SkylineRenderer;

try { viewer = new SkylineRenderer($('viewport'), config,currentLayout(),!personalSurface,displaySurface); }
catch {
  root.innerHTML = '<div class="compatibility-message"><h1>还差一点，就能看到天际线。</h1><p>当前浏览器无法启动 3D 画面，请尝试新版 Safari 或 Chrome，并启用图形加速。</p></div>';
  throw new Error('WebGL2 renderer unavailable');
}
const audio=new GameAudio();
const labels=new CityLabels($('building-labels'),focusCurrent);
const soundUI=()=>{$('sound-toggle').textContent=audio.muted?'音效 关':'音效 开';$('sound-toggle').setAttribute('aria-pressed',String(audio.muted));$('sound-toggle').setAttribute('aria-label',audio.muted?'开启音效':'关闭音效');};
soundUI();$('sound-toggle').onclick=()=>{audio.toggle();soundUI();};$('sound-toggle').hidden=displaySurface;
$('sound-preview').hidden=displaySurface;$('sound-preview').onclick=()=>audio.preview();
viewer.setSolo(fixtureTower(10, 0, config.game.cutMode),buildingColor);
const photoEditor=new PhotoEditor(root,(photo,context)=>{
  if(context==='result'&&(view!=='result'||!completed)){photoEditor.clear();return;}
  stickerSkipped=false;($('skip-sticker') as HTMLButtonElement).disabled=false;
  $('skip-sticker').textContent='跳过';
  if(context==='result'&&completed){viewer.setSolo(completed.tower,selectedColor,photo.preview);photoNote('已预览，提交入城后保存。');}
  else{const own=city.get(playerId);if(own){viewer.setSolo(own.tower,own.color,photo.preview,rankOf(own));void saveSelectedPhoto();}}
},photoNote);
if(!personalSurface)viewer.setCity(city.all());
$('city-name').textContent = config.cityDisplayName;
$('intro-direction').textContent = config.game.cutMode === 'alternate-xz' ? '楼层左右、前后交替移动 · 单指点击落层' : '楼层沿固定方向移动 · 单指点击落层';
const modeName = () => (game?.config ?? config.game).cutMode === 'alternate-xz' ? '逐层换向' : '固定方向';
const clockNow = () => Math.max(0,Math.round((performance.now()-origin)*1000));
const colorNames=['海蓝','薄荷','珊瑚','暮紫','樱粉','暖金'];
const colorButtons=PALETTE.map((color,index)=>{
  const button=document.createElement('button');button.type='button';button.className='color-choice';button.setAttribute('aria-label',colorNames[index]);button.title=colorNames[index];button.style.setProperty('--chosen-color',color);
  button.onclick=()=>{if(!completed||view!=='result'||button.disabled)return;selectedColor=color;updateColorChoices();viewer.setSolo(completed.tower,selectedColor,photoEditor.selected?.preview??city.get(playerId)?.photo);};
  $('color-options').append(button);return button;
});
function updateColorChoices(){
  const own=city.get(playerId),canEdit=!!completed&&completed.tower.layers.length>0&&(!own||completed.tower.layers.length>own.tower.layers.length);
  $('building-colors').hidden=!canEdit;
  colorButtons.forEach((button,index)=>{button.setAttribute('aria-pressed',String(PALETTE[index]===selectedColor));button.disabled=!canEdit||submitting||frozenColor!==undefined;});
}
const pauseGame = () => { audio.stop();if (clock && game?.phase !== 'ended') clock.pause(clockNow()); };
const resumeGame = () => { audio.unlock();if (clock) clock.resume(clockNow()); };
$('prototype-badge').textContent=shared?'共享试玩':'练习 · 本页模拟';
$('overview-button').firstChild!.textContent=personalSurface?'我的楼 ':'城市总览 ';
$('scene-data-mark').hidden=!(fullCityPreview||shared&&cityId!=='public');
if(fullCityPreview)$('scene-data-mark').textContent='模拟数据 · 全地块预览';
$('settings-button').hidden=shared;
$('mode-links').hidden=shared;
$('shared-link').hidden=shared;
($('shared-link') as HTMLAnchorElement).href='/?mode=shared';
$('data-badge').textContent=shared?(cityId!=='public'?'共享测试数据':'真实共享城市'):'模拟数据 · 本页城市';
if(fullCityPreview)$('data-badge').textContent='模拟数据 · 全地块预览';
$('board-title').textContent=shared?'排行榜':'模拟排行榜';
$('city-disclosure').textContent=shared?'署名、成绩与楼体公开展示。只在新最佳时更新主楼。':'这里是视觉模拟。刷新会重置，不是共享城市或真实排名。';
$('submit-button').firstChild!.textContent=shared?'共享入城 ':'模拟入城 ';
if(initialError)$('intro-direction').textContent=initialError;
if(displaySurface){for(const id of ['home-button','overview-button','settings-button','city-play','own-photo-actions','mode-links','shared-link'])$(id).hidden=true;
  $('prototype-badge').textContent=fullCityPreview?'满城模拟':'今日城市';$('city-callout-title').textContent='每一栋小楼，都是今天的新风景';$('city-callout-note').textContent='拖动环绕 · 滚轮放大 · 手动查看后自动恢复巡游';}
if(fullCityPreview||cityId!=='public')root.querySelector<HTMLElement>('.city-qr')!.hidden=true;
root.dataset.release=RELEASE_ID;
let qrUrl='',qrGeneration=0;
$('entry-link').hidden=displaySurface;
$('entry-qr').hidden=true;
const updates=shared?new ReleaseUpdate(root,cityId,()=>({starting,submitting,photoBusy,playing:!!game&&game.phase!=='ended',unsaved:!!completed&&!!activeServerRun,photoPending:!!photoEditor.selected||($('photo-dialog') as HTMLDialogElement).open}),info=>{
  const mobileEntry=mobileEntryUrl(location.origin,info,cityId);if(qrUrl===mobileEntry.href)return;
  qrUrl=mobileEntry.href;const generation=++qrGeneration;
  ($('entry-link') as HTMLAnchorElement).href=mobileEntry.href;$('entry-link').textContent=mobileEntry.host;
  const qrCanvas=document.createElement('canvas');
  void QRCode.toCanvas(qrCanvas,mobileEntry.href,{width:240,margin:4,errorCorrectionLevel:'M',color:{dark:'#213e54',light:'#ffffff'}}).then(()=>{if(!disposed&&generation===qrGeneration){const target=$<HTMLCanvasElement>('entry-qr');target.width=qrCanvas.width;target.height=qrCanvas.height;target.getContext('2d')!.drawImage(qrCanvas,0,0);$('entry-qr').hidden=false;$('qr-note').textContent='手机扫码参与 · 每日 00:00 更新';}}).catch(()=>{if(!disposed&&generation===qrGeneration)$('qr-note').textContent='二维码暂未生成，请刷新重试';});
}):undefined;
if(!shared){$('qr-note').textContent='模拟数据 · 练习不生成参与二维码';$('entry-link').hidden=true;}
void updates?.check();

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
  $('footer-status').textContent = fullCityPreview?'模拟数据 · 全地块预览 · 不写入共享城市':`${modeName()} · ${shared?(cityId!=='public'?'共享测试数据':'同浏览器匿名身份 · 真实共享'):next === 'city'?'模拟数据，刷新会重置城市':'城市使用模拟数据'}`;
}
async function start() {
  if(displaySurface||starting||submitting||photoBusy||disposed)return;
  audio.unlock(); // Initialize within the user gesture, before the server await.
  const navigation=navigationVersion;
  starting=true;
  try {
    if(updates&&!await updates.check())return;
    let runId: string | undefined;
    if(shared) {
      pendingStartKey ??= temporaryId();
      const began=await startSharedRun(cityId,pendingStartKey,activeServerRun,search.get('entry')??undefined);
      runId=began.runId;activeServerRun=runId;pendingStartKey=undefined;
      if(disposed||navigation!==navigationVersion)return;
      config={...config,game:began.rules};
    }
    game = new GameSession(config.game,runId); clock=new RunClock(game);origin=performance.now();
    completed = null; completedTrace=undefined;endHandled = false; frozenName=undefined;frozenColor=undefined;
    buildingColor=city.get(playerId)?.color??buildingColor;selectedColor=buildingColor;
    ($('signature') as HTMLInputElement).disabled=false;
    ($('signature') as HTMLInputElement).value=city.get(playerId)?.name??randomBuildingName(playerId);
  photoEditor.clear();photoNote('贴在楼的正面，留下你的颜色');
  stickerSkipped = false; $('skip-sticker').textContent = '跳过'; ($('skip-sticker') as HTMLButtonElement).disabled = false;
  feedbackUntil = 0;tierUntil=0;$('tier-feedback').hidden=true; $('placement-feedback').classList.remove('visible');
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
  audio.landed(placed.kind,game.combo,game.config.comboMilestone);landingHaptic(placed.kind);
  const button=$('drop-button');button.classList.remove('landed-tap');void button.offsetWidth;button.classList.add('landed-tap');
  if (placed.kind !== 'miss') {
    viewer.landed(game.tower, placed.kind === 'trimmed' ? placed.cut : undefined, placed.axis,placed.kind==='perfect',game.combo);
    const floors=game.tower.layers.length;if(floors===13||floors===25){$('tier-feedback').textContent=floors===13?'13层 · 玻璃办公楼':'25层 · 城市地标';$('tier-feedback').hidden=false;tierUntil=performance.now()+800;}
    const feedback = $('placement-feedback');
    feedback.textContent = placed.kind === 'perfect' ? `Perfect${game.combo >= game.config.comboMilestone ? ` · ${game.combo} 连击！` : '！'}` : '接住了！';
    feedback.className = 'visible ' + (placed.kind === 'perfect' ? 'perfect' : 'trimmed');
    feedbackUntil = performance.now() + 950;
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
  updateColorChoices();
  $('submit-note').textContent = count === 0 ? '先成功盖一层，再把小楼放进城市。' : shared?'作品会保存；大屏76个展示位按层数竞争，同分先到先得。署名、成绩与照片可公开展示，本局需在开局后10分钟内提交。':'城市使用模拟数据，仅保留在本页。';
  viewer.setSolo(completed.tower,selectedColor,city.get(playerId)?.photo); show('result');
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
    const cutoff=city instanceof SharedCityRepository?city.snapshot.displayCutoff??0:0;
    $('personal-note').textContent=own?own.plotId<0?`作品已保存，暂未获得大屏展示位。盖到 ${cutoff+1} 层可竞争展示位；同分先到先得。`:`${p?.districtName??'今日街区'} · 地块 ${own.plotId+1}；展示期间新最佳原地更新。`:'先盖一局，把自己的楼留在天际线。';
    $('city-callout-title').textContent=own?'看看你的最高作品。':'先盖出属于你的小楼。';
    $('city-callout-note').textContent=shared?'全城76个展示位，按个人最佳层数竞争；个人作品保留至午夜。':'这是本页模拟，刷新后重置。';
    $('city-play').textContent=game?.phase==='paused'?'继续盖楼 →':own?'再盖一局 →':'开始盖楼 →';
    labels.clear();sceneryNodes=[];return;
  }
  $('city-count').textContent = fullCityPreview?`${buildings.length} / ${layoutCapacity(currentLayout())} 地块 · 模拟数据`:shared?`${buildings.length} 栋${cityId!=='public'?'共享测试':'玩家'}建筑`:`12 栋样例建筑${own ? ' + 你的本页作品' : ''}`;
  const ranking = $('city-ranking'); ranking.replaceChildren();
  buildings.slice(0, 10).forEach((building, index) => {
    const item = document.createElement('li'), button = document.createElement('button');
    if (building.playerId === playerId) item.className = 'mine';
    const order = document.createElement('span'); order.className = 'rank-number'; order.textContent = String('rank' in building ? building.rank : index + 1).padStart(2, '0');
    const dot = document.createElement('span'); dot.className = 'color-dot'; dot.style.backgroundColor = building.color;
    const name = document.createElement('span'); name.className = 'rank-name'; name.textContent = building.name; name.title = building.name;
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
  if(fullCityPreview){$('city-callout-title').textContent=`满城模拟 · ${buildings.length} 栋楼`;$('city-callout-note').textContent='拖动环绕 · 缩放 · 选择街区 · 点击楼名或排行榜定位';}
  refreshLabels();refreshFeed();
  const select=$<HTMLSelectElement>('district-select'),value=select.value;select.replaceChildren();select.add(new Option('城市全景','0'));for(const d of districtsFor(currentLayout()))select.add(new Option(d.name,String(d.id)));select.value=value||'0';
}
function focusCurrent(id:string){const building=city.get(id);if(!building)return;selectedId=id;viewer.focusBuilding(building);const p=plotLocation(building.plotId,currentLayout());$('search-note').textContent=`${building.name} · ${building.tower.layers.length} 层 · ${p?.districtName??''} · 地块 ${building.plotId+1}`;refreshLabels();}
function refreshLabels(){
  labels.set(city.all(),selectedId);
  for(const {node} of sceneryNodes)node.remove();
  sceneryNodes=viewer.sceneryLabels().map(label=>{
    const node=document.createElement('span');node.className='building-label scenery-label';node.textContent=label.name;
    node.title='公共景观 · 不计成绩';$('building-labels').append(node);return {label,node};
  });
  if(!$('building-results').hidden)renderBuildingList();
}
function showBuildingList(ids:string[],title:string){
  resultIds=ids;$('results-title').textContent=title;$('building-results').hidden=false;renderBuildingList();
}
function renderBuildingList(){
  const list=$('results-list');list.replaceChildren();resultIds=resultIds.filter(id=>!!city.get(id));
  for(const id of resultIds){const building=city.get(id)!;const item=document.createElement('li'),button=document.createElement('button');button.textContent=building.name+' · '+building.tower.layers.length+' 层 · 地块 '+(building.plotId+1);button.onclick=()=>focusCurrent(id);item.append(button);list.append(item);}
  $('results-note').textContent=resultIds.length?'共 '+resultIds.length+' 栋，点击名称定位；新结果可重新查找。':'这些楼已不在当前城市。';
}
function clearNotices(){noticeQueue.clear();activeNotice=undefined;eventUntil=0;$('city-event').hidden=true;viewer.cancelCityNotice();}
function showNotice(event:CityEvent){
  const box=$('city-event');box.replaceChildren();const title=document.createElement('strong'),note=document.createElement('span');title.textContent=event.globalRecord?'全城新纪录！':event.kind==='first'?'新邻居，欢迎入城！':'个人新高，原地更新！';note.textContent=event.name+' · '+(event.kind==='best'?event.previousFloors+' → ':'')+event.floors+' 层';box.append(title,note);box.hidden=false;box.dataset.kind=event.kind;
}
function refreshFeed(){
  const feed=$('event-feed');feed.replaceChildren();for(const event of [...recentEvents].reverse().slice(0,6)){const item=document.createElement('li'),button=document.createElement('button');button.textContent=`${event.globalRecord?'全城新纪录':event.kind==='first'?'首次入城':'个人新高'} · ${event.name} · ${event.floors} 层`;const time=document.createElement('small');time.textContent=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(event.createdAt);button.append(time);button.onclick=()=>focusCurrent(event.playerId);item.append(button);feed.append(item);}
  if(!recentEvents.length){const item=document.createElement('li');item.textContent=fullCityPreview?'静态模拟 · 无入城事件':shared?'今天还没有入城动态':'模拟数据 · 练习不发布动态';feed.append(item);}
  $('connection-status').textContent=fullCityPreview?'静态模拟 · 不写入共享城市':connectionError?'连接暂时中断，自动重试；保留上次有效城市':`已更新 ${new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(lastSync)} · 每 3 秒同步`;
}
function collectEvents(){
  if(!(city instanceof SharedCityRepository))return;
  if(city.snapshot.eventGap){clearNotices();recentEvents=(city.snapshot.events??[]).slice(-6);}
  for(const event of city.takeEvents()){
    const building=city.get(event.playerId);if(building?.bestRunId!==event.runId)continue;
    viewer.highlightBuilding(building.playerId);recentEvents=[...recentEvents.filter(e=>e.id!==event.id),event].slice(-6);
    if(activeNotice?.playerId===event.playerId){activeNotice=event;showNotice(event);}else noticeQueue.push(event,performance.now());
  }
  refreshFeed();
}
function playNotice(now:number){
  if(eventUntil&&now<eventUntil||view!=='city'||personalSurface)return;
  const event=noticeQueue.take(now,event=>city instanceof SharedCityRepository&&event.epoch===city.snapshot.epoch&&city.get(event.playerId)?.bestRunId===event.runId);
  if(!event)return;
  const building=city.get(event.playerId)!;activeNotice=event;viewer.highlightBuilding(building.playerId);
  const duration=viewer.recordNotice(building);eventUntil=now+(duration||4200);showNotice(event);
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
  frozenColor ??= selectedColor;updateColorChoices();
  if(shared)($('signature') as HTMLInputElement).disabled=true;
  $('submit-note').textContent=shared?'正在共享，请稍等…':'正在入城…';
  const update = city instanceof SharedCityRepository ? await city.submit(playerId,frozenName,completed,completedTrace!,frozenColor) : city.submit(playerId,frozenName,completed,frozenColor);
  if(disposed)return;
  if (!update.building || update.kind==='invalid') throw new Error('No accepted building');
  activeServerRun=null;
  buildingColor=update.building.color;selectedColor=buildingColor;
  if(navigation!==navigationVersion)return;
  if(personalSurface)viewer.setSolo(update.building.tower,update.building.color,update.building.photo,rankOf(update.building));
  else{viewer.setCity(city.all(),update);viewer.focusBuilding();}
  refreshCityUI();show('city');
  const event = $('city-event'); event.replaceChildren();
  const title = document.createElement('strong'), note = document.createElement('span');
  title.textContent = update.building.plotId<0?'作品已保存，继续挑战展示位':update.kind === 'first'||update.previous?.plotId===-1 ? '你的楼，入城了！' : update.kind === 'best' ? '新最佳，原地长高！' : update.kind==='duplicate'?'这一局已经共享过':'最佳纪录保持不变';
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
$('find-building').onclick = () => focusCurrent(playerId);
$('tour-toggle').onclick=()=>{$('tour-toggle').textContent=viewer.toggleTour()?'恢复巡游':'暂停巡游';};
$('district-select').onchange=()=>{selectedId=undefined;viewer.focusDistrict(Number($<HTMLSelectElement>('district-select').value));refreshLabels();};
$('results-close').onclick=()=>{resultIds=[];$('building-results').hidden=true;};
$('building-search').onsubmit=event=>{
  event.preventDefault();const query=$<HTMLInputElement>('building-query').value.trim();if(!query)return;
  const matches=city.all().filter(b=>b.name.includes(query)||String(b.plotId+1)===query);
  if(matches.length){showBuildingList(matches.map(b=>b.playerId),'找到 '+matches.length+' 栋楼');$('search-note').textContent='选择列表中的楼名定位。';return;}
  const d=districtsFor(currentLayout()).find(d=>d.name.includes(query)||'区'+d.id===query);
  if(d){viewer.focusDistrict(d.id);$('search-note').textContent=d.name;return;}$('search-note').textContent='暂未找到，试试楼名或地块号。';
};
const visibilityHandler=()=>{if(document.hidden){pauseGame();updateHUD();clearNotices();if(city instanceof SharedCityRepository)city.silenceNextEvents();}else if(view==='city')void pollCity();};
document.addEventListener('visibilitychange', visibilityHandler);
const keyHandler=(event:KeyboardEvent)=>{
  const control=event.target instanceof Element?event.target.closest('button,input,select,textarea'):null;
  if (event.code === 'Space' && !event.repeat && view === 'play' && (!control||control.id==='drop-button') && !($('settings-dialog') as HTMLDialogElement).open) { event.preventDefault(); place(); }
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
  viewer.update(seconds, game);updates?.paint();
  if(view==='city'&&!personalSurface){playNotice(now);const tour=viewer.tourStatus();$('tour-status').textContent=tour.paused?'巡游已暂停':tour.automatic?`自动巡游 · ${tour.label}`:'手动查看 · 空闲后恢复巡游';if(tour.selectedId!==selectedId){selectedId=tour.selectedId;refreshLabels();}}
  if(view==='city'&&!personalSurface)labels.update(now,b=>viewer.projectLabel(b),selectedId,activeNotice?.playerId);
  if(view==='city')for(const {label,node} of sceneryNodes){const p=viewer.projectSceneryLabel(label);node.style.transform=`translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;node.hidden=!p.visible;}
  if (feedbackUntil && now > feedbackUntil) { $('placement-feedback').classList.remove('visible'); feedbackUntil = 0; }
  if(eventUntil&&now>eventUntil){$('city-event').hidden=true;eventUntil=0;activeNotice=undefined;}
  if(tierUntil&&now>tierUntil){$('tier-feedback').hidden=true;tierUntil=0;}
  if(!disposed)animationFrame=requestAnimationFrame(frame);
}
async function pollCity(){
  if(personalSurface||!(city instanceof SharedCityRepository)||pollBusy||disposed||resettingDay||view!=='city'||document.hidden)return;
  pollBusy=true;
  try{const changed=await city.refresh(pollAbort.signal);if(!disposed&&!resettingDay&&view==='city'){connectionError=false;lastSync=Date.now();if(changed){viewer.setCity(city.all(),undefined,currentLayout());refreshCityUI();}collectEvents();}}
  catch(error){if(error instanceof SharedError&&error.code==='city_reset'){clearNotices();recentEvents=[];viewer.setCity([]);location.reload();return;}if(!disposed&&!pollAbort.signal.aborted){connectionError=true;clearNotices();city.silenceNextEvents();refreshFeed();$('city-callout-note').textContent=sharedMessage(error)+' 正在显示上次已共享的城市。';}}
  finally{pollBusy=false;}
}
const pollTimer=setInterval(()=>void pollCity(),3000);
const resetAt=session?.snapshot.resetAt??displaySnapshot?.resetAt??nextShanghaiMidnight();let resettingDay=false;
const resetTimer=setInterval(()=>{if(fullCityPreview||Date.now()<resetAt||resettingDay)return;resettingDay=true;pauseGame();navigationVersion++;clearNotices();recentEvents=[];selectedId=undefined;viewer.setCity([]);viewer.setSolo(emptyTower(),buildingColor);photoEditor.clear();labels.clear();resultIds=[];$('building-results').hidden=true;$('event-feed').replaceChildren();$('search-note').textContent='';$('building-labels').replaceChildren();$('city-ranking').replaceChildren();$('city-count').textContent='新的一天，城市重新开始';$('personal-floors').textContent='0';$('personal-name').textContent='新的一天，再盖一栋新的楼';$('own-photo-actions').hidden=true;$('city-event').hidden=true;void fetch('/api/game/reset-due',{cache:'no-store',signal:AbortSignal.timeout(10_000)}).catch(()=>{}).finally(()=>location.reload());},500);
animationFrame=requestAnimationFrame(frame);
return()=>{disposed=true;cancelAnimationFrame(animationFrame);clearInterval(pollTimer);clearInterval(resetTimer);updates?.dispose();pollAbort.abort();photoEditor.dispose();audio.dispose();labels.clear();
  root.removeEventListener('pointerdown',gestureStart,true);root.removeEventListener('click',gestureClick,true);
  document.removeEventListener('visibilitychange',visibilityHandler);document.removeEventListener('keydown',keyHandler);
  if(city instanceof SharedCityRepository)city.dispose();viewer.dispose();
  if(import.meta.env.DEV)delete(window as unknown as {__SKYLINE_QA__?:unknown}).__SKYLINE_QA__;
};
}

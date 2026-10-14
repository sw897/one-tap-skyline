const cube = '<svg viewBox="0 0 40 44" fill="none" aria-hidden="true"><path d="M20 2 38 12 20 22 2 12Z" fill="#8fbcff"/><path d="M2 12 20 22v20L2 32Z" fill="#4e89e6"/><path d="m20 22 18-10v20L20 42Z" fill="#bdd8ff"/><path d="M2 22 20 32l18-10M2 32l18 10 18-10" stroke="white" stroke-width="2"/></svg>';
export function mountUI(root: HTMLElement) {
  root.innerHTML = `
    <div class="sky-cloud cloud-a"></div><div class="sky-cloud cloud-b"></div><div class="sky-cloud cloud-c"></div>
    <header class="app-header">
      <button class="brand" id="home-button" aria-label="一指盖楼：城市天际线 首页">${cube}<span><strong>一指盖楼</strong><small>城市天际线</small></span></button>
      <div class="header-actions"><button class="text-button" id="sound-toggle" aria-label="关闭音效" aria-pressed="false">音效 开</button><button class="text-button" id="sound-preview" aria-label="试听普通落层与Perfect音效">♪</button><span class="prototype-badge" id="prototype-badge">共享试玩</span><button class="text-button" id="settings-button" aria-label="调整试玩参数">⚙</button><button class="outline-button" id="overview-button">城市总览 <span aria-hidden="true">↗</span></button></div>
    </header>
    <aside id="release-update" class="release-update" hidden role="status"><span id="release-update-note"></span><button id="release-update-button" class="outline-button">更新体验</button></aside>
    <div id="viewport"><div id="building-labels"></div><span id="scene-data-mark" hidden>共享测试数据</span></div>

    <section data-screen="intro" class="intro-copy">
      <div class="eyebrow"><span></span> 一指之间，一座城市</div>
      <h1>把每一次落下，<br>盖成<span>更高的风景。</span></h1>
      <p class="intro-description">找准时机，接住移动的楼层。<br>盖完的小楼，会成为天际线的一部分。</p>
      <button class="primary-button start-button" id="start-button">开始盖楼 <span aria-hidden="true">→</span></button>
      <p class="intro-note" id="intro-direction">楼层左右、前后交替移动 · 单指点击落层</p>
      <p class="intro-note">每天北京时间 00:00，城市与成绩重新开始。</p>
      <p class="mode-links" id="mode-links" hidden><a id="shared-link" href="/?mode=shared">返回共享试玩</a></p>
      <div class="how-to"><span><b>01</b> 点击落层</span><span><b>02</b> 留下作品</span><span><b>03</b> 原地长高</span></div>
    </section>

    <section data-screen="play" class="game-ui" hidden>
      <div class="timer-card"><div id="timer-ring"><span id="seconds">60</span><small>秒</small></div><span class="muted">剩余时间</span></div>
      <div class="floor-card"><span class="muted">当前楼层</span><strong id="floor-count">0</strong><span class="floor-unit">层</span></div>
      <button class="round-button pause-button" id="pause-button" aria-label="暂停游戏">Ⅱ</button>
      <div class="play-caption">接住这一层<span id="move-direction">本层左右移动 ↔</span><span>超出部分会裁掉 · 对齐就是 Perfect</span></div>
      <div id="placement-feedback" role="status" aria-live="polite"></div>
      <div id="tier-feedback" role="status" hidden></div>
      <button id="drop-button" class="drop-button"><span class="tap-icon" aria-hidden="true">↓</span><strong>点击落层</strong><small>也可以轻点楼体画面</small></button>
      <div id="pause-overlay" hidden><div class="glass pause-panel"><span class="eyebrow">歇一小会儿</span><h2>楼还在这里。</h2><p>时间和楼块已暂停，准备好再继续。</p><button class="primary-button" id="resume-button">继续盖楼</button></div></div>
    </section>

    <section data-screen="result" class="result-ui" hidden>
      <div class="result-title"><span class="eyebrow" id="end-caption">这局完成</span><h1>这栋楼，属于你。</h1><p>拉远一点，看看刚刚盖出的风景。</p></div>
      <aside class="glass result-panel">
        <div class="result-score"><div><span class="muted">本局作品</span><strong><span id="result-floors">0</span><small>层</small></strong></div><span class="score-cube">${cube}</span></div>
        <div class="performance" id="performance-summary"></div>
        <label class="signature-label" for="signature">给作品起个名字 <small>首次 / 新最佳可改</small></label>
        <input id="signature" maxlength="16" autocomplete="off" placeholder="给你的小楼起个名字" />
        <fieldset id="building-colors" class="building-colors"><legend>楼体颜色 <small>首次 / 新最佳可选</small></legend><div id="color-options"></div></fieldset>
        <div class="sticker-row"><div class="sticker-placeholder" aria-hidden="true">▧</div><div><strong>照片幕墙 <span class="muted">可选</span></strong><small id="sticker-hint">铺满正面墙，随楼体轮廓裁切</small></div><button class="subtle-button" id="choose-sticker">选择照片</button><button class="subtle-button" id="skip-sticker">跳过</button></div>
        <button class="primary-button" id="submit-button">模拟入城 <span aria-hidden="true">↗</span></button>
        <p id="submit-note" class="disclosure">城市使用模拟数据，仅保留在本页。</p>
        <button class="outline-button replay-button" id="replay-button">再来一局 <span aria-hidden="true">↻</span></button>
      </aside>
    </section>

    <section data-screen="city" class="city-ui" hidden>
      <div class="personal-summary" id="personal-summary" hidden><span class="eyebrow">属于你的天际线</span><h1>我的楼</h1><p>个人最佳 <strong id="personal-floors">0</strong> 层</p><p id="personal-name">还没有保存的作品</p><small id="personal-note"></small></div>
      <div id="own-photo-actions" class="glass own-photo-actions" hidden><div><strong>给你的楼，留一张照片</strong><small id="photo-own-note">照片即时公开，午夜和城市一起重置</small></div><div class="own-photo-buttons"><button id="edit-own-photo" class="outline-button">装饰我的楼</button><button id="retry-photo" class="outline-button" hidden>重试保存照片</button><button id="remove-own-photo" class="subtle-button" hidden>撤回照片</button></div></div>
      <div class="city-title"><div class="eyebrow">每一栋小楼，都让城市多一个颜色</div><h1 id="city-name">城市天际线</h1><span class="simulation-badge" id="data-badge">模拟数据 · 本页城市</span>
        <div class="city-qr glass"><canvas id="entry-qr" aria-label="手机试玩入口二维码"></canvas><div><strong>扫码，盖进这座城</strong><a id="entry-link" target="_blank" rel="noopener">手机试玩入口</a><small id="qr-note">正在生成二维码</small></div></div>
      </div>
      <div id="city-event" role="status" aria-live="polite" hidden></div>
      <aside id="building-results" class="glass building-results" hidden><div class="dialog-heading"><h3 id="results-title">找到这些楼</h3><button id="results-close" class="text-button" aria-label="关闭楼名列表">×</button></div><p id="results-note"></p><ul id="results-list"></ul></aside>
      <aside class="glass city-board">
        <div class="board-heading"><div><span class="eyebrow">一起盖出的风景</span><h2 id="board-title">模拟排行榜</h2></div><span class="board-icon" aria-hidden="true">▥</span></div>
        <p class="board-caption" id="city-count">12 栋样例建筑</p><ol id="city-ranking"></ol>
        <div id="personal-building" class="personal-building" hidden></div>
        <div class="city-search"><label for="district-select">查看街区</label><select id="district-select"></select><form id="building-search"><label for="building-query">找一栋楼</label><div><input id="building-query" maxlength="40" placeholder="楼名、地块号或街区名" /><button type="submit">查找</button></div></form><small id="search-note" role="status"></small></div>
        <div class="city-feed"><h3>今日动态</h3><ol id="event-feed"></ol><p id="connection-status" role="status">正在读取今日城市…</p></div>
        <p class="disclosure" id="city-disclosure">这里是视觉模拟。刷新会重置，<br>不是共享城市或真实排名。</p>
      </aside>
      <div class="map-controls"><button aria-label="放大城市" id="zoom-in">＋</button><button aria-label="缩小城市" id="zoom-out">−</button><button aria-label="旋转城市" id="rotate-city">↻</button><button aria-label="城市全景" id="city-wide">▦</button><button id="ambient-toggle" class="find-button" aria-pressed="false">环境动态 关</button><button id="tour-toggle" class="find-button">暂停巡游</button><button id="find-building" class="find-button" hidden>找到我的楼</button><span id="tour-status">自动巡游</span></div>
      <div class="city-callout glass"><div><strong id="city-callout-title">让这座城市，多一栋你的楼。</strong><span id="city-callout-note">先玩一局，再为作品署名。</span></div><button class="primary-button" id="city-play">开始盖楼 →</button></div>
    </section>

    <input id="photo-file" type="file" accept="image/jpeg,image/png,image/webp" hidden />
    <dialog id="photo-dialog" class="glass photo-dialog"><div class="dialog-heading"><div><span class="eyebrow">只装饰，不改变成绩</span><h2>把照片贴到楼上</h2></div><button id="photo-cancel" class="text-button" aria-label="取消照片">×</button></div><div class="crop-layout"><div class="photo-crop-stack"><canvas id="photo-mask" width="512" height="768" aria-hidden="true"></canvas><canvas id="photo-canvas" width="512" height="768" aria-label="拖动照片调整位置"></canvas></div><div class="crop-help"><p>拖动照片调整位置 · 暗色区域不会显示</p><canvas id="photo-wall" width="240" height="240" aria-label="真实墙形正面预览"></canvas><small>按楼体墙面裁切显示；斜视效果以成品为准</small><label for="photo-zoom">放大 <input id="photo-zoom" type="range" min="1" max="3" step="0.02" value="1" /></label><p>保存后立即公开到城市与大屏。每天北京时间 00:00 清空游戏；未保存草稿 4 小时后失效。</p><label class="photo-consent"><input id="photo-consent" type="checkbox" />我愿意公开展示这张照片</label><p id="photo-error" role="status"></p><button id="photo-apply" class="primary-button">使用这张照片</button><button id="photo-cancel-bottom" class="outline-button">取消</button></div></div></dialog>
    <footer class="app-footer"><span id="footer-status">单轴盖楼 · 城市使用模拟数据</span><span class="footer-mark">ONE TAP, A NEW SKYLINE.</span></footer>
    <dialog id="settings-dialog" class="glass settings-dialog"><form method="dialog">
      <div class="dialog-heading"><div><span class="eyebrow">初始候选 · 等你试玩</span><h2>调整玩法参数</h2></div><button class="text-button" value="cancel" aria-label="关闭参数面板">×</button></div>
      <label>单局时长 <span>秒</span><input id="setting-time" type="number" min="10" max="180" step="10" required /></label>
      <label>移动速度 <span>0.5–8</span><input id="setting-speed" type="number" min="0.5" max="8" step="0.1" required /></label>
      <label>Perfect 容差 <span>当前边长百分比</span><input id="setting-perfect" type="number" min="0" max="12" step="0.5" required /></label>
      <label>连击提示阈值 <span>次</span><input id="setting-combo" type="number" min="2" max="10" step="1" required /></label>
      <p class="disclosure">调整从下一局生效。连击只做反馈，<br>不额外计层、不恢复宽度。</p><button class="primary-button" id="apply-settings" value="apply">保存候选参数</button>
    </form></dialog>
  `;
}

export function mountSharedUnavailable(root:HTMLElement,message:string):()=>void {
  root.innerHTML='<main class="compatibility-message"><h1>共享城市暂未连接</h1><p id="shared-error" role="status"></p><button id="retry-shared" class="primary-button">重试连接</button><p>连接成功后再开始盖楼，作品才能同步到大屏。</p></main>';
  root.querySelector('#shared-error')!.textContent=message;
  if(message.includes('今日入口已更新')){root.querySelector('h1')!.textContent='请扫描今日二维码';root.querySelector<HTMLButtonElement>('#retry-shared')!.hidden=true;root.querySelector('main > p:last-child')!.textContent='每日午夜入口更新，同一天登记后无需重复扫码。';}
  const retry=root.querySelector<HTMLButtonElement>('#retry-shared')!;
  retry.onclick=()=>location.reload();
  return ()=>{retry.onclick=null;};
}

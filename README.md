# 一指盖楼：城市天际线

当前已发布 **Sites22**：真实大屏与扫码参与（线上地址私存）（版本参数：build-3e06755df8c9）、六区满城模拟（线上地址私存）（版本参数：build-3e06755df8c9）。应用1b3560f / p5-sites22：固定76展示位、照片墙形预览、最新展馆景观、摩天轮及9辆慢行车。部署成功及无凭据HTTP读取通过，真实手机/视觉/性能和统一验收仍待完成，见[发布记录](docs/P5-sites22-release-record.md)。以下为各次历史状态，旧URL的v参数不能选择历史部署。

历史[固定六区景观本地候选](http://127.0.0.1:5186/?mode=display&view=city&demo=full&v=build-d47e8b59af1d)：新增游乐园、商场、水岸集市和书屋；76个展示位按最佳层数竞争，同分先到先得，个人作品及照片保留。见[测试入口及真实记录](docs/P5-six-district-display-slots-record.md)。编译和本地竞争接口通过；101项回归100通过，旧迁移工具1项缺口保留；三维观感待手工体验。未上传Sites，线上仍21；以下均为历史候选记录，旧v不会加载历史部署。

历史[同轴过桥本地候选](http://127.0.0.1:5186/?mode=display&view=city&demo=full&v=build-773fb4d6392b)：两岸引道与桥面共线，移除桥头三路尖角。17项检查/构建通过，视觉待复测，未上传Sites；见[记录](docs/P5-straight-bridge-record.md)。以下链接为历史记录，v不选择旧构建。

历史[本地桥头修订](http://127.0.0.1:5186/?mode=display&view=city&demo=full&v=build-282df7d178eb)：地块55旁坡道接到实际道路中心线，17项定向检查及构建通过，三维效果待复测；未上传Sites，见[记录与扩区说明](docs/P5-bridge-landing-record.md)。下述为上一轮历史候选，旧v参数不会加载旧构建。

历史大屏[本地满城候选](http://127.0.0.1:5186/?mode=display&view=city&demo=full&v=build-1864246899fd)进一步整理运河侧连接：就近接入路段、绕行首次接路即结束、共用运河侧街口；排行榜楼名17px、层数18px。33项定向检查与构建通过，三维视觉待用户复测，见[接路修订记录](docs/P5-road-junctions-record.md)。仅本机可用，未上传Sites，线上仍为Sites21。上一版本获用户“明显改进”的局部反馈，保留[历史记录](docs/P5-road-style-refinement-record.md)。

Sites21已发布满城反馈修复（线上地址私存）（版本参数：build-f2ca47025e2c）：连续环岛路/街区接路、湖泊到海岸运河及实际交点桥、12px屋顶楼名、满城街区定位保留目标。ac462a6 / p5-event-screen-preview.13；33项定向检查与构建、局部1080p预览完成；线上初始DOM可见，后续自动截图/字体读回受阻，真实手工复测待执行，见[修复记录](docs/P5-streets-and-district-fix-record.md)。

历史Sites20首次上线满城模拟入口（线上地址私存）（版本参数：build-1bf79e032986）：默认六区76个地块全部生成模拟楼，沿用大屏交互，明确标模拟且不写共享数据、不提供参与二维码。dc8220c / p5-event-screen-preview.12；发布事实与局部检查见[满城预览记录](docs/P5-full-city-preview-record.md)。旧v参数不会选择历史部署；当时线上为Sites21。

此前已按用户“上线测试”要求发布Sites19（aba685a / p5-event-screen-preview.11）；后续保留这些行为。包含缓存/午夜换码、强制保留当天扫码URL、简单屋顶楼名和2.5秒手动定位；沿用上一轮31项定向检查、构建与本地Worker证据，本次未重新运行，真实手机/午夜仍未验证。见[发布记录](docs/P5-sites19-release-record.md)及[实现与回退历史](docs/P5-cache-entry-and-rollback-record.md)。

手机优先的一指盖楼游戏。默认逐层交替 X/Z，每层单轴；60 秒有效游玩时间，Perfect 与连击只做反馈。游玩、结算和城市共用完整楼体模型，层数与高度一致。公开默认城市名为“城市天际线”。

历史第一批候选为38c459f / p5-event-screen-preview.8 / Sites16：落层/Perfect音画反馈、完整新楼即时显示、镜头优先级、聚合楼名与多结果搜索。36项定向开发检查、构建及局部尺寸预览通过，真实手机/音效/多人过场与正式验收仍待执行；第二批按用户手工反馈后推进，见[第一批记录](docs/P5-experience-batch1-record.md)和[批准计划](docs/P5-experience-enhancement-plan.md)。

上一轮候选为dfa5446 / p5-event-screen-preview.7 / Sites15：移除公开练习入口，扫码明确共享；新楼随机空地块、首次/严格新高可选六色。27项开发回归/本地隔离同步通过，HTTP线上隔离脚本403受阻，新截图/颜色UI/真机及正式验收未完成，见[当前记录](docs/P5-shared-entry-and-colors-record.md)。上一轮可读性6a383a6 / tag.6 / Sites14的榜名“排行榜”、1080p楼名21px/成绩22px、深色浮层保持，历史见[可读性记录](docs/P5-display-readability-record.md)。以下Sites13是更早完善的历史事实。

P5完善候选已部署Sites13（8444bf5 / p5-event-screen-preview.5）：练习入口、整墙照片、可见前三名顶饰、全楼名称、三档楼体与滨水场景；41项开发检查/构建/局部模拟预览及真实失败、缺项见[完善记录](docs/P5-refinement-record.md)。正式验收仍按用户要求延期，先手工体验；此前用户反馈闪动已解决，历史[全屏记录](docs/P5-fullscreen-record.md)、[表面记录](docs/P5-display-fix-record.md)、[海岛记录](docs/P5-island-update-record.md)保留。每日北京时间00:00任务仍启用，实际定时运行与全量清空尚未验证；[P4记录](docs/P4-development-record.md)、[P3记录](docs/P3-development-record.md)保留。站点：一指盖楼（线上地址私存），大屏（线上地址私存）。

## 本地运行

需要 Node.js 22.13+；依赖版本由 lockfile 固定。

```powershell
npm ci
$env:SKYLINE_D1_STATE_PATH='D:\private\skyline-d1'
npm run build
Get-ChildItem drizzle/*.sql | Sort-Object Name | ForEach-Object { node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to $env:SKYLINE_D1_STATE_PATH --file $_.FullName }
npm run dev
```

开发服务默认 loopback 5173。`npm run preview` 启动编译后的本地 Worker；保持同一仓库外 D1 路径，开发与生产预览可读取同一数据。未指定路径时使用仓库外系统临时目录。手机不能直接访问另一台主机的 loopback，跨设备体验使用实际部署地址。

## 共享与练习

玩家使用一个手机试玩入口：一指盖楼（线上地址私存）。下面的test/test-mobile是开发验证地址，用来隔离程序生成的成绩，页面明确标测试；不代表运营两套游戏，不提供玩家环境切换，也不另建站点。大屏入口只是同一试玩数据的电脑视图。

- `/?mode=shared&view=city`：桌面共享城市总览；手机/窄屏只看自己的楼。署名、成绩和楼体在大屏公开展示。
- `/?mode=display&view=city`：只读大屏，不创建玩家或局次；滨水景观、自动巡游/手动接管、找楼、前十名、今日动态与同一手机入口二维码。默认手机入口仍只取自己的楼。
- `/?mode=shared&city=test`：独立共享测试城市，画面明确标注测试数据；测试成绩不进入真实榜单。
- `/?mode=shared&city=test-mobile`：保留原60楼测试证据后的手机修订回归城市，同样明确标测试数据。
- 公开首页和二维码不提供练习链接；旧`/?mode=practice`和`?cut=single-x`地址仅供开发对比，模拟只在本页，不进入大屏真实成绩。
- 服务端通过 `SKYLINE_PUBLIC_WRITE_OPEN=1` 开放真实写入，默认关闭。默认/显式共享入口在初始化失败或关闭时提示重试，不自动转练习；只读大屏仍独立读城。

同浏览器匿名身份采用 HttpOnly、SameSite=Lax 的 cookie，HTTPS 下加 Secure，有效期 30 天。不同浏览器、微信容器和设备各算一个玩家；清除 cookie 后不能自动认领旧楼。榜单仅按层数，并列名次为 1、1、3；先达到该最佳的楼优先显示。

服务端先创建局次，再开始游戏计时；单玩家/城市一个活跃局，局次墙钟有效期10分钟。服务端用固定B/60秒规则复算完整楼体，不信任客户端总分或几何。相同局和正文重试返回原回执；较低或同分不变，严格更高以整局新几何原地更新。首楼从开放区空地块随机分配，以后地块固定。默认楼名从当天随机匿名ID生成；首次/严格新高可选改名、换图和六色，未改沿用；颜色随提交冻结并校验幂等。浏览器时序可被脚本生成，这套校验不保证识别人类操作。

大屏前台约每3秒检查快照/事件，后台暂停；初开和断线恢复不重播历史。手机不轮询全城，启动、提交及主动查看只取自身完整最佳楼。照片裁切/幕墙预览、即时公开保存、换图与撤回保留。外观分级1–12/13–24/25+，前三名顶饰沿用并列1、1、3，不增加主体层数/高度。每日00:00清空楼体、成绩、身份、局次、照片、草稿和动态；满城拒绝新楼，已有楼可继续长高。P5构建结果不是功能/性能验收，Docker/SSH仍P6。

## 运行时活动配置

服务端读取 `CITY_DISPLAY_NAME`，通过同源 `/runtime-config.json` 返回白名单显示配置，不编译进默认资产。Sites 的值在平台运行时环境设置；环境修改须重新部署已保存版本。公开默认保持中性名称，秘密值不返回客户端。

P5默认六区10/12/14/11/13/16，共76地块。`SKYLINE_OPEN_DISTRICTS`可设1–10；`SKYLINE_DISTRICT_CAPACITIES`为十项10–16的JSON数组。默认十区140，全16配置上限160，规模/性能待验证。按最新开发反馈，读取城市时立即应用当前布局与容量，现有楼随新布局移动，保留成绩、楼体和照片；无需等待午夜。容量缩小时会在十区上限内容纳已有楼。`SKYLINE_VISUAL_CONFIG`可提供公开JSON白名单（lowFloors/midFloors/publicBuildings/tourStaySeconds/tourTransitionSeconds/tourIdleSeconds等），不包含秘密。

开发时可用仓库外 `SKYLINE_ACTIVITY_CONFIG_PATH` 指定 JSON，结构见 [公开安全示例](public/runtime-config.example.json)。正式共享使用服务端固定规则；可调练习参数不会进入真实榜单。P1/P2 静态部署的环境能力和结果保留在各阶段记录中，不能从当前实现反推旧版本已支持。

## 测试、迁移与留证

```powershell
npm test
$env:SKYLINE_EVIDENCE_DIR='D:\private\skyline-evidence'
npm run test:browser
npm run test:cutting
npm run test:visual
npm run test:shared
npm run db:export:local -- --file D:\private\city-export.json
npm run db:import:local -- --file D:\private\city-export.json
```

浏览器测试使用已安装 Chrome；录屏需要 Playwright FFmpeg。`SKYLINE_BASE_URL` 可指定地址。截图、视频、完整日志、时序、数据库与身份映射仅在仓库外私存。导出工具只操作本地 D1；导入要求已迁移的空库，并在单个批处理中恢复。这些是已有本地开发工具；按最新每日试玩安排，P6计划从新空城开始，不搬迁Sites成绩/照片/匿名身份。已应用 SQL/journal 不改历史。

自动化、手机尺寸模拟和真实手机反馈分别记录；安卓暂不安排。Git 是唯一源码版本线，公开推送前检查待推提交、全历史、tag 与资产，规则见 [AGENTS.md](AGENTS.md)。

阶段资料：[P1 记录](docs/P1-development-record.md)、[P2 对比记录](docs/P2-development-record.md)、[P2 收尾](docs/P2-closeout.md)、[P3 修订计划](docs/P3-implementation-plan.md)、[P3 实际开发记录](docs/P3-development-record.md)、[P4 照片与午夜重置计划](docs/P4-implementation-plan.md)、[P4 开发记录](docs/P4-development-record.md)（候选，正式验收延期）、[P5 大屏城市与试玩计划](docs/P5-implementation-plan.md)（已实施，候选待手工体验）、[P5开发记录](docs/P5-development-record.md)、[后续记录模板](docs/development-record-template.md)。

下一阶段：[P6 Docker云部署与最终验收计划](docs/P6-implementation-plan.md)（经审查修订，仍待实施确认）、[计划审查](docs/P6-plan-review.md)、[原只读预检记录](docs/P6-planning-record.md)。本轮没有实现Docker/Node适配、连接SSH或执行统一验收。

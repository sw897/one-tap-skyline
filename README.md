# 一指盖楼：城市天际线

手机优先的一指盖楼游戏。默认逐层交替 X/Z，每层单轴；60 秒有效游玩时间，Perfect 与连击只做反馈。游玩、结算和城市共用完整楼体模型，层数与高度一致。公开默认城市名为“城市天际线”。

P3 共享候选已完成本地实现与自动化，线上部署和真机验收状态见 [P3 开发记录](docs/P3-development-record.md)。原 Sites 地址为 一指盖楼（线上地址私存），保存/部署版本须以记录中的实际结果为准。

## 本地运行

需要 Node.js 22.13+；依赖版本由 lockfile 固定。

```powershell
npm ci
$env:SKYLINE_D1_STATE_PATH='D:\private\skyline-d1'
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to $env:SKYLINE_D1_STATE_PATH --file drizzle/0000_opposite_talos.sql
npm run dev
```

开发服务默认 loopback 5173。`npm run preview` 启动编译后的本地 Worker；保持同一仓库外 D1 路径，开发与生产预览可读取同一数据。未指定路径时使用仓库外系统临时目录。手机不能直接访问另一台主机的 loopback，跨设备体验使用实际部署地址。

## 共享与练习

- `/?mode=shared&view=city`：真实共享城市总览；署名、成绩和楼体公开展示。
- `/?mode=shared&city=test`：独立共享测试城市，画面明确标注测试数据；测试成绩不进入真实榜单。
- `/?mode=practice`：本页内存练习，12 栋模拟样例，刷新重置；设置和 `?cut=single-x` 对比只用于练习。
- 服务端通过 `SKYLINE_PUBLIC_WRITE_OPEN=1` 开放真实写入，默认关闭。未开放时默认入口进入明确标记的练习；显式共享入口仍可读城。

同浏览器匿名身份采用 HttpOnly、SameSite=Lax 的 cookie，HTTPS 下加 Secure，有效期 30 天。不同浏览器、微信容器和设备各算一个玩家；清除 cookie 后不能自动认领旧楼。榜单仅按层数，并列名次为 1、1、3；先达到该最佳的楼优先显示。

服务端先创建局次，再开始游戏计时；单玩家/城市一个活跃局，局次墙钟有效期 10 分钟。提交有上限的事件时序，服务端用固定 B/60 秒规则复算完整楼体；不信任客户端总分或几何。相同局和正文重试返回原回执，不重复入城；较低或同分不变，严格更高成绩以整局新几何在原地更新，地块、颜色和首次署名稳定。浏览器时序可被脚本生成，这套校验不保证识别人类操作。

城市前台每 3 秒检查版本，游玩/后台暂停轮询。60 个稳定地块、个人定位与榜外个人名次已纳入测试；满城拒绝新楼，保留已有楼的最佳更新。幕墙只预留贴纸位置和跳过入口，上传属于 P4，完整投屏互动属于 P5，Docker/SSH 属于 P6。

## 运行时活动配置

服务端读取 `CITY_DISPLAY_NAME`，通过同源 `/runtime-config.json` 返回白名单显示配置，不编译进默认资产。Sites 的值在平台运行时环境设置；环境修改须重新部署已保存版本。公开默认保持中性名称，秘密值不返回客户端。

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

浏览器测试使用已安装 Chrome；录屏需要 Playwright FFmpeg。`SKYLINE_BASE_URL` 可指定地址。截图、视频、完整日志、时序、数据库与身份映射仅在仓库外私存。导出工具只操作本地 D1；导入要求已迁移的空库，并在单个批处理中恢复。已应用 SQL/journal 不改历史。线上数据库和 P6 域名/身份迁移须另验，不能宣称随 Docker 自动搬迁。

自动化、手机尺寸模拟和真实手机反馈分别记录；安卓暂不安排。Git 是唯一源码版本线，公开推送前检查待推提交、全历史、tag 与资产，规则见 [AGENTS.md](AGENTS.md)。

阶段资料：[P1 记录](docs/P1-development-record.md)、[P2 对比记录](docs/P2-development-record.md)、[P2 收尾](docs/P2-closeout.md)、[P3 修订计划](docs/P3-implementation-plan.md)、[P3 实际开发记录](docs/P3-development-record.md)、[后续记录模板](docs/development-record-template.md)。

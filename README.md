# 一指盖楼：城市天际线

手机优先的单轴盖楼游戏。P1 提供可玩的视觉原型：点击落层、裁切、Perfect/连击反馈、作品结算拉远，以及同一楼体进入三维模拟城市。

**城市和高度榜均为模拟数据。** 页面刷新会重置，不提供真实共享排名、跨设备玩家身份、照片上传或云端成绩保存。公开默认城市名为“城市天际线”。

## 本地运行

需要 Node.js 22.12+。

```powershell
npm ci
npm run dev
```

打开终端给出的本地地址。同一 Wi-Fi 手机使用终端里的物理网卡局域网地址；能在电脑打开不等于手机网络已验证。`?view=city` 可以直接打开城市总览。

```powershell
npm test
npm run build
npm run preview
```

构建输出为 `dist/`，不依赖服务器业务逻辑。生产构建不包含开发用的 QA 状态接口。

## 活动运行时配置

页面启动时获取同源 `/runtime-config.json`，所有默认值保持公开安全。该文件和 `src/config.ts` 的安全兜底共同定义可调候选参数；修改显示名不会把值编译进 JS。

开发服务器可以响应仓库外的配置文件：

```powershell
$env:SKYLINE_ACTIVITY_CONFIG_PATH='D:\private\activity.json'
npm run dev
```

示例结构与 `public/runtime-config.json` 相同。活动文件不复制进源码或 `dist`。无效配置回退到中性默认，修改后刷新页面生效；设置面板的候选参数只在本页生效，从下一局开始应用。

展示配置对访客可读，不是秘密存储。Sites P1 静态候选部署中性配置；平台环境变量不会自动进入浏览器。受控活动部署若需覆盖，必须由托管层响应同路径 JSON，不能把本地开发能力当作已验证的 Sites 运行时覆盖能力。

## 一套楼体与规则

- `src/core/tower.ts` 是唯一的裁切/楼体规则。层数只来自成功落下的楼层记录；基座计 0，统一层高为 0.34。
- X 轴区间交叠保留，零交叠结束；Perfect 在宽度比例容差内吸附。连击只做反馈，P1 不奖励虚拟楼层或恢复宽度。
- `src/render.ts` 的同一生成器用于游玩、结算和城市；成绩层数、完整几何、楼高保持一致。
- `MemoryCityRepository` 只模拟本页状态。首次创建固定地块；未破纪录保留完整原楼；新最佳以新局完整几何原地重建并长高，姓名、颜色、地块保持不变。
- 署名在游戏结束后填写且可选。幕墙贴纸位和“跳过”入口已保留，没有照片选择器或上传接口。

## 浏览器验证与私有留证

Chrome 已安装的机器可运行自动化；录屏依赖 Playwright 的 FFmpeg。

```powershell
node node_modules/playwright/cli.js install ffmpeg
$env:SKYLINE_EVIDENCE_DIR='D:\private\skyline-evidence'
npm run test:browser
```

先保持开发服务器运行。可用 `SKYLINE_BASE_URL` 指定地址，`SKYLINE_BROWSER_CHANNEL` 指定已安装浏览器渠道。原始截图、录屏、JSON 与日志只写到仓库外；默认使用用户临时目录。

自动化会实际玩出 12 层、9 层、16 层，展示首次入城、未破纪录、刷新最佳，并核对新最佳完整几何及稳定身份；还检查触摸模拟、暂停和横竖屏。为稳定测试使用专门的可调参数，不代表已完成真人手感调优。真实 iPhone Safari / 安卓 Chrome 验收按 [P1 边界与安排](docs/P1-boundaries.md) 另行记录，不能由尺寸模拟替代。

## Sites 与后续阶段

P0 检查基线：**仅完成预检，实际部署与免登录访问待验证。** 创建私有项目、核实 owner/仅本人访问、打开 Git 源通道不等于已保存或部署游戏。P1 的保存、部署、访问实测分别留私有记录；不能把平台生成的预期地址当作部署成功链接。

2026-10-11 的 P1 后续实测：Sites 已保存并成功部署版本 1，受众经确认设为任何知道链接的人。公开模拟原型（线上地址私存）在两个全新未登录 Chrome 会话中通过入口、触控开局、结算和模拟入城验证；实际手机验收仍待完成。版本 1 对应 `381f32f` / `p1-core-visual`，详细范围见 [P1 验证摘要](docs/P1-validation.md)。

随后收到真实 iPhone 的 Chrome、Safari 与微信内置浏览器反馈：免登录访问及触控正常，启动和切页有短暂闪动。P1 已修正画布尺寸过渡和首帧镜头，自动化回归通过。2026-10-12 收到 iPhone 复测确认：初始化和切页闪动已修复；安卓及完整三种入城情景的真机验收待补。修订标记为 `p1-core-visual.1`，原 tag 保留。公开源码仓库：[sw897/one-tap-skyline](https://github.com/sw897/one-tap-skyline)。

修订版已保存并部署为 Sites 版本 2，对应应用提交 `c73e407` / `p1-core-visual.1`。两个新建未登录 Chrome 会话均返回 200，实际触控、结算和模拟入城通过，线上 JS/CSS 与该提交构建的 SHA256 一致。GitHub public 已推送代码与两枚 tag，并经无认证访问验证。

身份、真实共享成绩和结构化数据迁移属于 P3；上传、授权、审核、删除与文件迁移属于 P4。P6 再处理 Docker/SSH。前端可保持同一静态构建，但 Sites D1/R2 与通用 Docker 存储须通过对应阶段的适配与迁移验证。

Git 是唯一源码版本线。P1 里程碑为 `p1-core-visual`；交接包、客户素材、原始提示词和运行证据均不进入仓库。公开推送前必须审核提交、资产、历史对象及 tag，详见 [AGENTS.md](AGENTS.md)。

阶段资料：[P1 开发过程记录](docs/P1-development-record.md)、[P2 实施计划（B 已批准）](docs/P2-implementation-plan.md)、[P2 计划修订记录](docs/P2-planning-record.md)、[P2 对比候选开发记录](docs/P2-development-record.md)、[后续阶段与重要修复记录模板](docs/development-record-template.md)。

当前 P2 对比候选：`db2921b` / `p2-cutting-preview` / Sites 版本 3。用同一浏览器、默认参数比较 逐层换向（线上地址私存） 与 固定方向（线上地址私存），建议各 3 局。首轮 iPhone 13 Pro 反馈更喜欢 B、无触控或闪动问题；系统/浏览器版本与完整真机流程未提供，安卓暂未验证，`p2-playtest` 尚未创建。

电脑大屏可直接打开 模拟城市总览（线上地址私存）。这是 P1/P2 已有的桌面布局；P5 再实现独立展示流程、街区轮播与完整互动。

直达链接已在未登录桌面 Chrome 1920×1080 实际验证。当前仍是本页模拟数据，手机作品与电脑页面尚未共享；P3 再接入真实共享成绩。

2026-10-12 已整理 [P2 收尾](docs/P2-closeout.md)和 [P3 待审核实施计划](docs/P3-implementation-plan.md)。建议以 B/60 秒作为共享阶段起点，P2 真机/性能缺口保留；P3 拟接入匿名持久身份、真实榜单、稳定地块、局次校验与结构化迁移验证。当前仍为 Sites 版本 3，没有数据库绑定或 P3 实现；本次文档整理没有重跑游戏测试或重新部署。

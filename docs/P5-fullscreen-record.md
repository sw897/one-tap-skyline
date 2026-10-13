# P5 全屏三维与二维码排版修订记录

2026-10-13，Asia/Shanghai，P5-05。应用44f589b9097bdcd81ccb0d58e689a2cc41c9f499 / p5-event-screen-preview.4实际保存并部署Sites12，终态succeeded；同一public受众、环境revision2/MCP、唯一原午夜任务保持。文档另提交，不改变应用或部署；完整阶段验收仍延期，P6未启动。

大屏查看（线上地址私存） · [此前二维码/表面修订记录](P5-display-fix-record.md)。

## 真实反馈与修改

用户明确反馈此前闪动问题已解决。这是用户手测反馈；机型、系统、浏览器版本及具体复测步骤未提供，没有据此推断全部设备或正式验收通过。用户同时要求二维码说明用小字置于上/下方，三维窗口铺满全屏。

本次采用说明置于二维码下方：扫码标题11px、说明9px，保持二维码白色静区与184px显示尺寸；删除右侧文字占位。只读大屏的三维画布覆盖浏览器整个内容窗口，标题、二维码、高楼榜和地图控制作为浮层；镜头继续按画布尺寸自动更新宽高比，控制移至左下方，动态提示移到二维码下方留出间距。

只改CSS布局并合并AGENTS条款；没有改上一版道路/河流修正、渲染器、主体楼体、玩法/计分、身份、照片、数据或午夜任务。不新增依赖/schema，不创建新站点或扩大受众。二维码文字排版也用于普通桌面城市，手机仍只显示自己的楼。

## 实际运行与留证

开发检查先在候选工作区执行，再关联上述应用提交；构建后运行输入未改。没有执行完整阶段验收或新的单元/压力套件。

| 实际操作 | 结果及边界 | 仓库外P5-05证据 |
| --- | --- | --- |
| 类型/生产构建 | 一次成功，既有大chunk/路由分类警告保留；不作为帧率/容量结论 | build.log |
| 本地启动 | 原有私有D1，只读test空城，HTML200；没有成绩、照片提交或清库。服务已停止，临时尺寸覆盖已恢复 | preview.log、preview-readiness.json、local-cleanup.json |
| 局部布局/截图 | 内置Chromium临时1920×1080，暂停巡游/全景；viewport与WebGL canvas均为x0/y0/1920×1080。二维码184×184，卡片210px宽，说明在下方且字体11/9px；榜名高楼榜、文字入口隐藏。实际捕获console error为空 | layout-facts.json、fullscreen-local-1080.jpg、console-errors.json、visual-review.json |
| Git/public审查与推送 | 2项待推路径、487可达对象、旧五图hash/metadata、完整内容/历史/tag检查无敏感发现；main与新候选tag已实际推送。批量读取校验所有对象正文，旧tag不移动；文档另审查/推送 | app-before-push-*、public-push.log、后续record审查 |
| Sites源码/部署 | 同项目helper返回44f589b，75文件构建包扫描通过；版本12从pending到succeeded，真实链接如上，post-publication回读active/public/owner/12。面板打开返回queued，不能当作线上视觉检查 | source-workflow-result.json、deployment-archive-audit.*、sites-saved.json、deployment-status-01.json、post-publication.json |

原始反馈、日志、实际截图/hash、完整历史/tag/资产与构建包审查、源码/平台回执及策划同步全文读回，保存在仓库外P5-05受控INDEX中；公开只放本经事实核对、审阅和脱敏的摘要，按[既定模板](development-record-template.md)继续记录。

## 未验证

本轮截图是本地明确标测试的空城，二维码是本地地址；没有录屏，没有把截图称为线上真实城。线上视觉/免登录、真实投屏与扫码、其他尺寸/跨设备、全屏画布的实际GPU/性能、完整玩法/照片/实际午夜清空仍未验证。旧数学/缓存、P3/P4套件未重新执行，不沿用旧结果冒称本轮通过。新增全屏与排版尚无用户手测反馈；先手工体验，完整验收安排保持。

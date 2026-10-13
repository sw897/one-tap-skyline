# P5 大屏二维码与表面修订记录

本篇保留Sites11开发时的事实与缺项。用户随后反馈闪动已解决，设备/版本/步骤未提供；Sites12全屏与小字二维码修订见[后续记录](P5-fullscreen-record.md)，不覆盖旧观察或推断全面验收。

2026-10-13，Asia/Shanghai，P5-04。应用3146dc9fdf5b38bdaad5b1b7338b5a4ab7a8cdaa / p5-event-screen-preview.3已保存并发布Sites11，终态succeeded；同一public受众、环境revision2、MCP与唯一原午夜任务保持。完整阶段验收未执行，P6未启动。文档整理另提交，不改变应用或部署。

大屏查看（线上地址私存）。[海岛修订记录](P5-island-update-record.md)保留此前Sites10的事实与缺项。

## 反馈、原因与实际修改

用户反馈二维码被榜单推到下方而无法完整显示，希望置于左上角标题下方；道路/河流/地面闪动，大屏不要盖楼链接，榜名改“高楼榜”。检查发现二维码处于榜单overflow容器最底部，多层地面覆盖间距仅0.002至0.01，交叉处没有深度偏移，城市镜头near0.1/far2500也不利于精度。

- 二维码移至独立标题区域，原生240px画布、大屏184px显示，保留白色静区；生成内容仍是当前站点手机入口。榜单和动态滚动不再推动二维码。
- 只读大屏隐藏盖楼按钮、底部盖楼引导与二维码旁的文字链接，保留扫码参与；手机和普通试玩页面保持入口。共享榜名改“高楼榜”，模拟榜名改“模拟高楼榜”，排序/成绩规则不变。
- 地面覆盖按公园/步道/路缘/路面/标线/岸边/水面分层，增大相邻高度间距并设置polygonOffset与renderOrder；保留正常深度测试/写入，避免简单关闭深度测试造成穿楼。城市相机near改1，far仍2500；主体楼体、计分、数据和每日重置不变。
- 本地首次只读截图又发现旧页头徽标与角标遮标题/二维码，追加修正：大屏隐藏重复页头和角标，标题旁仍明确保留共享测试数据标识。初次与修正后证据均保留，没有覆盖旧图。

## 实际运行、检查和版本

以下开发检查先在候选工作区执行，再关联上述最终应用提交；最终build-final后的运行源码未改，随后只补AGENTS条款。没有执行完整验收、游戏/上传/清空流程或新负载测试，没有新增依赖/schema。

| 实际项目 | 结果及边界 | 仓库外P5-04证据 |
| --- | --- | --- |
| 类型/生产构建 | 两次成功，第二次包含角标修正；大chunk/路由分类警告保留，不是性能验收 | build.log、build-final.log |
| 本地启动 | 原有私有本地D1启动，HTML200；练习12栋模拟楼/榜单10行，以及只读test空城，未提交成绩/照片。服务停止、临时视口已恢复 | preview*.log、preview-readiness.json、local-cleanup.json |
| 局部布局检查 | 内置Chromium临时1920×1080。模拟10行榜单时二维码完整且不在榜单中；最终只读页二维码184×184、x51/y89，盖楼按钮/链接/底部引导/重复角标均不可见，高楼榜名称正确 | practice-layout.json、display-layout-final.json、4张原始jpg |
| 局部视觉观察 | 暂停巡游、全景、旋转和缩放后保存视图，在这些局部视图未见明显交错斑块；最终捕获console error为空。静态截图不证明持续无闪动，未做逐帧录屏/真实GPU与投屏检查 | visual-review.json、console-errors-final.json、surface-practice-rotated.jpg |
| Git/public审查 | 6项待推路径、473可达对象与旧五图hash/metadata审查，无敏感发现；main和新候选tag实际推送。旧tag不移动，文档另审查/推送 | app-before-push-*、public-push.log、后续record审查 |
| Sites源码/发布 | 同项目helper返回3146dc9，75文件构建包扫描通过；实际版本11发布succeeded、真实链接如上。post-publication回读active/public/owner/11；打开面板返回queued，未当作线上视觉证明 | source-workflow-result.json、deployment-archive-audit.*、sites-saved.json、deployment-status-01.json、post-publication.json |

旧数学/缓存、P3/P4套件未重新执行；本次没有新的单元测试结果。此前Sites10线上查看超时属于旧记录，本轮未重跑线上视觉/免登录检查，不宣称该缺项已解决。

## 缺项、证据与后续

真实Chrome/投屏/GPU持续闪动是否消失、实际手机扫码、其他尺寸/跨设备、完整玩法/照片/午夜清空/性能仍未验证。本轮无新版用户手测反馈，无录屏；4张图是本地模拟或明确标测试的空城，二维码指向本地地址，不是真实玩家/排行榜或线上截图。

原始反馈、命令日志、初次重叠与修正后截图、hash、完整Git历史/tag和构建包审查、源码/平台回执、同步发送和全文读回留在仓库外P5-04受控索引；公开只放本经审阅摘要。按[记录模板](development-record-template.md)持续同步授权的策划会话。保持先手工体验、全部开发完成后统一验收的安排。

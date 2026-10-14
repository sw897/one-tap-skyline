# P5 第一批反馈修复记录

2026-10-14，Asia/Shanghai。证据P5-10。历史开发候选已发布Sites17；用户未复测，随后依用户要求回退线上至Sites16，源码保留。

## 反馈与实际修改

用户在Sites16反馈：近景楼名显示数量不合理、手机音画/触感不明显、入城和巡游切换过快且生硬。清缓存后补充Perfect实际有声，普通落层需要不同音效；又提出地块/道路重叠闪动、13层以上选色只改变外框。本记录保留反馈修正，不能把它写成所有音效失效。

修复逐栋楼名避让及近景锚点、普通/Perfect/失误可辨识合成音和试听按钮、较强落层反馈、条件振动；7秒连续曲线、6秒入城停留及18秒巡游停留。道路绕开玩家地块，原共面地面改为一张1536程序纹理；13层以上幕墙和玻璃屋顶随六色变化。三端楼体生成器、B/60秒、连击仅反馈和成绩/照片规则不变。[MDN兼容数据](https://github.com/mdn/browser-compat-data/blob/main/api/Navigator.json)显示iOS Safari不支持网页Vibration，不宣称iPhone触感实测通过。

应用commit为9a76921d6aeb4a8b7401701fcade9a6d509b730c，tag为p5-event-screen-preview.9；Sites17保存并发布succeeded，原public受众、环境revision2和午夜任务保持。[历史源码](https://github.com/sw897/one-tap-skyline/tree/9a76921d6aeb4a8b7401701fcade9a6d509b730c)。

## 实际检查、失败与缺项

Node22.22.2执行presentation、camera-presentation、feedback、appearance四个test文件，最终30/30；最终编译构建通过。最初尝试多边形裁剪造成Node堆内存耗尽(exit134)，改为有界纹理后通过；真实失败原件保留。9MiB是纹理基本像素大小，不是总内存或GPU性能结论。

本地1920×1080模拟12楼、近景、390×844普通落层局部观察有DOM/截图，未跑完整手机流程。线上新首页DOM曾看到试听入口，后续补截图时自建tab已丢失，线上首页截图未取得。实际iPhone听感、巡游节奏、道路闪动、安卓、真实投屏、76/160楼及20并发、真实无人值守午夜全清均未验证。第二批其余精修与P6未完成。

public推送前审查16文件、待推提交、全历史对象/tag、5张既有PNG哈希及元数据；预提交600对象、推送前624对象，敏感命中0，无强推、旧tag未移动。75文件部署包审查及平台规范化内容哈希关联通过。

完整原始反馈、失败/测试/构建/预览、截图、历史审查及Sites回执在仓库外evidence/p5-feedback-refinement；摘要曾按授权同步并全文读回，公开文档本次补齐。当前状态及后续简化见[P5缓存/入口与回退记录](P5-cache-entry-and-rollback-record.md)，历史不得冒充当前上线版本。

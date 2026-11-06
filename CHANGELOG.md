# Changelog

## [1.0.0](https://github.com/sw897/one-tap-skyline/releases/tag/v1.0.0) — 2026-11-06

首个带版本标签的公开发布 / First tagged public release.

- 60秒一指盖楼，逐层自动切换 X/Z；游玩、结算和城市复用同一套楼体几何。Perfect和连击仅提供反馈。
- 完整自托管版提供个人最佳、六街区76个城市展示位、排行榜、可选照片装饰及北京时间00:00重置。支持 Node.js、SQLite、文件存储和 Docker。
- GitHub Pages 提供免登录的单机模拟试玩和只读满城预览，含独立的试玩与开源项目二维码；Actions 自动发布静态试玩。
- 提供中英文介绍、模拟截图、反馈与部署服务入口、MIT许可证和第三方声明。
- 修复 Pages 自动发布遗漏根目录 `LICENSE` 变更的问题。

Pages 成绩与楼名只保存在当前页面，不与其他设备共享，也不接收照片；刷新或设备时钟换算的北京时间00:00重置。完整共享版当前没有楼名或照片内容审核，活动使用前应确定相应策略。真机、投影、自然跨午夜及容量验收仍需按实际部署环境完成。本次发布不更新现有 Docker 部署。

The release includes the full self-hosted game and a separate public, page-local Pages simulation. The demo has no shared scores or photo uploads. Shared deployments currently have no name/photo content moderation. Physical-device, projection, natural-midnight and capacity acceptance remain environment-specific. Existing Docker deployments are not updated by this release.

## Initial public source release

- One-finger tower stacking, personal-best towers, optional facade photos and a shared coastal city display.
- Node.js/SQLite/file storage, scoped game routes, daily reset and Docker deployment examples.
- Unit, browser-smoke and storage/gateway regression checks.
- User-facing Chinese and English introductions with clearly labeled simulated screenshots.
- MIT project license with third-party notices.

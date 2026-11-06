# GitHub Pages 模拟试玩 · Static demo

这个独立构建目标提供单机盖楼与只读满城预览。游玩、结算和城市继续复用同一套楼体几何与渲染代码，默认逐层换向、60秒、连击仅做反馈。

## 已发布入口

- [试玩说明与选择](https://sw897.github.io/one-tap-skyline/)
- [手机模拟试玩](https://sw897.github.io/one-tap-skyline/?mode=practice)
- [公开模拟大屏](https://sw897.github.io/one-tap-skyline/?mode=display&view=city&demo=full)

入口已验证可免登录访问，地址固定。日切只重置本页状态，不更换网址。

## 体验边界

- 只有当前页面的模拟成绩与作品，刷新或重新打开会重新初始化。没有跨浏览器、跨设备的共享城市与真实排行榜。
- 按设备时钟换算北京时间，每天00:00重载页面；后台或休眠页面在恢复可见、获得焦点或从历史页面恢复时检查补清。关闭页面后没有后台任务。
- 固定的76栋虚构样例仍用于大屏演示，重新初始化不意味着删除真实玩家数据；本目标没有真实玩家数据。
- 不提供照片选择、上传或保存；只允许读取同源静态运行配置和构建资源，不能向后端提交成绩、照片或清空请求。
- 模拟大屏只读且公开，没有管理操作，因此不设置访问口令。真正的管理功能应由服务端或网关认证保护；客户端口令不能保护公开静态资源。

本目标不连接任何完整活动部署。现有 Node/Docker 代码、网关、卷和线上部署保持独立。

## 本地预览

```sh
npm ci --ignore-scripts
npm run build:pages -- --base-path /
python -m http.server 5174 --bind 127.0.0.1 --directory pages-dist
```

打开本机 `http://127.0.0.1:5174/`，再选择手机模拟试玩或模拟大屏。模拟入口为 `?mode=practice`，大屏入口为 `?mode=display&view=city&demo=full`。

发布到项目路径时，构建的 `--base-path` 必须与实际 Pages 路径一致。`--site-url` 可设置对应的 HTTPS 公开首页；本地只允许使用回环 HTTP 地址。输出目录 `pages-dist` 不进入 Git，不包含服务端、数据库、照片或私密配置。

## Actions 发布

工作流 [pages.yml](../.github/workflows/pages.yml) 使用固定提交的官方 Actions，在 `main` 的相关构建输入变更后自动构建，也可手动触发。构建只读取代码和 Pages 配置；部署权限限于 Pages 与所需身份令牌，不读取或使用完整活动服务器凭据。

上传内容仅为静态 `pages-dist`。工作流不构建或发布 Docker 镜像，不更新其他站点，也不通过定时 Actions 执行游戏日切。公开 URL 采用平台实际部署结果，已完成访问验证并写入双语 README。

## English

This target is a public, page-local simulation: default 60-second tower stacking and a read-only city of 76 fictional towers. It shares the game's geometry/rendering code but has no shared scores, real rankings or photo uploads. Refreshing starts fresh; device-clock Shanghai midnight checks reload the page, including wake-up checks after background suspension. There is no server task while the page is closed.

The sample city contains no administrative actions or private data, so it is public without a password. Real administrative access requires server-enforced authentication. This target does not change the complete Node/Docker game or its deployment.

Use `npm run build:pages -- --base-path /` for local root preview. The Pages workflow publishes only the static artifact from `main`; it uses no production deployment credentials and does not deploy Docker. The verified [public demo](https://sw897.github.io/one-tap-skyline/) is linked in both READMEs. Its URL stays fixed while page-local state resets.

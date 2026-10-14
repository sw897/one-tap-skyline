# 运行与部署

同一源码保留两套构建目标，共用玩法、楼体、手机页面、大屏和API业务。两端各自保存数据、匿名身份和当天入口码，不同步成绩、照片或二维码；Git提交不会自动更新两端部署。

| 项目 | 云端Docker | ChatGPT Sites |
| --- | --- | --- |
| 构建 | `npm run build:node` | `npm run build`，发布时由Sites构建助手执行 |
| 运行入口 | Node服务，`npm run start:node` | Vinext/Cloudflare Worker；本地预览用`npm run preview` |
| 数据和照片 | SQLite及照片文件卷 | D1 `DB`及R2 `BUCKET`，声明见`.openai/hosting.json` |
| HTTPS | Caddy容器 | Sites平台 |
| 日切与草稿 | 服务内午夜定时器、每分钟维护和启动/请求补偿 | 既有平台午夜任务；接口提供日切/清理补偿 |

云端候选已部署，Sites保留原发布及public受众，两端版本可能不同。每次发布分别核对源码、配置、存储和回执；构建/部署成功不等于真实手机、无人访问午夜或性能验收通过，见[验收清单](acceptance-checklist.md)。

## Docker

一个Node游戏容器和一个Caddy容器。Node22.22.2使用自带SQLite，复用0000–0003 SQL；SQLite API仍属实验接口，基础镜像摘要固定，运行契约须实测。运行入口不依赖Wrangler或Workers。

真实配置存仓库外，从[安全示例](../deploy/runtime.env.example)填写域名和镜像。公开默认显示名“城市天际线”，活动显示名通过运行时配置指定，凭据、实际地址和玩家资料不提交。

```sh
docker compose --env-file /private/runtime.env build
docker compose --env-file /private/runtime.env up -d --no-build --wait
docker compose --env-file /private/runtime.env ps
```

主机Nginx继续监听80并承载原网站，仅新增[游戏虚拟主机](../deploy/nginx-game.conf.example)，转发到`127.0.0.1:18080`，保持Host，支持Caddy证书验证和HTTPS重定向。Caddy监听空闲公网443，游戏8080仅在内部网络。新增配置先检查，再平滑加载；失败只撤除本次新增文件，不改既有网站/GitLab。检查DNS、80/443及安全组，部署前后比较原网站响应/配置摘要、GitLab容器/端口/挂载。

固定卷为`skyline_game_db`、`skyline_game_photos`、`skyline_caddy_data`、`skyline_caddy_config`。更新/重启保留卷，不使用`down -v`。容器以非root用户、只读根目录及资源限制运行。镜像/上下文只含公开安全构建输入，不打包密钥、Git历史、私有证据或玩家数据。

数据库串行短事务，正文读取/图片解码/文件IO在事务外，最终保存复核游戏日。迁移只执行缺失版本，校验失败保留数据库。北京时间00:00逻辑清空八张游戏表，保留基础日标记和SQL版本；旧媒体失效后回收旧日文件/元数据。失败和跨日未结束上传保留清理pending并重试；同日重启保留作品，跨日启动先补偿再开放写入。

`/health/live`检查进程响应，`/health/ready`显示版本、就绪、维护及清理pending。首页200不代替就绪，pending不能视为物理清空完成。照片只经业务接口提供，不公开照片卷目录。固定PUBLIC_ORIGIN，保持Secure/HttpOnly匿名cookie、同源限制及可信代理地址头；HTML/配置/游戏数据禁缓存，指纹资源长期缓存。

更新时核对源码/镜像/SQL/配置/卷和就绪。回退仅用与当前SQL兼容的镜像，保留卷，不恢复到期数据。目标服务器拉取基础镜像曾超时，当前导入已校验的本机构建Linux amd64镜像；归档SHA256和RootFS层摘要须匹配，不能把导入启动记为目标冷构建通过。

## Sites

保留现有项目ID、D1/R2绑定、构建插件及受众。发布使用Sites技能的构建/源码准备/保存版本/部署工具，不以Node入口替代Worker，也不把Node镜像上传为Site。

本地构建用`npm run build`，共享预览需按[README](../README.md)在仓库外初始化D1。构建避开仍运行的预览目录，可用同一Git提交的临时工作区；SQL、配置和发布归档分别审查。公开发布遵循用户批准范围，记录版本及实际回执，不从一个目标发布推断另一个已更新。

保留Sites现有发布及午夜任务，不搬迁原数据；Sites任务不清理Docker卷。两套入口不表示采用相同后端实现或完成同一轮验收。

## 体验与记录

大屏`/?mode=display&view=city`展示当天二维码；手机沿用扫码取得的完整entry参数，无参数或昨日参数不能开局。满城模拟`/?mode=display&view=city&demo=full`明确标模拟数据，不写真实成绩，也不提供参与二维码。

按[记录模板](development-record-template.md)关联提交、构建、实际结果、失败和未验证项。真实地址、原始反馈、日志、截图/录屏在仓库外私存，公开材料审阅脱敏；不新建Git阶段tag。

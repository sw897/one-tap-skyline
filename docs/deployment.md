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

真实配置存仓库外，从[安全示例](../deploy/runtime.env.example)填写域名和镜像。Docker要求合法的`GAME_ID=skyline`，统一使用`/skyline/`；`PUBLIC_ORIGIN`保持纯源地址。大屏为`/skyline/?mode=display&view=city`，二维码为`/skyline/?mode=shared&v=<构建>&entry=<当日码>`。旧根页面/接口/资源返回404；仅`/skyline`规范为带斜杠路径并保留参数。公开默认显示名“城市天际线”，活动显示名通过运行时配置指定，凭据、实际地址和玩家资料不提交。

```sh
docker compose --env-file /private/runtime.env build
docker compose --env-file /private/runtime.env up -d --no-build --no-deps --wait game
docker compose --env-file /private/runtime.env ps
```

主机Nginx继续监听80并承载原网站，仅新增[游戏虚拟主机](../deploy/nginx-game.conf.example)，转发到`127.0.0.1:18080`，保持Host，支持Caddy证书验证和HTTPS重定向。Caddy监听空闲公网443，游戏8080仅在内部网络。新增配置先检查，再平滑加载；失败只撤除本次新增文件，不改既有网站/GitLab。检查DNS、80/443及安全组，部署前后比较原网站响应/配置摘要、GitLab容器/端口/挂载。

### 共享网关配置

`SKYLINE_GATEWAY_DIRECTORY`必须指向仓库外已有目录，整体只读挂载到网关`/etc/caddy`。其中`Caddyfile`保留所有其他站点原配置，并以独立一行`import /etc/caddy/skyline.caddy`导入本游戏；`skyline.caddy`初始内容取[游戏规则模板](../deploy/Caddyfile)。首次拆分须校验拆分前后路由等价，不能覆盖现有共享根配置。仓库checkout、复制单游戏模板均不会改动实际共享根配置。

共享后端网络直接声明在主`compose.yaml`，私有环境文件必须设置`SKYLINE_SHARED_NETWORK`为已存在的外部网络名；该网络不由本游戏创建/删除。缺项时Compose拒绝解析，不靠可选覆盖文件保留网络。主题部署另带`compose.theme.yaml`。后续所有Compose和助手命令须使用同一组文件；增加更多共享网络时也须持久声明，助手拒绝遗漏任何实际网络。

```sh
python3 scripts/gateway.py --file compose.yaml --file compose.theme.yaml --env-file /private/runtime.env check
```

[网关助手](../scripts/gateway.py)仅原子替换本游戏导入文件，不写共享根配置或其他站点文件；`admission`、`maintenance`、`open`分别用于阻止新登记/开局、游戏维护和恢复游戏规则。候选先完成`caddy adapt`和`caddy validate`，使用实际镜像、权限、只读挂载及环境；检查其他路由后才写入并加载。共享文件或实际/声明网络不一致时拒绝。重载或加载后核对失败时，仅恢复先前有效的游戏文件；若之前是维护状态，就恢复维护状态，不覆盖共享根或更换旧镜像。

`check`确认当前磁盘与实际加载的完整路由一致，并在网关目录旁私存一份权限0600的`<目录名>-skyline-good.json`，保存最后有效游戏规则、共享文件摘要及部署绑定；每次成功更新也刷新此记录。首次启用新助手时须在健康网关上执行`check`建立记录。记录是基础设施元数据，不属于每日清空数据，不进入源码或公开资产。

网关已停止、退出或容器缺失时，显式使用同一组参数调用`recover`。它要求已有有效记录，核对共享文件、实例与完整部署/网络配置；用不发布端口的一次性同配置容器完整校验，再恢复本游戏文件并启动网关。缺少记录、共享文件改变或绑定不符时拒绝，不能据此认领不明配置。恢复完成后仍保留原来的游戏开放/维护状态；确需开放再单独`open`。网关正常运行时不允许`recover`。

普通游戏更新先用助手`admission`、检查局次与上传收尾，再`maintenance`，只停止/更新`game`；就绪及卷核对通过后`open`。这些步骤不替代原有收尾检查。需要重建网关时用相同参数调用助手`recreate`，它先核对路由和所有网络，再仅重建`gateway`并复查；443连接会短暂重连。不要复用历史私有整文件覆盖脚本，不将`docker compose up`整个项目作为普通游戏更新步骤。

保护回归：`python3 tests/gateway-deploy.test.py`。本地隔离与真实重建结果须分别留证，不将规则比较视为其他站点完整业务验收。

数据库/照片卷必须通过`SKYLINE_DB_VOLUME`、`SKYLINE_PHOTOS_VOLUME`显式指定，缺项时Compose拒绝解析。原游戏仍使用`skyline_game_db`、`skyline_game_photos`；未来其他游戏使用不同项目、卷、内部网络及唯一后端别名。显式卷名不随项目名自动隔离。启动前核对路径、实例、代理与实际挂载，禁止候选和旧进程并行挂正式写卷。证书卷`skyline_caddy_data`、`skyline_caddy_config`仅网关使用。不使用`down -v`。容器以非root用户、只读根目录及资源限制运行。镜像/上下文只含公开安全构建输入，不打包密钥、Git历史、私有证据或玩家数据。

Node在数据库和照片根目录各保存基础设施标记`.game-id`；先核对两处，再打开SQLite、执行SQL版本检查及日切。实例不匹配立即停止，不读取/清空业务数据。仅空目录首次初始化可登记；所有实例（包括`skyline`）均拒绝非空无标记目录，不自动认领旧卷。已有数据必须保留原标记；标记丢失时停止启动，先核查实际挂载与归属，不靠删除数据或自动重建标记绕过检查。标记不属于每日游戏数据，不上传、不对外提供。无需修改SQL schema或玩家身份。

数据库串行短事务，正文读取/图片解码/文件IO在事务外，最终保存复核游戏日。迁移只执行缺失版本，校验失败保留数据库。北京时间00:00逻辑清空八张游戏表，保留基础日标记和SQL版本；旧媒体失效后回收旧日文件/元数据。失败和跨日未结束上传保留清理pending并重试；同日重启保留作品，跨日启动先补偿再开放写入。

容器内`/health/live`检查进程响应，`/health/ready`显示实例/路径、版本、就绪、维护及清理pending；公网不开放根健康接口。首页200不代替就绪，pending不能视为物理清空完成。照片只经带前缀业务接口提供，不公开照片卷目录。Cookie为`skyline_session`、Path=`/skyline/`，成绩和照片共用策略，不读旧Cookie；其他实例使用独立名称。偏好键按游戏命名，不清空同域其他游戏存储。固定PUBLIC_ORIGIN，保持Secure/HttpOnly、同源限制及可信代理地址头；HTML/配置/游戏数据禁缓存，指纹资源长期缓存。

更新时核对源码/镜像/SQL/配置/卷和就绪。共享网关必须保留现有完整站点配置，只调整目标游戏规则；不能以仓库内单游戏示例覆盖其他站点。先通过临时网关规则阻止新登记和新局，允许既有提交/照片收尾；检查有效局次及在途请求后切换为完整维护，停止旧游戏进程再启动新应用。只有本地空卷可用于候选启动预检，不能把正式卷作为预检数据。本次全新应用部署不准备旧镜像回退；失败维持维护并修复新候选，保留持久卷、不提前清库。目标服务器拉取基础镜像曾超时，当前导入已校验的本机构建Linux amd64镜像；归档SHA256和RootFS层摘要须匹配，不能把导入启动记为目标冷构建通过。

正式Node实例只允许public城，重复参数拒绝；本地隔离检查可显式设置`SKYLINE_ALLOW_TEST_CITIES=1`启用开发测试城，生产禁止。关闭测试城后，已有测试局次的读取/提交/取消以及原图/缩略图按ID访问也返回404；不靠删库掩盖访问边界。打开和开局必须有当天entry，即使已有Cookie也不例外；提交复用本游戏当日局次，不再扫码。v不表示资格或历史部署。每个实例只操作自己的数据库和照片卷，午夜只清自己数据。同源路径和Cookie Path不提供互不信任应用之间的完整安全隔离。

### 可选活动主题

Docker可通过仓库外只读目录加载主题，无需把活动名称/素材写入源码或镜像。将[中性示例](../deploy/theme.example.json)另存为私有目录中的`theme.json`，在私有运行环境文件设置`CITY_DISPLAY_NAME`和`SKYLINE_THEME_DIRECTORY`。后者是主机绝对路径，目录和文件须允许容器非root用户读取；禁止把目录指向玩家照片卷或公开静态目录。

```sh
docker compose -f compose.yaml -f compose.theme.yaml --env-file /private/runtime.env config --quiet
docker compose -f compose.yaml -f compose.theme.yaml --env-file /private/runtime.env up -d --no-build --no-deps --wait game
```

主题包含完整标题、活动短名、首页标语、既有展馆显示名和六位十六进制点缀色。城市名只取`CITY_DISPLAY_NAME`。可选`logoFile`仅接受同目录`logo.png`、`logo.jpg`、`logo.jpeg`或`logo.webp`，最大512KiB；未提供或无法读取时使用文字。不提供目录浏览或原始配置下载，只公开校验后的展示字段和选定Logo。配置和Logo独立于午夜照片清理。

未配置主题时保持中性默认；明确配置但文件/必填字段/城市名无效则在打开数据库前停止启动。主题启动时读取，改配置后重启游戏容器，并在局间刷新手机和大屏；仅换配置不会改变源码构建标识。更新须检查主题文件/素材及挂载配置，保留数据和证书卷。

更名和主题切换不清空当天作品/照片、不更新当天入口码，午夜照常重置。当前Compose固定项目/卷名，单独Git分支不提供数据隔离；并行实例需另设存储及网关路由。本次活动主题只更新Docker，Sites现有发布、受众和任务保持。

## Sites

保留现有项目ID、D1/R2绑定、构建插件及受众。发布使用Sites技能的构建/源码准备/保存版本/部署工具，不以Node入口替代Worker，也不把Node镜像上传为Site。

本地构建用`npm run build`，共享预览需按[README](../README.md)在仓库外初始化D1。构建避开仍运行的预览目录，可用同一Git提交的临时工作区；SQL、配置和发布归档分别审查。公开发布遵循用户批准范围，记录版本及实际回执，不从一个目标发布推断另一个已更新。

保留Sites现有发布及午夜任务，不搬迁原数据；Sites任务不清理Docker卷。两套入口不表示采用相同后端实现或完成同一轮验收。

## 体验与记录

大屏`/?mode=display&view=city`展示当天二维码；手机沿用扫码取得的完整entry参数，无参数或昨日参数不能开局。满城模拟`/?mode=display&view=city&demo=full`明确标模拟数据，不写真实成绩，也不提供参与二维码。

按[记录模板](development-record-template.md)关联提交、构建、实际结果、失败和未验证项。真实地址、原始反馈、日志、截图/录屏在仓库外私存，公开材料审阅脱敏；不新建Git阶段tag。

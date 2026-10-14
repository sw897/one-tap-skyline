# Docker 候选运行与共存部署

一个Node游戏容器和一个Caddy容器。Node复用游戏、楼体、API及原0000–0003 SQL，使用Node22.22.2自带SQLite与照片文件卷；该版本SQLite API仍属实验接口，镜像固定摘要并执行实际契约检查。Sites构建保留，Docker启动不依赖Wrangler或Workers。

## 共存入口

保留主机Nginx的80端口及原虚拟主机。仅为游戏子域名新增[配置示例](../deploy/nginx-game.conf.example)，转发到`127.0.0.1:18080`，保持Host。Caddy接收此HTTP入口用于ACME及HTTPS重定向，并监听空闲公网443；游戏8080仅在内部网络。此方式符合[Caddy HTTP验证转发要求](https://caddyserver.com/docs/automatic-https#http-challenge)。新增配置先检查，再平滑加载；失败只撤除本次新增文件，不改原网站/GitLab。上线前后比较原站点状态、配置摘要及GitLab容器/卷/端口。

## 构建和启动

实际配置存仓库外，从[安全示例](../deploy/runtime.env.example)填写域名及镜像；显示名默认“城市天际线”。DNS及80/443须公网可达，SSH和真实运行值不提交。

```sh
docker compose --env-file /private/runtime.env build
docker compose --env-file /private/runtime.env up -d --no-build --wait
docker compose --env-file /private/runtime.env ps
```

同一候选源码/镜像部署，基础镜像摘要见[Dockerfile](../Dockerfile)与[Caddy构建](../deploy/Caddy.Dockerfile)。上下文采用允许清单，最终游戏镜像只有Node构建物、SQL及包元数据，无密钥、私有证据、Site数据或原照片。

固定卷为`skyline_game_db`、`skyline_game_photos`、`skyline_caddy_data`、`skyline_caddy_config`。普通更新/重启保留卷，不使用`down -v`。游戏与Caddy用非root用户、只读根文件系统和CPU/内存限制。不能更新既有GitLab容器、删除其网络/卷或占用其端口。

## 状态与数据边界

`/health/live`区分进程响应，`/health/ready`显示初始化/日切就绪、版本、最近维护和文件清理pending。首页200不代替游戏就绪，pending不表示物理清空完成。照片只经业务接口，不公开卷目录。固定Origin和Secure匿名cookie保持，Caddy覆盖客户端地址头，Node不相信外部CF/转发头。

维护按北京时间午夜触发，每分钟检查草稿/失败清理，启动和请求也补偿日切。八张游戏表清空，game_clock及SQL版本保留。慢正文/上传不锁日切，最终事务复核游戏日；旧日写后拒绝关联并回收，删除失败保留pending，后续补偿不删新日文件。同日重启保留数据，跨日启动先补偿后开放写入。

更新后确认版本、卷、SQL和就绪。回退仅用与当前SQL兼容的镜像，保留卷，不恢复已到期数据。云端从空城开始，与Sites数据、匿名cookie及二维码独立；Sites入口/任务处理需用户另行决定。

## 体验及验收

大屏为`/?mode=display&view=city`，手机使用其当天二维码。满城模拟为`/?mode=display&view=city&demo=full`，不写成绩。开发检查先于用户体验，真实手机、投屏、容量性能、无人访问的真实午夜及统一验收分开留证。

压力脚本改为固定76展示位、超员保留作品、1920×1080只读大屏和统一单调时钟。须在新隔离卷test城运行，不向public灌数据。`measure=1`仅在test大屏启用采样，确认提交后的完整正确模型已进入实际渲染帧；HTTP及照片就绪分开，不冒充手机或像素识别。脚本准备/语法检查不代表已执行性能验收。

# 部署 drawless Alpha

## 运行边界

部署一个 web、一个 server，以及可选的一个 coworker runtime。当前内存房间不能在多个 server 副本之间分配；请将 server 副本数固定为 1。退出最后一个连接 30 分钟后或 server 重启时清空画布。coworker 空闲 30 分钟后退出，但其 presence 可能在此之前让 server 房间保持连接。

媒体目前内联到文档中，没有对象存储。WebSocket 单条消息限制 1 MiB，HTTP body 限制 64 KiB；大图片等资产不属于当前可靠支持范围。房间上限 100、单房间连接上限 32；coworker 最多 64 个房间、全局最多 8 个同时进行的模型请求、每房间最多 1 个。模型请求最长 120 秒；cursor chat 最长 60 秒。

这些上限控制基本资源使用，不构成多租户计费、日费用预算或抗流量攻击方案。公网试用部署还应在入口限制新建房间、WebSocket 连接频率和 AI 请求量，配置模型提供方的账户预算。

## 构建和启动

仓库根目录执行 `pnpm install --frozen-lockfile && pnpm build`。需要 Node.js 22.13+ 或 24.x、pnpm 9.15.0。

| 服务 | 仓库根目录启动命令 | 健康检查 |
| --- | --- | --- |
| web | `pnpm --filter @drawless/web start` | `/` 返回 307，不能要求仅 200 |
| server | `pnpm --filter @drawless/server start` | `/health`、`/ready` |
| coworker | `cd apps/coworker && node .mastra/output/index.mjs` | 带内部 Bearer token 请求 `/drawless/rooms/healthcheck/coworker/status` |

构建产物不是跨操作系统的通用包；建议在目标平台完成安装和构建。Mastra 会生成独立 `.mastra/output` 依赖，发布时也应扫描该输出；仓库锁文件不代替输出依赖的检查。

server 本地启动会读取 `apps/server/.env`，web 读取 Next 支持的 `.env*`，coworker 开发由 Mastra 读取其 `.env`。生产建议由部署平台注入变量；直接运行 runtime 时可用 `node --env-file=.env .mastra/output/index.mjs` 显式加载配置。不要上传 `.env`。

## 必须配置的访问边界

生成两份独立随机密钥，每份至少 32 字符：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

- web、server 使用相同的 `DRAWLESS_ROOM_ACCESS_SECRET`。
- server、runtime 使用相同的 `COWORKER_CONTROL_TOKEN`；不启用 coworker 时无需设置。
- 三个服务设置 `NODE_ENV=production`。server/runtime 需要接受平台连接时设置 `HOST=0.0.0.0`，通过内部网络和防火墙保护 runtime。
- `ALLOWED_ORIGINS` 必须列出实际 web origin，例如 `https://draw.example.com`，不能使用 `*`。
- `COWORKER_BASE_URL` 使用 runtime 的内部 HTTP(S) 地址。runtime 不需要公开域名，不接受带 Origin 的浏览器请求；生产也不开放 Mastra 默认管理 API。
- `SERVER_PUBLIC_URL` 和 runtime 的 `DRAWLESS_SYNC_SERVER_URL` 必须指向同一可拨号的 sync server 地址。runtime 拒绝请求体指定的其他目标。
- 浏览器使用 `NEXT_PUBLIC_DRAWLESS_SYNC_SERVER_URL` 和 `NEXT_PUBLIC_DRAWLESS_SERVER_URL` 连接对外 server HTTPS 地址。
- `SYNC_ROUTE` 改变时，web 的 `NEXT_PUBLIC_DRAWLESS_SYNC_ROUTE` 必须同步改变。server 会把实际路由交给 runtime。
- 配置部署者自己的 `NEXT_PUBLIC_TLDRAW_LICENSE_KEY`。参考 [tldraw 许可说明](https://tldraw.dev/community/license)，应用自有代码的许可不代替 SDK 授权。

`NEXT_PUBLIC_*` 变量在 web 构建时写入浏览器资源，改变后必须重新构建。两项服务端密钥严禁加上 `NEXT_PUBLIC_` 前缀。

## 分享链接与迁移

首页按请求生成新房间和 7 天有效的签名链接：`/rooms/:roomId#access=…`。所有持有完整链接的人拥有该房间的读取、编辑、启停 Drew、对话和审批能力，当前不区分只读访客与管理员。roomId 本身不是凭据；不能去掉 `#access` 后分享。

凭据通过 HTTP Authorization 和 WebSocket 查询参数传给 server。URL fragment 不会随初始网页请求或 Referer 发送；WebSocket URL 仍可能进入代理日志，因此应在代理、APM 和错误收集中去掉查询参数。server 自身请求日志已去掉 URL 查询和 Authorization。

旧版无签名房间地址在启用密钥后不能继续使用。有效期届满后需要新房间；当前没有续签/单链接撤销界面。轮换房间签名密钥会一次性撤销所有旧链接，需要同步更新 web 和 server。

只有本机开发且没有配置密钥时允许无凭据访问；不要通过反向代理把这种模式暴露到公网。

## 会话、审批与数据

- 画布：server 进程内内存；没有备份和恢复承诺。
- 审批：server 和 runtime 都是进程内状态，30 分钟过期，绑定 room/run/toolCall，不能重放。任一服务重启或 runtime 房间停止后，旧审批需要重新生成。
- 对话界面：React 内存，刷新后不恢复正文；server 可返回未过期的待审批记录。不能把产品的持续同事定位理解为已实现持久化历史。
- runtime 默认 `COWORKER_STORAGE_MODE=memory`。`file` 会在运行目录保存 `mastra.db`；仅在具备访问控制、保留和删除策略时使用。新房间生命周期使用新的模型 conversation thread，避免读取旧画布阶段的对话。
- `COWORKER_OBSERVABILITY_ENABLED=false` 是默认值；开启会记录模型追踪。配置 `MASTRA_PLATFORM_ACCESS_TOKEN` 还会启用远端 exporter。
- cursor chat 正文不写应用日志，但启用 AI 时消息及上下文仍会发送给模型提供方。
- `FEEDBACK_ENABLED=false` 是默认值。启用时必须配置自己的 `GITHUB_FEEDBACK_REPOSITORY` 和仅有该仓库 Issue 写权限的 `GITHUB_FEEDBACK_TOKEN`；用户反馈将成为该仓库 Issue。

默认忽略 `X-Forwarded-For`。仅在明确掌握代理 IP/CIDR 时配置 `TRUSTED_PROXIES`，否则按代理地址聚合限流比信任任意客户端头更稳妥。

# drawless

drawless 是一块由人和数字同事共同参与的协作画布。除了与其他用户实时编辑同一个 tldraw room，用户还可以直接找到驻留在画布中的 Coworker，与他聊天、讨论想法、交代工作、反馈结果、审核计划并接收交付。

Coworker 不是带 session 列表和“新建会话”的通用 AI Chat。人物代表一位持续存在的同事，room 代表共同工作的场所；一次回复结束、关闭交流界面或页面刷新，都不应在产品心智上重置双方关系。

详细定位见 [Drawless Coworker 产品定位](./specs/coworker-product-positioning.md)。

## 产品目标

- 使用 tldraw 作为人与 Coworker 共同工作的唯一画布事实源。
- 通过 tldraw sync 让用户、其他协作者和 Coworker 进入同一个 room。
- 让普通聊天、工作交代、反馈、计划审核、执行和交付形成连续的同事协作体验。
- 让正式画布操作经过结构化计划与明确审批，避免从模糊对话中获得隐式授权。
- 将共享契约统一放在 `packages/shared`，避免前端、server 和 Coworker 各自定义一套事实。

## 产品边界

- 不做带 session 侧栏和“新建对话”的通用 AI Chat。
- 不把 Coworker 做成只接收命令、每条消息都触发执行的任务机器人。
- 不让 Coworker 绕过审批和协同边界直接修改画布。
- 不做复杂权限、账号、空间管理。
- 不做生产级资产存储。
- 不做持久化协同存储；当前房间数据只存在当前 Node 进程内。

## 项目结构

```txt
drawless/
  apps/
    web/       Next.js 前端，负责路由、tldraw 挂载、协同客户端连接
    server/    Fastify 后端，负责 tldraw sync WebSocket 房间
    coworker/  Mastra Coworker，负责画布观察、沟通、计划与受控操作
  packages/
    shared/    共享类型、Zod schema、房间、审批和画布操作契约
```

更多架构说明见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 本地运行

安装依赖：

```bash
pnpm install
```

启动协同后端：

```bash
pnpm dev:server
```

启动 Next 前端：

```bash
pnpm dev
```

默认地址：

- 前端：http://127.0.0.1:3000
- 后端健康检查：http://127.0.0.1:3001/health
- 后端就绪检查：http://127.0.0.1:3001/ready
- WebSocket 协同路由：`ws://127.0.0.1:3001/sync/:roomId`

## 环境变量

前端：

- `NEXT_PUBLIC_DRAWLESS_SYNC_SERVER_URL`：协同后端基础地址，默认 `ws://127.0.0.1:3001`。
- `NEXT_PUBLIC_DRAWLESS_SERVER_URL`：普通 HTTP 控制接口基础地址，默认跟随协同后端地址。

后端：

- `HOST`：监听主机，默认 `127.0.0.1`。
- `PORT`：监听端口，默认 `3001`。
- `SYNC_ROUTE`：WebSocket 协同路由前缀，默认 `/sync`。
- `ALLOWED_ORIGINS`：允许访问协同服务的浏览器来源列表，使用逗号分隔。
- `COWORKER_ENABLED`：是否启用 coworker 控制代理，默认 `false`。
- `COWORKER_BASE_URL`：coworker 服务基础地址，启用 coworker 时使用。
- `SERVER_PUBLIC_URL`：server 对外可访问地址，coworker 进入 sync room 时使用。

Railway 部署配置见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

## 验证

```bash
pnpm check
```

当前验证内容：

- `packages/shared`：单测、类型检查、构建。
- `apps/server`：单测、类型检查、构建、协同 smoke 测试。
- `apps/web`：单测、类型检查、Next 构建。

## Coworker 边界

- 共享契约入口：`packages/shared/src/index.ts`
- Coworker 需要理解画布时，通过只读上下文工具观察 tldraw document。
- Coworker 需要修改画布时，通过受控编辑工具提交计划并等待明确审批。
- 底层可以使用 thread、run 或 sessionId 完成技术控制，但这些概念不进入用户可见的信息架构。

## tldraw sync 取舍

参考 [tldraw sync 文档](https://tldraw.dev/docs/sync)，生产级协同通常需要保证同一个房间在全局只有一个 `TLSocketRoom`。drawless 当前只做本地轻量骨架：

- 同一个 Node 进程内，同一 `/rooms/:roomId` 会共享画布。
- 后端重启后房间数据会丢失。
- 当前资产使用 `inlineBase64AssetStore`，只适合轻量验证。
- 后续持久化优先在 `apps/server/src/sync/room-registry.ts` 替换为 SQLite 或 Cloudflare Durable Objects 方案。

# drawless

drawless 是一个重新梳理后的轻量协作画布项目。当前阶段只关注项目逻辑和需求逻辑，不做 UI 优化，也不接入 AI 能力。

## 当前目标

- 保留 tldraw 作为唯一画布编辑器。
- 保留基于 tldraw sync 的后端协同能力。
- 使用当前 monorepo 结构组织前端、后端和共享类型。
- 使用 Next.js 承载同构前端入口。
- 将后续 AI 接入可能需要复用的类型统一放在 `packages/shared`。

## 当前不做

- 不做 AI agent、聊天、补全、画布自动编辑。
- 不做产品化 UI、视觉设计、动效、品牌优化。
- 不做复杂权限、账号、空间管理。
- 不做生产级资产存储。
- 不做持久化协同存储；当前房间数据只存在当前 Node 进程内。

## 项目结构

```txt
drawless/
  apps/
    web/       Next.js 前端，负责路由、tldraw 挂载、协同客户端连接
    server/    Fastify 后端，负责 tldraw sync WebSocket 房间
  packages/
    shared/    共享类型、Zod schema、房间和会话校验
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

后端：

- `HOST`：监听主机，默认 `127.0.0.1`。
- `PORT`：监听端口，默认 `3001`。
- `SYNC_ROUTE`：WebSocket 协同路由前缀，默认 `/sync`。
- `ALLOWED_ORIGINS`：允许访问协同服务的浏览器来源列表，使用逗号分隔。

## 验证

```bash
pnpm check
```

当前验证内容：

- `packages/shared`：单测、类型检查、构建。
- `apps/server`：单测、类型检查、构建、协同 smoke 测试。
- `apps/web`：单测、类型检查、Next 构建。

## 后续接 AI 的位置

当前只保留类型入口，不实现 AI 行为：

- 共享类型入口：`packages/shared/src/index.ts`
- AI 扩展点类型：`DrawlessAiExtensionPoint`
- 后续 AI 不应直接绕过 tldraw sync 修改画布，应通过明确的服务端边界接入。

## tldraw sync 取舍

参考 [tldraw sync 文档](https://tldraw.dev/docs/sync)，生产级协同通常需要保证同一个房间在全局只有一个 `TLSocketRoom`。drawless 当前只做本地轻量骨架：

- 同一个 Node 进程内，同一 `/rooms/:roomId` 会共享画布。
- 后端重启后房间数据会丢失。
- 当前资产使用 `inlineBase64AssetStore`，只适合轻量验证。
- 后续持久化优先在 `apps/server/src/sync/room-registry.ts` 替换为 SQLite 或 Cloudflare Durable Objects 方案。

# drawless 架构说明

本文档记录当前阶段的项目逻辑和需求边界。当前阶段不追求 UI 表达，只保证协作画布链路清晰、可验证、可扩展。

## 架构目标

drawless 的核心目标是保留一个最小 tldraw 协作系统：

- 前端负责房间路由、浏览器身份、tldraw editor 挂载。
- 后端负责 WebSocket 协同连接和 `TLSocketRoom` 生命周期。
- 共享包负责跨前后端复用的类型、schema 和校验逻辑。
- AI 能力以后接入，但当前不进入运行链路。

## 包职责

| 包 | 职责 |
| --- | --- |
| `apps/web` | Next.js 应用。根路径创建房间并跳转到 `/rooms/:roomId`；房间页挂载 tldraw；客户端用 `@tldraw/sync` 连接后端。 |
| `apps/server` | Fastify 服务。提供 `/health`、`/ready` 和 `/sync/:roomId` WebSocket 路由；每个房间映射一个进程内 `TLSocketRoom`。 |
| `packages/shared` | 共享类型和 Zod schema。包含房间 ID、会话 ID、参与者身份、协同配置、服务状态、AI 扩展点等契约。 |

## 当前运行链路

1. 用户访问 `/`。
2. Next 根页面生成房间 ID。
3. 浏览器跳转到 `/rooms/:roomId`。
4. `CanvasShell` 在客户端创建或读取浏览器设备 ID。
5. 当前标签页生成临时标签页 ID。
6. 前端组合出 tldraw sync 会话 ID。
7. 前端根据 `NEXT_PUBLIC_DRAWLESS_SYNC_SERVER_URL` 拼出 WebSocket 房间地址。
8. `useSync` 创建 tldraw 远程 store。
9. 后端 `/sync/:roomId` 接收 WebSocket。
10. 后端校验来源、房间 ID、会话 ID。
11. 后端从房间注册表获取或创建 `TLSocketRoom`。
12. 多个客户端连接同一房间时，共享同一份进程内协同状态。

## 后端协同模型

当前后端使用：

- `Fastify`
- `@fastify/websocket`
- `@tldraw/sync-core`
- `InMemorySyncStorage`

当前注册表只保证当前 Node 进程内每个房间 ID 对应一个 `TLSocketRoom`。这足够用于本地逻辑梳理，但不是生产级多实例方案。

生产化需要补充：

- 全局唯一房间调度。
- 可持久化的协同存储。
- 大文件资产存储。
- 认证和授权。
- 上传大小限制和速率限制。

## 前端模型

当前前端只保留必要壳层：

- 顶部显示项目名、同步状态、当前设备/标签页、房间链接。
- 主区域完全交给 tldraw。
- 不添加自定义工具栏。
- 不添加 AI 面板。
- 不添加产品化视觉设计。

前端关键模块：

- `src/components/canvas-shell.tsx`：房间页面客户端组合根。
- `src/lib/sync-config.ts`：协同地址和会话配置。
- `src/lib/device-identity.ts`：浏览器设备 ID。
- `src/lib/room-route.ts`：房间 ID 和路由决策。

## 共享类型策略

`packages/shared` 是后续扩展的类型入口。当前要求：

- 前后端共享的结构都优先放在 shared。
- 每个类型属性保留中文注释。
- 运行时边界尽量配套 Zod schema。
- AI 相关类型先保留扩展点，不实现行为。

## AI 接入边界

当前 AI 不进入项目运行链路。后续接入时建议遵守：

- AI 不直接操作浏览器里的 tldraw editor。
- AI 相关输入、输出、上下文、动作契约先进入 `packages/shared`。
- AI 对画布的修改需要通过明确的后端或前端受控边界。
- tldraw 文档仍然是画布事实源，不再维护第二套图结构事实源。

## 当前存储边界

当前存储是进程内存：

- 适合本地验证协同链路。
- 后端重启会丢失画布数据。
- 多进程或多实例部署会导致同一房间分裂。

后续持久化改造优先位置：

- `apps/server/src/sync/room-registry.ts`
- 将 `InMemorySyncStorage` 替换为 `SQLiteSyncStorage`
- 或迁移到 Cloudflare Durable Objects 模板形态

## 验证边界

当前质量门禁是：

```bash
pnpm check
```

它覆盖 shared、server、web 的基础测试、类型检查和构建。当前阶段不要求视觉回归测试，因为 UI 不是本阶段目标。

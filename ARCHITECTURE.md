# drawless 架构说明

本文档记录当前项目的运行逻辑和需求边界。Drew 是用户可见的数字同事姓名；代码、接口和部署配置继续使用 `coworker` 作为内部领域名称。

## 架构目标

drawless 的核心目标是让用户、其他协作者和 Drew 在同一个 tldraw room 中持续协作：

- 前端负责房间路由、浏览器身份、tldraw editor 挂载，以及 Drew 的在场、沟通、审批和交付呈现。
- 后端负责 WebSocket 协同连接、`TLSocketRoom` 生命周期，以及 coworker 控制面和公开审批边界。
- coworker runtime 以独立协作者身份进入同一个 room，负责画布观察、对话、计划和受控编辑。
- 共享包负责跨 web、server 和 coworker runtime 复用的类型、schema、身份、审批和画布操作契约。
- tldraw document 始终是画布的唯一事实源。

## 包职责

| 包 | 职责 |
| --- | --- |
| `apps/web` | Next.js 应用。负责 room 路由、tldraw 挂载、浏览器协作者身份、Drew 的人物入口和协作往来。 |
| `apps/server` | Fastify 服务。负责健康检查、tldraw sync、room 注册表、coworker 生命周期代理、conversation stream 和公开审批解析。 |
| `apps/coworker` | Mastra runtime。Drew 通过独立 tldraw sync client 进入 room，读取派生上下文，并通过受控工具申请画布编辑。 |
| `packages/shared` | 共享类型和 Zod schema。包含 room、身份、同步、画布观察、受控编辑、conversation 和审批契约。 |
| `packages/ui` | web 使用的基础 UI 原语，不承载 coworker 业务状态。 |

## 当前运行链路

1. 用户访问 `/`。
2. Next 根页面按请求生成房间 ID，并在配置密钥时签发 7 天有效的房间凭据。
3. 浏览器跳转到 `/rooms/:roomId#access=…`；fragment 中的凭据随后用于 HTTP 和 WebSocket 认证。
4. `CanvasShell` 在客户端创建或读取浏览器设备 ID。
5. 当前标签页生成临时标签页 ID。
6. 前端组合出 tldraw sync 会话 ID。
7. 前端根据 `NEXT_PUBLIC_DRAWLESS_SYNC_SERVER_URL` 拼出 WebSocket 房间地址。
8. `useSync` 创建 tldraw 远程 store。
9. 后端 `/sync/:roomId` 接收 WebSocket。
10. 后端校验来源、房间签名、房间 ID、会话 ID。
11. 后端从房间注册表获取或创建 `TLSocketRoom`。
12. 多个客户端连接同一房间时，共享同一份进程内协同状态。

## Drew 协作链路

1. 用户点击 Drew 的人物入口。
2. 如果 coworker 尚未进入 room，web 经 server 的 `/rooms/:roomId/coworker/start` 请求加入。
3. server 校验 room 和配置后，把受控参数转发给 coworker runtime。
4. coworker runtime 创建独立 sync client，以 `Drew` 作为 presence 展示姓名进入同一个 room。
5. 用户发送消息时，web 经 server 打开 conversation SSE stream。
6. Drew 需要理解画布时，通过 `collect-canvas-context` 从本地同步的 `TLStore` 派生只读上下文。
7. Drew 需要修改画布时，通过 `edit-canvas` 产生结构化计划；web 展示公开审批请求。
8. 用户明确允许后，coworker runtime 临时切换为可写模式，通过自己的 `TLStore` 写回 sync room。
9. web 从真实工具结果中只保留摘要和 record ID，用于展示交付和定位画布成果。

conversation、run、toolCallId 和 sessionId 只属于技术控制面，不构成用户需要管理的会话模型。

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
- 更细的账号、角色、撤销和续签策略；当前只有完整房间分享权限。
- 上传大小限制和速率限制。

## 前端模型

当前前端由画布壳层和 Drew 在场层组成：

- 顶部保留项目名、同步状态、当前设备/标签页和房间链接；coworker 生命周期按钮只在 debug 配置下显示。
- 主区域由 tldraw 承载真实画布内容。
- Drew 驻留在画布边缘，通过人物、对白、交接纸带、计划单和交付便笺表达真实协作状态。
- web 不保存第二份画布结构，也不直接控制 Mastra 私有 run/tool call 标识。

前端关键模块：

- `src/components/canvas-shell.tsx`：房间页面客户端组合根。
- `src/components/coworker-conversation-window.tsx`：Drew 在场和协作状态的客户端组合根。
- `src/components/coworker-presence-stage.tsx`：人物入口、沟通、审批和交付的单一主表面。
- `src/lib/sync-config.ts`：协同地址和会话配置。
- `src/lib/device-identity.ts`：浏览器设备 ID。
- `src/lib/room-route.ts`：房间 ID 和路由决策。

## 共享类型策略

`packages/shared` 是所有跨进程业务契约的入口。当前要求：

- 前后端共享的结构都优先放在 shared。
- 每个类型属性保留中文注释。
- 运行时边界尽量配套 Zod schema。
- 用户可见姓名和协同 presence 默认姓名使用共享常量，避免 web 与 coworker runtime 漂移。

## coworker runtime 边界

- Drew 不直接操作浏览器里的 tldraw editor。
- 画布上下文从 coworker 已同步的 `TLStore` 派生，不把原始 WebSocket 包直接交给模型。
- `collect-canvas-context` 只读；`edit-canvas` 是当前唯一写画布工具。
- 正式写操作必须经过结构化计划和明确审批，模糊聊天文本不构成授权。
- server 持有公开 approvalId 与私有 run/toolCallId 的映射，web 不接触 Mastra 私有控制标识。
- 所有画布写入最终经过 tldraw sync；conversation 和交付记录不复制第二份画布事实。

## 当前存储边界

当前协同房间和审批注册表主要是进程内状态；coworker memory 可按配置使用本地存储：

- 适合本地验证协同链路。
- 后端重启会丢失当前画布和挂起审批的进程状态。
- coworker runtime 重启后，正在等待审批的 Mastra run 不保证可继续。
- 多进程或多实例部署会导致同一房间分裂，除非增加全局房间调度。

后续持久化改造优先位置：

- `apps/server/src/sync/room-registry.ts`
- 将 `InMemorySyncStorage` 替换为 `SQLiteSyncStorage`
- 或迁移到 Cloudflare Durable Objects 模板形态

## 验证边界

当前质量门禁是：

```bash
pnpm check
```

它覆盖 shared、ui、server 和 web 的单测、类型检查、构建与基础协同 smoke。`apps/coworker` 的 Mastra build 和完整控制面 smoke 由 `pnpm smoke:coworker-control` 单独验证。

## 生命周期和安全边界

完整运行配置见 [DEPLOYMENT.md](./DEPLOYMENT.md)。runtime 控制面通过内部 Bearer token 保护，只接受配置中的 sync 地址；工具权限通过不可由 HTTP JSON 伪造的请求上下文绑定 room。审批恢复须匹配 room/run/toolCall，停止房间会取消模型调用并使旧审批失效。

Node socket adapter 负责重连和 push_result 确认；编辑器只同步提交最新记录，不生成动画中间文档。失败、取消或断线时不能把本地变更当作已交付结果。共享文档仍然只存在于 tldraw 协同存储中。

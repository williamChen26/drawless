# Coworker 协同画布接入技术方案

## 1. 背景

drawless 当前已经有一个清晰的协同基础：

- `apps/web` 负责 Next.js 路由、tldraw 挂载、浏览器身份和协同客户端。
- `apps/server` 负责健康检查、就绪检查、WebSocket sync 和房间注册表。
- `packages/shared` 负责跨端类型、schema 和未来 AI 扩展点。
- `apps/coworker` 是新建的 Mastra 项目，当前已经定义了 `Drawless Coworker` agent，但尚未接入真实协同房间。

这个方案的目标不是给 tldraw 增加一个普通 AI 聊天框，而是把 coworker 设计成“进入同一个协同 room 的 AI 同事”。

用户和 coworker 的关系应该是：

- canvas 是共同工作区。
- 用户在浏览器中进入某个 tldraw room。
- coworker 以一个特殊协作者身份进入同一个 room。
- 用户和 coworker 像两个同事一样共同在 canvas 中工作。
- 用户和 coworker 可以通过 cursor chat 或 conversation chat 交流。
- coworker 可以回复用户，也可以在观察画布后主动通过 cursor chat 交流。
- coworker 可以操作画布，但必须先获得用户明确允许。

核心原则：**tldraw document 始终是唯一画布事实源**。

## 2. 结论摘要

这个 idea 很适合 drawless，但落地时要避免两个误区。

第一个误区是把 coworker 做成 server 内部的“全知监听器”。server 的职责应该保持简单：维护 tldraw sync room 生命周期，接受 WebSocket 连接，把协同协议交给 tldraw sync core。server 不应该长期承担“理解用户意图”“分析画布结构”“决定是否介入”等 AI 语义职责。

第二个误区是让 coworker 直接解析原始 WebSocket 包。WebSocket 是传输层，tldraw sync 是协同协议层，二者都不等于业务语义。coworker 需要的是稳定的画布观察数据和语义摘要，而不是把底层同步包直接塞给模型。

推荐方向：

1. coworker 作为独立协作者连接同一个 room。
2. coworker 维护一份从 tldraw document 派生的只读画布镜像。
3. coworker 的理解层把 tldraw records 转换为语义摘要。
4. coworker 的决策层判断何时介入、说什么、是否提出画布操作。
5. coworker 的行动层只通过协同边界写回 tldraw document。

产品判断：

- coworker 的核心亮点不应该只是“白板旁边有一个 AI 聊天框”，而是“AI 作为同事出现在同一个白板现场”。
- tldraw 的 cursor chat 很适合作为 coworker 的第一层表达能力，因为它把短消息绑定在协作者 cursor 附近，比侧边栏聊天更像现场协作。
- conversation chat 仍然需要保留，它适合承载传统 agent 对话、长内容解释和更完整的确认流程。
- cursor chat 和 conversation chat 都是聊天通道，不是两套不同的 AI 能力。
- 这个方向有明显差异化：用户不是把画布截图发给 AI，而是在同一个 room 里和一个能观察、回应、指向、协助操作的 AI 同事协作。

## 2.1 简化需求模型

当前阶段先按一个简单模型理解，不把 AI 介入设计复杂化。

```mermaid
flowchart TB
  Canvas["canvas<br/>共同工作区"]
  User["用户<br/>协作者"]
  Coworker["coworker<br/>AI 同事"]
  CursorChat["cursor chat<br/>画布现场聊天"]
  ConversationChat["conversation chat<br/>传统 agent 聊天"]

  User <--> Canvas
  Coworker <--> Canvas
  User <--> CursorChat
  Coworker <--> CursorChat
  User <--> ConversationChat
  Coworker <--> ConversationChat
```

三个对象：

- `canvas`：共同工作区，也是画布事实源。
- `用户`：人类协作者。
- `coworker`：AI 协作者。

两个聊天通道：

- `cursor chat`：画布现场聊天，适合短句、指向当前位置、轻量讨论和即时确认。
- `conversation chat`：传统聊天 agent 通道，适合长内容、持续对话、复杂解释和完整确认。

coworker 的能力先简化为三类：

- `回复用户`：用户在 cursor chat 或 conversation chat 中说话，coworker 结合画布上下文回复。
- `主动交流`：coworker 观察画布后，如果判断有必要介入，可以主动通过 cursor chat 和用户交流。
- `操作画布`：coworker 可以操作 canvas，但必须先通过聊天通道获得用户明确允许。

画布操作的允许规则：

1. 在 `conversation chat` 中，如果 coworker 想操作画布，必须先主动提问；用户明确允许后，coworker 才能执行。
2. 在 `cursor chat` 中，如果 coworker 发现需要操作画布，必须先用 cursor chat 提问；只有收到用户通过 cursor chat 给出的明确允许后，coworker 才能执行。
3. 没有用户允许时，coworker 只能观察、回复、建议，不能写画布。

## 3. 总体架构

```mermaid
flowchart LR
  User["用户客户端<br/>apps/web"] <--> SyncServer["协同服务器<br/>apps/server"]
  Coworker["AI 同事<br/>apps/coworker"] <--> SyncServer
  SyncServer <--> Room["tldraw room document<br/>唯一画布事实源"]

  User -->|"画布操作"| Room
  Coworker -->|"观察画布数据"| Room
  Coworker -->|"聊天、操作请求、经允许后的操作"| Room
```

这张图里，coworker 和用户是并列的协作者。它不是藏在 server 里面的逻辑，也不是 web 页面里的装饰组件。

更细一点可以拆成几层：

```mermaid
flowchart TB
  A["tldraw document<br/>唯一事实源"] --> B["协同同步层<br/>TLSocketRoom / useSync"]
  B --> C["观察层<br/>快照、增量、presence、选区"]
  C --> D["理解层<br/>结构、关系、意图、最近变化"]
  D --> E["聊天层<br/>cursor chat / conversation chat"]
  D --> F["许可层<br/>是否获得用户明确允许"]
  F --> G["行动层<br/>允许后画布写入"]
  E --> B
  G --> B
```

## 4. 职责边界

### 4.1 apps/web

web 继续只负责用户的画布体验：

- 解析 room 路由。
- 生成浏览器设备身份和标签页 session。
- 使用 `useSync` 连接后端 WebSocket room。
- 挂载 `<Tldraw />`。
- 后续可以展示 coworker 的在线状态、聊天入口、操作允许入口或评论，但不在当前阶段做 UI 优化。

web 不应该：

- 维护第二套画布结构事实源。
- 直接把 AI 的内部推理写进 tldraw document。
- 在没有 shared 契约前临时拼装 AI payload。

### 4.2 apps/server

server 继续是协同服务器：

- 校验 origin、roomId、sessionId。
- 创建和复用 `TLSocketRoom`。
- 把 WebSocket 连接交给 `TLSocketRoom.handleSocketConnect`。
- 提供 health/ready。
- 管理 room 生命周期。

server 可以在后续增加“coworker 接入控制”的轻量能力：

- 判断某个 room 是否启用 coworker。
- 给 coworker 签发或校验专用 session。
- 提供 room 级 coworker 状态查询。
- 在必要时把 room 生命周期事件通知 coworker service。

server 不应该：

- 直接把所有 WebSocket 包发给 LLM。
- 在 sync 路由里写大量 AI 判断逻辑。
- 绕过 tldraw sync core 修改 room storage。
- 成为画布语义事实源。

### 4.3 packages/shared

shared 是本方案最重要的契约层。后续新增跨端类型时，要放在这里，并且每个属性都写中文注释。

建议 shared 逐步承载：

- coworker 身份类型。
- room 级 coworker 配置。
- 画布观察事件 schema。
- 画布语义摘要 schema。
- coworker 聊天消息 schema。
- coworker 画布操作允许 schema。
- coworker 画布操作请求 schema。
- coworker 操作结果 schema。

### 4.4 apps/coworker

coworker 是 AI 同事运行时：

- 连接指定 tldraw room。
- 维护只读画布镜像。
- 订阅画布变化、presence、选区等观察数据。
- 生成画布摘要和用户操作摘要。
- 调用 Mastra agent 做建议、灵感和行动判断。
- 输出聊天回复、操作请求或可执行的低风险画布操作。
- 在明确允许后，通过协同边界提交画布操作。

coworker 不应该：

- 自己发明一套和 tldraw document 平级的画布模型。
- 把 LLM 生成结果直接当成画布事实。
- 在没有用户明确允许和权限策略时直接大规模改画布。

### 4.5 coworker 控制面 API

coworker 是独立的 Mastra 服务，所以 web/server 需要一个明确入口通知它进入或退出某个 room。这个入口不应该绕过 server 的房间生命周期判断，也不应该让 web 直接控制 coworker。

推荐使用 Mastra custom API routes 暴露最小控制面：

```txt
POST   /drawless/rooms/:roomId/coworker/start
GET    /drawless/rooms/:roomId/coworker/status
DELETE /drawless/rooms/:roomId/coworker/stop
```

控制链路：

```mermaid
sequenceDiagram
  participant Web as "apps/web"
  participant Server as "apps/server"
  participant CoworkerApi as "apps/coworker custom API"
  participant CoworkerClient as "coworker sync client"
  participant Room as "tldraw sync room"

  Web->>Server: 用户请求 coworker 进入 room
  Server->>Server: 校验 room 生命周期和权限
  Server->>CoworkerApi: POST /drawless/rooms/:roomId/coworker/start
  CoworkerApi->>CoworkerClient: 创建或复用 room client
  CoworkerClient->>Room: WebSocket 加入同一个 sync room
  Room-->>CoworkerClient: 同步 tldraw document
  CoworkerApi-->>Server: 返回 coworker 状态
  Server-->>Web: 返回控制结果
```

约束：

- `start` 必须幂等；同一个 room 已经有 coworker 时返回当前状态。
- `status` 只返回轻量状态和统计，不返回完整 tldraw document。
- `stop` 必须关闭 coworker 的 WebSocket client，并释放本地 room client。
- 当前本地开发阶段 custom API 可设为 `requiresAuth: false`，生产环境需要改成 server 签名、内网访问或 Mastra auth。
- web 不直接调用 coworker custom API；server 才是 room 生命周期和权限边界。

server 对外暴露的生命周期入口：

```txt
POST   /rooms/:roomId/coworker/start
GET    /rooms/:roomId/coworker/status
DELETE /rooms/:roomId/coworker/stop
```

这三条 route 只做 roomId 校验、coworker 开关判断、受控参数校验和 HTTP 转发；不会在 server 进程内创建 coworker runtime，也不会直接读取或修改 tldraw document。

端到端联调命令：

```bash
pnpm smoke:coworker-control
```

该命令会先构建 coworker，再临时启动 coworker Mastra server 和 drawless server，最后通过 server 的 `/rooms/:roomId/coworker/start|status|stop` 验证 coworker 能经由控制面进入同一个 tldraw sync room。它需要占用本地端口并启动真实进程，因此不放入默认 `pnpm check`。

web 显式控制入口：

- 当前 web 顶部逻辑栏已提供 coworker `状态 / 进入 / 离开` 三个显式动作。
- web 只调用 server 的 `/rooms/:roomId/coworker/*` 生命周期入口，不直接调用 coworker Mastra custom API。
- 当前入口只控制 coworker 是否进入 room，不发送画布摘要给 LLM，也不触发 AI 推理或画布写入。

## 5. Coworker 的协作者身份

coworker 应该有自己的协作者身份，而不是复用某个用户 session。

建议身份结构：

```ts
export interface DrawlessCoworkerIdentity {
  /** coworker 所在的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** coworker 连接 tldraw sync room 时使用的会话 ID。 */
  sessionId: DrawlessSessionId;
  /** coworker 在协同 presence 中展示的名称。 */
  displayName: string;
  /** coworker 在协同 presence 中展示的颜色。 */
  color: string;
  /** coworker 当前运行实例 ID，用于排查多实例重复进入同一房间。 */
  instanceId: string;
}
```

sessionId 可以采用稳定前缀：

```text
coworker:<roomId>:<instanceId>
```

需要注意：

- 同一个 room 最好只有一个 active coworker。
- 如果未来允许多个 worker 分工，要给它们不同 role，而不是都叫 coworker。
- coworker 的 presence 应该能被用户识别，避免用户不知道画布里有 AI 参与者。

## 6. 画布观察模型

coworker 需要实时知道画布发生了什么，但不建议直接把原始同步消息传给 LLM。应该拆成三种观察数据。

### 6.1 快照

快照描述某一刻的 tldraw document 状态。

用途：

- coworker 初次进入 room 时建立上下文。
- 长时间运行后重建上下文。
- LLM 需要全局理解时生成画布摘要。

示例契约：

```ts
export interface DrawlessCanvasSnapshot {
  /** 当前快照所属房间 ID。 */
  roomId: DrawlessRoomId;
  /** 快照生成时间，使用 ISO 字符串。 */
  capturedAt: string;
  /** 当前 page ID；没有明确 page 时为 null。 */
  currentPageId: string | null;
  /** tldraw record 数量摘要，避免直接把大对象塞进模型。 */
  recordCounts: DrawlessCanvasRecordCounts;
  /** 从 tldraw records 派生出的文本内容摘要。 */
  textIndex: DrawlessCanvasTextItem[];
  /** 从 tldraw records 派生出的图形对象摘要。 */
  shapeIndex: DrawlessCanvasShapeItem[];
  /** 当前快照的序列号或版本标识，用于和增量事件对齐。 */
  version: string;
}
```

### 6.2 增量事件

增量事件描述用户最近做了什么。

用途：

- 判断用户是否在连续操作。
- 判断用户是否停顿。
- 判断是否出现可介入节点。
- 生成“最近变化摘要”。

示例契约：

```ts
export interface DrawlessCanvasObservationEvent {
  /** 事件所属房间 ID。 */
  roomId: DrawlessRoomId;
  /** 事件 ID，用于去重和追踪。 */
  eventId: string;
  /** 事件发生时间，使用 ISO 字符串。 */
  occurredAt: string;
  /** 触发事件的协作者 session ID。 */
  actorSessionId: DrawlessSessionId;
  /** 事件类型。 */
  kind: DrawlessCanvasObservationKind;
  /** 受影响的 tldraw record ID 列表。 */
  recordIds: string[];
  /** 供 coworker 快速理解的人类可读摘要。 */
  summary: string;
}
```

事件类型可以先保持粗粒度：

```ts
export type DrawlessCanvasObservationKind =
  | "shape_created"
  | "shape_updated"
  | "shape_deleted"
  | "selection_changed"
  | "presence_updated"
  | "page_changed"
  | "unknown_change";
```

### 6.3 presence 和选区

presence 比画布内容更能表达“用户正在关注哪里”。

建议 coworker 观察：

- 用户当前选中的 shapes。
- 用户 viewport 所在区域。
- 用户 cursor 或 pointer 位置。
- 用户是否正在编辑文本。
- 用户是否长时间停顿。

这些信息不一定都能从当前 tldraw sync 数据稳定拿到，后续需要结合 tldraw API 验证。原则上可以先做最小版本：只观察 selection 和最近 changed record。

## 7. 画布理解层

画布理解层是本方案的核心。它不等于 LLM prompt，而是把 tldraw document 转成适合 LLM 和规则系统理解的中间表示。

```mermaid
flowchart LR
  Records["tldraw records"] --> Extract["结构提取"]
  Extract --> Summary["语义摘要"]
  Events["最近增量事件"] --> Summary
  Presence["用户选区 / presence"] --> Summary
  Summary --> Coworker["Mastra coworker"]
```

建议分三步做：

### 7.1 结构提取

从 records 中提取：

- 文本 shape：内容、位置、大小、样式。
- 几何 shape：类型、位置、大小。
- 连接关系：arrow、binding、线段连接。
- 分组或空间聚类：哪些 shape 视觉上在同一区域。
- 页面信息：当前 page、其他 page。

这一步应该是确定性代码，不依赖 LLM。

### 7.2 语义摘要

基于结构提取结果生成摘要：

- 当前画布有哪些主要区域。
- 每个区域包含什么主题。
- 哪些文本看起来是标题。
- 哪些内容可能是待办、问题、结论。
- 最近用户改了什么。
- 当前用户可能关注哪个区域。

第一版可以用规则和轻量文本拼接，不一定马上用 LLM。

### 7.3 上下文裁剪

画布会越来越大，不能每次把所有 records 都发给模型。

建议裁剪策略：

- 当前选区优先。
- 最近变更优先。
- viewport 内对象优先。
- 标题和连接节点优先。
- 长文本截断，并保留原始 recordId。

输出给 Mastra agent 的上下文应该类似：

```json
{
  "roomId": "alpha",
  "focus": {
    "selectionRecordIds": ["shape:a", "shape:b"],
    "recentlyChangedRecordIds": ["shape:b"]
  },
  "canvasSummary": "画布包含三个区域：目标、任务拆解、风险...",
  "recentEvents": [
    "用户新增了一个文本节点：如何让 coworker 理解画布？",
    "用户选中了任务拆解区域的三个节点"
  ]
}
```

## 8. Coworker 聊天和行动模型

当前阶段先把 AI 介入收敛成一个简单产品模型：coworker 和用户共同在 canvas 里工作，二者通过聊天通道沟通，coworker 只有在用户允许后才操作画布。

### 8.1 两个聊天通道

```mermaid
flowchart LR
  User["用户"] <--> CursorChat["cursor chat<br/>画布现场短聊天"]
  Coworker["coworker"] <--> CursorChat
  User <--> ConversationChat["conversation chat<br/>传统 agent 聊天"]
  Coworker <--> ConversationChat
  User <--> Canvas["canvas<br/>共同工作区"]
  Coworker <--> Canvas
```

`cursor chat`：

- 发生在画布现场，和 cursor、位置、选区、正在看的区域天然相关。
- 适合短句、即时反馈、轻量讨论、现场提问和现场确认。
- 用户可以通过 cursor chat 和 coworker 说话。
- coworker 可以通过 cursor chat 回复用户。
- coworker 也可以在观察画布后，认为有必要时主动通过 cursor chat 跟用户交流。

`conversation chat`：

- 是传统 agent 聊天通道。
- 适合长内容、连续上下文、复杂解释、结构化建议和完整的操作确认。
- 用户可以在这里要求 coworker 理解、总结、提出方案或请求操作画布。
- coworker 如果想在这个通道里操作画布，必须先提问并获得用户明确允许。

### 8.2 Coworker 能力

coworker 先只定义三类能力：

1. `回复用户`
   用户在 cursor chat 或 conversation chat 中发消息，coworker 结合画布上下文回复。

2. `主动交流`
   coworker 观察 canvas 后，如果判断有必要介入，可以主动通过 cursor chat 发起交流。主动交流只用于提醒、追问、建议，不直接操作画布。

3. `操作画布`
   coworker 可以创建、修改或整理 canvas 内容，但必须先获得用户明确允许。没有允许时，coworker 只能观察和聊天。

### 8.3 画布操作许可规则

画布操作必须遵守“先问，再等用户允许，再执行”。

```mermaid
flowchart TB
  NeedAction["coworker 判断可能需要操作画布"] --> Channel{"当前沟通通道"}
  Channel --> Conversation["conversation chat"]
  Channel --> Cursor["cursor chat"]
  Conversation --> AskConversation["coworker 在 conversation chat 中提问"]
  Cursor --> AskCursor["coworker 在 cursor chat 中提问"]
  AskConversation --> UserAllowConversation{"用户明确允许？"}
  AskCursor --> UserAllowCursor{"用户用 cursor chat 明确允许？"}
  UserAllowConversation -->|"是"| WriteCanvas["coworker 操作 canvas"]
  UserAllowCursor -->|"是"| WriteCanvas
  UserAllowConversation -->|"否"| OnlyChat["只聊天，不写画布"]
  UserAllowCursor -->|"否"| OnlyChat
```

具体规则：

1. conversation chat 中，如果 coworker 想操作画布，必须先主动提问；用户明确允许后，coworker 才能操作 canvas。
2. cursor chat 中，如果 coworker 发现需要操作画布，必须先通过 cursor chat 提问；只有收到用户通过 cursor chat 给出的明确允许后，coworker 才能操作 canvas。
3. coworker 主动通过 cursor chat 介入时，只能先聊天、建议、追问，不能直接写画布。
4. 用户没有明确允许时，coworker 不能把建议自动变成画布修改。
5. 真实画布修改仍然必须通过 tldraw 协同边界写入，不能绕过 sync room。

### 8.4 后续 shared 契约方向

后续契约不需要一开始设计得很复杂，可以先表达四件事：

- `channel`：这次沟通来自 `cursor_chat` 还是 `conversation_chat`。
- `message`：用户或 coworker 说了什么。
- `canvasContext`：这句话发生时的画布上下文，例如 room、选区、cursor 位置和最近变化。
- `permission`：用户是否明确允许 coworker 操作画布。

这样就能覆盖当前需求：聊天、回复、主动 cursor chat、以及用户允许后的画布操作。

## 9. 画布行动模型

真实画布操作要比自然语言建议更严格。

```mermaid
sequenceDiagram
  participant U as 用户
  participant W as web
  participant C as coworker
  participant S as server
  participant R as tldraw room

  C->>W: 通过聊天通道请求操作画布
  W->>U: 展示 coworker 的操作请求
  U->>W: 在同一聊天通道中明确允许
  W->>C: 发送允许结果
  C->>S: 作为协作者提交 tldraw changes
  S->>R: 写入 tldraw document
  R-->>W: 用户实时看到变化
```

### 9.1 操作请求

操作请求是 coworker 想操作画布之前必须先说清楚的内容。它不是画布修改本身，也不能直接执行。

```ts
export interface DrawlessCanvasOperationRequest {
  /** 请求 ID，用于用户允许和后续执行追踪。 */
  requestId: string;
  /** 请求所属房间 ID。 */
  roomId: DrawlessRoomId;
  /** 请求创建时间，使用 ISO 字符串。 */
  createdAt: string;
  /** 请求来自哪个聊天通道。 */
  channel: "cursor_chat" | "conversation_chat";
  /** coworker 想做什么，用人类可读文本表达。 */
  description: string;
  /** 操作影响的画布对象或区域描述。 */
  targetDescription: string;
  /** 第一版只允许 low。 */
  riskLevel: "low";
}
```

用户允许也需要结构化记录：

```ts
export interface DrawlessCanvasOperationPermission {
  /** 被允许的操作请求 ID。 */
  requestId: string;
  /** 允许操作的用户 session ID。 */
  approvedBySessionId: DrawlessSessionId;
  /** 用户允许发生在哪个聊天通道。 */
  channel: "cursor_chat" | "conversation_chat";
  /** 用户允许时的原始消息。 */
  approvedMessage: string;
  /** 允许时间，使用 ISO 字符串。 */
  approvedAt: string;
}
```

### 9.2 操作类型

第一版建议只开放低风险操作：

```ts
export type DrawlessCanvasOperation =
  | DrawlessCreateNoteOperation
  | DrawlessCreateTextShapeOperation
  | DrawlessCreateArrowOperation
  | DrawlessMoveShapeOperation
  | DrawlessUpdateTextOperation;
```

暂时不建议开放：

- 批量删除。
- 大规模重排。
- 改用户已有长文本。
- 修改未知类型 record。
- 跨 page 大规模操作。

### 9.3 执行原则

所有真实操作必须：

- 保留原始用户内容。
- 可追踪是 coworker 发起。
- 尽量小步提交。
- 能在 tldraw 历史里撤销。
- 失败时返回结构化错误。
- 不绕过 sync room。

## 10. Server 接入策略

server 有两种可能的接入方式。

### 10.1 方案 A：coworker 作为外部客户端连接 sync room

```mermaid
flowchart LR
  Coworker["apps/coworker"] -->|"WebSocket /sync/:roomId"| Server["apps/server"]
  Server --> Room["TLSocketRoom"]
```

优点：

- 最符合“同事进入 room”的产品模型。
- server 边界清晰。
- coworker 的读写都经过 tldraw sync。
- 未来可以独立部署 coworker。

缺点：

- Node 侧需要可靠地接入 tldraw sync client 或实现适配。
- coworker 需要自己维护画布镜像。
- 对 tldraw sync API 的理解要求更高。

这是推荐主路线。

### 10.2 方案 B：server 提供 room observation adapter

```mermaid
flowchart LR
  User["用户"] --> Server["apps/server"]
  Server --> Room["TLSocketRoom"]
  Server --> Observer["观察适配器"]
  Observer --> Coworker["apps/coworker"]
```

优点：

- coworker 不必完全模拟 tldraw 客户端。
- server 可以提供更稳定的观察事件。

缺点：

- server 会逐渐承担更多 AI 接入职责。
- 需要非常克制，避免 server 变成语义层。
- 仍然不能把 observer 当作第二事实源。

这个方案可以作为辅助路线，但不建议作为一开始的主架构。

### 10.3 推荐组合

主路线采用方案 A：

- coworker 作为客户端进入 room。
- coworker 维护画布镜像。
- coworker 通过 sync 写回。
- coworker 通过 Mastra custom API 暴露 start/status/stop 控制面。

server 只补充最小控制能力：

- coworker enable/disable。
- coworker session 鉴权。
- room 中 coworker 运行状态。
- 必要的生命周期通知。
- 后续由 server 通过 HTTP 调用 coworker custom API，不在 server 内直接 import coworker runtime。
- 当前实现已提供 server 侧 `/rooms/:roomId/coworker/start|status|stop` 入口，默认通过配置关闭，需要显式启用。
- 当前实现已提供 `pnpm smoke:coworker-control`，用于验证 server 控制面到 coworker sync client 的真实端到端链路。
- 当前实现已提供 web 顶部栏显式控制入口，仅用于手动查询、进入、离开 coworker。

## 11. MVP 阶段规划

### Phase 0：文档和契约准备

目标：

- 明确 coworker 是协作者，不是 server 内部插件。
- 在 `packages/shared` 增加最小 coworker 类型。
- 暂不接入真实 AI 操作。

交付：

- 本技术方案。
- shared 类型：identity、observation、chat message、operation permission。
- 对应 schema 和测试。

### Phase 1：conversation chat 只读回复

目标：

- 用户通过 conversation chat 请求 coworker 看当前 room。
- coworker 能按需通过 `collect-canvas-context` 读取当前 room 的只读画布上下文。
- coworker 能在 conversation chat 中回复用户。
- 这个阶段 coworker 不操作画布。

可能实现：

- web 提供一个可打开/关闭的 conversation chat 浮窗，并把用户消息流式发送给 server。
- server 暴露 `/rooms/:roomId/coworker/conversation/stream`，只做 roomId 校验和 coworker SSE 转发。
- coworker 暴露 `/drawless/rooms/:roomId/coworker/conversation/stream`，调用 Mastra agent 的 `stream()`，把 Mastra 官方 stream chunk 直接包成 SSE。
- web 直接展示 Mastra raw chunk；仅当 chunk 是 `text-delta` 时额外把文本增量追加到 coworker 正文。
- agent 判断问题需要画布事实时调用 `collect-canvas-context`；上下文从 coworker 已同步的 tldraw store 派生，web 不再提交第二套画布摘要。
- conversation chat 展示的是可审计执行轨迹，不展示模型隐藏推理链。

这个阶段要求 coworker 已经以协作者身份进入 room；tldraw document 仍然是唯一画布事实源。

### Phase 2：coworker 常驻观察 room

目标：

- coworker 能以 session 进入指定 room。
- coworker 能维护当前画布镜像。
- coworker 能感知快照和增量变化。
- coworker 默认静默，只记录最近变化摘要。
- coworker 能以协作者身份维护 presence，为后续 cursor chat 做准备。

交付：

- coworker room connector。
- canvas mirror。
- observation event buffer。
- room lifecycle 管理。
- coworker presence 基础能力。

### Phase 2.5：cursor chat 双向交流

目标：

- 用户可以通过 cursor chat 向 coworker 发消息。
- coworker 能观察用户 cursor chat，并结合画布上下文回复。
- coworker 也可以在观察画布后，判断有必要时主动通过 cursor chat 跟用户交流。
- cursor chat 只用于聊天、建议、追问和操作前询问，不直接写画布。

交付：

- 用户 cursor chat observation event。
- coworker cursor chat reply flow。
- coworker 主动 cursor chat flow。
- cursor chat 消息长度和频率限制。
- coworker cursor/presence 的稳定身份。
- cooldown 和去重策略，避免连续打扰。

### Phase 3：画布操作许可链路

目标：

- coworker 在 conversation chat 或 cursor chat 中提出操作画布的请求。
- 用户在同一个聊天通道里明确允许后，系统记录这次允许。
- 没有用户允许时，coworker 只能聊天和建议。
- 这个阶段只建立允许关系，不一定真正写画布。

交付：

- 操作请求和用户允许 schema。
- conversation chat 许可 flow。
- cursor chat 许可 flow。
- 许可过期和撤销规则。

### Phase 4：低风险画布写入

目标：

- coworker 获得用户允许后，创建新文本、注释、箭头等低风险内容。
- 操作通过 tldraw sync 写回 room。
- 用户实时看到改动。

交付：

- action executor。
- 操作结果事件。
- 错误处理。
- 最小审计日志。

### Phase 5：主动 cursor chat 交流策略

目标：

- coworker 能在低打扰策略下主动通过 cursor chat 交流。
- 例如用户停顿、重复修改、选中区域后无动作。
- 主动交流只用于聊天、建议和追问；如果需要操作画布，仍然必须先询问并获得用户允许。

交付：

- 主动交流策略。
- cooldown。
- 用户关闭/暂停 coworker 的控制。

## 12. 关键技术问题调研结论

本节基于当前项目使用的 `tldraw@5.0.1`、`@tldraw/sync@5.0.1`、`@tldraw/sync-core@5.0.1` 本地类型定义和官方文档整理。

### 12.1 Node 侧如何连接 tldraw sync room

结论：**可行，推荐用 `@tldraw/sync-core` 的 `TLSyncClient` 作为 coworker 的常驻连接基础。**

调研依据：

- 官方文档说明，`@tldraw/sync-core` 可以集成到任何支持 WebSocket 的 JavaScript server 环境中；当前 drawless server 已经使用这个方向。
- `@tldraw/sync` 的 `useSync` 是 React hook，适合 web 客户端，不适合直接给 `apps/coworker` 复用。
- `@tldraw/sync-core` 暴露了 `TLSyncClient`、`ClientWebSocketAdapter`、`TLPersistentClientSocket`、`TLPresenceMode` 等底层能力。
- `TLSyncClient` 官方说明是双向同步本地 `Store` 和远端 sync server 的 client engine；它支持 `store`、`socket`、`presence`、`onLoad`、`onAfterConnect`、`onSyncError`。
- `@tldraw/sync` 的 `useSync` 内部也是创建 `createTLStore`、`ClientWebSocketAdapter`、`TLSyncClient`，所以 coworker 可以在 Node 侧复刻这条链路，而不是使用 React hook。

推荐实现形态：

```ts
import { atom } from "@tldraw/state";
import {
  ClientWebSocketAdapter,
  TLSyncClient
} from "@tldraw/sync-core";
import {
  createTLSchema,
  createTLStore,
  type TLRecord,
  type TLStore
} from "tldraw";

const schema = createTLSchema();
const store = createTLStore({ schema, id: "coworker:<roomId>" });
const socket = new ClientWebSocketAdapter(() => {
  const url = new URL("ws://127.0.0.1:3001/sync/<roomId>");
  url.searchParams.set("sessionId", "coworker:<roomId>:<instanceId>");
  url.searchParams.set("storeId", "coworker:<roomId>");
  return url.toString();
});

const client = new TLSyncClient<TLRecord, TLStore>({
  store,
  socket,
  presence: atom("coworker presence", null),
  onLoad() {
    // 初始同步完成，可以建立画布镜像和摘要。
  },
  onSyncError(reason) {
    // 记录错误并关闭或重连。
  }
});
```

实现注意：

- `ClientWebSocketAdapter` 使用全局 `WebSocket`。Node 22 已有内置 WebSocket 能力，但仍要在本项目实际运行时验证；如果 runtime 不满足，则要提供一个实现 `TLPersistentClientSocket` 的 `ws` 适配器。
- `ClientWebSocketAdapter` 的源码注释明确提醒：使用者需要自己处理连接健康检查；`TLSyncClient` 内部也会定时 ping 并在长时间无服务端交互时 reset。
- coworker 连接 URL 必须和 web 一样走 `/sync/:roomId?sessionId=...`，不能连接一个旁路地址。
- coworker 的 `sessionId` 需要遵守 shared 中的 `sessionIdSchema`，例如 `coworker:<roomId>:<instanceId>`。

最终判断：

- **Phase 2 的常驻 room 方案可以做，不需要发明新同步协议。**
- **Phase 1 仍然值得先做，因为它能更快验证产品感觉和语义摘要，不阻塞在常驻连接细节上。**

### 12.2 如何从 tldraw records 生成稳定摘要

结论：**第一版应该从 `TLStore` 派生摘要，而不是从 WebSocket 消息派生摘要。**

调研依据：

- `TLSyncClient` 同步完成后，coworker 拥有本地 `TLStore`。
- `Store` 暴露 `listen`、`getStoreSnapshot`、`put`、`remove` 等能力。
- `store.listen` 可以监听 document scope 的变化；`useSync` 内部也依赖 `store.listen({ source: "user", scope: "document" })` 把本地用户变更推送到 server。
- 这意味着 coworker 可以把 `TLStore` 当作只读镜像，基于 snapshot 和 listen 事件做摘要。

推荐摘要来源：

- 初始全量：`store.getStoreSnapshot("document")` 或直接读取 store 中 document scope records。
- 增量变化：`store.listen` 的 `changes`。
- presence：查询 `instance_presence` records。
- 用户选区：优先使用 presence 中的 selection 信息；如果后续发现默认 presence 不够，再由 web 显式传选区摘要。

第一版摘要范围：

- text shape：提取文本、位置、大小、所属 page。
- geo shape：提取类型、位置、大小。
- arrow/binding：提取连接关系。
- page/document：提取当前 page 和 page 列表。
- presence：提取其他协作者、选区、cursor 或 viewport 中可用字段。

不建议第一版做：

- 精准视觉理解。
- 图片内容 OCR。
- iframe/bookmark 内容理解。
- 任意自定义 shape 深度解析。
- 直接把完整 records 塞进 LLM。

最终判断：

- **摘要层可以确定性实现，不依赖 LLM。**
- **LLM 输入应该是 `CanvasSummary + RecentEvents + FocusContext`，不是原始 `TLRecord[]`。**
- **当前选区很重要；如果 Node coworker 很难稳定拿到用户当前焦点，Phase 1 先让 web 显式发送选区摘要是更稳的。**

### 12.3 coworker 如何写回画布

结论：**低风险写回可行，推荐通过 coworker 自己的 `TLStore.put/remove` 触发 `TLSyncClient` 同步；不要直接改 server storage。**

调研依据：

- `TLSyncClient` 官方说明中，本地 `store.put(...)` 会被自动同步到远端 sync server。
- `TLSocketRoom` 也有 `updateStore`，但这是 server-side room API，更适合维护、迁移或管理用途；如果把 AI 操作放在 server 内部执行，会削弱“coworker 是同事”的协作模型。
- 通过 coworker 的本地 store 写入，操作路径和普通客户端一致：本地 store change -> `TLSyncClient` push -> server `TLSocketRoom` -> 其他客户端同步。

推荐执行路径：

```mermaid
sequenceDiagram
  participant C as coworker
  participant Store as coworker TLStore
  participant Client as TLSyncClient
  participant Server as TLSocketRoom
  participant Web as 用户 web

  C->>Store: store.put([...lowRiskRecords])
  Store->>Client: store.listen 捕获 document change
  Client->>Server: push diff
  Server-->>Web: broadcast diff
```

限制条件：

- 第一版只允许新增内容，不做删除。
- 第一版只允许新增独立文本、注释区、低风险 arrow。
- 修改用户已有文本、大规模移动、删除、跨 page 批处理全部视为高风险，必须推迟。
- 每次执行前必须有操作请求和用户明确允许。
- 所有 coworker 创建的内容要通过 metadata 或命名约定标记来源，便于后续撤销和筛选。

仍需验证：

- Node 侧没有完整 `Editor` UI runtime 时，直接构造 default shape records 的最佳 helper 是什么。
- tldraw 对 shape record 的必要字段、index、parentId、pageId、props 默认值要走官方 record factory 或 editor/store helper，不能手写残缺 record。
- “撤销”如果希望进入用户本地 undo stack，可能需要 web 侧确认后由用户客户端执行；如果由 coworker 远端执行，用户仍会看到同步变化，但不一定自然进入用户本地 undo 语义。

最终判断：

- **coworker 作为客户端写回是主路线。**
- **server `room.updateStore` 只能作为维护工具或后门管理能力，不作为产品化 AI 操作路径。**
- **Phase 4 之前必须先完成操作请求、用户允许、低风险 operation schema。**

### 12.4 server 需要改多少

结论：**server 当前 sync 核心可以保持不动，只需要小幅增加 coworker session 的接入控制。**

当前 `apps/server` 已经具备：

- `/sync/:roomId` WebSocket 路由。
- `sessionId` 校验。
- `RoomRegistry` 复用同一个 `TLSocketRoom`。
- `TLSocketRoom.handleSocketConnect` 接入。

后续最小改动：

- shared 增加 coworker session 前缀约定。
- server 在 `attachTldrawSyncSocket` 中识别 `coworker:` session。
- 可选：server 对 coworker session 做 room 级 enable/disable 校验。
- 可选：ready payload 增加 coworker 状态，但不要塞语义数据。

不建议改动：

- 不在 server 中解析 WebSocket payload 给 LLM。
- 不在 server 中维护画布摘要。
- 不在 server 中执行 AI 的常规画布操作。

最终判断：

- **server 仍然是协同服务器。**
- **coworker 的观察、理解、决策和行动都应该主要在 `apps/coworker` 内完成。**

## 13. 数据流示例

### 13.1 用户通过 conversation chat 请求 coworker

```mermaid
sequenceDiagram
  participant U as 用户
  participant W as web
  participant S as server
  participant C as coworker

  U->>W: 在 conversation chat 中提问
  W->>W: 从 editor/store 提取选区摘要
  W->>S: POST /rooms/:roomId/coworker/conversation
  S->>C: 转发到 coworker conversation API
  C->>C: 生成上下文摘要
  C->>C: 调用 Mastra agent
  C-->>S: 返回聊天回复
  S-->>W: 返回聊天回复
  W-->>U: 在 conversation chat 中展示
```

### 13.1.1 用户和 coworker 通过 cursor chat 交流

```mermaid
sequenceDiagram
  participant W as 用户 web
  participant S as server
  participant C as coworker
  participant R as tldraw room

  W->>R: 用户发送 cursor chat
  R-->>C: coworker 观察到用户 cursor chat 和画布上下文
  C->>C: 判断是否回复
  C->>R: coworker 发送 cursor chat 回复
  R-->>W: 用户在画布现场看到回复
```

cursor chat 也支持 coworker 主动发起。coworker 观察画布后，如果判断有必要介入，可以先发一句短消息或问题；如果涉及画布操作，必须先等用户在 cursor chat 中明确允许。

### 13.2 coworker 常驻观察

```mermaid
sequenceDiagram
  participant C as coworker
  participant S as server
  participant R as tldraw room

  C->>S: WebSocket connect /sync/:roomId?sessionId=coworker:...
  S->>R: handleSocketConnect
  R-->>C: 初始同步数据
  C->>C: 建立 canvas mirror
  R-->>C: 后续增量变化
  C->>C: 更新 observation buffer
```

### 13.3 获得允许后执行画布操作

```mermaid
sequenceDiagram
  participant U as 用户
  participant W as web
  participant C as coworker
  participant R as tldraw room

  C-->>W: 在聊天通道中请求操作画布
  W-->>U: 展示请求
  U->>W: 在同一聊天通道中明确允许
  W->>C: 发送允许结果
  C->>R: 通过协同连接提交 changes
  R-->>W: 同步变化
  W-->>U: 画布更新
```

## 14. 安全和控制

### 14.1 权限

第一版可以简单处理：

- 只有本地开发环境启用 coworker。
- room 默认不自动启用 coworker。
- 用户显式触发后才启动或唤醒 coworker。

后续需要：

- room 级开关。
- 用户级权限。
- coworker session 鉴权。
- 操作允许策略。

### 14.2 隐私

coworker 会读取画布内容，因此要明确：

- 哪些数据会进入模型上下文。
- 是否包含用户身份。
- 是否包含完整画布文本。
- 是否记录长期 memory。

当前 Mastra agent 使用 `Memory`，后续要决定 memory 的范围：

- `resource` 使用当前 `roomId`，表示 memory 隶属于这个协同房间。
- cursor chat 使用 `thread: ${roomId}:cursor`，只承载现场短回复上下文。
- conversation chat 使用 `thread: ${roomId}:conversation`，承载长对话上下文。
- 第一版不把 cursor chat 和 conversation chat 混进同一个 thread，避免短消息噪音污染长对话。
- 是否允许清除。

### 14.3 风险等级

建议操作按风险分级：

- low：新增注释、新增独立文本、创建建议区。
- medium：移动 shape、新增连接、修改 coworker 自己创建的内容。
- high：删除内容、修改用户文本、大规模整理布局。

MVP 只做 low。

## 15. 推荐的目录演进

```text
packages/shared/src/
  index.ts

apps/coworker/src/mastra/
  agents/drawless-coworker.ts
  tools/canvas-context-tool.ts
  tools/canvas-context-reader.ts
  collaboration/coworker-room-client.ts
  collaboration/coworker-room-registry.ts
  collaboration/cursor-chat-reply-handler.ts

apps/server/src/
  coworker/coworker-control-client.ts

apps/web/src/
  lib/coworker-control.ts
  lib/coworker-conversation.ts
  components/coworker-conversation-window.tsx
```

这个结构只是方向，不代表要一次性创建所有文件。

## 16. 测试策略

### 16.1 shared

- schema 能验证合法 roomId/sessionId。
- observation event schema 能拒绝缺少必要字段的数据。
- operation permission schema 能表达用户是否允许 coworker 操作画布。
- canvas operation schema 能表达低风险操作。
- 每个 shared 类型属性保留中文注释。

### 16.2 server

- 普通用户 sync 连接不受 coworker 影响。
- coworker session 可以通过校验。
- 禁用 coworker 时拒绝 coworker 进入 room。
- room registry 生命周期仍然清晰。

### 16.3 coworker

- 没有画布上下文时不编造内容。
- 接收到快照后能生成摘要。
- 接收到最近事件后能更新 observation buffer。
- 没有用户允许时不会操作画布。
- 没有执行权限时不会写画布。

### 16.4 web

- 选区摘要生成稳定。
- coworker 在 conversation chat 中返回消息时能展示。
- coworker 请求操作画布时能等待用户允许。
- 用户未允许时不会改动画布。

## 17. 已判定事项和开放问题

### 17.1 已判定事项

1. Node 侧常驻连接使用 `@tldraw/sync-core` 的 `TLSyncClient`，不使用 React hook `useSync`。
2. coworker 作为客户端进入同一个 sync room，不作为 server 内部监听器。
3. server 不解析原始 WebSocket 包给 LLM。
4. 画布摘要从 `TLStore` snapshot 和 `store.listen` 的 changes 派生。
5. coworker 写回画布时通过自己的 `TLStore.put/remove` 触发 sync，不直接改 server storage。
6. MVP 先做 conversation chat 只读回复，再做常驻观察。
7. coworker 需要 Mastra custom API routes 作为 room 生命周期控制面。
8. web 不直接通知 coworker；由 server 判断 room 生命周期和权限后再调用 coworker 控制面。
9. server 侧 coworker control 默认关闭，只在显式配置后代理 start/status/stop 请求。
10. 端到端联调使用显式 smoke 命令，不纳入默认 `pnpm check`。
11. web 侧当前只提供显式生命周期按钮，不自动唤醒 coworker，也不触发 AI 推理。
12. cursor chat 是 coworker 的核心现场对话通道，用户和 coworker 都可以通过它交流。
13. conversation chat 是传统 agent 对话通道，适合长内容、复杂解释和完整确认。
14. cursor chat 和 conversation chat 都是聊天通道，不是两套不同的 AI 能力。
15. coworker 可以回复用户，也可以在观察画布后主动通过 cursor chat 交流。
16. coworker 只有在用户明确允许后才能操作画布。
17. 如果操作请求发生在 conversation chat，用户必须在 conversation chat 中允许。
18. 如果操作请求发生在 cursor chat，用户必须通过 cursor chat 允许。

### 17.2 仍需产品决策

1. coworker 是否默认进入每个 room，还是用户显式唤醒后才进入？
2. coworker 的 presence 应该如何在 tldraw UI 中展示？
3. 画布操作允许 UI 放在哪里，如何不破坏当前“逻辑验证壳层”的 UI 约束？
4. coworker memory 是 room 级、用户级还是 session 级？
5. 如果多个用户同时在 room 中，coworker 应该响应谁的意图？
6. coworker 创建的内容如何标记来源，以便用户筛选、撤销或隐藏？
7. 哪些低风险操作可以第一批开放给 coworker 执行？
8. cursor chat 的主动发言频率、冷却时间和静音策略如何设置？
9. cursor chat 消息应该绑定 coworker cursor、用户当前选区，还是最近变化区域？
10. cursor chat 消失后是否需要在可选历史里保留一份普通文本记录？
11. 用户发给 coworker 的 cursor chat 是否需要显式 @coworker，还是 room 内所有 cursor chat 都进入 coworker observation？
12. 用户允许操作画布的表达是否需要固定格式，例如“可以”“确认”“帮我做”？

## 18. 推荐下一步

建议下一步不要直接做完整自动操作，而是先做 conversation chat 的只读回复，同时用一个小 PoC 验证 Phase 2 的 `TLSyncClient` 常驻连接。

具体顺序：

1. 在 `packages/shared` 增加 conversation message、cursor chat message、canvas operation permission 的类型和 Zod schema。
2. 在 `apps/web` 增加一个只读的当前选区摘要函数，不改复杂 UI。
3. 在 `apps/coworker` 增加 conversation API，接收 roomId、用户消息、画布摘要。
4. 让 coworker 先在 conversation chat 中返回只读回复，不执行画布修改。
5. 在 `apps/coworker` 做一个独立 PoC：用 `ClientWebSocketAdapter + TLSyncClient + createTLStore` 连接本地 `/sync/:roomId`，同步完成后输出 snapshot 摘要。
6. PoC 通过后，再把常驻 room connector 纳入 Phase 2。
7. 常驻连接稳定后，验证用户 cursor chat observation 和 coworker cursor chat reply。
8. 最后再做“用户明确允许后”的低风险画布操作。

这样能快速验证产品感觉，同时不会破坏当前最重要的协同链路。

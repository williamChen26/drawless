# drawless coworker runtime

这个应用是 Drew 的 Mastra runtime。`Drew` 是用户可见姓名，`画布搭档` 是角色说明；`coworker` 只作为目录、包、API 和内部领域名称。

## 职责

- 以独立协作者身份连接 drawless 的 tldraw sync room。
- 从本地同步的 `TLStore` 派生只读画布上下文。
- 处理 conversation chat 和 cursor chat。
- 通过 `edit-canvas` 提交结构化计划，并在用户明确批准后写回画布。
- 保持 tldraw document 为唯一画布事实源。

## 本地运行

在仓库根目录执行：

```bash
pnpm dev:coworker
```

默认 Mastra 服务地址是 `http://127.0.0.1:4111`。完整联调需要同时启动 web、server 和 coworker：

```bash
pnpm dev:coworker:stack
```

## 验证

构建 runtime：

```bash
pnpm build
```

验证 server 控制面、runtime 和真实 sync room 的链路：

```bash
pnpm smoke:coworker-control
```

共享身份、审批和画布操作契约统一定义在 `packages/shared`，不要在本应用中另建跨端 payload。

# drawless

drawless 是基于 tldraw 的协作画布。人和可选的画布搭档 Drew 通过同一条 sync 链路读取和编辑文档；Drew 的画布编辑需要用户批准结构化计划。

当前目标是可自托管验证的 **Alpha**。画布保存在单个 server 进程内，重启或最后一个连接离开 30 分钟后会清空。请勿把重要资料的唯一副本保存在这里。当前不提供账号、持久化资产存储或多实例房间调度。

项目自有代码的开源许可证尚待维护者确定，正式发布前必须补齐 `LICENSE`。第三方依赖遵循各自许可，见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

## 快速开始

使用 Node.js 22.13+ 或 24.x、pnpm 9.15.0（`.nvmrc` 推荐 Node 22）：

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` 同时启动 web 和 server，退出时一起关闭。打开 `http://127.0.0.1:3000`，每次访问首页会创建新房间；将完整地址分享给协作者即可进入同一房间。已有 `.env` 可以继续使用；各应用的 `.env.example` 是配置参考，本机协同无需额外配置。

只启动一个服务可使用 `pnpm dev:web`、`pnpm dev:server`。server 的源码修改会自动重启；shared 修改后需重新运行 `pnpm --filter @drawless/shared build`。

## 可选的 Drew

将 `apps/coworker/.env.example` 复制为该目录的 `.env`，填入自己的 `DEEPSEEK_API_KEY`，再运行：

```bash
pnpm dev:coworker:stack
```

这会启用已有的聊天、画布观察和审批后编辑能力。画布摘要、用户消息及模型上下文会发送给模型提供方。默认模型是 `deepseek/deepseek-chat`。普通协同、测试和 smoke 不需要 API key，也不会调用真实模型。

## 包结构

| 目录 | 职责 |
| --- | --- |
| `apps/web` | Next 路由、tldraw 客户端、浏览器身份与 Drew 交互 |
| `apps/server` | 房间签名校验、WebSocket sync、房间生命周期、审批与 runtime 代理 |
| `apps/coworker` | Mastra runtime、独立协同客户端、受控画布工具 |
| `packages/shared` | 共享类型、Zod schema、跨端契约 |
| `packages/ui` | 基础 UI 原语 |

tldraw document 是唯一画布事实源。架构与边界见 [ARCHITECTURE.md](./ARCHITECTURE.md)。本轮修复状态与后续工作见 [整改记录](./docs/open-source-remediation.md)。

## 验证与部署

```bash
pnpm check                 # 所有包测试、类型检查、构建及真实本机 smoke
pnpm audit:dependencies    # 工作区安全公告检查，需要网络
pnpm audit:runtime-output  # pnpm build 后检查独立 runtime 产物
```

`pnpm check` 覆盖双客户端文档同步、断线重连、写入确认、房间权限、审批防重放，以及生产 Next 首页生成不同房间。检查需要允许监听本机临时端口；Mastra 构建会安装其独立输出依赖，首次运行可能需要网络。

生产配置、签名分享链接、内部 runtime 认证和运行限制见 [DEPLOYMENT.md](./DEPLOYMENT.md)。生产模式必须配置密钥，不能照搬无认证的本机开发模式。

贡献说明见 [CONTRIBUTING.md](./CONTRIBUTING.md)，安全问题报告见 [SECURITY.md](./SECURITY.md)。

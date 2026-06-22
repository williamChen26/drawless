# drawless Railway 部署配置

当前 MVP 不需要数据库。三个服务通过 Railway 公开域名互相连接：

```txt
browser -> web
web -> server
server -> coworker
coworker -> server /sync WebSocket
```

## 需要先拿到的值

在 Railway 给三个 service 分别生成 Public Networking 域名后，记录这三个值：

```txt
WEB_PUBLIC_URL=https://你的-web域名
SERVER_PUBLIC_URL=https://你的-server域名
COWORKER_PUBLIC_URL=https://你的-coworker域名
```

还需要一个模型 API key：

```txt
DEEPSEEK_API_KEY=你的-key
```

当前 Railway 项目的实际值：

```txt
WEB_PUBLIC_URL=https://drawlessweb-production.up.railway.app
SERVER_PUBLIC_URL=https://drawlessserver-production.up.railway.app
COWORKER_PUBLIC_URL=https://coworker-production-4aab.up.railway.app
DEEPSEEK_API_KEY=后续在 Railway coworker service 变量中填写
```

## web service 变量

`NEXT_PUBLIC_` 变量会进入 Next.js 前端构建产物，修改后必须重新部署 `web`。

```bash
NEXT_PUBLIC_DRAWLESS_SYNC_SERVER_URL=https://drawlessserver-production.up.railway.app
NEXT_PUBLIC_DRAWLESS_SERVER_URL=https://drawlessserver-production.up.railway.app
```

Build Command：

```bash
pnpm --filter @drawless/web build
```

Start Command：

```bash
pnpm --filter @drawless/web start
```

## server service 变量

Railway 会自动注入 `PORT`，不要手动设置固定端口。

```bash
HOST=0.0.0.0
SYNC_ROUTE=/sync
ALLOWED_ORIGINS=https://drawlessweb-production.up.railway.app
COWORKER_ENABLED=true
COWORKER_BASE_URL=https://coworker-production-4aab.up.railway.app
SERVER_PUBLIC_URL=https://drawlessserver-production.up.railway.app
COWORKER_REQUEST_TIMEOUT_MS=10000
```

Build Command：

```bash
pnpm --filter @drawless/server build
```

Start Command：

```bash
node apps/server/dist/src/main.js
```

## coworker service 变量

```bash
DEEPSEEK_API_KEY=你的-key
MASTRA_HOST=0.0.0.0
```

Build Command：

```bash
pnpm --filter coworker build
```

Start Command：

```bash
pnpm --filter coworker start
```

## 部署顺序

1. 先部署 `coworker`。
2. 再部署 `server`。
3. 最后部署 `web`。

## 验证

先打开：

```txt
https://drawlessserver-production.up.railway.app/health
https://drawlessserver-production.up.railway.app/ready
```

再打开：

```txt
https://drawlessweb-production.up.railway.app
```

创建 room 后，用另一个浏览器窗口打开同一个 room 链接，确认 tldraw 协同同步。

## MVP 限制

- `server` 当前房间数据存在进程内存里，重启或重新部署会丢。
- `server` 只能跑 1 个实例，不要横向扩容。
- `coworker` 控制 API 当前用于 MVP 联调，正式外放前需要补内部网络或签名鉴权。

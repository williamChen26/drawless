# 第三方依赖与素材

项目自有代码的许可证尚待维护者确定；当前文件不授予代码许可，也不替代任何依赖自带的 LICENSE。

- **tldraw SDK / sync**：遵循安装版本中各包附带的许可，其中 SDK 使用 tldraw 专有许可。生产部署者需取得适用授权并配置自己的 key。参见 [官方许可说明](https://tldraw.dev/community/license) 和 [license key 配置](https://tldraw.dev/sdk-features/license-key)。前端 license key 可以公开，但不能借用维护者的特定授权。
- **Next.js、React、Fastify、Zod、Motion、Vitest、Vite 等**：使用相应安装版本附带的开源许可证，部署和再分发时保留所要求的声明。
- **Mastra 及模型 SDK / 存储适配器**：以安装包的 LICENSE 为准；模型 API、远端追踪和托管服务另受服务提供方条款约束。
- **设计参考和资源文件**：参考材料不自动获得再分发许可。正式公开前维护者应逐项确认 `design-qa`、字体、图标及其他媒体来源；来源不明的参考材料应留在私有记录中。

锁定版本以 `pnpm-lock.yaml` 为准。可用 `pnpm licenses list` 查看本机已安装依赖的许可清单；该清单不代替原始许可文本和人工素材审核。

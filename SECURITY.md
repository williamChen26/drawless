# 安全说明

当前维护目标是仓库最新版本的 Alpha，不承诺历史版本安全维护或生产 SLA。当前尚未实现持久化、多租户账号与细粒度角色权限。

## 报告问题

请不要在公开 Issue 中提交可直接利用的漏洞、模型密钥、签名房间链接或用户数据。仓库开放后使用 GitHub 的 **Security → Report a vulnerability** 私下报告；维护者需要在公开前启用 Private vulnerability reporting。该入口未启用时，通过已有的维护者私下联系方式联系，暂不公开利用细节。

请说明受影响提交、最小复现、预期边界和实际影响。普通可公开复现的功能 bug 使用 Issue 模板。

## 部署约束

- 分享链接具有完整房间权限，应按凭据处理；当前没有只读角色、账号或单链接撤销。
- 使用生产模式、房间签名密钥和内部 runtime token。runtime 不应直接开放公网。
- tldraw 文档和模型上下文视为不可信输入。模型提供 roomId 不授予访问权，批准工具调用也不授予跨房间权限。
- 不保存重要资料唯一副本。Alpha 数据保留及第三方服务流向见 [部署说明](./DEPLOYMENT.md)。

## 依赖管理

运行 `pnpm audit:dependencies` 检查整个工作区，更新后执行 `pnpm check`。CI 对 moderate 及以上公告阻断合并；审计结果随公告库变化，不能把某次零告警视为永久安全证明。

当前临时兼容覆盖：Next 15.5.25 固定的 PostCSS 更新到 8.5.23；Hono Node adapter 保持 1.x 并至少使用 1.19.15。覆盖仅用于同主版本安全修复，升级上游后应删除不再需要的项并重新验证。Mastra 构建输出另有依赖安装，构建后运行 `pnpm audit:runtime-output`；CI 同时检查该输出。

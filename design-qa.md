# Coworker Presence Design QA

## 对照输入

- 纸带交接参考：`/Users/williamchen/.codex/generated_images/019f7d64-7f26-7293-957a-a7094b1ae7eb/exec-5aafa2d4-56ee-4d3a-a169-9e9129fd126a.png`
- 场景化审批参考：`/Users/williamchen/.codex/generated_images/019f7d64-7f26-7293-957a-a7094b1ae7eb/exec-7e730841-37b7-4b22-9f31-467ecc61b7bc.png`
- 纸张工作单参考：`/Users/williamchen/.codex/generated_images/019f7d64-7f26-7293-957a-a7094b1ae7eb/exec-bc27c331-d341-42c7-a681-fe5469cee789.png`
- 最终实现截图：`artifacts/design-audit/12-final-approval-with-plan.png`
- 并排对照：`artifacts/design-audit/13-final-comparison.png`
- 对照视口：1280 × 720
- 对照状态：Coworker 在线、真实画布 edit-canvas 请求、等待用户审批且计划已展开

## 设计方向

最终采用 **Pixel-Paper Diegetic Workspace（像素纸张场景化工作台）**：像素 Coworker 是稳定角色锚点，纸带、思考泡泡、审批工作单和结果便笺都是角色在画布世界中的“道具”，而不是另一套传统聊天容器。

- 桌面端人物位于左上安全区，避开顶部工具栏，同时保留从画布左侧进入工作的空间感。
- 移动端人物移动至右下方，操作内容位于其上方，并保持画布与顶部工具栏可用。
- 名称标签固定在人物正下方，不随浮层横向漂移。
- 输入提交后通过三阶段纸带折叠动画流向人物；动画使用独立短生命周期视觉状态，不改变真实会话 phase。
- 思考使用手绘气泡；审批使用暖白纸张工作单；结果使用可滚动的编辑工作便笺与固定完成凭证。
- 画布继续作为事实源；所有操作范围、数量、审批身份和执行结果来自真实 shared contract。

## 迭代发现与修复

- P1：人物名称原本横置，角色与身份关系弱。已固定到图片正下方。
- P1：提交反馈只是普通位移动画，没有“邻桌纸带”的材质和折叠感。已实现展开纸条、折叠纸块、纸屑和弧形墨迹轨迹。
- P1：长结果会被底部工具栏遮挡，完成凭证也可能滚出视口。已限制工作便笺高度，仅滚动正文，凭证与“在画布中查看”保持可见。
- P1：审批按钮存在重复触发窗口。已在本地 pending 状态锁定入口，并等待真实请求完成。
- P2：移动端结果便笺压住顶部调试栏。已修复为顶部 56px 起始且无横向溢出。
- P2：审批计划默认折叠，视觉层级弱于参考。已默认展开真实变更摘要。
- P2：人物和工作单最初偏小、偏下。已上移桌面角色锚点，并把主工作单扩大至 620px。
- P2：Composer 打开时结果便笺仍在背后竞争注意力。已保证同一时刻只有一个主交互对象。

## 响应式、动效与可访问性

- 390 × 844 实测：`body.scrollWidth === viewportWidth`，工作便笺、Composer、人物和顶部栏无重叠。
- Enter 发送、Shift + Enter 换行，覆盖 IME composition 与 keyCode 229。
- 动态状态使用稳定 `aria-live`；活动记录打开后接收焦点，关闭后返回触发按钮。
- 键盘可聚焦结果正文并滚动；审批、加入、发送等触点满足至少 44px。
- `prefers-reduced-motion` 下关闭纸张飞行、碎屑、工作单和面板动画；移动端静态交接方向与人物位置一致。
- 审批 identity、room epoch、operation token 与本地 pending 共同防止串房回写、竞态和双击。

## 最终差异判断

- 保留差异：人物比参考稿稍小，避免长期遮挡真实画布；审批时继续复用已有指向姿态，没有为一次状态引入风格不一致的新人物资产。
- 保留差异：不绘制无法由真实业务数据证明的人物到目标对象连线，避免视觉叙事超过系统实际能力。
- 风格、层级和状态语义已与参考方向一致，同时保持可生产化的响应式、可访问性和数据契约边界。

## 自动化验证

- `pnpm check`：通过。
- shared：8 个测试通过。
- server：15 个测试通过，smoke test 通过。
- web：56 个测试通过，TypeScript 类型检查通过，Next.js 生产构建通过。
- `git diff --check`：通过。

## 最终分级

- P0：0
- P1：0
- P2：0
- 参考方向一致性：9.2 / 10
- 产品真实性与业务契约：9.6 / 10
- 响应式与可访问性：9.4 / 10

final result: passed

# Drawless Liquid Glass Material

## 定位

Liquid Glass 是 Drawless 的**统一浮层材质**，用于表达“内容临时浮在画布之上，关闭后不改变底层事实”。它不是业务状态、布局组件或通用卡片样式；Drew 的交流、审批和交付浮层都使用这套材质，并由形状、密度和语义色区分用途。

适合：

- 覆盖画布的历史抽屉、检查器和临时工具面板。
- Drew 的对话气泡、思考气泡和交接信息片。
- 需要长时间阅读的审批、交付和结果说明，使用高可读 `document`。
- 浮层中的紧凑控制器。

不适合：

- 画布内容、Drew SVG 本体和普通正文页面背景。
- 为了“更精致”而给普通容器增加透明与折射。
- 与 Drew 浮层无关的普通布局容器。

## 两层边界

### 材质层：`@drawless/ui`

`LiquidGlassProvider` 与 `LiquidGlassSurface` 只负责：

- 共享 SVG 折射定义，避免每个表面重复 filter。
- 基础 tint、blur、saturation、内边缘光。
- Chromium 的低强度静态折射增强。
- Safari、Firefox、不支持 `backdrop-filter`、减少透明度和强制色彩模式的降级。

材质层不读取业务状态，不管理开关，不安装指针监听，也不定义宽高、内外边距和业务圆角。

### 应用层：业务组件

业务组件只负责：

- 选择 `panel`、`card`、`control` 或 `document`。
- 根据来源和状态选择 `neutral`、`accent`、`quiet`、`success`、`warning` 或 `danger`。
- 定义语义 HTML、布局、空间关系和响应式尺寸。
- 决定浮层何时出现、收起和恢复焦点。

业务组件不能覆盖 blur、折射强度或兼容性分支。确实需要新材质行为时，应先扩充材质层的语义 variant，而不是添加局部魔法数。

## API

```tsx
<LiquidGlassProvider>
  <LiquidGlassSurface asChild variant="panel">
    <header>...</header>
  </LiquidGlassSurface>

  <LiquidGlassSurface asChild tone="accent">
    <blockquote>...</blockquote>
  </LiquidGlassSurface>

  <LiquidGlassSurface asChild tone="quiet">
    <section>...</section>
  </LiquidGlassSurface>

  <LiquidGlassSurface asChild variant="control">
    <button type="button">收起</button>
  </LiquidGlassSurface>

  <LiquidGlassSurface asChild tone="warning" variant="document">
    <section aria-label="画布编辑审批">...</section>
  </LiquidGlassSurface>
</LiquidGlassProvider>
```

`asChild` 把材质附着到唯一子元素，不增加无语义 wrapper。

## Variant 规则

| Variant | 使用场景 | 材质行为 |
| --- | --- | --- |
| `panel` | 浮层标题、较大的结构表面 | blur 稍强，保持背景空间感 |
| `card` | 消息、简短说明、工作事件 | 默认高可读材质 |
| `control` | 浮层内部按钮或紧凑控制器 | blur 较低，允许轻微交互反馈 |
| `document` | 审批、交付、长结果说明 | tint 更实、背景干扰更低，适合持续阅读 |

| Tone | 使用场景 | 限制 |
| --- | --- | --- |
| `neutral` | Drew 内容和普通浮层内容 | 默认选择 |
| `accent` | 用户内容或需要区分来源的信息 | 只使用低饱和钴蓝 tint |
| `quiet` | 辅助信息、工具事件、空状态 | 仍须满足正文对比度 |
| `success` | 已完成且真实写入的交付 | 只使用低饱和绿色 tint |
| `warning` | 等待审批、部分完成或中断 | 只使用低饱和琥珀 tint |
| `danger` | 错误或未写入画布 | 只使用低饱和红色 tint |

## 视觉参数

- 折射位移固定为低强度 `11`，不随鼠标移动，不循环动画。
- `card` blur 为 `21px`，`panel` 为 `24px`，`control` 为 `16px`，`document` 在保持折射的同时使用更高不透明度。
- 饱和度保持在 `132%–148%`，避免背景颜色污染正文。
- 玻璃不使用传统外部投影；空间分层由暗化 scrim、边缘光和背景模糊共同表达。
- 圆角属于应用层：对话和思考气泡使用椭圆或有方向的气泡轮廓，工具事件更紧凑，文档浮层使用稳定的大圆角。
- 一次浮层中只使用一套 Provider；不要为列表中的每一项创建 Provider。

## 可读性与兼容性

- 文字颜色由应用层使用不透明色指定，不能依赖玻璃 tint 形成对比。
- 无 `backdrop-filter` 时使用约 `94%–96%` 的浅色实体表面。
- Safari 与 Firefox 使用标准 blur，不启用 SVG backdrop 折射。
- Chromium 在运行时确认能力后才启用共享 SVG 折射。
- `prefers-reduced-transparency: reduce` 下取消 blur 和折射，使用接近不透明的表面。
- `forced-colors: active` 下移除材质效果，回到系统 `Canvas` / `CanvasText`。
- 材质不改变原生 HTML 语义；键盘、焦点、滚动与触控责任仍由应用组件承担。

## 当前落地

整个 Drew 协作空间是标准实现：

- 整个 Drew 协作空间共用一套 Provider；“往来”入口和人物脚下的状态基座使用 `control`，建立与抽屉一致的浮层关系。
- 抽屉自身保持透明，没有传统外阴影。
- 标题为 `panel`，消息为 `card`，收起按钮为 `control`。
- 用户消息使用 `accent`，Drew 消息使用 `neutral`，工作事件与空状态使用 `quiet`。
- Composer 外层使用 `document`，输入控制区使用 `control`；对话与思考复用气泡组件。
- 审批使用 `warning document`；交付和结果根据真实结果使用 `success`、`warning` 或 `danger document`。
- 交接动效使用 `accent card` 玻璃片，不再模拟实体折页和硬阴影。
- 整个 Drew 协作空间共用一个静态 SVG filter；消息数量不会增加全局事件监听。

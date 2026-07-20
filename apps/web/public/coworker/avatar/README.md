# Coworker avatar frames

这些资源来自项目方提供的 10 帧 GIF，用于 drawless 画布内的 Coworker 会话入口。

- `frame-01.webp` 至 `frame-04.webp`：思考状态。
- `frame-05.webp` 至 `frame-07.webp`：工作状态。
- `frame-08.webp` 至 `frame-10.webp`：倾听状态。
- `pointing-right-v1.webp`：等待确认时指向画布或审批工作单的姿态。
- 所有帧使用相同的 256 × 256 透明画布、人物中心线和脚底基线，避免切帧抖动。
- 文件采用 lossless WebP；页面固定展示尺寸，避免布局偏移。

原始 GIF 的棋盘格已烘进像素且没有透明通道，因此这些文件不是浏览器运行时截帧，而是经过离线背景分离、统一裁剪和尺寸归一化后的可控静态资源。

`pointing-right-v1.webp` 使用项目提供的人物帧作为身份参考，通过 Image Gen 生成右侧指向姿态，再经过 chroma key 去背和基线校准。生成要求保持圆框眼镜、黑色发型、蓝色连帽衫、像素网格、人物比例与原帧一致；资源为 256 × 256 RGBA lossless WebP。

将仓库公开发布前，应由项目维护者确认原始人物素材的对外分发授权。

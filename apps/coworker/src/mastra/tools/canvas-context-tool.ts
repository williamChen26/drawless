import { createTool } from '@mastra/core/tools';

import {
  canvasContextRequestSchema,
  canvasContextSnapshotSchema,
  type DrawlessCanvasContextRequest,
  type DrawlessCanvasContextSnapshot,
} from '../../../../../packages/shared/src/index';
import { createUnavailableCanvasContextSnapshot } from './canvas-context-reader';

type CanvasContextCollector = (
  request: DrawlessCanvasContextRequest
) => Promise<DrawlessCanvasContextSnapshot> | DrawlessCanvasContextSnapshot;

let canvasContextCollector: CanvasContextCollector | null = null;

export function setCanvasContextCollector(collector: CanvasContextCollector) {
  canvasContextCollector = collector;
}

export const canvasContextTool = createTool({
  id: 'collect-canvas-context',
  description:
    'Read the current drawless tldraw room context when the user asks about canvas content, selected objects, nearby cursor content, structure, arrows, frames, or recent canvas changes. This tool is read-only and never mutates the canvas.',
  inputSchema: canvasContextRequestSchema,
  outputSchema: canvasContextSnapshotSchema,
  execute: async (request) => {
    if (!canvasContextCollector) {
      // Mastra 初始化顺序异常时保持只读失败，不让模型误以为已经看到了画布。
      return createUnavailableCanvasContextSnapshot({
        roomId: request.roomId,
        reason: 'coworker room registry 尚未绑定，无法读取画布上下文。',
      });
    }

    return canvasContextCollector(request);
  },
});

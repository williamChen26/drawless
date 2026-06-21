import { createTool } from '@mastra/core/tools';

import {
  canvasEditRequestSchema,
  canvasEditResultSchema,
  type DrawlessCanvasEditRequest,
  type DrawlessCanvasEditResult,
} from '../../../../../packages/shared/src/index';
import { createUnavailableCanvasEditResult } from './canvas-edit-executor';

type CanvasEditExecutor = (
  request: DrawlessCanvasEditRequest
) => Promise<DrawlessCanvasEditResult> | DrawlessCanvasEditResult;

let canvasEditExecutor: CanvasEditExecutor | null = null;

export function setCanvasEditExecutor(executor: CanvasEditExecutor) {
  canvasEditExecutor = executor;
}

export const canvasEditTool = createTool({
  id: 'edit-canvas',
  description:
    'Apply a user-approved, bounded edit plan to the current drawless tldraw canvas through the coworker collaborative TLStore. Use it only when the user explicitly asks to draw, create, move, resize, connect, or update canvas objects. Prefer arrow startBinding/endBinding when connecting shapes. By default the coworker performs the edit step by step with live presence. It requires approval before execution.',
  inputSchema: canvasEditRequestSchema,
  outputSchema: canvasEditResultSchema,
  requireApproval: true,
  execute: async (request) => {
    if (!canvasEditExecutor) {
      // 写工具不可用时必须返回明确失败，不能让模型误以为已经修改了画布。
      return createUnavailableCanvasEditResult({
        roomId: request.roomId,
        reason: 'coworker room registry 尚未绑定，无法写入画布。',
      });
    }

    return canvasEditExecutor(request);
  },
});

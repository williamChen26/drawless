import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const recentEventSchema = z.object({
  kind: z.string().describe('事件类型，例如 shape-created、selection-changed、user-message'),
  description: z.string().describe('事件的人类可读描述'),
  actorId: z.string().optional().describe('触发事件的协作者标识'),
  occurredAt: z.string().optional().describe('事件发生时间，优先使用 ISO 字符串'),
});

const canvasOperationDraftSchema = z.object({
  operationType: z
    .enum(['create', 'update', 'delete', 'group', 'arrange', 'comment'])
    .describe('拟议画布操作类型'),
  intent: z.string().describe('这次操作想帮助用户完成的目标'),
  targetDescription: z.string().describe('操作目标对象或区域的文字描述'),
  rationale: z.string().describe('为什么建议执行这次操作'),
  requiresUserConfirmation: z.boolean().describe('执行前是否需要用户确认'),
});

export const canvasInterventionTool = createTool({
  id: 'draft-canvas-intervention',
  description:
    'Draft a safe collaboration response for a tldraw canvas coworker. This tool does not read or mutate the real canvas.',
  inputSchema: z.object({
    roomId: z.string().optional().describe('当前协同房间标识'),
    currentUserIntent: z.string().optional().describe('用户当前表达的目标或问题'),
    canvasSummary: z.string().optional().describe('当前画布快照或摘要'),
    recentEvents: z.array(recentEventSchema).default([]).describe('最近的用户操作或协同事件'),
    requestKind: z
      .enum(['inspiration', 'advice', 'canvas_operation', 'diagnosis', 'next_steps'])
      .default('advice')
      .describe('用户期望 coworker 介入的方式'),
    interventionStyle: z
      .enum(['quiet', 'active', 'direct'])
      .default('active')
      .describe('coworker 回复和介入的主动程度'),
  }),
  outputSchema: z.object({
    collaborationStance: z.string().describe('coworker 在这次协作中的站位'),
    contextRead: z.string().describe('基于已给上下文得到的画布理解'),
    suggestedResponse: z.string().describe('建议发给用户的自然语言回复'),
    canvasOperationDrafts: z.array(canvasOperationDraftSchema).describe('可选的画布操作草案'),
    followUpQuestions: z.array(z.string()).describe('继续协作前需要澄清的问题'),
    boundaryNote: z.string().describe('当前工具边界说明'),
  }),
  execute: async ({
    roomId,
    currentUserIntent,
    canvasSummary,
    recentEvents = [],
    requestKind = 'advice',
    interventionStyle = 'active',
  }) => {
    const hasCanvasContext = Boolean(canvasSummary?.trim() || recentEvents.length > 0);
    const contextRead = hasCanvasContext
      ? [
          canvasSummary?.trim() ? `画布摘要：${canvasSummary.trim()}` : undefined,
          recentEvents.length > 0
            ? `最近事件：${recentEvents.map((event) => `${event.kind}: ${event.description}`).join('；')}`
            : undefined,
        ]
          .filter(Boolean)
          .join('\n')
      : '还没有收到真实画布快照或用户操作事件，不能判断画布上的具体内容。';

    const operationDrafts =
      requestKind === 'canvas_operation'
        ? [
            {
              operationType: 'comment' as const,
              intent: currentUserIntent || '协助用户推进当前画布任务',
              targetDescription: hasCanvasContext ? '用户当前关注的画布区域' : '待接入 server 后由画布上下文确定',
              rationale: hasCanvasContext
                ? '先以注释或草案方式介入，避免在缺少确认时直接改动画布事实源。'
                : '当前缺少真实画布上下文，只能提出操作草案，不能执行画布修改。',
              requiresUserConfirmation: true,
            },
          ]
        : [];

    const suggestedResponse = createSuggestedResponse({
      currentUserIntent,
      hasCanvasContext,
      interventionStyle,
      requestKind,
      roomId,
    });

    return {
      collaborationStance: '作为进入同一个 tldraw room 的同事，先理解画布事实源，再给建议或提出可确认的操作草案。',
      contextRead,
      suggestedResponse,
      canvasOperationDrafts: operationDrafts,
      followUpQuestions: hasCanvasContext
        ? []
        : ['接入 server 后，请提供当前 room 的画布快照、最近操作事件或用户选区信息。'],
      boundaryNote:
        '当前 Mastra coworker 还没有连接 drawless server，也不会直接修改 tldraw document；后续画布操作应通过协同边界提交。',
    };
  },
});

function createSuggestedResponse(input: {
  currentUserIntent?: string;
  hasCanvasContext: boolean;
  interventionStyle: 'quiet' | 'active' | 'direct';
  requestKind: 'inspiration' | 'advice' | 'canvas_operation' | 'diagnosis' | 'next_steps';
  roomId?: string;
}) {
  const roomText = input.roomId ? `我会把这次协作限定在 room ${input.roomId}。` : '我会等进入具体 room 后再读取上下文。';
  const intentText = input.currentUserIntent ? `我理解你现在想要：${input.currentUserIntent}` : '我会先确认你当前想推进的目标。';

  if (!input.hasCanvasContext) {
    return `${roomText} ${intentText} 目前我还没有真实画布快照或操作事件，所以不会编造画布内容；可以先帮你拆目标、列下一步，等接入协同数据后再给具体建议或操作草案。`;
  }

  if (input.requestKind === 'canvas_operation') {
    return `${intentText} 我可以先给出可确认的画布操作草案；真正执行时应通过 drawless server 的协同链路写回 tldraw document。`;
  }

  if (input.interventionStyle === 'quiet') {
    return `${intentText} 我会保持低打扰，只在发现明显卡点、结构机会或用户明确求助时介入。`;
  }

  if (input.interventionStyle === 'direct') {
    return `${intentText} 我会直接给出下一步建议，并把可能的画布改动整理成可确认的操作草案。`;
  }

  return `${intentText} 我会像同事一样结合画布上下文给出灵感、建议和下一步行动。`;
}

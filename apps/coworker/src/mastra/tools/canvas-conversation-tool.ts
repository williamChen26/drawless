import { createTool } from '@mastra/core/tools';
import {
  coworkerConversationRequestSchema,
  coworkerConversationResponseSchema,
  createDrawlessCoworkerSessionId,
  type DrawlessCanvasSemanticGraph,
  type DrawlessCanvasSummary,
  type DrawlessCoworkerConversationResponse,
} from '../../../../../packages/shared/src/index';

export const canvasConversationTool = createTool({
  id: 'reply-canvas-conversation',
  description:
    'Reply to a drawless conversation chat message using validated canvas context. This tool does not mutate the canvas.',
  inputSchema: coworkerConversationRequestSchema,
  outputSchema: coworkerConversationResponseSchema,
  execute: async ({
    roomId,
    userMessage,
    canvasSummary,
    canvasSemanticGraph,
  }): Promise<DrawlessCoworkerConversationResponse> => {
    const now = new Date().toISOString();
    const coworkerSessionId = createDrawlessCoworkerSessionId({
      roomId,
      instanceId: 'conversation-tool',
    });

    // 当前阶段只返回只读聊天回复，不生成操作请求，也不写入画布。
    return coworkerConversationResponseSchema.parse({
      roomId,
      replyMessage: {
        messageId: createMessageId(roomId),
        roomId,
        channel: 'conversation_chat',
        sender: 'coworker',
        senderSessionId: coworkerSessionId,
        intent: 'message',
        text: createReplyText({
          userText: userMessage.text,
          canvasSummary,
          canvasSemanticGraph,
        }),
        createdAt: now,
        canvasContext: userMessage.canvasContext,
      },
      operationRequest: null,
    });
  },
});

function createReplyText(input: {
  userText: string;
  canvasSummary: DrawlessCanvasSummary | null;
  canvasSemanticGraph: DrawlessCanvasSemanticGraph | null;
}) {
  const userIntent = input.userText.trim();
  const contextText = describeCanvasContext({
    canvasSummary: input.canvasSummary,
    canvasSemanticGraph: input.canvasSemanticGraph,
  });

  if (!input.canvasSummary && !input.canvasSemanticGraph) {
    return `我理解你的问题是：「${userIntent}」。目前我还没有收到画布摘要或语义图，所以不会编造画布内容；我可以先基于你的目标帮你拆下一步，等接入画布上下文后再给具体判断。`;
  }

  return `我理解你的问题是：「${userIntent}」。基于当前画布上下文：${contextText} 我会先给只读建议；如果后续需要我操作画布，我会先在聊天里说明想做什么，并等你明确允许。`;
}

function describeCanvasContext(input: {
  canvasSummary: DrawlessCanvasSummary | null;
  canvasSemanticGraph: DrawlessCanvasSemanticGraph | null;
}) {
  const parts: string[] = [];

  if (input.canvasSummary) {
    parts.push(input.canvasSummary.summary);
    parts.push(
      `当前选中 ${input.canvasSummary.focus.selectedRecordIds.length} 个对象，最近变化 ${input.canvasSummary.focus.recentlyChangedRecordIds.length} 个对象。`
    );
  }

  if (input.canvasSemanticGraph) {
    parts.push(
      `语义图包含 ${input.canvasSemanticGraph.nodes.length} 个节点、${input.canvasSemanticGraph.edges.length} 条连接、${input.canvasSemanticGraph.regions.length} 个区域。`
    );
  }

  return parts.join(' ');
}

function createMessageId(roomId: string) {
  const randomPart =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `message:${roomId}:${randomPart}`;
}

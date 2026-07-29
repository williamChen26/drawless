import type { ReadableStream } from 'node:stream/web';
import type {
  DrawlessCoworkerCursorChatEvent,
  DrawlessCoworkerRoomClient,
} from './coworker-room-client';

const DEFAULT_REPLY = '我看到了，我们先顺着这里聊。';
const AI_ERROR_REPLY = '我看到这条了，但 AI 暂时没连上。';

export type DrawlessCursorChatReplyAgent = {
  /** 通过 Mastra 注册后的 agent 发起流式回复。 */
  stream: (
    messages: string,
    options?: {
      memory?: { resource: string; thread: string };
      activeTools?: string[];
      maxSteps?: number;
      abortSignal?: AbortSignal;
    }
  ) => Promise<DrawlessAgentStreamOutput>;
  /** 用户确认需要审批的 tool call 后恢复 Mastra stream。 */
  approveToolCall: (request: DrawlessToolApprovalResumeRequest) => Promise<DrawlessAgentStreamOutput>;
  /** 用户拒绝需要审批的 tool call 后恢复 Mastra stream。 */
  declineToolCall: (request: DrawlessToolApprovalResumeRequest) => Promise<DrawlessAgentStreamOutput>;
};

export type DrawlessAgentStreamOutput = {
  /** Mastra 当前 run ID，用于 web 后续确认 tool call。 */
  runId?: string | undefined;
  /** Mastra 正文文本流。 */
  textStream: ReadableStream<string>;
  /** Mastra 完整事件流；包含 tool-call、tool-result、approval 等事件。 */
  fullStream?: AsyncIterable<unknown> | undefined;
};

export type DrawlessToolApprovalResumeRequest = {
  /** Mastra 当前 agent stream 的 run ID。 */
  runId: string;
  /** 等待用户确认或拒绝的 tool call ID。 */
  toolCallId: string;
};

export type DrawlessCursorChatReplyInput = {
  /** 收到 cursor chat 的 coworker room client。 */
  client: DrawlessCoworkerRoomClient;
  /** 从 tldraw presence 观察到的用户 cursor chat。 */
  event: DrawlessCoworkerCursorChatEvent;
  /** 用于生成 AI 回复的 Mastra agent。 */
  agent: DrawlessCursorChatReplyAgent;
};

/**
 * 对用户 cursor chat 生成并发送一条最小 AI 回复。
 *
 * 这一层只做“用户发 cursor chat -> AI 回一句”的闭环：
 * 不主动介入、不请求画布操作、不写 document，只通过 coworker presence 发临时 cursor chat。
 */
export async function replyToCursorChat(input: DrawlessCursorChatReplyInput) {
  const prompt = createCursorChatPrompt(input);
  const replyCursor = createReplyCursor(input.event.cursor);
  let replyText = DEFAULT_REPLY;
  let lastSentReplyText: string | null = null;

  const sendReply = (text: string) => {
    if (text === lastSentReplyText) {
      return;
    }

    lastSentReplyText = text;
    input.client.sendCursorChat(text, replyCursor);
  };

  try {
    const result = await input.agent.stream(prompt, {
      activeTools: ['collect-canvas-context'],
      maxSteps: 4,
      memory: {
        resource: input.event.roomId,
        thread: `${input.event.roomId}:cursor`,
      },
    });
    replyText = sanitizeCursorChatReply(
      await readTextStream(result.textStream, (partialText) => {
        const partialReply = sanitizeCursorChatPartialReply(partialText);
        if (partialReply) {
          sendReply(partialReply);
        }
      })
    );
  } catch (error) {
    // AI 调用失败时仍保持协同链路可验证，但不把错误伪装成真实 AI 判断。
    console.warn('[drawless coworker] cursor chat AI reply failed', error);
    replyText = AI_ERROR_REPLY;
  }

  sendReply(replyText);
}

function createCursorChatPrompt(input: DrawlessCursorChatReplyInput) {
  const snapshot = input.client.getSnapshot();
  const cursorText = input.event.cursor
    ? `(${Math.round(input.event.cursor.x)}, ${Math.round(input.event.cursor.y)})`
    : '未知位置';

  return [
    '你是 Drew，正在 Drawless 的 tldraw 画布里，以画布搭档身份通过 cursor chat 和用户现场交流。',
    '当前只允许回复用户的 cursor chat：不要主动提出画布操作，不要声称已经修改画布。',
    '如果用户消息里的“这里、这个、画布、选中、连线、结构、缺什么、是否清楚”等需要画布事实，请先调用 collect-canvas-context。',
    '调用 collect-canvas-context 时使用下面的房间、page 和 cursor 信息；工具返回 unavailable 时必须承认没有读到画布。',
    'cursor chat 是协作者光标旁的短消息，请像真人 cursor chat 一样只回一句短句，最多 18 个汉字。',
    '只输出回复正文，不要输出解释、标题、列表或换行。',
    '',
    `房间：${input.event.roomId}`,
    `用户：${input.event.userName}`,
    `用户 cursor chat：${input.event.message}`,
    `cursor 位置：${cursorText}`,
    `当前 page：${input.event.currentPageId}`,
    `轻量画布状态：record ${snapshot.recordCount} 个，shape ${snapshot.shapeCount} 个，presence ${snapshot.presenceCount} 个。`,
  ].join('\n');
}

function sanitizeCursorChatReply(text: string) {
  return sanitizeCursorChatReplyText(text) ?? DEFAULT_REPLY;
}

function sanitizeCursorChatPartialReply(text: string) {
  return sanitizeCursorChatReplyText(text);
}

function sanitizeCursorChatReplyText(text: string) {
  const reply = text.trim().replace(/^["“”'‘’]+|["“”'‘’]+$/gu, '').trim();

  if (!reply) {
    return null;
  }

  return reply;
}

async function readTextStream(stream: ReadableStream<string>, onChunk: (text: string) => void) {
  const reader = stream.getReader();
  const chunks: string[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      chunks.push(value);
      onChunk(chunks.join(''));
    }
  } finally {
    reader.releaseLock();
  }

  return chunks.join('');
}

function createReplyCursor(cursor: DrawlessCoworkerCursorChatEvent['cursor']) {
  if (!cursor) {
    return undefined;
  }

  // 稍微错开用户 cursor，避免两个 cursor chat 气泡完全重叠。
  return {
    x: cursor.x + 24,
    y: cursor.y + 24,
  };
}

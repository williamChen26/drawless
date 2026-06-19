export type CoworkerConversationOutput =
  | {
      /** coworker 正文增量输出。 */
      kind: "text-delta";
      /** Mastra text-delta 的增量文本。 */
      text: string;
      /** 事件在 conversation UI 中展示的补充状态。 */
      event: CoworkerConversationEventSummary;
      /** Mastra 原始 stream chunk，web 端 RAW 区直接展示。 */
      raw: unknown;
    }
  | {
      /** tool 相关事件，必须完整保留原始 chunk。 */
      kind: "tool";
      /** 事件在 conversation UI 中展示的补充状态。 */
      event: CoworkerConversationEventSummary;
      /** Mastra 原始 tool chunk，包含 tool-call/tool-result 等完整数据。 */
      raw: unknown;
    }
  | {
      /** 其它 Mastra stream chunk。 */
      kind: "raw";
      /** 事件在 conversation UI 中展示的补充状态。 */
      event: CoworkerConversationEventSummary;
      /** Mastra 原始 stream chunk。 */
      raw: unknown;
    };

export type CoworkerConversationEventSummary = {
  /** stream chunk 的原始 type；缺失时使用 message。 */
  type: string;
  /** 给 conversation UI 展示的短状态。 */
  label: string;
  /** 对 label 的补充说明；没有可读信息时为 null。 */
  detail: string | null;
  /** 原始 stream chunk，便于开发阶段排查。 */
  raw: unknown;
};

export function createCoworkerConversationOutput(
  event: unknown
): CoworkerConversationOutput {
  const type = getStringField(event, "type");
  const summary = createCoworkerConversationEventSummary(event);
  if (type === "text-delta") {
    return {
      kind: "text-delta",
      text: getTextDelta(event),
      event: summary,
      raw: event
    };
  }

  if (type?.includes("tool")) {
    return {
      kind: "tool",
      event: summary,
      raw: event
    };
  }

  return {
    kind: "raw",
    event: summary,
    raw: event
  };
}

export function createCoworkerConversationEventSummary(
  event: unknown
): CoworkerConversationEventSummary {
  const type = getStringField(event, "type") ?? "message";
  const toolName = getToolName(event);
  if (type === "text-delta") {
    const text = getTextDelta(event);
    return {
      type,
      label: "正文增量",
      detail: text ? `${text.length} 字符` : null,
      raw: event
    };
  }

  if (type.includes("tool")) {
    return {
      type,
      label: formatToolEventLabel(type),
      detail: toolName,
      raw: event
    };
  }

  if (type === "error") {
    return {
      type,
      label: "流式错误",
      detail: getErrorMessage(event),
      raw: event
    };
  }

  if (isDoneEventType(type)) {
    return {
      type,
      label: "回复完成",
      detail: null,
      raw: event
    };
  }

  return {
    type,
    label: type,
    detail: getStringField(event, "message"),
    raw: event
  };
}

function getTextDelta(event: unknown) {
  const payload = getObjectField(event, "payload");
  return (
    getStringField(payload, "text") ??
    getStringField(event, "text") ??
    getStringField(event, "delta") ??
    ""
  );
}

function getObjectField(input: unknown, key: string) {
  if (!input || typeof input !== "object" || !(key in input)) {
    return null;
  }

  const value = (input as Record<string, unknown>)[key];
  return value && typeof value === "object" ? value : null;
}

function getStringField(input: unknown, key: string) {
  if (!input || typeof input !== "object" || !(key in input)) {
    return null;
  }

  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function getToolName(event: unknown) {
  const payload = getObjectField(event, "payload");
  return (
    getStringField(payload, "toolName") ??
    getStringField(payload, "name") ??
    getStringField(event, "toolName") ??
    getStringField(event, "name")
  );
}

function getErrorMessage(event: unknown) {
  const payload = getObjectField(event, "payload");
  const error = getObjectField(event, "error") ?? getObjectField(payload, "error");
  return (
    getStringField(error, "message") ??
    getStringField(payload, "message") ??
    getStringField(event, "message")
  );
}

function formatToolEventLabel(type: string) {
  if (type.includes("result")) {
    return "工具结果";
  }
  if (type.includes("call") || type.includes("start")) {
    return "工具调用";
  }
  return "工具事件";
}

function isDoneEventType(type: string) {
  return (
    type === "finish" ||
    type === "done" ||
    type === "message_stop" ||
    type === "response.completed" ||
    type.endsWith(".completed")
  );
}

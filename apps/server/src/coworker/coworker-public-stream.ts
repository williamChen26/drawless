import { randomUUID } from "node:crypto";

import {
  DRAWLESS_COWORKER_DISPLAY_NAME,
  canvasEditRequestSchema,
  type DrawlessRoomId
} from "@drawless/shared";

import type {
  CoworkerApprovalLease,
  CoworkerApprovalRegistry
} from "./coworker-approval-registry.js";

/**
 * 把 Coworker runtime SSE 转成 Web 可消费的公开事件流。
 *
 * Web 只看到 operationId 和 approval，不需要理解 Mastra 的 runId/toolCallId。
 * 原始标识只在此 adapter 内用于关联 server 审批注册表。
 */
export function createCoworkerPublicEventStream(input: {
  /** Coworker runtime 返回的原始 SSE body。 */
  stream: ReadableStream<Uint8Array>;
  /** 当前协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** Server 进程内的审批注册表。 */
  approvalRegistry: CoworkerApprovalRegistry;
  /** 审批续流时已知的 runtime 与公开 ID 映射。 */
  resolvedApproval?: CoworkerApprovalLease | undefined;
}) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const operationIds = new Map<string, string>();
  let buffer = "";

  if (input.resolvedApproval) {
    operationIds.set(
      input.resolvedApproval.runtime.toolCallId,
      input.resolvedApproval.approval.id
    );
  }

  const transformEvent = (block: string) => {
    const data = readSseData(block);
    if (!data) {
      return "";
    }

    let event: unknown;
    try {
      event = JSON.parse(data) as unknown;
    } catch {
      return "";
    }
    if (!isRecord(event)) {
      return "";
    }

    const type = getStringField(event, "type") ?? "message";
    if (!["text-start", "text-delta", "text-end", "tool-call", "tool-result", "tool-call-approval", "tool-error", "error", "finish", "start", "step-start", "step-finish"].includes(type)) return "";
    if (type === "error" || type === "tool-error") return encodePublicStreamError("AI 请求未完成，请重试。");
    const payload = getObjectField(event, "payload");
    const runtimeToolCallId = getRuntimeToolCallId(event, payload);
    const runtimeRunId =
      getStringField(event, "runId") ?? getStringField(payload, "runId");
    const toolName = getToolName(event, payload);
    let operationId: string | null = null;

    if (runtimeToolCallId && type.includes("tool")) {
      operationId = operationIds.get(runtimeToolCallId) ?? randomUUID();
      operationIds.set(runtimeToolCallId, operationId);
    }

    let approval = null;
    if (type === "tool-call-approval") {
      if (!operationId || !runtimeRunId || !runtimeToolCallId) {
        return encodePublicStreamError(
          "Coworker approval event is missing runtime identifiers."
        );
      }
      try {
        const registration = createApprovalRegistration({
          roomId: input.roomId,
          toolName,
          proposal: getToolArguments(event, payload)
        });
        approval = input.approvalRegistry.register({
          id: operationId,
          roomId: input.roomId,
          runId: runtimeRunId,
          toolCallId: runtimeToolCallId,
          ...registration
        });
      } catch (error) {
        return encodePublicStreamError(
          error instanceof Error
            ? error.message
            : `无法准备 ${DRAWLESS_COWORKER_DISPLAY_NAME} 的确认计划。`
        );
      }
    }

    return encodePublicEvent(
      sanitizeRuntimeEvent(event, {
        operationId,
        runtimeToolCallId,
        approval
      })
    );
  };

  return input.stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        if (buffer.length > 1024 * 1024) throw new Error("Coworker stream event exceeds size limit.");
        const completed = takeCompletedSseBlocks(buffer);
        buffer = completed.remainder;
        for (const block of completed.blocks) {
          controller.enqueue(encoder.encode(transformEvent(block)));
        }
      },
      flush(controller) {
        buffer += decoder.decode();
        if (buffer.trim()) {
          controller.enqueue(encoder.encode(transformEvent(buffer)));
        }
      }
    })
  );
}

function createApprovalRegistration(input: {
  roomId: DrawlessRoomId;
  toolName: string | null;
  proposal: unknown;
}) {
  const capability = mapToolToCapability(input.toolName);
  if (capability !== "canvas.edit") {
    throw new Error("这项能力暂时没有可验证的审批策略，已停止执行。");
  }

  const proposal = canvasEditRequestSchema.safeParse(
    parseStructuredProposal(input.proposal)
  );
  if (!proposal.success) {
    throw new Error("画布编辑计划没有通过安全校验，已停止执行。");
  }
  if (proposal.data.roomId !== input.roomId) {
    throw new Error("画布编辑计划与当前房间不一致，已停止执行。");
  }

  return {
    capability,
    risk: "write" as const,
    proposal: proposal.data
  };
}

function parseStructuredProposal(proposal: unknown) {
  if (typeof proposal !== "string") {
    return proposal;
  }
  try {
    return JSON.parse(proposal) as unknown;
  } catch {
    return proposal;
  }
}

function sanitizeRuntimeEvent(
  event: Record<string, unknown>,
  input: {
    operationId: string | null;
    runtimeToolCallId: string | null;
    approval: unknown;
  }
) {
  const next: Record<string, unknown> = publicFields(event);
  delete next.runId;
  delete next.toolCallId;

  if (input.operationId) {
    next.operationId = input.operationId;
  }
  if (input.approval) {
    next.approval = input.approval;
  }

  const payload = getObjectField(event, "payload");
  if (payload) {
    const nextPayload: Record<string, unknown> = publicFields(payload);
    delete nextPayload.runId;
    delete nextPayload.toolCallId;
    if (
      input.runtimeToolCallId &&
      getStringField(nextPayload, "id") === input.runtimeToolCallId
    ) {
      delete nextPayload.id;
    }
    if (input.operationId) {
      nextPayload.operationId = input.operationId;
    }
    next.payload = nextPayload;
  }

  return next;
}

function mapToolToCapability(toolName: string | null) {
  if (toolName === "edit-canvas") {
    return "canvas.edit";
  }
  if (!toolName) {
    return "unknown";
  }

  const normalized = toolName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return normalized ? `tool.${normalized}` : "unknown";
}

function getRuntimeToolCallId(
  event: Record<string, unknown>,
  payload: Record<string, unknown> | null
) {
  return (
    getStringField(payload, "toolCallId") ??
    getStringField(event, "toolCallId") ??
    getStringField(payload, "id") ??
    getStringField(event, "id")
  );
}

function getToolName(
  event: Record<string, unknown>,
  payload: Record<string, unknown> | null
) {
  return (
    getStringField(payload, "toolName") ??
    getStringField(payload, "name") ??
    getStringField(event, "toolName") ??
    getStringField(event, "name")
  );
}

function getToolArguments(
  event: Record<string, unknown>,
  payload: Record<string, unknown> | null
) {
  return (
    getUnknownField(payload, "args") ??
    getUnknownField(payload, "input") ??
    getUnknownField(event, "args") ??
    getUnknownField(event, "input")
  );
}

function encodePublicEvent(event: unknown) {
  const type = isRecord(event) ? getStringField(event, "type") : null;
  return `event: ${type ?? "message"}\ndata: ${JSON.stringify(event ?? null)}\n\n`;
}

function encodePublicStreamError(message: string) {
  return encodePublicEvent({
    type: "error",
    error: { message }
  });
}

function readSseData(block: string) {
  const dataLines = block
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
  return dataLines.length > 0 ? dataLines.join("\n") : null;
}

function takeCompletedSseBlocks(buffer: string) {
  const blocks: string[] = [];
  const delimiter = /\r?\n\r?\n/gu;
  let cursor = 0;
  for (const match of buffer.matchAll(delimiter)) {
    const index = match.index ?? 0;
    blocks.push(buffer.slice(cursor, index));
    cursor = index + match[0].length;
  }
  return { blocks, remainder: buffer.slice(cursor) };
}

function ensureSseDelimiter(block: string) {
  return `${block.replace(/(?:\r?\n)+$/u, "")}\n\n`;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === "object" && !Array.isArray(input);
}

function getObjectField(input: unknown, key: string) {
  if (!isRecord(input)) {
    return null;
  }
  const value = input[key];
  return isRecord(value) ? value : null;
}

function getUnknownField(input: unknown, key: string) {
  return isRecord(input) && key in input ? input[key] : null;
}

function getStringField(input: unknown, key: string) {
  const value = isRecord(input) ? input[key] : null;
  return typeof value === "string" ? value : null;
}

// 明确允许的展示字段；不把 runtime 元数据、堆栈或 provider 请求透传给浏览器。
function publicFields(input: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set(["type", "id", "text", "textDelta", "delta", "payload", "toolName", "name", "args", "input", "result", "output", "finishReason"]);
  return Object.fromEntries(Object.entries(input).filter(([key]) => allowed.has(key)).map(([key, value]) => [key, scrubPrivateFields(value)]));
}
function scrubPrivateFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubPrivateFields);
  if (!isRecord(value)) return value;
  const privateFields = new Set(["runId", "toolCallId", "stack", "request", "response", "headers", "apiKey", "authorization", "providerMetadata", "requestContext", "system", "messages", "traceId", "spanId"]);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !privateFields.has(key)).map(([key, nested]) => [key, scrubPrivateFields(nested)]));
}

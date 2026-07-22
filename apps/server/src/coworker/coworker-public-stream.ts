import { randomUUID } from "node:crypto";

import type { DrawlessRoomId } from "@drawless/shared";

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
      return ensureSseDelimiter(block);
    }

    let event: unknown;
    try {
      event = JSON.parse(data) as unknown;
    } catch {
      return ensureSseDelimiter(block);
    }
    if (!isRecord(event)) {
      return encodePublicEvent(event);
    }

    const type = getStringField(event, "type") ?? "message";
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
        approval = input.approvalRegistry.register({
          id: operationId,
          roomId: input.roomId,
          runId: runtimeRunId,
          toolCallId: runtimeToolCallId,
          capability: mapToolToCapability(toolName),
          risk: "write",
          proposal: getToolArguments(event, payload)
        });
      } catch (error) {
        return encodePublicStreamError(
          error instanceof Error
            ? error.message
            : "Coworker approval registration failed."
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

function sanitizeRuntimeEvent(
  event: Record<string, unknown>,
  input: {
    operationId: string | null;
    runtimeToolCallId: string | null;
    approval: unknown;
  }
) {
  const next: Record<string, unknown> = { ...event };
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
    const nextPayload: Record<string, unknown> = { ...payload };
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

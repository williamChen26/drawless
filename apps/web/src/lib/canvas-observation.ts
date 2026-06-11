import {
  canvasSemanticGraphSchema,
  canvasSummarySchema,
  type DrawlessCanvasBounds,
  type DrawlessCanvasObservationEvent,
  type DrawlessCanvasSemanticEdge,
  type DrawlessCanvasSemanticGraph,
  type DrawlessCanvasSemanticNode,
  type DrawlessCanvasSemanticNodeKind,
  type DrawlessCanvasSemanticRegion,
  type DrawlessCanvasSemanticRegionKind,
  type DrawlessCanvasSummary,
  type DrawlessRoomId,
  type DrawlessSessionId
} from "@drawless/shared";
import type {
  TLInstancePresence,
  TLRecord,
  TLShape,
  TLStoreSnapshot
} from "tldraw";

export type CanvasObservationInput = {
  /** 当前协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 当前浏览器标签页连接 sync room 使用的 session ID。 */
  actorSessionId: DrawlessSessionId;
  /** 需要摘要的 tldraw records。 */
  records: TLRecord[];
  /** 摘要生成时间；不传时使用当前时间。 */
  capturedAt?: string;
  /** 当前 page ID；不传时从 records 中推断。 */
  currentPageId?: string | null;
  /** 当前选中的 tldraw record ID。 */
  selectedRecordIds?: string[];
  /** 最近发生变化的 tldraw record ID。 */
  recentlyChangedRecordIds?: string[];
  /** 当前视口内可见的 tldraw record ID。 */
  viewportRecordIds?: string[];
};

type ShapeDigest = {
  id: string;
  type: string;
  text: string | null;
  x: number;
  y: number;
  parentId: string;
};

type ArrowEndpointBinding = {
  fromId: string | null;
  toId: string | null;
};

export function createCanvasSummaryFromSnapshot(
  input: Omit<CanvasObservationInput, "records"> & {
    /** tldraw store 的序列化快照。 */
    snapshot: TLStoreSnapshot;
  }
): DrawlessCanvasSummary {
  return createCanvasSummary({
    ...input,
    records: Object.values(input.snapshot.store)
  });
}

export function createCanvasSemanticGraphFromSnapshot(
  input: Omit<CanvasObservationInput, "records"> & {
    /** tldraw store 的序列化快照。 */
    snapshot: TLStoreSnapshot;
  }
): DrawlessCanvasSemanticGraph {
  return createCanvasSemanticGraph({
    ...input,
    records: Object.values(input.snapshot.store)
  });
}

export function createCanvasSemanticGraph(
  input: CanvasObservationInput
): DrawlessCanvasSemanticGraph {
  const generatedAt = input.capturedAt ?? new Date().toISOString();
  const shapes = input.records.filter(isShapeRecord);
  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]));
  // tldraw 的箭头端点通常记录在 binding record 里，而不是 arrow shape 本身。
  const arrowBindingsById = createArrowBindingsById(input.records);
  const nodes = shapes.map((shape) => toSemanticNode(shape, shapesById));
  const edges = shapes
    .filter((shape) => shape.type === "arrow")
    .map((shape) => toSemanticEdge(shape, arrowBindingsById.get(shape.id)));
  const regions = createSemanticRegions(shapes, nodes);

  // 语义图是从 tldraw records 临时派生出的观察视图，不会成为新的画布事实源。
  return canvasSemanticGraphSchema.parse({
    roomId: input.roomId,
    generatedAt,
    currentPageId: input.currentPageId ?? inferCurrentPageId(input.records),
    nodes,
    edges,
    regions
  });
}

export function createCanvasSummary(input: CanvasObservationInput): DrawlessCanvasSummary {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const shapes = input.records.filter(isShapeRecord).map(toShapeDigest);
  const presences = input.records.filter(isPresenceRecord);
  const selectedRecordIds =
    input.selectedRecordIds ?? getPresenceSelectedRecordIds(presences);
  const recentlyChangedRecordIds = input.recentlyChangedRecordIds ?? [];
  const viewportRecordIds = input.viewportRecordIds ?? shapes.map((shape) => shape.id);
  const currentPageId = input.currentPageId ?? inferCurrentPageId(input.records);
  const recentEvents = createRecentEvents({
    actorSessionId: input.actorSessionId,
    roomId: input.roomId,
    capturedAt,
    recordsById: new Map(input.records.map((record) => [record.id, record])),
    recentlyChangedRecordIds
  });

  return canvasSummarySchema.parse({
    roomId: input.roomId,
    capturedAt,
    currentPageId,
    summary: describeCanvas({
      shapes,
      presences,
      selectedRecordIds,
      recentlyChangedRecordIds
    }),
    focus: {
      selectedRecordIds: uniqueNonEmptyStrings(selectedRecordIds),
      recentlyChangedRecordIds: uniqueNonEmptyStrings(recentlyChangedRecordIds),
      viewportRecordIds: uniqueNonEmptyStrings(viewportRecordIds)
    },
    recentEvents
  });
}

function createRecentEvents(input: {
  actorSessionId: DrawlessSessionId;
  roomId: DrawlessRoomId;
  capturedAt: string;
  recordsById: Map<string, TLRecord>;
  recentlyChangedRecordIds: string[];
}): DrawlessCanvasObservationEvent[] {
  return uniqueNonEmptyStrings(input.recentlyChangedRecordIds).map((recordId, index) => {
    const record = input.recordsById.get(recordId);

    return {
      roomId: input.roomId,
      eventId: `${input.capturedAt}:${recordId}:${index}`,
      occurredAt: input.capturedAt,
      actorSessionId: input.actorSessionId,
      kind: record && isShapeRecord(record) ? "shape_updated" : "unknown_change",
      recordIds: [recordId],
      summary: describeChangedRecord(recordId, record)
    };
  });
}

function describeCanvas(input: {
  shapes: ShapeDigest[];
  presences: TLInstancePresence[];
  selectedRecordIds: string[];
  recentlyChangedRecordIds: string[];
}): string {
  const shapeTypeCounts = countBy(input.shapes, (shape) => shape.type);
  const typeSummary = Object.entries(shapeTypeCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, count]) => `${type} ${count} 个`)
    .join("，");
  const textPreview = input.shapes
    .map((shape) => shape.text)
    .filter((text): text is string => Boolean(text))
    .slice(0, 5)
    .join("；");
  const parts = [
    `画布包含 ${input.shapes.length} 个 shape${typeSummary ? `（${typeSummary}）` : ""}。`,
    input.presences.length > 0
      ? `当前可见 ${input.presences.length} 个协作者 presence。`
      : "当前没有可见协作者 presence。",
    input.selectedRecordIds.length > 0
      ? `当前选中 ${input.selectedRecordIds.length} 个对象。`
      : "当前没有显式选区。",
    input.recentlyChangedRecordIds.length > 0
      ? `最近变化 ${input.recentlyChangedRecordIds.length} 个对象。`
      : "当前没有传入最近变化对象。",
    textPreview ? `文本预览：${textPreview}` : "当前没有可提取的文本内容。"
  ];

  return parts.join(" ");
}

function describeChangedRecord(recordId: string, record: TLRecord | undefined) {
  if (!record) {
    return `记录 ${recordId} 发生变化。`;
  }
  if (isShapeRecord(record)) {
    const text = extractShapeText(record);
    return text
      ? `用户更新了 ${record.type} shape：${text}`
      : `用户更新了 ${record.type} shape。`;
  }

  return `用户更新了 ${record.typeName} record。`;
}

function toShapeDigest(shape: TLShape): ShapeDigest {
  return {
    id: shape.id,
    type: shape.type,
    text: extractShapeText(shape),
    x: shape.x,
    y: shape.y,
    parentId: shape.parentId
  };
}

function toSemanticNode(
  shape: TLShape,
  shapesById: Map<string, TLShape>
): DrawlessCanvasSemanticNode {
  return {
    id: shape.id,
    kind: getSemanticNodeKind(shape),
    shapeType: shape.type,
    text: extractShapeText(shape),
    bounds: getShapeBounds(shape),
    parentId: shape.parentId,
    pageId: inferShapePageId(shape, shapesById)
  };
}

function toSemanticEdge(
  shape: TLShape,
  binding: ArrowEndpointBinding | undefined
): DrawlessCanvasSemanticEdge {
  const props = shape.props as Record<string, unknown>;
  // 优先使用真实 binding；兼容测试或旧数据里可能直接写在 arrow props 上的端点信息。
  const fromId =
    binding?.fromId ??
    getStringProp(props, "fromId") ??
    getBoundShapeIdProp(props.start) ??
    null;
  const toId =
    binding?.toId ??
    getStringProp(props, "toId") ??
    getBoundShapeIdProp(props.end) ??
    null;

  return {
    id: shape.id,
    fromId,
    toId,
    label: extractShapeText(shape),
    direction: fromId && toId ? "forward" : "unknown",
    recordId: shape.id
  };
}

function createSemanticRegions(
  shapes: TLShape[],
  nodes: DrawlessCanvasSemanticNode[]
): DrawlessCanvasSemanticRegion[] {
  const childIdsByParentId = new Map<string, string[]>();
  // 当前只认 tldraw parentId 明确表达的 frame/group 包含关系，不做空间碰撞猜测。
  for (const shape of shapes) {
    const childIds = childIdsByParentId.get(shape.parentId) ?? [];
    childIds.push(shape.id);
    childIdsByParentId.set(shape.parentId, childIds);
  }

  return nodes
    .filter((node) => node.kind === "frame" || node.kind === "group")
    .map((node) => ({
      id: node.id,
      kind: node.kind as DrawlessCanvasSemanticRegionKind,
      title: node.text,
      bounds: node.bounds,
      shapeIds: childIdsByParentId.get(node.id) ?? []
    }));
}

function getSemanticNodeKind(shape: TLShape): DrawlessCanvasSemanticNodeKind {
  if (shape.type === "text") {
    return "text";
  }
  if (shape.type === "arrow") {
    return "arrow";
  }
  if (shape.type === "frame") {
    return "frame";
  }
  if (shape.type === "group") {
    return "group";
  }
  if (shape.type === "geo" || shape.type === "note" || shape.type === "draw") {
    return "shape";
  }

  return "unknown";
}

function getShapeBounds(shape: TLShape): DrawlessCanvasBounds {
  const props = shape.props as Record<string, unknown>;

  // 不同 shape 的尺寸字段并不完全一致；缺失时保留 0，避免伪造不确定尺寸。
  return {
    x: shape.x,
    y: shape.y,
    w: getNumericProp(props, "w") ?? getNumericProp(props, "width") ?? 0,
    h: getNumericProp(props, "h") ?? getNumericProp(props, "height") ?? 0
  };
}

function inferShapePageId(shape: TLShape, shapesById: Map<string, TLShape>): string | null {
  let parentId: string | undefined = shape.parentId;
  // shape 可能挂在 frame/group 下，需要沿 parent 链向上找到 page。
  while (parentId) {
    if (parentId.startsWith("page:")) {
      return parentId;
    }

    parentId = shapesById.get(parentId)?.parentId;
  }

  return null;
}

function createArrowBindingsById(records: TLRecord[]) {
  const bindingsById = new Map<string, ArrowEndpointBinding>();
  for (const record of records) {
    if (!isBindingRecord(record)) {
      continue;
    }

    const binding = record as unknown as Record<string, unknown>;
    const arrowId = getStringProp(binding, "fromId");
    const targetId = getStringProp(binding, "toId");
    if (!arrowId || !targetId) {
      continue;
    }

    const props = getObjectProp(binding, "props");
    const terminal = props ? getStringProp(props, "terminal") : null;
    const current = bindingsById.get(arrowId) ?? { fromId: null, toId: null };
    // tldraw arrow binding 的 start/end 对应语义边的 from/to。
    if (terminal === "start") {
      current.fromId = targetId;
    } else if (terminal === "end") {
      current.toId = targetId;
    }

    bindingsById.set(arrowId, current);
  }

  return bindingsById;
}

function extractShapeText(shape: TLShape): string | null {
  const props = shape.props as Record<string, unknown>;
  const plainText =
    typeof props.text === "string" ? props.text : extractRichText(props.richText);
  const normalized = plainText?.replace(/\s+/g, " ").trim();

  return normalized ? normalized.slice(0, 180) : null;
}

function extractRichText(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  if ("text" in value && typeof value.text === "string") {
    return value.text;
  }
  if ("content" in value && Array.isArray(value.content)) {
    return value.content
      .map(extractRichText)
      .filter((text): text is string => Boolean(text))
      .join(" ");
  }

  return null;
}

function getStringProp(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function getNumericProp(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getObjectProp(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function getBoundShapeIdProp(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return getStringProp(value as Record<string, unknown>, "boundShapeId");
}

function getPresenceSelectedRecordIds(presences: TLInstancePresence[]) {
  return presences.flatMap((presence) => presence.selectedShapeIds);
}

function inferCurrentPageId(records: TLRecord[]) {
  const page = records.find((record) => record.typeName === "page");
  return page?.id ?? null;
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = getKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function uniqueNonEmptyStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isShapeRecord(record: TLRecord): record is TLShape {
  return record.typeName === "shape";
}

function isPresenceRecord(record: TLRecord): record is TLInstancePresence {
  return record.typeName === "instance_presence";
}

function isBindingRecord(record: TLRecord) {
  return record.typeName === "binding";
}

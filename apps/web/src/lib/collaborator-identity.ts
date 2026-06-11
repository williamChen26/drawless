const COLLABORATOR_COLORS = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#7c3aed",
  "#be123c",
  "#0f766e",
  "#a16207"
];

export type CollaboratorIdentity = {
  /** 从设备 ID 提取出来的短标识，用于调试显示和 tldraw 用户元数据。 */
  shortDeviceId: string;
  /** 展示给协作者看的设备名称。 */
  userName: string;
  /** tldraw 在线协作者使用的稳定颜色。 */
  color: string;
};

/**
 * 根据浏览器设备 ID 生成 tldraw 协作者身份。
 */
export function createCollaboratorIdentity(deviceId: string): CollaboratorIdentity {
  const shortDeviceId = getShortOpaqueSuffix(deviceId);
  const color =
    COLLABORATOR_COLORS[hashString(deviceId) % COLLABORATOR_COLORS.length] ??
    "#2563eb";

  return {
    shortDeviceId,
    userName: `Device ${shortDeviceId}`,
    color
  };
}

/**
 * 根据当前标签页 ID 生成顶部逻辑壳层展示用的标签页名称。
 */
export function createSessionLabel(tabId: string): string {
  return `Tab ${getShortOpaqueSuffix(tabId)}`;
}

function getShortOpaqueSuffix(value: string) {
  const normalized = value.replace(/[^a-zA-Z0-9]/g, "");
  return normalized.slice(-4).toUpperCase();
}

function hashString(value: string) {
  return [...value].reduce(
    (hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0,
    0
  );
}

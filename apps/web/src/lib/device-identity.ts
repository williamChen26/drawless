export const DEVICE_ID_STORAGE_KEY = "drawless.device-id.v1";

const DEVICE_ID_PATTERN =
  /^drawless-device-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export type DeviceIdentityStorage = Pick<Storage, "getItem" | "setItem">;

export type DeviceIdentityOptions = {
  storage?: DeviceIdentityStorage | null;
  storageKey?: string;
  randomUUID?: () => string;
};

export function getOrCreateDeviceIdentity(
  options: DeviceIdentityOptions = {}
): string {
  const storage = options.storage ?? getBrowserLocalStorage();
  const storageKey = options.storageKey ?? DEVICE_ID_STORAGE_KEY;
  const randomUUID = options.randomUUID ?? createUuid;

  const existing = readStoredDeviceId(storage, storageKey);
  if (existing) {
    return existing;
  }

  const deviceId = `drawless-device-${randomUUID().toLowerCase()}`;
  writeStoredDeviceId(storage, storageKey, deviceId);
  return deviceId;
}

export function createTabSessionId(randomUUID: () => string = createUuid) {
  return `tab-${randomUUID().toLowerCase()}`;
}

function isDeviceId(value: unknown): value is string {
  return typeof value === "string" && DEVICE_ID_PATTERN.test(value);
}

function readStoredDeviceId(
  storage: DeviceIdentityStorage | null,
  storageKey: string
) {
  if (!storage) {
    return null;
  }

  try {
    const value = storage.getItem(storageKey);
    return isDeviceId(value) ? value : null;
  } catch {
    return null;
  }
}

function writeStoredDeviceId(
  storage: DeviceIdentityStorage | null,
  storageKey: string,
  deviceId: string
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(storageKey, deviceId);
  } catch {
    return;
  }
}

function getBrowserLocalStorage(): DeviceIdentityStorage | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function createUuid() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const value = Math.floor(Math.random() * 16);
    const nibble = token === "x" ? value : (value & 0x3) | 0x8;
    return nibble.toString(16);
  });
}

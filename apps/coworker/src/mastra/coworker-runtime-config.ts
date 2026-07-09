export type CoworkerStorageMode = 'file' | 'memory' | 'disabled';

export function getCoworkerStorageMode(): CoworkerStorageMode {
  const normalized = process.env.COWORKER_STORAGE_MODE?.trim().toLowerCase();
  if (normalized === 'memory' || normalized === 'disabled') {
    return normalized;
  }

  return 'file';
}

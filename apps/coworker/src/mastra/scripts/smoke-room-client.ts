import {
  createDrawlessCoworkerRoomClient,
  createSyncRoomUri,
} from '../collaboration/coworker-room-client';

const roomId = process.env.DRAWLESS_COWORKER_ROOM_ID || 'alpha';
const serverUrl = process.env.DRAWLESS_SYNC_SERVER_URL || 'http://127.0.0.1:3001';
const timeoutMs = Number(process.env.DRAWLESS_COWORKER_SMOKE_TIMEOUT_MS || 8_000);

// smoke 脚本只验证 coworker 能进入 sync room 并完成初次 hydration，不做任何画布写入。
const client = createDrawlessCoworkerRoomClient({
  roomId,
  serverUrl,
  instanceId: 'smoke',
  onSyncError(reason) {
    console.error(`[coworker smoke] sync error: ${reason}`);
  },
});

try {
  // waitUntilLoaded 对应 TLSyncClient 收到 server 首次 connect/hydration 消息。
  const snapshot = await withTimeout(client.waitUntilLoaded(), timeoutMs);
  const syncUri = createSyncRoomUri({
    serverUrl,
    roomId,
    sessionId: client.identity.sessionId,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        syncUri,
        identity: client.identity,
        snapshot,
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  client.close();
  // sync-core 内部有健康检查定时器；命令行 smoke 完成后显式退出，避免测试进程挂住。
  setTimeout(() => {
    process.exit(process.exitCode ?? 0);
  }, 0);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for coworker room load after ${timeoutMs}ms.`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

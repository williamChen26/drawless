import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";

import type {
  DrawlessCoworkerRoomStatusResponse,
  DrawlessCoworkerStopResponse
} from "@drawless/shared";

import { loadServerConfig } from "../config.js";
import { createServerApp } from "../http/app.js";

const roomId = process.env.DRAWLESS_COWORKER_ROOM_ID || "alpha";
const serverPort = await findAvailablePort();
const coworkerPort = await findAvailablePort();
const serverUrl = `http://127.0.0.1:${serverPort}`;
const coworkerUrl = `http://127.0.0.1:${coworkerPort}`;
const coworkerDir = resolve(process.cwd(), "../coworker");
const coworkerEntry = resolve(coworkerDir, ".mastra/output/index.mjs");

if (!existsSync(coworkerEntry)) {
  throw new Error(
    `Coworker build output was not found at ${coworkerEntry}. Run npm --prefix apps/coworker run build first.`
  );
}

const config = {
  ...loadServerConfig({
    HOST: "127.0.0.1",
    PORT: String(serverPort),
    SYNC_ROUTE: "/sync",
    ALLOWED_ORIGINS: "http://127.0.0.1:3100",
    COWORKER_ENABLED: "true",
    COWORKER_BASE_URL: coworkerUrl,
    SERVER_PUBLIC_URL: serverUrl,
    COWORKER_REQUEST_TIMEOUT_MS: "15000"
  })
};

const coworker = startCoworkerProcess({
  cwd: coworkerDir,
  port: coworkerPort
});
const { app, registry } = await createServerApp({ config, logger: false });

try {
  await waitForCoworkerApi(coworkerUrl);
  await app.listen({ host: config.host, port: config.port });

  const start = await postJson<DrawlessCoworkerRoomStatusResponse>(
    new URL(`/rooms/${roomId}/coworker/start`, serverUrl),
    {
      waitUntilLoaded: true,
      timeoutMs: 10_000,
      instanceId: "smoke-through-server"
    }
  );
  if (!start.active || start.status !== "online" || !start.snapshot) {
    throw new Error(`Expected coworker to become online, got ${JSON.stringify(start)}.`);
  }

  const status = await getJson<DrawlessCoworkerRoomStatusResponse>(
    new URL(`/rooms/${roomId}/coworker/status`, serverUrl)
  );
  if (status.status !== "online") {
    throw new Error(`Expected coworker status to remain online, got ${status.status}.`);
  }

  const stop = await deleteJson<DrawlessCoworkerStopResponse>(
    new URL(`/rooms/${roomId}/coworker/stop`, serverUrl)
  );
  if (!stop.stopped || stop.status !== "stopped") {
    throw new Error(`Expected coworker to stop, got ${JSON.stringify(stop)}.`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        roomId,
        serverUrl,
        coworkerUrl,
        lifecycle: {
          start: start.status,
          status: status.status,
          stop: stop.status
        },
        snapshot: start.snapshot,
        roomStats: registry.getStats()
      },
      null,
      2
    )
  );
} finally {
  await app.close();
  await stopCoworkerProcess(coworker);
}

function startCoworkerProcess(input: {
  /** coworker app 所在目录。 */
  cwd: string;
  /** Mastra server 临时监听端口。 */
  port: number;
}) {
  // 使用构建后的 Mastra server，确保 smoke 覆盖真实 custom API routes。
  const child = spawn(process.execPath, [".mastra/output/index.mjs"], {
    cwd: input.cwd,
    env: {
      ...process.env,
      PORT: String(input.port),
      MASTRA_HOST: "127.0.0.1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[coworker] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[coworker] ${chunk}`);
  });

  return child;
}

async function waitForCoworkerApi(baseUrl: string) {
  const deadline = Date.now() + 15_000;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(
        new URL(`/drawless/rooms/${roomId}/coworker/status`, baseUrl)
      );
      if (response.ok) {
        return;
      }
      lastError = new Error(`Coworker status returned ${response.status}.`);
    } catch (error) {
      lastError = error;
    }

    await delay(250);
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Timed out waiting for coworker API.");
}

async function postJson<T>(url: URL, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  return readExpectedJson<T>(response);
}

async function getJson<T>(url: URL) {
  const response = await fetch(url);
  return readExpectedJson<T>(response);
}

async function deleteJson<T>(url: URL) {
  const response = await fetch(url, { method: "DELETE" });
  return readExpectedJson<T>(response);
}

async function readExpectedJson<T>(response: Response) {
  const payload = (await response.json()) as T;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function stopCoworkerProcess(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    delay(2_000).then(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    })
  ]);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findAvailablePort() {
  return new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to allocate a local port.")));
        return;
      }

      const port = address.port;
      server.close(() => resolvePort(port));
    });
  });
}

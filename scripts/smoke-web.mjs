import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// 验证真实 production Next 请求，而不是仅检查 UUID 工具函数。
const probe = createServer();
probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = resolve(import.meta.dirname, '../apps/web');
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd, env: { ...process.env, NODE_ENV: 'production', DRAWLESS_ROOM_ACCESS_SECRET: randomBytes(32).toString('hex') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stdout.on('data', chunk => { logs = (logs + chunk).slice(-10000); });
child.stderr.on('data', chunk => { logs = (logs + chunk).slice(-10000); });
try {
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30000;
  let first;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(logs);
    try { first = await fetch(base, { redirect: 'manual' }); break; } catch { await delay(200); }
  }
  if (!first) throw new Error('Next 启动超时');
  const second = await fetch(base, { redirect: 'manual' });
  const one = first.headers.get('location'); const two = second.headers.get('location');
  if (first.status !== 307 || second.status !== 307 || !one || !two || one === two || !one.includes('#access=v1.') || !two.includes('#access=v1.')) {
    throw new Error(`首页未按请求生成不同的带签名房间：${first.status}/${second.status}`);
  }
  const room = await fetch(new URL(one, base));
  if (room.status !== 200) throw new Error(`房间路由返回 ${room.status}`);
  console.log('Production Next smoke passed: unique signed room redirects and room page.');
} finally {
  child.kill('SIGTERM');
  const kill = setTimeout(() => child.kill('SIGKILL'), 2000); kill.unref();
  if (child.exitCode === null && child.signalCode === null) await once(child, 'exit');
  clearTimeout(kill);
}

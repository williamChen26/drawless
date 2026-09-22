import { spawn } from 'node:child_process';

// 使用进程管理器统一转发退出信号，避免 shell 后台服务在 Ctrl-C 后残留。
const withCoworker = process.argv.includes('--coworker');
const processes = [
  ['dev:server', withCoworker ? { COWORKER_ENABLED: 'true' } : {}],
  ['dev:web', {}],
  ...(withCoworker ? [['dev:coworker', {}]] : []),
];
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    else { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
  }
  const timer = setTimeout(() => {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) {
      if (process.platform !== 'win32') { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
    }
  }, 3000);
  timer.unref();
}
for (const [script, env] of processes) {
  const child = spawn(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', [script], {
    env: { ...process.env, ...env }, stdio: 'inherit', detached: process.platform !== 'win32',
  });
  children.push(child);
  child.once('error', error => { console.error(error.message); stop(1); });
  child.once('exit', code => { if (!stopping) stop(code ?? 1); });
}
process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());

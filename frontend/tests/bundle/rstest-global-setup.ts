import { fork } from 'node:child_process';
import { once } from 'node:events';

export default async function setup() {
  const child = fork(new URL('./serve.mjs', import.meta.url), [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  const exited = once(child, 'exit');
  try {
    await Promise.race([
      once(child, 'message', { signal: AbortSignal.timeout(5000) }),
      exited.then(([code]) => {
        throw new Error(`Bundle server exited before readiness: ${code}`);
      }),
    ]);
  } catch (error) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await exited;
    }
    throw error;
  }
  return async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await exited;
    }
  };
}

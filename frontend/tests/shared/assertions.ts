const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

async function attemptBeforeDeadline<T>(assertion: () => T | Promise<T>, remaining: number, timeout: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(assertion),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Assertion did not pass within ${timeout}ms`)),
          Math.max(0, remaining)
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function retryAssertion<T>(
  assertion: () => T | Promise<T>,
  { timeout, intervals = [100, 250, 500, 1000] }: { timeout: number; intervals?: number[] }
) {
  const deadline = Date.now() + timeout;
  const attemptFrom = async (attempt: number) => {
    try {
      return await attemptBeforeDeadline(assertion, deadline - Date.now(), timeout);
    } catch (error) {
      const interval = intervals[Math.min(attempt, intervals.length - 1)];
      if (interval === undefined || Date.now() + interval > deadline) {
        throw error;
      }
      await delay(interval);
      return attemptFrom(attempt + 1);
    }
  };
  return attemptFrom(0);
}

export async function step<T>(name: string, action: () => T | Promise<T>) {
  try {
    return await action();
  } catch (cause) {
    throw new Error(`Step failed: ${name}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
}

export async function retryAssertion<T>(
  assertion: () => T | Promise<T>,
  { timeout, intervals = [100, 250, 500, 1000] }: { timeout: number; intervals?: number[] }
): Promise<T> {
  const deadline = Date.now() + timeout;
  let attempt = 0;
  while (true) {
    try {
      const remaining = deadline - Date.now();
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
    } catch (error) {
      const interval = intervals[Math.min(attempt, intervals.length - 1)];
      attempt += 1;
      if (interval === undefined || Date.now() + interval > deadline) {
        throw error;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, interval));
    }
  }
}

export async function step<T>(name: string, action: () => T | Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (cause) {
    throw new Error(`Step failed: ${name}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
}

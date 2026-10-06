import { WrappedApiError } from '../state/rest-interfaces';

/** Reason reported by connect-gate while the Kafka Connect workers are scaled to zero and booting. */
export const KAFKA_CONNECT_STARTING = 'kafka_connect_starting';

/** Upper bound on how long a caller keeps retrying through a cold start. */
export const KAFKA_CONNECT_STARTING_MAX_WAIT_MS = 15 * 60 * 1000;

export type KafkaConnectStarting = {
  /** Human readable explanation from the gate. */
  message: string;
  /** Boot phase, e.g. `pulling-image`, `starting`. */
  phase?: string;
  /** Seconds to wait before the next attempt. */
  retryAfterSeconds: number;
  /** Rough seconds until the workers answer. */
  estimatedWaitSeconds?: number;
};

/** Returns the starting details when `err` is connect-gate's cold-start 503, else `null`. */
export function asKafkaConnectStarting(err: unknown): KafkaConnectStarting | null {
  if (!(err instanceof WrappedApiError) || err.reason !== KAFKA_CONNECT_STARTING) {
    return null;
  }
  return {
    message: err.message,
    phase: err.phase,
    retryAfterSeconds: Math.max(1, err.retryAfterSeconds ?? 30),
    estimatedWaitSeconds: err.estimatedWaitSeconds,
  };
}

const PHASE_TEXT: Record<string, string> = {
  'scaled-to-zero': 'scheduling a worker',
  'waiting-for-node': 'waiting for a connectors node',
  'pulling-image': 'pulling the Kafka Connect image',
  starting: 'loading connector plugins',
};

/** Human readable phase for the progress message. */
export function describeKafkaConnectPhase(phase: string | undefined): string {
  return (phase && PHASE_TEXT[phase]) || 'starting';
}

export type RetryWhileStartingOptions = {
  /** Called when a wait begins and once a second while it counts down. */
  onWait?: (info: KafkaConnectStarting, secondsRemaining: number) => void;
  /** Called when the wait ends and the call is retried. */
  onRetry?: () => void;
  /** Give up after this long in total. */
  maxWaitMs?: number;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Sleeps `seconds`, reporting the remaining whole seconds through `onTick` after each one. */
async function countdown(
  seconds: number,
  sleep: (ms: number) => Promise<void>,
  onTick: (remaining: number) => void
): Promise<void> {
  let remaining = seconds;
  while (remaining > 0) {
    await sleep(1000);
    remaining -= 1;
    if (remaining > 0) {
      onTick(remaining);
    }
  }
}

/**
 * Runs `fn`, and while it fails with connect-gate's "Kafka Connect is starting"
 * 503, waits the advised time and tries again. Any other error is rethrown
 * unchanged, and so is the starting error once `maxWaitMs` is exhausted.
 */
export async function retryWhileKafkaConnectStarting<T>(
  fn: () => Promise<T>,
  options: RetryWhileStartingOptions = {}
): Promise<T> {
  const { onWait, onRetry, maxWaitMs = KAFKA_CONNECT_STARTING_MAX_WAIT_MS, sleep = defaultSleep } = options;
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      const starting = asKafkaConnectStarting(err);
      if (!starting) {
        throw err;
      }
      const waitSeconds = Math.min(starting.retryAfterSeconds, Math.ceil((deadline - Date.now()) / 1000));
      if (waitSeconds <= 0) {
        throw err;
      }
      onWait?.(starting, waitSeconds);
      await countdown(waitSeconds, sleep, (remaining) => onWait?.(starting, remaining));
      onRetry?.();
    }
  }
}

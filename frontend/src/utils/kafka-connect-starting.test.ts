import { describe, expect, test } from '@rstest/core';

import {
  asKafkaConnectStarting,
  describeKafkaConnectPhase,
  KAFKA_CONNECT_STARTING,
  retryWhileKafkaConnectStarting,
} from './kafka-connect-starting';
import { WrappedApiError } from '../state/rest-interfaces';

const fakeResponse = (retryAfterHeader?: string) =>
  ({
    url: 'http://console/api/kafka-connect/clusters/redpanda/connectors',
    headers: new Headers(retryAfterHeader ? { 'Retry-After': retryAfterHeader } : {}),
  }) as unknown as Response;

const startingError = (retryAfterSeconds?: number, header?: string) =>
  new WrappedApiError(fakeResponse(header), {
    statusCode: 503,
    message: 'Kafka Connect is starting (pulling the Kafka Connect image). Retry in about 3m0s.',
    reason: KAFKA_CONNECT_STARTING,
    phase: 'pulling-image',
    retryAfterSeconds,
    estimatedWaitSeconds: 180,
  });

describe('asKafkaConnectStarting', () => {
  test('recognises the gate reason and keeps the retry hints', () => {
    const info = asKafkaConnectStarting(startingError(45));
    expect(info).toEqual({
      message: 'Kafka Connect is starting (pulling the Kafka Connect image). Retry in about 3m0s.',
      phase: 'pulling-image',
      retryAfterSeconds: 45,
      estimatedWaitSeconds: 180,
    });
  });

  test('falls back to the Retry-After header, then to 30s', () => {
    expect(asKafkaConnectStarting(startingError(undefined, '20'))?.retryAfterSeconds).toBe(20);
    expect(asKafkaConnectStarting(startingError(undefined))?.retryAfterSeconds).toBe(30);
  });

  test('ignores other errors', () => {
    const other = new WrappedApiError(fakeResponse(), { statusCode: 503, message: 'rebalance expected' });
    expect(asKafkaConnectStarting(other)).toBeNull();
    expect(asKafkaConnectStarting(new Error('boom'))).toBeNull();
  });
});

describe('describeKafkaConnectPhase', () => {
  test('maps known phases and defaults otherwise', () => {
    expect(describeKafkaConnectPhase('pulling-image')).toBe('pulling the Kafka Connect image');
    expect(describeKafkaConnectPhase('nope')).toBe('starting');
    expect(describeKafkaConnectPhase(undefined)).toBe('starting');
  });
});

describe('retryWhileKafkaConnectStarting', () => {
  test('retries through starting errors with a countdown, then returns the result', async () => {
    let attempts = 0;
    const ticks: number[] = [];
    let retries = 0;
    const result = await retryWhileKafkaConnectStarting(
      () => {
        attempts += 1;
        if (attempts < 3) {
          return Promise.reject(startingError(3));
        }
        return Promise.resolve('created');
      },
      {
        sleep: () => Promise.resolve(),
        onWait: (_info, remaining) => ticks.push(remaining),
        onRetry: () => {
          retries += 1;
        },
      }
    );
    expect(result).toBe('created');
    expect(attempts).toBe(3);
    expect(retries).toBe(2);
    expect(ticks).toEqual([3, 2, 1, 3, 2, 1]);
  });

  test('rethrows other errors untouched', async () => {
    const boom = new Error('boom');
    await expect(
      retryWhileKafkaConnectStarting(() => Promise.reject(boom), { sleep: () => Promise.resolve() })
    ).rejects.toBe(boom);
  });

  test('gives up once the overall budget is spent', async () => {
    let attempts = 0;
    await expect(
      retryWhileKafkaConnectStarting(
        () => {
          attempts += 1;
          return Promise.reject(startingError(60));
        },
        { sleep: () => Promise.resolve(), maxWaitMs: 0 }
      )
    ).rejects.toBeInstanceOf(WrappedApiError);
    expect(attempts).toBe(1);
  });
});

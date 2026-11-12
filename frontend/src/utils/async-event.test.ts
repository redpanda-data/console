import { asyncEvent } from './async-event';
import { expect, mock, test } from 'bun:test';

test('reports rejection without discarding event arguments or waiting in a synchronous API', async () => {
  const work = Promise.withResolvers<void>();
  const reported = Promise.withResolvers<unknown>();
  const action = mock((_value: number, _name: string) => work.promise);
  const listener = asyncEvent(action, reported.resolve);
  expect(listener(7, 'topic')).toBeUndefined();
  expect(action).toHaveBeenCalledWith(7, 'topic');
  const error = new Error('request failed');
  work.reject(error);
  expect(await reported.promise).toBe(error);
});

test('does not report successful work', async () => {
  const work = Promise.withResolvers<void>();
  const report = mock();
  const listener = asyncEvent(() => work.promise, report);
  listener();
  work.resolve();
  await work.promise;
  expect(report).not.toHaveBeenCalled();
});

test('reports an action that throws before returning a promise', () => {
  const error = new Error('invalid request');
  const report = mock();
  asyncEvent(() => {
    throw error;
  }, report)();
  expect(report).toHaveBeenCalledWith(error);
});

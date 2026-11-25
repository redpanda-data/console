import { buildKafkaHeaders } from './topic-produce-headers';
import { expect, test } from 'bun:test';

test('ignores empty header values, including keyed rows, without changing produced headers', () => {
  const headers = buildKafkaHeaders([
    { key: '', value: '' },
    { key: 'empty', value: '' },
    { key: 'name', value: '世界' },
    { key: '', value: 'value' },
  ]);

  expect(headers.map(({ key, value }) => ({ key, value: new TextDecoder().decode(value) }))).toStrictEqual([
    { key: 'name', value: '世界' },
    { key: '', value: 'value' },
  ]);
});

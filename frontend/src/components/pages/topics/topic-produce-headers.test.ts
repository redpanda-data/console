import { buildKafkaHeaders } from './topic-produce-headers';
import { expect, test } from 'bun:test';

test('preserves keyed headers with empty values while ignoring blank form rows', () => {
  const headers = buildKafkaHeaders([
    { key: '', value: '' },
    { key: 'empty', value: '' },
    { key: 'name', value: '世界' },
    { key: '', value: 'value' },
  ]);

  expect(headers.map(({ key, value }) => ({ key, value: new TextDecoder().decode(value) }))).toEqual([
    { key: 'empty', value: '' },
    { key: 'name', value: '世界' },
    { key: '', value: 'value' },
  ]);
});

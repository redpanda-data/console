import { enumFromKeys } from './form';
import { describe, expect, test } from 'bun:test';
import { addTopicFormSchema } from '../components/pages/rp-connect/types/wizard';

describe('runtime enum keys', () => {
  test('returns actual enumerable string keys, including an honestly empty list', () => {
    expect(enumFromKeys({ minutes: 60_000, hours: 3_600_000 })).toEqual(['minutes', 'hours']);
    expect(enumFromKeys({})).toEqual([]);
  });

  test('retention schemas accept unit names, never numeric factor values', () => {
    expect(addTopicFormSchema.shape.retentionTimeUnit.safeParse('minutes').success).toBe(true);
    expect(addTopicFormSchema.shape.retentionTimeUnit.safeParse(60_000).success).toBe(false);
    expect(addTopicFormSchema.shape.retentionSizeUnit.safeParse('MiB').success).toBe(true);
    expect(addTopicFormSchema.shape.retentionSizeUnit.safeParse(1_048_576).success).toBe(false);
  });
});

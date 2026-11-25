import { isCloudManagedTagKey, isSystemTag } from './constants';
import { describe, expect, test } from 'bun:test';

describe('isCloudManagedTagKey', () => {
  test('returns true for cloud-managed tag keys', () => {
    expect(isCloudManagedTagKey('rp_cloud_service_account_id')).toBe(true);
    expect(isCloudManagedTagKey('rp_cloud_secret_id')).toBe(true);
  });

  test('returns false for user-defined tag keys', () => {
    expect(isCloudManagedTagKey('env')).toBe(false);
    expect(isCloudManagedTagKey('team')).toBe(false);
  });
});

describe('isSystemTag', () => {
  test('returns true for __-prefixed keys', () => {
    expect(isSystemTag('__redpanda_cloud_pipeline_type')).toBe(true);
    expect(isSystemTag('__internal')).toBe(true);
  });

  test('returns true for cloud-managed keys', () => {
    expect(isSystemTag('rp_cloud_service_account_id')).toBe(true);
    expect(isSystemTag('rp_cloud_secret_id')).toBe(true);
  });

  test('returns false for user-defined keys', () => {
    expect(isSystemTag('env')).toBe(false);
    expect(isSystemTag('team')).toBe(false);
    expect(isSystemTag('_single_underscore')).toBe(false);
  });
});

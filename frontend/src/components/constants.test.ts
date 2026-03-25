import { describe, expect, it } from 'vitest';

import { isCloudManagedTagKey, isSystemTag } from './constants';

describe('isCloudManagedTagKey', () => {
  it('returns true for cloud-managed tag keys', () => {
    expect(isCloudManagedTagKey('rp_cloud_service_account_id')).toBe(true);
    expect(isCloudManagedTagKey('rp_cloud_secret_id')).toBe(true);
  });

  it('returns false for user-defined tag keys', () => {
    expect(isCloudManagedTagKey('env')).toBe(false);
    expect(isCloudManagedTagKey('team')).toBe(false);
  });
});

describe('isSystemTag', () => {
  it('returns true for __-prefixed keys', () => {
    expect(isSystemTag('__redpanda_cloud_pipeline_type')).toBe(true);
    expect(isSystemTag('__internal')).toBe(true);
  });

  it('returns true for cloud-managed keys', () => {
    expect(isSystemTag('rp_cloud_service_account_id')).toBe(true);
    expect(isSystemTag('rp_cloud_secret_id')).toBe(true);
  });

  it('returns false for user-defined keys', () => {
    expect(isSystemTag('env')).toBe(false);
    expect(isSystemTag('team')).toBe(false);
    expect(isSystemTag('_single_underscore')).toBe(false);
  });
});

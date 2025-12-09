import { CLOUD_MANAGED_TAG_KEYS } from 'components/constants';
import { describe, expect, it, vi } from 'vitest';

import {
  addServiceAccountTags,
  generateServiceAccountName,
  getServiceAccountNamePrefix,
} from './service-account.utils';

// Mock config module with full structure
vi.mock('config', () => ({
  config: {
    isServerless: false,
    clusterId: 'test-cluster-123',
    jwt: 'test-jwt',
    controlplaneUrl: 'http://localhost:9090',
  },
  isFeatureFlagEnabled: vi.fn(() => false),
}));

const UNICODE_TEST_PATTERN = /^cluster-test-cluster-123-agent-test/;

describe('addServiceAccountTags', () => {
  it('should add cloud-managed tags using constants', () => {
    const tags: Record<string, string> = {};
    addServiceAccountTags(tags, 'sa-123', 'secret-456');

    expect(tags).toEqual({
      [CLOUD_MANAGED_TAG_KEYS.SERVICE_ACCOUNT_ID]: 'sa-123',
      [CLOUD_MANAGED_TAG_KEYS.SECRET_ID]: 'secret-456',
    });
  });

  it('should add tags to existing tags map', () => {
    const tags: Record<string, string> = {
      existing_tag: 'existing_value',
    };
    addServiceAccountTags(tags, 'sa-789', 'secret-abc');

    expect(tags).toEqual({
      existing_tag: 'existing_value',
      [CLOUD_MANAGED_TAG_KEYS.SERVICE_ACCOUNT_ID]: 'sa-789',
      [CLOUD_MANAGED_TAG_KEYS.SECRET_ID]: 'secret-abc',
    });
  });

  it('should use correct cloud-managed tag keys', () => {
    const tags: Record<string, string> = {};
    addServiceAccountTags(tags, 'sa-test', 'secret-test');

    expect(tags).toHaveProperty('rp_cloud_service_account_id');
    expect(tags).toHaveProperty('rp_cloud_secret_id');
  });
});

describe('generateServiceAccountName', () => {
  it('should generate MCP service account name for cluster', () => {
    const name = generateServiceAccountName('My Server', 'mcp');
    expect(name).toBe('cluster-test-cluster-123-mcp-my-server-sa');
  });

  it('should generate agent service account name for cluster', () => {
    const name = generateServiceAccountName('My Agent', 'agent');
    expect(name).toBe('cluster-test-cluster-123-agent-my-agent-sa');
  });

  it('should sanitize display name properly', () => {
    const name = generateServiceAccountName('Test Server!@#$%', 'mcp');
    expect(name).toBe('cluster-test-cluster-123-mcp-test-server-----sa');
  });

  it('should handle spaces and special characters', () => {
    const name = generateServiceAccountName('Test Agent With Spaces', 'agent');
    expect(name).toBe('cluster-test-cluster-123-agent-test-agent-with-spaces-sa');
  });

  it('should convert to lowercase', () => {
    const name = generateServiceAccountName('UPPERCASE', 'mcp');
    expect(name).toBe('cluster-test-cluster-123-mcp-uppercase-sa');
  });

  it('should handle unicode characters by converting them', () => {
    const name = generateServiceAccountName('Test-ö-ä-ü', 'agent');
    // Should start with expected prefix and sanitize unicode
    expect(name).toMatch(UNICODE_TEST_PATTERN);
  });
});

describe('getServiceAccountNamePrefix', () => {
  it('should return correct prefix for MCP in cluster mode', () => {
    const prefix = getServiceAccountNamePrefix('mcp');
    expect(prefix).toBe('cluster-test-cluster-123-mcp-');
  });

  it('should return correct prefix for agent in cluster mode', () => {
    const prefix = getServiceAccountNamePrefix('agent');
    expect(prefix).toBe('cluster-test-cluster-123-agent-');
  });

  it('should use correct cluster ID from config', () => {
    const prefix = getServiceAccountNamePrefix('agent');
    expect(prefix).toContain('test-cluster-123');
  });
});

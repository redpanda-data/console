import { describe, expect, test } from 'vitest';

import { getBuiltInComponents, schemaToConfig } from './schema';
import { configToYaml, mergeConnectConfigs } from './yaml';

describe('yaml utils for creating connect configs', () => {
  describe('YAML spacing for merged components', () => {
    test('should add newline between root-level items when adding cache', () => {
      const builtInComponents = getBuiltInComponents();
      const existingYaml = `input:
  stdin:
    codec: lines

output:
  stdout:
    codec: lines`;

      const cacheSpec = builtInComponents.find((c) => c.name === 'memory' && c.type === 'cache');
      if (!cacheSpec) {
        throw new Error('memory cache not found');
      }

      const newConfig = schemaToConfig(cacheSpec, false);
      if (!newConfig) {
        throw new Error('Failed to generate cache config');
      }

      const mergedDoc = mergeConnectConfigs(existingYaml, newConfig);
      const yamlString = configToYaml(mergedDoc);

      // Should have newlines between root-level keys
      expect(yamlString).toContain('output:\n  stdout:\n    codec: lines\n\ncache_resources:');
    });

    test('should add newline between root-level items when adding processor', () => {
      const builtInComponents = getBuiltInComponents();
      const existingYaml = `input:
  stdin:
    codec: lines`;

      const processorSpec = builtInComponents.find((c) => c.name === 'log' && c.type === 'processor');
      if (!processorSpec) {
        throw new Error('log processor not found');
      }

      const newConfig = schemaToConfig(processorSpec, false);
      if (!newConfig) {
        throw new Error('Failed to generate processor config');
      }

      const mergedDoc = mergeConnectConfigs(existingYaml, newConfig);
      const yamlString = configToYaml(mergedDoc);

      // Should have newlines between root-level keys
      expect(yamlString).toContain('input:\n  stdin:\n    codec: lines\n\npipeline:');
    });
  });
});

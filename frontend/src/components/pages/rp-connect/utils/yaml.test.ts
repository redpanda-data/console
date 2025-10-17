import { describe, expect, test } from 'vitest';

import { getBuiltInComponents, schemaToConfig } from './schema';
import { configToYaml, mergeConnectConfigs } from './yaml';

describe('yaml utils for creating connect configs', () => {
  describe('YAML spacing for merged components', () => {
    test('should add newline between root-level items when adding cache', () => {
      const builtInComponents = getBuiltInComponents();
      const existingYaml = `input:
  generate:
    mapping: 'root = {}'

output:
  drop: {}`;

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

      expect(yamlString).toContain('output:\n  drop: {}\n\ncache_resources:');
    });

    test('should add newline between root-level items when adding processor', () => {
      const builtInComponents = getBuiltInComponents();
      const existingYaml = `input:
  generate:
    mapping: 'root = {}'`;

      const processorSpec = builtInComponents.find((c) => c.name === 'bloblang' && c.type === 'processor');
      if (!processorSpec) {
        throw new Error('bloblang processor not found');
      }

      const newConfig = schemaToConfig(processorSpec, false);
      if (!newConfig) {
        throw new Error('Failed to generate processor config');
      }

      const mergedDoc = mergeConnectConfigs(existingYaml, newConfig);
      const yamlString = configToYaml(mergedDoc);

      expect(yamlString).toContain("input:\n  generate:\n    mapping: 'root = {}'\n\npipeline:");
    });
  });
});

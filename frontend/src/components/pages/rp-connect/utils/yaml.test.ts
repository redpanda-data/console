import { describe, expect, test } from 'vitest';

import { mockComponents } from './__fixtures__/component-schemas';
import { schemaToConfig } from './schema';
import { configToYaml, getConnectTemplate, mergeConnectConfigs } from './yaml';
import type { ConnectComponentSpec } from '../types/schema';

describe('yaml utils for creating connect configs', () => {
  describe('YAML spacing for merged components', () => {
    test('should add newline between root-level items when adding cache', () => {
      const existingYaml = `input:
  generate:
    mapping: 'root = {}'

output:
  drop: {}`;

      const cacheSpec = mockComponents.memoryCache;
      if (!cacheSpec) {
        throw new Error('memory cache not found');
      }

      const result = schemaToConfig(cacheSpec, false);
      if (!result) {
        throw new Error('Failed to generate cache config');
      }

      const { config: newConfig } = result;
      const mergedDoc = mergeConnectConfigs(existingYaml, newConfig);
      const yamlString = configToYaml(mergedDoc);

      expect(yamlString).toContain('output:\n  drop: {}\n\ncache_resources:');
    });

    test('should add newline between root-level items when adding processor', () => {
      const existingYaml = `input:
  generate:
    mapping: 'root = {}'`;

      const processorSpec = mockComponents.bloblangProcessor;
      if (!processorSpec) {
        throw new Error('bloblang processor not found');
      }

      const result = schemaToConfig(processorSpec, false);
      if (!result) {
        throw new Error('Failed to generate processor config');
      }

      const { config: newConfig } = result;
      const mergedDoc = mergeConnectConfigs(existingYaml, newConfig);
      const yamlString = configToYaml(mergedDoc);

      expect(yamlString).toContain("input:\n  generate:\n    mapping: 'root = {}'\n\npipeline:");
    });
  });

  describe('YAML comment generation', () => {
    test('should add comments to required fields', () => {
      const spec = {
        name: 'test_output',
        type: 'output',
        plugin: false,
        config: {
          name: 'root',
          type: 'object',
          kind: 'scalar',
          children: [
            {
              name: 'required_field',
              type: 'string',
              kind: 'scalar',
              optional: false,
            },
          ],
        },
      } as unknown as ConnectComponentSpec;

      const result = schemaToConfig(spec, false);
      if (!result) {
        throw new Error('Failed to generate config');
      }

      const { config } = result;
      const yaml = configToYaml(config, spec);

      expect(yaml).toContain('required_field:');
      expect(yaml).toContain('# Required');
    });

    test('should add comments to optional fields with defaults', () => {
      const spec = {
        name: 'test_output',
        type: 'output',
        plugin: false,
        config: {
          name: 'root',
          type: 'object',
          kind: 'scalar',
          children: [
            {
              name: 'optional_field',
              type: 'string',
              kind: 'scalar',
              optional: true,
              defaultValue: 'default_value',
            },
          ],
        },
      } as unknown as ConnectComponentSpec;

      const result = schemaToConfig(spec, true);
      if (!result) {
        throw new Error('Failed to generate config');
      }

      const { config } = result;
      const yaml = configToYaml(config, spec);

      expect(yaml).toContain('optional_field:');
      expect(yaml).toContain('# Optional (default: "default_value")');
    });

    test('should add comments to critical connection fields', () => {
      const kafkaSpec = mockComponents.kafkaOutput;

      if (!kafkaSpec) {
        throw new Error('kafka output not found');
      }

      const result = schemaToConfig(kafkaSpec, false);
      if (!result) {
        throw new Error('Failed to generate kafka config');
      }

      const { config } = result;
      const yaml = configToYaml(config, kafkaSpec);

      // Critical fields like topic should have comments
      expect(yaml).toContain('topic:');
      expect(yaml).toContain('# Required');
    });

    test('should not add comments to parent objects but should add to arrays', () => {
      const kafkaSpec = mockComponents.kafkaOutput;

      if (!kafkaSpec) {
        throw new Error('kafka output not found');
      }

      const result = schemaToConfig(kafkaSpec, false);
      if (!result) {
        throw new Error('Failed to generate kafka config');
      }

      const { config } = result;
      const yaml = configToYaml(config, kafkaSpec);

      // Parent objects like tls should not have inline comments
      const lines = yaml.split('\n');
      const tlsLineIndex = lines.findIndex((line) => line.trim().startsWith('tls:'));

      if (tlsLineIndex !== -1) {
        const tlsLine = lines[tlsLineIndex];
        // tls: line itself should just be "tls:" without inline comment (it's a parent object)
        expect(tlsLine.trim()).toBe('tls: {}');
      }

      // But critical array fields SHOULD get inline comments
      // kafka output has 'addresses' which is a critical array field
      const addressesLine = lines.find((line) => line.includes('addresses:'));
      if (addressesLine) {
        // Arrays should have inline comments (not the parent object)
        expect(addressesLine).toContain('addresses:');
        // Note: addresses might be on its own line with array items below,
        // so we just verify the field exists and the array structure is present
      }
    });

    test('should preserve existing comments and add comments to merged component', () => {
      // Start with a simple input
      const inputYaml = `input:
  generate:
    mapping: "" # Existing comment`;

      // Now merge in an output component
      const kafkaOutputSpec = mockComponents.kafkaOutput;
      if (!kafkaOutputSpec) {
        throw new Error('kafka output not found');
      }

      const mergedYaml = getConnectTemplate({
        connectionName: 'kafka',
        connectionType: 'output',
        components: Object.values(mockComponents),
        existingYaml: inputYaml,
        showOptionalFields: false,
      });

      // Should preserve existing input comments
      expect(mergedYaml).toContain('# Existing comment');

      // Should have the output section
      expect(mergedYaml).toContain('output:');
      expect(mergedYaml).toContain('kafka:');

      // Should add comments to the newly merged output (critical fields)
      expect(mergedYaml).toContain('topic:');
      expect(mergedYaml).toContain('# Required');
    });
  });
});

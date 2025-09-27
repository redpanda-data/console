import { describe, expect, test } from 'vitest';
import type { ConnectComponentSpec, ConnectFieldSpec } from '../../types/connect';
import { configToYaml, generateDefaultValue } from '../connect';

describe('connect utilities', () => {
  describe('generateDefaultValue', () => {
    test('generates proper nested object structure', () => {
      const spec: ConnectFieldSpec = {
        name: 'aws_s3',
        type: 'object',
        kind: 'scalar',
        is_optional: false,
        children: [
          {
            name: 'bucket',
            type: 'string',
            kind: 'scalar',
            is_optional: false,
          },
          {
            name: 'credentials',
            type: 'object',
            kind: 'scalar',
            is_optional: true,
            children: [
              {
                name: 'profile',
                type: 'string',
                kind: 'scalar',
                is_optional: true,
                default: '',
              },
              {
                name: 'from_ec2_role',
                type: 'bool',
                kind: 'scalar',
                is_optional: true,
                default: false,
              },
            ],
          },
          {
            name: 'force_path_style_urls',
            type: 'bool',
            kind: 'scalar',
            is_optional: true,
            default: false,
          },
        ],
      };

      const result = generateDefaultValue(spec);

      expect(result).toEqual({
        bucket: '',
        credentials: {
          profile: '',
          from_ec2_role: false,
        },
        force_path_style_urls: false,
      });
    });

    test('handles arrays correctly', () => {
      const spec: ConnectFieldSpec = {
        name: 'topics',
        type: 'array',
        kind: 'array',
        is_optional: false,
        default: [],
      };

      const result = generateDefaultValue(spec);
      expect(result).toEqual([]);
    });

    test('handles primitive types with defaults', () => {
      const boolSpec: ConnectFieldSpec = {
        name: 'enabled',
        type: 'bool',
        kind: 'scalar',
        is_optional: true,
        default: true,
      };

      expect(generateDefaultValue(boolSpec)).toBe(true);

      const numberSpec: ConnectFieldSpec = {
        name: 'timeout',
        type: 'int',
        kind: 'scalar',
        is_optional: true,
        default: 5000,
      };

      expect(generateDefaultValue(numberSpec)).toBe(5000);
    });
  });

  describe('configToYaml with nesting comments', () => {
    test('adds proper comments at different nesting levels', () => {
      const config = {
        input: {
          aws_s3: {
            bucket: '',
            force_path_style_urls: false,
          },
        },
      };

      const componentSpec: ConnectComponentSpec = {
        name: 'aws_s3',
        type: 'input',
        status: 'stable',
        plugin: false,
        categories: null,
        config: {
          name: 'aws_s3',
          type: 'object',
          kind: 'scalar',
          is_optional: false,
          children: [
            {
              name: 'bucket',
              type: 'string',
              kind: 'scalar',
              is_optional: false,
            },
            {
              name: 'force_path_style_urls',
              type: 'bool',
              kind: 'scalar',
              is_optional: true,
              default: false,
            },
          ],
        },
      };

      const yaml = configToYaml(config, componentSpec);

      // Test that YAML contains proper structure and comments
      expect(yaml).toContain('input:');
      expect(yaml).toContain('  aws_s3:');
      expect(yaml).toContain('    bucket: "" # Required');
      expect(yaml).toContain('    force_path_style_urls: false # Default: false');
    });

    test('handles deep nesting correctly', () => {
      const config = {
        input: {
          kafka: {
            sasl: {
              mechanism: 'none',
            },
          },
        },
      };

      const componentSpec: ConnectComponentSpec = {
        name: 'kafka',
        type: 'input',
        status: 'stable',
        plugin: false,
        categories: null,
        config: {
          name: 'kafka',
          type: 'object',
          kind: 'scalar',
          is_optional: false,
          children: [
            {
              name: 'sasl',
              type: 'object',
              kind: 'scalar',
              is_optional: true,
              children: [
                {
                  name: 'mechanism',
                  type: 'string',
                  kind: 'scalar',
                  is_optional: true,
                  default: 'none',
                },
              ],
            },
          ],
        },
      };

      const yaml = configToYaml(config, componentSpec);

      // Verify proper nesting and comments at different levels
      expect(yaml).toContain('  kafka:');
      expect(yaml).toContain('    sasl:');
      expect(yaml).toContain('      mechanism: none # Default: "none"');
    });
  });

  describe('edge cases', () => {
    test('handles empty objects correctly', () => {
      const spec: ConnectFieldSpec = {
        name: 'empty',
        type: 'object',
        kind: 'scalar',
        is_optional: true,
        children: [],
      };

      const result = generateDefaultValue(spec);
      expect(result).toEqual({});
    });

    test('handles deeply nested structures', () => {
      const spec: ConnectFieldSpec = {
        name: 'deep',
        type: 'object',
        kind: 'scalar',
        is_optional: false,
        children: [
          {
            name: 'level1',
            type: 'object',
            kind: 'scalar',
            is_optional: false,
            children: [
              {
                name: 'level2',
                type: 'object',
                kind: 'scalar',
                is_optional: false,
                children: [
                  {
                    name: 'value',
                    type: 'string',
                    kind: 'scalar',
                    is_optional: false,
                    default: 'deep_value',
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = generateDefaultValue(spec);
      expect(result).toEqual({
        level1: {
          level2: {
            value: 'deep_value',
          },
        },
      });
    });
  });
});

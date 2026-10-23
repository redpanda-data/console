import { create } from '@bufbuild/protobuf';
import { ComponentSpecSchema } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

import { withYamlDocumentation } from './yaml-editor-schema';
import { describe, expect, test } from 'bun:test';
import type { ConnectComponentSpec } from '../types/schema';

function component(type: 'input' | 'output', description: string): ConnectComponentSpec {
  return {
    ...create(ComponentSpecSchema, {
      name: 'example',
      summary: `${type} connector`,
      config: {
        children: [
          {
            name: 'groups',
            description,
            children: [{ name: 'endpoint', description: 'See https://example.com[connection instructions].' }],
          },
        ],
      },
    }),
    type,
  };
}

describe('withYamlDocumentation', () => {
  test('scopes connector docs by type and follows array and map fields', () => {
    const schema = {
      definitions: {
        input: {
          allOf: [
            {
              anyOf: [
                {
                  properties: {
                    example: {
                      properties: {
                        groups: {
                          type: 'array',
                          items: {
                            type: 'array',
                            items: { properties: { endpoint: { type: 'string' } } },
                          },
                        },
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
        output: {
          allOf: [
            {
              anyOf: [
                {
                  properties: {
                    example: {
                      properties: {
                        groups: {
                          patternProperties: {
                            '.': { properties: { endpoint: { type: 'string' } } },
                          },
                        },
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    };
    const original = structuredClone(schema);
    const result = withYamlDocumentation(schema, [
      component('input', 'Source groups'),
      component('output', 'Sink groups'),
    ]);
    expect(result.definitions.input.allOf[0].anyOf[0].properties.example).toMatchObject({
      markdownDescription: 'input connector',
      properties: {
        groups: {
          markdownDescription: 'Source groups',
          items: {
            items: {
              properties: {
                endpoint: {
                  markdownDescription: 'See [connection instructions](https://example.com).',
                },
              },
            },
          },
        },
      },
    });
    expect(result.definitions.output.allOf[0].anyOf[0].properties.example).toMatchObject({
      markdownDescription: 'output connector',
      properties: {
        groups: {
          markdownDescription: 'Sink groups',
          patternProperties: {
            '.': {
              properties: {
                endpoint: {
                  markdownDescription: 'See [connection instructions](https://example.com).',
                },
              },
            },
          },
        },
      },
    });
    expect(schema).toEqual(original);
  });

  test('preserves upstream documentation and validation without inventing fields', () => {
    const schema = {
      definitions: {
        input: {
          allOf: [
            {
              anyOf: [
                {
                  properties: {
                    example: {
                      description: 'Existing connector documentation',
                      additionalProperties: false,
                      required: ['groups'],
                      properties: {
                        groups: {
                          type: 'string',
                          pattern: '^source-',
                          markdownDescription: 'Existing field documentation',
                        },
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    };
    expect(withYamlDocumentation(schema, [component('input', 'Replacement')])).toEqual(schema);
  });
});
